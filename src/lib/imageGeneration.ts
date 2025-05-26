import { grok } from 'lib/ai.js';

// eslint-disable-next-line canonical/id-match
export const base64ToImage = (base64: string) => {
  return Buffer.from(base64, 'base64');
};

export const generateImage = async (text: string) => {
  const response = await grok.images.generate({
    model: 'grok-2-image',
    prompt: text,
    response_format: 'b64_json',
    // size: '1792x1024',
  });
  return response.data[0].b64_json;
};
