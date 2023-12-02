import { type NewChat, type NewUser } from '@prisma/client';
import { type Context } from 'grammy';

export type BotContext = Context & {
  state: {
    chat: NewChat;
    user: NewUser;
  };
};
