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
   `OPENROUTER_API_KEY` when selecting that text provider. Add
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
`togetherai`, and `openrouter`.

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
