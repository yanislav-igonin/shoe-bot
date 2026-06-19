import { grok } from 'lib/ai.js';

type GeneratedImageResponse = {
  data: Array<{
    url?: string | null;
  }>;
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
