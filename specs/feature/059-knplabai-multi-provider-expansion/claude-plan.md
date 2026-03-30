# KNPLabs AI Multi-Provider Expansion Plan

## 1. Goal

Add KNPLabs AI as a first-class provider across the existing SmartSpecPro stack without disrupting the current Kie.ai, fal.ai, BytePlus, or UVoice paths.

The expansion has four different surfaces:

1. Web-side LLM routing for chat completions
2. Python-side media generation for image, video, TTS, and embeddings
3. Admin/provider catalogs in the web UI
4. Explicit TTS and embeddings APIs in the Python backend

The plan assumes the normalized provider key will be `knplabai` and the display name will remain `KNPLabs AI`.

## 2. Design Principles

The implementation should follow the repo’s existing provider patterns:

- Use DB-backed provider rows and model maps instead of hardcoded runtime registries where possible.
- Keep KNPLabs additive. Existing providers should continue to work unchanged.
- Preserve explicit allowlists, prompt sanitization, redirect blocking, and response size caps on every new outbound request.
- Use explicit provider selection for TTS and embeddings. Do not make KNPLabs a silent fallback inside the general embedding service.
- Keep pricing arithmetic in `Decimal` or string-backed DB fields until the final conversion step.

The KNPLabs web landing page confirms that its chat surface is OpenAI-compatible and uses a base URL ending in `/ai/v1`, so the existing OpenAI-style routing path should be sufficient for LLM chat.

## 3. Phase 1: Core Provider Contract and Configuration

### Files

- `python-backend/app/core/config.py`
- `python-backend/app/llm_proxy/providers/knplabai_provider.py`
- `python-backend/app/llm_proxy/providers/__init__.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/llm_proxy/unified_client.py`

### What to build

Add KNPLabs-specific settings keys to the Python backend config, including the API key and base URL.

Create a new async provider class under `python-backend/app/llm_proxy/providers/knplabai_provider.py`. This class should own the HTTP client and the KNPLabs request/response logic for media and utility APIs. It should not inherit from `BaseLLMProvider`, because its job is not chat routing. Instead, it should expose media-oriented methods that the gateway can call directly.

The provider class should define:

- strict allowlists for valid model IDs
- prompt sanitization helpers
- response size limits
- `follow_redirects=False` on outbound requests
- `aclose()` cleanup for the underlying HTTP client

The Python media provider service should gain an `initialize_knplabai_client()` helper that loads the encrypted API key from `media_providers` and returns a ready KNPLabs client.

`UnifiedLLMClient` should also gain an explicit KNPLabs client slot so the TTS and embeddings code paths can initialize the provider lazily when needed.

### Why this phase comes first

Every later phase depends on the provider contract being stable. The media gateway, internal TTS endpoint, and embeddings endpoint all need a shared KNPLabs client shape before they can route requests cleanly.

## 4. Phase 2: LLM Provider Registration and Model Mapping

### Files

- `apps/web/drizzle/seed.ts`
- `apps/web/scripts/seed-multi-provider.ts`
- `apps/web/scripts/seed-knplabai-provider.ts` or equivalent runner script
- `apps/web/server/seed.test.ts`
- `apps/web/server/services/multiProvider.ts`
- `apps/web/server/services/llmRouter.ts`
- `apps/web/client/src/pages/AdminLLMProviders.tsx`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx` if provider-name icons or labels need to be extended

### What to build

Add a KNPLabs LLM provider seed path that inserts a provider row with:

- provider name `knplabai`
- display name `KNPLabs AI`
- base URL `https://api.knplabai.com/ai/v1`
- a sensible default model from the catalog
- `isEnabled = false` until the admin enables it

Seed `modelProviderMap` with every LLM model from the KNPLabs catalog in the spec. For each row:

- use the canonical `modelId` from the spec
- point `providerModelId` at the KNPLabs upstream model string
- set `apiStyle` to `chat-completions`
- store the input/output price in the app’s existing DB format

