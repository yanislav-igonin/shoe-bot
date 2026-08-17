import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "@mikro-orm/postgresql";
import { logger } from "lib/logger.js";
import { Message, MessageType, User } from "../entities.js";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";
process.env.OPENROUTER_API_KEY = "test";
process.env.TOGETHER_API_KEY = "test";
process.env.HF_TOKEN = "hf-test-token";
process.env.HF_TEXT_INFERENCE_ENDPOINT_URL =
	"https://example.com/hf-text-endpoint";
process.env.HF_INFERENCE_ENDPOINT_NAMESPACE = "yanislav-igonin";
process.env.HF_TEXT_INFERENCE_ENDPOINT_NAME = "shoe-bot-text";

const prompt = await import("lib/prompt.js");
const {
	addUserContext,
	chooseTask,
	getCompletion,
	parseTextGenerationSettings,
	requireHuggingFaceTextEndpointUrl,
	requireProviderApiKey,
	resolveTextModel,
} = prompt;

const passthroughLifecycle = {
	run: async <T>(task: () => Promise<T>) => await task(),
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

describe("getCompletion", () => {
	const expectedModelProviders = {
		huggingface: "huggingface.chat",
		openrouter: "openrouter.chat",
		togetherai: "togetherai.chat",
		xai: "xai.responses",
	};
	const expectedModelIds = {
		huggingface: "tgi",
		openrouter: "provider/model",
		togetherai: "provider/model",
		xai: "provider/model",
	};

	for (const provider of [
		"xai",
		"togetherai",
		"openrouter",
		"huggingface",
	] as const) {
		it(`loads settings and routes ${provider} completions`, async () => {
			let generatedOptions: Record<string, unknown> | undefined;
			const em = {
				find: async () => [
					{ key: "textProvider", value: provider },
					{ key: "textModel", value: "provider/model" },
				],
			} as unknown as EntityManager;
			const generate = async (options: Record<string, unknown>) => {
				generatedOptions = options;
				return { text: "  A boot  " };
			};

			const completion = await getCompletion(
				em,
				message,
				[],
				{},
				["https://example.com/first.jpg", "https://example.com/second.jpg"],
				generate,
				passthroughLifecycle,
			);

			assert.deepEqual(completion, ["A boot"]);
			assert.ok(generatedOptions);
			const generatedModel = generatedOptions.model as {
				modelId: string;
				provider: string;
			};
			assert.equal(generatedModel.modelId, expectedModelIds[provider]);
			assert.equal(generatedModel.provider, expectedModelProviders[provider]);
			assert.deepEqual(generatedOptions.messages, [
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
	}

	it("logs the configured provider and model when generation fails", async () => {
		const upstreamError = new Error("upstream failed");
		const logged: unknown[][] = [];
		const originalLogger = logger.error;
		logger.error = (...args) => logged.push(args);
		const em = {
			find: async () => [
				{ key: "textProvider", value: "openrouter" },
				{ key: "textModel", value: "provider/model" },
			],
		} as unknown as EntityManager;

		try {
			await assert.rejects(
				getCompletion(em, "hello", [], {}, [], async () => {
					throw upstreamError;
				}),
				upstreamError,
			);
		} finally {
			logger.error = originalLogger;
		}

		assert.deepEqual(logged, [
			["Text completion failed for openrouter/provider/model:", upstreamError],
		]);
	});
});

describe("parseTextGenerationSettings", () => {
	for (const provider of [
		"xai",
		"togetherai",
		"openrouter",
		"huggingface",
	] as const) {
		it(`parses ${provider} settings`, () => {
			assert.deepEqual(
				parseTextGenerationSettings([
					{ key: "textModel", value: "provider/model" },
					{ key: "textProvider", value: provider },
				]),
				{ model: "provider/model", provider },
			);
		});
	}

	it("rejects a missing text provider", () => {
		assert.throws(
			() => parseTextGenerationSettings([{ key: "textModel", value: "model" }]),
			/textProvider setting is missing/u,
		);
	});

	it("rejects a missing text model", () => {
		assert.throws(
			() =>
				parseTextGenerationSettings([{ key: "textProvider", value: "xai" }]),
			/textModel setting is missing/u,
		);
	});

	it("rejects an empty text model", () => {
		assert.throws(
			() =>
				parseTextGenerationSettings([
					{ key: "textProvider", value: "xai" },
					{ key: "textModel", value: "   " },
				]),
			/textModel setting is empty/u,
		);
	});

	it("rejects an unsupported text provider", () => {
		assert.throws(
			() =>
				parseTextGenerationSettings([
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
			requireProviderApiKey("provider-key", "PROVIDER_API_KEY"),
			"provider-key",
		);
	});

	it("names the missing provider key", () => {
		assert.throws(
			() => requireProviderApiKey(undefined, "PROVIDER_API_KEY"),
			/PROVIDER_API_KEY is not set/u,
		);
	});

	it("rejects a whitespace-only provider key", () => {
		assert.throws(
			() => requireProviderApiKey("   ", "PROVIDER_API_KEY"),
			/PROVIDER_API_KEY is not set/u,
		);
	});
});

describe("requireHuggingFaceTextEndpointUrl", () => {
	it("appends the TGI OpenAI-compatible v1 path", () => {
		assert.equal(
			requireHuggingFaceTextEndpointUrl(" https://example.com/endpoint/ "),
			"https://example.com/endpoint/v1",
		);
	});

	it("keeps an existing v1 path", () => {
		assert.equal(
			requireHuggingFaceTextEndpointUrl("https://example.com/endpoint/v1/"),
			"https://example.com/endpoint/v1",
		);
	});

	it("rejects a missing endpoint URL", () => {
		assert.throws(
			() => requireHuggingFaceTextEndpointUrl(undefined),
			/HF_TEXT_INFERENCE_ENDPOINT_URL is not set/u,
		);
	});

	it("rejects an invalid endpoint URL", () => {
		assert.throws(
			() => requireHuggingFaceTextEndpointUrl("not-a-url"),
			/HF_TEXT_INFERENCE_ENDPOINT_URL must be a valid HTTP\(S\) URL/u,
		);
	});
});

describe("resolveTextModel", () => {
	for (const provider of [
		"xai",
		"togetherai",
		"openrouter",
		"huggingface",
	] as const) {
		it(`routes ${provider} model IDs to the matching factory`, () => {
			const result = resolveTextModel(
				{ model: "provider/model", provider },
				{
					huggingface: (model) => `huggingface:${model}`,
					openrouter: (model) => `openrouter:${model}`,
					togetherai: (model) => `togetherai:${model}`,
					xai: (model) => `xai:${model}`,
				},
			);

			assert.equal(result, `${provider}:provider/model`);
		});
	}
});
