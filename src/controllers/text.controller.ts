/* eslint-disable complexity */

import type { Filter } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import { logger } from "lib/logger.js";
import { runPersistedGeneration } from "lib/persistedGeneration.js";
import {
	addContext,
	addSystemContext,
	chooseTask,
	getCompletion,
	MAIN_MODEL,
	maximumMessageLengthPrompt,
	preparePrompt,
	textTriggerRegexp,
} from "lib/prompt.js";
import { replies } from "lib/replies.js";
import { getUploadedImage, uploadedImageStore } from "lib/uploadedImages.js";
import { BotRole, Message, MessageType, User } from "../entities.js";
import {
	findRepliedImageMessage,
	generateBetterImageController,
	getTelegramImageDataUrl,
	handleResolvedImagePrompt,
	handleTriggeredImagePrompt,
	persistUploadedImageMessages,
} from "./imageEdit.controller.js";
import { textTriggerController } from "./textTrigger.controller.js";

export const getImagesMapById = async (
	messages: Array<Pick<Message, "id" | "tgPhotoId">>,
	downloadImage: typeof getTelegramImageDataUrl = getTelegramImageDataUrl,
) => {
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
				url: await downloadImage(index.tgPhotoId),
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

type TextResponseContext =
	| Filter<BotContext, "message:photo">
	| Filter<BotContext, "message:text">;

type TextResponseOptions = {
	replyTo?: Message | null;
	requestMessage?: Message;
	sourceMessages?: Message[];
};

export const generateTextResponse = async (
	context: TextResponseContext,
	prompt: string,
	{
		replyTo = null,
		requestMessage,
		sourceMessages = [],
	}: TextResponseOptions = {},
) => {
	const {
		state: { dialog, em, user, userSettings },
	} = context;
	const messageId = context.message.message_id;
	const newUserMessage =
		requestMessage ??
		em.create(Message, {
			dialog,
			replyTo,
			text: prompt,
			tgMessageId: messageId.toString(),
			type: MessageType.text,
			user,
		});
	newUserMessage.text = prompt;
	newUserMessage.type = MessageType.text;

	await context.replyWithChatAction("typing");
	await runPersistedGeneration({
		generate: async () => {
			const currentMessageIds = [
				newUserMessage.id,
				...sourceMessages.map(({ id }) => id),
			];
			const messagesInDialog = await em.find(
				Message,
				{
					dialog,
					id: { $nin: currentMessageIds },
				},
				{ orderBy: { id: "asc" }, populate: ["user"] },
			);
			const botRole = await em.findOne(BotRole, {
				id: userSettings.botRoleId,
			});
			if (!botRole) {
				logger.error("Bot role is undefined");
				throw new Error("Bot role is undefined");
			}

			const imagesMap = await getImagesMapById([
				...messagesInDialog,
				...sourceMessages,
				newUserMessage,
			]);
			const currentImageUrls = sourceMessages.map(({ id }) => imagesMap[id]);
			const previousMessagesContext = messagesInDialog.map(
				addContext(imagesMap),
			);
			previousMessagesContext.unshift(
				addSystemContext(maximumMessageLengthPrompt),
				addSystemContext(botRole.systemPrompt),
			);

			return await getCompletion(
				newUserMessage,
				previousMessagesContext,
				MAIN_MODEL,
				imagesMap,
				currentImageUrls,
			);
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
};

export const imagePromptDependencies: Parameters<
	typeof handleResolvedImagePrompt
>[4] = {
	chooseTask,
	generateBetterImageController,
	handleTextPrompt: async (
		context,
		prompt,
		sourceMessages,
		repliedMessage,
		requestMessage,
	) => {
		await generateTextResponse(context, prompt, {
			replyTo: repliedMessage,
			requestMessage,
			sourceMessages,
		});
	},
	uploadedImageStore,
};

export const textController = async (
	context: Filter<BotContext, "message:text">,
) => {
	const { em } = context.state;
	const { text } = context.message;
	const { message_id: messageId, reply_to_message: replyToMessage } =
		context.message;

	const notReply = replyToMessage === undefined;
	const askedInPrivate = context.hasChatType("private");

	if (askedInPrivate && notReply) {
		await textTriggerController(context);
		return;
	}
	const prompt = preparePrompt(text);
	if (
		await handleTriggeredImagePrompt(context, prompt, imagePromptDependencies)
	) {
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

	try {
		await generateTextResponse(context, prompt, { replyTo: previousMessage });
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

export const photoCaptionController = async (
	context: Filter<BotContext, "message:photo">,
	dependencies: Parameters<
		typeof handleResolvedImagePrompt
	>[4] = imagePromptDependencies,
) => {
	const caption = context.message.caption?.trim();
	if (!caption) return;

	const match = textTriggerRegexp.exec(caption);
	const prompt = match?.[3] ?? caption;
	const uploadedImages = dependencies.uploadedImageStore.resolve(
		getUploadedImage(context.message),
	);
	const sourceMessages = await persistUploadedImageMessages(
		context,
		uploadedImages,
	);
	const requestMessage = findRepliedImageMessage(
		sourceMessages,
		context.message.message_id.toString(),
	);
	if (!requestMessage) {
		throw new Error("Caption image is not available in the resolved upload");
	}

	await handleResolvedImagePrompt(
		context,
		prompt,
		sourceMessages,
		requestMessage,
		dependencies,
		requestMessage,
	);
};
