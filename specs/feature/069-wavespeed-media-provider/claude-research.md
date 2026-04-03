# Deep Plan Research: WaveSpeed Media Provider

## Research decision (auto)

- Codebase: yes. This is an existing git repository with established admin, model-registry, pricing, and Python gateway patterns for media providers.
- Web topics: yes. The spec depends on the current WaveSpeed API contract, health-check behavior, model parameters, and pricing for `wavespeed-ai/cinematic-video-generator`.
- Testing: yes. The repo already uses Vitest for the web app and pytest for the Python backend, so the plan should extend those suites instead of inventing new test harnesses.

## Codebase findings

### Web admin/provider patterns

- `apps/web/server/routers/mediaProviders.ts`
  - Provider templates are hardcoded in `PROVIDER_TEMPLATES`.
  - Provider connection tests are provider-specific; `testConnection` switches on `provider.providerName` and dispatches to helpers such as `testKieAI`, `testBytePlusModelArk`, and `testUVoice`.
  - This means WaveSpeed needs both a new provider template and a dedicated health-check helper. Falling back to the generic reachability test would be too weak.

- `apps/web/server/routers/mediaProviders.test.ts`
  - Provider-template additions are covered with direct assertions.
  - Connection helpers are tested by stubbing `fetch` and asserting the exact URL, auth header, and success/failure handling.
  - WaveSpeed should follow the same pattern for `/balance`.

### Media model metadata and provider readiness patterns

- `apps/web/server/routers/mediaModels.ts`
  - `normalizeMediaProviderName` already normalizes `kie_ai`, `uvoice`, `byteplus_modelark`, and `knplabai`.
  - `mergeStaticModelConfigJson()` merges DB config with static fallback config.
  - `collectStaticModelLookupKeys()` already understands `providerModelId`, `modelId`, and nested `apiConfig` identifiers, so WaveSpeed can reduce special cases by storing the right metadata in `configJson`.

- `apps/web/client/src/lib/mediaModelInputs.ts`
  - Input fields are inferred from `configJson.inputFields`.
  - Reference support is driven by field types like `image_urls`, sync targets like `reference_images`, and optional boolean overrides.
  - There is no current built-in max-image enforcement from model metadata, so the WaveSpeed plan must add both metadata and UI behavior for the hard `4` limit.

- `apps/web/client/src/pages/MediaStudio.tsx`
  - Media Studio pulls model input behavior from `mediaModelInputs.ts`.
  - Per-tab state already tracks `referenceImages`, `referenceVideos`, `duration`, `aspectRatio`, and `modelInputValues`.
  - The right place for a WaveSpeed-specific soft clamp is the existing model-input / reference-image flow, not a brand-new page.

### Pricing and DB-first fallback patterns

- `apps/web/server/routers/media.ts`
  - `getModelWithPricing()` prefers the DB row and falls back to `MEDIA_MODELS[modelId]`.
  - Today the fallback returns `configJson: null`, which means any pricing logic that relies on `pricingTiers` loses duration-tier detail.
  - Video endpoints currently allow `referenceImageUrls` up to `5`; WaveSpeed needs a stricter `4` image rule without breaking other providers.

- `apps/web/server/services/pricingCalculator.ts`
  - Pricing already supports `flat`, `per_duration`, `matrix`, and `per_unit`.
  - For `per_duration`, the calculator expects `pricingTiers["5s"]`, `pricingTiers["10s"]`, etc.
  - That matches the WaveSpeed pricing model well, as long as static fallback metadata includes `pricingFormula` and `pricingTiers`.

- `python-backend/app/llm_proxy/gateway_unified.py`
  - Python-side cost estimation also reads `pricingTiers` from DB `configJson`.
  - If the DB row is missing and the static fallback lacks `configJson.pricingTiers`, Python will under-specify cost estimates.
  - The plan therefore needs to align TS and Python fallback behavior around the same metadata contract.

### Runtime and recovery patterns

- `python-backend/app/tasks/media_tasks.py`
  - The worker already supports provider-specific status normalization helpers.
  - It extracts `apiQueryEndpoint` / `statusEndpoint` style metadata from model config.
  - Recovery state is stored in `task.result_data`, so new providers need a predictable submission + polling payload contract.

