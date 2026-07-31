# Uploaded Image Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit a trigger-replied uploaded photo or every photo in its Telegram media group.

**Architecture:** Add one bounded process-local upload cache at the Telegram update boundary, then reuse the existing native image-edit controller with resolved source descriptors. Persist resolved uploads only inside the triggered edit flow.

**Tech Stack:** TypeScript, grammY, MikroORM, Node test runner

## Global Constraints

- Keep changes to at most five production files.
- Do not add a database migration or persist untriggered photo messages.
- Process album images sequentially and send results as individual photos.
- Fall back to the exact replied photo when the album cache has no entry.

---

### Task 1: Bounded uploaded-image cache

**Files:**
- Create: `src/lib/uploadedImages.ts`
- Create: `src/lib/uploadedImages.test.ts`

**Interfaces:**
- Consumes: grammY photo messages and middleware contexts
- Produces: `createUploadedImageStore(maxMediaGroups?)`, `uploadedImageStore`, and `uploadedImageMiddleware`

- [ ] Write tests proving standalone fallback, ordered album lookup, chat isolation, deduplication, and oldest-group eviction.
- [ ] Run `npm test -- src/lib/uploadedImages.test.ts` and confirm failure because the module is absent.
- [ ] Implement the smallest map-backed store and middleware.
- [ ] Run the focused test and confirm it passes.

### Task 2: Triggered upload persistence and sequential editing

**Files:**
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/controllers/text.controller.test.ts`
- Modify: `src/controllers/textTrigger.controller.ts`

**Interfaces:**
- Consumes: uploaded sources resolved from the reply and existing persisted bot images
- Produces: one persisted source row per resolved upload, one edit request, and one generated response per source

- [ ] Write tests proving source-message construction and exact reply-target selection.
- [ ] Run the focused tests and confirm expected missing-export failures.
- [ ] Generalize the existing edit controller around source descriptors and sequential generation.
- [ ] Route photo replies from `textTriggerController` into the generalized edit controller before classification.
- [ ] Run focused and full tests and confirm they pass.

### Task 3: Update-boundary registration and verification

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: every Telegram update before access filtering
- Produces: cached photo metadata without database persistence

- [ ] Register `uploadedImageMiddleware` before database-backed middleware.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Run the explicitly requested Cursor review exactly once and validate each finding.
- [ ] Fix valid findings, rerun verification, commit, push, and open a PR containing `Closes #45`.
