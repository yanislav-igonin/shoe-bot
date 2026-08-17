import { Buffer } from "node:buffer";
import type { XaiImageModelOptions } from "@ai-sdk/xai";
import type { EntityManager } from "@mikro-orm/postgresql";
import { type GeneratedFile, generateImage as generateAiImage } from "ai";
import { openai, xai } from "lib/ai.js";
import { config } from "lib/config.js";
import { toFile } from "openai";
import { Together } from "together-ai";
import { Setting } from "../entities.js";

type ImageProvider = "huggingface" | "openai" | "togetherai" | "xai";

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
	data?: Array<{
		b64_json?: string | null;
		url?: string | null;
	}>;
};

type HuggingFaceImageResponse = GeneratedImageResponse & {
	b64_json?: string | null;
	url?: string | null;
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

export class ImageModerationRejectedError extends Error {
	constructor() {
		super("OpenAI image input was rejected by moderation");
		this.name = "ImageModerationRejectedError";
	}
}

export const requireTogetherApiKey = (apiKey: string | undefined) => {
	if (!apiKey?.trim()) {
		throw new Error("TOGETHER_API_KEY is not set");
	}

	return apiKey;
};

export const requireHuggingFaceConfig = (
	token: string | undefined,
	endpointUrl: string | undefined,
) => {
	const normalizedToken = token?.trim();
	if (!normalizedToken) {
		throw new Error("HF_TOKEN is not set");
	}

	const normalizedEndpointUrl = endpointUrl?.trim();
	if (!normalizedEndpointUrl) {
		throw new Error("HF_INFERENCE_ENDPOINT_URL is not set");
	}

	try {
		const url = new URL(normalizedEndpointUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("unsupported protocol");
		}
	} catch {
		throw new Error("HF_INFERENCE_ENDPOINT_URL must be a valid HTTP(S) URL");
	}

	return {
		endpointUrl: normalizedEndpointUrl,
		token: normalizedToken,
	};
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

	if (
		provider !== "huggingface" &&
		provider !== "openai" &&
		provider !== "togetherai" &&
		provider !== "xai"
	) {
		throw new Error(`Unsupported image provider: ${provider}`);
	}

	return { model, provider };
};

export const getGeneratedImageUrl = (response: GeneratedImageResponse) => {
	const imageUrl = response.data?.[0]?.url;
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

export const getGeneratedImageBase64Data = (
	response: GeneratedImageResponse,
) => {
	const imageBase64 = response.data?.[0]?.b64_json;
	if (!imageBase64) {
		return undefined;
	}

	const imageData = Buffer.from(imageBase64, "base64");
	return imageData.length > 0 ? imageData : undefined;
};

const getHuggingFaceImageUrl = (response: HuggingFaceImageResponse) =>
	getGeneratedImageUrl({
		data: [{ url: response.url ?? response.data?.[0]?.url }],
	});

const getHuggingFaceImageBase64Data = (response: HuggingFaceImageResponse) =>
	getGeneratedImageBase64Data({
		data: [{ b64_json: response.b64_json ?? response.data?.[0]?.b64_json }],
	});

export const createOpenAiImageFile = async (sourceImageUrl: string) => {
	const response = await fetch(sourceImageUrl);
	if (!response.ok) {
		throw new Error(`Failed to load OpenAI source image: ${response.status}`);
	}

	const mediaType = response.headers
		.get("content-type")
		?.split(";", 1)[0]
		.trim();
	let extension: string;
	switch (mediaType) {
		case "image/jpeg":
			extension = "jpg";
			break;
		case "image/png":
			extension = "png";
			break;
		case "image/webp":
			extension = "webp";
			break;
		default:
			throw new Error("OpenAI source image must be a PNG, JPEG, or WebP");
	}

	return await toFile(await response.arrayBuffer(), `source.${extension}`, {
		type: mediaType,
	});
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

const isOpenAiModerationBlockedError = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error as { code?: unknown }).code === "moderation_blocked";

const generateWithOpenAi = async (
	text: string,
	model: string,
	sourceImageUrl: string | undefined,
) => {
	let response: GeneratedImageResponse;
	try {
		response = sourceImageUrl
			? await openai.images.edit({
					image: await createOpenAiImageFile(sourceImageUrl),
					model,
					prompt: text,
					size: "1536x1024",
				})
			: await openai.images.generate({
					model,
					prompt: text,
					size: "1536x1024",
				});
	} catch (error) {
		if (isOpenAiModerationBlockedError(error)) {
			throw new ImageModerationRejectedError();
		}
		throw error;
	}

	return getGeneratedImageBase64Data(response);
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

const generateWithHuggingFace = async (
	text: string,
	model: string,
	sourceImageUrl: string | undefined,
) => {
	if (sourceImageUrl) {
		throw new ImageEditingNotSupportedError("huggingface", model);
	}

	const { endpointUrl, token } = requireHuggingFaceConfig(
		config.hfToken,
		config.hfInferenceEndpointUrl,
	);
	const response = await fetch(endpointUrl, {
		body: JSON.stringify({ inputs: text }),
		headers: {
			Accept: "image/*, application/json",
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		method: "POST",
	});

	if (!response.ok) {
		const body = (await response.text()).trim();
		throw new Error(
			`Hugging Face inference endpoint returned ${response.status}${body ? `: ${body}` : ""}`,
		);
	}

	const contentType = response.headers
		.get("content-type")
		?.split(";", 1)[0]
		.trim()
		.toLowerCase();
	if (
		contentType?.startsWith("image/") ||
		contentType === "application/octet-stream"
	) {
		const imageData = Buffer.from(await response.arrayBuffer());
		if (imageData.length === 0) {
			throw new Error(
				"Hugging Face inference endpoint returned an empty image",
			);
		}
		return imageData;
	}

	let json: HuggingFaceImageResponse;
	try {
		json = (await response.json()) as HuggingFaceImageResponse;
	} catch {
		throw new Error(
			`Hugging Face inference endpoint returned unsupported content type: ${contentType ?? "unknown"}`,
		);
	}

	const imageUrl = getHuggingFaceImageUrl(json);
	if (imageUrl) {
		return imageUrl;
	}

	const imageData = getHuggingFaceImageBase64Data(json);
	if (imageData) {
		return imageData;
	}

	throw new Error("Hugging Face inference endpoint returned no image data");
};

export const generateImage = async (
	em: EntityManager,
	text: string,
	sourceImageUrl?: string,
) => {
	const { model, provider } = await loadImageGenerationSettings(em);

	switch (provider) {
		case "huggingface":
			return await generateWithHuggingFace(text, model, sourceImageUrl);
		case "openai":
			return await generateWithOpenAi(text, model, sourceImageUrl);
		case "togetherai":
			return await generateWithTogether(text, model, sourceImageUrl);
		case "xai":
			return await generateWithXai(text, model, sourceImageUrl);
		default:
			throw new Error(`Unsupported image provider: ${String(provider)}`);
	}
};
