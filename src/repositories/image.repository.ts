import { type Image } from '../database';
import { database } from '../database';

export const create = async (data: Omit<Image, 'createdAt' | 'id'>) =>
  await database.image.create({ data });
