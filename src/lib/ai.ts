import { createXai } from '@ai-sdk/xai';
import { config } from 'lib/config.js';
// eslint-disable-next-line import/no-named-as-default
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: config.openAiApiKey,
});

export const xai = createXai({
  apiKey: config.grokApiKey,
  baseURL: config.grokApiUrl,
});
