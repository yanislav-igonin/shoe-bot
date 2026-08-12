# Parallel Requests Design

## Goal

Process independent Telegram updates concurrently so one slow text or image
generation does not block later requests.

## Current bottlenecks

`bot.start()` uses grammY's sequential long-polling loop. In addition, the
uploaded-image middleware places every downstream update into one shared
promise chain. Either mechanism serializes all generation requests.

## Design

- Replace `bot.start()` with the official `@grammyjs/runner` `run(bot)` entry
  point. Keep runner defaults and do not add an application concurrency limit,
  queue, or per-chat sequentialization.
- Remove the uploaded-image middleware's global downstream promise chain and
  call `next()` directly for ordinary updates, standalone photos, and replayed
  album captions.
- Keep album collection and replay unchanged. Map and set mutations occur
  synchronously before an `await`, so concurrent updates cannot interleave
  those individual state transitions inside one Node.js process.
- Register `SIGINT` and `SIGTERM` handlers that stop the runner gracefully.
  Continue logging polling failures and close the database when the runner
  task ends.

The existing per-update MikroORM fork isolates identity maps. Existing-user
profile writes are idempotent, dialog and message rows are request-local, and
daily quota reservation already uses database-level atomicity. No session
middleware exists, so grammY's `sequentialize` middleware is not required.

## Alternatives rejected

- A custom polling loop duplicates runner offset, retry, and shutdown behavior.
- Webhooks or multiple bot processes add deployment and cross-process album
  state concerns without benefit at the current traffic level.
- Per-user or per-chat sequentialization would preserve the latency problem for
  the exact usage this change targets.

## Errors and shutdown

Update errors continue through `bot.catch`. Runner task failures are logged and
the database is closed. Process signals request a graceful runner stop so
in-flight updates can finish before shutdown.

## Testing

- Replace the uploaded-image serialization test with a controlled-promise test
  proving a second update reaches downstream middleware while the first remains
  blocked.
- Keep album debounce and exactly-once replay tests unchanged.
- Run the complete test, lint, typecheck, and build suites.

No database migration or configuration change is required.
