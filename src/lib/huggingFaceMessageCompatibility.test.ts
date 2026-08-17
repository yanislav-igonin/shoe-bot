import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "@mikro-orm/postgresql";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";
process.env.OPENROUTER_API_KEY = "test";
process.env.HF_TOKEN = "hf-test-token";

const { getCompletion } = await import("lib/prompt.js");

const passthroughLifecycle = {
	run: async <T>(_managementConfig: unknown, task: () => Promise<T>) =>
		await task(),
};

const resolveHuggingFaceEndpoint = async () => ({
	endpointUrl: "https://example.com/hf-text-endpoint",
	managementConfig: {
		endpointName: "shoe-bot-text",
		namespace: "yanislav-igonin",
		token: "hf-test-token",
	},
});

describe("Hugging Face chat compatibility", () => {
	it("merges all system messages into one message at the beginning", async () => {
		let generatedMessages: unknown;
		const em = {
			find: async () => [
				{ key: "textProvider", value: "huggingface" },
				{ key: "textModel", value: "owner/model" },
			],
		} as unknown as EntityManager;
		const generate = async (options: { messages?: unknown }) => {
			generatedMessages = options.messages;
			return { text: "ok" };
		};

		await getCompletion(
			em,
			"latest question",
			[
				{ role: "user", content: "old question" },
				{ role: "system", content: "length rule" },
				{ role: "assistant", content: "old answer" },
				{ role: "system", content: "persona rule" },
			],
			{},
			[],
			generate as never,
			passthroughLifecycle,
			resolveHuggingFaceEndpoint,
		);

		assert.deepEqual(generatedMessages, [
			{
				role: "system",
				content: "length rule\n\npersona rule",
			},
			{ role: "user", content: "old question" },
			{ role: "assistant", content: "old answer" },
			{ role: "user", content: "latest question" },
		]);
	});

	it("does not rewrite message history for non-Hugging-Face providers", async () => {
		let generatedMessages: unknown;
		const em = {
			find: async () => [
				{ key: "textProvider", value: "openrouter" },
				{ key: "textModel", value: "owner/model" },
			],
		} as unknown as EntityManager;
		const generate = async (options: { messages?: unknown }) => {
			generatedMessages = options.messages;
			return { text: "ok" };
		};

		await getCompletion(
			em,
			"latest question",
			[
				{ role: "system", content: "first" },
				{ role: "system", content: "second" },
			],
			{},
			[],
			generate as never,
		);

		assert.deepEqual(generatedMessages, [
			{ role: "system", content: "first" },
			{ role: "system", content: "second" },
			{ role: "user", content: "latest question" },
		]);
	});
});
