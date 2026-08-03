import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { Chat, Dialog, User } from "../entities.js";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";

const { ImageEditingNotSupportedError, ImageModerationRejectedError } =
	await import("../lib/imageGeneration.js");
const { replies } = await import("../lib/replies.js");
const {
	createUploadedImageMessageData,
	downloadImageAsDataUrl,
	findPersistedImageMessage,
	findRepliedImageMessage,
	generateBetterImageController,
	getImageGenerationErrorReply,
	handleTriggeredImageEdit,
	isImageEditReply,
} = await import("./imageEdit.controller.js");
const { MessageType } = await import("../entities.js");

const createImageEditContext = () => {
	const persisted: Array<Record<string, unknown>> = [];
	const photoReplies: Array<{ reply_to_message_id?: number }> = [];
	const errorReplies: string[] = [];
	let replyNumber = 0;
	const user = { id: 42, tgId: "42" };
	const createEntityManager = () => {
		const em = {
			create: (_entity: unknown, data: Record<string, unknown>) => data,
			findOne: async () => user,
			flush: async () => undefined,
			fork: () => createEntityManager(),
			getReference: () => ({ id: 999 }),
			persist: (message: Record<string, unknown>) => {
				persisted.push(message);
			},
		};

		return em;
	};
	const em = createEntityManager();
	const context = {
		message: { message_id: 500, text: "restyle" },
		reply: async (text: string) => {
			errorReplies.push(text);
		},
		replyWithChatAction: async () => undefined,
		replyWithPhoto: async (
			_file: unknown,
			options: { reply_to_message_id?: number },
		) => {
			photoReplies.push(options);
			replyNumber += 1;
			return {
				message_id: 600 + replyNumber,
				photo: [{ file_id: `result-${replyNumber}` }],
			};
		},
		state: {
			chat: { id: 5 },
			dialog: { id: 7 },
			em,
			user,
		},
	};

	return { context, errorReplies, persisted, photoReplies };
};

const deferred = <Value>() => {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
};

const nextEventLoopTurn = async () =>
	await new Promise<void>((resolve) => setImmediate(resolve));

describe("isImageEditReply", () => {
	it("routes a direct image reply to image editing", () => {
		assert.equal(isImageEditReply({ tgPhotoId: "telegram-photo-id" }), true);
	});

	it("keeps a direct text reply in the text conversation flow", () => {
		assert.equal(isImageEditReply({ tgPhotoId: null }), false);
	});
});

describe("downloadImageAsDataUrl", () => {
	it("keeps the source URL secret out of the provider input", async () => {
		const sourceUrl =
			"https://api.telegram.org/file/botsecret-token/photos/source.jpg";

		const result = await downloadImageAsDataUrl(sourceUrl, async () => {
			return new Response(new Uint8Array([1, 2, 3]), {
				headers: { "content-type": "image/jpeg" },
				status: 200,
			});
		});

		assert.equal(result, "data:image/jpeg;base64,AQID");
		assert.equal(result.includes("secret-token"), false);
	});

	it("detects a Telegram JPEG returned as application/octet-stream", async () => {
		const result = await downloadImageAsDataUrl(
			"https://api.telegram.org/file/bottest/photos/source.jpg",
			async () => {
				return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
					headers: { "content-type": "application/octet-stream" },
					status: 200,
				});
			},
		);

		assert.equal(result, "data:image/jpeg;base64,/9j/4A==");
	});
});

describe("getImageGenerationErrorReply", () => {
	it("returns the dedicated reply for rejected image inputs", () => {
		assert.equal(
			getImageGenerationErrorReply(new ImageModerationRejectedError()),
			replies.imageModerationRejected,
		);
	});

	it("returns the dedicated reply for unsupported edit models", () => {
		const error = new ImageEditingNotSupportedError(
			"togetherai",
			"black-forest-labs/FLUX.1-schnell",
		);

		assert.equal(
			getImageGenerationErrorReply(error),
			replies.imageEditingNotSupported,
		);
	});

	it("keeps the generic reply for other generation failures", () => {
		assert.equal(
			getImageGenerationErrorReply(new Error("failed")),
			replies.error,
		);
	});
});

