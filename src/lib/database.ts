import { PrismaClient } from '@prisma/client';

export { type ActivationCode } from '@prisma/client';

export const database = new PrismaClient();
