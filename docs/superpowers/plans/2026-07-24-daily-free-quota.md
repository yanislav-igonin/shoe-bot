# Daily Free Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user without an active subscription three successful bot
requests per UTC day while keeping subscribers and admins unlimited.

**Architecture:** Store one usage row per user and UTC date. Reserve a slot with
one conditional PostgreSQL upsert before dialog creation, then refund it when
downstream generation or delivery throws. Keep request classification in the
existing access middleware and quota persistence in one small library module.

**Tech Stack:** TypeScript 4.9, Node.js 18, grammY 1.14, Prisma 4,
PostgreSQL, Luxon, Node's built-in test runner through `tsx`.

## Global Constraints

- Free limit is exactly `3` requests per UTC calendar day.
- Quota is global per Telegram user across all chats.
- Text, image generation, replies to this bot, and `/shicture` cost one slot.
- Service commands do not consume quota.
- Admins and users with active subscriptions remain unlimited.
- Failed generation or delivery refunds the reserved slot.
- Exhausted requests must create no dialog or message rows.
- Do not add a cron job, per-request reservation journal, factory, registry, or
  dependency-injection container.
- Remove all payment links and all random encounter code.
- Preserve the existing activation-code and manual subscription behavior.

---

## File Map

**Create**

- `prisma/migrations/20260724000000_daily_request_usage/migration.sql`:
  create the daily usage table, unique key, check constraint, and foreign key.
- `src/lib/dailyQuota.ts`: atomic reserve, refund, and remaining-count queries.
- `src/lib/dailyQuota.test.ts`: PostgreSQL integration coverage, including
  concurrent reservation.
- `src/middlewares.test.ts`: request classification and refund lifecycle tests.
- `src/controllers/profile.controller.test.ts`: inactive and active profile
  behavior.

**Modify**

- `prisma/schema.prisma`: add `DailyRequestUsage` and its `NewUser` relation.
- `package.json`: add the test command.
- `src/middlewares.ts`: classify requests, bypass unlimited users, reserve and
  refund quota, and surface missing reply history as a failed request.
- `src/index.ts`: run access control after user loading and before dialog
  creation; remove the random encounter comment.
- `src/controllers/textTrigger.controller.ts`: throw on terminal generation
  failures so quota can be refunded.
- `src/controllers/text.controller.ts`: throw on terminal generation failures.
- `src/controllers/shicture.controller.ts`: throw without writing a fake
  successful response after image failure.
- `src/controllers/profile.controller.ts`: show subscription state or free
  quota remaining.
- `src/lib/replies.ts`: add free-quota copy and remove payment/random copy.
- `src/lib/prompt.ts`: delete random encounter imports and functions.
- `src/lib/config.ts`: delete random encounter configuration.
- `.env.example`: delete `RANDOM_ENCOUNTER_CHANCE`.
- `.github/workflows/push.yml`: run integration tests against PostgreSQL.

**Delete**

- `src/lib/randomEncounterWords.ts`

---

### Task 1: Add Atomic Daily Quota Persistence

**Files:**

- Modify: `prisma/schema.prisma`
- Create:
  `prisma/migrations/20260724000000_daily_request_usage/migration.sql`
- Create: `src/lib/dailyQuota.ts`
- Create: `src/lib/dailyQuota.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: existing `database: PrismaClient` from `src/lib/database.ts`.
- Produces:
  - `DAILY_FREE_REQUEST_LIMIT: 3`
  - `reserveDailyRequest(userId: number): Promise<number | null>`
  - `refundDailyRequest(userId: number): Promise<void>`
  - `getRemainingDailyRequests(userId: number): Promise<number>`

- [ ] **Step 1: Add the test command**

Add this script to `package.json`:

```json
"test": "tsx -r dotenv/config --test src/*.test.ts src/**/*.test.ts"
```

Keep the existing scripts unchanged.

- [ ] **Step 2: Write the failing PostgreSQL integration test**

Create `src/lib/dailyQuota.test.ts`:

```typescript
import {
  after,
  afterEach,
  beforeEach,
  describe,
  test,
} from 'node:test';
import assert from 'node:assert/strict';
import { database } from './database.js';
import {
  DAILY_FREE_REQUEST_LIMIT,
  getRemainingDailyRequests,
  refundDailyRequest,
  reserveDailyRequest,
} from './dailyQuota.js';