- `python-backend/app/services/media_provider_service.py`
  - Provider credentials are loaded from the shared `media_providers` table.
  - There are explicit initializers for `kie_ai`, `knplabai`, and `uvoice`.
  - WaveSpeed can either extend this service with an initializer or reuse a generic HTTP path, but the plan should keep provider naming aligned with the DB row.

- `python-backend/app/llm_proxy/unified_client.py`
  - Database-backed provider initialization exists for known providers; unknown providers fall through to generic OpenAI-compatible setup, which is not suitable for WaveSpeed’s async model contract.
  - This suggests keeping WaveSpeed in the media-provider pathway, not in the generic chat/LLM client pathway.

### Existing seeded-model patterns

- `apps/web/scripts/seed-media-models-byteplus.ts`
  - This script is the closest local example for async Seedance-style video models with `inputFields`, `pricingTiers`, and `pricingFormula`.
  - It demonstrates how the repo stores generation metadata for T2V/I2V video models.

- `apps/web/scripts/seed-media-models-fal-ai.ts`
  - This script shows richer `configJson` usage for media models and confirms the established pattern of storing UI/runtime metadata in the seeded row.

## Testing findings

### Web

- Root workspace uses Turbo, but `apps/web/package.json` defines the local testing commands.
- Web tests use Vitest:
  - command: `npm --workspace apps/web test`
  - underlying script: `JWT_SECRET=... vitest run`
- `apps/web/vitest.config.ts` includes:
  - `server/**/*.test.ts`
  - `server/**/*.spec.ts`
  - `client/src/**/*.test.ts`
  - `client/src/**/*.test.tsx`
  - `scripts/**/*.test.ts`

### Python

- `python-backend/pytest.ini` and `python-backend/pyproject.toml` confirm pytest with async support and coverage.
- Existing backend tests live under `python-backend/tests`.
- The WaveSpeed runtime adapter should extend pytest coverage rather than add a second framework.

## Web research findings

### Official auth and common endpoints

- WaveSpeed uses bearer auth: `Authorization: Bearer <api_key>`.
- The official API root is `https://api.wavespeed.ai/api/v3`.
- Balance endpoint:
  - `GET https://api.wavespeed.ai/api/v3/balance`
  - success response includes `data.balance` as a number
  - source: https://wavespeed.ai/docs/docs-common-api/balance
- Models endpoint:
  - `GET https://api.wavespeed.ai/api/v3/models`
  - response includes `model_id`, `type`, `base_price`, and nested `api_schema`
  - source: https://wavespeed.ai/docs/list-models

### Official model contract for `wavespeed-ai/cinematic-video-generator`

- Submit endpoint:
  - `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/cinematic-video-generator`
- Poll endpoint:
  - `GET https://api.wavespeed.ai/api/v3/predictions/{requestId}/result`
- Model supports:
  - required `prompt`
  - optional `images`
  - `aspect_ratio` values `16:9`, `9:16`, `4:3`, `3:4`
  - `duration` values `5`, `10`, `15`
- The model is positioned as a dual-mode T2V/I2V model with up to `4` reference images and native audio.
- Official pricing published on the model/blog page:
  - 5 seconds: `$0.80`
  - 10 seconds: `$1.60`
  - 15 seconds: `$2.40`
- Sources:
  - https://wavespeed.ai/docs/docs-api/wavespeed-ai/cinematic-video-generator
  - https://wavespeed.ai/blog/posts/introducing-wavespeed-ai-cinematic-video-generator-on-wavespeedai/

### Official response-shape implications

- The docs and examples indicate a response shape centered on:
  - `data.id`
  - `data.status`
  - `data.outputs`
  - `data.error`
  - `data.urls.get`
- That is enough to define a provider-agnostic mapping contract:
  - provider task id from `data.id`
  - normalized state from `data.status`
  - final result URL from `data.outputs[0]`
  - polling URL template from the documented `/predictions/{requestId}/result` path

### Planning implications

- The provider row should be seeded with `https://api.wavespeed.ai/api/v3`, but runtime code should still normalize a plain service root to avoid double-append or missing-path errors.
- The connection test must use `/balance`, not a generic reachability probe.
- The seeded model should carry enough metadata to drive:
  - admin readiness
  - Media Studio input rendering
  - runtime submit/poll behavior
  - pricing fallback
- The first release should stay async-only even though WaveSpeed exposes broader capabilities elsewhere in the docs. That keeps the design aligned with the repo’s queue + recovery architecture.
