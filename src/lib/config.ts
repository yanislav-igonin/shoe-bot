import { valueOrDefault, valueOrThrow } from './values.js';

/* eslint-disable node/no-process-env */
export const config = {
  adminsUsernames: valueOrDefault(process.env.ADMINS_USERNAMES?.split(','), []),
  botId: 0,
  botToken: valueOrThrow(process.env.BOT_TOKEN, 'BOT_TOKEN is not set'),
  env: valueOrDefault(process.env.ENV, 'development'),
  openRouterApiKey: valueOrThrow(
    process.env.OPENROUTER_API_KEY,
    'OPENROUTER_API_KEY is not set',
  ),
  randomEncounterChance: valueOrDefault(
    Number.parseFloat(process.env.RANDOM_ENCOUNTER_CHANCE ?? ''),
    0.1,
  ),
};
/* eslint-enable node/no-process-env */

export const isProduction = config.env === 'production';
