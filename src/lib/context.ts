import { type Context } from 'grammy';
import { type Chat, type User } from 'lib/database';

export type BotContext = Context & {
  state: {
    chat: Chat;
    user: User;
  };
};
