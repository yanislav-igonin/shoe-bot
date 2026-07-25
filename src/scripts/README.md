# Scripts

Run those with:

```bash
ts-node -r dotenv/config -r tsconfig-paths/register src/scripts/<script-name>.ts
```

## Image generation benchmark

Edit `prompts`, `models`, and `attemptsPerPrompt` at the top of
`image-generation-benchmark.ts`.

Each prompt has:

- `id`: short label shown in Telegram;
- `language`: language label shown in Telegram;
- `text`: prompt sent to Together.

Each model has:

- `id`: Together model ID;
- `width` and `height`: dimensions supported by that model.

The script processes one model at a time. It writes the model ID to the global
`settings.imageModel`, runs every prompt five times, then moves to the next
model. Results are sent to the hardcoded private Telegram chat `142166671`.
Every image caption contains language, prompt ID, model ID, and attempt number.
The original database setting is restored when the run finishes or fails.

Check the execution matrix without API calls or database writes:

```bash
npm run benchmark:images -- --dry-run
```

Run the benchmark:

```bash
npm run benchmark:images
```
