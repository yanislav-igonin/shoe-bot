import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUploadedImageStore } from "./uploadedImages.js";

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
