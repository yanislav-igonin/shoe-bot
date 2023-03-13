import {
  type Image as ImageType,
  type Prompt as PromptType,
  type User as UserType,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';

export const database = new PrismaClient();

export type User = UserType;
export type Prompt = PromptType;
export type Image = ImageType;
