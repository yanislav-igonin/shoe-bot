import { PrismaClient } from '@prisma/client';

export { type Chat, type Image, type Prompt, type User } from '@prisma/client';

export const database = new PrismaClient();
