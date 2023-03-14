import { openai } from '@/ai';
import { isProduction } from '@/config';

export const imageTriggerRegexp = isProduction()
  ? /((граф ботинок,|shoe,) )(.+)/iu
  : /((граф бомж,|hobo,) )(.+)/iu;

// eslint-disable-next-line canonical/id-match
export const base64ToImage = (base64: string) => {
  return Buffer.from(base64, 'base64');
};

export const generateImage = async (text: string) => {
  const response = await openai.createImage({
    prompt: text,
    response_format: 'b64_json',
    size: '256x256',
  });
  return response.data.data[0].b64_json;
};
