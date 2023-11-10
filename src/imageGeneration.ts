import { openai } from '@/ai';

// eslint-disable-next-line canonical/id-match
export const base64ToImage = (base64: string) => {
  return Buffer.from(base64, 'base64');
};

export const generateImage = async (text: string) => {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: text,
    response_format: 'b64_json',
    size: '1792x1024',
  });
  return response.data[0].b64_json;
};
