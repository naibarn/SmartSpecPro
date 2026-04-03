# Implementation Plan

## Objective

Add WaveSpeedAI as a new media provider and make the official WaveSpeed model `wavespeed-ai/cinematic-video-generator` a supported media model end to end.

The implementation should fit the current architecture:

- the web backend owns provider metadata, model catalogs, and admin UI wiring
- the Python backend owns runtime media execution and polling
- the generic media forms should render the new model from `configJson` without custom UI code

## Current-codebase fit

The codebase already has the exact seams this feature needs:

- provider templates in `apps/web/server/routers/mediaProviders.ts`
- provider normalization in `apps/web/server/routers/mediaModels.ts` and `apps/web/server/routers/media.ts`
- static fallback model catalogs in `apps/web/server/services/modelRegistry.ts` and `apps/web/server/services/mediaGenerationService.ts`
- provider seed scripts in `apps/web/scripts/`
- a Python gateway with provider-specific media branches in `python-backend/app/llm_proxy/gateway_unified.py`
- a recovery loop for long-running jobs in `python-backend/app/tasks/media_tasks.py`

WaveSpeedAI should therefore be added as a new provider/model family, not as a new subsystem.

## Affected files and modules

Web/admin side:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaModels.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/seed-media-models-wavespeed-ai.ts`
- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/__tests__/mediaModels.readiness.test.ts`
- `apps/web/server/services/mediaGenerationService.test.ts`
- `apps/web/server/services/modelRegistry.test.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`

Python/runtime side:

- `python-backend/app/llm_proxy/providers/wavespeed_ai_provider.py`
- `python-backend/app/llm_proxy/providers/__init__.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/llm_proxy/unified_client.py`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_wavespeed.py`
- `python-backend/tests/unit/services/test_wavespeed_ai_provider.py`
- `python-backend/tests/tasks/test_media_tasks_wavespeed.py`

## Implementation approach

### 1. Lock the naming and fallback catalog first

Add `wavespeed_ai` normalization wherever media providers are normalized so WaveSpeed rows resolve correctly in admin pages, readiness checks, and gateway routing.

Add a static fallback model record for `wavespeed-ai/cinematic-video-generator` in both static catalog layers. Use the documented model page as the source of truth for:

- `type: video`
- `supportsDurations: [5, 10, 15]`
- `supportsAspectRatios: ["16:9", "9:16", "4:3", "3:4"]`
- a 5s baseline credit cost of roughly 800 credits, with 10s and 15s tiers scaled from the same public $0.80 / 5s price using the repo’s existing credit conversion convention

The static fallback must include `configJson.pricingFormula = "per_duration"` and `configJson.pricingTiers` so video credit reservation still works correctly when DB config is missing. Do not rely on a flat `creditCost` fallback for 10s and 15s runs.

This gives the app a safe fallback even when DB reads are not available.

### 2. Add the provider template and seed data

Extend the media provider seed data with a WaveSpeedAI row that points at `https://api.wavespeed.ai/api/v3`, starts disabled, and exposes the Seedance 2.0 model as the initial available model.

Create a model seed script for Seedance 2.0 that stores:

- the canonical model id
- the exact display name from the WaveSpeed model page, `Seedance 2.0 Grade Cinematic Video Generator`
- alias coverage for `seedance 2.0` search terms
- `configJson.apiPayloadFormat = "wavespeed"` after extending the local union types
- `configJson.apiEndpoint = "/wavespeed-ai/cinematic-video-generator"`
- `configJson.apiQueryEndpoint = "/predictions/{requestId}/result"`
- `configJson.providerModelId = "wavespeed-ai/cinematic-video-generator"`
- `configJson.apiConfig.provider = "wavespeed_ai"`
- `configJson.inputFields` for prompt, `image_urls` reference images, aspect ratio, and duration
- `pricingFormula: "per_duration"`
- `pricingTiers` for `5s`, `10s`, and `15s`

The model seed should treat this as one model with two workflows:

- prompt only = text-to-video
- prompt + up to 4 images = image-to-video guidance

Keep the admin provider page generic. The template addition should be enough for the provider card to appear. For the model form:

- add `maxItems: 4` style metadata to the reference-image field
- enforce the same limit in server-side validation and in the Python provider
- add a soft UI clamp and helper text in `MediaStudio.tsx` so users see the limit before submission
- store `generateType = "text-to-video"` and let the presence of `image_urls` unlock the I2V path, which matches the current generic form behavior

The WaveSpeed connection test should be provider-specific rather than generic reachability:

- request `GET https://api.wavespeed.ai/api/v3/balance`
- require `Authorization: Bearer <api_key>`
- report success only when the response is `200` and `data.balance` is numeric
- return actionable messaging for `401` that mentions invalid key or missing top-up activation, for `403` that mentions account restriction, and for `429` that mentions provider rate limiting

### 3. Implement the runtime provider adapter

Create a `WaveSpeedAIProvider` class in the Python backend that mirrors the existing provider adapters:

- cached `httpx.AsyncClient`
- explicit `aclose`
- strict model allowlists
- redirect blocking
- bounded response sizes
- safe URL validation for any remote assets