let userId: number;

beforeEach(async () => {
  const user = await database.newUser.create({
    data: {
      tgId: `daily-quota-test-${Date.now()}-${Math.random()}`,
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await database.dailyRequestUsage.deleteMany({ where: { userId } });
  await database.newUser.delete({ where: { id: userId } });
});

after(async () => {
  await database.$disconnect();
});

describe('daily quota', () => {
  test('starts with three and rejects the fourth request', async () => {
    assert.equal(
      await getRemainingDailyRequests(userId),
      DAILY_FREE_REQUEST_LIMIT,
    );
    assert.equal(await reserveDailyRequest(userId), 1);
    assert.equal(await reserveDailyRequest(userId), 2);
    assert.equal(await reserveDailyRequest(userId), 3);
    assert.equal(await reserveDailyRequest(userId), null);
    assert.equal(await getRemainingDailyRequests(userId), 0);
  });

  test('allows only three concurrent reservations', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, async () => reserveDailyRequest(userId)),
    );

    assert.equal(results.filter((result) => result !== null).length, 3);
    assert.equal(results.filter((result) => result === null).length, 1);
  });

  test('refunds a reservation without going below zero', async () => {
    await reserveDailyRequest(userId);
    await refundDailyRequest(userId);
    await refundDailyRequest(userId);

    assert.equal(
      await getRemainingDailyRequests(userId),
      DAILY_FREE_REQUEST_LIMIT,
    );
  });

  test('ignores usage rows from previous UTC dates', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    await database.dailyRequestUsage.create({
      data: {
        date: yesterday,
        used: DAILY_FREE_REQUEST_LIMIT,
        userId,
      },
    });

    assert.equal(
      await getRemainingDailyRequests(userId),
      DAILY_FREE_REQUEST_LIMIT,
    );
  });
});
```

- [ ] **Step 3: Run the test and confirm the missing model/module failure**

Run:

```bash
npx tsx -r dotenv/config --test src/lib/dailyQuota.test.ts
```

Expected: FAIL because `dailyQuota.ts` and
`database.dailyRequestUsage` do not exist.

- [ ] **Step 4: Add the Prisma model and relation**

Add this relation to `NewUser` in `prisma/schema.prisma`:

```prisma
dailyRequestUsages DailyRequestUsage[]
```

Add this model:

```prisma
model DailyRequestUsage {
  id     Int      @id @default(autoincrement())
  userId Int
  user   NewUser  @relation(fields: [userId], references: [id])
  date   DateTime @db.Date
  used   Int

  @@unique([userId, date])
  @@map("daily_request_usages")
}
```

- [ ] **Step 5: Create the migration**

Create
`prisma/migrations/20260724000000_daily_request_usage/migration.sql`:

```sql
CREATE TABLE "daily_request_usages" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "used" INTEGER NOT NULL,

    CONSTRAINT "daily_request_usages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_request_usages_used_check"
        CHECK ("used" >= 0 AND "used" <= 3)
);

CREATE UNIQUE INDEX "daily_request_usages_userId_date_key"
ON "daily_request_usages"("userId", "date");

ALTER TABLE "daily_request_usages"
ADD CONSTRAINT "daily_request_usages_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "new_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 6: Generate the Prisma client and apply the migration**

Run:

```bash
npx prisma generate
npx prisma migrate deploy
```

Expected: Prisma client generation succeeds and migration
`20260724000000_daily_request_usage` is applied.

- [ ] **Step 7: Implement the quota module**

Create `src/lib/dailyQuota.ts`:

```typescript
import { Prisma } from '@prisma/client';
import { database } from './database.js';

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
```

- [ ] **Step 8: Run the focused tests**

Run:

```bash
npx tsx -r dotenv/config --test src/lib/dailyQuota.test.ts
```

Expected: four tests PASS, including the concurrent reservation test.

