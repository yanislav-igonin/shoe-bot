import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUploadedImageStore } from "./uploadedImages.js";

type MiddlewareOptions = {
	debounceMs?: number;
	replayUpdate: (update: unknown) => Promise<void>;
	store: ReturnType<typeof createUploadedImageStore>;
};
const uploadedImages = (await import(
	"./uploadedImages.js"
)) as typeof import("./uploadedImages.js") & {
	createUploadedImageMiddleware?: (
		options: MiddlewareOptions,
	) => (context: never, next: () => Promise<void>) => Promise<void>;
};

const image = (chatId: string, messageId: string, mediaGroupId?: string) => ({
	chatId,
	mediaGroupId,
	tgMessageId: messageId,
	tgPhotoId: `photo-${messageId}`,
	tgUserId: "42",
});

describe("uploaded image store", () => {
	it("resolves a standalone replied photo without caching it", () => {
		const store = createUploadedImageStore();
		const repliedPhoto = image("1", "10");

		assert.deepEqual(store.resolve(repliedPhoto), [repliedPhoto]);
	});

	it("resolves every cached album photo in Telegram message order", () => {
		const store = createUploadedImageStore();
		store.remember(image("1", "12", "album"));
		store.remember(image("1", "10", "album"));
		store.remember(image("1", "11", "album"));

		assert.deepEqual(
			store
				.resolve(image("1", "11", "album"))
				.map(({ tgMessageId }) => tgMessageId),
			["10", "11", "12"],
		);
	});

	it("does not mix equal media group IDs from different chats", () => {
		const store = createUploadedImageStore();
		store.remember(image("1", "10", "album"));
		store.remember(image("1", "11", "album"));
		store.remember(image("2", "20", "album"));

		assert.deepEqual(
			store
				.resolve(image("2", "20", "album"))
				.map(({ tgMessageId }) => tgMessageId),
			["20"],
		);
	});

	it("deduplicates repeated Telegram updates", () => {
		const store = createUploadedImageStore();
		store.remember(image("1", "10", "album"));
		store.remember(image("1", "10", "album"));

		assert.equal(store.resolve(image("1", "10", "album")).length, 1);
	});

	it("includes the replied photo when the cached album is incomplete", () => {
		const store = createUploadedImageStore();
		store.remember(image("1", "10", "album"));

		assert.deepEqual(
			store
				.resolve(image("1", "11", "album"))
				.map(({ tgMessageId }) => tgMessageId),
			["10", "11"],
		);
	});

	it("evicts the oldest media group when the bound is exceeded", () => {
		const store = createUploadedImageStore(2);
		store.remember(image("1", "10", "first"));
		store.remember(image("1", "11", "first"));
		store.remember(image("1", "20", "second"));
		store.remember(image("1", "30", "third"));

		assert.deepEqual(
			store
				.resolve(image("1", "11", "first"))
				.map(({ tgMessageId }) => tgMessageId),
			["11"],
		);
	});
});

const albumContext = (
	updateId: number,
	messageId: number,
	caption?: string,
) => ({
	has: (filter: string) => filter === "message:photo",
	message: {
		caption,
		chat: { id: 1 },
		from: { id: 42 },
		media_group_id: "album",
		message_id: messageId,
		photo: [{ file_id: `photo-${messageId}` }],
	},
	update: { update_id: updateId },
});

describe("uploaded image middleware", () => {
	it("replays one caption update after the complete album is quiet", async () => {
		const store = createUploadedImageStore();
		const replayed: unknown[] = [];
		let nextCalls = 0;
		const middleware = uploadedImages.createUploadedImageMiddleware?.({
			debounceMs: 10,
			replayUpdate: async (update) => {
				replayed.push(update);
			},
			store,
		});
		assert.ok(middleware, "createUploadedImageMiddleware must be exported");
		const captionContext = albumContext(1, 12, "compare these");

		await middleware(captionContext as never, async () => {
			nextCalls += 1;
		});
		await middleware(albumContext(2, 10) as never, async () => {
			nextCalls += 1;
		});
		await middleware(albumContext(3, 11) as never, async () => {
			nextCalls += 1;
		});

		assert.equal(nextCalls, 0);
		assert.deepEqual(replayed, []);
		await new Promise((resolve) => setTimeout(resolve, 25));
		assert.deepEqual(replayed, [captionContext.update]);
		assert.deepEqual(
			store
				.resolve(image("1", "12", "album"))
				.map(({ tgMessageId }) => tgMessageId),
			["10", "11", "12"],
		);

		await middleware(captionContext as never, async () => {
			nextCalls += 1;
		});
		assert.equal(nextCalls, 1);
		await new Promise((resolve) => setTimeout(resolve, 25));
		assert.equal(replayed.length, 1);
	});

	it("passes a standalone photo to the next middleware immediately", async () => {
		let nextCalls = 0;
		const middleware = uploadedImages.createUploadedImageMiddleware?.({
			replayUpdate: async () => {},
			store: createUploadedImageStore(),
		});
		assert.ok(middleware, "createUploadedImageMiddleware must be exported");
		const context = albumContext(1, 10, "describe this");
		context.message.media_group_id = undefined as never;

		await middleware(context as never, async () => {
			nextCalls += 1;
		});

		assert.equal(nextCalls, 1);
	});
});
