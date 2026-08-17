# shoe-bot

# Stack
- Typescript
- grammY
- MikroORM

# Run
1. Install dependencies:
```
npm install
```
2. Make `.env` file from `.env.example` and provide `BOT_TOKEN`,
   `GROK_API_KEY`, and `OPENAI_API_KEY`. Add `TOGETHER_API_KEY` or
   `OPENROUTER_API_KEY` when selecting that text provider. Add `HF_TOKEN` when
   using Hugging Face. Add `ADMINS_USERNAMES` to use admin commands.
3. Run postgresql database via provided docker-compose file:
```
docker compose up
```
4. Apply database migrations:
```
npm run migration:up
```

For an existing database that already matches the baseline schema:
```
npm run migration:baseline
```

The baseline command first introspects the connected database and verifies that
it matches the entity metadata, then records the initial migration without
executing its DDL. The legacy `_prisma_migrations` table is ignored and left
untouched.

5. Run bot:
```
npm run dev
```

## Text providers

User-facing text generation reads `textProvider` and `textModel` from the
global `settings` table for every request. Supported providers are `xai`,
`togetherai`, `openrouter`, and `huggingface`.

Set the matching API key before switching: `TOGETHER_API_KEY` for Together AI,
`OPENROUTER_API_KEY` for OpenRouter, or `HF_TOKEN` for a dedicated Hugging Face
Inference Endpoint.

Example switch to OpenRouter:

```sql
UPDATE settings SET value = 'openrouter' WHERE key = 'textProvider';
UPDATE settings SET value = 'anthropic/claude-sonnet-4.5' WHERE key = 'textModel';
```

Example switch to Together AI:

```sql
UPDATE settings SET value = 'togetherai' WHERE key = 'textProvider';
UPDATE settings SET value = 'moonshotai/Kimi-K2.5' WHERE key = 'textModel';
```

Common open-source text models should normally stay on OpenRouter. Proprietary
models can continue to use their direct provider integrations. The
`huggingface` text provider is specifically intended for community/custom models
that are deployed on a dedicated Hugging Face Inference Endpoint and are not
conveniently available through those hosted providers.

### Hugging Face text inference

Create one dedicated Hugging Face Inference Endpoint using Text Generation
Inference (TGI) or another compatible runtime that exposes the OpenAI-compatible
chat API. The endpoint is a persistent resource; its compute replicas can scale
to zero without deleting the endpoint.

Only the Hugging Face token is an environment secret:

```env
HF_TOKEN='hf_...'
```

The endpoint's mutable metadata lives in the global `settings` table. The
migration creates these rows without overwriting existing values:

- `hfInferenceEndpointNamespace` — Hugging Face user/organization that owns the endpoint.
- `hfTextInferenceEndpointName` — stable endpoint resource name.
- `hfTextInferenceEndpointUrl` — current inference URL cached by the bot. It may start empty and is refreshed automatically from Hugging Face metadata.
- `hfImageInferenceEndpointUrl` — dedicated image endpoint URL, if the Hugging Face image provider is used.

Configure the text endpoint resource once, for example:

```sql
UPDATE settings SET value = 'your-hf-user-or-org' WHERE key = 'hfInferenceEndpointNamespace';
UPDATE settings SET value = 'shoe-bot-text' WHERE key = 'hfTextInferenceEndpointName';
UPDATE settings SET value = 'huggingface' WHERE key = 'textProvider';
UPDATE settings SET value = 'owner/community-finetune' WHERE key = 'textModel';
```

`hfTextInferenceEndpointUrl` does not need to be entered manually if the
management API already returns a URL for the endpoint. The bot reads the current
endpoint metadata and stores the returned URL back into that settings row.

The Hugging Face provider never routes through Hugging Face Router or
OpenRouter. Inference goes directly to the reconciled dedicated endpoint. The
bot appends `/v1` and uses its OpenAI-compatible `/v1/chat/completions` API.

