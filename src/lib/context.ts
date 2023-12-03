import { type NewChat, type NewDialog, type NewUser } from '@prisma/client';
import { type Context } from 'grammy';

export type BotContext = Context & {
  state: {
    chat: NewChat;
    dialog: NewDialog;
    user: NewUser;
  };
};
