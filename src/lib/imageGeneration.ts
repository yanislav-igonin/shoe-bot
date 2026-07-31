import type { XaiImageModelOptions } from "@ai-sdk/xai";
import type { EntityManager } from "@mikro-orm/postgresql";
import { type GeneratedFile, generateImage as generateAiImage } from "ai";
import { xai } from "lib/ai.js";
import { config } from "lib/config.js";
import { Together } from "together-ai";
import { Setting } from "../entities.js";

type ImageProvider = "togetherai" | "xai";

const IMAGE_SETTING_KEYS = ["imageProvider", "imageModel"];
const TOGETHER_REFERENCE_IMAGE_MODELS = new Set([
	"black-forest-labs/FLUX.2-dev",
	"black-forest-labs/FLUX.2-flex",
	"black-forest-labs/FLUX.2-pro",
	"google/flash-image-2.5",
	"google/gemini-3-pro-image",
]);
const TOGETHER_IMAGE_URL_MODELS = new Set([
	"black-forest-labs/FLUX.1-kontext-max",
	"black-forest-labs/FLUX.1-kontext-pro",
]);
const XAI_EDIT_MODEL_REGEXP = /^grok-imagine-image(?:-|$)/u;

type GeneratedImageResponse = {
	data: Array<{
		url?: string | null;
	}>;
};

type SettingRow = {
	key: string;
	value: string;
};

export type ImageGenerationSettings = {
	model: string;
	provider: ImageProvider;
};

export class ImageEditingNotSupportedError extends Error {
	constructor(provider: ImageProvider, model: string) {
		super(`Image editing is not supported by ${provider} model ${model}`);
		this.name = "ImageEditingNotSupportedError";
	}
}

export const requireTogetherApiKey = (apiKey: string | undefined) => {
	if (!apiKey?.trim()) {
		throw new Error("TOGETHER_API_KEY is not set");
	}

	return apiKey;
};

export const parseImageGenerationSettings = (
	rows: SettingRow[],
): ImageGenerationSettings => {
	const provider = rows.find(({ key }) => key === "imageProvider")?.value;
	const model = rows.find(({ key }) => key === "imageModel")?.value;

	if (!provider) {
		throw new Error("imageProvider setting is missing");
	}

	if (model === undefined) {
		throw new Error("imageModel setting is missing");
	}

	if (model.trim() === "") {
		throw new Error("imageModel setting is empty");
	}

	if (provider !== "togetherai" && provider !== "xai") {
		throw new Error(`Unsupported image provider: ${provider}`);
	}

	return { model, provider };
};

export const getGeneratedImageUrl = (response: GeneratedImageResponse) => {
	const imageUrl = response.data[0]?.url;
	if (!imageUrl) {
		return undefined;
	}

	try {
		const url = new URL(imageUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return undefined;
		}

		return imageUrl;
	} catch {
		return undefined;
	}
};

export const getGeneratedImageData = (
	image: Pick<GeneratedFile, "uint8Array">,
) => {
	if (image.uint8Array.length === 0) {
		return undefined;
	}

	return image.uint8Array;
};

export const createXaiImagePrompt = (
	text: string,
	model: string,
	sourceImageUrl: string | undefined,
) => {
	if (!sourceImageUrl) {
		return text;
	}

	if (!XAI_EDIT_MODEL_REGEXP.test(model)) {
		throw new ImageEditingNotSupportedError("xai", model);
	}

	return {
		images: [sourceImageUrl],
		text,
	};
};

export const createTogetherImageInput = (
	model: string,
	sourceImageUrl: string | undefined,
) => {
	if (!sourceImageUrl) {
		return {};
	}

	if (TOGETHER_REFERENCE_IMAGE_MODELS.has(model)) {
		return { reference_images: [sourceImageUrl] };
	}

	if (TOGETHER_IMAGE_URL_MODELS.has(model)) {
		return { image_url: sourceImageUrl };
	}

	throw new ImageEditingNotSupportedError("togetherai", model);
};

const loadImageGenerationSettings = async (em: EntityManager) => {
	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const rows = await em.find(Setting, {
		key: { $in: IMAGE_SETTING_KEYS },
	});

	return parseImageGenerationSettings(rows);
};

const generateWithXai = async (
	text: string,
	model: string,
	sourceImageUrl: string | undefined,
) => {
	const { image } = await generateAiImage({
		...(sourceImageUrl ? {} : { aspectRatio: "16:9" as const }),
		model: xai.image(model),
		prompt: createXaiImagePrompt(text, model, sourceImageUrl),
		providerOptions: {
			xai: {
				resolution: "1k",
			} satisfies XaiImageModelOptions,
		},
	});

	return getGeneratedImageData(image);
};

const generateWithTogether = async (
	text: string,
	model: string,
	sourceImageUrl: string | undefined,
) => {
	const apiKey = requireTogetherApiKey(config.togetherApiKey);
	const together = new Together({ apiKey });
	const response = await together.images.generate({
		...createTogetherImageInput(model, sourceImageUrl),
		disable_safety_checker: true,
		height: 768,
		model,
		prompt: text,
		width: 1_344,
	});

	return getGeneratedImageUrl(response);
};

export const generateImage = async (
	em: EntityManager,
	text: string,
	sourceImageUrl?: string,
) => {
	const { model, provider } = await loadImageGenerationSettings(em);

	switch (provider) {
		case "togetherai":
			return await generateWithTogether(text, model, sourceImageUrl);
		case "xai":
			return await generateWithXai(text, model, sourceImageUrl);
		default:
			throw new Error(`Unsupported image provider: ${String(provider)}`);
	}
};
