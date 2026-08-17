import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EntityManager } from "@mikro-orm/postgresql";
import { generateText, Output, type Prompt } from "ai";
import { xai } from "lib/ai.js";
import { config, isProduction } from "lib/config.js";
import {
	createHuggingFaceEndpointLifecycle,
	type HuggingFaceEndpointManagementConfig,
} from "lib/huggingFaceEndpointLifecycle.js";
import {
	type ResolvedHuggingFaceTextEndpoint,
	reconcileHuggingFaceTextEndpoint,
} from "lib/huggingFaceTextEndpoint.js";
import { logger } from "lib/logger.js";
import { replies } from "lib/replies.js";
import { type Message, MessageType, Setting } from "../entities.js";

type ChatCompletionRequestMessage = NonNullable<Prompt["messages"]>[number];
type TextGenerator = (
	options: Parameters<typeof generateText>[0],
) => Promise<{ text: string }>;

type SettingRow = {
	key: string;
	value: string;
};

type TextProvider = "huggingface" | "openrouter" | "togetherai" | "xai";

type HuggingFaceColdStartFetchOptions = {
	maxWaitMs?: number;
	now?: () => number;
	retryDelayMs?: number;
};

type TextGenerationLifecycle = {
	run: <T>(
		managementConfig: HuggingFaceEndpointManagementConfig,
		task: () => Promise<T>,
	) => Promise<T>;
};

type HuggingFaceTextEndpointResolver = (
	em: EntityManager,
) => Promise<ResolvedHuggingFaceTextEndpoint | undefined>;

const TEXT_SETTING_KEYS = ["textProvider", "textModel"];
const HUGGING_FACE_COLD_START_MAX_WAIT_MS = 10 * 60_000;
const HUGGING_FACE_COLD_START_RETRY_DELAY_MS = 5_000;
const HUGGING_FACE_SCALE_UP_TIMEOUT_SECONDS = 600;
const HUGGING_FACE_COLD_START_STATUS_CODES = new Set([502, 503]);

export type TextGenerationSettings = {
	model: string;
	provider: TextProvider;
};

export const parseTextGenerationSettings = (
	rows: SettingRow[],
): TextGenerationSettings => {
	const provider = rows.find(({ key }) => key === "textProvider")?.value;
	const model = rows.find(({ key }) => key === "textModel")?.value;

	if (!provider) {
		throw new Error("textProvider setting is missing");
	}

	if (model === undefined) {
		throw new Error("textModel setting is missing");
	}

	if (model.trim() === "") {
		throw new Error("textModel setting is empty");
	}

	if (
		provider !== "huggingface" &&
		provider !== "openrouter" &&
		provider !== "togetherai" &&
		provider !== "xai"
	) {
		throw new Error(`Unsupported text provider: ${provider}`);
	}

	return { model, provider };
};

export const requireProviderApiKey = (
	apiKey: string | undefined,
	variableName: string,
) => {
	if (!apiKey?.trim()) {
		throw new Error(`${variableName} is not set`);
	}

	return apiKey;
};

export const requireHuggingFaceTextEndpointUrl = (
	endpointUrl: string | undefined,
) => {
	const normalizedEndpointUrl = endpointUrl?.trim().replace(/\/+$/u, "");
	if (!normalizedEndpointUrl) {
		throw new Error("hfTextInferenceEndpointUrl setting is not set");
	}

	try {
		const url = new URL(normalizedEndpointUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("unsupported protocol");
		}
	} catch {
		throw new Error(
			"hfTextInferenceEndpointUrl setting must be a valid HTTP(S) URL",
		);
	}

	return normalizedEndpointUrl.endsWith("/v1")
		? normalizedEndpointUrl
		: `${normalizedEndpointUrl}/v1`;
};

