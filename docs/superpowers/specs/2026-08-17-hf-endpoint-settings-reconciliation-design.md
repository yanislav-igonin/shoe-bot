# Hugging Face Endpoint Settings & Reconciliation Design

## Goal

Keep only `HF_TOKEN` in environment configuration. Move mutable Hugging Face endpoint metadata into the global `settings` table and make `textModel` the desired model repository that the bot automatically reconciles onto the configured dedicated text endpoint.

## Settings

The existing `textProvider` and `textModel` rows remain the user-facing desired state.

Add these global settings rows:

- `hfInferenceEndpointNamespace` — namespace that owns the dedicated endpoint.
- `hfTextInferenceEndpointName` — stable dedicated text endpoint resource name.
- `hfTextInferenceEndpointUrl` — cached current inference URL returned by Hugging Face. The bot owns/refreshed this value; operators should not need to maintain it manually after initial endpoint configuration.
- `hfImageInferenceEndpointUrl` — image endpoint URL, moved from environment configuration. No image endpoint repository reconciliation is added in this change.

The only Hugging Face environment secret/config retained is `HF_TOKEN`.

## Text endpoint reconciliation

When `textProvider=huggingface`, the bot treats `textModel` as the desired Hugging Face repository ID.

A reconciler:

1. Loads namespace, endpoint name, cached endpoint URL, and desired `textModel` from `settings`.
2. GETs `https://api.endpoints.huggingface.cloud/v2/endpoint/{namespace}/{name}`.
3. Reads current repository from `model.repository`, current status from `status.state`, and current URL from `status.url`.
4. If the deployed repository differs from `textModel`, PUTs the same endpoint with `{ "model": { "repository": textModel } }`.
5. Polls endpoint metadata every 5 seconds for up to 10 minutes until the endpoint is usable (`running` with a URL) or safely usable from `scaledToZero` with a URL. `failed` / `updateFailed` fail immediately.
6. Persists the latest non-empty `status.url` to `settings.hfTextInferenceEndpointUrl` even when it matches the cached value.
7. Returns the current URL for the inference client.

The reconcile function is process-mutexed so concurrent requests/background ticks share one in-flight reconcile rather than issuing duplicate endpoint updates.

## Triggers

- Before each Hugging Face text inference, reconcile first. This guarantees a request made immediately after changing `textModel` cannot accidentally hit the old model.
- After database initialization, start a 30-second background reconciliation loop. It only performs work while `textProvider=huggingface`, allowing model deployment to begin before the next user request.
- Background reconciliation errors are logged and do not crash the bot.

## Scale-to-zero interaction

Existing active-request draining remains in place. Reconciliation happens before entering the generation lifecycle. Once generation starts, overlapping Hugging Face generations increment the process-local active count. The last active generation explicitly scales the endpoint to zero through the management API.

A request arriving while explicit scale-to-zero is in flight waits for that lifecycle call before inference, as already implemented.

## Database initialization

Add a data migration that inserts the four new settings rows with empty values using conflict-safe inserts. Existing installations therefore gain the keys without overwriting operator values.

`hfInferenceEndpointNamespace` and `hfTextInferenceEndpointName` must be populated before using `textProvider=huggingface`. `hfTextInferenceEndpointUrl` may start empty because reconciliation derives it from endpoint metadata.

## Error handling

- Missing namespace/name gives a clear settings error.
- Missing `HF_TOKEN` gives the existing secret configuration error.
- HF management non-2xx responses include status/body in the error.
- Endpoint `failed` or `updateFailed` aborts reconciliation.
- A reconcile timeout reports the latest endpoint state.
- Inference continues to use the cold-start 502/503 retry logic and `X-Scale-Up-Timeout` header.

## Non-goals

- No Hugging Face Router fallback.
- No automatic creation of a brand-new endpoint from only `textModel` in this change.
- No automatic hardware selection when a new model does not fit the existing endpoint hardware.
- No distributed coordination across multiple shoe-bot processes; the current explicit scale-to-zero lifecycle is already process-local.
- No image repository reconciliation yet.