describe("uploaded image persistence", () => {
	it("scopes bot-image lookup to the current chat", async () => {
		const chat = { id: 5 } as Chat;
		const expectedMessage = { tgMessageId: "101" };
		let receivedFilter: unknown;
		const em = {
			findOne: async (_entity: unknown, filter: unknown) => {
				receivedFilter = filter;
				return expectedMessage;
			},
		};

		const result = await findPersistedImageMessage(
			em as unknown as EntityManager,
			"101",
			chat,
		);

		assert.equal(result, expectedMessage);
		assert.deepEqual(receivedFilter, {
			dialog: { chat },
			tgMessageId: "101",
		});
	});

	it("maps a cached upload to an image message in the triggered dialog", () => {
		const dialog = { id: 7 } as Dialog;
		const user = { id: 42 } as User;

		assert.deepEqual(
			createUploadedImageMessageData(
				{
					chatId: "1",
					mediaGroupId: "album",
					tgMessageId: "101",
					tgPhotoId: "photo-101",
					tgUserId: "42",
				},
				dialog,
				user,
			),
			{
				dialog,
				tgMessageId: "101",
				tgPhotoId: "photo-101",
				type: MessageType.image,
				user,
			},
		);
	});

	it("selects the exact replied album image as the request parent", () => {
		const messages = [
			{ tgMessageId: "101" },
			{ tgMessageId: "102" },
			{ tgMessageId: "103" },
		];

		assert.equal(findRepliedImageMessage(messages, "102"), messages[1]);
	});
});

describe("generateBetterImageController", () => {
	it("sends each parallel album result as soon as it finishes", async () => {
		const { context, persisted, photoReplies } = createImageEditContext();
		const sourceMessages = [
			{ tgMessageId: "101", tgPhotoId: "photo-101" },
			{ tgMessageId: "102", tgPhotoId: "photo-102" },
		];
		const edits = new Map([
			["data:image/jpeg;base64,photo-101", deferred<Uint8Array>()],
			["data:image/jpeg;base64,photo-102", deferred<Uint8Array>()],
		]);
		const generationEntityManagers = new Set<unknown>();
		let startedEdits = 0;

		const operation = generateBetterImageController(
			context as never,
			sourceMessages as never,
			sourceMessages[1] as never,
			"restyle",
			{
				generateImage: async (em, _text, sourceImage) => {
					generationEntityManagers.add(em);
					startedEdits += 1;
					return await edits.get(sourceImage ?? "")?.promise;
				},
				getTelegramImageDataUrl: async (tgPhotoId) =>
					`data:image/jpeg;base64,${tgPhotoId}`,
			},
		);

		await nextEventLoopTurn();
		const editsStartedBeforeCompletion = startedEdits;
		edits.get("data:image/jpeg;base64,photo-102")?.resolve(new Uint8Array([2]));
		await nextEventLoopTurn();
		const repliesBeforeFirstEditFinished = photoReplies.length;
		edits.get("data:image/jpeg;base64,photo-101")?.resolve(new Uint8Array([1]));
		await operation;

		assert.equal(editsStartedBeforeCompletion, 2);
		assert.equal(repliesBeforeFirstEditFinished, 1);
		assert.equal(generationEntityManagers.size, 2);
		assert.deepEqual(photoReplies, [
			{ reply_to_message_id: 500 },
			{ reply_to_message_id: 500 },
		]);
		assert.equal(persisted[0].replyTo, sourceMessages[1]);
		assert.deepEqual(
			persisted.slice(1).map(({ tgPhotoId }) => tgPhotoId),
			["result-1", "result-2"],
		);
	});

	it("starts no more than five album edits at once", async () => {
		const { context } = createImageEditContext();
		const sourceMessages = Array.from({ length: 6 }, (_, index) => ({
			tgMessageId: `${101 + index}`,
			tgPhotoId: `photo-${index + 1}`,
		}));
		const edits = sourceMessages.map(() => deferred<Uint8Array>());
		let startedEdits = 0;

		const operation = generateBetterImageController(
			context as never,
			sourceMessages as never,
			sourceMessages[0] as never,
			"restyle",
			{
				generateImage: async (_em, _text, sourceImage) => {
					const index = Number(sourceImage?.match(/photo-(\d+)/u)?.[1]) - 1;
					startedEdits += 1;
					return await edits[index].promise;
				},
				getTelegramImageDataUrl: async (tgPhotoId) =>
					`data:image/jpeg;base64,${tgPhotoId}`,
			},
		);

		await nextEventLoopTurn();
		const initialStartedEdits = startedEdits;
		edits[0].resolve(new Uint8Array([1]));
		await nextEventLoopTurn();
		const startedAfterOneFinished = startedEdits;
		for (const edit of edits.slice(1)) edit.resolve(new Uint8Array([1]));
		await operation;

		assert.equal(initialStartedEdits, 5);
		assert.equal(startedAfterOneFinished, 6);
	});

	it("continues the album after a failed edit and reports skipped photos", async (testContext) => {
		testContext.mock.method(console, "error", () => undefined);
		const { context, errorReplies, photoReplies } = createImageEditContext();
		const sourceMessages = [
			{ tgMessageId: "101", tgPhotoId: "photo-101" },
			{ tgMessageId: "102", tgPhotoId: "photo-102" },
			{ tgMessageId: "103", tgPhotoId: "photo-103" },
		];
		const downloads: string[] = [];

		await generateBetterImageController(
			context as never,
			sourceMessages as never,
			sourceMessages[0] as never,
			"restyle",
			{
				generateImage: async (_em, _text, sourceImage) => {
					if (sourceImage?.endsWith("photo-102")) {
						throw new Error("provider failed");
					}

					return new Uint8Array([1]);
				},
				getTelegramImageDataUrl: async (tgPhotoId) => {
					downloads.push(tgPhotoId);
					return `data:image/jpeg;base64,${tgPhotoId}`;
				},
			},
		);

		assert.deepEqual(downloads, ["photo-101", "photo-102", "photo-103"]);
		assert.equal(photoReplies.length, 2);
		assert.deepEqual(errorReplies, [
			"Обработано фотографий: 2 из 3. Не удалось обработать: №2.",
		]);
	});

	it("throws after trying every photo when the whole album fails", async (testContext) => {
		testContext.mock.method(console, "error", () => undefined);
		const { context, errorReplies, photoReplies } = createImageEditContext();
		const sourceMessages = [
			{ tgMessageId: "101", tgPhotoId: "photo-101" },
			{ tgMessageId: "102", tgPhotoId: "photo-102" },
		];
		const downloads: string[] = [];

		await assert.rejects(
			generateBetterImageController(
				context as never,
				sourceMessages as never,
				sourceMessages[0] as never,
				"restyle",
				{
					generateImage: async () => {
						throw new Error("provider failed");
					},
					getTelegramImageDataUrl: async (tgPhotoId) => {
						downloads.push(tgPhotoId);
						return `data:image/jpeg;base64,${tgPhotoId}`;
					},
				},
			),
			/provider failed/u,
		);

		assert.deepEqual(downloads, ["photo-101", "photo-102"]);
		assert.equal(photoReplies.length, 0);
		assert.deepEqual(errorReplies, [replies.error]);
	});
});

