import { isProduction } from './config';
import { openai } from 'ai';

export const imageTriggerRegex = isProduction()
  ? /((ботинок,|shoe,) покажи)(.+)/iu
  : /((бомж,|hobo,) покажи)(.+)/iu;

export const generateImage = async (text: string) => {
  const response = await openai.createImage({ prompt: text, size: '256x256' });
  return response.data.data[0].url;
};
