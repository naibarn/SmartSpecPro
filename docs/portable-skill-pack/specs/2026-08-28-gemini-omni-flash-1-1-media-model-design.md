# Gemini Omni 1.1 Flash Media Model Design

## Goal

Add Kie.ai's `google/gemini-omni-flash-1-1` as a separate video media model while preserving the existing `gemini-omni-video` catalog entry and all historical task behavior.

## Provider contract

The new catalog row uses Kie.ai's unified market endpoint:

- create: `/api/v1/jobs/createTask`
- status: `/api/v1/jobs/recordInfo`
- provider model: `google/gemini-omni-flash-1-1`
- payload: `model`, `callBackUrl` (optional), and `input` fields built by the existing Kie market adapter
- supported duration: `4`, `6`, `8`, `10`
- supported aspect ratio: `16:9`, `9:16`
- supported resolution: `360p`, `720p`, `1080p`, `4k`
- multimodal inputs: `image_urls`, `video_list`, `character_ids`, `audio_ids`
- reference quota: images and character IDs cost one unit each; one source video costs two units; total is at most seven units
- first/last frame: `first_frame_url` and `last_frame_url` are mutually exclusive with multimodal references; last frame requires first frame

The provider page and API documentation are the source of truth for this model contract. Pricing is stored as catalog data and must not be inferred from the old Gemini Omni row.

## Application design

1. Add a new stable internal ID, `gemini-omni-flash-1-1`, to the static fallback registry, DB seed catalog, and media-generation fallback map. Its `kieModelId` is the exact provider ID above.
2. Replace hard-coded checks for only `gemini-omni-video` with a shared `isGeminiOmniVideoModelId` predicate covering both internal IDs and provider aliases. The existing Gemini Omni suite, provider-asset checks, Vertical Drama capability discovery, and retry path will therefore work for either model.
3. Extend the shared Gemini Omni validation contract with optional first/last-frame URLs and enforce URL safety, pair completeness, and mutual exclusion before credit reservation/provider submission.
4. Keep the generic Kie provider request builder as the single transport path. The new row's `apiConfig` declares `first_frame_url`/`last_frame_url` input fields and the existing `image_urls`/`video_list`/asset fields. Tests assert the exact provider model and payload shape.
5. Keep existing `gemini-omni-video` pricing and payload unchanged. New model pricing follows the current Kie page's documented matrix and is isolated to the new row.

## Failure and compatibility behavior

- Unknown or invalid model configuration fails closed through existing catalog/provider contract checks.
- Invalid reference combinations are rejected as `BAD_REQUEST` before credit reservation.
- Provider task submission, polling, callback, durable media storage, and result projection remain unchanged and are verified against the new model ID.
- Old tasks, old aliases, and the existing Gemini Omni suite remain supported.
- No schema migration is required. Enabling the new DB row is an explicit seed/upsert operation.

## Verification and rollout

Local proof must cover registry parity, model resolution, validation, exact payload, and async task handling. If a Kie API key and safe test input are available, run one prompt-only and one image-reference live smoke through the application's Python provider or existing media task path; do not claim live proof when credentials/provider access are unavailable. Production deployment and DB seed execution remain separate operational steps.

## Non-goals

- replacing or renaming `gemini-omni-video`
- changing Gemini Omni Character/Audio provider asset endpoints
- adding a schema migration
- promising lipsync or unsupported first/last-frame behavior in the existing Vertical Drama bridge planner
