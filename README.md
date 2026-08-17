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
   `OPENROUTER_API_KEY` when selecting that text provider. For Hugging Face
   text inference, configure `HF_TOKEN`, `HF_INFERENCE_ENDPOINT_NAMESPACE`,
   `HF_TEXT_INFERENCE_ENDPOINT_NAME`, and `HF_TEXT_INFERENCE_ENDPOINT_URL`.
   Add `HF_INFERENCE_ENDPOINT_URL` for Hugging Face image inference. Add
   `ADMINS_USERNAMES` to use admin commands.
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
`OPENROUTER_API_KEY` for OpenRouter, or the Hugging Face endpoint configuration
described below for a dedicated Hugging Face Inference Endpoint.

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

Create a dedicated Hugging Face Inference Endpoint once for the desired text
model, using Text Generation Inference (TGI) with a chat template, then
configure the endpoint resource and its inference URL:

```env
HF_TOKEN='hf_...'
HF_INFERENCE_ENDPOINT_NAMESPACE='your-hf-user-or-org'
HF_TEXT_INFERENCE_ENDPOINT_NAME='shoe-bot-text'
HF_TEXT_INFERENCE_ENDPOINT_URL='https://your-text-endpoint.region.endpoints.huggingface.cloud'
```

`HF_TEXT_INFERENCE_ENDPOINT_URL` is the data-plane URL used for inference.
`HF_INFERENCE_ENDPOINT_NAMESPACE` plus `HF_TEXT_INFERENCE_ENDPOINT_NAME`
identify the persistent endpoint resource in the Hugging Face management API so
the bot can scale its compute to zero after requests finish. The token therefore
needs both inference access and permission to manage this endpoint.

The endpoint resource is not recreated for every request. Scaling it to zero
turns off its compute replicas while keeping the endpoint resource and inference
URL. The next inference request automatically wakes the endpoint and incurs the
usual cold-start delay.

The bot automatically appends `/v1` and uses the endpoint's OpenAI-compatible
`/v1/chat/completions` API. There is no Hugging Face Router fallback and no
OpenRouter fallback: when `textProvider` is `huggingface`, all user-facing text
completion requests go directly to that dedicated endpoint.

Switch text generation to the endpoint, for example:

```sql
UPDATE settings SET value = 'huggingface' WHERE key = 'textProvider';
UPDATE settings SET value = 'owner/qwen-uncensored-finetune' WHERE key = 'textModel';
```

The actual weights being executed are determined by the model repository
deployed on the Hugging Face endpoint. `textModel` remains the project-level
identifier used in settings and logging; changing that database value alone does
not update the endpoint's deployed repository.

To test a different Hugging Face model with the same endpoint resource, update
the endpoint repository through Hugging Face UI/API/CLI and wait for the update
to finish. For example, Hugging Face's CLI supports:

```bash
hf endpoints update shoe-bot-text --repo owner/another-uncensored-model
```

Hugging Face supports updating the model on an existing endpoint instead of
creating a new endpoint for every model. While the update is being deployed the
endpoint is pending and its inference URL may temporarily be unavailable. After
it becomes ready, read the endpoint metadata again and use the URL returned by
Hugging Face; update `HF_TEXT_INFERENCE_ENDPOINT_URL` if it differs from the
currently configured URL. Then set `textModel` to the new repository ID so
application settings/logs match what is actually deployed. A substantially
larger or differently packaged model may also require updating endpoint hardware
or its custom container/runtime.

Hugging Face endpoints that are scaled to zero can return HTTP 502 or 503 while
a replica is waking, depending on the endpoint/proxy behavior. The Hugging Face
text provider sends `X-Scale-Up-Timeout: 600`, allowing supported HF proxies to
hold the request for up to 10 minutes while scaling up, and also retries 502/503
cold-start responses every 5 seconds within a 10-minute client-side wait budget.

For minimum idle cost, the bot explicitly scales the text endpoint to zero as
soon as its in-process active Hugging Face generation count reaches zero. If two
or more Hugging Face text generations overlap, the endpoint stays running until
the final one finishes. A request arriving while a scale-to-zero management call
is already in progress waits for that call to finish and then sends inference,
which wakes the endpoint again. Failure of the management call is logged but
does not discard a text response that was already generated.

Automatic scale-to-zero can still be enabled on the Hugging Face endpoint as a
fallback. This explicit active-request counter is process-local, so a deployment
running multiple shoe-bot processes/replicas needs distributed coordination
before using immediate scale-to-zero safely; otherwise one process could shut
the shared endpoint down while another process is still generating.

## Image providers

Image generation reads `imageProvider` and `imageModel` from the global
`settings` table. Supported providers are `openai`, `togetherai`, `xai`, and
`huggingface`.

The `huggingface` provider is intended for a dedicated Hugging Face Inference
Endpoint that runs a community/custom model not conveniently available through
the normal hosted providers. A model existing on the Hugging Face Hub does not
by itself make it callable by this integration: deploy an Inference Endpoint
first and configure its URL.

Configure the endpoint with:

```env
HF_TOKEN='hf_...'
HF_INFERENCE_ENDPOINT_URL='https://your-endpoint.region.endpoints.huggingface.cloud'
```

Then switch image generation to Hugging Face, for example:

```sql
UPDATE settings SET value = 'huggingface' WHERE key = 'imageProvider';
UPDATE settings SET value = 'owner/community-image-model' WHERE key = 'imageModel';
```

The initial Hugging Face adapter sends an authenticated `POST` to the configured
endpoint with this body:

```json
{
  "inputs": "image prompt"
}
```

It accepts binary image responses and common JSON URL/base64 image responses.
The endpoint URL determines the actual deployed model; `imageModel` remains the
project-level model identifier used in settings and error messages.

Hugging Face source-image editing is not supported yet. Managed Diffusers
Text-to-Image endpoints require a repository containing the full model weights;
LoRA-only repositories need a custom inference handler/container. That custom
endpoint contract can later be extended with LoRA selection, weight, seed,
steps, dimensions, and other model-specific parameters.
