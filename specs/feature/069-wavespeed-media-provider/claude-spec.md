# Claude Spec: WaveSpeed Media Provider and Cinematic Video Generator

## Summary

Add WaveSpeed as a new admin-manageable media provider and seed the official model `wavespeed-ai/cinematic-video-generator` as the first supported WaveSpeed video model. The feature must expose the provider in Admin > Media Providers, expose the model in Admin > Media Models, support prompt-only and prompt-plus-image video generation through the existing Python media pipeline, and preserve correct tiered pricing even when the database path is unavailable.

## Product goals

- Add a new provider named `wavespeed_ai`.
- Seed the provider base URL as `https://api.wavespeed.ai/api/v3`.
- Seed one initial video model:
  - model id: `wavespeed-ai/cinematic-video-generator`
  - display name: `Seedance 2.0 Grade Cinematic Video Generator`
- Support the official model inputs:
  - `prompt` (required)
  - `images` (optional, up to 4)
  - `aspect_ratio` in `16:9`, `9:16`, `4:3`, `3:4`
  - `duration` in `5`, `10`, `15`
- Keep the repo’s async media architecture intact by using submit + poll instead of sync execution.
- Preserve duration-based pricing in both DB-first and static-fallback lookup paths.

## Non-goals

- Importing the full WaveSpeed model catalog.
- Adding a new generic LLM/chat provider path.
- Exposing prompt enhancer controls in v1.
- Supporting WaveSpeed sync mode in v1.
- Splitting native audio into a separate audio-generation flow or standalone library asset.

## Functional requirements

### 1. Admin provider support

- `apps/web/server/routers/mediaProviders.ts` must expose a new provider template for `wavespeed_ai`.
- The template must use:
  - `providerName = "wavespeed_ai"`
  - `displayName = "WaveSpeedAI"`
  - `providerType = "multimodal"`
  - `baseUrl = "https://api.wavespeed.ai/api/v3"`
- The provider connection test must:
  - use bearer authentication
  - call `GET /balance`
  - treat `200` with numeric `data.balance` as success
  - return actionable failure messaging for `401`, `403`, and `429`

### 2. Admin model support

- The launch model must be seedable and visible from Admin > Media Models.
- The model must carry enough `configJson` metadata to drive:
  - Media Studio input rendering
  - provider routing
  - submit/poll endpoints
  - pricing calculation
  - recovery after restarts or retries

Required metadata for the launch model:

- `apiPayloadFormat = "wavespeed"`
- `generateType = "text-to-video"`
- `providerModelId = "wavespeed-ai/cinematic-video-generator"`
- `apiEndpoint = "/wavespeed-ai/cinematic-video-generator"`
- `apiQueryEndpoint = "/predictions/{requestId}/result"`
- `apiConfig.provider = "wavespeed_ai"`
- `pricingFormula = "per_duration"`
- `pricingTiers = { "5s": 800, "10s": 1600, "15s": 2400, "default": 800 }`
- `nativeAudio = true`
- `useSyncMode = false`

Endpoint metadata safety rules:

- `apiEndpoint` and `apiQueryEndpoint` must be relative paths only
- absolute URLs such as `https://...` are invalid
- protocol-relative values such as `//host/path` are invalid
- path traversal segments such as `..` are invalid
- the launch model should not require arbitrary placeholders
- the only allowed query-endpoint placeholders are the provider task id placeholders already needed by runtime expansion, with `{requestId}` as the canonical stored form for WaveSpeed

Required input metadata:

- prompt field
- image field with `syncWith = "reference_images"` and max `4`
- aspect ratio field with the four official options
- duration field with `5`, `10`, `15`

### 3. Media Studio behavior

- The launch model must appear as a normal video model in Media Studio.
- The same model must allow:
  - zero reference images for T2V
  - one to four reference images for I2V
- UI behavior must guide users toward the `4` image limit, but hard validation must also exist on the server/runtime path.

### 4. Runtime behavior

- The runtime must normalize the provider base URL so both of these inputs work safely:
  - `https://api.wavespeed.ai`
  - `https://api.wavespeed.ai/api/v3`
- Submit requests must target the model endpoint beneath the normalized API root.
- Poll requests must use the documented predictions result endpoint with the provider task id returned during submission.
- The provider-specific response mapping must persist enough metadata for retry/recovery:
  - provider
  - provider model id
  - provider task id
  - submit endpoint used
  - result endpoint template
  - whether sync mode was used
  - request summary
- `request_summary` must be a sanitized whitelist object only. It may include fields such as:
  - `prompt_length`
  - `has_reference_images`
  - `reference_image_count`
  - `aspect_ratio`
  - `duration`
  - `requested_duration`
  - `requested_resolution` when relevant
- `request_summary` must not include:
  - raw prompt text
  - raw reference image URLs
  - API keys
  - auth headers
  - callback URLs containing secrets or tokens

Polling and retry defaults for v1:

- start polling after a short delay instead of immediately
- use bounded backoff between polls
- honor upstream `Retry-After` when present
- treat `429`, timeout, and transient `5xx` responses as retryable
- cap total polling lifetime so tasks do not loop forever
- surface a terminal timeout failure when the task never reaches a terminal state within the cap

Result URL safety requirements:

- the final result URL chosen from upstream payloads must be validated as a public-safe URL before it is persisted, downloaded, redirected to the user, or sent into any later pipeline
- private/internal hosts and non-http(s) schemes must be rejected
- `data.urls.get` is a polling hint only and must not bypass final result URL validation

### 5. Pricing and validation behavior

- The selected duration must map to duration-tier pricing in both TypeScript and Python.
- If the DB row is unavailable, static fallback metadata must still provide `pricingFormula` and `pricingTiers`.
- WaveSpeed-specific image limits must be enforced end to end:
  - UI soft clamp
  - web router hard validation
  - Python provider/runtime hard validation
- Absolute reference-image URLs must pass the same SSRF/public-host validation used for other externally fetched media.
- Relative `/uploads/...` or other tenant-local paths may be accepted at the web boundary, but they must be resolved to the tenant public origin before outbound provider calls.
- Billing should stay deterministic even after completion:
  - requested duration is the authoritative billing duration for v1
  - if upstream does not return a more authoritative duration, runtime should persist `result_data.actual_duration = requested_duration`
  - this keeps post-completion reconciliation aligned with the reserved credits instead of creating accidental refunds or extra charges

## Deterministic defaults

When implementation choices are not explicitly dictated elsewhere, the plan should assume:

- prefer official model/API docs over marketing copy
- prefer async submit + poll over sync execution
- prefer `data.outputs[0]` as the final media URL
- treat unknown non-empty provider statuses as non-terminal processing states unless a terminal error is clearly present
- do not add optional WaveSpeed features that are not required for the launch model contract
- prefer explicit server-side validation over UI-only validation for any editable endpoint or URL metadata

## Acceptance criteria

- WaveSpeedAI can be created or seeded from the admin provider UI and saved with an API key.
- Admin connection testing succeeds via `GET /balance` and reports useful error messages for common auth/rate-limit failures.
- `Seedance 2.0 Grade Cinematic Video Generator` is present as a supported media model with editable metadata.
- Media Studio supports both T2V and I2V on the same model, with a hard maximum of 4 reference images.
- The runtime gateway can submit and poll WaveSpeed jobs through the documented endpoints.
- Duration pricing remains correct for `5s`, `10s`, and `15s` even when static fallback metadata is used instead of DB config.
- Unsafe endpoint metadata is rejected before it can be used for outbound requests.
- Unsafe result URLs are rejected before persistence, download, or redirect.
- Existing providers and existing media models continue to work unchanged.
