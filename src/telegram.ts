import { Api } from 'grammy';
import { config } from 'lib/config';

export const telegram = new Api(config.botToken);
