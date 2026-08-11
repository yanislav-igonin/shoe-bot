# Text Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route user-facing text generation through xAI, Together AI, or OpenRouter using global database settings.

**Architecture:** Extend the direct provider switch already used for images. `src/lib/prompt.ts` loads and validates `textProvider` and `textModel`, creates the selected AI SDK language model, then reuses the existing shared prompt and response flow.

**Tech Stack:** TypeScript, Node.js 22, Vercel AI SDK 7, OpenAI-compatible provider adapter, MikroORM 7, PostgreSQL.

## Global Constraints

- Supported text providers are exactly `xai`, `togetherai`, and `openrouter`.
- Keep the model ID opaque and load both settings for every user-facing completion.
- Keep intent classification on `grok-3-mini` through xAI.
- Validate provider keys only when the provider is selected.
- Do not add OpenAI, fallback routing, caching, provider classes, or a settings UI.
- Never commit API keys.

---

### Task 1: Define and test text-provider settings

**Files:**

- Modify: `src/lib/prompt.test.ts`
- Modify: `src/lib/prompt.ts`

**Interfaces:**

- Produces: `TextGenerationSettings`, `parseTextGenerationSettings(rows)`, and `requireProviderApiKey(apiKey, variableName)`.

- [ ] **Step 1: Write failing tests** for all three valid providers, missing/empty settings, unsupported providers, and missing/valid API keys.
- [ ] **Step 2: Run `npm test -- src/lib/prompt.test.ts`** and confirm failure because the exports do not exist.
- [ ] **Step 3: Implement the smallest pure parser and key validator** with exact configuration errors.
- [ ] **Step 4: Re-run the prompt tests** and confirm they pass.

### Task 2: Route completion through selected provider

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `src/lib/config.ts`
- Modify: `src/lib/prompt.test.ts`
- Modify: `src/lib/prompt.ts`
- Modify: `src/controllers/text.controller.ts`
- Modify: `src/controllers/shicture.controller.ts`

**Interfaces:**

- Consumes: `EntityManager`, the existing `Setting` entity, `xai(model)`, and `createOpenAICompatible(options)(model)`.
- Produces: `getCompletion(em, message, context, imagesMap, currentImageUrls)` and `getShictureDescription(em)`.

- [ ] **Step 1: Write a failing provider-routing test** using injected model factories and literal expectations for xAI, Together, and OpenRouter.
- [ ] **Step 2: Run the focused prompt tests** and verify the new routing test fails for missing behavior.
- [ ] **Step 3: Add `@ai-sdk/openai-compatible`** and optional `OPENROUTER_API_KEY` configuration.
- [ ] **Step 4: Implement settings loading and direct provider selection**, using the documented base URLs and lazy key validation.
- [ ] **Step 5: Pass the request entity manager from both controllers** and remove the hard-coded main model argument.
- [ ] **Step 6: Run focused tests, typecheck, and lint** and fix only failures caused by this task.

### Task 3: Seed defaults and verify final behavior

**Files:**

- Create: `src/migrations/Migration20260811000000.ts`
- Modify: `src/lib/database.integration.test.ts`
- Modify: `README.md`

**Interfaces:**

- Produces database rows `textProvider=xai` and `textModel=grok-4` without overwriting existing rows.

- [ ] **Step 1: Update the migration integration expectation first** from two to four settings and verify it fails when `TEST_DATABASE_URL` is available.
- [ ] **Step 2: Add the idempotent seed migration** with a down migration that deletes only the two exact text-setting keys.
- [ ] **Step 3: Document environment variables and SQL provider switching** without including secrets.
- [ ] **Step 4: Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`** and inspect every exit code.
- [ ] **Step 5: Run Rejudge against the complete diff**, address valid findings, and repeat verification before publishing.
