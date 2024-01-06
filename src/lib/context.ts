import {
  type NewChat,
  type NewDialog,
  type NewUser,
  type UserSettings,
} from '@prisma/client';
import { type Context } from 'grammy';

export type BotContext = Context & {
  state: {
    chat: NewChat;
    dialog: NewDialog;
    user: NewUser;
    userSettings: UserSettings;
  };
};
