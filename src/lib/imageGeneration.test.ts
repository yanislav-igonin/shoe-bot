import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";
process.env.TOGETHER_API_KEY = "test";

const imageGeneration = await import("lib/imageGeneration.js");
const {
	createTogetherImageInput,
	createXaiImagePrompt,
	getGeneratedImageData,
	getGeneratedImageUrl,
	parseImageGenerationSettings,
	requireTogetherApiKey,
} = imageGeneration;

describe("requireTogetherApiKey", () => {
	it("returns a configured key", () => {
		assert.equal(requireTogetherApiKey("test-key"), "test-key");
	});

	it("rejects a missing key", () => {
		assert.throws(
			() => requireTogetherApiKey(undefined),
			/TOGETHER_API_KEY is not set/u,
		);
	});

	it("rejects an empty key", () => {
		assert.throws(
			() => requireTogetherApiKey(""),
			/TOGETHER_API_KEY is not set/u,
		);
	});

	it("rejects a whitespace-only key", () => {
		assert.throws(
			() => requireTogetherApiKey("   "),
			/TOGETHER_API_KEY is not set/u,
		);
	});
});

describe("parseImageGenerationSettings", () => {
	it("parses Together settings", () => {
		assert.deepEqual(
			parseImageGenerationSettings([
				{ key: "imageProvider", value: "togetherai" },
				{
					key: "imageModel",
					value: "black-forest-labs/FLUX.2-dev",
				},
			]),
			{
				model: "black-forest-labs/FLUX.2-dev",
				provider: "togetherai",
			},
		);
	});

	it("parses xAI settings", () => {
		assert.deepEqual(
			parseImageGenerationSettings([
				{ key: "imageProvider", value: "xai" },
				{ key: "imageModel", value: "grok-imagine-image-quality" },
			]),
			{
				model: "grok-imagine-image-quality",
				provider: "xai",
			},
		);
	});

	it("rejects a missing image provider", () => {
		assert.throws(
			() =>
				parseImageGenerationSettings([{ key: "imageModel", value: "model" }]),
			/imageProvider setting is missing/u,
		);
	});

	it("rejects a missing image model", () => {
		assert.throws(
			() =>
				parseImageGenerationSettings([
					{ key: "imageProvider", value: "togetherai" },
				]),
			/imageModel setting is missing/u,
		);
	});

	it("rejects an empty image model", () => {
		assert.throws(
			() =>
				parseImageGenerationSettings([
					{ key: "imageProvider", value: "togetherai" },
					{ key: "imageModel", value: "   " },
				]),
			/imageModel setting is empty/u,
		);
	});

	it("rejects an unsupported image provider", () => {
		assert.throws(
			() =>
				parseImageGenerationSettings([
					{ key: "imageProvider", value: "unknown" },
					{ key: "imageModel", value: "model" },
				]),
			/Unsupported image provider: unknown/u,
		);
	});
});

describe("getGeneratedImageUrl", () => {
	it("returns first generated image URL", () => {
		const imageUrl = getGeneratedImageUrl({
			data: [{ url: "https://example.com/image.png" }],
		});

		assert.equal(imageUrl, "https://example.com/image.png");
	});

	it("returns undefined when response does not contain URL", () => {
		const imageUrl = getGeneratedImageUrl({ data: [{}] });

		assert.equal(imageUrl, undefined);
	});

	it("returns undefined when response URL is invalid", () => {
		const imageUrl = getGeneratedImageUrl({ data: [{ url: "not-a-url" }] });

		assert.equal(imageUrl, undefined);
	});
});

describe("getGeneratedImageData", () => {
	it("returns generated image bytes", () => {
		const bytes = new Uint8Array([1, 2, 3]);

		assert.deepEqual(getGeneratedImageData({ uint8Array: bytes }), bytes);
	});

	it("returns undefined for an empty generated image", () => {
		assert.equal(
			getGeneratedImageData({ uint8Array: new Uint8Array() }),
			undefined,
		);
	});
});

describe("createXaiImagePrompt", () => {
	it("keeps text-only generation prompts unchanged", () => {
		assert.equal(
			createXaiImagePrompt(
				"draw a shoe",
				"grok-imagine-image-quality",
				undefined,
			),
			"draw a shoe",
		);
	});

	it("adds the source image to native edit prompts", () => {
		assert.deepEqual(
			createXaiImagePrompt(
				"make it red",
				"grok-imagine-image-quality",
				"https://example.com/source.jpg",
			),
			{
				images: ["https://example.com/source.jpg"],
				text: "make it red",
			},
		);
	});

	it("rejects edits for an unsupported xAI model", () => {
		assert.throws(
			() =>
				createXaiImagePrompt(
					"make it red",
					"grok-2-image",
					"https://example.com/source.jpg",
				),
			/Image editing is not supported by xai model grok-2-image/u,
		);
	});
});

describe("createTogetherImageInput", () => {
	it("uses reference_images for FLUX.2 edits", () => {
		assert.deepEqual(
			createTogetherImageInput(
				"black-forest-labs/FLUX.2-dev",
				"https://example.com/source.jpg",
			),
			{ reference_images: ["https://example.com/source.jpg"] },
		);
	});

	it("uses image_url for FLUX.1 Kontext edits", () => {
		assert.deepEqual(
			createTogetherImageInput(
				"black-forest-labs/FLUX.1-kontext-pro",
				"https://example.com/source.jpg",
			),
			{ image_url: "https://example.com/source.jpg" },
		);
	});

	it("does not add image parameters to text-only generation", () => {
		assert.deepEqual(
			createTogetherImageInput("black-forest-labs/FLUX.1-schnell", undefined),
			{},
		);
	});

	it("rejects edits for an unsupported Together model", () => {
		assert.throws(
			() =>
				createTogetherImageInput(
					"black-forest-labs/FLUX.1-schnell",
					"https://example.com/source.jpg",
				),
			/Image editing is not supported by togetherai model black-forest-labs\/FLUX\.1-schnell/u,
		);
	});
});
