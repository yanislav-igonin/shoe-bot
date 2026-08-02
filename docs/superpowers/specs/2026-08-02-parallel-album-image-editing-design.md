# Parallel Album Image Editing Design

## Goal

Process up to five images from one Telegram album concurrently and send each
successful result as soon as that image finishes.

## Design

- Keep the existing controller, Telegram reply shape, persistence model, and
  per-image error isolation.
- Run a fixed pool of at most five workers over album sources. Each worker takes
  the next unprocessed source, downloads it, generates the edit, sends it, and
  persists the response before taking another source.
- Fork the request-scoped MikroORM `EntityManager` for every source so concurrent
  generation queries and flushes do not share one Unit of Work.
- Preserve source indices independently from completion order. Successful photos
  may arrive out of order, without captions. Failed indices are sorted before the
  existing partial-failure summary is rendered.

## Failure Behavior

- A failed source does not cancel queued or running sources.
- Partial success sends successful photos immediately, then the existing summary
  after all sources settle.
- If every source fails, send the existing provider-specific or generic error and
  rethrow the first failure in source order so quota-refund behavior remains intact.

## Scope

Do not add grammY runner, concurrent Telegram update handling, captions, provider
changes, retries, migrations, or new dependencies.
