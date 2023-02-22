import { type Prompt } from './database';
import { database } from './database';

export const createPrompt = async (data: Prompt) =>
  await database.prompt.create({ data });
