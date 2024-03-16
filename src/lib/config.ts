import { valueOrDefault, valueOrThrow } from './values.js';

/* eslint-disable node/no-process-env */
export const config = {
  adminsUsernames: valueOrDefault(process.env.ADMINS_USERNAMES?.split(','), []),
  anthropicApiKey: valueOrThrow(
    process.env.ANTHROPIC_API_KEY,
    'ANTHROPIC_API_KEY is not set',
  ),
  botId: 0,
  botToken: valueOrThrow(process.env.BOT_TOKEN, 'BOT_TOKEN is not set'),
  env: valueOrDefault(process.env.ENV, 'development'),
  mistralApiKey: valueOrThrow(
    process.env.MISTRAL_API_KEY,
    'MISTRAL_API_KEY is not set',
  ),
  openAiApiKey: valueOrThrow(
    process.env.OPENAI_API_KEY,
    'OPENAI_API_KEY is not set',
  ),
  randomEncounterChance: valueOrDefault(
    Number.parseFloat(process.env.RANDOM_ENCOUNTER_CHANCE ?? ''),
    0.1,
  ),
};
/* eslint-enable node/no-process-env */

export const isProduction = config.env === 'production';
