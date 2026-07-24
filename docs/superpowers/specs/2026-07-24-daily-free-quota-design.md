# Daily Free Request Quota

## Status

Approved on 2026-07-24.

## Goal

Give every user without an active subscription three free bot requests per
UTC calendar day. Text and image generation consume the same quota. Active
subscribers and admins remain unlimited.

The quota is global per Telegram user across private chats and groups. It is a
permanent free tier, not a trial limited to the first days after registration.

## Request Classification

A request consumes one free slot when it is one of the following:

- any ordinary text message sent to the bot in a private chat;
- a group message matching `textTriggerRegexp`;
- a reply to a message sent by this bot, in either private or group chat;
- the `/shicture` command.

A reply to another bot must not trigger this bot. An ordinary group message
without a trigger or a reply to this bot must be ignored.

The following service commands remain available without consuming quota:

- `/start`
- `/help`
- `/activate`
- `/profile`
- `/getbotroles`
- `/setbotrole`
- admin-only commands such as `/stats` and `/generate`

Unknown commands in a private chat are treated as ordinary text requests.

## Subscription and Admin Rules

An admin or a user whose `allowedTill` subscription date is still active
does not reserve quota. Existing subscription behavior remains available for
manual premium access and activation codes.

All other users use the free quota, including users who have never subscribed
and users whose subscription has expired.

## Data Model

Add one Prisma model for daily usage with these fields:

- `id`
- `userId`, related to `NewUser`
- `date`, stored as a PostgreSQL `date`
- `used`, the number of slots consumed

The pair `(userId, date)` is unique. The free request limit is a single
application constant with value `3`.

Absence of a row means that the user has all three requests available for that
UTC day. The first reservation creates the row directly with `used = 1`, which
leaves two requests. It must not first create an empty row and then update it.

Each UTC day gets a separate row. No cron job or reset mutation is required.

## Atomic Reservation

Quota reservation is one atomic PostgreSQL operation:

1. Insert `(userId, current UTC date, used = 1)` when no row exists.
2. On conflict with the unique user/date pair, increment `used` only when it
   is below `3`.
3. Return the updated usage when the reservation succeeds.
4. Return no row when usage is already `3`; the request is rejected.

The UTC date must be derived consistently for reservation, refund, and profile
display. The database operation must prevent four concurrent requests from all
passing the three-request limit.

A refund atomically decrements `used` without allowing it to become negative.

## Middleware and Data Flow

The access middleware runs after the current user is loaded but before dialog
creation and generation controllers:

1. Classify the update.
2. Pass service commands without reserving quota.
3. Ignore irrelevant group messages.
4. Pass admins and active subscribers without reserving quota.
5. Atomically reserve one daily slot for every other generation request.
6. If reservation fails, send the exhausted-quota response and stop.
7. Run the downstream controller.
8. If downstream processing throws, refund the reserved slot and rethrow the
   original error for normal logging.
9. If downstream processing completes, keep the slot consumed.

Checking that a reply belongs to this bot must compare the replied message's
sender ID with `context.me.id`, not merely check `is_bot`.

Rejecting an exhausted request must happen before creating a dialog or message
history row.

## Success and Failure Semantics

A slot is consumed only when the complete result is successfully sent to the
user.

Failures in task selection, AI generation, image generation, Telegram delivery,
or required bot-role lookup must surface as thrown errors so the middleware can
refund the slot. Controllers may send the existing generic error reply before
throwing, but must not silently return after a failed generation.

If the process terminates completely after reservation but before refund, one
slot may remain consumed. Persistent per-request reservations would remove this
edge case but are intentionally out of scope because they add state and cleanup
complexity disproportionate to a three-request free tier.

## User-Facing Responses

For an inactive subscriber, `/profile` shows:

> Бесплатных запросов сегодня осталось: N из 3. Сброс в 00:00 UTC.

For an exhausted quota, the bot replies:

> Бесплатные запросы на сегодня закончились. Следующие 3 будут доступны после
> 00:00 UTC.

The bot does not announce the remaining count after every successful request.

Remove all existing payment links and subscription-purchase promotion. Premium
access remains operational but is not advertised.

## Random Encounter Removal

Remove random encounter behavior completely rather than leaving it disabled:

- delete the commented random reply controller and branch;
- delete `src/lib/randomEncounterWords.ts`;
- remove random encounter imports and helper functions from `src/lib/prompt.ts`;
- remove `RANDOM_ENCOUNTER_CHANCE` from config and `.env.example`;
- remove the feature from `/help`;
- remove stale random encounter TODOs and comments.

Random style selection used by `/shicture` is unrelated and remains.

## Scope and Code Organization

Keep the change local:

- one Prisma model and migration;
- one small quota module for reserve, refund, and remaining-count operations;
- the existing access middleware for classification and lifecycle handling;
- the profile and generation controllers adjusted only where required;
- reply strings and dead random encounter code cleaned up in their existing
  files.

Do not add factories, registries, dependency-injection containers, background
jobs, or speculative quota abstractions.

## Verification

Verify these behaviors:

- a user without a daily row can make a request and has two remaining;
- three requests pass and the fourth is rejected;
- concurrent requests cannot exceed three successful reservations;
- a generation or delivery failure refunds the reservation;
- usage is shared across all chats for the same user;
- a new UTC day starts with three available requests;
- active subscribers and admins remain unlimited;
- service commands do not consume quota;
- `/shicture` consumes quota;
- private text, group triggers, and replies to this bot consume quota;
- replies to other bots and unrelated group messages do not trigger;
- `/profile` reports the correct remaining count;
- exhausted requests create no dialog or message rows;
- no random encounter or payment-link references remain;
- lint, typecheck, and production build pass.
