# Section 08: Rollout, Verification, and Regression

## Goal

Ship safely behind flags and prove existing media flows still work.

## What This Section Must Change

- Add feature flags for:
  - Gemini Omni suite UI
  - provider asset creation
  - director skill
  - prompt QA
  - video QA
  - auto-learning recommendations
- Add rollout docs or admin notes.
- Add regression tests for non-Gemini media models.
- Add migration/backfill safety checks for existing Gemini Omni configs.
- Add feature-flag off-state tests for every new surface.
- Add QA-disabled fallback tests so generation can still work when QA flags are off.
- Add callback/polling deduplication and recovery regression tests.
- Add result re-hosting and provider URL redaction regression tests.
- Add rate-limit/deferred retry regression tests.
- Add sanitized audit/observability checks for lifecycle events.
- Add RBAC regression tests for provider asset list/use/create/delete/restore/purge.
- Add budget/concurrency/rate-limit preflight regression tests.
- Add retention/purge regression tests for provider assets.
- Add policy/consent acknowledgment regression tests for character/voice asset creation.

## Verification Commands

- `npm --prefix apps/web test`
- `npm --prefix apps/web run check`
- `cd python-backend && DEBUG=false PYTEST_ADDOPTS=--no-cov uv run pytest tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py`
- focused UI tests for Media Studio Gemini Omni panel
- skill verification scripts for all new Gemini Omni skills
- migration and seed idempotency checks
- provider asset tenant isolation checks
- Media Studio feature-flag off-state checks
- callback/polling terminal dedup checks
- result re-hosting checks
- audit/log redaction checks
- asset RBAC checks
- budget/rate/concurrency denial checks
- asset retention/purge checks
- consent/policy acknowledgment checks

## Rollback Rules

- Disabling suite UI hides new Gemini Omni panels.
- Stored provider assets remain intact.
- Existing generated media remains available.
- Non-Gemini Media Studio generation remains usable.
- Incomplete storyboard runs keep completed clip records and can be resumed or reviewed.
- Callback disablement or callback failure falls back to polling/recovery.
- Disabling asset creation does not hide existing usable assets unless selection is separately disabled.
- Soft-deleted assets remain hidden from normal pickers but can be inspected/restored by authorized admins where policy allows.

## Completion Criteria

- Feature can be enabled gradually.
- Rollback does not require deleting data.
- Regression tests protect existing media generation paths.
- Operators can verify the suite is disabled/enabled without editing raw model config manually.
- Support can diagnose provider lifecycle issues from sanitized audit/log events.
- Tenant admins can understand asset counts/status and pricing readiness without seeing raw provider secrets or IDs by default.
