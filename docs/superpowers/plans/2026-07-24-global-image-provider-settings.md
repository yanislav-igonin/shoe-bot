# Global Image Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Together AI image generation and select the active image provider and model from global key-value database settings.

**Architecture:** Keep all provider routing in `src/lib/imageGeneration.ts`. Each generation loads `imageProvider` and `imageModel` from the global `settings` table, validates them with a pure parser, and dispatches to a small xAI or Together function. Use the existing xAI OpenAI-compatible client and the official Together TypeScript SDK.

**Tech Stack:** TypeScript 4.9, Node.js 18+, Prisma 4, PostgreSQL, OpenAI SDK, Together AI TypeScript SDK, Node test runner.

## Global Constraints

- Global settings are key-value rows; do not modify `UserSettings`.
- Supported provider values are exactly `togetherai` and `xai`.
- Read settings from PostgreSQL for every image generation; do not cache them.
- Keep `imageModel` as an opaque provider model identifier.
- Do not infer provider from model name and do not fall back between providers.
- Initial settings are `togetherai` and `black-forest-labs/FLUX.2-dev`.
- Together requests use `1344x768` and `disable_safety_checker: true`.
- xAI requests retain `aspect_ratio: 16:9` and `resolution: 2k`.
- `TOGETHER_API_KEY` is optional at startup and required only in the Together path.
- Add only mock-free tests for pure functions.
- Keep the implementation local; do not add provider interfaces, registries, factories, or classes.

---

### Task 1: Add global settings and pure configuration parsing

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260724010000_global_settings/migration.sql`
- Modify: `src/lib/imageGeneration.test.ts`
- Modify: `src/lib/imageGeneration.ts`

**Interfaces:**

- Consumes: Prisma client exported as `database` from `lib/database.js`.
- Produces: `ImageGenerationSettings`, `parseImageGenerationSettings(rows)`,
  and an internal `loadImageGenerationSettings()` database loader.

- [ ] **Step 1: Write failing parser tests**

Extend `src/lib/imageGeneration.test.ts`:

```ts
const { getGeneratedImageUrl, parseImageGenerationSettings } = await import(
  'lib/imageGeneration.js'
);

describe('parseImageGenerationSettings', () => {
  it('parses Together settings', () => {
    assert.deepEqual(
      parseImageGenerationSettings([
        { key: 'imageProvider', value: 'togetherai' },
        {
          key: 'imageModel',
          value: 'black-forest-labs/FLUX.2-dev',
        },
      ]),
      {
        model: 'black-forest-labs/FLUX.2-dev',
        provider: 'togetherai',
      },
    );
  });

  it('parses xAI settings', () => {
    assert.deepEqual(
      parseImageGenerationSettings([
        { key: 'imageProvider', value: 'xai' },
        { key: 'imageModel', value: 'grok-imagine-image-quality' },
      ]),
      {
        model: 'grok-imagine-image-quality',
        provider: 'xai',
      },
    );
  });

  it('rejects a missing image provider', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([
          { key: 'imageModel', value: 'model' },
        ]),
      /imageProvider setting is missing/,
    );
  });

  it('rejects a missing image model', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([
          { key: 'imageProvider', value: 'togetherai' },
        ]),
      /imageModel setting is missing/,
    );
  });

  it('rejects an empty image model', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([
          { key: 'imageProvider', value: 'togetherai' },
          { key: 'imageModel', value: '   ' },
        ]),
      /imageModel setting is empty/,
    );
  });

  it('rejects an unsupported image provider', () => {
    assert.throws(
      () =>
        parseImageGenerationSettings([
          { key: 'imageProvider', value: 'unknown' },
          { key: 'imageModel', value: 'model' },
        ]),
      /Unsupported image provider: unknown/,
    );
  });
});
```

- [ ] **Step 2: Run the parser tests and verify failure**

Run:

```bash
npm test
```

Expected: FAIL because `parseImageGenerationSettings` is not exported.

- [ ] **Step 3: Implement the pure parser**

Add to `src/lib/imageGeneration.ts`:

```ts
type ImageProvider = 'togetherai' | 'xai';

type SettingRow = {
  key: string;
  value: string;
};

export type ImageGenerationSettings = {
  model: string;
  provider: ImageProvider;
};

export const parseImageGenerationSettings = (
  rows: SettingRow[],
): ImageGenerationSettings => {
  const provider = rows.find(({ key }) => key === 'imageProvider')?.value;
  const model = rows.find(({ key }) => key === 'imageModel')?.value;

  if (!provider) {
    throw new Error('imageProvider setting is missing');
  }

  if (model === undefined) {
    throw new Error('imageModel setting is missing');
  }

  if (model.trim() === '') {
    throw new Error('imageModel setting is empty');
  }

  if (provider !== 'togetherai' && provider !== 'xai') {
    throw new Error(`Unsupported image provider: ${provider}`);
  }

  return { model, provider };
};
```

- [ ] **Step 4: Run tests and verify parser behavior**

Run:

```bash
npm test
```

Expected: all parser and URL tests PASS.

- [ ] **Step 5: Add the Prisma model**

Append to `prisma/schema.prisma`:

```prisma
model Setting {
  key       String   @id
  value     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("settings")
}
```

- [ ] **Step 6: Add the migration**

Create
`prisma/migrations/20260724010000_global_settings/migration.sql`:

```sql
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "settings" ("key", "value", "updatedAt")
VALUES
    ('imageProvider', 'togetherai', CURRENT_TIMESTAMP),
    ('imageModel', 'black-forest-labs/FLUX.2-dev', CURRENT_TIMESTAMP);
```

- [ ] **Step 7: Generate Prisma client and add settings loading**

Run:

```bash
npx prisma generate
```

Then import `database` and add to `src/lib/imageGeneration.ts`:

```ts
import { database } from 'lib/database.js';

