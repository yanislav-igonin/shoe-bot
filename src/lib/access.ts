import { config } from './config';
import { type NewUser } from '@prisma/client';

export const hasAccess = (user: NewUser) =>
  user.isAllowed || config.adminsUsernames.includes(user.username ?? '');
