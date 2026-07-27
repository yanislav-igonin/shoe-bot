# xAI SDK Migration Design

## Goal

Replace every xAI API call made through the OpenAI SDK with the official
`@ai-sdk/xai` provider. Upgrade the project runtime contract to Node.js 22 so
the latest AI SDK can be used. Keep the existing OpenAI SDK and its real
OpenAI API call unchanged.

## Scope

- Configure an xAI provider with the existing `GROK_API_KEY` and base URL.
- Declare Node.js `22.x` in `package.json#engines`.
- Pin Node.js `22.23.1` for local development in `package.json#volta`.
- Let Nixpacks select Node.js 22 from `package.json#engines`; do not add a
  duplicate Nixpacks version setting.
- Use AI SDK text generation for normal Grok completions and task
  classification.
- Use AI SDK image generation for the xAI image provider.
- Preserve TogetherAI image generation and the existing OpenAI completion.
- Preserve current prompts, model IDs, fallback text, and Telegram behavior.
- Do not change Prisma schema, migrations, database queries, or stored data.

## Design

`src/lib/ai.ts` will own the configured xAI provider alongside the existing
OpenAI client. `src/lib/prompt.ts` will use AI SDK message types
and `generateText` for xAI text calls. Message conversion will retain text and
image context while removing the OpenAI-specific message shapes.

`src/lib/imageGeneration.ts` will call AI SDK `generateImage` with the existing
model setting, `16:9` aspect ratio, and `2k` xAI resolution. xAI returns image
bytes while TogetherAI returns a URL, so the image result type will support
both. Telegram controllers will construct `InputFile` from either source.

The `openai` package remains installed because `getModelForTask` still calls
the OpenAI API. No provider registry, wrapper hierarchy, or database-backed
configuration changes will be added.

## Dependencies

Use the latest available releases, which require Node.js 22:

- `ai` version `7.0.37`
- `@ai-sdk/xai` version `4.0.18`

Keep all existing dependencies unless package resolution proves a direct
compatibility change is required. Add the SDK's required `zod` peer dependency
directly. Upgrade TypeScript or related development tooling only if the latest
SDK types cannot be parsed or checked by the existing versions.

## Error Handling

Text completions will keep returning `replies.noAnswer` when xAI produces no
text. JSON task classification will keep falling back to `text` when parsing
fails. Missing image data will follow the existing controller error path.

## Testing

Follow RED-GREEN-REFACTOR:

- Add focused tests for AI SDK message conversion.
- Add focused tests for extracting xAI image bytes.
- Verify Volta resolves Node.js `22.23.1`.
- Verify Nixpacks resolves Node.js 22 from `package.json#engines` when a
  Nixpacks CLI is available.
- Run the full test suite, lint, typecheck, and production build.
- Confirm the final diff contains no files under `prisma/`.
