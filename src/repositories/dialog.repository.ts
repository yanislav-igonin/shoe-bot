import { type Dialog } from '@/database';
import { database } from '@/database';

export const create = async (data: Omit<Dialog, 'createdAt'>) =>
  await database.dialog.create({ data });

export const get = async (id: string) =>
  await database.dialog.findUnique({ where: { id } });
