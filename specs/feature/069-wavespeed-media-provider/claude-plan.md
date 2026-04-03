# Implementation Plan: WaveSpeed Media Provider and Cinematic Video Generator

## 1. Objective

Implement first-class WaveSpeed support inside the existing media stack by adding:

- a new admin-manageable provider: `wavespeed_ai`
- a seeded launch model: `wavespeed-ai/cinematic-video-generator`
- Media Studio support for its official inputs
- Python runtime submit/poll integration
- pricing fallback that stays correct when DB metadata is unavailable

The design must fit the repository’s current patterns for provider templates, DB-backed model metadata, async media tasks, and test coverage. This plan intentionally keeps scope narrow so the implementation is deterministic and low-risk.

## 2. Existing architecture to preserve

The current system has four layers that must stay aligned:

1. Admin provider management in `apps/web/server/routers/mediaProviders.ts`
2. Admin model metadata and readiness logic in `apps/web/server/routers/mediaModels.ts`, `apps/web/server/services/modelRegistry.ts`, and `apps/web/server/services/mediaGenerationService.ts`
3. User-facing generation flows in `apps/web/server/routers/media.ts` and `apps/web/client/src/pages/MediaStudio.tsx`
4. Python-side execution, polling, and recovery in `python-backend/app/llm_proxy/gateway_unified.py`, `python-backend/app/tasks/media_tasks.py`, and provider-config helpers

WaveSpeed should be added as a normal media provider flowing through these layers rather than as a one-off shortcut. That keeps admin readiness, pricing, request shaping, and recovery consistent with the rest of the stack.

## 3. High-level design

The feature will be implemented as four coordinated workstreams:

### 3.1 Provider foundation and static fallback metadata

Add WaveSpeed as a normalized provider name everywhere provider identifiers are resolved. The implementation must treat `wavespeed_ai`, `wavespeed-ai`, and `wavespeed ai` as the same provider key internally, with `wavespeed_ai` as the canonical form.

At the same time, add the launch model to the static model registries and ensure its fallback metadata contains the same pricing and runtime keys that the DB row will contain. This is critical because the current fallback path in `apps/web/server/routers/media.ts` drops `configJson`, which would otherwise lose duration-tier pricing.

The implementation should update the fallback path so a DB miss still returns:

- `creditCost`
- `configJson.pricingFormula = "per_duration"`
- `configJson.pricingTiers`
- `configJson.apiEndpoint`
- `configJson.apiQueryEndpoint`
- `configJson.providerModelId`
- `configJson.apiConfig.provider`

This makes the static model behave like a degraded DB row instead of an old flat-cost placeholder.

### 3.2 Admin provider + model seeding contract

Add a `PROVIDER_TEMPLATES` entry for WaveSpeed with the official API root `https://api.wavespeed.ai/api/v3`. Add a dedicated connection-test helper that calls `GET /balance` with bearer auth and interprets the response instead of relying on generic reachability.

The seeded model metadata should follow the repo’s existing `configJson` conventions:

- `apiPayloadFormat: "wavespeed"`
- `generateType: "text-to-video"`
- `providerModelId: "wavespeed-ai/cinematic-video-generator"`
- `apiEndpoint: "/wavespeed-ai/cinematic-video-generator"`
- `apiQueryEndpoint: "/predictions/{requestId}/result"`
- `apiConfig.provider: "wavespeed_ai"`
- `pricingFormula: "per_duration"`
- `pricingTiers` keyed by `"5s"`, `"10s"`, `"15s"`
- `nativeAudio: true`
- `useSyncMode: false`
- image input metadata that carries the model’s hard cap, using the repo’s existing input-field shape plus a `maxItems: 4` style limit that the client and server can both read

The model’s `inputFields` should explicitly drive both UI rendering and runtime request shaping. The image field should be defined as an optional `image_urls` field synchronized from `reference_images`, with a hard maximum of four items.

The WaveSpeed connection helper should treat only a `200` response with numeric `data.balance` as success. It should convert `401`, `403`, and `429` into actionable admin-facing messages rather than a generic failure string.

The admin model metadata path must also harden endpoint fields before they can be saved or consumed. For this feature, `apiEndpoint` and `apiQueryEndpoint` should be treated as relative-path configuration only:

- reject absolute URLs such as `https://evil.example/...`
- reject protocol-relative values such as `//evil.example/...`
- reject any path containing `..`
- reject arbitrary placeholder templates
- allow only the provider task id placeholder family already needed for result polling, with `{requestId}` as the canonical stored form for the WaveSpeed launch model

This should be enforced server-side in the media model create/update path even if the admin UI remains a free-text form.

