# Global Image Provider Settings Design

## Goal

Add Together AI as an image-generation provider and select the active image
provider and model through global database settings. Settings changes must take
effect on the next image generation without restarting the bot.

This work addresses GitHub issue #29. Per-user image settings and a settings UI
are out of scope.

## Database design

Create a global `settings` key-value table:

```prisma
model Setting {
  key       String   @id
  value     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("settings")
}
```

The migration creates the table when it does not already exist and inserts
these initial settings without overwriting existing values:

| key | value |
| --- | --- |
| `imageProvider` | `togetherai` |
| `imageModel` | `black-forest-labs/FLUX.2-dev` |

Supported provider values are case-sensitive:

- `togetherai`
- `xai`

The model value remains an opaque provider model identifier. The application
does not infer a provider from the model name or maintain a model allowlist.

## Configuration loading

Every image generation reads both settings in one Prisma query. A pure parser
converts the returned key-value rows to an image-generation configuration.

Generation fails with a specific error when:

- either required setting is missing;
- `imageModel` is empty;
- `imageProvider` is unsupported.

There is no cache or fallback to environment variables or hard-coded model
names. This keeps the database as the single source of truth and makes manual
experiments apply immediately.

## Provider implementation

Keep provider selection local to `src/lib/imageGeneration.ts`:

1. `generateImage(text)` loads and validates global settings.
2. A `switch` on `imageProvider` calls either `generateWithXai()` or
   `generateWithTogether()`.
3. Both provider functions return the first generated image URL through the
   existing URL validator.

No provider interfaces, registry, factory, or provider-specific classes are
introduced. These abstractions can be added when another provider creates a
concrete need.

### xAI

Use the existing OpenAI-compatible xAI client with:

```text
model: value from imageModel
aspect_ratio: 16:9
resolution: 2k
```

### Together AI

Add the official `together-ai` TypeScript SDK. Create its client only inside
the Together path after verifying that `TOGETHER_API_KEY` is configured. This
allows the bot to start and use xAI without a Together key.

Call `together.images.generate()` with:

```text
model: value from imageModel
width: 1344
height: 768
disable_safety_checker: true
```

Do not set `steps`; model defaults reduce incompatibility when switching
Together models. Request the default URL response and validate the first URL
before returning it.

Together documents `disable_safety_checker` for the supported FLUX image
families and documents `black-forest-labs/FLUX.2-dev` as supporting width,
height, and safety-checker control:

- https://docs.together.ai/docs/inference/images/overview
- https://docs.together.ai/docs/inference/images/parameters

## Environment

Add `TOGETHER_API_KEY` to `.env.example` without a value. The runtime config
keeps it optional at startup. Selecting `togetherai` without a configured key
causes image generation to fail with a precise configuration error.

The provided test key is stored only in the ignored local `.env` file and must
not be committed.

## Error handling

Configuration and provider errors propagate from `generateImage()`. Existing
controllers keep their current user-facing generic error behavior and logging.
No silent fallback between providers occurs because it would hide invalid
settings and make provider experiments unreliable.

## Testing and verification

Add only mock-free unit tests for pure behavior:

- valid Together settings parsing;
- valid xAI settings parsing;
- missing `imageProvider`;
- missing `imageModel`;
- empty `imageModel`;
- unsupported provider;
- existing generated-image URL validation.

Do not add automated Prisma, Together SDK, xAI, or Telegram integration tests.

Run:

```text
npm test
npm run lint
npm run typecheck
npm run build
```

After automated verification, make one manual live Together generation using
the ignored local key. Do not print or commit the key.

## Manual provider switching

Switch back to xAI:

```sql
UPDATE settings
SET value = 'xai'
WHERE key = 'imageProvider';

UPDATE settings
SET value = 'grok-imagine-image-quality'
WHERE key = 'imageModel';
```

Switch to another Together model by updating `imageModel`; keep
`imageProvider = 'togetherai'`.
