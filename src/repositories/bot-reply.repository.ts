import { type BotReply } from '@/database';
import { database } from '@/database';

export const create = async (data: Omit<BotReply, 'createdAt' | 'id'>) =>
  await database.botReply.create({ data });

export const get = async (id: string) =>
  await database.botReply.findUnique({ where: { id } });
