# MikroORM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Prisma with MikroORM 7 while preserving the current
PostgreSQL schema, stored data, bot behavior, and independent durability
boundaries around external LLM calls.

**Architecture:** A single application-owned MikroORM instance provides one
forked `EntityManager` per Telegram update through `BotContext.state.em`.
Entities and their relations replace generated Prisma types and CRUD calls.
Atomic quota and aggregate statistics queries remain parameterized raw SQL
through the MikroORM PostgreSQL connection.

**Tech Stack:** Node.js 22, TypeScript 5.8, MikroORM 7.1.7, PostgreSQL,
grammY, Node test runner.

## Global Constraints

- Preserve current table, column, enum, index, constraint, and seed-data names.
- Do not hold a database transaction open during LLM or Telegram API calls.
- Use one forked `EntityManager` per Telegram update.
- Keep raw SQL only for daily quota and statistics aggregates.
- Do not add repositories, a dependency-injection container, or generic base
  entities.
- Replace the Prisma migration history with one MikroORM initial migration.
- Existing databases baseline with `mikro-orm migration:log`; empty databases
  execute the initial migration normally.

---

## File Structure

- `src/entities.ts`: all nine related entity declarations and both enums.
- `src/lib/database.ts`: MikroORM configuration, singleton initialization, and
  shutdown.
- `src/migrations/Migration20260727000000.ts`: exact baseline schema and seeds.
- `src/lib/context.ts`: request-scoped `EntityManager` and entity state types.
- `src/middlewares.ts`: create the request EM and migrate existing middleware
  CRUD.
- Existing controllers and libraries: replace Prisma calls locally without
  adding wrapper layers.
- `src/entities.test.ts`: entity behavior and metadata checks without a live DB.
- `src/lib/database.integration.test.ts`: opt-in disposable PostgreSQL
  migration and representative persistence checks.

---

### Task 1: Add MikroORM Foundation and Entity Metadata

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Create: `src/entities.ts`
- Replace: `src/lib/database.ts`
- Create: `src/entities.test.ts`

**Interfaces:**

- Produces: `entities: EntityClass[]`
- Produces: `createDatabase(clientUrl?: string): Promise<MikroORM<PostgreSqlDriver>>`
- Produces: `orm: MikroORM<PostgreSqlDriver>`
- Produces: `initializeDatabase(): Promise<void>`
- Produces: `closeDatabase(): Promise<void>`
- Produces entity classes `User`, `DailyRequestUsage`, `Chat`, `Dialog`,
  `Message`, `ActivationCode`, `BotRole`, `UserSettings`, and `Setting`.

- [ ] **Step 1: Install the matching MikroORM packages**

Run:

```bash
npm install @mikro-orm/core@7.1.7 @mikro-orm/postgresql@7.1.7 \
  @mikro-orm/migrations@7.1.7 @mikro-orm/decorators@7.1.7
npm install --save-dev @mikro-orm/cli@7.1.7
```

Keep Prisma installed until all consumers have migrated so the intermediate
tree can still typecheck.

- [ ] **Step 2: Write the failing entity metadata test**

Create `src/entities.test.ts`:

```ts
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { MikroORM } from '@mikro-orm/postgresql';
import {
  ActivationCode,
  BotRole,
  Chat,
  DailyRequestUsage,
  Dialog,
  Message,
  Setting,
  User,
  UserSettings,
  entities,
} from './entities.js';

describe('MikroORM entity metadata', () => {
  it('maps every current database table', async () => {
    const orm = await MikroORM.init({
      clientUrl: 'postgresql://postgres:postgres@localhost/shoe_bot_metadata',
      connect: false,
      entities,
    });

    const tableNames = [
      ActivationCode,
      BotRole,
      Chat,
      DailyRequestUsage,
      Dialog,
      Message,
      Setting,
      User,
      UserSettings,
    ]
      .map((entity) => orm.getMetadata().get(entity).tableName)
      .sort();

    assert.deepEqual(tableNames, [
      'activation_codes',
      'bot_roles',
      'chats',
      'daily_request_usages',
      'dialogs',
      'messages',
      'settings',
      'user_settings',
      'users',
    ]);

    await orm.close();
  });

  it('keeps date and relation column names compatible with Prisma', async () => {
    const orm = await MikroORM.init({
      clientUrl: 'postgresql://postgres:postgres@localhost/shoe_bot_metadata',
      connect: false,
      entities,
    });
    const user = orm.getMetadata().get(User);
    const message = orm.getMetadata().get(Message);

    assert.deepEqual(user.properties.allowedTill.fieldNames, ['allowedTill']);
    assert.deepEqual(message.properties.user.fieldNames, ['userId']);
    assert.deepEqual(message.properties.replyTo.fieldNames, ['replyToId']);

    await orm.close();
  });
});
```

