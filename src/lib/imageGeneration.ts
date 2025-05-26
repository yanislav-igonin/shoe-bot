import { openai } from 'lib/ai.js';

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

export const editImage = async (
  image: Buffer,
  prompt: string,
  mask?: Buffer,
) => {
  // The OpenAI API expects a file, so we need to prepare it in a way the library understands.
  // The `openai-node` library can handle `File` objects or `Uploadable` types like a ReadStream or a { file: Buffer, name: string } object.
  // For simplicity, we'll use the { file: Buffer, name: string } approach.
  const imageFile = { file: image, name: 'image.png' };
  const maskFile = mask ? { file: mask, name: 'mask.png' } : undefined;

  const response = await openai.images.createVariation({
    image: imageFile,
    mask: maskFile,
    // You might want to adjust the model, n, and size as needed.
    // DALL-E 2 is used for edits.
    model: 'dall-e-2',

    n: 1,

    prompt,
    // Pass undefined if no mask is provided
    response_format: 'b64_json',
    size: '1024x1024',
  });
  return response.data[0].b64_json;
};
