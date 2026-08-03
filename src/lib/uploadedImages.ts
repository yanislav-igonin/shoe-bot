import type { NextFunction } from "grammy";
import type { BotContext } from "lib/context.js";
import { logger } from "lib/logger.js";

type TelegramPhotoMessage = {
	chat: { id: number };
	from?: { id: number };
	media_group_id?: string;
	message_id: number;
	photo?: Array<{ file_id: string }>;
};

export type UploadedImage = {
	chatId: string;
	mediaGroupId?: string;
	tgMessageId: string;
	tgPhotoId: string;
	tgUserId?: string;
};

const mediaGroupKey = ({ chatId, mediaGroupId }: UploadedImage) =>
	`${chatId}:${mediaGroupId}`;

export const createUploadedImageStore = (maxMediaGroups = 100) => {
	const mediaGroups = new Map<string, Map<string, UploadedImage>>();

	return {
		remember(image: UploadedImage) {
			if (!image.mediaGroupId) return;

			const key = mediaGroupKey(image);
			const group = mediaGroups.get(key) ?? new Map<string, UploadedImage>();
			group.set(image.tgMessageId, image);
			mediaGroups.delete(key);
			mediaGroups.set(key, group);

			if (mediaGroups.size > maxMediaGroups) {
				const oldestKey = mediaGroups.keys().next().value;
				if (oldestKey) mediaGroups.delete(oldestKey);
			}
		},
		resolve(repliedImage: UploadedImage) {
			if (!repliedImage.mediaGroupId) return [repliedImage];

			const group = mediaGroups.get(mediaGroupKey(repliedImage));
			if (!group) return [repliedImage];

			const images = [...group.values()];
			if (!group.has(repliedImage.tgMessageId)) images.push(repliedImage);

			return images.sort(
				(left, right) => Number(left.tgMessageId) - Number(right.tgMessageId),
			);
		},
	};
};

export const getUploadedImage = (
	message: TelegramPhotoMessage,
): UploadedImage => {
	const photo = message.photo?.at(-1);
	if (!photo) throw new Error("Telegram photo message has no photo sizes");

	return {
		chatId: message.chat.id.toString(),
		mediaGroupId: message.media_group_id,
		tgMessageId: message.message_id.toString(),
		tgPhotoId: photo.file_id,
		tgUserId: message.from?.id.toString(),
	};
};

export const uploadedImageStore = createUploadedImageStore();

type UploadedImageStore = ReturnType<typeof createUploadedImageStore>;
type TelegramUpdate = BotContext["update"];

type UploadedImageMiddlewareOptions = {
	debounceMs?: number;
	maxPendingGroups?: number;
	replayUpdate: (update: TelegramUpdate) => Promise<void>;
	store?: UploadedImageStore;
};

type PendingAlbum = {
	captionUpdate?: TelegramUpdate;
	timer: ReturnType<typeof setTimeout>;
};

export const createUploadedImageMiddleware = ({
	debounceMs = 500,
	maxPendingGroups = 100,
	replayUpdate,
	store = uploadedImageStore,
}: UploadedImageMiddlewareOptions) => {
	const pendingAlbums = new Map<string, PendingAlbum>();
	const replayedUpdateIds = new Set<number>();

	return async (context: BotContext, next: NextFunction) => {
		if (!context.has("message:photo")) {
			await next();
			return;
		}

		const image = getUploadedImage(context.message);
		store.remember(image);
		if (!image.mediaGroupId) {
			await next();
			return;
		}

		const updateId = context.update.update_id;
		if (replayedUpdateIds.delete(updateId)) {
			await next();
			return;
		}

		const key = mediaGroupKey(image);
		const previous = pendingAlbums.get(key);
		if (previous) clearTimeout(previous.timer);

		const captionUpdate = context.message.caption
			? context.update
			: previous?.captionUpdate;
		const timer = setTimeout(() => {
			pendingAlbums.delete(key);
			if (!captionUpdate) return;

			replayedUpdateIds.add(captionUpdate.update_id);
			void replayUpdate(captionUpdate).catch((error: unknown) => {
				replayedUpdateIds.delete(captionUpdate.update_id);
				logger.error("Failed to replay Telegram album caption", error);
			});
		}, debounceMs);
		pendingAlbums.delete(key);
		pendingAlbums.set(key, { captionUpdate, timer });

		if (pendingAlbums.size > maxPendingGroups) {
			const oldestKey = pendingAlbums.keys().next().value;
			if (oldestKey) {
				const oldest = pendingAlbums.get(oldestKey);
				if (oldest) clearTimeout(oldest.timer);
				pendingAlbums.delete(oldestKey);
			}
		}
	};
};

export const uploadedImageMiddleware = async (
	context: BotContext,
	next: NextFunction,
) => {
	if (context.has("message:photo")) {
		uploadedImageStore.remember(getUploadedImage(context.message));
	}

	await next();
};
