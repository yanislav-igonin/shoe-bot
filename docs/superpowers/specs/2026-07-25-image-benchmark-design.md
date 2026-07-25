# Image Generation Benchmark Design

## Goal

Provide a reusable TypeScript script for comparing multiple Together AI image
models against multiple prompts. The operator edits typed arrays in the script
and runs one npm command.

## Configuration

The script contains three values intended for manual editing:

```ts
const attemptsPerPrompt = 5;

const prompts = [
  {
    id: 'example',
    language: 'ru',
    text: 'Prompt text',
  },
];

const models = [
  {
    height: 768,
    id: 'Qwen/Qwen-Image-2.0-Pro',
    width: 1_344,
  },
];
```

Model dimensions remain configurable because Together models accept different
image sizes.

## Execution

The loop order is model, prompt, attempt:

1. Save the current global `imageModel` setting.
2. Write the selected model ID to `settings.imageModel`.
3. Generate every configured prompt `attemptsPerPrompt` times.
4. Continue with the next model.
5. Restore the original setting in a `finally` block.

Generation is sequential to keep Telegram messages ordered and avoid an
unexpected burst of concurrent paid requests.

## Telegram Output

Results are sent to the existing private Telegram chat with ID `142166671`.
Successful images have captions in this format:

```text
ru · example · Qwen/Qwen-Image-2.0-Pro · 3/5
```

Failures are sent as text messages containing the same metadata and a bounded
error message. The script sends a start message, per-model progress messages,
and a final summary grouped by model and prompt.

## Error Handling

- A failed generation or Telegram delivery is counted and does not stop later
  attempts.
- Missing API credentials, empty prompt/model arrays, invalid attempt counts,
  and a missing `imageModel` database setting fail before paid requests begin.
- The database client disconnects and the original model is restored even
  when the run fails unexpectedly.

## Files

- Create `src/scripts/image-generation-benchmark.ts`.
- Modify `package.json` with `benchmark:images`.
- Update `src/scripts/README.md` with configuration and usage.

## Testing

No unit tests are added. The script is I/O orchestration around Together,
Telegram, and Prisma; the user requested tests only for pure functions and no
mocks. Verification consists of TypeScript compilation, linting, and a
configuration-only dry run that performs no API or database writes.
