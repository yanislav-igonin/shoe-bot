import { type User } from 'lib/database';
import { database } from 'lib/database';

export const get = async (id: string) =>
  await database.user.findUnique({ where: { id } });

export const create = async (data: Omit<User, 'createdAt' | 'isAllowed'>) =>
  await database.user.create({ data });
