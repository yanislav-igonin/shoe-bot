# Parallel Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Process independent Telegram requests concurrently through grammY's official long-polling runner.

**Architecture:** Replace sequential `bot.start()` with `run(bot)` and remove the uploaded-image middleware's shared downstream promise queue. Keep album debounce/replay and per-update database isolation intact, and make first-time chat/user/settings creation atomic with database upserts.

**Tech Stack:** TypeScript, Node.js 22, grammY 1.x, `@grammyjs/runner` 2.x, MikroORM, Node test runner.

## Global Constraints

- Do not add an application concurrency limit, queue, or sequentialization key.
- Preserve album debounce, caching, and exactly-once caption replay.
- Preserve `bot.catch` update-error handling and close MikroORM after runner termination.
- Do not add an environment variable. Add only the unique chat-ID migration required for atomic upserts.

---

### Task 1: Concurrent downstream middleware

**Files:**
- Modify: `src/lib/uploadedImages.test.ts`
- Modify: `src/lib/uploadedImages.ts`

**Interfaces:**
- Consumes: `createUploadedImageMiddleware(options)` and grammY `next()` callbacks.
- Produces: middleware that lets separate updates execute downstream concurrently.

- [ ] Replace the serialization test with a controlled-promise test. Start two standalone-photo updates, keep the first `next()` blocked, and assert the second `next()` completes before releasing the first.
- [ ] Run `npm test -- src/lib/uploadedImages.test.ts` and confirm failure because the second update remains queued.
- [ ] Delete the shared `downstream` promise and `runDownstream`; await `next()` directly in all three pass-through branches.
- [ ] Run `npm test -- src/lib/uploadedImages.test.ts` and confirm all uploaded-image tests pass.

### Task 2: Concurrent long polling

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `run(bot)` from `@grammyjs/runner`.
- Produces: a `RunnerHandle` whose task reports polling failure/completion and whose `stop()` method drains in-flight updates on `SIGINT` or `SIGTERM`.

- [ ] Install `@grammyjs/runner@^2.0.3` with npm.
- [ ] Import `run`, replace `bot.start()` with `const runner = run(bot)`, and attach error logging plus database closure to `runner.task()`.
- [ ] Register one-shot `SIGINT` and `SIGTERM` listeners that call `runner.stop()` only while it is running.
- [ ] Run `npm run typecheck` and confirm runner API usage compiles.

### Task 3: Parallel-safe request state

**Files:**
- Modify: `src/entities.ts`
- Modify: `src/middlewares.ts`
- Modify: `src/middlewares.test.ts`
- Modify: `src/lib/database.integration.test.ts`
- Modify: `src/migrations/.snapshot.json`
- Create: `src/migrations/Migration20260812000000.ts`

**Interfaces:**
- Consumes: Telegram chat/user IDs and per-update MikroORM entity managers.
- Produces: one database row per Telegram chat, user, and settings record even when first requests overlap.

- [ ] Add failing unit tests requiring missing request-state entities to use `em.upsert`.
- [ ] Add a unique index for `Chat.tgId` and a migration that creates it.
- [ ] Upsert missing chats, users, and user settings by their unique keys.
- [ ] Run a PostgreSQL integration test with concurrent entity managers and confirm each pair resolves to one row.

### Task 4: Verification and review

**Files:**
- Verify all changed files.

**Interfaces:**
- Consumes: complete implementation diff.
- Produces: reviewed, release-ready branch for issue #52.

- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- [ ] Run Rejudge against the branch diff and fix every valid actionable finding.
- [ ] Repeat the complete verification suite after review fixes.
- [ ] Commit with a concise conventional message referencing issue #52.
- [ ] Push `codex/parallel-requests` and open a GitHub pull request targeting the repository default branch with `Closes #52` in the body.
