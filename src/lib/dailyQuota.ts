import { type EntityManager } from '@mikro-orm/postgresql';

export const DAILY_FREE_REQUEST_LIMIT = 3;

type UsageRow = {
  used: number;
};

export const reserveDailyRequest = async (
  em: EntityManager,
  userId: number,
) => {
  const rows = await em.getConnection().execute<UsageRow[]>(
    `
    INSERT INTO "daily_request_usages" ("userId", "date", "used")
    VALUES (
      ?,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
      1
    )
    ON CONFLICT ("userId", "date")
    DO UPDATE SET "used" = "daily_request_usages"."used" + 1
    WHERE "daily_request_usages"."used" < ?
    RETURNING "used"
    `,
    [userId, DAILY_FREE_REQUEST_LIMIT],
  );

  return rows[0]?.used ?? null;
};

export const refundDailyRequest = async (em: EntityManager, userId: number) => {
  await em.getConnection().execute(
    `
    UPDATE "daily_request_usages"
    SET "used" = GREATEST("used" - 1, 0)
    WHERE "userId" = ?
      AND "date" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    `,
    [userId],
  );
};

export const getRemainingDailyRequests = async (
  em: EntityManager,
  userId: number,
) => {
  const rows = await em.getConnection().execute<UsageRow[]>(
    `
    SELECT "used"
    FROM "daily_request_usages"
    WHERE "userId" = ?
      AND "date" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    `,
    [userId],
  );
  const used = rows[0]?.used ?? 0;

  return Math.max(DAILY_FREE_REQUEST_LIMIT - used, 0);
};
