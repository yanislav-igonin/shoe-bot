import MistralClient from '@mistralai/mistralai';
import { config } from 'lib/config.js';
// eslint-disable-next-line import/no-named-as-default
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: config.openAiApiKey,
});

export const mistral = new MistralClient(config.mistralApiKey);
