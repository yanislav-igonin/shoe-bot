import { Buffer } from "node:buffer";
import type { EntityManager } from "@mikro-orm/postgresql";
import { type Filter, InputFile } from "grammy";
import { config } from "lib/config.js";
import type { BotContext } from "lib/context.js";
import {
	generateImage,
	ImageEditingNotSupportedError,
} from "lib/imageGeneration.js";
import { logger } from "lib/logger.js";
import { replies } from "lib/replies.js";
import {
	getUploadedImage,
	type UploadedImage,
	uploadedImageStore,
} from "lib/uploadedImages.js";
import {
	type Chat,
	type Dialog,
	Message,
	MessageType,
	type User,
	User as UserEntity,
} from "../entities.js";
import { telegram } from "../telegram.js";

type PersistedImageMessage = Message & { tgPhotoId: string };

type ImageEditDependencies = {
	generateImage: typeof generateImage;
	getTelegramImageDataUrl: (tgPhotoId: string) => Promise<string>;
};

type TriggeredImageEditDependencies = {
	generateBetterImageController: typeof generateBetterImageController;
	uploadedImageStore: Pick<typeof uploadedImageStore, "resolve">;
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

export const getImageGenerationErrorReply = (error: unknown) =>
	error instanceof ImageEditingNotSupportedError
		? replies.imageEditingNotSupported
		: replies.error;

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
	context: Filter<BotContext, "message:text">,
	sourceMessages: PersistedImageMessage[],
	repliedMessage: PersistedImageMessage,
	text = context.message.text,
	dependencies: ImageEditDependencies = {
		generateImage,
		getTelegramImageDataUrl,
	},
) => {
	await context.replyWithChatAction("upload_photo");

	const { dialog, em, user } = context.state;
	const { message_id: messageId } = context.message;
	const newUserMessage = em.create(Message, {
		dialog,
		replyTo: repliedMessage,
		text,
		tgMessageId: messageId.toString(),
		type: MessageType.image,
		user,
	});

	try {
		em.persist(newUserMessage);
		await em.flush();

		for (const sourceMessage of sourceMessages) {
			const sourceImage = await dependencies.getTelegramImageDataUrl(
				sourceMessage.tgPhotoId,
			);
			const image = await dependencies.generateImage(em, text, sourceImage);
			if (!image) {
				logger.error("Failed to generate image");
				throw new Error("Failed to generate image");
			}

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
				user: em.getReference(UserEntity, config.botId),
			});
			em.persist(botMessage);
			await em.flush();
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
};

export const handleTriggeredImageEdit = async (
	context: Filter<BotContext, "message:text">,
	text: string,
	dependencies: TriggeredImageEditDependencies = {
		generateBetterImageController,
		uploadedImageStore,
	},
) => {
	const repliedMessage = context.message.reply_to_message;
	if (!repliedMessage?.photo) return false;

	const { chat, dialog, em, user } = context.state;
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
		if (!persistedMessage || !isImageEditReply(persistedMessage)) return false;

		await dependencies.generateBetterImageController(
			context,
			[persistedMessage],
			persistedMessage,
			text,
		);
		return true;
	}

	const uploadedImages = dependencies.uploadedImageStore.resolve(
		getUploadedImage(repliedMessage),
	);
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

	const exactRepliedMessage = findRepliedImageMessage(
		sourceMessages,
		repliedMessageId,
	);
	if (!exactRepliedMessage) {
		throw new Error("Replied image is not available in the resolved upload");
	}

	await dependencies.generateBetterImageController(
		context,
		sourceMessages,
		exactRepliedMessage,
		text,
	);
	return true;
};