- [ ] **Step 3: Run the metadata test and verify RED**

Run:

```bash
npm test -- src/entities.test.ts
```

Expected: FAIL because `src/entities.ts` and its exports do not exist.

- [ ] **Step 4: Implement the nine entities and database singleton**

Use MikroORM v7 ES decorators from `@mikro-orm/decorators/es`. Map every
database name explicitly, including:

```ts
@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey()
  id!: number;

  @Property({ nullable: true })
  username: string | null = null;

  @Property({ fieldName: 'tgId', unique: true })
  tgId!: string;

  @Property({ columnType: 'date', fieldName: 'allowedTill', nullable: true })
  allowedTill: Date | null = null;

  @Property({ fieldName: 'createdAt' })
  createdAt = new Date();
}
```

Define relation properties with explicit owning columns and keep scalar foreign
key access available through MikroORM relation metadata. Preserve:

- `User.settings` as nullable one-to-one;
- `Message.dialog` and `Message.replyTo` as nullable;
- `ActivationCode.usedByUser` as nullable;
- `UserSettings.user` as unique one-to-one;
- `DailyRequestUsage` unique `(user, date)`;
- `Setting.key` as the string primary key.

Replace `src/lib/database.ts` with an explicit factory and lifecycle:

```ts
export const createDatabase = async (
  clientUrl = config.databaseUrl,
): Promise<MikroORM<PostgreSqlDriver>> =>
  MikroORM.init<PostgreSqlDriver>({
    clientUrl,
    driver: PostgreSqlDriver,
    entities,
    extensions: [Migrator],
    migrations: {
      path: 'dist/migrations',
      pathTs: 'src/migrations',
      tableName: 'mikro_orm_migrations',
      transactional: true,
    },
  });

export let orm: MikroORM<PostgreSqlDriver>;

export const initializeDatabase = async () => {
  orm = await createDatabase();
};

export const closeDatabase = async () => {
  await orm.close(true);
};
```

This keeps startup I/O in `src/index.ts`, not at module import time. Integration
tests and the benchmark script use `createDatabase()` without mutating the
application singleton.

- [ ] **Step 5: Run the metadata test and verify GREEN**

Run:

```bash
npm test -- src/entities.test.ts
```

Expected: both metadata tests PASS without opening a database connection.

- [ ] **Step 6: Run typecheck and commit the foundation**

Run:

```bash
npm run typecheck
```

Prisma consumers may still compile against the retained Prisma dependency.

Commit:

```bash
git add package.json package-lock.json tsconfig.json src/entities.ts \
  src/entities.test.ts src/lib/database.ts
git commit -m "refactor(db): add MikroORM entity model"
```

---

### Task 2: Add and Verify the Baseline Migration

**Files:**