- [ ] **Step 9: Run static checks**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 10: Commit the persistence layer**

```bash
git add package.json prisma/schema.prisma \
  prisma/migrations/20260724000000_daily_request_usage/migration.sql \
  src/lib/dailyQuota.ts src/lib/dailyQuota.test.ts
git commit -m "feat(quota): add atomic daily usage"
```

---

### Task 2: Enforce Quota Before Dialog Creation

**Files:**

- Create: `src/middlewares.test.ts`
- Modify: `src/middlewares.ts`
- Modify: `src/index.ts`
- Modify: `src/controllers/textTrigger.controller.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/controllers/shicture.controller.ts`

**Interfaces:**

- Consumes quota functions from Task 1.
- Produces:
  - `DailyQuotaOperations` with `reserve` and `refund` functions.
  - `allowedMiddleware(context, next, quota?)`.
  - Controllers that throw after terminal failures.

- [ ] **Step 1: Write failing middleware lifecycle tests**

Create `src/middlewares.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type BotContext } from './lib/context.js';
import {
  type DailyQuotaOperations,
  allowedMiddleware,
} from './middlewares.js';

type ContextOptions = {
  allowedTill?: Date | null;
  chatType?: 'group' | 'private';
  replyFromBotId?: number;
  text?: string;
};

const createContext = (
  options: ContextOptions = {},
  replies: string[] = [],
) =>
  ({
    chat: { type: options.chatType ?? 'private' },
    me: { id: 999 },
    message: {
      message_id: 10,
      reply_to_message:
        options.replyFromBotId === undefined
          ? undefined
          : {
              from: {
                id: options.replyFromBotId,
                is_bot: true,
              },
            },
      text: options.text ?? 'обычный запрос',
    },
    reply: async (text: string) => {
      replies.push(text);
    },
    state: {
      user: {
        allowedTill: options.allowedTill ?? null,
        id: 42,
        username: null,
      },
    },
  }) as unknown as BotContext;

const createQuota = (
  reserveResult: number | null,
  calls: string[],
): DailyQuotaOperations => ({
  refund: async () => {
    calls.push('refund');
  },
  reserve: async () => {
    calls.push('reserve');
    return reserveResult;
  },
});

describe('allowedMiddleware', () => {
  test('passes service commands without quota', async () => {
    const calls: string[] = [];
    const context = createContext({ text: '/profile' });

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(1, calls),
    );

    assert.deepEqual(calls, ['next']);
  });

  test('ignores unrelated group messages', async () => {
    const calls: string[] = [];
    const context = createContext({
      chatType: 'group',
      text: 'разговор людей',
    });

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(1, calls),
    );

    assert.deepEqual(calls, []);
  });

  test('ignores replies to a different bot', async () => {
    const calls: string[] = [];
    const context = createContext({
      chatType: 'group',
      replyFromBotId: 123,
    });

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(1, calls),
    );

    assert.deepEqual(calls, []);
  });

  test('reserves for a reply to this bot', async () => {
    const calls: string[] = [];
    const context = createContext({
      chatType: 'group',
      replyFromBotId: 999,
    });

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(1, calls),
    );

    assert.deepEqual(calls, ['reserve', 'next']);
  });

  test('reserves for a trigger in a group', async () => {
    const calls: string[] = [];
    const trigger =
      process.env.ENV === 'production'
        ? 'ботинок, ответь'
        : 'бомж, ответь';
    const context = createContext({
      chatType: 'group',
      text: trigger,
    });

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(1, calls),
    );

    assert.deepEqual(calls, ['reserve', 'next']);
  });

  test('reserves for shicture in a group', async () => {
    const calls: string[] = [];
    const context = createContext({
      chatType: 'group',
      text: '/shicture',
    });

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(1, calls),
    );

    assert.deepEqual(calls, ['reserve', 'next']);
  });

  test('rejects an exhausted request', async () => {
    const calls: string[] = [];
    const replies: string[] = [];
    const context = createContext({}, replies);

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(null, calls),
    );

    assert.deepEqual(calls, ['reserve']);
    assert.match(replies[0], /00:00 UTC/u);
  });

  test('refunds when downstream processing throws', async () => {
    const calls: string[] = [];
    const context = createContext();

    await assert.rejects(
      allowedMiddleware(
        context,
        async () => {
          calls.push('next');
          throw new Error('provider failed');
        },
        createQuota(1, calls),
      ),
      /provider failed/u,
    );

    assert.deepEqual(calls, ['reserve', 'next', 'refund']);
  });

  test('bypasses quota for an active subscriber', async () => {
    const calls: string[] = [];
    const context = createContext({
      allowedTill: new Date(Date.now() + 86_400_000),
    });

    await allowedMiddleware(
      context,
      async () => {
        calls.push('next');
      },
      createQuota(1, calls),
    );

    assert.deepEqual(calls, ['next']);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run with the required app environment:

```bash
npx tsx -r dotenv/config --test src/middlewares.test.ts
```

Expected: FAIL because `DailyQuotaOperations` and the injectable third argument
do not exist and inactive users are still rejected.

- [ ] **Step 3: Replace access-control logic**

In `src/middlewares.ts`, import the quota operations and logger:

```typescript
import {
  refundDailyRequest,
  reserveDailyRequest,
} from 'lib/dailyQuota.js';
import { logger } from 'lib/logger.js';
```

Replace the existing `allowedMiddleware` section with:

```typescript
const freeCommandRegexp =
  /^\/(?:start|help|activate|profile|getbotroles|setbotrole|stats|generate)(?:@\w+)?(?:\s|$)/iu;
