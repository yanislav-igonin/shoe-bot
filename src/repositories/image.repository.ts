import { type Image } from '../lib/database';
import { database } from 'lib/database';

export const create = async (data: Omit<Image, 'createdAt' | 'id'>) =>
  await database.image.create({ data });