- Create: `src/migrations/Migration20260727000000.ts`
- Create: `src/lib/database.integration.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `orm` and all entities from Task 1.
- Produces scripts `migration:up`, `migration:down`, `migration:status`, and
  `migration:baseline`.

- [ ] **Step 1: Write the failing migration integration test**

The test must require an explicitly disposable URL ending in `_test`:

```ts
const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl?.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must target a database ending in _test');
}
```

Create `src/lib/database.integration.test.ts` that initializes a dedicated ORM,
runs `migrator.up()`, then queries `information_schema.tables` and
`pg_constraint`. Assert all nine tables exist and
`daily_request_usages_used_check` exists.

- [ ] **Step 2: Start disposable PostgreSQL and verify RED**

Create the isolated test database:

```bash
docker compose up -d postgres
createdb postgresql://postgres:postgres@localhost/shoe_bot_test
```

Run:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_test \
  npm test -- src/lib/database.integration.test.ts
```

Expected: FAIL because no baseline migration exists.

- [ ] **Step 3: Write the exact initial migration**

Implement `Migration20260727000000` with explicit SQL that creates:

- PostgreSQL enums `ChatType` and `MessageType`;
- all nine current tables;
- current primary keys, unique indexes, foreign keys, defaults, and the quota
  check constraint;
- the bot user with `id = 0`;
- both default bot roles;
- `imageProvider` and `imageModel` settings.

The final physical table names must be `users`, `chats`, and `dialogs`; do not
recreate the historical `new_*` names.

Implement `down()` in dependency-safe order:

```text
daily_request_usages, activation_codes, user_settings, messages,
dialogs, bot_roles, chats, settings, users, enums
```

- [ ] **Step 4: Add migration scripts**

Replace Prisma's migration script with:

```json
{
  "migration:up": "mikro-orm migration:up",
  "migration:down": "mikro-orm migration:down",
  "migration:status": "mikro-orm migration:list",
  "migration:baseline": "mikro-orm migration:log"
}
```

- [ ] **Step 5: Recreate the disposable DB and verify GREEN**

Run:

```bash
dropdb postgresql://postgres:postgres@localhost/shoe_bot_test
createdb postgresql://postgres:postgres@localhost/shoe_bot_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_test \
  npm test -- src/lib/database.integration.test.ts
```

Expected: PASS with nine application tables, both enums, seed rows, and the
quota check constraint.

- [ ] **Step 6: Commit the baseline**

```bash
git add package.json src/migrations/Migration20260727000000.ts \
  src/lib/database.integration.test.ts
git commit -m "refactor(db): add MikroORM baseline"
```

---

### Task 3: Introduce the Request-Scoped EntityManager

**Files:**

- Modify: `src/lib/context.ts`
- Modify: `src/middlewares.ts`
- Modify: `src/index.ts`
- Create: `src/middlewares.test.ts`

**Interfaces:**

- Produces `entityManagerMiddleware(context, next): Promise<void>`.
- Produces `BotContext.state.em: EntityManager`.
- Existing state fields become MikroORM entity types.

- [ ] **Step 1: Write failing middleware tests**

Create focused tests using a fake ORM whose `em.fork()` returns unique objects.
Verify:

```ts
it('assigns one forked entity manager to each update', async () => {
  const first = createContext();
  const second = createContext();

  await entityManagerMiddleware(first, async () => undefined);
  await entityManagerMiddleware(second, async () => undefined);

  assert.notEqual(first.state.em, second.state.em);
});
```

Also verify downstream middleware receives the same `em` stored in state.
Inject the `fork` function into the middleware factory if needed; use an
ordinary function argument rather than a DI container.

- [ ] **Step 2: Run middleware tests and verify RED**

```bash
npm test -- src/middlewares.test.ts
```

Expected: FAIL because `entityManagerMiddleware` does not exist.

- [ ] **Step 3: Implement request EM and migrate data-loading middleware**

Register middleware in this order:

```ts
bot.use(stateMiddleware);
bot.use(entityManagerMiddleware);
bot.use(chatMiddleware);
bot.use(userMiddleware);
bot.use(allowedMiddleware);
bot.use(dialogMiddleware);
bot.use(userSettingsMiddleware);
```

Replace Prisma calls in `chatMiddleware`, `userMiddleware`,
`dialogMiddleware`, and `userSettingsMiddleware` with the context EM:

```ts
const chat = await em.findOne(Chat, { tgId });
const newChat = em.create(Chat, data);
em.persist(newChat);
await em.flush();
```

