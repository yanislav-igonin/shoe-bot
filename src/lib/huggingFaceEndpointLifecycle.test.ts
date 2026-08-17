import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createHuggingFaceEndpointLifecycle,
	type HuggingFaceEndpointManagementConfig,
	scaleHuggingFaceEndpointToZero,
} from "lib/huggingFaceEndpointLifecycle.js";

const managementConfig: HuggingFaceEndpointManagementConfig = {
	endpointName: "shoe-bot-text",
	namespace: "yanislav-igonin",
	token: "hf-token",
};

describe("scaleHuggingFaceEndpointToZero", () => {
	it("calls the Hugging Face endpoint management API", async () => {
		let request: Request | undefined;
		const fetcher = (async (input, init) => {
			request = new Request(input, init);
			return new Response(
				JSON.stringify({ status: { state: "scaledToZero" } }),
				{
					headers: { "content-type": "application/json" },
					status: 200,
				},
			);
		}) as typeof fetch;

		await scaleHuggingFaceEndpointToZero(managementConfig, fetcher);

		assert.ok(request);
		assert.equal(
			request.url,
			"https://api.endpoints.huggingface.cloud/v2/endpoint/yanislav-igonin/shoe-bot-text/scale-to-zero",
		);
		assert.equal(request.method, "POST");
		assert.equal(request.headers.get("authorization"), "Bearer hf-token");
	});

	it("surfaces management API errors", async () => {
		const fetcher = (async () =>
			new Response("forbidden", { status: 403 })) as typeof fetch;

		await assert.rejects(
			scaleHuggingFaceEndpointToZero(managementConfig, fetcher),
			/Hugging Face scale-to-zero failed with 403.*forbidden/u,
		);
	});
});

describe("createHuggingFaceEndpointLifecycle", () => {
	it("scales to zero only after the final concurrent generation completes", async () => {
		let releaseFirst: (() => void) | undefined;
		let releaseSecond: (() => void) | undefined;
		const scaledConfigs: HuggingFaceEndpointManagementConfig[] = [];
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const secondGate = new Promise<void>((resolve) => {
			releaseSecond = resolve;
		});
		const lifecycle = createHuggingFaceEndpointLifecycle({
			scaleToZero: async (currentConfig) => {
				scaledConfigs.push(currentConfig);
			},
		});

		const first = lifecycle.run(managementConfig, async () => {
			await firstGate;
			return "first";
		});
		const second = lifecycle.run(managementConfig, async () => {
			await secondGate;
			return "second";
		});
		await Promise.resolve();

		releaseFirst?.();
		assert.equal(await first, "first");
		assert.equal(scaledConfigs.length, 0);

		releaseSecond?.();
		assert.equal(await second, "second");
		assert.deepEqual(scaledConfigs, [managementConfig]);
	});

	it("waits for an in-flight scale-to-zero before starting a new generation", async () => {
		let finishScale: (() => void) | undefined;
		let notifyScaleStarted: (() => void) | undefined;
		let secondStarted = false;
		const scaleStarted = new Promise<void>((resolve) => {
			notifyScaleStarted = resolve;
		});
		const scaleGate = new Promise<void>((resolve) => {
			finishScale = resolve;
		});
		const lifecycle = createHuggingFaceEndpointLifecycle({
			scaleToZero: async () => {
				notifyScaleStarted?.();
				await scaleGate;
			},
		});

		const first = lifecycle.run(managementConfig, async () => "first");
		await scaleStarted;
		const second = lifecycle.run(managementConfig, async () => {
			secondStarted = true;
			return "second";
		});
		await Promise.resolve();

		assert.equal(secondStarted, false);
		finishScale?.();
		assert.equal(await first, "first");
		assert.equal(await second, "second");
		assert.equal(secondStarted, true);
	});

	it("does not fail a completed generation when scale-to-zero fails", async () => {
		const errors: unknown[] = [];
		const lifecycle = createHuggingFaceEndpointLifecycle({
			onScaleError: (error) => errors.push(error),
			scaleToZero: async () => {
				throw new Error("management unavailable");
			},
		});

		const result = await lifecycle.run(
			managementConfig,
			async () => "generated",
		);

		assert.equal(result, "generated");
		assert.equal(errors.length, 1);
	});
});
