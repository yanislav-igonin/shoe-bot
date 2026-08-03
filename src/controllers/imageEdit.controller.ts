import { Buffer } from "node:buffer";
import type { EntityManager } from "@mikro-orm/postgresql";
import { type Filter, InputFile } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import {
	generateImage,
	ImageEditingNotSupportedError,
	ImageModerationRejectedError,
} from "lib/imageGeneration.js";
import { logger } from "lib/logger.js";
import type { chooseTask } from "lib/prompt.js";
import { replies } from "lib/replies.js";
import {
	getUploadedImage,
	type UploadedImage,
	type uploadedImageStore,
} from "lib/uploadedImages.js";
import {
	type Chat,
	Dialog,
	Message,
	MessageType,
	type User,
	User as UserEntity,
} from "../entities.js";
import { telegram } from "../telegram.js";

type PersistedImageMessage = Message & { tgPhotoId: string };
type ImagePromptContext =
	| Filter<BotContext, "message:photo">
	| Filter<BotContext, "message:text">;

const IMAGE_EDIT_CONCURRENCY = 5;

type ImageEditDependencies = {
	generateImage: typeof generateImage;
	getTelegramImageDataUrl: (tgPhotoId: string) => Promise<string>;
};

type TriggeredImageEditDependencies = {
	generateBetterImageController: typeof generateBetterImageController;
	uploadedImageStore: Pick<typeof uploadedImageStore, "resolve">;
};

type TriggeredImagePromptDependencies = TriggeredImageEditDependencies & {
	chooseTask: typeof chooseTask;
	handleTextPrompt: (
		context: ImagePromptContext,
		text: string,
		sourceMessages: PersistedImageMessage[],
		repliedMessage: PersistedImageMessage,
		requestMessage?: PersistedImageMessage,
	) => Promise<void>;
};

export const downloadImageAsDataUrl = async (
	sourceUrl: string,
	fetchImage: typeof fetch = fetch,
) => {
	const response = await fetchImage(sourceUrl);
	if (!response.ok) {
		throw new Error(`Failed to download source image: ${response.status}`);
	}

	const responseMediaType = response.headers
		.get("content-type")
		?.split(";", 1)[0]
		.trim();
	const bytes = Buffer.from(await response.arrayBuffer());
	const isJpeg =
		bytes.length >= 3 &&
		bytes[0] === 0xff &&
		bytes[1] === 0xd8 &&
		bytes[2] === 0xff;
	const mediaType = responseMediaType?.startsWith("image/")
		? responseMediaType
		: isJpeg
			? "image/jpeg"
			: undefined;
	if (!mediaType) {
		throw new Error("Downloaded source is not an image");
	}

	return `data:${mediaType};base64,${bytes.toString("base64")}`;
};

export const getTelegramImageDataUrl = async (tgPhotoId: string) => {
	const file = await telegram.getFile(tgPhotoId);
	if (!file.file_path) {
		throw new Error("Telegram image file path is not available");
	}

	const sourceUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
	return await downloadImageAsDataUrl(sourceUrl);
};

export const isImageEditReply = (
	message: Pick<Message, "tgPhotoId">,
): message is Pick<Message, "tgPhotoId"> & { tgPhotoId: string } =>
	Boolean(message.tgPhotoId);

export const getImageGenerationErrorReply = (error: unknown) => {
	if (error instanceof ImageModerationRejectedError) {
		return replies.imageModerationRejected;
	}

	return error instanceof ImageEditingNotSupportedError
		? replies.imageEditingNotSupported
		: replies.error;
};

export const createUploadedImageMessageData = (
	image: UploadedImage,
	dialog: Dialog,
	user: User,
) => ({
	dialog,
	tgMessageId: image.tgMessageId,
	tgPhotoId: image.tgPhotoId,
	type: MessageType.image,
	user,
});

export const findRepliedImageMessage = <
	ImageMessage extends Pick<Message, "tgMessageId">,
>(
	messages: ImageMessage[],
	repliedMessageId: string,
) => messages.find(({ tgMessageId }) => tgMessageId === repliedMessageId);

export const findPersistedImageMessage = async (
	em: EntityManager,
	tgMessageId: string,
	chat: Chat,
) =>
	await em.findOne(Message, {
		dialog: { chat },
		tgMessageId,
	});

