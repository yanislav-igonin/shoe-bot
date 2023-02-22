import { type User } from './database';
import { database } from './database';

export const getUser = async (id: number) =>
  await database.user.findUnique({ where: { id } });

export const createUser = async (data: Omit<User, 'createdAt'>) =>
  await database.user.create({ data });
