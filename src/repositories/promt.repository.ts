import { type Prompt } from 'lib/database';
import { database } from 'lib/database';

export const create = async (data: Omit<Prompt, 'id'>) =>
  await database.prompt.create({ data });

export const getListByDialogId = async (dialogId: string) =>
  await database.prompt.findMany({ where: { dialogId } });
