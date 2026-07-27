# MikroORM Migration Design

## Goal

Replace Prisma with MikroORM while preserving the current PostgreSQL schema,
data, and bot behavior. Use one request-scoped `EntityManager` per Telegram
update and commit database changes at explicit `flush()` boundaries.

## Decisions

- Use MikroORM 7 with the PostgreSQL driver and migrations extension.
- Work on branch `codex/mikro-orm-migration`.
- Preserve all existing table, column, enum, index, and constraint names.
- Keep related entity declarations together instead of adding repository
  classes or one file per small entity.
- Use MikroORM entities and `EntityManager` for ordinary CRUD.
- Keep parameterized raw SQL for the atomic daily-quota operations and
  statistics aggregates.
- Do not hold a database transaction open while waiting for an LLM or
  Telegram API response.
- Replace the Prisma migration history with one MikroORM initial migration
  representing the database's current state.

## Non-Goals

- No database redesign or column renaming.
- No changes to bot commands, replies, subscription rules, quotas, or LLM
  behavior.
- No repository abstraction or dependency-injection container.
- No data-copy migration.
- No concurrent Prisma and MikroORM runtime period.

## Architecture

`src/lib/database.ts` owns the single long-lived MikroORM instance. Application
startup initializes it and shutdown closes it.

An entity-manager middleware runs after `stateMiddleware` and before all
database-backed middleware. It creates `orm.em.fork()` and stores it in
`context.state.em`. All middleware and controllers handling that Telegram
update use this same fork. This gives the update an isolated Identity Map and
Unit of Work without introducing MikroORM's implicit AsyncLocalStorage-based
`RequestContext`.

The existing `BotContext` state continues to carry loaded `User`, `Chat`,
`Dialog`, and `UserSettings` entities. Each entity must be loaded or created by
the `EntityManager` stored in the same context.

## Entity Model

MikroORM entities map the current Prisma models exactly:

- `User`
- `DailyRequestUsage`
- `Chat`
- `Dialog`
- `Message`
- `ActivationCode`
- `BotRole`
- `UserSettings`
- `Setting`

`ChatType` and `MessageType` remain string-backed PostgreSQL enums. Relations,
nullability, defaults, unique constraints, self-referencing message replies,
and date-only columns retain their current database representation.

Entities may contain small behavior methods when the method names a domain
operation. Ordinary field assignment remains acceptable; no speculative base
entity or generic repository layer is introduced.

## Data Flow and Flush Boundaries

`flush()` is a durability boundary, not a once-per-request rule. Each flush
synchronizes the current Unit of Work and commits independently unless the
caller explicitly opened an outer transaction.

The text-generation flow saves the incoming message before external I/O:

```ts
em.persist(userMessage);
await em.flush();

const completion = await getCompletion();

em.persist(botMessage);
await em.flush();
```

If the LLM request fails, the already committed user message remains in the
database. No `em.transactional()` block may wrap the LLM call.

Operations that must be atomic may use an explicit short transaction. The
transaction must contain only database work and must not contain LLM or
Telegram network calls.

## Raw SQL

`dailyQuota.ts` keeps raw SQL because its conditional
`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` must remain one atomic
database statement.

`stats.repository.ts` keeps raw SQL because its grouped counts are clearer as
SQL than as an entity graph.

Both modules execute parameterized SQL through the MikroORM PostgreSQL
connection. User-provided or runtime values must never be interpolated into SQL
strings.

## Migration Strategy

Delete `prisma/schema.prisma`, the Prisma migration directories, and the Prisma
runtime dependencies after the MikroORM replacement is complete.

Create one MikroORM initial migration whose `up()` builds the exact current
schema and whose `down()` removes only objects created by that migration in
dependency-safe order.

For an empty database, run the initial migration normally.

For an existing database, register the initial migration as already executed
without running its schema-creation SQL. Before rollout, compare the existing
database schema with the initial migration's expected end state. A production
deployment must not execute `CREATE TABLE` statements against the existing
tables.

Future schema changes use MikroORM migration generation and execution. Automatic
schema synchronization remains disabled in every environment.

## Error Handling

- A failed flush propagates through the existing controller error path.
- An LLM failure after the first message flush does not roll back that message.
- Shutdown closes MikroORM only after initialization succeeded.
- Missing records retain the controllers' current user-facing replies.
- Unique and foreign-key constraints remain enforced by PostgreSQL.

## Testing and Verification

- Add focused tests for new entity behavior and database helpers where they
  introduce application logic.
- Run the existing Node test suite to protect prompt and controller-adjacent
  behavior.
- Run TypeScript type checking, ESLint, and the production build.
- Apply the initial migration to an empty disposable PostgreSQL database.
- Verify that all nine tables, both enums, relations, unique constraints, and
  defaults match the current Prisma schema.
- Exercise representative CRUD paths and both raw-SQL modules against the
  disposable database.

## Completion Criteria

- No production or test import references `@prisma/client`.
- Prisma dependencies, schema, and migrations are absent.
- Every database-backed Telegram update uses one forked `EntityManager`.
- User and bot messages can be flushed independently around the LLM call.
- Daily quota remains atomic.
- Existing tests, type checking, linting, and build pass.
- The initial migration creates a working empty database without schema drift.
