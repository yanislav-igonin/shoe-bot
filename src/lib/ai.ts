import { createXai } from '@ai-sdk/xai';
import { config } from 'lib/config.js';
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: config.openAiApiKey,
});

export const xai = createXai({
  apiKey: config.grokApiKey,
  baseURL: config.grokApiUrl,
});