Because the launch model is dual-mode, the implementation should preserve the current model-labeling behavior while still allowing optional images. In practice this means the model can remain categorized as a video model with `generateType: "text-to-video"` as long as the `image_urls` field and validation path allow image-guided requests.

### 3.3 Media Studio and web-router validation

Media Studio should rely on the model metadata instead of special-casing WaveSpeed in the view layer. The main UI work is to make the launch model render correctly and to introduce a user-friendly soft limit for reference images when the selected model caps them at four.

Server-side validation must stay stricter than the UI:

- web-router inputs should reject more than four reference images for this model
- provider/runtime request shaping should reject invalid aspect ratio or duration values
- generic five-image behavior for other providers should remain unchanged
- absolute reference-image URLs should be validated as public-safe before they are sent to WaveSpeed
- relative `/uploads/...` URLs should be resolved to the tenant public origin before outbound submit

The implementation should therefore add model-aware validation rather than globally lowering the limit from five to four. The cleanest place is to preserve existing generic schemas where possible, then apply a second pass of model-specific validation after the selected model and `configJson` are known.

### 3.4 Python runtime submit/poll adapter and recovery contract

The Python media path must gain a WaveSpeed-aware request and status adapter that behaves like the existing async video providers:

- submit to the model endpoint
- persist the provider task id
- poll until completion
- normalize upstream states into the repo’s internal task states

The implementation should lock the following mapping contract:

| Concern | Upstream field | Internal meaning |
|---------|----------------|------------------|
| Provider task id | `data.id` | `provider_task_id` / `task.task_id` equivalent |
| Raw provider status | `data.status` | source state stored in result metadata |
| Final media URL | `data.outputs[0]` | `result_url` |
| Terminal error | `data.error` | task failure message / stored failure detail |
| Polling path | `/predictions/{requestId}/result` | query endpoint template |

Normalized states should behave as follows:

- `created`, `processing` -> processing
- `completed` with a valid output URL -> success
- `failed` or clearly populated terminal error -> failure
- unknown non-empty status -> keep processing and record the raw state

The runtime must also persist a stable recovery payload in `task.result_data` so retries and restarts do not depend on reconstructing provider behavior heuristically. At minimum, the stored payload should include:

- `submission.provider`
- `submission.provider_model_id`
- `submission.provider_task_id`
- `submission.submit_endpoint`
- `submission.result_endpoint_template`
- `submission.used_sync_mode`
- `submission.request_summary`

`used_sync_mode` must always be `false` for this feature. The plan explicitly forbids introducing sync execution in v1.

The runtime should treat `data.urls.get` as a polling or follow-up endpoint hint, not as the final media asset. The final media URL should come from `data.outputs[0]` unless a provider-specific fallback is explicitly needed.

`submission.request_summary` should be a sanitized whitelist object, not a raw copy of the request. It should keep only implementation-relevant fields such as:

- `prompt_length`
- `has_reference_images`
- `reference_image_count`
- `aspect_ratio`
- `duration`
- `requested_duration`
- `requested_resolution` when applicable

It should explicitly exclude:

- raw prompt text
- raw image URLs
- API keys
- Authorization headers
- callback URLs with embedded secrets or tokens

Result URL handling must also follow the repo’s existing SSRF discipline. Before any WaveSpeed result URL is persisted, downloaded, redirected, or fed into the media pipeline, it should be validated as a public-safe `http(s)` URL using the same security posture already used for other external media URLs. A private/internal host must be treated as terminal provider failure, not as a usable asset.

Polling behavior should be deterministic rather than left to implementer preference. Use these v1 defaults:

- first poll after roughly 3 seconds
- exponential backoff for later polls
- cap the steady-state interval at 15 seconds
- honor upstream `Retry-After` if present and greater than the current backoff
- treat timeout, `429`, and transient `5xx` responses as retryable
- cap total polling lifetime at 30 minutes from successful submission
- after the cap is reached, fail the task with an explicit timeout reason and retain the raw upstream state in result metadata

Billing and reconciliation should also be deterministic. Because WaveSpeed launch pricing varies only by requested duration, the requested duration should be treated as the authoritative billing duration for v1. If upstream does not return a more authoritative duration value, runtime should persist `result_data.actual_duration = requested_duration` so post-completion reconciliation remains aligned with the reserved credits instead of inventing a mismatch.

## 4. File-level implementation guidance

### 4.1 TypeScript web/admin layer

Primary files:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/mediaModels.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/services/pricingCalculator.ts`
- `apps/web/scripts/seed-media-models-wavespeed.ts` or equivalent seeding path

Expected changes:

- add provider template and health-check helper
- normalize provider name in both media router and media models router
- add the launch model to static registries
- make fallback pricing metadata available on DB miss
- add or update a seeding script for the WaveSpeed model row
- extend media model create/update validation to reject unsafe endpoint metadata before persistence
- add model-specific validation for:
  - max 4 images
  - allowed aspect ratios
  - allowed durations
- reuse or mirror the repo’s SSRF validation for outbound reference-image URLs

### 4.2 TypeScript client layer

Primary files:

- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`

