import { database } from '@/database';

export const create = async () => await database.dialog.create({ data: {} });

export const get = async (id: string) =>
  await database.dialog.findUnique({ where: { id } });
