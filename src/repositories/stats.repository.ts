import { Prisma } from '@prisma/client';
import { database } from 'lib/database';
import { MONTH_MS } from 'lib/date';

type PromptsCountResult = {
  firstName: string;
  lastName: string;
  messagesCount: number;
  userId: string;
  username: string;
};
export const getTextMessagesCountForLastMonthGroupedByUser = async () => {
  const minusMonth = new Date(Date.now() - MONTH_MS);
  const query = Prisma.sql`
    SELECT 
      COUNT(m.id) as "messagesCount",
      u.username,
      u."firstName",
      u."lastName",
      m."userId"
    FROM messages m
    LEFT JOIN users u
      ON m."userId" = u.id
    WHERE m."createdAt" > ${minusMonth}
      AND m.type = 'text'
      AND u.id != 0
    GROUP BY m."userId", u.username, u."firstName", u."lastName"
    ORDER BY "messagesCount" DESC
  `;
  const result = await database.$queryRaw<PromptsCountResult[]>(query);
  return result;
};

export const getImageMessagesCountForLastMonthGroupedByUser = async () => {
  const minusMonth = new Date(Date.now() - MONTH_MS);
  const query = Prisma.sql`
    SELECT 
      COUNT(m.id) as "messagesCount",
      u.username,
      u."firstName",
      u."lastName",
      m."userId"
    FROM messages m
    LEFT JOIN users u
      ON m."userId" = u.id
    WHERE m."createdAt" > ${minusMonth}
      AND m.type = 'image'
      AND u.id != 0
    GROUP BY m."userId", u.username, u."firstName", u."lastName"
    ORDER BY "messagesCount" DESC
  `;
  const result = await database.$queryRaw<PromptsCountResult[]>(query);
  return result;
};

export const getVoiceMessagesCountForLastMonthGroupedByUser = async () => {
  const minusMonth = new Date(Date.now() - MONTH_MS);
  const query = Prisma.sql`
    SELECT 
      COUNT(m.id) as "messagesCount",
      u.username,
      u."firstName",
      u."lastName",
      m."userId"
    FROM messages m
    LEFT JOIN users u
      ON m."userId" = u.id
    WHERE m."createdAt" > ${minusMonth}
      AND m.type = 'voice'
      AND u.id != 0
    GROUP BY m."userId", u.username, u."firstName", u."lastName"
    ORDER BY "messagesCount" DESC
  `;
  const result = await database.$queryRaw<PromptsCountResult[]>(query);
  return result;
};