const shictureCommandRegexp = /^\/shicture(?:@\w+)?(?:\s|$)/iu;

export type DailyQuotaOperations = {
  refund: (userId: number) => Promise<void>;
  reserve: (userId: number) => Promise<number | null>;
};

const dailyQuotaOperations: DailyQuotaOperations = {
  refund: refundDailyRequest,
  reserve: reserveDailyRequest,
};

export const allowedMiddleware = async (
  context: BotContext,
  next: NextFunction,
  quota: DailyQuotaOperations = dailyQuotaOperations,
) => {
  const text = context.message?.text;
  if (!text) {
    return;
  }

  if (freeCommandRegexp.test(text)) {
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const replyFrom = context.message?.reply_to_message?.from;
  const isReplyOnThisBot =
    replyFrom?.is_bot === true && replyFrom.id === context.me.id;
  const messageMatchesTrigger = textTriggerRegexp.test(text);
  const isPrivateChat = context.chat?.type === 'private';
  const isShictureCommand = shictureCommandRegexp.test(text);
  const shouldTrigger =
    isPrivateChat ||
    isReplyOnThisBot ||
    messageMatchesTrigger ||
    isShictureCommand;

  if (!shouldTrigger) {
    return;
  }

  const { user } = context.state;
  const subscriptionIsActive =
    user.allowedTill !== null &&
    DateTime.now().toUTC() <
      DateTime.fromJSDate(user.allowedTill).toUTC().endOf('day');
  const isAdmin = config.adminsUsernames.includes(user.username ?? '');

  if (subscriptionIsActive || isAdmin) {
    // eslint-disable-next-line node/callback-return
    await next();
    return;
  }

  const usage = await quota.reserve(user.id);
  if (usage === null) {
    await context.reply(replies.dailyQuotaExhausted, {
      reply_to_message_id: context.message?.message_id,
    });
    return;
  }

  try {
    // eslint-disable-next-line node/callback-return
    await next();
  } catch (error) {
    try {
      await quota.refund(user.id);
    } catch (refundError) {
      logger.error(refundError);
    }
    throw error;
  }
};
```

- [ ] **Step 4: Move access control before dialog creation**

Change the global middleware order in `src/index.ts` to:

```typescript
bot.use(stateMiddleware);
bot.use(chatMiddleware);
bot.use(userMiddleware);
bot.use(allowedMiddleware);
bot.use(dialogMiddleware);
bot.use(userSettingsMiddleware);
```

This ordering guarantees quota rejection happens before a dialog is created.

- [ ] **Step 5: Make terminal controller failures throw**

In `src/controllers/textTrigger.controller.ts`:

- Keep the generic error reply when the bot role is missing, then throw
  `new Error('Bot role is undefined')`.
- When `generateImage()` returns no URL, log the failure and throw
  `new Error('Failed to generate image')`; let the existing outer catch send
  the generic error once.

The two terminal branches must end as:

```typescript
if (!botRole) {
  logger.error('Bot role is undefined');
  await context.reply(replies.error, { reply_to_message_id: messageId });
  throw new Error('Bot role is undefined');
}
```

```typescript
if (!imageUrl) {
  logger.error('Failed to generate image');
  throw new Error('Failed to generate image');
}
```

In `src/controllers/text.controller.ts`, change both silent terminal branches
to reply once and throw:

```typescript
if (!imageUrl) {
  await context.reply(replies.error, {
    reply_to_message_id: messageId,
  });
  logger.error('Failed to generate image');
  throw new Error('Failed to generate image');
}
```

```typescript
if (!botRole) {
  logger.error('Bot role is undefined');
  await context.reply(replies.error, { reply_to_message_id: messageId });
  throw new Error('Bot role is undefined');
}
```

In `src/controllers/shicture.controller.ts`, replace the no-URL return and the
catch block. The try branch becomes:

```typescript
if (!imageUrl) {
  logger.error('Failed to generate image');
  throw new Error('Failed to generate image');
}
```

The catch block becomes:

```typescript
} catch (error) {
  await context.reply(replies.error, {
    reply_to_message_id: messageId,
  });
  throw error;
}
```

Do not create a bot `Message` row in the failure branch.

- [ ] **Step 6: Refund replies whose history cannot be loaded**

In `dialogMiddleware` in `src/middlewares.ts`, keep the existing
`replies.noPreviosData` response but replace the silent return with:

```typescript
if (!previousMessage) {
  await context.reply(replies.noPreviosData);
  throw new Error('Previous message is not available');
}
```

This error crosses `allowedMiddleware`, refunds an inactive user's
reservation, and is still logged by the global bot error handler.

- [ ] **Step 7: Run middleware and quota tests**

Run:

```bash
npx tsx -r dotenv/config --test \
  src/lib/dailyQuota.test.ts \
  src/middlewares.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Run static checks**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 9: Commit access enforcement**

