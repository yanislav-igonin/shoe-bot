import { Api } from 'grammy';
import { config } from 'lib/config.js';

export const telegram = new Api(config.botToken);
