import { Prisma } from '@prisma/client';
import { database } from 'lib/database';
import { MONTH_MS } from 'lib/date';

type PromptsCountResult = {
  firstName: string;
  lastName: string;
  promptsCount: number;
  userId: string;
  username: string;
};
export const getPromptsCountForLastMonthGroupedByUser = async () => {
  const minusMonth = new Date(Date.now() - MONTH_MS);
  const query = Prisma.sql`
    SELECT 
      COUNT(p.id) as "promptsCount",
      u.username,
      u."firstName",
      u."lastName",
      p."userId"
    FROM prompts p
    LEFT JOIN users u
      ON p."userId" = u.id
    WHERE p."createdAt" > ${minusMonth}
    GROUP BY p."userId", u.username, u."firstName", u."lastName"
    ORDER BY "promptsCount" DESC
  `;
  const result = await database.$queryRaw<PromptsCountResult[]>(query);
  return result;
};

type ImagesCountResult = {
  firstName: string;
  imagesCount: number;
  lastName: string;
  userId: string;
  username: string;
};
export const getImagesCountForLastMonthGroupedByUser = async () => {
  const minusMonth = new Date(Date.now() - MONTH_MS);
  const query = Prisma.sql`
    SELECT 
      COUNT(i.id) as "imagesCount",
      u.username,
      u."firstName",
      u."lastName",
      i."userId"
    FROM images i
    LEFT JOIN users u
      ON i."userId" = u.id
    WHERE i."createdAt" > ${minusMonth}
    GROUP BY i."userId", u.username, u."firstName", u."lastName"
    ORDER BY "imagesCount" DESC
  `;
  const result = await database.$queryRaw<ImagesCountResult[]>(query);
  return result;
};
