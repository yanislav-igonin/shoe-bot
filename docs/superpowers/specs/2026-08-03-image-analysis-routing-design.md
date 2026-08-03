# Image Analysis Routing Design

## Goal

Allow the bot to answer textual questions about uploaded or generated images while preserving image generation and editing behavior. Image captions and replies to images use the same `text | image` intent classifier as ordinary triggered prompts.

## Request routing

Every prompt is classified as `text` or `image`.

| Source images | `text` intent | `image` intent |
| --- | --- | --- |
| none | text completion | image generation |
| one or more | multimodal text completion | image editing |

`chooseTask()` continues to use `Grok3Mini`. It uses AI SDK `Output.choice()` with the choices `text` and `image` instead of manually parsing JSON. Any classification error is logged and falls back to `text`. Cross-provider fallback and provider configuration are outside this change.

## Accepted Telegram inputs

- A text reply to an uploaded or bot-generated photo is classified before selecting analysis or editing.
- A standalone photo with a non-empty caption is handled in private chats without a trigger.
- A photo caption in a group is handled only when it starts with the existing text trigger. The trigger is removed before classification and generation.
- Photos without captions are remembered for future replies but do not produce a response.
- Album requests use every photo in the album in Telegram message order.

## Album collection

Telegram does not mark the final update in a media group. The early uploaded-image middleware collects album updates and waits for 500 ms of inactivity. It then replays the caption-bearing update exactly once through the normal middleware chain. This preserves authentication, quota reservation/refund, dialog creation, and error handling without enabling concurrent grammY update processing.

Album updates without captions remain cached for later replies and do not enter the generation pipeline. A group caption that does not match the trigger is rejected by the normal access middleware after replay.

## Dialog and persistence

One database `Message` represents each Telegram message.

- A photo caption is stored as one multimodal message with both `text` and `tgPhotoId`.
- Other album photos are stored as image messages without text.
- A text reply to a photo is stored as a new request message whose `replyTo` is the exact replied photo.
- `Message.type` retains its current intent semantics for user requests: `text` for text responses and `image` for generation or editing.
- Bot responses point to the user request message.

Text analysis receives the selected bot role, the previous dialog, the current prompt, and every source image. Current source images are included once. Text replies are stored as `MessageType.text`; edited images are stored as `MessageType.image`.

## Errors

- Classification errors fall back to text handling.
- If any source image cannot be downloaded for text analysis, the entire text request fails with the standard error reply. The bot must not silently analyze a partial album.
- Image editing keeps the existing per-image isolation and partial-failure reply.
- The album replay callback logs unexpected failures and never processes the same caption update twice.

## Testing

Tests cover:

- validated `Output.choice()` classification and text fallback;
- caption-aware access classification;
- standalone caption and image-reply routing;
- the four source/intent routing combinations;
- complete ordered album resolution;
- 500 ms album debounce and exactly-once replay;
- full-dialog multimodal text context;
- whole-request failure when one analysis image download fails;
- unchanged partial image-edit behavior.

No database migration is required.