const IMAGE_SETTING_KEYS = ['imageProvider', 'imageModel'];

const loadImageGenerationSettings = async () => {
  const rows = await database.setting.findMany({
    where: { key: { in: IMAGE_SETTING_KEYS } },
  });

  return parseImageGenerationSettings(rows);
};
```

- [ ] **Step 8: Verify Task 1**

Run:

```bash
npm test
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add prisma/schema.prisma \
  prisma/migrations/20260724010000_global_settings/migration.sql \
  src/lib/imageGeneration.ts \
  src/lib/imageGeneration.test.ts
git commit -m "feat(settings): add image provider config"
```

---

### Task 2: Add Together SDK and provider routing

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/config.ts`
- Modify: `src/lib/imageGeneration.test.ts`
- Modify: `src/lib/imageGeneration.ts`

**Interfaces:**

- Consumes: `loadImageGenerationSettings()` from Task 1, existing `grok`
  client, and optional `config.togetherApiKey`.
- Produces: unchanged public `generateImage(text: string)` API plus local
  `generateWithXai(text, model)` and `generateWithTogether(text, model)`.

- [ ] **Step 1: Add test environment coverage for the optional key**

In the environment setup of `src/lib/imageGeneration.test.ts`, add:

```ts
process.env.TOGETHER_API_KEY = 'test';
```

No SDK or network test is added. This only prevents future eager key validation
from hiding parser test results.

- [ ] **Step 2: Install the official Together SDK**

Run:

```bash
npm install together-ai@^0.44.0
```

Expected: `package.json` and `package-lock.json` include `together-ai`.

- [ ] **Step 3: Expose an optional Together key**

Add to `config` in `src/lib/config.ts`:

```ts
togetherApiKey: process.env.TOGETHER_API_KEY,
```

Do not wrap it in `valueOrThrow`; xAI mode must start without the key.

- [ ] **Step 4: Implement provider-specific functions**

Update imports and provider functions in `src/lib/imageGeneration.ts`:

```ts
import Together from 'together-ai';

import { grok } from 'lib/ai.js';
import { config } from 'lib/config.js';
import { database } from 'lib/database.js';
import { valueOrThrow } from 'lib/values.js';

const generateWithXai = async (text: string, model: string) => {
  const response = await grok.images.generate({
    // @ts-expect-error xAI image parameters are not in OpenAI SDK types
    aspect_ratio: '16:9',
    model,
    prompt: text,
    resolution: '2k',
  });

  return getGeneratedImageUrl(response);
};

const generateWithTogether = async (text: string, model: string) => {
  const apiKey = valueOrThrow(
    config.togetherApiKey,
    'TOGETHER_API_KEY is not set',
  );
  const together = new Together({ apiKey });
  const response = await together.images.generate({
    disable_safety_checker: true,
    height: 768,
    model,
    prompt: text,
    width: 1344,
  });

  return getGeneratedImageUrl(response);
};
```

- [ ] **Step 5: Route each generation from current database settings**

Replace the current hard-coded `generateImage()` body:

```ts
export const generateImage = async (text: string) => {
  const { model, provider } = await loadImageGenerationSettings();

  switch (provider) {
    case 'togetherai':
      return generateWithTogether(text, model);
    case 'xai':
      return generateWithXai(text, model);
  }
};
```

- [ ] **Step 6: Verify Task 2**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits with status 0.

- [ ] **Step 7: Commit Task 2**

```bash
git add package.json package-lock.json \
  src/lib/config.ts \
  src/lib/imageGeneration.ts \
  src/lib/imageGeneration.test.ts
git commit -m "feat(images): add Together provider"
```

---

### Task 3: Document configuration and run end-to-end verification

**Files:**

- Modify: `.env.example`

**Interfaces:**

- Consumes: the provider routing completed in Task 2.
- Produces: documented environment configuration and verified live Together
  response.

- [ ] **Step 1: Document the Together key**

Append to `.env.example`:

```dotenv
TOGETHER_API_KEY=''
```

- [ ] **Step 2: Re-run the complete local verification**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: all commands exit with status 0 and `git diff --check` prints
nothing.

- [ ] **Step 3: Apply migrations to the local test database**

Run:

```bash
npx prisma migrate deploy
```

Expected: migration `20260724010000_global_settings` is applied and Prisma
reports no pending migrations.

- [ ] **Step 4: Verify seeded settings**

Run:

```bash
npx tsx -r dotenv/config -r tsconfig-paths/register -e \
  'const run = async () => { const { database } = await import("./src/lib/database.ts"); console.log(await database.setting.findMany({ orderBy: { key: "asc" }, where: { key: { in: ["imageProvider", "imageModel"] } } })); await database.$disconnect(); }; void run();'
```

Expected rows:

```text
imageModel      black-forest-labs/FLUX.2-dev
imageProvider   togetherai
```

- [ ] **Step 5: Run one live Together generation**

Run:

```bash
npx tsx -r dotenv/config -r tsconfig-paths/register -e \
  'const run = async () => { const { database } = await import("./src/lib/database.ts"); const { generateImage } = await import("./src/lib/imageGeneration.ts"); console.log(await generateImage("A cinematic red shoe on a dark studio background")); await database.$disconnect(); }; void run();'
```

Expected: one valid `https://` image URL. Do not print the API key.

- [ ] **Step 6: Commit Task 3**

```bash
git add .env.example
git commit -m "docs: add Together API configuration"
```

- [ ] **Step 7: Review final branch**

Run:

```bash
git status --short
git log --oneline master..HEAD
git diff --stat master...HEAD
```

Expected: clean worktree; commits contain the design, implementation plan,
database settings, Together provider, and environment documentation.
