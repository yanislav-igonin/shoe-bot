import { type BotReply } from '@/database';
import { database } from '@/database';

export const create = async (data: Omit<BotReply, 'createdAt'>) =>
  await database.botReply.create({ data });

export const getOneById = async (id: string) =>
  await database.botReply.findUnique({ where: { id } });

export const getListByDialogId = async (dialogId: string) =>
  await database.botReply.findMany({ where: { dialogId } });
