import { type Chat } from 'lib/database';
import { database } from 'lib/database';

export const create = async (data: Omit<Chat, 'createdAt' | 'isAllowed'>) =>
  await database.chat.create({ data });

export const get = async (id: string) =>
  await database.chat.findUnique({ where: { id } });