Use the existing provider routing helpers so `llmRouter.ts` can resolve KNPLabs via the same multi-provider flow as the other providers. The current URL resolver already understands base URLs that contain `/v1`, so the main work here is the provider record and the model map, not a new HTTP adapter.

Extend the admin LLM provider UI so KNPLabs is visible in the provider cards and in any provider icon mapping that is keyed by provider name.

### Why this phase matters

The web chat path is the most direct use of KNPLabs for LLM traffic, and it needs to be present in the DB-backed provider catalog before any model selection or routing logic can use it.

## 5. Phase 3: Media Catalog, Provider Seeds, and Admin UI

### Files

- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/seed-media-models-knplabai.ts` or equivalent new media catalog script
- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/routers/mediaModels.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/client/src/pages/AdminMediaProviders.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx` if provider labels or model metadata are surfaced there

### What to build

Add a KNPLabs entry to the media provider catalog and make it available in the admin media providers UI.

Seed the media catalog with KNPLabs models for:

- OpenAI-compatible image generation
- Gemini-native image generation for Nano Banana-style models
- video generation
- text-to-speech
- embeddings

The new media model rows should include the metadata the UI and gateway need:

- `modelId`
- display name
- media type
- provider name
- aliases
- pricing
- supported ratios, sizes, or durations where relevant
- `configJson` describing the endpoint format and any provider-specific options

Keep the KNPLabs models disabled by default. The admin should be able to inspect them immediately after seeding, but the models should not become user-selectable until they are explicitly enabled.

Update the static fallback registry in `modelRegistry.ts` so the app still has KNPLabs model metadata if the DB is temporarily unavailable.

### Why this phase matters

The media studio and admin pages already read provider/model metadata from the database. If the catalog is not seeded cleanly, the runtime code will not be able to discover the new models.

## 6. Phase 4: Media Dispatch and Task Recovery

### Files

- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/api/v1/media_generation.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/services/media_task_service.py` if task-result persistence needs a small helper

### What to build

Add KNPLabs routing branches to the existing media gateway:

- image generation should route KNPLabs image models to the new provider class
- video generation should route KNPLabs VEO/Grok video models to the new provider class
- audio generation should route KNPLabs TTS models to the new provider class

Keep the existing Kie.ai/fal.ai/BytePlus/UVoice branches intact. KNPLabs should be an additional branch, not a replacement.

Extend the stuck-task recovery loop in `media_tasks.py` so it can poll KNPLabs tasks that are already in flight. The recovery path should:

- load the KNPLabs provider config from `media_providers`
- inspect the stored model to decide which KNPLabs endpoint family was used
- poll with bounded retries and jitter
- mark tasks completed or failed based on the provider response
- validate any returned URLs before saving them

`media_generation.py` should continue to update task status and persist results in the same way the other media providers do, but the KNPLabs result payloads should be stored under a KNPLabs-specific key inside `result_data` so the recovery loop can replay them later.

### Why this phase matters

The Python gateway is where long-running media jobs actually finish. If KNPLabs tasks cannot be recovered from a worker restart, the user-visible media workflow will be unreliable.

## 7. Phase 5: Image and Video Adapters

### Files

- `python-backend/app/llm_proxy/providers/knplabai_provider.py`
- `python-backend/app/llm_proxy/unified_client.py`

### What to build

Implement the KNPLabs image and video methods in the provider class with two different image paths and two different video paths:

1. OpenAI-compatible image generation for GPT/Grok/Sora-style models
2. Gemini-native image generation for Nano Banana-style models
3. OpenAI-compatible or JSON-based video submission for VEO-style models
4. async polling for video task completion

The provider should perform explicit validation for:

- allowed model IDs
- prompt length and content
- response size before decoding base64 payloads
- content type or shape before accepting a result as valid

For Gemini-native image generation, the provider should decode base64 only after the payload size has been checked. The decoded bytes are what the gateway or storage layer will upload.

For video generation, the provider should capture the upstream task ID immediately and use a bounded polling loop instead of waiting forever.

### Why this phase matters

These adapters are the core of the feature. All KNPLabs media capabilities depend on them, and they are the most likely place for endpoint-shape mismatches or SSRF regressions.

## 8. Phase 6: TTS and Embeddings

### Files

- `python-backend/app/api/stt.py`
- `python-backend/app/api/internal_embeddings.py`
- `python-backend/app/llm_proxy/unified_client.py`
- `python-backend/app/services/embedding_service.py`

### What to build

Extend `TTSRequest` and the internal TTS flow so KNPLabs can be selected explicitly.

The TTS path should:

- keep the existing text-length guard
- validate the requested voice and format against KNPLabs allowlists
- call the new KNPLabs provider method
- return raw audio bytes with the correct content type

For embeddings, add an explicit KNPLabs selection path to the internal embeddings API. The important constraint is that KNPLabs must not become an implicit fallback in `embedding_service.py`.

The embeddings path should:

- select KNPLabs only when explicitly requested
- validate the vector dimension returned by KNPLabs
- preserve the current OpenAI embedding path for callers that do not opt in

If the KNPLabs embedding model is used by any pgvector-related workflow, document the expected dimension in the plan and reject dimension mismatches early.

### Why this phase matters

TTS and embeddings are smaller than image/video, but they are easy to regress because they sit behind shared internal APIs that already have existing provider choices.

## 9. Phase 7: Security, Credits, and Rollout

### Files

- `python-backend/app/core/credits.py`
- `python-backend/app/services/credit_service.py`
- `python-backend/app/core/media_job_validators.py`
- `python-backend/app/llm_proxy/providers/knplabai_provider.py`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/multiProvider.ts`

