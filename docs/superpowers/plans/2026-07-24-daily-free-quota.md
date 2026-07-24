# Daily Free Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Give every user without an active subscription three successful bot
requests per UTC day while keeping subscribers and admins unlimited.

**Architecture:** Store one usage row per user and UTC date. Reserve a slot with
one conditional PostgreSQL upsert before dialog creation and refund it when
downstream processing throws. Keep classification as a pure function and DB
access in one small quota module.

**Tech Stack:** TypeScript, Node.js 18+, grammY, Prisma, PostgreSQL, Luxon.

## Constraints

- Free limit is exactly three requests per UTC calendar day.
- Quota is global per Telegram user across all chats.
- Text, image generation, replies to this bot, and `/shicture` cost one slot.
- Service commands do not consume quota.
- Admins and active subscribers remain unlimited.
- Failed generation or Telegram delivery refunds the slot.
- No payment links or random encounter code remain.
- Preserve activation codes and manual premium access.
- Per user request: no database mocks, service mocks, integration tests, or
  PostgreSQL CI job. Automated tests cover pure functions only.

## Task 1: Pure Request Classification

**Files:**

- Create: `src/lib/requestAccess.ts`
- Create: `src/lib/requestAccess.test.ts`
- Modify: `package.json`

1. Add a `test` script using `tsx --test`.
2. Write pure unit tests first for:
   - service command → `free`;
   - private text → `generation`;
   - group trigger → `generation`;
   - reply to this bot → `generation`;
   - `/shicture` → `generation`;
   - unrelated group text → `ignore`;
   - reply to another bot → `ignore`.
3. Run the tests and confirm they fail because the classifier does not exist.
4. Implement:

```typescript
export type RequestAccess = 'free' | 'generation' | 'ignore';

export type RequestAccessInput = {
  chatType: string | undefined;
  isReplyToThisBot: boolean;
  matchesTextTrigger: boolean;
  text: string | undefined;
};

export const classifyRequest = (
  input: RequestAccessInput,
): RequestAccess => {
  // Pure classification only. No grammY context and no database access.
};
```

5. Run the focused unit test, lint, and typecheck.
6. Commit as `test(quota): define request classification`.

## Task 2: Atomic Quota Persistence

**Files:**

- Modify: `prisma/schema.prisma`
- Create:
  `prisma/migrations/20260724000000_daily_request_usage/migration.sql`
- Create: `src/lib/dailyQuota.ts`

1. Add `DailyRequestUsage` with `userId`, UTC `date`, `used`, and a unique
   `(userId, date)` pair.
2. Add a SQL check constraint keeping `used` between zero and three.
3. Implement:

```typescript
export const DAILY_FREE_REQUEST_LIMIT = 3;
export const reserveDailyRequest = (
  userId: number,
): Promise<number | null>;
export const refundDailyRequest = (userId: number): Promise<void>;
export const getRemainingDailyRequests = (
  userId: number,
): Promise<number>;
```

4. Reservation must be one `INSERT ... ON CONFLICT ... DO UPDATE` query.
   Missing row inserts `used = 1`; existing row increments only below three.
5. Refund decrements with `GREATEST(used - 1, 0)`.
6. All three queries derive the day with
   `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`.
7. Do not add automated DB tests. Run `prisma format`, `prisma validate`,
   `prisma generate`, lint, and typecheck.
8. Commit as `feat(quota): add daily usage storage`.

## Task 3: Enforce and Display Quota

**Files:**

- Modify: `src/middlewares.ts`
- Modify: `src/index.ts`
- Modify: `src/controllers/textTrigger.controller.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/controllers/shicture.controller.ts`
- Modify: `src/controllers/profile.controller.ts`
- Modify: `src/lib/replies.ts`

1. Use `classifyRequest()` in `allowedMiddleware`.
2. Run middleware after `userMiddleware` and before `dialogMiddleware`.
3. Pass service commands, admins, and active subscribers without quota.
4. Ignore irrelevant group text and replies to other bots.
5. Reserve one slot for inactive users. On `null`, reply:

```text
Бесплатные запросы на сегодня закончились. Следующие 3 будут доступны после 00:00 UTC.
```

6. Wrap downstream processing. If it throws, refund without hiding the
   original error.
7. Make missing reply history and terminal controller failures throw after
   sending the appropriate error reply. Do not write fake successful bot
   messages on failure.
8. For inactive users, `/profile` calls `getRemainingDailyRequests()` and
   replies:

```text
Бесплатных запросов сегодня осталось: N из 3. Сброс в 00:00 UTC.
```

9. Active `/profile` output remains the subscription expiry date.
10. Run the pure tests, lint, typecheck, and build.
11. Commit as `feat(quota): enforce daily free limit`.

## Task 4: Remove Dead Random and Payment Code

**Files:**

- Delete: `src/lib/randomEncounterWords.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/lib/prompt.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/lib/replies.ts`
- Modify: `src/index.ts`
- Modify: `.env.example`

1. Delete the commented random reply controller and branch.
2. Delete random encounter words, imports, helpers, config, env setting,
   comments, and `/help` copy.
3. Preserve random `/shicture` style selection.
4. Remove all Boosty, Patreon, and payment-promotion copy.
5. Verify no dead references remain with:

```bash
rg -n \
  "randomEncounter|Random encounter|RANDOM_ENCOUNTER|boosty|patreon" \
  src .env.example
```

Expected: no matches.

6. Run unit tests, lint, typecheck, build, and `git diff --check`.
7. Review the final diff for unrelated changes.
8. Commit as `refactor: remove random encounters`.

## Completion

Before claiming completion, run fresh unit tests, Prisma validation, lint,
typecheck, build, dead-code scan, and `git diff --check`. Then use
`superpowers:verification-before-completion` and
`superpowers:finishing-a-development-branch`.
