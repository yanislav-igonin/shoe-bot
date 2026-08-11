import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Message, MessageType, User } from "../entities.js";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";

const prompt = await import("lib/prompt.js");
const { addUserContext, chooseTask, Model } = prompt;
const textProviders = prompt as typeof prompt & {
	parseTextGenerationSettings: (
		rows: Array<{ key: string; value: string }>,
	) => { model: string; provider: "openrouter" | "togetherai" | "xai" };
	requireProviderApiKey: (
		apiKey: string | undefined,
		variableName: string,
	) => string;
	resolveTextModel: <T>(
		settings: {
			model: string;
			provider: "openrouter" | "togetherai" | "xai";
		},
		factories: Record<
			"openrouter" | "togetherai" | "xai",
			(model: string) => T
		>,
	) => T;
};

const user = new User();
user.id = 1;
user.tgId = "1";

const message = new Message();
message.createdAt = new Date(0);
message.id = 1;
message.text = "describe this";
message.tgMessageId = "1";
message.tgPhotoId = "photo-id";
message.type = MessageType.image;
message.user = user;

describe("addUserContext", () => {
	it("converts a Telegram image message to AI SDK content", () => {
		assert.deepEqual(
			addUserContext(message, {
				[message.id]: "https://example.com/image.jpg",
			}),
			{
				content: [
					{ text: "describe this", type: "text" },
					{
						image: new URL("https://example.com/image.jpg"),
						type: "image",
					},
				],
				role: "user",
			},
		);
	});
});

describe("chooseTask", () => {
	it("returns the validated classifier choice", async () => {
		const task = await chooseTask("draw a boot", async () => MessageType.image);

		assert.equal(task, MessageType.image);
	});

	it("falls back to text when classification fails", async () => {
		const task = await chooseTask("draw a boot", async () => {
			throw new Error("classifier unavailable");
		});

		assert.equal(task, MessageType.text);
	});
});

describe("getGrokCompletion", () => {
	it("includes the current message image in the generated user prompt", async () => {
		let generatedMessages: unknown;
		const getGrokCompletion = prompt.getGrokCompletion as unknown as (
			message: Message,
			context: unknown[],
			model: (typeof Model)[keyof typeof Model],
			imagesMap: Record<number, string>,
			currentImageUrls: string[],
			generate: (options: { messages: unknown }) => Promise<{ text: string }>,
		) => Promise<string>;

		const completion = await getGrokCompletion(
			message,
			[],
			Model.Grok3,
			{ [message.id]: "https://example.com/image.jpg" },
			[],
			async ({ messages }) => {
				generatedMessages = messages;
				return { text: "A boot" };
			},
		);

		assert.equal(completion, "A boot");
		assert.deepEqual(generatedMessages, [
			{
				content: [
					{ text: "describe this", type: "text" },
					{
						image: new URL("https://example.com/image.jpg"),
						type: "image",
					},
				],
				role: "user",
			},
		]);
	});

	it("keeps every current album image in the supplied order", async () => {
		let generatedMessages: unknown;
		const getGrokCompletion = prompt.getGrokCompletion as unknown as (
			message: Message,
			context: unknown[],
			model: (typeof Model)[keyof typeof Model],
			imagesMap: Record<number, string>,
			currentImageUrls: string[],
			generate: (options: { messages: unknown }) => Promise<{ text: string }>,
		) => Promise<string>;

		await getGrokCompletion(
			message,
			[],
			Model.Grok3,
			{},
			["https://example.com/first.jpg", "https://example.com/second.jpg"],
			async ({ messages }) => {
				generatedMessages = messages;
				return { text: "Two boots" };
			},
		);

		assert.deepEqual(generatedMessages, [
			{
				content: [
					{ text: "describe this", type: "text" },
					{
						image: new URL("https://example.com/first.jpg"),
						type: "image",
					},
					{
						image: new URL("https://example.com/second.jpg"),
						type: "image",
					},
				],
				role: "user",
			},
		]);
	});
});

describe("parseTextGenerationSettings", () => {
	for (const provider of ["xai", "togetherai", "openrouter"] as const) {
		it(`parses ${provider} settings`, () => {
			assert.deepEqual(
				textProviders.parseTextGenerationSettings([
					{ key: "textModel", value: "provider/model" },
					{ key: "textProvider", value: provider },
				]),
				{ model: "provider/model", provider },
			);
		});
	}

	it("rejects a missing text provider", () => {
		assert.throws(
			() =>
				textProviders.parseTextGenerationSettings([
					{ key: "textModel", value: "model" },
				]),
			/textProvider setting is missing/u,
		);
	});

	it("rejects a missing text model", () => {
		assert.throws(
			() =>
				textProviders.parseTextGenerationSettings([
					{ key: "textProvider", value: "xai" },
				]),
			/textModel setting is missing/u,
		);
	});

	it("rejects an empty text model", () => {
		assert.throws(
			() =>
				textProviders.parseTextGenerationSettings([
					{ key: "textProvider", value: "xai" },
					{ key: "textModel", value: "   " },
				]),
			/textModel setting is empty/u,
		);
	});

	it("rejects an unsupported text provider", () => {
		assert.throws(
			() =>
				textProviders.parseTextGenerationSettings([
					{ key: "textProvider", value: "unknown" },
					{ key: "textModel", value: "model" },
				]),
			/Unsupported text provider: unknown/u,
		);
	});
});

describe("requireProviderApiKey", () => {
	it("returns a configured key", () => {
		assert.equal(
			textProviders.requireProviderApiKey("provider-key", "PROVIDER_API_KEY"),
			"provider-key",
		);
	});

	it("names the missing provider key", () => {
		assert.throws(
			() => textProviders.requireProviderApiKey(undefined, "PROVIDER_API_KEY"),
			/PROVIDER_API_KEY is not set/u,
		);
	});

	it("rejects a whitespace-only provider key", () => {
		assert.throws(
			() => textProviders.requireProviderApiKey("   ", "PROVIDER_API_KEY"),
			/PROVIDER_API_KEY is not set/u,
		);
	});
});

describe("resolveTextModel", () => {
	for (const provider of ["xai", "togetherai", "openrouter"] as const) {
		it(`routes ${provider} model IDs to the matching factory`, () => {
			const result = textProviders.resolveTextModel(
				{ model: "provider/model", provider },
				{
					openrouter: (model) => `openrouter:${model}`,
					togetherai: (model) => `togetherai:${model}`,
					xai: (model) => `xai:${model}`,
				},
			);

			assert.equal(result, `${provider}:provider/model`);
		});
	}
});
