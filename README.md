# shoe-bot

# Stack
- Typescript
- grammY
- Prisma

# Run
1. Install dependencies:
```
npm install
```
2. Make `.env` file from `.env.example` and provide `BOT_TOKEN`, `OPENAI_API_KEY` and `ALLOWED_USERNAMES` values.
  `ALLOWED_USERNAMES` is a comma-separated list of telegram usernames of users who can use bot.
3. Run postgresql database via provided docker-compose file:
```
docker compose up
```
4. Push database schema:
```
npx prisma db push
```
5. Run bot:
```
npm run dev
```