Ensure every entity put in `context.state` was loaded or created by that same
EM. Use explicit flushes at the same points where Prisma previously completed
writes.

Update startup and shutdown:

```ts
await initializeDatabase();
await closeDatabase();
```

- [ ] **Step 4: Verify middleware tests GREEN**

```bash
npm test -- src/middlewares.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit request-scoped persistence**

```bash
git add src/lib/context.ts src/middlewares.ts src/middlewares.test.ts \
  src/index.ts
git commit -m "refactor(db): scope entity manager per update"
```

---

### Task 4: Migrate Controllers and Preserve Flush Boundaries

**Files:**

- Modify: `src/controllers/activate.controller.ts`
- Modify: `src/controllers/admin/generate.controller.ts`
- Modify: `src/controllers/get-bot-roles.controller.ts`
- Modify: `src/controllers/set-bot-role.controller.ts`
- Modify: `src/controllers/shicture.controller.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/controllers/textTrigger.controller.ts`
- Modify: `src/lib/prompt.ts`
- Modify: `src/lib/prompt.test.ts`
- Create: `src/controllers/persistence.test.ts`

**Interfaces:**

- Consumes `context.state.em` and MikroORM entities.
- Preserves independent flush before and after LLM/image provider calls.

- [ ] **Step 1: Write failing persistence-boundary tests**

Extract only the persistence sequence needed for testing into a controller-local
function with injected external completion callback:

```ts
await saveUserMessage();
const completion = await complete();
await saveBotMessage(completion);
```

Test that `saveUserMessage` completes before `complete` starts and remains
completed when `complete` rejects. Do not mock MikroORM internals; test the
observable ordering through injected I/O boundaries.

- [ ] **Step 2: Run controller persistence tests and verify RED**

```bash
npm test -- src/controllers/persistence.test.ts
```

Expected: FAIL because the MikroORM persistence flow does not exist.

- [ ] **Step 3: Replace simple controller CRUD**

Use `context.state.em` for queries and writes:

```ts
const activationCode = await em.findOne(ActivationCode, { code });
user.allowedTill = newAllowedTill;
activationCode.usedByUser = user;
await em.flush();
```

Use `em.find`, `em.findOne`, `em.create`, `em.persist`, and `em.flush`.
Preserve existing replies and validation branches.

- [ ] **Step 4: Replace message controller CRUD**

For `text.controller.ts`, `textTrigger.controller.ts`, and
`shicture.controller.ts`:

- create and flush the user message before external AI/image I/O;
- create and flush the bot message only after a response exists;
- use MikroORM relation properties for dialog, user, and reply chains;
- preserve current ordering and query limits;
- do not wrap the external call in `em.transactional()`.

Replace Prisma `Message` and `MessageType` imports in prompt code and tests with
the local entity exports.

- [ ] **Step 5: Verify controller tests GREEN**

```bash
npm test -- src/controllers/persistence.test.ts
npm test
npm run typecheck
```

- [ ] **Step 6: Commit controller migration**

```bash
git add src/controllers src/lib/prompt.ts src/lib/prompt.test.ts
git commit -m "refactor(db): migrate controllers to MikroORM"
```

---

### Task 5: Migrate Raw SQL, Settings, and Benchmark Script

**Files:**

- Modify: `src/lib/dailyQuota.ts`
- Modify: `src/lib/imageGeneration.ts`
- Modify: `src/repositories/stats.repository.ts`
- Modify: `src/scripts/image-generation-benchmark.ts`
- Modify: `src/lib/database.integration.test.ts`

**Interfaces:**

- `reserveDailyRequest(em, userId): Promise<number | null>`
- `refundDailyRequest(em, userId): Promise<void>`
- `getRemainingDailyRequests(em, userId): Promise<number>`
- Statistics functions accept an `EntityManager` or SQL connection explicitly.

- [ ] **Step 1: Extend integration tests for atomic quota behavior**

Add tests that:

- reserve three times returns `1`, `2`, `3`;
- the fourth reserve returns `null`;
- refund makes one request available again;
- concurrent reserve calls never raise usage above three.

- [ ] **Step 2: Run quota integration test and verify RED**

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_test \
  npm test -- src/lib/database.integration.test.ts
```

