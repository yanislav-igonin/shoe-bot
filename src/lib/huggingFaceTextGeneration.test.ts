import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";

const { createHuggingFaceColdStartFetch } = await import("lib/prompt.js");

describe("createHuggingFaceColdStartFetch", () => {
	it("retries 502 responses while a scaled-to-zero endpoint is waking", async () => {
		let calls = 0;
		const baseFetch = (async () => {
			calls += 1;
			return calls < 3
				? new Response("initializing", { status: 502 })
				: new Response("ok", { status: 200 });
		}) as typeof fetch;
		const retryingFetch = createHuggingFaceColdStartFetch(baseFetch, {
			maxWaitMs: 1_000,
			retryDelayMs: 0,
		});

		const response = await retryingFetch(
			"https://example.com/v1/chat/completions",
		);

		assert.equal(response.status, 200);
		assert.equal(calls, 3);
	});

	it("returns a persistent 502 after the configured wait budget", async () => {
		let now = 0;
		const baseFetch = (async () => {
			now += 10;
			return new Response("still initializing", { status: 502 });
		}) as typeof fetch;
		const retryingFetch = createHuggingFaceColdStartFetch(baseFetch, {
			maxWaitMs: 15,
			now: () => now,
			retryDelayMs: 0,
		});

		const response = await retryingFetch(
			"https://example.com/v1/chat/completions",
		);

		assert.equal(response.status, 502);
	});
});