### What to build

Preserve the existing user-credit system, but make sure KNPLabs pricing is translated into the repo’s internal credit format with `Decimal`-safe math.

The plan should keep these rules:

- the user-facing credit system still uses the app’s current `1 USD = 1000 credits` conversion
- KNPLabs provider pricing is only a provider-cost input
- pre-flight checks should prevent requests from going out when the user cannot afford them

Security guardrails should include:

- `follow_redirects=False` on all KNPLabs outbound requests
- prompt sanitization for text-bearing endpoints
- allowlists for voice, format, and model IDs
- strict validation for all remote URLs
- fail-closed behavior for malformed or oversized responses

Update the multi-provider router’s provider-style defaulting if KNPLabs needs an explicit `apiStyle` value beyond the generic default.

Rollout should stay conservative:

- seed the provider disabled
- seed the media models disabled
- enable only the models that are validated in admin

### Why this phase matters

A feature this broad can affect both cost accounting and security posture. Keeping the pricing conversion explicit and the rollout disabled-by-default reduces risk.

## 10. Phase 8: Tests and Verification

### Files

- `python-backend/tests/unit/services/test_knplabai_provider.py`
- `python-backend/tests/unit/services/test_knplabai_polling.py`
- `python-backend/tests/unit/api/test_knplabai_tts.py`
- `python-backend/tests/unit/api/test_knplabai_embeddings.py`
- `python-backend/tests/unit/services/test_media_provider_service_knplabai.py`
- `apps/web/server/services/llmRouter.test.ts`
- `apps/web/server/seed.test.ts`
- `apps/web/server/routers/__tests__/mediaModels.knplabai.test.ts`
- `apps/web/server/routers/__tests__/mediaProviders.knplabai.test.ts`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts`

### What to build

Add unit and integration-style tests for each part of the feature before or alongside implementation.

The test suite should cover:

- provider initialization and config loading
- allowlists and sanitization
- image/video/TTS/embedding request shaping
- polling and task recovery behavior
- seed idempotency
- admin provider visibility and readiness labels
- KNPLabs model mapping and routing
- explicit embeddings selection

Use the repo’s current `pytest` and `vitest` patterns, not a new harness.

### Final verification

Before the feature is considered done:

- every new script should be idempotent
- every new provider branch should be covered by a test
- every new model should be visible in the admin catalog
- every explicit route should reject malformed input cleanly
