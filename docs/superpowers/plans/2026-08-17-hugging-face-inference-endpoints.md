# Hugging Face Inference Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hugging Face Inference Endpoints as an image provider for dedicated community/custom model deployments.

**Architecture:** Extend the existing image provider switch with a small Hugging Face adapter. The adapter validates optional environment configuration at call time, POSTs the prompt to a configured endpoint, and normalizes image bytes/URL/base64 into the existing `generateImage()` return type. Image editing remains explicitly unsupported until a concrete endpoint contract is chosen.

**Tech Stack:** TypeScript, Node.js 22, native `fetch`, Node test runner, existing `imageGeneration.ts` provider architecture.

## Global Constraints

- Common open-source LLMs remain on OpenRouter.
- Proprietary models remain on their direct providers.
- No new Hugging Face SDK dependency is required for the first iteration.
- Existing OpenAI/xAI/Together behavior must remain unchanged.

---

### Task 1: Define Hugging Face provider behavior with tests

**Files:**
- Modify: `src/lib/imageGeneration.test.ts`

**Interfaces:**
- Consumes: existing `parseImageGenerationSettings()` and `generateImage()`.
- Produces: expected public helpers `requireHuggingFaceConfig()` and Hugging Face route behavior.

- [ ] Add a test that `parseImageGenerationSettings()` accepts `huggingface`.
- [ ] Add tests that missing/blank token or endpoint URL are rejected.
- [ ] Add a test that a text prompt sends an authenticated POST to the configured endpoint and returns binary image bytes.
- [ ] Add tests for JSON URL/base64 responses, endpoint errors, and unsupported source-image editing.
- [ ] Run `npm test -- src/lib/imageGeneration.test.ts` and verify the new tests fail because the provider does not exist yet.

### Task 2: Implement Hugging Face endpoint adapter

**Files:**
- Modify: `src/lib/config.ts`
- Modify: `src/lib/imageGeneration.ts`

**Interfaces:**
- Produces: `requireHuggingFaceConfig(token, endpointUrl)` and `generateWithHuggingFace()` routed from `generateImage()`.

- [ ] Add optional `hfToken` and `hfInferenceEndpointUrl` config values.
- [ ] Extend `ImageProvider` and provider validation with `huggingface`.
- [ ] Add config validation and endpoint URL validation.
- [ ] POST `{ inputs: prompt }` with bearer auth and image/JSON accept headers.
- [ ] Normalize image bytes, top-level/nested URL, and top-level/nested base64 responses.
- [ ] Throw actionable non-2xx and unsupported-response errors.
- [ ] Reject editing with `ImageEditingNotSupportedError`.
- [ ] Run targeted tests and then the full test suite.

### Task 3: Document configuration

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Add `HF_TOKEN` and `HF_INFERENCE_ENDPOINT_URL` examples.
- [ ] Explain that Hugging Face is intended for dedicated/custom Hub model deployments, not as a replacement for OpenRouter.
- [ ] Document `imageProvider=huggingface` and the expected endpoint contract.

### Task 4: Verification and PR

**Files:** no production changes unless verification finds an issue.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Compare the feature branch with `master` and review the complete diff.
- [ ] Open a pull request linked to issue #56.