#### Automatic model reconciliation

For Hugging Face, `textModel` is the desired Hub repository. The bot reconciles
the existing endpoint against that value before every Hugging Face text request
and also in the background every 30 seconds.

If the endpoint currently runs a different repository, the bot automatically:

1. updates the existing endpoint repository through the Hugging Face management API;
2. polls endpoint metadata every 5 seconds for up to 10 minutes;
3. waits for the desired repository to become `running` or `scaledToZero` with an inference URL;
4. writes the latest URL into `hfTextInferenceEndpointUrl`;
5. sends inference to that URL.

This means that after the one-time endpoint setup, switching to another
compatible community model only requires changing `textModel`:

```sql
UPDATE settings SET value = 'another-owner/another-community-model' WHERE key = 'textModel';
```

No application environment change or redeploy is required just because Hugging
Face returns a different inference URL. The reconciler refreshes and persists
the current URL automatically.

The bot deliberately does not create a new endpoint or select new hardware on
its own. A substantially larger model, a different serving runtime, or a model
that does not fit the endpoint's current hardware may make Hugging Face report
`updateFailed`; change the endpoint hardware/runtime manually in that case and
let reconciliation retry afterward.

Concurrent reconciliation calls inside one bot process are coalesced into one
in-flight reconcile so a burst of requests does not issue duplicate endpoint
updates. Reconciliation and active-generation draining are process-local; a
horizontally scaled deployment needs distributed coordination for strict
cross-process model-switch and shutdown guarantees.

#### Cold start and scale-to-zero

Hugging Face endpoints scaled to zero can return HTTP 502 or 503 while a replica
is waking, depending on endpoint/proxy behavior. The provider sends
`X-Scale-Up-Timeout: 600` and retries 502/503 cold-start responses every 5
seconds within a 10-minute client-side wait budget.

For minimum idle compute cost, the bot explicitly scales the text endpoint to
zero when its in-process active Hugging Face generation count reaches zero. If
multiple text generations overlap, the endpoint stays running until the final
one finishes. A request arriving while the scale-to-zero management call is in
progress waits for that call and then sends inference, which wakes the endpoint
again. A scale-to-zero failure is logged but does not discard an already
completed response.

Automatic Hugging Face scale-to-zero can still be enabled as a fallback. The
active-request counter is process-local, so horizontally running multiple bot
replicas against one endpoint requires distributed coordination before relying
on immediate scale-to-zero.

## Image providers

Image generation reads `imageProvider` and `imageModel` from the global
`settings` table. Supported providers are `openai`, `togetherai`, `xai`, and
`huggingface`.

The `huggingface` provider is intended for a dedicated Hugging Face Inference
Endpoint that runs a community/custom image model. A model existing on the Hub
does not by itself make it callable: deploy an Inference Endpoint first.

Keep `HF_TOKEN` in the environment and store the image endpoint URL in settings:

```sql
UPDATE settings SET value = 'https://your-image-endpoint.region.endpoints.huggingface.cloud' WHERE key = 'hfImageInferenceEndpointUrl';
UPDATE settings SET value = 'huggingface' WHERE key = 'imageProvider';
UPDATE settings SET value = 'owner/community-image-model' WHERE key = 'imageModel';
```

The initial Hugging Face image adapter sends an authenticated `POST` to the
configured endpoint with this body:

```json
{
  "inputs": "image prompt"
}
```

It accepts binary image responses and common JSON URL/base64 image responses.
The image endpoint URL is currently configured directly in settings; automatic
image repository reconciliation is not implemented yet.

Hugging Face source-image editing is not supported yet. Managed Diffusers
Text-to-Image endpoints require a repository containing the full model weights;
LoRA-only repositories need a custom inference handler/container. That custom
endpoint contract can later be extended with LoRA selection, weight, seed,
steps, dimensions, and other model-specific parameters.
