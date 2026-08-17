import { valueOrDefault, valueOrThrow } from "./values.js";

export const config = {
	adminsUsernames: valueOrDefault(process.env.ADMINS_USERNAMES?.split(","), []),
	botId: 0,
	botToken: valueOrThrow(process.env.BOT_TOKEN, "BOT_TOKEN is not set"),
	env: valueOrDefault(process.env.ENV, "development"),
	grokApiKey: valueOrThrow(process.env.GROK_API_KEY, "GROK_API_KEY is not set"),
	grokApiUrl: "https://api.x.ai/v1",
	hfInferenceEndpointNamespace: process.env.HF_INFERENCE_ENDPOINT_NAMESPACE,
	hfInferenceEndpointUrl: process.env.HF_INFERENCE_ENDPOINT_URL,
	hfTextInferenceEndpointName: process.env.HF_TEXT_INFERENCE_ENDPOINT_NAME,
	hfTextInferenceEndpointUrl: process.env.HF_TEXT_INFERENCE_ENDPOINT_URL,
	hfToken: process.env.HF_TOKEN,
	openAiApiKey: valueOrThrow(
		process.env.OPENAI_API_KEY,
		"OPENAI_API_KEY is not set",
	),
	openRouterApiKey: process.env.OPENROUTER_API_KEY,
	togetherApiKey: process.env.TOGETHER_API_KEY,
};

export const isProduction = config.env === "production";
