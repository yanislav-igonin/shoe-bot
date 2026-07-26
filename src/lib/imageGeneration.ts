import { grok } from 'lib/ai.js';
import { config } from 'lib/config.js';
import { database } from 'lib/database.js';
import { Together } from 'together-ai';

type ImageProvider = 'togetherai' | 'xai';

const IMAGE_SETTING_KEYS = ['imageProvider', 'imageModel'];

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

export const requireTogetherApiKey = (apiKey: string | undefined) => {
  if (!apiKey?.trim()) {
    throw new Error('TOGETHER_API_KEY is not set');
  }

  return apiKey;
};

export const parseImageGenerationSettings = (
  rows: SettingRow[],
): ImageGenerationSettings => {
  const provider = rows.find(({ key }) => key === 'imageProvider')?.value;
  const model = rows.find(({ key }) => key === 'imageModel')?.value;

  if (!provider) {
    throw new Error('imageProvider setting is missing');
  }

  if (model === undefined) {
    throw new Error('imageModel setting is missing');
  }

  if (model.trim() === '') {
    throw new Error('imageModel setting is empty');
  }

  if (provider !== 'togetherai' && provider !== 'xai') {
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
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    return imageUrl;
  } catch {
    return undefined;
  }
};

const loadImageGenerationSettings = async () => {
  const rows = await database.setting.findMany({
    where: { key: { in: IMAGE_SETTING_KEYS } },
  });

  return parseImageGenerationSettings(rows);
};

const generateWithXai = async (text: string, model: string) => {
  const response = await grok.images.generate({
    // @ts-expect-error xAI image parameters are not in OpenAI SDK types
    aspect_ratio: '16:9',
    model,
    prompt: text,
    resolution: '2k',
  });

  return getGeneratedImageUrl(response);
};

const generateWithTogether = async (text: string, model: string) => {
  const apiKey = requireTogetherApiKey(config.togetherApiKey);
  const together = new Together({ apiKey });
  const response = await together.images.generate({
    disable_safety_checker: true,
    height: 768,
    model,
    prompt: text,
    width: 1_344,
  });

  return getGeneratedImageUrl(response);
};

export const generateImage = async (text: string) => {
  const { model, provider } = await loadImageGenerationSettings();

  switch (provider) {
    case 'togetherai':
      return await generateWithTogether(text, model);
    case 'xai':
      return await generateWithXai(text, model);
    default:
      throw new Error(`Unsupported image provider: ${String(provider)}`);
  }
};