Expected: FAIL because the quota functions still depend on Prisma.

- [ ] **Step 3: Port parameterized raw SQL**

Use `em.getConnection().execute()` with bound parameters. Preserve the current
single-statement quota upsert and the three grouped statistics queries. Never
concatenate user IDs, dates, or limits into SQL strings.

Pass the request EM from `allowedMiddleware` and admin controllers. Do not read
a global EM inside these helpers.

- [ ] **Step 4: Port settings and benchmark persistence**

Use entity queries for settings:

```ts
const setting = await em.findOne(Setting, { key: 'imageModel' });
setting.value = model.id;
await em.flush();
```

The benchmark script initializes its own ORM instance, forks an EM for its run,
restores the original model in `finally`, and closes the ORM in the outer
`finally`.

- [ ] **Step 5: Verify integration and full tests GREEN**

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_test \
  npm test -- src/lib/database.integration.test.ts
npm test
npm run typecheck
```

- [ ] **Step 6: Commit remaining consumers**

```bash
git add src/lib/dailyQuota.ts src/lib/imageGeneration.ts \
  src/repositories/stats.repository.ts \
  src/scripts/image-generation-benchmark.ts \
  src/lib/database.integration.test.ts
git commit -m "refactor(db): port SQL and settings access"
```

---

### Task 6: Remove Prisma and Perform Final Verification

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `prisma/schema.prisma`
- Delete: `prisma/migrations/`
- Modify: `.github/workflows/push.yml` only if database integration coverage is
  intentionally added to CI.
- Modify: `AGENTS.md` only to remove stale Prisma-specific project facts.

**Interfaces:**

- No application interface changes.
- Repository contains no Prisma runtime, schema, or migration references.

- [ ] **Step 1: Prove Prisma references still fail the completion criterion**

Run:

```bash
rg -n "@prisma/client|PrismaClient|Prisma\\.sql|prisma migrate|schema\\.prisma" \
  src package.json AGENTS.md
```

Expected: matches remain before cleanup.

- [ ] **Step 2: Remove Prisma packages and files**

Run:

```bash
npm uninstall @prisma/client
npm uninstall --save-dev prisma
```

Delete the Prisma schema and migration history with `apply_patch`. Update stale
project documentation to name MikroORM and the new migration commands.

- [ ] **Step 3: Verify no Prisma references remain**

Run:

```bash
rg -n "@prisma/client|PrismaClient|Prisma\\.sql|prisma migrate|schema\\.prisma" \
  src package.json AGENTS.md
```

Expected: no matches.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_test \
  npm test -- src/lib/database.integration.test.ts
npx mikro-orm migration:check
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 5: Verify empty-DB migration and existing-DB baseline paths**

Empty DB:

```bash
dropdb postgresql://postgres:postgres@localhost/shoe_bot_test
createdb postgresql://postgres:postgres@localhost/shoe_bot_test
DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_test \
  npm run migration:up
```

Existing schema baseline in a separately restored disposable database:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_existing_test \
  npm run migration:baseline
DATABASE_URL=postgresql://postgres:postgres@localhost/shoe_bot_existing_test \
  npm run migration:status
```

Confirm the initial migration is logged without executing schema-creation SQL.

- [ ] **Step 6: Review diff against the approved design**

Verify:

- request EM appears before all DB-backed middleware;
- every external LLM/image call has the intended earlier flush;
- no outer transaction contains external I/O;
- quota remains one atomic statement;
- all current seeds appear in the baseline;
- physical schema names match production.

- [ ] **Step 7: Commit cleanup**

```bash
git add package.json package-lock.json src .github/workflows/push.yml AGENTS.md
git add -u prisma
git commit -m "refactor(db): remove Prisma"
```
