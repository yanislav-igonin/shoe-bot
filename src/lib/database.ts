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

// export const messageModel = database.message;
export const userModel = database.user;
export const dialogModel = database.dialog;
