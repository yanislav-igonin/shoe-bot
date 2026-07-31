import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.BOT_TOKEN = "test";
process.env.GROK_API_KEY = "test";
process.env.OPENAI_API_KEY = "test";

const { ImageEditingNotSupportedError } = await import(
	"../lib/imageGeneration.js"
);
const { replies } = await import("../lib/replies.js");
const {
	downloadImageAsDataUrl,
	getImageGenerationErrorReply,
	isImageEditReply,
} = await import("./text.controller.js");

describe("isImageEditReply", () => {
	it("routes a direct image reply to image editing", () => {
		assert.equal(isImageEditReply({ tgPhotoId: "telegram-photo-id" }), true);
	});

	it("keeps a direct text reply in the text conversation flow", () => {
		assert.equal(isImageEditReply({ tgPhotoId: null }), false);
	});
});

describe("downloadImageAsDataUrl", () => {
	it("keeps the source URL secret out of the provider input", async () => {
		const sourceUrl =
			"https://api.telegram.org/file/botsecret-token/photos/source.jpg";

		const result = await downloadImageAsDataUrl(sourceUrl, async () => {
			return new Response(new Uint8Array([1, 2, 3]), {
				headers: { "content-type": "image/jpeg" },
				status: 200,
			});
		});

		assert.equal(result, "data:image/jpeg;base64,AQID");
		assert.equal(result.includes("secret-token"), false);
	});
});

describe("getImageGenerationErrorReply", () => {
	it("returns the dedicated reply for unsupported edit models", () => {
		const error = new ImageEditingNotSupportedError(
			"togetherai",
			"black-forest-labs/FLUX.1-schnell",
		);

		assert.equal(
			getImageGenerationErrorReply(error),
			replies.imageEditingNotSupported,
		);
	});

	it("keeps the generic reply for other generation failures", () => {
		assert.equal(
			getImageGenerationErrorReply(new Error("failed")),
			replies.error,
		);
	});
});
