# Native Image Editing Design

## Goal

Replace the legacy image-description-regeneration flow with native image editing
when a user replies to a generated image.

## Design

- Treat a text reply as an image edit only when its direct database reply target
  has a Telegram photo ID.
- Resolve that exact Telegram photo and pass it with the user's unchanged text to
  the configured image provider.
- Use Vercel AI SDK image inputs for xAI.
- Use `reference_images` for documented Together FLUX.2/Google edit models and
  `image_url` for documented FLUX.1 Kontext models.
- Reject unsupported Together models with a specific user-facing response.
- Keep ordinary text replies in mixed text/image dialogs working by supplying
  Telegram image URLs to the existing conversation-context builder.

## Persistence and Errors

Persist the user's edit request before provider generation, as current generation
flows do. Persist the resulting Telegram photo as an image reply. Provider failures
keep the existing generic error response; known unsupported models use a dedicated
response.

## Scope

No database migration, provider registry, mask editing, multi-image editing, or
new configuration is required.