```bash
git add src/middlewares.ts src/middlewares.test.ts src/index.ts \
  src/controllers/textTrigger.controller.ts \
  src/controllers/text.controller.ts \
  src/controllers/shicture.controller.ts
git commit -m "feat(quota): enforce free request limit"
```

---

### Task 3: Show Remaining Quota in Profile

**Files:**

- Create: `src/controllers/profile.controller.test.ts`
- Modify: `src/controllers/profile.controller.ts`
- Modify: `src/lib/replies.ts`

**Interfaces:**

- Consumes `getRemainingDailyRequests(userId)` from Task 1.
- Produces:
  - `replies.dailyQuotaInfo(remaining: number): string`
  - `replies.dailyQuotaExhausted: string`
  - profile output for active and inactive subscriptions.

- [ ] **Step 1: Add quota reply strings**

Add these entries to `src/lib/replies.ts`:

```typescript
dailyQuotaExhausted:
  'Бесплатные запросы на сегодня закончились. ' +
  'Следующие 3 будут доступны после 00:00 UTC.',
dailyQuotaInfo: (remaining: number) =>
  `Бесплатных запросов сегодня осталось: ${remaining} из 3. ` +
  'Сброс в 00:00 UTC.',
```

Remove the entire `notAllowed` entry, including all payment links.

- [ ] **Step 2: Write the failing profile integration tests**

