# OpenAI Image Moderation Design

## Goal

Block unsafe OpenAI image generation and editing requests before they reach the
image API.

## Design

- Apply moderation only after image settings select the OpenAI provider.
- Call `openai.moderations.create` with `omni-moderation-latest` immediately
  before `openai.images.generate` or `openai.images.edit`.
- Moderate the text prompt for generation. For editing, moderate one multimodal
  input containing the prompt and source image data URL so both parts of the
  request are checked.
- Use the moderation response's aggregate `flagged` value as the blocking
  decision. Do not add application-specific score thresholds.
- Keep the moderation helper and its rejection error in
  `src/lib/imageGeneration.ts`; a separate service or wrapper would add no useful
  boundary because the existing OpenAI client is already the I/O boundary.

## Failure Behavior

- A flagged result throws `ImageModerationRejectedError`; the image API is not
  called.
- Moderation API failures are fail-closed and propagate through existing error
  handling, so an unavailable moderation service cannot bypass the guard.
- Controllers map a moderation rejection to a dedicated Russian reply. Other
  failures retain the existing generic reply.
- xAI and Together requests do not invoke OpenAI moderation.

## Testing

- Verify safe OpenAI generation is moderated before image generation.
- Verify flagged generation never calls the image API.
- Verify OpenAI editing sends both prompt and source image to moderation and
  never calls the edit API when flagged.
- Verify the dedicated controller reply for moderation rejection.
- Preserve all existing provider and controller behavior.

## Scope

No new dependencies, database settings, score thresholds, retries, audit
storage, moderation of text responses, or moderation for non-OpenAI providers.
