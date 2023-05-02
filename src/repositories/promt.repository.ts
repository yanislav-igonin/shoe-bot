import { type Prompt } from '@/database';
import { database } from '@/database';

export const create = async (
  data: Omit<Prompt, 'createdAt' | 'dialogId' | 'id'>,
) => await database.prompt.create({ data });

export const getList = async (filter: Partial<Prompt>) =>
  await database.prompt.findMany({ where: filter });
