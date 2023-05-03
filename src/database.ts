import { PrismaClient } from '@prisma/client';

export {
  type BotReply,
  type Chat,
  type Dialog,
  type Image,
  type Prompt,
  type User,
} from '@prisma/client';

export const database = new PrismaClient();
