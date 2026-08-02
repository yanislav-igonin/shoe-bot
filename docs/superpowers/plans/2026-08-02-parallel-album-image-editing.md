# Parallel Album Image Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Process album image edits with five concurrent workers and return each result immediately on completion.

**Architecture:** Keep orchestration local to the existing image-edit controller. A five-worker pool processes indexed sources; every source uses an isolated MikroORM fork and records its own outcome for the existing aggregate error handling.

**Tech Stack:** TypeScript, grammY, MikroORM, Node test runner

## Global Constraints

- Maximum concurrency is exactly five source images per album edit request.
- Send each successful result immediately when its source finishes.
- Do not add captions or grammY runner.
- Preserve partial-failure and all-failure behavior.
- Add no dependency and keep production changes in the existing controller.

---

### Task 1: Parallel album orchestration

**Files:**
- Modify: `src/controllers/text.controller.test.ts`
- Modify: `src/controllers/imageEdit.controller.ts`

**Interfaces:**
- Consumes: existing `generateBetterImageController` inputs and dependencies
- Produces: the same `Promise<void>` contract with bounded concurrent execution

- [ ] Replace the sequential-order test with a controlled-promise test proving two edits start together and the second completed edit is sent before the first completes.
- [ ] Add a controlled-promise test proving a sixth edit does not start until one of the first five finishes.
- [ ] Run the focused test and confirm both new behaviors fail against the sequential loop.
- [ ] Implement a local five-worker loop. Fork the request EntityManager once per source, use fork-local references when persisting the bot response, and store errors by source index.
- [ ] Sort failed image numbers before rendering the existing partial-failure reply and select the first error in source order for all-failure handling.
- [ ] Run focused tests and confirm parallel, partial-failure, and all-failure cases pass.

### Task 2: Verification

**Files:**
- Verify all modified files

**Interfaces:**
- Consumes: completed Task 1
- Produces: verified repository state

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check` and the final diff for scope and error-semantics regressions.
