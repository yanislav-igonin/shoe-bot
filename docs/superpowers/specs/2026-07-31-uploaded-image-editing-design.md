# Uploaded Image Editing Design

## Goal

Allow a user to reply to an uploaded Telegram photo or album with the bot trigger
and an edit instruction. The bot edits every selected source image sequentially,
sends each result, and adds the source messages to the active dialog only after
the edit is requested.

## Design

- Observe incoming photo updates before request-access filtering and retain the
  latest 100 media groups in a process-local cache keyed by chat and
  `media_group_id`. Standalone photos need no cache because Telegram includes the
  replied-to message in the trigger update.
- Resolve a trigger reply to the full cached album when possible. Fall back to the
  exact replied-to photo after a restart or cache eviction.
- Keep photo messages out of the database until a trigger reply is handled. At
  that point, persist every resolved source photo in the new dialog, then persist
  one edit instruction that replies to the exact selected source.
- Reuse native provider editing from issue #44. Download and edit sources one at
  a time, send results as individual Telegram photos, and persist each result as
  a reply to the edit instruction.
- Route triggered replies before task classification so this behavior works in
  group chats and also preserves editing of bot-generated photos.

## Failure Behavior

- If an album is unavailable after process restart or bounded-cache eviction,
  edit the exact photo present in `reply_to_message` instead of rejecting the
  request.
- Isolate provider or Telegram failures per photo and continue processing the
  remaining album. Retain successful outputs and report failed photo numbers.
- If every photo fails, send the existing provider-specific or generic error
  reply and rethrow for quota refund behavior.

## Scope

No migration, durable upload staging, media-group output, parallel generation,
document-image support, or provider changes are included.
