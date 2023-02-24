import { type Prompt } from '../database';
import { database } from '../database';

export const createPrompt = async (data: Omit<Prompt, 'createdAt' | 'id'>) =>
  await database.prompt.create({ data });
