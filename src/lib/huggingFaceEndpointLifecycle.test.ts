import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createHuggingFaceEndpointLifecycle,
	requireHuggingFaceEndpointManagementConfig,
	scaleHuggingFaceEndpointToZero,
} from "lib/huggingFaceEndpointLifecycle.js";

describe("requireHuggingFaceEndpointManagementConfig", () => {
	it("returns trimmed endpoint management values", () => {
		assert.deepEqual(
			requireHuggingFaceEndpointManagementConfig({
				endpointName: "  shoe-bot-text  ",
				namespace: "  yanislav-igonin  ",
				token: "  hf-token  ",
			}),
			{
				endpointName: "shoe-bot-text",
				namespace: "yanislav-igonin",
				token: "hf-token",
			},
		);
	});

	it("rejects missing endpoint management values", () => {
		assert.throws(
			() =>
				requireHuggingFaceEndpointManagementConfig({
					endpointName: undefined,
					namespace: "yanislav-igonin",
					token: "hf-token",
				}),
			/HF_TEXT_INFERENCE_ENDPOINT_NAME is not set/u,
		);
		assert.throws(
			() =>
				requireHuggingFaceEndpointManagementConfig({
					endpointName: "shoe-bot-text",
					namespace: undefined,
					token: "hf-token",
				}),
			/HF_INFERENCE_ENDPOINT_NAMESPACE is not set/u,
		);
	});
});

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

		await scaleHuggingFaceEndpointToZero(
			{
				endpointName: "shoe-bot-text",
				namespace: "yanislav-igonin",
				token: "hf-token",
			},
			fetcher,
		);

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
			scaleHuggingFaceEndpointToZero(
				{
					endpointName: "shoe-bot-text",
					namespace: "yanislav-igonin",
					token: "hf-token",
				},
				fetcher,
			),
			/Hugging Face scale-to-zero failed with 403.*forbidden/u,
		);
	});
});

describe("createHuggingFaceEndpointLifecycle", () => {
	it("scales to zero only after the final concurrent generation completes", async () => {
		let releaseFirst: (() => void) | undefined;
		let releaseSecond: (() => void) | undefined;
		let scaleCalls = 0;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const secondGate = new Promise<void>((resolve) => {
			releaseSecond = resolve;
		});
		const lifecycle = createHuggingFaceEndpointLifecycle({
			scaleToZero: async () => {
				scaleCalls += 1;
			},
		});

		const first = lifecycle.run(async () => {
			await firstGate;
			return "first";
		});
		const second = lifecycle.run(async () => {
			await secondGate;
			return "second";
		});
		await Promise.resolve();

		releaseFirst?.();
		assert.equal(await first, "first");
		assert.equal(scaleCalls, 0);

		releaseSecond?.();
		assert.equal(await second, "second");
		assert.equal(scaleCalls, 1);
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

		const first = lifecycle.run(async () => "first");
		await scaleStarted;
		const second = lifecycle.run(async () => {
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

		const result = await lifecycle.run(async () => "generated");

		assert.equal(result, "generated");
		assert.equal(errors.length, 1);
	});
});
