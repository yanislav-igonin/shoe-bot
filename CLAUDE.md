# CLAUDE.md - AI Assistant Guide for shoe-bot

## Project Overview

**shoe-bot** is a Telegram bot written in TypeScript that provides AI-powered text generation and image generation capabilities. The bot uses multiple AI providers (Grok/xAI, OpenAI, Mistral) and supports subscription-based access control with activation codes.

The bot is primarily designed for Russian-speaking users (UI strings are in Russian) and responds to trigger words like "ботинок," (shoe) or "блинное," in production, and "бомж," (hobo) in development.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (ES2022, NodeNext modules)
- **Telegram Framework**: grammY
- **Database**: PostgreSQL with Prisma ORM
- **AI Providers**:
  - Grok/xAI (primary, via OpenAI-compatible API)
  - OpenAI (GPT-3.5/4 for specific tasks)
  - Mistral (fallback)

## Project Structure

```
shoe-bot/
├── src/
│   ├── index.ts              # Main entry point, bot initialization
│   ├── telegram.ts           # Telegram API instance
│   ├── middlewares.ts        # grammY middlewares for auth, state, etc.
│   ├── controllers/          # Request handlers
│   │   ├── index.ts          # Controller exports
│   │   ├── text.controller.ts        # Main text/conversation handler
│   │   ├── textTrigger.controller.ts # Triggered text responses
│   │   ├── activate.controller.ts    # Subscription activation
│   │   ├── profile.controller.ts     # User profile
│   │   ├── shicture.controller.ts    # Random image generation
│   │   ├── get-bot-roles.controller.ts
│   │   ├── set-bot-role.controller.ts
│   │   └── admin/            # Admin-only controllers
│   │       ├── generate.controller.ts
│   │       └── stats.controller.ts
│   ├── lib/                  # Shared utilities
│   │   ├── ai.ts             # AI client instances (OpenAI, Mistral, Grok)
│   │   ├── config.ts         # Environment configuration
│   │   ├── context.ts        # BotContext type definition
│   │   ├── database.ts       # Prisma client instance
│   │   ├── prompt.ts         # AI prompt utilities and completions
│   │   ├── imageGeneration.ts # Image generation helpers
│   │   ├── replies.ts        # Bot reply templates
│   │   ├── logger.ts         # Logging utility
│   │   ├── values.ts         # Value helpers (valueOrNull, etc.)
│   │   └── date.ts           # Date utilities
│   └── repositories/         # Data access layer
│       └── stats.repository.ts
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Database migrations
├── .github/workflows/
│   └── push.yml              # CI: lint + typecheck on push
├── docker-compose.yml        # PostgreSQL for local dev
├── package.json
├── tsconfig.json
└── .eslintrc.json
```

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Build for production
npm run build

# Start production server
npm run start

# Start PostgreSQL database
docker compose up

# Push Prisma schema to database
npx prisma db push

# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name <migration_name>
```

## Environment Variables

Required in `.env` file (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram Bot API token |
| `OPENAI_API_KEY` | OpenAI API key |
| `GROK_API_KEY` | Grok/xAI API key |
| `MISTRAL_API_KEY` | Mistral AI API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `ENV` | `development` or `production` |
| `ADMINS_USERNAMES` | Comma-separated admin Telegram usernames |
| `RANDOM_ENCOUNTER_CHANCE` | Probability for random replies (0.0-1.0) |

## Code Conventions

### TypeScript

- Strict mode enabled
- ES modules with `.js` extensions in imports
- Path aliases configured in `tsconfig.json` (e.g., `lib/config.js`, `controllers/index.js`)
- Uses `tsc-alias` for build-time path resolution

### ESLint

- Uses `eslint-config-canonical` with TypeScript and Prettier
- Max line length: 85 characters (ignores strings, URLs, templates, regex)
- Many `@ts-expect-error` comments exist for typing issues with external libraries

### File Organization

- Controllers handle bot command/message logic
- Lib modules provide shared utilities
- Middlewares process requests before controllers
- Use barrel exports (`index.ts`) for controllers

### Naming

- Controllers: `<name>.controller.ts`
- Middlewares: `<name>Middleware` functions in `middlewares.ts`
- Database models: PascalCase (e.g., `NewUser`, `NewChat`, `NewDialog`)

## Architecture Patterns

### Middleware Chain

The bot uses grammY middlewares in this order:
1. `stateMiddleware` - Initializes `context.state` object
2. `chatMiddleware` - Loads/creates chat record
3. `dialogMiddleware` - Manages conversation dialogs
4. `userMiddleware` - Loads/creates user record
5. `userSettingsMiddleware` - Loads user settings (bot role)
6. `allowedMiddleware` - Checks subscription status

### Context State

The `BotContext` extends grammY's Context with:
```typescript
state: {
  chat: NewChat;
  dialog: NewDialog;
  user: NewUser;
  userSettings: UserSettings;
}
```

### AI Completion Flow

1. User message triggers controller
2. Controller prepares prompt with `preparePrompt()`
3. System context added via `addSystemContext()`
4. Previous dialog messages added via `addContext()`
5. `getCompletion()` calls Grok API (default) or other providers
6. Long responses chunked to 4000 chars via `chunkMessage()`
7. Response saved to database and sent to user

### Database Models

- **NewUser** - Telegram users with subscription status
- **NewChat** - Telegram chats (private/group/supergroup)
- **NewDialog** - Conversation sessions within chats
- **Message** - Individual messages (text/image/voice)
- **ActivationCode** - Subscription activation codes
- **BotRole** - Customizable bot personalities
- **UserSettings** - Per-user bot role preferences

## Bot Commands

| Command | Access | Description |
|---------|--------|-------------|
| `/start` | Public | Welcome message |
| `/help` | Public | Usage instructions |
| `/activate <code>` | Public | Activate subscription |
| `/profile` | Public | View subscription status |
| `/getbotroles` | Public | List available bot roles |
| `/setbotrole <id>` | Public | Change bot personality |
| `/shicture` | Subscribers | Generate random styled image |
| `/stats` | Admin | View usage statistics |
| `/generate` | Admin | Generate activation codes |

## Trigger Patterns

- **Production**: Messages starting with `ботинок,`, `shoe,`, or `блинное,`
- **Development**: Messages starting with `бомж,` or `hobo,`

In private chats, trigger words are optional.

## CI/CD

GitHub Actions workflow runs on every push:
- **lint** job: Runs `npm run lint`
- **typecheck** job: Runs `npm run typecheck`

Both use Node.js 18.

## Important Notes for AI Assistants

1. **Russian Language**: Most user-facing strings are in Russian (see `lib/replies.ts`)
2. **Multiple AI Providers**: Default is Grok (xAI), configured in `lib/ai.ts` and `lib/prompt.ts`
3. **Subscription Model**: Users need active subscriptions to use the bot (except admins)
4. **Dialog Context**: The bot maintains conversation context within "dialogs" - reply chains are tracked
5. **Image Generation**: Uses Grok's `grok-2-image` model
6. **ts-expect-error**: Several typing workarounds exist due to library type issues
7. **Message Chunking**: Responses over 4000 chars are split into multiple messages
8. **Main Model**: Currently set to `Model.Grok4` in `lib/prompt.ts`