export const generateBetterImageController = async (
	context: ImagePromptContext,
	sourceMessages: PersistedImageMessage[],
	repliedMessage: PersistedImageMessage,
	text = ("text" in context.message
		? context.message.text
		: context.message.caption) ?? "",
	dependencies: ImageEditDependencies = {
		generateImage,
		getTelegramImageDataUrl,
	},
	requestMessage?: PersistedImageMessage,
) => {
	await context.replyWithChatAction("upload_photo");

	const { dialog, em, user } = context.state;
	const { message_id: messageId } = context.message;
	const newUserMessage =
		requestMessage ??
		em.create(Message, {
			dialog,
			replyTo: repliedMessage,
			text,
			tgMessageId: messageId.toString(),
			type: MessageType.image,
			user,
		});
	newUserMessage.text = text;
	newUserMessage.type = MessageType.image;
	const imageErrors = new Map<number, unknown>();

	try {
		if (!requestMessage) em.persist(newUserMessage);
		await em.flush();

		let nextSourceIndex = 0;
		const editSources = async () => {
			while (nextSourceIndex < sourceMessages.length) {
				const index = nextSourceIndex;
				nextSourceIndex += 1;
				const sourceMessage = sourceMessages[index];
				const imageEntityManager = em.fork();
				try {
					const sourceImage = await dependencies.getTelegramImageDataUrl(
						sourceMessage.tgPhotoId,
					);
					const image = await dependencies.generateImage(
						imageEntityManager,
						text,
						sourceImage,
					);
					if (!image) {
						throw new Error("Failed to generate image");
					}

					const source = typeof image === "string" ? new URL(image) : image;
					const file = new InputFile(source, "image.png");
					const botReply = await context.replyWithPhoto(file, {
						reply_to_message_id: messageId,
					});
					const botMessage = imageEntityManager.create(Message, {
						dialog: imageEntityManager.getReference(Dialog, dialog.id),
						replyTo: imageEntityManager.getReference(
							Message,
							newUserMessage.id,
						),
						tgMessageId: botReply.message_id.toString(),
						tgPhotoId: botReply.photo[botReply.photo.length - 1].file_id,
						type: MessageType.image,
						user: imageEntityManager.getReference(UserEntity, config.botId),
					});
					imageEntityManager.persist(botMessage);
					await imageEntityManager.flush();
				} catch (error) {
					imageErrors.set(index, error);
					logger.error(
						`Failed to edit image ${index + 1} of ${sourceMessages.length}`,
						error,
					);
				}
			}
		};
		const workers = Array.from(
			{ length: Math.min(IMAGE_EDIT_CONCURRENCY, sourceMessages.length) },
			editSources,
		);
		await Promise.all(workers);

		if (
			sourceMessages.length > 0 &&
			imageErrors.size === sourceMessages.length
		) {
			const firstFailedIndex = Math.min(...imageErrors.keys());
			throw imageErrors.get(firstFailedIndex);
		}
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

	if (imageErrors.size > 0) {
		const failedImageNumbers = [...imageErrors.keys()]
			.map((index) => index + 1)
			.sort((left, right) => left - right);
		try {
			await context.reply(
				replies.imageEditingPartialFailure(
					sourceMessages.length - failedImageNumbers.length,
					sourceMessages.length,
					failedImageNumbers,
				),
				{ reply_to_message_id: messageId },
			);
		} catch (replyError) {
			logger.error(replyError);
		}
	}
};

const resolveTriggeredImageReply = async (
	context: Filter<BotContext, "message:text">,
	store: Pick<typeof uploadedImageStore, "resolve">,
) => {
	const repliedMessage = context.message.reply_to_message;
	if (!repliedMessage?.photo) return undefined;

	const { chat, em } = context.state;
	const repliedMessageId = repliedMessage.message_id.toString();
	const isOwnBotMessage =
		repliedMessage.from?.is_bot === true &&
		repliedMessage.from.id === context.me.id;

	if (isOwnBotMessage) {
		const persistedMessage = await findPersistedImageMessage(
			em,
			repliedMessageId,
			chat,
		);
		if (!persistedMessage || !isImageEditReply(persistedMessage)) {
			return undefined;
		}

		return {
			repliedMessage: persistedMessage,
			sourceMessages: [persistedMessage],
		};
	}

	const uploadedImages = store.resolve(getUploadedImage(repliedMessage));
	const sourceMessages = await persistUploadedImageMessages(
		context,
		uploadedImages,
	);

	const exactRepliedMessage = findRepliedImageMessage(
		sourceMessages,
		repliedMessageId,
	);
	if (!exactRepliedMessage) {
		throw new Error("Replied image is not available in the resolved upload");
	}
	return {
		repliedMessage: exactRepliedMessage,
		sourceMessages,
	};
};

export const persistUploadedImageMessages = async (
	context: ImagePromptContext,
	uploadedImages: UploadedImage[],
) => {
	const { dialog, em, user } = context.state;
	const sourceMessages: PersistedImageMessage[] = [];
	for (const image of uploadedImages) {
		const sourceUser = image.tgUserId
			? ((await em.findOne(UserEntity, { tgId: image.tgUserId })) ?? user)
			: user;
		const sourceMessage = em.create(
			Message,
			createUploadedImageMessageData(image, dialog, sourceUser),
		) as PersistedImageMessage;
		em.persist(sourceMessage);
		sourceMessages.push(sourceMessage);
	}
	await em.flush();
	return sourceMessages;
};

export const handleResolvedImagePrompt = async (
	context: ImagePromptContext,
	text: string,
	sourceMessages: PersistedImageMessage[],
	repliedMessage: PersistedImageMessage,
	dependencies: TriggeredImagePromptDependencies,
	requestMessage?: PersistedImageMessage,
) => {
	const task = await dependencies.chooseTask(text);
	if (requestMessage) {
		requestMessage.text = text;
		requestMessage.type = task;
		await context.state.em.flush();
	}

	if (task === MessageType.image) {
		await dependencies.generateBetterImageController(
			context,
			sourceMessages,
			repliedMessage,
			text,
			undefined,
			requestMessage,
		);
		return;
	}

	try {
		await dependencies.handleTextPrompt(
			context,
			text,
			sourceMessages,
			repliedMessage,
			requestMessage,
		);
	} catch (error) {
		try {
			await context.reply(replies.error, {
				reply_to_message_id: context.message.message_id,
			});
		} catch (replyError) {
			logger.error(replyError);
		}
		throw error;
	}
};

export const handleTriggeredImagePrompt = async (
	context: Filter<BotContext, "message:text">,
	text: string,
	dependencies: TriggeredImagePromptDependencies,
) => {
	const resolved = await resolveTriggeredImageReply(
		context,
		dependencies.uploadedImageStore,
	);
	if (!resolved) return false;

	await handleResolvedImagePrompt(
		context,
		text,
		resolved.sourceMessages,
		resolved.repliedMessage,
		dependencies,
	);
	return true;
};
