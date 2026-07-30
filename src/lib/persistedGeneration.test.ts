import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { runPersistedGeneration } from "./persistedGeneration.js";

describe("runPersistedGeneration", () => {
	it("persists the request before generation and the response afterward", async () => {
		const events: string[] = [];

		const result = await runPersistedGeneration({
			generate: async () => {
				events.push("generate");
				return "completion";
			},
			persistRequest: async () => {
				events.push("persist request");
			},
			persistResponse: async (completion) => {
				events.push(`persist response: ${completion}`);
			},
		});

		assert.equal(result, "completion");
		assert.deepEqual(events, [
			"persist request",
			"generate",
			"persist response: completion",
		]);
	});

	it("keeps the request persisted when generation fails", async () => {
		const events: string[] = [];

		await assert.rejects(
			runPersistedGeneration({
				generate: async () => {
					events.push("generate");
					throw new Error("LLM failed");
				},
				persistRequest: async () => {
					events.push("persist request");
				},
				persistResponse: async () => {
					events.push("persist response");
				},
			}),
			/LLM failed/u,
		);

		assert.deepEqual(events, ["persist request", "generate"]);
	});
});
