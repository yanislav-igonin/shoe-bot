/* eslint-disable complexity */

import { type Filter, InputFile } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import { generateImage } from "lib/imageGeneration.js";
import { logger } from "lib/logger.js";
import { runPersistedGeneration } from "lib/persistedGeneration.js";
import {
	addAssistantContext,
	addContext,
	addSystemContext,
	getCompletion,
	MAIN_MODEL,
	maximumMessageLengthPrompt,
	preparePrompt,
	understandImage,
} from "lib/prompt.js";
import { replies } from "lib/replies.js";
import { BotRole, Message, MessageType, User } from "../entities.js";
import { telegram } from "../telegram.js";
import { textTriggerController } from "./textTrigger.controller.js";

const getImagesMapById = async (messages: Message[]) => {
	const tgImagesInDialog = messages.reduce<
		Array<{ messageId: number; tgPhotoId: string }>
	>((accumulator, message) => {
		if (!message.tgPhotoId) return accumulator;

		accumulator.push({
			messageId: message.id,
			tgPhotoId: message.tgPhotoId,
		});
		return accumulator;
	}, []);
	const tgImagesUrlsInDialog = await Promise.all(
		tgImagesInDialog.map(async (index) => {
			const file = await telegram.getFile(index.tgPhotoId);
			const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
			return {
				messageId: index.messageId,
				url,
			};
		}),
	);
	// eslint-disable-next-line unicorn/no-array-reduce
	return tgImagesUrlsInDialog.reduce<Record<number, string>>(
		(accumulator, current) => {
			accumulator[current.messageId] = current.url;
			return accumulator;
		},
		{},
	);
};

const generateBetterImageController = async (
	context: Filter<BotContext, "message:text">,
) => {
	await context.replyWithChatAction("upload_photo");

	const { dialog, em, user } = context.state;
	const text = context.message.text;
	const { message_id: messageId, reply_to_message: replyToMessage } =
		context.message;

	const previousMessage = await em.findOne(Message, {
		tgMessageId: replyToMessage?.message_id.toString() ?? "0",
	});
	if (!previousMessage) {
		const error = new Error("Previous message is not available");
		try {
			await context.reply(replies.noPreviosData);
		} catch (replyError) {
			logger.error(replyError);
		}

		throw error;
	}

	const newUserMessage = em.create(Message, {
		dialog,
		replyTo: previousMessage,
		text,
		tgMessageId: messageId.toString(),
		type: MessageType.image,
		user,
	});

	try {
		await runPersistedGeneration({
			generate: async () => {
				const messagesInDialog = await em.find(
					Message,
					{
						dialog,
						id: { $ne: newUserMessage.id },
					},
					{ populate: ["user"] },
				);
				const tgImagesMapById = await getImagesMapById(messagesInDialog);
				const imageMessages = messagesInDialog.filter(
					(message) => message.tgPhotoId,
				);
				const lastImageMessage = imageMessages[imageMessages.length - 1];
				const whatsOnImage = await understandImage(
					lastImageMessage,
					tgImagesMapById,
				);
				const upgradedContext = await getCompletion(text, [
					addAssistantContext(whatsOnImage),
					addSystemContext(
						"Результат должен быть новым четким описанием того, что попросили изменить.",
					),
				]);
				const image = await generateImage(em, upgradedContext[0]);
				if (!image) {
					logger.error("Failed to generate image");
					throw new Error("Failed to generate image");
				}

				return image;
			},
			persistRequest: async () => {
				em.persist(newUserMessage);
				await em.flush();
			},
			persistResponse: async (image) => {
				const source = typeof image === "string" ? new URL(image) : image;
				const file = new InputFile(source, "image.png");
				const botReply = await context.replyWithPhoto(file, {
					reply_to_message_id: messageId,
				});
				const botMessage = em.create(Message, {
					dialog,
					replyTo: newUserMessage,
					tgMessageId: botReply.message_id.toString(),
					tgPhotoId: botReply.photo[botReply.photo.length - 1].file_id,
					type: MessageType.image,
					user: em.getReference(User, config.botId),
				});
				em.persist(botMessage);
				await em.flush();
			},
		});
	} catch (error) {
		try {
			await context.reply(replies.error, {
				reply_to_message_id: messageId,
			});
		} catch (replyError) {
			logger.error(replyError);
		}

		throw error;
	}
};

export const textController = async (
	context: Filter<BotContext, "message:text">,
) => {
	const {
		state: { dialog, em, user, userSettings },
	} = context;
	const { text } = context.message;
	const { message_id: messageId, reply_to_message: replyToMessage } =
		context.message;

	const notReply = replyToMessage === undefined;
	const askedInPrivate = context.hasChatType("private");

	if (askedInPrivate && notReply) {
		await textTriggerController(context);
		return;
	}

	const hasImages =
		(await em.count(Message, {
			dialog,
			type: MessageType.image,
		})) > 0;
	if (hasImages) {
		await generateBetterImageController(context);
		return;
	}

	const previousMessage = await em.findOne(Message, {
		tgMessageId: replyToMessage?.message_id.toString() ?? "0",
	});
	if (!previousMessage) {
		const error = new Error("Previous message is not available");
		try {
			await context.reply(replies.noPreviosData);
		} catch (replyError) {
			logger.error(replyError);
		}

		throw error;
	}

	const newUserMessage = em.create(Message, {
		dialog,
		replyTo: previousMessage,
		text,
		tgMessageId: messageId.toString(),
		type: MessageType.text,
		user,
	});
	const prompt = preparePrompt(text);

	try {
		await context.replyWithChatAction("typing");
		await runPersistedGeneration({
			generate: async () => {
				const messagesInDialog = await em.find(
					Message,
					{
						dialog,
						id: { $ne: newUserMessage.id },
					},
					{ populate: ["user"] },
				);
				const botRole = await em.findOne(BotRole, {
					id: userSettings.botRoleId,
				});
				if (!botRole) {
					logger.error("Bot role is undefined");
					throw new Error("Bot role is undefined");
				}

				const previousMessagesContext = messagesInDialog.map(addContext([]));
				previousMessagesContext.unshift(
					addSystemContext(maximumMessageLengthPrompt),
					addSystemContext(botRole.systemPrompt),
				);

				return await getCompletion(prompt, previousMessagesContext, MAIN_MODEL);
			},
			persistRequest: async () => {
				em.persist(newUserMessage);
				await em.flush();
			},
			persistResponse: async (completion) => {
				for (const chunk of completion) {
					const botReply = await context.reply(chunk, {
						parse_mode: "Markdown",
						reply_to_message_id: messageId,
					});
					const botMessage = em.create(Message, {
						dialog,
						replyTo: newUserMessage,
						text: chunk,
						tgMessageId: botReply.message_id.toString(),
						type: MessageType.text,
						user: em.getReference(User, config.botId),
					});
					em.persist(botMessage);
					await em.flush();
				}
			},
		});
	} catch (error) {
		try {
			await context.reply(replies.error, {
				reply_to_message_id: messageId,
			});
		} catch (replyError) {
			logger.error(replyError);
		}

		throw error;
	}
};