describe("handleTriggeredImageEdit", () => {
	it("persists every resolved upload and edits the exact replied photo chain", async () => {
		const { context, persisted } = createImageEditContext();
		const uploadedImages = [
			{
				chatId: "5",
				mediaGroupId: "album",
				tgMessageId: "101",
				tgPhotoId: "photo-101",
				tgUserId: "42",
			},
			{
				chatId: "5",
				mediaGroupId: "album",
				tgMessageId: "102",
				tgPhotoId: "photo-102",
				tgUserId: "42",
			},
		];
		Object.assign(context, {
			me: { id: 999 },
			message: {
				message_id: 500,
				reply_to_message: {
					chat: { id: 5 },
					from: { id: 42, is_bot: false },
					message_id: 102,
					photo: [{ file_id: "photo-102" }],
				},
				text: "restyle",
			},
		});
		let editCall:
			| {
					repliedMessageId: string;
					sourceMessageIds: string[];
					text: string;
			  }
			| undefined;

		const handled = await handleTriggeredImageEdit(
			context as never,
			"restyle",
			{
				generateBetterImageController: async (
					_context,
					sourceMessages,
					repliedMessage,
					text,
				) => {
					editCall = {
						repliedMessageId: repliedMessage.tgMessageId,
						sourceMessageIds: sourceMessages.map(
							({ tgMessageId }) => tgMessageId,
						),
						text: text ?? "",
					};
				},
				uploadedImageStore: { resolve: () => uploadedImages },
			},
		);

		assert.equal(handled, true);
		assert.deepEqual(
			persisted.map(({ tgMessageId }) => tgMessageId),
			["101", "102"],
		);
		assert.deepEqual(editCall, {
			repliedMessageId: "102",
			sourceMessageIds: ["101", "102"],
			text: "restyle",
		});
	});
});
