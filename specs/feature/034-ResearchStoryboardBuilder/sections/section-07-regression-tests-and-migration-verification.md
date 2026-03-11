# Section 07 - Regression Tests And Migration Verification

## Objective

Finish the feature with targeted Node and Python regression coverage, migration validation, and cross-service verification that preview-first structured results do not break existing agencies or downstream systems.

## Prerequisites

- Sections 01 through 06 complete.

## Scope

- Add Node Vitest coverage across router, service, and integration seams.
- Add Python pytest coverage for envelope parsing and API normalization.
- Verify additive migrations and historical read compatibility.
- Add smoke-level end-to-end verification for preview-to-commit flows.

## Primary files and areas

- Node tests under `apps/web/server/**`
- Shared/presentation contract tests where preview DTOs are defined
- Python tests under `python-backend/tests`
- Migration verification or readiness checks already used by the repo

## Required implementation work

### 1. Node regression coverage

Cover:

- agency bridge normalization
- preview routing
- library-backed research/storyboard commit
- deck commit integration
- template seeding and clone-to-draft
- stale-preview and duplicate-commit handling

### 2. Python regression coverage

Cover:

- envelope parsing and validation
- text-only fallback
- canonical API response shape
- additive persistence behavior for structured runs

### 3. Migration and smoke verification

Verify:

- schema changes are additive
- historical run list/detail reads still succeed
- plain-text agencies still work
- structured preview runs work
- commit paths produce correct target identifiers and provenance links

## Tests to write first

- Node test suite: old text-only agencies still render and list correctly.
- Node integration test: structured run creates preview then commits to library-backed artifact with provenance intact.
- Node integration test: deck preview commits to real presentation deck and records identifiers back on the run artifact.
- Python test suite: envelope-present and text-only runs both return the canonical API contract.
- Migration verification test: new columns and tables do not break historical run queries.
- Smoke verification stub: plain-text run, research preview, storyboard commit, and deck commit all complete on the expected happy path.

## Risks and safeguards

- Coverage gap risk in mixed-language integration. Require both Node and Python tests.
- Migration blind spot risk if only new writes are tested. Verify old reads explicitly.
- False confidence risk from only unit tests. Add a small number of integration and smoke checks.

## Exit criteria

- Node and Python regression coverage exists for the new contract and flows.
- Additive migration behavior is verified.
- Plain-text agencies and new preview-first flows both pass smoke verification.
- Planning artifacts are fully implementable without further ambiguity.

## Implementation notes

- Expanded `apps/web/server/services/agencyBridge.test.ts` so the bridge regression coverage now asserts both sides of the retrieval-scope transport contract: `retrieval_scope` is sent unchanged when resolved and omitted entirely when not provided.
- Added `python-backend/tests/unit/test_agency_scope_runtime.py` to lock the prompt-level retrieval-scope runtime behavior for `library_only` runs and no-scope fallback. The test overrides `DEBUG` at import time so invalid shell values such as `DEBUG=release` do not break collection.
- Added `python-backend/tests/unit/migrations/test_agency_structured_results_migration.py` to verify migration `012_agency_structured_results.py` remains additive: nullable `agency_runs` structured-result columns, `agency_run_artifacts`, supporting indexes, and downgrade cleanup are all asserted explicitly.
- Reused the already-landed Node router/service coverage from Sections 02-06 as the regression backbone for preview fetch, library commit, deck commit, template seeding, duplicate suppression, and stale-preview handling, then ran a single aggregate Node suite across those files for closeout verification.
- Reused the structured-result normalization and preview-persistence tests in `python-backend/tests/unit/test_agency_service.py` as the smoke-level Python verification for envelope parsing, payload sizing, and preview-ready streaming behavior.
- Broader Python agency unit batches still show pre-existing instability in this environment: some legacy `test_agency_service.py` lifecycle cases fail independently of Section 07, and larger router/model batches can hang under the stripped-down pytest bootstrap used here. Section 07 records those as verification limits rather than expanding scope into unrelated test-harness repair.

## Tests added and updated

- `apps/web/server/services/agencyBridge.test.ts`
- `python-backend/tests/unit/test_agency_scope_runtime.py`
- `python-backend/tests/unit/migrations/test_agency_structured_results_migration.py`

## Verification run

- Passed: `bash -lc 'source ~/.nvm/nvm.sh && cd /home/dev/projects/SmartSpecPro && npm --prefix apps/web test -- server/services/agencyBridge.test.ts server/services/agencyPreviewService.test.ts server/services/agencyCommitService.test.ts server/services/agencyDeckCommitService.test.ts server/services/agencyExperienceTemplateService.test.ts server/services/agencyPreviewLifecycleService.test.ts server/services/presentationService.test.ts server/routers/__tests__/agency.test.ts'`
- Passed: `DEBUG=false PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 UV_CACHE_DIR=/tmp/uv-cache uv run --project python-backend pytest -p pytest_asyncio.plugin -p pytest_cov --noconftest python-backend/tests/unit/test_agency_service.py::TestAgencyServiceExecuteRun::test_execute_run_normalizes_structured_result_and_preview_artifact python-backend/tests/unit/test_agency_service.py::TestAgencyPreviewPersistencePolicy::test_build_preview_artifact_uses_run_payload_indirection_for_large_payload python-backend/tests/unit/test_agency_service.py::TestAgencyPreviewPersistencePolicy::test_build_preview_artifact_summarizes_payloads_over_max_size python-backend/tests/unit/test_agency_service.py::TestAgencyPreviewPersistencePolicy::test_execute_run_stream_emits_preview_ready_before_run_finished`
- Passed: `DEBUG=false PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 UV_CACHE_DIR=/tmp/uv-cache uv run --project python-backend pytest -p pytest_asyncio.plugin -p pytest_cov --noconftest python-backend/tests/unit/test_agency_scope_runtime.py python-backend/tests/unit/migrations/test_agency_structured_results_migration.py`

## Known follow-ups

- Python agency lifecycle coverage still has unrelated failures outside the structured-result and retrieval-scope slices exercised here; that suite should be stabilized separately before using it as the feature’s default full-regression command.
- Broader Python router/model batches can hang with the minimal `--noconftest` bootstrap used in this environment, so future work should align a more representative but still deterministic feature test harness for agency runtime changes.