The adapter should translate the app’s generic media request into the WaveSpeed task submission shape and poll the documented result endpoint until the Seedance 2.0 job reaches a terminal state.

Normalize the base URL like this:

- if the configured provider base URL ends with `/api/v3`, use it as-is
- if it ends at the service root, append `/api/v3`
- seed data should still store the API root so admin pages and health tests stay deterministic

The first version should support the documented Seedance 2.0 video flow only. It should not promise the broader multimodal blog description unless the model page or API docs expose those inputs directly for this model. In practice that means:

- support prompt-only runs
- support prompt + reference images with a hard ceiling of 4 images
- do not add separate audio, video, or Prompt Enhancer controls in v1 unless the generic media config can map them cleanly
- do not use WaveSpeed sync mode in v1, even if the API supports it globally
- treat native audio as part of the returned video file only, not as a separate audio asset

### 4. Wire routing and recovery

Update the Python gateway so a `wavespeed_ai` provider or the Seedance model id routes to the new adapter for video requests.

Update the task recovery loop so interrupted or stuck WaveSpeed jobs can be polled again after worker restarts.

Persist enough provider metadata in `task.result_data` to make recovery deterministic:

- `submission.provider = "wavespeed_ai"`
- `submission.provider_model_id = "wavespeed-ai/cinematic-video-generator"`
- `submission.provider_task_id = <data.id>`
- `submission.submit_endpoint = "/wavespeed-ai/cinematic-video-generator"`
- `submission.result_endpoint_template = "/predictions/{requestId}/result"`
- `submission.used_sync_mode = false`
- `submission.request_summary = { duration, aspect_ratio, image_count }`

Use this normalized status mapping:

- `created` or `processing` -> internal processing
- `completed` with `data.outputs[0]` -> internal success and `result_url`
- `failed` or a populated `data.error` with terminal status -> internal failure
- any unknown non-empty state -> keep processing, store raw status, and let bounded retries decide

Use this result URL precedence:

1. `data.outputs[0]`
2. a URL-like value inside `data.urls.get` only for follow-up polling, not final media
3. any other URL-like field only as a provider-specific fallback when `outputs` is missing

Do not change the existing BytePlus, fal.ai, Kie.ai, UVoice, or KNPLabs routing logic beyond the small normalization changes needed for the new provider.

### 5. Deterministic decision policy for LLM-driven implementation

To avoid the implementer or LLM having to guess:

- prefer repo-native async video patterns over new abstractions
- prefer model-specific API docs over blog descriptions when fields differ
- prefer soft UI validation plus hard backend/provider validation when both are feasible
- prefer additive config keys in `configJson` over branching the admin UI
- prefer explicit provider-specific tests over generic shared tests when WaveSpeed behavior differs materially

### 6. Verify with targeted tests

Add tests that fail before implementation and pass after it:

- provider template and normalization tests on the web side
- static fallback registry tests for the Seedance model
- provider seed idempotency tests
- Python routing tests for `wavespeed_ai`
- provider adapter tests for submit, poll, validation, and cleanup
- recovery tests for unfinished jobs

## Risks and mitigations

- The WaveSpeed price page can change. Mitigation: keep pricing in the seed script and admin editor, and use the current docs pricing only as the initial seed.
- The canonical model id contains a slash. Mitigation: normalize provider names separately from model ids and never over-sanitize the upstream path segment.
- The docs describe a broader multimodal system than the Seedance model page does. Mitigation: scope v1 to the documented Seedance video fields only.
- The polling loop could become noisy or expensive if not bounded. Mitigation: reuse the repo’s existing retry/backoff patterns and cap the poll cycle.
- The current router fallback undercharges if static metadata does not include pricing tiers. Mitigation: make static pricing tiers part of the explicit implementation contract.

## Security and boundary concerns

- validate remote reference image URLs before fetching or relaying them
- keep redirects disabled on outbound HTTP clients
- cap response payload sizes before parsing JSON or decoding media
- do not log raw API keys or sensitive upstream payload fragments
- do not make WaveSpeed an implicit fallback for unrelated media models

## Acceptance criteria

- Admin > Media Providers shows WaveSpeedAI with `https://api.wavespeed.ai/api/v3` and allows a read-only connection test
- Admin > Media Models can seed and display `Seedance 2.0 Grade Cinematic Video Generator`
- the model uses duration-based pricing with 5s / 10s / 15s tiers
- the model enforces a max of 4 reference images in UI, server validation, and provider validation
- static fallback pricing still reserves the correct credits for 5s / 10s / 15s runs when DB config is missing
- the Python gateway can submit and poll WaveSpeed Seedance jobs
- the runtime stores enough normalized submission and polling metadata for recovery to continue after restart
- task recovery resumes unfinished jobs after a restart
- existing providers and models continue to behave exactly as before

## Rollout and testing notes

- seed the provider and model rows, then verify they are disabled until explicitly enabled
- use the repo’s existing web and Python test commands, plus the new provider-specific tests
- confirm the model card and provider card show the intended display names before turning the provider on in a real environment
