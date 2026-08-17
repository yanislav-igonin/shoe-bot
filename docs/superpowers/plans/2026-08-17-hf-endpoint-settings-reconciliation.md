# Hugging Face Endpoint Settings & Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move mutable Hugging Face endpoint metadata from environment variables to the `settings` table and automatically reconcile `textModel` onto the existing dedicated text endpoint before inference and every 30 seconds.

**Architecture:** Add a focused Hugging Face text endpoint reconciler that owns management API GET/PUT/polling and DB persistence of the current URL. `prompt.ts` asks the reconciler for a current endpoint URL before building the HF model client. `index.ts` starts/stops a background reconcile loop after DB initialization. Existing generation lifecycle remains responsible for active request draining and explicit scale-to-zero.

**Tech Stack:** TypeScript, Node.js fetch, MikroORM/PostgreSQL, Hugging Face Inference Endpoints management API, Node test runner, GitHub Actions.

## Global Constraints

- Keep only `HF_TOKEN` in environment configuration for Hugging Face.
- `textModel` is the desired Hugging Face repository ID.
- Reuse the existing dedicated endpoint; do not create endpoints automatically.
- Persist current endpoint URL in `settings` after reconciliation.
- Reconcile immediately before HF inference and in a 30-second background loop.
- Keep reconciliation process-local; do not introduce distributed locking in this change.
- Preserve explicit scale-to-zero after the final active HF generation.

---

### Task 1: Settings rows and environment cleanup

**Files:**
- Create: `src/migrations/Migration20260817000000.ts`
- Modify: `src/lib/config.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces settings keys `hfInferenceEndpointNamespace`, `hfTextInferenceEndpointName`, `hfTextInferenceEndpointUrl`, `hfImageInferenceEndpointUrl`.
- Keeps `config.hfToken`; removes endpoint namespace/name/URL fields from `config`.

- [ ] **Step 1: Add migration test/coverage expectation through existing migration/typecheck suite.**
- [ ] **Step 2: Add a conflict-safe migration inserting all four rows with empty values.**
- [ ] **Step 3: Remove mutable HF endpoint env fields from `config.ts` and `.env.example`.**
- [ ] **Step 4: Run tests, lint, and typecheck.**
- [ ] **Step 5: Commit.**

### Task 2: Management API client and reconciler

**Files:**
- Create: `src/lib/huggingFaceTextEndpoint.ts`
- Create: `src/lib/huggingFaceTextEndpoint.test.ts`
- Modify: `src/lib/huggingFaceEndpointLifecycle.ts` only if shared management helpers are factored there.

**Interfaces:**
- Produces `reconcileHuggingFaceTextEndpoint(em: EntityManager): Promise<string | undefined>` where `undefined` means HF is not the selected text provider.
- Produces `startHuggingFaceTextEndpointReconciler(): () => void` returning a stop function.
- Reads `HF_TOKEN` from `config.hfToken` and mutable endpoint values from `Setting` rows.

- [ ] **Step 1: Write failing tests for settings parsing, GET endpoint metadata, repository mismatch PUT, polling until ready, URL persistence, failed states, and process-local single-flight reconciliation.**
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Implement management GET (`/v2/endpoint/{namespace}/{name}`), update PUT with `{model:{repository}}`, polling every 5s with a 10-minute limit, and URL upsert.**
- [ ] **Step 4: Implement process-local single-flight reconcile so concurrent callers share one promise.**
- [ ] **Step 5: Implement the 30-second background loop using `getOrm().em.fork()`; skip when provider is not `huggingface`; log errors without terminating the process.**
- [ ] **Step 6: Run tests, lint, and typecheck.**
- [ ] **Step 7: Commit.**

### Task 3: Route inference through reconciled DB endpoint state

**Files:**
- Modify: `src/lib/prompt.ts`
- Modify: `src/lib/prompt.test.ts`
- Modify: `src/lib/imageGeneration.ts`
- Modify: Hugging Face image tests as needed.

**Interfaces:**
- HF text inference receives the reconciler-returned current URL rather than `config.hfTextInferenceEndpointUrl`.
- HF image inference reads `hfImageInferenceEndpointUrl` from `settings` rather than environment configuration.

- [ ] **Step 1: Add failing tests showing HF text uses the reconciled URL and image generation reads its endpoint URL from DB settings.**
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Update `prompt.ts` to reconcile before entering the HF active-generation lifecycle and build the OpenAI-compatible client with the returned URL.**
- [ ] **Step 4: Update image settings loading to include `hfImageInferenceEndpointUrl` and remove env URL dependency.**
- [ ] **Step 5: Run tests, lint, and typecheck.**
- [ ] **Step 6: Commit.**

### Task 4: Start background reconciliation and document operator flow

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: issue #56 / PR #57 description.

**Interfaces:**
- `start()` starts background HF reconciliation after DB initialization and stops it during shutdown.

- [ ] **Step 1: Add/start the reconciler in `index.ts`, retaining the returned stop function and calling it before DB close.**
- [ ] **Step 2: Update README setup: only `HF_TOKEN` belongs in env; endpoint namespace/name are settings; URL is bot-managed; changing `textModel` is sufficient to trigger repository reconciliation.**
- [ ] **Step 3: Run the complete `npm test`, `npm run lint`, and `npm run typecheck` suite.**
- [ ] **Step 4: Inspect final PR diff for temporary files/workflows or unrelated changes.**
- [ ] **Step 5: Update PR/issue metadata and confirm final GitHub Actions are green.**
