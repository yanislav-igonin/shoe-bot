import { openai } from 'ai';

export const generateImage = async (text: string) => {
  const response = await openai.createImage({ prompt: text, size: '256x256' });
  return response.data.data[0].url;
};
