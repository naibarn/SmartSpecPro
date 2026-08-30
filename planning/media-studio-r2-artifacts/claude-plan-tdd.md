# TDD Plan

## Wave 1 — Schema and artifact service

- Test extraction of direct and nested image/video/audio output arrays.
- Test rejection of missing tenant/user, unsafe redirects, unsupported MIME, and over-limit payloads.
- Test managed R2 URL owner verification, idempotent existing asset reuse, and conflict re-read.
- Test provider expiry classification versus transient timeout.
- Test that raw provider query strings are absent from logs/errors.

## Wave 2 — Transport/history integration

- Test unified polling durabilizes ordinary provider, deferred, MCP, and Hermes completed tasks.
- Test existing Vertical Drama/marketplace adapters remain compatible.
- Test listTasks returns persisted artifact data without invoking provider download.
- Test tenant/user mismatch returns no artifact and does not cross-scope rows.

## Wave 3 — Backfill

- Test dry-run produces no writes.
- Test cursor/checkpoint resumes after a failure and reruns idempotently.
- Test missing tenant rows are quarantined, provider expiry is distinct from retryable failure, and all media types are covered.

## Wave 4 — UI

- Test R2-first source selection when both URLs exist.
- Test provider fallback warning, provider expired message, storage pending state, and R2 missing state.
- Test no provider URL is selected when R2 is ready.
- Test localized labels and accessible retry/details controls.

## Verification commands

- `npm --prefix apps/web run test -- server/services/__tests__/mediaTaskArtifactService.test.ts server/services/__tests__/mediaTaskPollingService.test.ts server/routers/media.listTasks.artifacts.test.ts client/src/pages/__tests__/MediaStudio.mediaArtifacts.test.tsx`
- `npm --prefix apps/web run check`
- `python -m pytest python-backend/tests/unit/services/test_media_task_service.py python-backend/tests/unit/services/test_media_pipeline_rehost_storage.py`
- `git diff --check`
