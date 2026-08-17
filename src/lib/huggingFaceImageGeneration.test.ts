import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";
process.env.HF_TOKEN = "hf-test-token";

// Config reads environment variables at module load, so imports must follow setup.
const imageGeneration = await import("lib/imageGeneration.js");
const {
	generateImage,
	parseImageGenerationSettings,
	requireHuggingFaceConfig,
} = imageGeneration;

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const huggingFaceSettings = () => ({
	find: async () => [
		{ key: "imageProvider", value: "huggingface" },
		{ key: "imageModel", value: "owner/community-image-model" },
		{
			key: "hfImageInferenceEndpointUrl",
			value: "https://example.com/hf-endpoint",
		},
	],
});

describe("Hugging Face image provider settings", () => {
	it("parses Hugging Face settings", () => {
		assert.deepEqual(
			parseImageGenerationSettings([
				{ key: "imageProvider", value: "huggingface" },
				{ key: "imageModel", value: "owner/community-image-model" },
			]),
			{
				model: "owner/community-image-model",
				provider: "huggingface",
			},
		);
	});
});

describe("requireHuggingFaceConfig", () => {
	it("is exposed by the image provider module", () => {
		assert.equal(typeof requireHuggingFaceConfig, "function");
	});

	it("returns trimmed token and endpoint URL", () => {
		assert.deepEqual(
			requireHuggingFaceConfig(
				"  hf-token  ",
				"  https://example.com/endpoint  ",
			),
			{
				endpointUrl: "https://example.com/endpoint",
				token: "hf-token",
			},
		);
	});

	it("rejects a missing token", () => {
		assert.throws(
			() => requireHuggingFaceConfig(undefined, "https://example.com/endpoint"),
			/HF_TOKEN is not set/u,
		);
	});

	it("rejects a missing endpoint URL", () => {
		assert.throws(
			() => requireHuggingFaceConfig("hf-token", undefined),
			/hfImageInferenceEndpointUrl setting is not set/u,
		);
	});

	it("rejects an invalid endpoint URL", () => {
		assert.throws(
			() => requireHuggingFaceConfig("hf-token", "not-a-url"),
			/hfImageInferenceEndpointUrl setting must be a valid HTTP\(S\) URL/u,
		);
	});
});

describe("generateImage with Hugging Face", () => {
	it("posts the prompt with bearer auth and returns binary image bytes", async () => {
		let requestUrl: string | undefined;
		let requestInit: RequestInit | undefined;
		globalThis.fetch = (async (input, init) => {
			requestUrl = String(input);
			requestInit = init;
			return new Response(new Uint8Array([1, 2, 3]), {
				headers: { "content-type": "image/png" },
				status: 200,
			});
		}) as typeof fetch;

		const image = await generateImage(
			huggingFaceSettings() as never,
			"draw a shoe",
		);

		assert.deepEqual(image, Buffer.from([1, 2, 3]));
		assert.equal(requestUrl, "https://example.com/hf-endpoint");
		assert.equal(requestInit?.method, "POST");
		assert.deepEqual(requestInit?.headers, {
			Accept: "image/png",
			Authorization: "Bearer hf-test-token",
			"Content-Type": "application/json",
		});
		assert.equal(requestInit?.body, JSON.stringify({ inputs: "draw a shoe" }));
	});

	it("returns an image URL from a JSON response", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ url: "https://example.com/image.png" }), {
				headers: { "content-type": "application/json" },
				status: 200,
			})) as typeof fetch;

		const image = await generateImage(
			huggingFaceSettings() as never,
			"draw a shoe",
		);

		assert.equal(image, "https://example.com/image.png");
	});

	it("decodes nested base64 image data from a JSON response", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), {
				headers: { "content-type": "application/json" },
				status: 200,
			})) as typeof fetch;

		const image = await generateImage(
			huggingFaceSettings() as never,
			"draw a shoe",
		);

		assert.deepEqual(image, Buffer.from([1, 2, 3]));
	});

	it("surfaces endpoint errors with status and response body", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: "model failed to load" }), {
				headers: { "content-type": "application/json" },
				status: 503,
			})) as typeof fetch;

		await assert.rejects(
			generateImage(huggingFaceSettings() as never, "draw a shoe"),
			/Hugging Face inference endpoint returned 503.*model failed to load/u,
		);
	});

	it("rejects source-image editing until an endpoint contract is defined", async () => {
		await assert.rejects(
			generateImage(
				huggingFaceSettings() as never,
				"make it red",
				"https://example.com/source.jpg",
			),
			/Image editing is not supported by huggingface model owner\/community-image-model/u,
		);
	});
});