Create `src/controllers/profile.controller.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, test } from 'node:test';
import { type CommandContext } from 'grammy';
import { profileController } from './profile.controller.js';
import { type BotContext } from '../lib/context.js';
import { database } from '../lib/database.js';
import { reserveDailyRequest } from '../lib/dailyQuota.js';

let userId: number;

beforeEach(async () => {
  const user = await database.newUser.create({
    data: {
      tgId: `profile-quota-test-${Date.now()}-${Math.random()}`,
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await database.dailyRequestUsage.deleteMany({ where: { userId } });
  await database.newUser.delete({ where: { id: userId } });
});

after(async () => {
  await database.$disconnect();
});

const createContext = (
  allowedTill: Date | null,
  replies: string[],
) =>
  ({
    message: { message_id: 10 },
    reply: async (text: string) => {
      replies.push(text);
    },
    state: {
      user: {
        allowedTill,
        id: userId,
      },
    },
  }) as unknown as CommandContext<BotContext>;

describe('profileController', () => {
  test('shows remaining free requests for an inactive user', async () => {
    const replies: string[] = [];
    await reserveDailyRequest(userId);

    await profileController(createContext(null, replies));

    assert.equal(
      replies[0],
      'Бесплатных запросов сегодня осталось: 2 из 3. ' +
        'Сброс в 00:00 UTC.',
    );
  });

  test('shows subscription expiry for an active user', async () => {
    const replies: string[] = [];
    const allowedTill = new Date(Date.now() + 86_400_000);

    await profileController(createContext(allowedTill, replies));

    assert.match(replies[0], /^Доступ до \d{2}\.\d{2}\.\d{4}\.$/u);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run:

```bash
npx tsx -r dotenv/config --test \
  src/controllers/profile.controller.test.ts
```

Expected: FAIL because an inactive user still receives `replies.notAllowed`.

- [ ] **Step 4: Implement active/inactive profile output**

Replace `src/controllers/profile.controller.ts` with:

```typescript
import { type CommandContext } from 'grammy';
import { type BotContext } from 'lib/context.js';
import { getRemainingDailyRequests } from 'lib/dailyQuota.js';
import { replies } from 'lib/replies.js';
import { DateTime } from 'luxon';

export const profileController = async (
  context: CommandContext<BotContext>,
) => {
  const { user } = context.state;
  const { allowedTill } = user;

  if (
    allowedTill === null ||
    DateTime.now().toUTC() >=
      DateTime.fromJSDate(allowedTill).toUTC().endOf('day')
  ) {
    const remaining = await getRemainingDailyRequests(user.id);
    await context.reply(replies.dailyQuotaInfo(remaining), {
      reply_to_message_id: context.message?.message_id,
    });
    return;
  }

  const formattedAllowedTill =
    DateTime.fromJSDate(allowedTill).toFormat('dd.MM.yyyy');
  await context.reply(replies.subscriptionInfo(formattedAllowedTill), {
    reply_to_message_id: context.message?.message_id,
  });
};
```

- [ ] **Step 5: Run profile and full tests**

Run:

```bash
npx tsx -r dotenv/config --test \
  src/controllers/profile.controller.test.ts
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Run static checks**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit profile behavior**

```bash
git add src/controllers/profile.controller.ts \
  src/controllers/profile.controller.test.ts src/lib/replies.ts
git commit -m "feat(quota): show daily balance"
```

---

### Task 4: Remove Random Encounter and Payment Promotion

**Files:**

- Delete: `src/lib/randomEncounterWords.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/lib/prompt.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/lib/replies.ts`
- Modify: `src/index.ts`
- Modify: `.env.example`

**Interfaces:**

- Removes all random encounter symbols, configuration, dead controller code,
  help copy, and payment URLs.
- Preserves `getShictureStyle()` and its use of `Math.random()`.

- [ ] **Step 1: Capture the expected failing dead-code scan**

Run:

```bash
rg -n \
  "randomEncounter|Random encounter|RANDOM_ENCOUNTER|boosty|patreon" \
  src .env.example
```

Expected: matches in `text.controller.ts`, `prompt.ts`, `config.ts`,
`replies.ts`, `.env.example`, and `randomEncounterWords.ts`.

- [ ] **Step 2: Delete the random encounter implementation**

Make these exact removals:

- Delete `src/lib/randomEncounterWords.ts`.
- Delete the commented `randomReplyController` from
  `src/controllers/text.controller.ts`.
- Delete the commented random encounter branch inside `textController`.
- Remove commented random encounter imports from `text.controller.ts`.
- Remove `randomEncounterWords` import, `getRandomEncounterWords`,
  `shouldMakeRandomEncounter`, and `getRandomEncounterPrompt` from
  `src/lib/prompt.ts`.
