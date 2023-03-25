import { valueOrDefault, valueOrThrow } from './values';

/* eslint-disable node/no-process-env */
export const config = {
  allowedUsernames: valueOrDefault(
    process.env.ALLOWED_USERNAMES?.split(','),
    [],
  ),
  botToken: valueOrThrow(process.env.BOT_TOKEN, 'BOT_TOKEN is not set'),
  env: valueOrDefault(process.env.NODE_ENV, 'development'),
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

export const isProduction = () => config.env === 'production';
