# Section 08: Regression Verification

## Goal

Close the implementation with focused regression coverage, seed verification, and documented staging smoke tests.

## Files In Scope

- all tests introduced in sections 01-07
- existing provider regression tests touched by shared helper changes
- `specs/feature/110-magnific-media-provider-models/implementation/usage.md` if implementation docs are generated
- rollout/smoke-test notes

## Required Verification

### 1. Web verification

Run:

- `npm --prefix apps/web run check`
- targeted provider template/connection tests
- targeted model seed tests
- targeted static fallback tests
- targeted Media Studio input parsing tests
- targeted credit reservation/reconciliation tests
- Magnific seed dry-run

Suggested commands:

- `npm --prefix apps/web test -- server/routers/mediaProviders.test.ts`
- `npm --prefix apps/web test -- server/services/mediaProviderUtils.test.ts`
- `npm --prefix apps/web test -- server/services/mediaGenerationService.test.ts`
- `npm --prefix apps/web test -- client/src/lib/mediaModelInputs.test.ts`
- `npm --prefix apps/web exec tsx scripts/seed-media-models-magnific.ts --dry-run`

### 2. Python verification

Run:

- Magnific provider unit tests
- Magnific gateway routing tests
- Magnific media task polling tests
- Magnific SSRF/security tests
- existing WaveSpeed/BytePlus/Kie routing tests if shared gateway code changed

Suggested commands:

- `pytest python-backend/tests/unit/llm_proxy/test_magnific_provider.py -v`
- `pytest python-backend/tests/unit/llm_proxy/test_gateway_unified_magnific.py -v`
- `pytest python-backend/tests/tasks/test_media_tasks_magnific.py -v`
- `pytest python-backend/tests/unit/services/test_magnific_ssrf.py -v`

### 3. Cross-provider regression

Run or preserve coverage for:

- Kie image/video routing
- fal.ai image/video routing
- BytePlus image/video routing
- WaveSpeed video/audio routing and polling
- ElevenLabs direct audio routing
- UVoice routing
- KNPLabs routing

### 4. Seed and rollout verification

Verify:

- provider row is disabled after seed
- all Magnific models exist after model seed dry-run
- admin overrides survive seed rerun
- pricing status remains estimated
- video/upscaler models remain disabled/admin-only until manually enabled
- no generated seed deletes existing rows

### 5. Staging smoke tests

Prerequisites before running external smoke tests:

- Magnific API key configured in staging Admin Media Providers
- provider enabled only for an admin/test tenant
- selected test models enabled only for admin/test users
- R2/S3 or equivalent platform storage is writable
- media worker/Celery polling is running
- test account has credits and an agreed cost/quota ceiling
- logs/metrics dashboard or equivalent query path is available
- rollback instructions from section 07 are available to the tester

If API quota allows, run staging in this order:

1. connection test
2. one low-cost image model
3. Remove Background sync model
4. one video model
5. Video Upscaler Precision

For every smoke test, confirm:

- provider task id stored where async
- status/polling works
- platform re-hosting occurs
- media history displays platform URL
- credits reserve and settle correctly
- no provider URL is visible in final user payload

If an external smoke test is skipped, write an implementation artifact under `specs/feature/110-magnific-media-provider-models/implementation/smoke-test-notes.md` with date, environment, missing prerequisite or quota reason, model skipped, and residual risk.

## Acceptance

This section is complete when all targeted tests pass or any unavailable external smoke test is documented with a clear reason, and the final implementation summary lists residual risk.
