import {
  type Chat,
  type Dialog,
  type User,
  type UserSettings,
} from '@prisma/client';
import { type Context } from 'grammy';

export type BotContext = Context & {
  state: {
    chat: Chat;
    dialog: Dialog;
    user: User;
    userSettings: UserSettings;
  };
};
