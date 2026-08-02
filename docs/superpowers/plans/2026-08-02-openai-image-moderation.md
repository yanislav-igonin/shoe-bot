# OpenAI Image Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject unsafe OpenAI image generation and editing inputs before calling the image API.

**Architecture:** Keep provider-specific moderation beside `generateWithOpenAi` in the existing image generation module. A custom rejection error crosses the existing controller boundary so image-edit requests receive a dedicated user reply, while moderation service failures remain fail-closed through existing error handling.

**Tech Stack:** TypeScript, OpenAI Node SDK 7.3, Node test runner, grammY.

## Global Constraints

- Moderate only OpenAI image requests with `omni-moderation-latest`.
- Moderate text for generation and text plus source image for editing.
- Block on aggregate `flagged`; add no score thresholds.
- Let moderation API failures abort generation.
- Add no dependencies, settings, migrations, retries, or audit storage.

---

### Task 1: Provider-level moderation guard

**Files:**
- Modify: `src/lib/imageGeneration.ts:44-49,224-243`
- Test: `src/lib/imageGeneration.test.ts:202-263`

**Interfaces:**
- Consumes: existing `openai` client and optional source image data URL.
- Produces: `ImageModerationRejectedError` and guarded `generateImage(em, text, sourceImageUrl?)` behavior.

- [ ] **Step 1: Write failing generation and edit tests**

Add tests that replace `openai.moderations.create` and image methods only at the external API boundary. Assert a safe request sends `{ model: "omni-moderation-latest", input: "draw a shoe" }`, then generates. Assert a flagged response rejects with `ImageModerationRejectedError` and leaves the image API call count at zero. For editing, assert the moderation input contains `"make it red"` and `"data:image/jpeg;base64,AQID"`; when flagged, assert `openai.images.edit` is never called.

- [ ] **Step 2: Run generation tests and verify RED**

Run: `npx tsx --test src/lib/imageGeneration.test.ts`

Expected: FAIL because `ImageModerationRejectedError` and the moderation call do not exist.

- [ ] **Step 3: Implement minimal text moderation**

Add the error and a local helper equivalent to:

```ts
export class ImageModerationRejectedError extends Error {
  constructor() {
    super("OpenAI image input was rejected by moderation");
    this.name = "ImageModerationRejectedError";
  }
}

const moderateOpenAiImageInput = async (
  text: string,
  sourceImageUrl?: string,
) => {
  const input = sourceImageUrl
    ? [
        { type: "text" as const, text },
        { type: "image_url" as const, image_url: { url: sourceImageUrl } },
      ]
    : text;
  const moderation = await openai.moderations.create({
    input,
    model: "omni-moderation-latest",
  });
  if (moderation.results.some(({ flagged }) => flagged)) {
    throw new ImageModerationRejectedError();
  }
};
```

Await it at the beginning of `generateWithOpenAi`.

- [ ] **Step 4: Run generation tests and verify GREEN**

Run: `npx tsx --test src/lib/imageGeneration.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit provider guard**

```bash
git add src/lib/imageGeneration.ts src/lib/imageGeneration.test.ts
git commit -m "feat(images): moderate OpenAI inputs"
```

### Task 2: Dedicated moderation rejection reply

**Files:**
- Modify: `src/lib/replies.ts:24-33`
- Modify: `src/controllers/imageEdit.controller.ts:6-10,87-90`
- Modify: `src/controllers/textTrigger.controller.ts:14-20,139-149`
- Modify: `src/controllers/shicture.controller.ts:5-10,69-79`
- Test: `src/controllers/text.controller.test.ts:129-146`

**Interfaces:**
- Consumes: `ImageModerationRejectedError` from Task 1.
- Produces: `replies.imageModerationRejected` and `getImageGenerationErrorReply(error)` mapping.

- [ ] **Step 1: Write failing reply mapping test**

Add a test that passes `new ImageModerationRejectedError()` to `getImageGenerationErrorReply` and expects `replies.imageModerationRejected`.

- [ ] **Step 2: Run controller test and verify RED**

Run: `npx tsx --test src/controllers/text.controller.test.ts`

Expected: FAIL because the reply and mapping do not exist.

- [ ] **Step 3: Implement dedicated reply mapping**

Add a concise Russian rejection message to `replies` and map the custom error before the existing unsupported-edit branch.

- [ ] **Step 4: Run controller test and verify GREEN**

Run: `npx tsx --test src/controllers/text.controller.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: every command exits 0.

- [ ] **Step 6: Commit user-facing handling**

```bash
git add src/lib/replies.ts src/controllers/imageEdit.controller.ts src/controllers/text.controller.test.ts docs/superpowers/plans/2026-08-02-openai-image-moderation.md
git commit -m "feat(images): report moderation rejection"
```
