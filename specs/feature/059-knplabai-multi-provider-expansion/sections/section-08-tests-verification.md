# Section 08: Tests and Verification

## Purpose

Add the automated coverage that proves the KNPLabs expansion works end to end.

This section should not introduce new testing conventions; it should mirror the repo’s current `pytest` and `vitest` patterns.

## Files

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

## Implementation Notes

1. Add unit tests for provider initialization, validation, and cleanup.
2. Add routing tests for chat, media, TTS, and embeddings.
3. Add seed idempotency tests for the KNPLabs provider and model catalogs.
4. Add admin UI tests for templates, labels, and readiness states.
5. Add recovery/polling tests for KNPLabs task handling.
6. Add security tests for redirects, URL validation, and size limits.
7. Add price conversion tests to prove the Decimal-based math is stable.

## Acceptance Criteria

- Each major KNPLabs pathway has a failing test before implementation.
- The test suite covers the provider, the routers, the seeds, and the admin UI.

