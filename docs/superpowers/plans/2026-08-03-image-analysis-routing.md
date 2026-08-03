# Image Analysis Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route image captions and replies to either multimodal text analysis or image editing, including complete Telegram albums.

**Architecture:** Keep the existing `text | image` classifier and generation controllers, but make classification typed with AI SDK `Output.choice()`. Extend the uploaded-image middleware with an exactly-once album debounce, then route photo prompts through shared persistence and text/image execution helpers.

**Tech Stack:** TypeScript, Node.js test runner, grammY, AI SDK 7, xAI provider, MikroORM.

## Global Constraints

- Use the existing `Grok3Mini` classifier and fall back to `text` on every classifier error.
- Do not add provider fallback, settings, or database migrations.
- Private captions need no trigger; group captions require the existing trigger.
- Analyze or edit every album photo in Telegram order.
- Wait for 500 ms of album inactivity and process a caption exactly once.
- A failed text-analysis image download fails the whole request.
- Preserve existing partial image-edit behavior.

---

### Task 1: Typed intent classification

**Files:**
- Modify: `src/lib/prompt.ts`
- Modify: `src/lib/prompt.test.ts`

**Interfaces:**
- Produces: `chooseTask(text, classify?) -> Promise<MessageType.text | MessageType.image>`.
- Consumes: AI SDK `Output.choice({ options: ["text", "image"] })` and `Grok3Mini`.

- [ ] **Step 1: Write failing classifier tests**

Add tests showing that `chooseTask` returns a supplied valid choice and returns `MessageType.text` when the classifier dependency rejects.

- [ ] **Step 2: Verify RED**

Run `npx tsx --test src/lib/prompt.test.ts`. Expect failure because `chooseTask` does not accept the classifier boundary and still parses JSON manually.

- [ ] **Step 3: Implement typed classification**

Use `generateText({ output: Output.choice({ options: [MessageType.text, MessageType.image] as const }) })`. Keep prompt instructions focused on semantic choice rather than JSON formatting. Catch errors around the complete classification call, log them, and return `MessageType.text`.

- [ ] **Step 4: Verify GREEN**

Run `npx tsx --test src/lib/prompt.test.ts` and `npm run typecheck`.

### Task 2: Caption access and album debounce

**Files:**
- Modify: `src/lib/requestAccess.ts`
- Modify: `src/lib/requestAccess.test.ts`
- Modify: `src/middlewares.ts`
- Modify: `src/lib/uploadedImages.ts`
- Modify: `src/lib/uploadedImages.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces: caption-aware `classifyRequest` input from `text ?? caption`.
- Produces: `createUploadedImageMiddleware(replayUpdate, debounceMs?)` that remembers standalone images, buffers albums, and replays one caption update after inactivity.

- [ ] **Step 1: Write failing access tests**

Add literal cases for a private caption being generation access, a triggered group caption being generation access, and an unrelated group caption being ignored.

- [ ] **Step 2: Verify access RED**

Run `npx tsx --test src/lib/requestAccess.test.ts`. Expect caption cases to fail because middleware currently passes only `message.text`.

- [ ] **Step 3: Pass caption text into access classification**

Use `context.message?.text ?? context.message?.caption` in `allowedMiddleware`; keep `classifyRequest` rules unchanged.

- [ ] **Step 4: Write failing album middleware tests**

Exercise real middleware instances with three ordered album updates. Assert no immediate replay, one replay after the injected short debounce, the caption update is replayed, and the store resolves all three photos in numeric Telegram order. Add a standalone-photo case that calls `next` immediately.

- [ ] **Step 5: Verify album RED**

Run `npx tsx --test src/lib/uploadedImages.test.ts`. Expect failure because current middleware has no debounce or replay boundary.

- [ ] **Step 6: Implement album collection**

Add bounded pending-group state beside the existing bounded image store. Mark replayed update IDs so re-entry calls `next` rather than buffering again. Reset the 500 ms timer for every group item and replay only when a caption-bearing update exists.

- [ ] **Step 7: Wire replay in the bot**

Construct middleware with `update => bot.handleUpdate(update)` before state/auth middleware. Register the photo-caption controller added in Task 3 after text handlers.

- [ ] **Step 8: Verify GREEN**

Run `npx tsx --test src/lib/requestAccess.test.ts src/lib/uploadedImages.test.ts` and `npm run typecheck`.

### Task 3: Shared image-prompt routing and multimodal text replies

**Files:**
- Modify: `src/controllers/imageEdit.controller.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/controllers/textTrigger.controller.ts`
- Modify: `src/controllers/index.ts`
- Modify: `src/controllers/text.controller.test.ts`
- Modify: `src/lib/prompt.ts`
- Modify: `src/lib/prompt.test.ts`

**Interfaces:**
- Produces: a shared text-response helper that accepts an existing or new request message.
- Produces: image-prompt routing for text replies and photo captions.
- Consumes: ordered uploaded image resolution, `chooseTask`, existing `generateBetterImageController`, and existing dialog context builders.

- [ ] **Step 1: Write failing multimodal prompt tests**

Add a prompt test proving a current `Message` with `text` and `tgPhotoId` is passed to AI SDK as one user content array containing text and image data.

- [ ] **Step 2: Verify prompt RED**

Run `npx tsx --test src/lib/prompt.test.ts`. Expect failure because `getCompletion` currently casts `Message` to `string` and cannot receive its current image map.

- [ ] **Step 3: Implement current-message image mapping**

Pass `Message | string` and an optional image map through `getCompletion` and `getGrokCompletion` to `addUserContext`.

- [ ] **Step 4: Write failing routing tests**

Add controller tests for: image reply + `text` invokes text completion and sends no photo; image reply + `image` invokes edit; standalone caption persists one multimodal request; caption album passes every ordered source; and one failed text-analysis download returns the normal error without calling completion.

- [ ] **Step 5: Verify routing RED**

Run `npx tsx --test src/controllers/text.controller.test.ts`. Expect failures on the unconditional image-edit branch and missing photo-caption controller.

- [ ] **Step 6: Implement shared routing**

Resolve and persist source messages once, classify once, and dispatch by the routing matrix. Reuse the existing edit worker. Refactor text response persistence into one helper used by ordinary trigger text, image analysis, and caption analysis. Keep the exact replied photo as the request parent and exclude current source messages from historical context before adding them once to the current multimodal request.

- [ ] **Step 7: Implement caption controller**

Extract caption text, strip an optional existing trigger, resolve the complete album, and invoke shared routing. A photo without a caption returns without generation.

- [ ] **Step 8: Verify GREEN**

Run `npx tsx --test src/controllers/text.controller.test.ts src/lib/prompt.test.ts`, `npm run typecheck`, and `npm run lint`.

### Task 4: Baseline cleanup and full verification

**Files:**
- Modify: `src/lib/imageGeneration.test.ts`

**Interfaces:**
- Removes: obsolete threshold test left behind by commit `d0ee0c2`, without changing production moderation behavior.

- [ ] **Step 1: Remove the stale baseline test**

Delete only `blocks high category scores before OpenAI image generation`; threshold rejection was intentionally removed from production before this branch.

- [ ] **Step 2: Run complete verification**

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. All commands must exit zero.

- [ ] **Step 3: Review scope**

Inspect `git diff --check`, `git status --short`, and the complete branch diff. Confirm no migration, provider fallback, generated artifact, or unrelated production change entered the branch.
