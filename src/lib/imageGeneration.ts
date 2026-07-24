import { grok } from 'lib/ai.js';
import { database } from 'lib/database.js';

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

export const generateImage = async (text: string) => {
  const response = await grok.images.generate({
    // @ts-expect-error Stupid typings
    aspect_ratio: '16:9',
    model: 'grok-imagine-image-quality',
    prompt: text,
    resolution: '2k',
  });

  return getGeneratedImageUrl(response);
};
