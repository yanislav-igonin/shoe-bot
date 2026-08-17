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
   `OPENROUTER_API_KEY` when selecting that text provider. Add `HF_TOKEN` and
   `HF_TEXT_INFERENCE_ENDPOINT_URL` for Hugging Face text inference, and
   `HF_INFERENCE_ENDPOINT_URL` for Hugging Face image inference. Add
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
`OPENROUTER_API_KEY` for OpenRouter, or `HF_TOKEN` plus
`HF_TEXT_INFERENCE_ENDPOINT_URL` for a dedicated Hugging Face Inference
Endpoint.

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

Deploy the desired Hub model to a Hugging Face Inference Endpoint using Text
Generation Inference (TGI) with a chat template, then configure:

```env
HF_TOKEN='hf_...'
HF_TEXT_INFERENCE_ENDPOINT_URL='https://your-text-endpoint.region.endpoints.huggingface.cloud'
```

The bot automatically appends `/v1` and uses the endpoint's OpenAI-compatible
`/v1/chat/completions` API. There is no Hugging Face Router fallback and no
OpenRouter fallback: when `textProvider` is `huggingface`, all user-facing text
completion requests go directly to that dedicated endpoint.

Switch text generation to the endpoint, for example:

```sql
UPDATE settings SET value = 'huggingface' WHERE key = 'textProvider';
UPDATE settings SET value = 'owner/qwen-uncensored-finetune' WHERE key = 'textModel';
```

The endpoint URL determines which model is actually loaded and executed.
`textModel` is retained as the project-level model identifier for settings and
logging; changing `textModel` alone does not redeploy the Hugging Face endpoint.
To change the actual model, update/redeploy the endpoint and its configured URL.

Hugging Face endpoints that are scaled to zero can return HTTP 502 or 503 while
a replica is waking, depending on the endpoint/proxy behavior. The Hugging Face
text provider sends `X-Scale-Up-Timeout: 600`, allowing supported HF proxies to
hold the request for up to 10 minutes while scaling up, and also retries 502/503
cold-start responses every 5 seconds within a 10-minute client-side wait budget.

For minimum idle cost, configure the endpoint with a minimum replica count of 0
and automatic scale-to-zero. The automatic idle timeout is an endpoint setting;
it is not tied to completion of an individual request. Hugging Face also
supports explicitly scaling an endpoint to zero through its endpoint-management
API. A scaled-to-zero endpoint incurs no compute charge and wakes automatically
on the next inference request.

The bot does not explicitly scale the endpoint to zero immediately after each
response. Adding that behavior requires endpoint-management credentials/name and
concurrency-safe request draining so one completed request cannot shut down a
replica while another request is still running.

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
