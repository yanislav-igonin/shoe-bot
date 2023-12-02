import { config } from '@/config';
// eslint-disable-next-line import/no-named-as-default
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: config.openAiApiKey,
});