const sleep = async (milliseconds: number) => {
	await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

export const createHuggingFaceColdStartFetch = (
	baseFetch: typeof fetch = globalThis.fetch,
	options: HuggingFaceColdStartFetchOptions = {},
) => {
	const maxWaitMs = options.maxWaitMs ?? HUGGING_FACE_COLD_START_MAX_WAIT_MS;
	const now = options.now ?? Date.now;
	const retryDelayMs =
		options.retryDelayMs ?? HUGGING_FACE_COLD_START_RETRY_DELAY_MS;

	return (async (input, init) => {
		const request = new Request(input, init);
		const headers = new Headers(request.headers);
		headers.set(
			"X-Scale-Up-Timeout",
			String(HUGGING_FACE_SCALE_UP_TIMEOUT_SECONDS),
		);
		const requestWithScaleUpTimeout = new Request(request, { headers });
		const startedAt = now();

		while (true) {
			const response = await baseFetch(requestWithScaleUpTimeout.clone());
			if (
				!HUGGING_FACE_COLD_START_STATUS_CODES.has(response.status) ||
				now() - startedAt >= maxWaitMs
			) {
				return response;
			}

			if (retryDelayMs > 0) {
				await sleep(retryDelayMs);
			}
		}
	}) as typeof fetch;
};

const huggingFaceTextEndpointLifecycle = createHuggingFaceEndpointLifecycle({
	onScaleError: (error) =>
		logger.error("Failed to scale Hugging Face text endpoint to zero:", error),
});

export const resolveTextModel = <T>(
	settings: TextGenerationSettings,
	factories: Record<TextProvider, (model: string) => T>,
) => factories[settings.provider](settings.model);

const loadTextGenerationSettings = async (em: EntityManager) => {
	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const rows = await em.find(Setting, {
		key: { $in: TEXT_SETTING_KEYS },
	});

	return parseTextGenerationSettings(rows);
};

const getConfiguredTextModel = (
	settings: TextGenerationSettings,
	huggingFaceEndpointUrl?: string,
) =>
	resolveTextModel(settings, {
		huggingface: () =>
			createOpenAICompatible({
				apiKey: requireProviderApiKey(config.hfToken, "HF_TOKEN"),
				baseURL: requireHuggingFaceTextEndpointUrl(huggingFaceEndpointUrl),
				fetch: createHuggingFaceColdStartFetch(),
				name: "huggingface",
			})(settings.model),
		openrouter: (model) =>
			createOpenAICompatible({
				apiKey: requireProviderApiKey(
					config.openRouterApiKey,
					"OPENROUTER_API_KEY",
				),
				baseURL: "https://openrouter.ai/api/v1",
				name: "openrouter",
			})(model),
		togetherai: (model) =>
			createOpenAICompatible({
				apiKey: requireProviderApiKey(
					config.togetherApiKey,
					"TOGETHER_API_KEY",
				),
				baseURL: "https://api.together.ai/v1",
				name: "togetherai",
			})(model),
		xai,
	});

enum ContextRole {
	Assistant = "assistant",
	System = "system",
	User = "user",
}

export enum Model {
	Grok3Mini = "grok-3-mini",
}

const chunkMessage = (message: string) => {
	const MAX_LENGTH = 4_000;
	const chunks = [];
	for (let index = 0; index < message.length; index += MAX_LENGTH) {
		chunks.push(message.slice(index, index + MAX_LENGTH));
	}

	return chunks;
};

export const textTriggerRegexp = isProduction
	? /^((ботинок,|shoe,|блинное,) )(.+)/isu
	: /^((бомж,|hobo,) )(.+)/isu;
const answerToReplyTriggerRegexp = isProduction
	? /^((ответь ботинок,|answer shoe,) )(.+)/isu
	: /^((ответь бомж,|answer hobo,) )(.+)/isu;
export const getAnswerToReplyMatches = (text: string) =>
	answerToReplyTriggerRegexp.exec(text);

export const markdownRulesPrompt =
	`Text should be formatted in Markdown. ` +
	`You can use ONLY the following formatting without any exceptions:` +
	`**bold text**, *italic text*, ~~strikethrough~~.`;

export const maximumMessageLengthPrompt = `Response should not exceed 4096 characters.`;

export const addSystemContext = (
	text: string,
): ChatCompletionRequestMessage => {
	return {
		content: text,
		role: "system",
	};
};

export const normalizeHuggingFaceMessages = (
	messages: ChatCompletionRequestMessage[],
): ChatCompletionRequestMessage[] => {
	const systemMessages = messages.filter(({ role }) => role === "system");
	if (systemMessages.length === 0) {
		return messages;
	}

	const systemContents = systemMessages.map(({ content }) => {
		if (typeof content !== "string") {
			throw new Error("Hugging Face system messages must contain text only");
		}
		return content;
	});

	return [
		{
			content: systemContents.join("\n\n"),
			role: "system",
		},
		...messages.filter(({ role }) => role !== "system"),
	];
};

export const addAssistantContext = (
	message: Message | string,
	imagesMap: Record<number, string> = {},
): ChatCompletionRequestMessage => {
	if (typeof message === "string") {
		return {
			content: message,
			role: ContextRole.Assistant,
		};
	}

	if (message.text && message.tgPhotoId) {
		return {
			content: [
				{ text: message.text, type: "text" },
				{
					data: new URL(imagesMap[message.id]),
					mediaType: "image",
					type: "file",
				},
			],
			role: ContextRole.Assistant,
		};
	}

	if (message.tgPhotoId) {
		return {
			content: [
				{
					data: new URL(imagesMap[message.id]),
					mediaType: "image",
					type: "file",
				},
			],
			role: ContextRole.Assistant,
		};
	}

	return {
		content: message.text ?? "",
		role: ContextRole.Assistant,
	};
};

export const addUserContext = (
	message: Message | string,
	imagesMap: Record<number, string> = {},
): ChatCompletionRequestMessage => {
	if (typeof message === "string") {
		return {
			content: message,
			role: ContextRole.User,
		};
	}

	if (message.text && message.tgPhotoId) {
		return {
			content: [
				{ text: message.text, type: "text" },
				{
					image: new URL(imagesMap[message.id]),
					type: "image",
				},
			],
			role: ContextRole.User,
		};
	}

	if (message.tgPhotoId) {
		return {
			content: [
				{
					image: new URL(imagesMap[message.id]),
					type: "image",
				},
			],
			role: ContextRole.User,
		};
	}

	return {
		content: message.text ?? "",
		role: ContextRole.User,
	};
};

const addUserContextWithImages = (
	message: Message | string,
	imageUrls: string[],
): ChatCompletionRequestMessage => {
	const text = typeof message === "string" ? message : message.text;
	return {
		content: [
			...(text ? [{ text, type: "text" as const }] : []),
			...imageUrls.map((image) => ({
				image: new URL(image),
				type: "image" as const,
			})),
		],
		role: ContextRole.User,
	};
};

export const addContext =
	(imagesMap: Record<number, string>) => (message: Message) => {
		if (message.user.id === config.botId) {
			return addAssistantContext(message, imagesMap);
		}

		return addUserContext(message, imagesMap);
	};

export const getCompletion = async (
	em: EntityManager,
	message: Message | string,
	context: ChatCompletionRequestMessage[] = [],
	imagesMap: Record<number, string> = {},
	currentImageUrls: string[] = [],
	generate: TextGenerator = generateText,
	huggingFaceLifecycle: TextGenerationLifecycle = huggingFaceTextEndpointLifecycle,
	resolveHuggingFaceEndpoint: HuggingFaceTextEndpointResolver = reconcileHuggingFaceTextEndpoint,
) => {
	const settings = await loadTextGenerationSettings(em);
	const userMessage =
		currentImageUrls.length > 0
			? addUserContextWithImages(message, currentImageUrls)
			: addUserContext(message, imagesMap);

	try {
		const resolvedHuggingFaceEndpoint =
			settings.provider === "huggingface"
				? await resolveHuggingFaceEndpoint(em)
				: undefined;
		if (settings.provider === "huggingface" && !resolvedHuggingFaceEndpoint) {
			throw new Error(
				"Hugging Face text endpoint reconciliation returned no endpoint",
			);
		}

		const rawMessages = [...context, userMessage];
		const messages =
			settings.provider === "huggingface"
				? normalizeHuggingFaceMessages(rawMessages)
				: rawMessages;
		const generateCompletion = () =>
			generate({
				allowSystemInMessages: true,
				messages,
				model: getConfiguredTextModel(
					settings,
					resolvedHuggingFaceEndpoint?.endpointUrl,
				),
			});
		const completion = resolvedHuggingFaceEndpoint
			? await huggingFaceLifecycle.run(
					resolvedHuggingFaceEndpoint.managementConfig,
					generateCompletion,
				)
			: await generateCompletion();
		const result = completion.text.trim() || replies.noAnswer;
		return chunkMessage(result);
	} catch (error) {
		logger.error(
			`Text completion failed for ${settings.provider}/${settings.model}:`,
			error,
		);
		throw error;
	}
};

const cleanPrompt = (text: string) => {
	return text.trim();
};

export const preparePrompt = (text: string) => {
	return cleanPrompt(text);
};

export const getShictureStyle = () => {
	const styles = [
		'картины "Сатурн, пожирающий своего сына"',
		'картины "Данте и Вергилий в аду"',
		'картины "Gallowgate Lard"',
		'картины "Проигрыш разума перед материей"',
		'картины "Руки противятся ему"',
		'картины "Крик"',
		"Хаяо Миядзаки",
		"Лавкрафта",
		"киберпанка",
		"соларпанка",
		"советского плаката",
		"дизельпанка",
		"стимпанка",
		"Дзюндзи Ито",
		"обложки игры Doom",
		"манги Berserk",
		"манги JoJo",
		'картины "Последний день Помпеи"',
		"работ Ганса Рудольфа Гигера",
		"древнеегипетской фрески",
	];
	const randomIndex = Math.floor(Math.random() * styles.length);
	return styles[randomIndex];
};

export const getShictureDescription = async (em: EntityManager) => {
	const prompt =
		"Придумай очень короткое интересное задание для художника." +
		"Описание может содержать реальных существовавших людей, персонажей фильмов, кино, аниме, сериалов." +
		"Количество персонажей (если они присутствуют) не должно превышать 3." +
		"Будь креативен, но не зацикливайся на кошках, часах, Шерлоке Холмсе и Гарри Поттере." +
		"Придумывай часто жуткие, мерзкие и пугающие описания." +
		'Например: "нарисуй деда мороза пожирающего санта клауса в стиле картины "сатурн пожирающий своего сына".' +
		'Результат должен содержать только формулировку, а в конце добавить " в стиле ",' +
		"но сам стиль не добавлять, я добавлю его после сам, например: " +
		"Нарисуй картину с большими в стиле ";
	let description = (await getCompletion(em, prompt))[0];
	const lastFewCharacters = description.slice(-3);

	// Remove trailing dot
	if (lastFewCharacters.includes(".")) {
		const dotIndex = description.lastIndexOf(".");
		description = description.slice(0, dotIndex);
	}

	// Add style if not present
	if (!description.includes("в стиле")) {
		description += " в стиле ";
	}

	const withStyle = `${description} ${getShictureStyle()}`;
	return withStyle;
};

const chooseTaskPrompt =
	"Твоя задача определить, что хочет сделать пользователь." +
	"Если пользователь просить рассказать что-то, или что-то спрашивает - это значит, " +
	"что надо что-то сделать в текстовом формате." +
	"Также пользователь может попросить создать картинку, фото, нарисовать что-то." +
	"Список задач:\n" +
	"* text - пользователь просит сделать что-то в текстовом формате\n" +
	"* image - пользователь просит сделать что-то в формате картинки\n";

type Task = MessageType.image | MessageType.text;

const classifyTask = async (text: string): Promise<Task> => {
	const chooseTaskMessage = addSystemContext(chooseTaskPrompt);
	const userMessage = addUserContext(text);
	const { output } = await generateText({
		allowSystemInMessages: true,
		messages: [chooseTaskMessage, userMessage],
		model: xai(Model.Grok3Mini),
		output: Output.choice({
			options: [MessageType.text, MessageType.image] as const,
		}),
	});
	return output;
};

/**
 * Choose task that user wants to do.
 *
 * @param text User input.
 * @returns Task type.
 */
export const chooseTask = async (
	text: string,
	classifier: (text: string) => Promise<Task> = classifyTask,
): Promise<Task> => {
	try {
		return await classifier(text);
	} catch (error) {
		logger.error("Prompt: ChooseTask: Classification failed:", error);
		return MessageType.text;
	}
};
