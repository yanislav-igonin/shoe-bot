# Rename New Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename temporary Prisma models and PostgreSQL tables to their final
user, chat, and dialog names without losing data.

**Architecture:** Keep the existing data model and application flow intact.
Rename Prisma models/client delegates in place, then use PostgreSQL
`ALTER TABLE ... RENAME TO` statements so rows and relationships survive.

**Tech Stack:** TypeScript 4.9, Prisma ORM 4, PostgreSQL

## Global Constraints

- Preserve all fields, relations, indexes, constraints, and behavior.
- Rename only `NewUser`, `NewChat`, `NewDialog` and their mapped tables.
- Use one data-preserving migration; do not recreate or copy tables.
- Work on `codex/issue-37-rename-tables` without a worktree.

---

### Task 1: Rename Prisma models

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: existing Prisma models `NewUser`, `NewChat`, and `NewDialog`
- Produces: Prisma models `User`, `Chat`, and `Dialog`, mapped to `users`,
  `chats`, and `dialogs`

- [ ] **Step 1: Rename models and table mappings**

Change all schema relations to `User`, `Chat`, and `Dialog`, and map those
models to `users`, `chats`, and `dialogs`.

- [ ] **Step 2: Format, validate, and generate Prisma Client**

Run: `npx prisma format && npx prisma validate && npx prisma generate`

Expected: all Prisma commands exit 0.

- [ ] **Step 3: Verify the generated-client boundary is RED**

Run: `npm run typecheck`

Expected: FAIL on removed `New*` imports and `database.new*` delegates. This
is the behavior boundary for the declarative schema change; a test that
greps Prisma source text would only duplicate the implementation.

### Task 2: Rename TypeScript client references

**Files:**
- Modify: `src/middlewares.ts`
- Modify: `src/lib/context.ts`
- Modify: `src/controllers/activate.controller.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/controllers/textTrigger.controller.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: generated Prisma types/delegates `User`, `Chat`, `Dialog`,
  `database.user`, `database.chat`, and `database.dialog`
- Produces: application code with no `NewUser`, `NewChat`, `NewDialog`,
  `database.newUser`, `database.newChat`, or `database.newDialog` references

- [ ] **Step 1: Update active and commented TypeScript references**

Replace Prisma types with `User`, `Chat`, and `Dialog`. Replace client
delegates with `database.user`, `database.chat`, and `database.dialog`.
Update matching project documentation names.

- [ ] **Step 2: Verify typecheck GREEN**

Run: `npm run typecheck`

Expected: exit 0.

### Task 3: Add the data-preserving migration

**Files:**
- Create:
  `prisma/migrations/20260727000000_rename_new_tables/migration.sql`

**Interfaces:**
- Consumes: PostgreSQL tables `new_users`, `new_chats`, and `new_dialogs`
- Produces: PostgreSQL tables `users`, `chats`, and `dialogs`

- [ ] **Step 1: Add the three rename statements**

Create the migration containing only the three `ALTER TABLE` statements.

- [ ] **Step 2: Verify migration scope**

Run:
`git diff -- prisma/migrations/20260727000000_rename_new_tables/migration.sql`

Expected: exactly three `ALTER TABLE ... RENAME TO` statements and no
drop/create/data-copy statements.

### Task 4: Verify and commit

**Files:**
- Verify all files changed by Tasks 1-3

**Interfaces:**
- Consumes: completed rename
- Produces: reviewable branch with validated schema, code, migration, and tests

- [ ] **Step 1: Scan for stale names**

Run:
`rg -n '\bNew(User|Chat|Dialog)\b|database\.new(User|Chat|Dialog)\b|@@map\("new_(users|chats|dialogs)"\)' prisma src AGENTS.md`

Expected: no matches.

- [ ] **Step 2: Run full verification**

Run:
`npm test && npm run lint && npm run typecheck && npm run build && npx prisma validate`

Expected: every command exits 0.

- [ ] **Step 3: Review diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors and only planned files changed.

- [ ] **Step 4: Commit**

```text
refactor(db): rename temporary tables

Rename the replacement user, chat, and dialog tables in place so existing
rows and relationships are preserved.

Closes #37
```
