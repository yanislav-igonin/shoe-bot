import { database } from '@/database';
import { Prisma } from '@prisma/client';

type PromptCountResult = {
  firstName: string;
  lastName: string;
  promptsCount: number;
  userId: string;
  username: string;
};
export const getPromptsCountForLastMonthGroupedByUser = async () => {
  const MONTH = 30 * 24 * 60 * 60 * 1_000;
  const minusMonth = new Date(Date.now() - MONTH);
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
  const result = await database.$queryRaw<PromptCountResult[]>(query);
  return result;
};
