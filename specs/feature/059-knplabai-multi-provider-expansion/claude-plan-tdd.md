# KNPLabs AI Multi-Provider Expansion TDD Plan

## 1. Goal

Write tests first for the KNPLabs expansion so each phase of the implementation has a clear failing test before code lands.

The test strategy mirrors the main plan:

- Python features use `pytest`
- TypeScript features use `vitest`
- existing fixtures and mocking patterns should be reused

## 2. Phase 1: Core Provider Contract and Configuration

### Test stubs

- `python-backend/tests/unit/services/test_knplabai_provider.py`
  - provider initializes with the expected base URL and auth header
  - provider closes its HTTP client cleanly
  - prompt sanitization strips markup and control characters
  - model allowlist rejects unknown IDs
  - response size guard rejects oversized payloads before parsing
  - redirect blocking is set on outbound requests
- `python-backend/tests/unit/services/test_media_provider_service_knplabai.py`
  - `get_media_provider_key("knplabai")` reads the encrypted config row
  - `initialize_knplabai_client()` returns `None` when no API key exists
  - `initialize_knplabai_client()` returns a configured provider when the DB row exists
- `python-backend/tests/unit/services/test_unified_client_knplabai.py`
  - KNPLabs client initialization is lazy
  - the client slot is populated only when TTS/embeddings need it

## 3. Phase 2: LLM Provider Registration and Model Mapping

### Test stubs

- `apps/web/server/seed.test.ts`
  - the KNPLabs seed helper inserts a provider row with the right provider name, display name, and base URL
  - the helper is idempotent
  - the helper seeds the expected number of `modelProviderMap` rows
  - every seeded KNPLabs LLM mapping uses `apiStyle = chat-completions`
- `apps/web/server/services/llmRouter.test.ts`
  - a KNPLabs provider candidate resolves through the existing provider-selection flow
  - a base URL ending in `/ai/v1` resolves to `/ai/v1/chat/completions`
  - provider pinning and fallback behavior still work with a KNPLabs candidate present
- `apps/web/server/routers/__tests__/multiProvider.knplabai.test.ts`
  - default API style for `knplabai` is the chat-completions style
  - catalog merge logic produces the right canonical model IDs for KNPLabs mappings
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.test.ts`
  - KNPLabs is visible in provider labels or selector options

## 4. Phase 3: Media Catalog, Provider Seeds, and Admin UI

### Test stubs

- `apps/web/server/routers/__tests__/mediaProviders.knplabai.test.ts`
  - provider templates include KNPLabs
  - admin list returns KNPLabs without leaking the encrypted key
  - test-connection state is rendered for KNPLabs
- `apps/web/server/routers/__tests__/mediaModels.knplabai.test.ts`
  - admin model list includes KNPLabs rows
  - new KNPLabs models default to disabled
  - model readiness calculation uses the right provider name
- `apps/web/server/services/mediaGenerationService.test.ts`
  - static fallback registry includes KNPLabs metadata
  - KNPLabs models resolve to the correct provider name
- `apps/web/client/src/pages/AdminMediaProviders.test.tsx`
  - KNPLabs appears in the provider template cards
  - the form seeds the correct default base URL and callback behavior

## 5. Phase 4: Media Dispatch and Task Recovery

### Test stubs

- `python-backend/tests/unit/tasks/test_knplabai_video_task.py`
  - async polling marks completed tasks when a URL appears
  - failed states mark the task failed with a safe error
  - polling stops after the configured maximum attempts
  - result URLs are validated before storage
- `python-backend/tests/unit/services/test_knplabai_polling.py`
  - the recovery loop chooses the right KNPLabs branch for the stored model
  - 429 and transient errors do not permanently fail the task on the first retry
  - provider cleanup runs even when polling fails
- `python-backend/tests/unit/api/test_media_generation_knplabai.py`
  - media task submission stores the KNPLabs provider task ID
  - media task completion persists the final URL and result payload

## 6. Phase 5: Image and Video Adapters

### Test stubs

- `python-backend/tests/unit/services/test_knplabai_provider.py`
  - OpenAI-compatible image requests are shaped correctly
  - Gemini-native image requests use the native endpoint and decode base64 only after size checks
  - video submission returns a task ID and processing state
  - video polling distinguishes success, pending, and fail responses
  - result payloads with missing URLs are rejected or handled explicitly

## 7. Phase 6: TTS and Embeddings

### Test stubs

- `python-backend/tests/unit/api/test_knplabai_tts.py`
  - `/api/internal/tts` accepts `provider=knplabai`
  - unsupported voices or formats are rejected with a validation error
  - text over the max length is rejected
  - successful responses return audio bytes and the correct content type
- `python-backend/tests/unit/api/test_knplabai_embeddings.py`
  - `/api/internal/embeddings` can explicitly select KNPLabs
  - returned vectors are validated for the expected dimension
  - KNPLabs is not used implicitly when the generic embedding path is requested
- `python-backend/tests/unit/services/test_embedding_service.py`
  - the default embedding service behavior remains unchanged for existing callers

## 8. Phase 7: Security, Credits, and Rollout

### Test stubs

- `python-backend/tests/unit/services/test_knplabai_security.py`
  - unknown model IDs are rejected
  - prompt sanitization strips markup
  - redirect blocking is configured on all outbound requests
  - URL validation is applied to any reference-media inputs
- `python-backend/tests/unit/services/test_knplabai_credit_pricing.py`
  - provider pricing conversion uses Decimal-safe math
  - pre-flight credit checks block unaffordable requests
  - provider cost calculations do not alter the existing user credit conversion rules
- `apps/web/server/routers/__tests__/mediaModels.runtimeCounters.test.ts`
  - KNPLabs adds to the aggregated counters without breaking the fallback totals

## 9. Phase 8: End-to-End Verification

### Test stubs

- `apps/web/server/seed.test.ts`
  - KNPLabs seed scripts remain idempotent across repeated runs
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
  - KNPLabs provider records participate in the DB-first lookup contract
- `apps/web/client/src/components/admin/MultiProviderAdmin.test.tsx`
  - KNPLabs rows show up in the admin provider matrix

## 10. Final TDD Checks

Before implementation is considered complete, confirm that the test plan covers:

- provider setup
- routing
- catalog seeding
- recovery
- TTS
- embeddings
- security
- credits
- admin visibility

