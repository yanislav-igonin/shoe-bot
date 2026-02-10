import { OpenRouter } from '@openrouter/sdk';
import { config } from 'lib/config.js';

export const openrouter = new OpenRouter({
  apiKey: config.openRouterApiKey,
});