- Remove `randomEncounterChance` from `src/lib/config.ts`.
- Remove `RANDOM_ENCOUNTER_CHANCE` from `.env.example`.
- Change the final route comment in `src/index.ts` to:

```typescript
/**
 * Handles replies and private messages.
 */
```

- [ ] **Step 3: Remove random and payment promotion from help/replies**

In `src/lib/replies.ts`, end the `help` message after the private-chat
instruction:

```typescript
'В личке необзательно использовать обращение _"ботинок, ..."_, можно сразу писать запрос.',
```

Confirm the `notAllowed` entry and payment URLs were removed in Task 3. Do not
remove activation, profile, or subscription-expiry replies.

- [ ] **Step 4: Prove the dead code and links are gone**

Run:

```bash
test ! -e src/lib/randomEncounterWords.ts
rg -n \
  "randomEncounter|Random encounter|RANDOM_ENCOUNTER|boosty|patreon" \
  src .env.example
```

Expected: the file test exits 0 and `rg` exits 1 with no matches.

Also run:

```bash
rg -n "Math\\.random" src/lib/prompt.ts
```

Expected: matches remain only for `/shicture` style selection.

- [ ] **Step 5: Run all checks**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 6: Commit cleanup**

```bash
git add .env.example src/controllers/text.controller.ts src/index.ts \
  src/lib/config.ts src/lib/prompt.ts src/lib/replies.ts
git add -u src/lib/randomEncounterWords.ts
git commit -m "refactor: remove random encounters"
```

---

### Task 5: Add Quota Integration Tests to CI

**Files:**

- Modify: `.github/workflows/push.yml`

**Interfaces:**

- Consumes the `npm test` script and Prisma migration from Task 1.
- Produces a CI test job with a disposable PostgreSQL database.

- [ ] **Step 1: Add the PostgreSQL-backed test job**

Append this job to `.github/workflows/push.yml`:

```yaml
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:alpine
        env:
          POSTGRES_DB: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_USER: postgres
        ports:
        - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      ADMINS_USERNAMES: admin
      BOT_TOKEN: test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
      ENV: development
      GROK_API_KEY: test
      MISTRAL_API_KEY: test
      OPENAI_API_KEY: test

    steps:
    - name: Checkout
      uses: actions/checkout@v3
    - name: Use Node.js 18
      uses: actions/setup-node@v3
      with:
        node-version: 18.x
    - name: Install dependencies
      run: npm ci
    - name: Apply migrations
      run: npx prisma migrate deploy
    - name: Test
      run: npm test
```

- [ ] **Step 2: Validate workflow formatting**

Run:

```bash
sed -n '1,280p' .github/workflows/push.yml
```

Expected: `lint`, `typecheck`, and `test` are sibling jobs under `jobs`, and
the test job has the PostgreSQL health check and all required placeholder API
keys.

- [ ] **Step 3: Run final local verification**

Ensure local PostgreSQL is running, then run:

```bash
npx prisma migrate deploy
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected:

- migrations are already applied or apply successfully;
- all quota, middleware, and profile tests PASS;
- lint, typecheck, and build exit 0;
- `git diff --check` emits no output.

- [ ] **Step 4: Review the complete feature diff**

Run:

```bash
git status --short
git diff --stat 18a206c
git diff 18a206c -- \
  prisma src package.json .env.example .github/workflows/push.yml
```

Confirm:

- no unrelated files changed;
- quota rejection occurs before dialog creation;
- the SQL reservation is one conditional upsert;
- every terminal controller failure throws;
- no payment link or random encounter reference remains.

- [ ] **Step 5: Commit CI coverage**

```bash
git add .github/workflows/push.yml
git commit -m "ci: test daily quota with postgres"
```

## Completion Criteria

The implementation is complete only when all five task commits exist, the
working tree contains no unintended changes, and every final verification
command passes. Before claiming completion, use
`superpowers:verification-before-completion`, then
`superpowers:finishing-a-development-branch`.
