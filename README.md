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
2. Make `.env` file from `.env.example` and provide `BOT_TOKEN` and `OPENAI_API_KEY`values. Add `ADMINS_USERNAMES` if you want to use admin commands.
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

The baseline command first verifies that entity metadata matches the database,
then records the initial migration without executing its DDL.

5. Run bot:
```
npm run dev
```
