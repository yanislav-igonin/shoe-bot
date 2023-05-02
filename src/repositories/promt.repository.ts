import { type Prompt } from '@/database';
import { database } from '@/database';

export const create = async (data: Omit<Prompt, 'createdAt' | 'id'>) =>
  await database.prompt.create({ data });

export const getListByDialogId = async (dialogId: string) =>
  await database.prompt.findMany({ where: { dialogId } });
