import { database } from './database.js';
import { Prisma } from '@prisma/client';

export const DAILY_FREE_REQUEST_LIMIT = 3;

type UsageRow = {
  used: number;
};

export const reserveDailyRequest = async (userId: number) => {
  const rows = await database.$queryRaw<UsageRow[]>(Prisma.sql`
    INSERT INTO "daily_request_usages" ("userId", "date", "used")
    VALUES (
      ${userId},
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
      1
    )
    ON CONFLICT ("userId", "date")
    DO UPDATE SET "used" = "daily_request_usages"."used" + 1
    WHERE "daily_request_usages"."used" < ${DAILY_FREE_REQUEST_LIMIT}
    RETURNING "used"
  `);

  return rows[0]?.used ?? null;
};

export const refundDailyRequest = async (userId: number) => {
  await database.$executeRaw(Prisma.sql`
    UPDATE "daily_request_usages"
    SET "used" = GREATEST("used" - 1, 0)
    WHERE "userId" = ${userId}
      AND "date" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
  `);
};

export const getRemainingDailyRequests = async (userId: number) => {
  const rows = await database.$queryRaw<UsageRow[]>(Prisma.sql`
    SELECT "used"
    FROM "daily_request_usages"
    WHERE "userId" = ${userId}
      AND "date" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
  `);
  const used = rows[0]?.used ?? 0;

  return Math.max(DAILY_FREE_REQUEST_LIMIT - used, 0);
};
