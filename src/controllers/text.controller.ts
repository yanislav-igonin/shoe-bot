/* eslint-disable complexity */

import { Buffer } from "node:buffer";
import { type Filter, InputFile } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import {
	generateImage,
	ImageEditingNotSupportedError,
} from "lib/imageGeneration.js";
import { logger } from "lib/logger.js";
import { runPersistedGeneration } from "lib/persistedGeneration.js";
import {
	addContext,
	addSystemContext,
	getCompletion,
	MAIN_MODEL,
	maximumMessageLengthPrompt,
	preparePrompt,
} from "lib/prompt.js";
import { replies } from "lib/replies.js";
import { BotRole, Message, MessageType, User } from "../entities.js";
import { telegram } from "../telegram.js";
import { textTriggerController } from "./textTrigger.controller.js";

export const downloadImageAsDataUrl = async (
	sourceUrl: string,
	fetchImage: typeof fetch = fetch,
) => {
	const response = await fetchImage(sourceUrl);
	if (!response.ok) {
		throw new Error(`Failed to download source image: ${response.status}`);
	}

	const mediaType = response.headers
		.get("content-type")
		?.split(";", 1)[0]
		.trim();
	if (!mediaType?.startsWith("image/")) {
		throw new Error("Downloaded source is not an image");
	}

	const bytes = Buffer.from(await response.arrayBuffer());
	return `data:${mediaType};base64,${bytes.toString("base64")}`;
};

const getTelegramImageDataUrl = async (tgPhotoId: string) => {
	const file = await telegram.getFile(tgPhotoId);
	if (!file.file_path) {
		throw new Error("Telegram image file path is not available");
	}

	const sourceUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
	return await downloadImageAsDataUrl(sourceUrl);
};

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
			return {
				messageId: index.messageId,
				url: await getTelegramImageDataUrl(index.tgPhotoId),
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

export const isImageEditReply = (
	message: Pick<Message, "tgPhotoId">,
): message is Pick<Message, "tgPhotoId"> & { tgPhotoId: string } =>
	Boolean(message.tgPhotoId);

export const getImageGenerationErrorReply = (error: unknown) =>
	error instanceof ImageEditingNotSupportedError
		? replies.imageEditingNotSupported
		: replies.error;

const generateBetterImageController = async (
	context: Filter<BotContext, "message:text">,
	previousMessage: Message & { tgPhotoId: string },
) => {
	await context.replyWithChatAction("upload_photo");

	const { dialog, em, user } = context.state;
	const text = context.message.text;
	const { message_id: messageId } = context.message;

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
				const sourceImage = await getTelegramImageDataUrl(
					previousMessage.tgPhotoId,
				);
				const image = await generateImage(em, text, sourceImage);
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
			await context.reply(getImageGenerationErrorReply(error), {
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

	if (isImageEditReply(previousMessage)) {
		await generateBetterImageController(context, previousMessage);
		return;
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

				const imagesMap = await getImagesMapById(messagesInDialog);
				const previousMessagesContext = messagesInDialog.map(
					addContext(imagesMap),
				);
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
