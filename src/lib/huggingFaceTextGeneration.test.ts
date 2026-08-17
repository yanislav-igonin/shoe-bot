import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";

const { createHuggingFaceColdStartFetch } = await import("lib/prompt.js");

describe("createHuggingFaceColdStartFetch", () => {
	it("waits at the proxy and retries 502/503 cold-start responses", async () => {
		const statuses = [502, 503, 200];
		const requests: Request[] = [];
		const baseFetch = (async (input) => {
			requests.push(input as Request);
			return new Response("response", { status: statuses.shift() });
		}) as typeof fetch;
		const retryingFetch = createHuggingFaceColdStartFetch(baseFetch, {
			maxWaitMs: 1_000,
			retryDelayMs: 0,
		});

		const response = await retryingFetch(
			"https://example.com/v1/chat/completions",
			{
				headers: { "Content-Type": "application/json" },
				method: "POST",
				body: JSON.stringify({ messages: [] }),
			},
		);

		assert.equal(response.status, 200);
		assert.equal(requests.length, 3);
		assert.equal(requests[0].headers.get("x-scale-up-timeout"), "600");
		assert.equal(requests[0].headers.get("content-type"), "application/json");
	});

	it("returns a persistent cold-start response after the wait budget", async () => {
		let now = 0;
		const baseFetch = (async () => {
			now += 10;
			return new Response("still initializing", { status: 503 });
		}) as typeof fetch;
		const retryingFetch = createHuggingFaceColdStartFetch(baseFetch, {
			maxWaitMs: 15,
			now: () => now,
			retryDelayMs: 0,
		});

		const response = await retryingFetch(
			"https://example.com/v1/chat/completions",
		);

		assert.equal(response.status, 503);
	});
});
