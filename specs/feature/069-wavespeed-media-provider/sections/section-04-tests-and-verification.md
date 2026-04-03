# Section 04: Tests and Verification

## Goal

Close the feature with targeted regression coverage and a clear verification sequence across both the TypeScript and Python stacks.

This section should be executed after Sections 01-03 are implemented.

## Files in scope

- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- any additional Vitest files introduced for Media Studio or pricing fallback
- Python media gateway / media task tests covering provider submit/poll logic

## Required test coverage

### 1. Provider and admin coverage

- WaveSpeed provider template is present and uses the official base URL.
- Connection testing hits `/balance` with bearer auth.
- `200` with numeric `data.balance` is success.
- `401`, `403`, and `429` return meaningful errors.
- Media model persistence rejects unsafe `apiEndpoint` and `apiQueryEndpoint` values.

### 2. Static fallback and pricing coverage

- Static registry includes `wavespeed-ai/cinematic-video-generator`.
- DB-miss pricing fallback still exposes `pricingFormula` and `pricingTiers`.
- `5s`, `10s`, and `15s` compute to `800`, `1600`, and `2400`.
- Existing providers with other pricing formulas still compute correctly.

### 3. Media Studio and web-router coverage

- Model input parsing exposes optional WaveSpeed image support.
- The launch model carries the four-image cap into the client helper layer.
- Media Studio rejects or trims the fifth image when the launch model is active.
- Server-side validation rejects:
  - fifth image
  - invalid aspect ratio
  - invalid duration
- Server-side validation rejects unsafe absolute reference-image URLs.
- Other providers retain their current image-count behavior.

### 4. Python runtime coverage

- Base URL normalization appends `/api/v3` once.
- Submit payload maps fields exactly as required by the WaveSpeed docs.
- Poll responses normalize `created`, `processing`, `completed`, and `failed` correctly.
- Success requires `data.outputs[0]`.
- Recovery payload contains the required `submission.*` keys.
- Python-side cost estimation stays aligned with the same duration tiers.
- Recovery payload omits raw prompt text, secrets, and raw reference URLs.
- Private/internal result URLs are rejected before persistence or later download.
- Polling backoff handles `429`, timeout, and transient `5xx` conditions.
- Polling terminates with a deterministic timeout instead of looping indefinitely.
- Success persists `actual_duration` in a reconciliation-safe way when upstream omits it.

## Verification commands

Use targeted verification first, then a broader regression slice:

### Web

- `npm --workspace apps/web test -- mediaProviders.test.ts`
- `npm --workspace apps/web test -- media.db-first.contract.test.ts`
- `npm --workspace apps/web test -- mediaModelInputs.test.ts`

### Python

- `(cd python-backend && uv run pytest <targeted-wave-speed-tests>)`
- `(cd python-backend && uv run pytest <adjacent-media-runtime-tests>)`

If exact filenames change during implementation, preserve the intent: run focused tests for provider wiring, pricing fallback, UI validation, and runtime polling before any broader suite.

## Manual smoke checks

- Create or edit a WaveSpeed provider in Admin > Media Providers.
- Run the provider connection test with a valid key and with an invalid key.
- Confirm the launch model appears in Admin > Media Models with the correct provider readiness.
- In Media Studio:
  - submit one prompt-only request
  - submit one request with reference images
  - verify the fifth image is blocked
- Confirm a completed task resolves to a final media URL and not just a provider polling link.

## Acceptance criteria

- New Vitest and pytest coverage proves the feature behavior end to end.
- Regression checks show that existing providers continue to pass their current contracts.
- Manual smoke checks align with the same behavior already proven by automated tests.

## Implementation Notes

Implemented verification coverage in:

- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/server/routers/__tests__/mediaModels.persistence.test.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `python-backend/tests/unit/test_media_provider_service_wavespeed.py`
- `python-backend/tests/unit/llm_proxy/test_wavespeed_media_provider.py`
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_wavespeed.py`
- `python-backend/tests/tasks/test_media_tasks_wavespeed.py`

Deviation from plan: Python verification used `pytest --no-cov` for the focused WaveSpeed slices because the repo's default pytest coverage database was corrupted in the local environment. The feature-specific tests still passed end to end.

## Verification Notes

- Focused Vitest slice: 80 tests passed
- Focused pytest WaveSpeed slice: 23 tests passed with repo default coverage enabled after removing a corrupted local `.coverage*` artifact
- Seed script import smoke check: passed
- Workspace `npm --workspace apps/web run typecheck` still fails on pre-existing repo-wide TypeScript errors outside the WaveSpeed file set