Expected changes:

- make the metadata parser understand and preserve image-input constraints for the WaveSpeed model
- expose the launch model as both text-to-video and image-to-video capable
- add a soft limit on reference-image selection for models that cap image count at four
- keep existing behavior unchanged for other models and other media tabs

### 4.3 Python runtime layer

Primary files:

- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/services/media_provider_service.py`
- provider implementation modules if the repo already keeps provider-specific request code outside the gateway
- Python tests covering media execution and polling

Expected changes:

- normalize the provider id to `wavespeed_ai`
- normalize base URLs so either service root or API root can be configured safely
- build the submit payload:
  - `prompt`
  - optional `images`
  - `aspect_ratio`
  - `duration`
- store submission metadata for recovery
- poll via the documented predictions result endpoint
- map WaveSpeed states and result payloads into the current task model
- preserve pricing-tier estimation when DB config is unavailable

## 5. Deterministic decisions that implementers should not re-open

- Canonical provider key: `wavespeed_ai`
- Seeded provider base URL: `https://api.wavespeed.ai/api/v3`
- Launch model id: `wavespeed-ai/cinematic-video-generator`
- Launch model display name: `Seedance 2.0 Grade Cinematic Video Generator`
- Launch execution mode: async submit + poll only
- Native audio handling: embedded in the returned video asset only
- Allowed aspect ratios: `16:9`, `9:16`, `4:3`, `3:4`
- Allowed durations: `5`, `10`, `15`
- Allowed reference images: `0..4`
- Pricing tiers:
  - `5s = 800`
  - `10s = 1600`
  - `15s = 2400`
  - `default = 800`
- Final media URL precedence:
  1. `data.outputs[0]`
  2. provider-specific fallback URL fields only if `outputs[0]` is absent

## 6. Edge cases to cover explicitly

The implementation must not leave the following to guesswork:

- A provider row may contain either `https://api.wavespeed.ai` or `https://api.wavespeed.ai/api/v3`; runtime code must normalize this safely and append `/api/v3` at most once.
- The same base-URL normalization rule should be shared by the health-check helper and runtime submit/poll code so admin testing and execution cannot drift.
- A DB miss for model metadata must still preserve WaveSpeed duration pricing.
- A user may switch from another model to WaveSpeed while more than four reference images are already present; the UI should reduce or reject the extra entries cleanly.
- A poll response may contain an unknown intermediate status; that should not be treated as immediate failure unless a terminal error is clearly present.
- A completed response without `data.outputs[0]` is invalid and should surface a provider error rather than silently succeeding with no media URL.
- A completed response with a private/internal result URL is also invalid and should surface a provider error rather than being persisted.
- Editable endpoint metadata must not be allowed to smuggle absolute URLs or path traversal into outbound request construction.
- Existing providers with five-image support or different pricing formulas must continue to behave exactly as before.

## 7. Delivery sequence

Implement in this order to keep the system coherent:

1. Add provider normalization and static fallback metadata.
2. Add admin provider template, health-check helper, and seeded model config.
3. Add Media Studio + web-router validation for the launch model.
4. Add Python submit/poll adapter and recovery-state persistence.
5. Add and pass tests across both stacks.

This sequence ensures the model can be represented correctly before execution code is introduced, and it ensures pricing fallback is not forgotten while adding runtime support.

## 8. Verification strategy

Verification should prove both correctness and non-regression.

On the web side, tests should confirm:

- the WaveSpeed provider template is present
- the connection test calls `/balance` with bearer auth
- the model metadata merges correctly with static fallback
- credit estimation uses `per_duration` tiers even on DB miss
- more than four reference images are rejected for the launch model
- unsafe endpoint metadata is rejected in admin model persistence
- absolute reference-image URLs are SSRF-checked before outbound submit

On the Python side, tests should confirm:

- base URL normalization is safe
- submit payloads match the documented WaveSpeed request contract
- polling maps provider states correctly
- result URL extraction uses `data.outputs[0]`
- recovery metadata is persisted in a reusable structure
- result URLs are validated before persistence/download/redirect
- retryable polling failures back off correctly and eventually time out with a deterministic terminal error

## 9. Implementation completion standard

This feature is complete when a future implementer can read only this plan, the accompanying TDD plan, and the section files, then make the change without needing to rediscover:

- which files to edit
- what the provider/model identifiers should be
- which endpoints to call
- how pricing fallback should work
- which edge cases are considered required behavior
