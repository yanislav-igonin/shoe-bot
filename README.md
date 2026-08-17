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
   `HF_INFERENCE_ENDPOINT_URL` when selecting the Hugging Face image provider.
   Add `ADMINS_USERNAMES` to use admin commands.
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
`togetherai`, and `openrouter`.

Set the matching API key before switching: `TOGETHER_API_KEY` for Together AI
or `OPENROUTER_API_KEY` for OpenRouter. Update `textProvider` and `textModel`
together because model IDs are provider-specific.

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
models can continue to use their direct provider integrations.

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
