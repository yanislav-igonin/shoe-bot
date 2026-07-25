# Image Generation Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, editable TypeScript benchmark that runs each prompt
five times on each configured Together image model and reports labeled results
to Telegram.

**Architecture:** Keep configuration and orchestration in one local script.
Use existing Prisma schema, Together SDK, and bot credentials directly. Run
sequentially and restore the original global model in `finally`.

**Tech Stack:** TypeScript, Together AI SDK, Prisma, Telegram Bot HTTP API,
tsx, dotenv.

## Global Constraints

- Hardcode Telegram chat ID `142166671`.
- Loop order is model, prompt, attempt.
- Default to five attempts per prompt.
- Put language, prompt ID, model ID, and attempt number in every result.
- Do not use mocks or add tests for I/O behavior.
- Keep all generation requests sequential.

---

### Task 1: Benchmark Script

**Files:**
- Create: `src/scripts/image-generation-benchmark.ts`

**Interfaces:**
- Consumes: `TOGETHER_API_KEY`, `BOT_TOKEN`, Prisma `settings.imageModel`.
- Produces: editable `prompts`, `models`, and `attemptsPerPrompt`
  configuration; Telegram images, errors, progress, and summary.

- [ ] **Step 1: Add typed editable configuration**

Define `Prompt`, `Model`, result counters, sample prompt/model entries, and
validation. Add `--dry-run` to print loop order and request count without
creating clients, writing the database, or calling external APIs.

- [ ] **Step 2: Add Telegram output**

Send text and photos through the Telegram Bot HTTP API. Use captions formatted
as `<language> · <prompt id> · <model id> · <attempt>/<total>`.

- [ ] **Step 3: Add sequential generation loop**

For each model, update `settings.imageModel`, then generate every prompt five
times with `disable_safety_checker: true` and model-specific dimensions.
Record failures and continue.

- [ ] **Step 4: Restore database state**

Read the original setting before the run and restore it in `finally`, then
disconnect Prisma.

- [ ] **Step 5: Verify dry-run and compilation**

Run:

```bash
npx tsx -r dotenv/config src/scripts/image-generation-benchmark.ts --dry-run
npm run typecheck
npm run lint
```

Expected: dry-run prints the configured execution matrix and total request
count; typecheck and lint exit successfully.

### Task 2: Command and Documentation

**Files:**
- Modify: `package.json`
- Modify: `src/scripts/README.md`

**Interfaces:**
- Consumes: benchmark script from Task 1.
- Produces: `npm run benchmark:images` and operator instructions.

- [ ] **Step 1: Add npm command**

Add:

```json
"benchmark:images": "tsx -r dotenv/config src/scripts/image-generation-benchmark.ts"
```

- [ ] **Step 2: Document configuration and execution**

Document prompt fields, model fields, hardcoded destination chat, dry-run
usage, normal usage, sequential ordering, and database restoration.

- [ ] **Step 3: Run full project verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run benchmark:images -- --dry-run
git diff --check
```

Expected: all commands exit successfully; dry-run performs no paid
generations.
