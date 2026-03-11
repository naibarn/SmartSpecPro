# Implementation Summary

## Implemented sections

- section-01-contract-and-persistence — commit `a867278b`
- section-02-preview-routing-and-api-contract — commit `262fd5cf`
- section-03-library-backed-commit-flows — commit `1cf6b069`
- section-04-deck-preview-and-presentation-commit — commit `d678eb8c`
- section-05-template-seeding-and-scope-resolution — commit `4a77d0bc`
- section-06-observability-rollout-and-retention — commit `f0750398`
- section-07-regression-tests-and-migration-verification — commit `a5c4e09a`

## Verification

- Web feature suite: `bash -lc 'source ~/.nvm/nvm.sh && cd /home/dev/projects/SmartSpecPro && npm --prefix apps/web test -- server/services/agencyBridge.test.ts server/services/agencyPreviewService.test.ts server/services/agencyCommitService.test.ts server/services/agencyDeckCommitService.test.ts server/services/agencyExperienceTemplateService.test.ts server/services/agencyPreviewLifecycleService.test.ts server/services/presentationService.test.ts server/routers/__tests__/agency.test.ts'` → pass (`8` files, `52` tests)
- Python structured-result and preview suite: `DEBUG=false PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 UV_CACHE_DIR=/tmp/uv-cache uv run --project python-backend pytest -p pytest_asyncio.plugin -p pytest_cov --noconftest python-backend/tests/unit/test_agency_service.py::TestAgencyServiceExecuteRun::test_execute_run_normalizes_structured_result_and_preview_artifact python-backend/tests/unit/test_agency_service.py::TestAgencyPreviewPersistencePolicy::test_build_preview_artifact_uses_run_payload_indirection_for_large_payload python-backend/tests/unit/test_agency_service.py::TestAgencyPreviewPersistencePolicy::test_build_preview_artifact_summarizes_payloads_over_max_size python-backend/tests/unit/test_agency_service.py::TestAgencyPreviewPersistencePolicy::test_execute_run_stream_emits_preview_ready_before_run_finished` → pass (`4` tests)
- Python runtime and migration regression suite: `DEBUG=false PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 UV_CACHE_DIR=/tmp/uv-cache uv run --project python-backend pytest -p pytest_asyncio.plugin -p pytest_cov --noconftest python-backend/tests/unit/test_agency_scope_runtime.py python-backend/tests/unit/migrations/test_agency_structured_results_migration.py` → pass (`3` tests)

## Remaining risks and deferred items

- Broader Python agency unit suites still show unrelated failures and occasional hangs under the reduced `--noconftest` harness used in this environment, so full-suite signoff remains deferred.
- Retrieval-scope hardening is improved: `library_only` runs now drop direct external retrieval tools during Python tool resolution, but centralized enforcement across every external-access path is still deferred.
- Post-implementation security review is recorded in `implementation-security-review.md`.
- Chosen post-review action: `defer`

## Suggested next steps

1. Stabilize the broader Python agency test harness so router/model/lifecycle suites can serve as the default regression command for future changes.
2. Extend retrieval-scope enforcement from the current direct-tool filtering into a centralized backend policy for all external-access tools.
3. Replace slug-derived built-in template provenance with a dedicated persisted identifier.
