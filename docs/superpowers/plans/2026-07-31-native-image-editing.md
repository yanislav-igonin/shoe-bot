# Native Image Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit the exact replied-to Telegram image through the configured native image provider.

**Architecture:** Extend the existing image-generation boundary with an optional source image. Keep provider-specific request shapes local to `imageGeneration.ts`, and simplify the controller to route direct image replies into that boundary.

**Tech Stack:** TypeScript, grammY, MikroORM, Vercel AI SDK, xAI provider, Together SDK, Node test runner

## Global Constraints

- Keep the change local to existing image generation and text reply flow.
- Support documented xAI image editing and documented Together edit-capable models.
- Return a specific response when the selected model cannot edit images.
- Preserve current persistence order and ordinary text reply behavior.

---

### Task 1: Provider request shapes

**Files:**
- Modify: `src/lib/imageGeneration.ts`
- Test: `src/lib/imageGeneration.test.ts`

**Interfaces:**
- Consumes: edit prompt, configured provider/model, source image URL
- Produces: `generateImage(em, text, sourceImageUrl?)`

- [ ] Add failing tests for xAI image prompts and Together model capability routing.
- [ ] Run `npm test -- src/lib/imageGeneration.test.ts` and confirm expected failures.
- [ ] Add minimal provider request construction and unsupported-model error.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Direct reply routing

**Files:**
- Modify: `src/controllers/text.controller.ts`
- Create: `src/controllers/text.controller.test.ts`
- Modify: `src/lib/replies.ts`

**Interfaces:**
- Consumes: direct reply target and its Telegram photo ID
- Produces: native edit call for image replies; normal completion for other replies

- [ ] Add a failing routing test showing only a direct image reply is editable.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Remove the vision-description-regeneration flow and pass the exact Telegram image URL into `generateImage`.
- [ ] Add the unsupported-model reply and preserve image context for normal text replies.
- [ ] Run focused tests and confirm they pass.

### Task 3: Verification and publish

**Files:**
- Verify all changed files and Git diff.

- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Run the requested independent Cursor review exactly once and assess its findings.
- [ ] Fix validated findings and rerun local verification.
- [ ] Commit, push `codex/issue-35-image-edit`, and open a draft PR linked with `Closes #35`.
