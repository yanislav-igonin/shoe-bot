# Hugging Face Inference Endpoints Design

## Goal

Add Hugging Face Inference Endpoints as an image-generation provider for arbitrary Hub-hosted checkpoints and community models that are not available through the project's normal hosted providers.

## Scope

- Keep OpenRouter as the normal path for common open-source text models.
- Keep direct provider integrations for proprietary models.
- Add `huggingface` to image-provider selection.
- Call a configured dedicated Hugging Face Inference Endpoint with bearer authentication.
- Support text-to-image first.
- Normalize binary image responses and common JSON URL/base64 image responses into the existing `generateImage()` return shape.
- Reject source-image editing explicitly until a deployed endpoint contract is defined.
- Keep the endpoint request helper small enough to extend later with LoRA/custom inference parameters.

## Configuration

Add optional environment variables:

- `HF_TOKEN`
- `HF_INFERENCE_ENDPOINT_URL`

They are validated only when the Hugging Face provider is selected, matching the existing Together provider behavior.

## Request/response contract

The default request uses `POST <HF_INFERENCE_ENDPOINT_URL>` with:

- `Authorization: Bearer <HF_TOKEN>`
- `Content-Type: application/json`
- `Accept: image/*, application/json`
- JSON body `{ "inputs": "<prompt>" }`

For successful responses:

1. If `Content-Type` is an image media type, return the response bytes.
2. If JSON contains an image URL in `url` or `data[0].url`, return that URL.
3. If JSON contains base64 image data in `b64_json` or `data[0].b64_json`, decode and return a `Buffer`.
4. Otherwise throw an actionable unsupported-response error.

Non-2xx responses include the status and the endpoint response body when available.

## Testing

Add unit tests for provider parsing, missing configuration, authenticated requests, binary and JSON responses, non-2xx errors, and unsupported image editing.

## Documentation

Update `.env.example` and README with configuration and the intended provider split.
