/* eslint-disable complexity */

import type { Filter } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
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
import {
	generateBetterImageController,
	getTelegramImageDataUrl,
	isImageEditReply,
} from "./imageEdit.controller.js";
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
		await generateBetterImageController(
			context,
			[previousMessage],
			previousMessage,
		);
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
