import {
  type Chat,
  type Dialog,
  type User,
  type UserSettings,
} from '../entities.js';
import { type EntityManager } from '@mikro-orm/postgresql';
import { type Context } from 'grammy';

export type BotContext = Context & {
  state: {
    chat: Chat;
    dialog: Dialog;
    em: EntityManager;
    user: User;
    userSettings: UserSettings;
  };
};
