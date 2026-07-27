# xAI SDK Migration Design

## Goal

Replace every xAI API call made through the OpenAI SDK with the official
`@ai-sdk/xai` provider. Keep the existing OpenAI SDK and its real OpenAI API
call unchanged.

## Scope

- Configure an xAI provider with the existing `GROK_API_KEY` and base URL.
- Use AI SDK text generation for normal Grok completions and task
  classification.
- Use AI SDK image generation for the xAI image provider.
- Preserve TogetherAI image generation and the existing OpenAI completion.
- Preserve current prompts, model IDs, fallback text, and Telegram behavior.
- Do not change Prisma schema, migrations, database queries, or stored data.

## Design

`src/lib/ai.ts` will own the configured xAI provider alongside the existing
OpenAI and Mistral clients. `src/lib/prompt.ts` will use AI SDK message types
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

Add Node 18-compatible releases from the current AI SDK generation:

- `ai` major version 6
- `@ai-sdk/xai` major version 3

Keep all existing dependencies unless package resolution proves a direct
compatibility change is required.

## Error Handling

Text completions will keep returning `replies.noAnswer` when xAI produces no
text. JSON task classification will keep falling back to `text` when parsing
fails. Missing image data will follow the existing controller error path.

## Testing

Follow RED-GREEN-REFACTOR:

- Add focused tests for AI SDK message conversion.
- Add focused tests for extracting xAI image bytes.
- Run the full test suite, lint, typecheck, and production build.
- Confirm the final diff contains no files under `prisma/`.
