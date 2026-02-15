# section-07-verification-hardening

## Objective

Build the full regression-prevention matrix for parity, compatibility, performance, and security before rollout.

## Scope

- Add frontend and backend test suites for all critical text clip flows.
- Add golden parity fixtures with representative timestamp assertions.
- Add legacy compatibility snapshots and mixed-version tests.
- Add text-heavy benchmark and security hardening tests.

## Dependencies

- Requires sections `01` through `06`.

## Primary Files

- `apps/web/client/src/components/videoeditor/__tests__/...`
- `apps/web/client/src/services/__tests__/...`
- `apps/web/shared/types/__tests__/...`
- `python-backend/tests/unit/...`
- `python-backend/tests/integration/...` (if needed)

## Tests First (Write Before Implementation)

1. Test: parity fixture suite validates style/position/order for representative timestamps.
2. Test: i18n fixture suite validates declared behavior for Unicode/RTL/ligature cases.
3. Test: legacy snapshots confirm backward-compatible load/save behavior.
4. Test: mixed-version compatibility matrix validates rollout-window policy outcomes.
5. Test: missing-font fallback and policy telemetry assertions pass.
6. Test: benchmark fixture meets explicit render-time threshold for text-heavy scenarios.
7. Test: escaping/font-mapping security fixtures block unsafe inputs.

## Implementation Tasks

1. Add/organize test fixtures for parity, compatibility, and security scenarios.
2. Implement the required unit/component/contract/backend test cases.
3. Add benchmark scenario and threshold assertion for pre-release gate.
4. Ensure CI commands can run new suites without introducing flaky behavior.
5. Update references to required diagnostics fields in failure assertions where applicable.

## Acceptance Criteria

1. Critical regression vectors are covered by automated tests.
2. Parity and compatibility suites are repeatable and deterministic.
3. Performance and security gates have explicit pass/fail criteria.

## Risks and Notes

- Overly brittle visual assertions can create false negatives; keep fixtures deterministic.
- Benchmark thresholds should be strict enough for quality but realistic for CI environment variance.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/shared/types/__tests__/mediaJob.test.ts`
- `apps/web/client/src/services/__tests__/projectManagerValidation.test.ts`
- `python-backend/tests/unit/test_media_job_text_render.py`

### Implementation Notes

1. Added explicit compatibility-policy matrix tests to ensure unsupported contract behavior remains deterministic across `reject_with_clear_error` and `gated_downgrade` modes.
2. Added a legacy text payload normalization snapshot test to lock backward-compatible load/save behavior for text clip defaults.
3. Expanded backend hardening coverage for:
   - version policy telemetry outcomes,
   - i18n ASS fixture preservation,
   - drawtext escaping coverage for `%`, brackets, quotes, and colons,
   - deterministic text-heavy ASS generation benchmark threshold.

### Deviations From Plan

- This section focused on regression-prevention test coverage; no additional production-path logic changes were required after tests validated existing behavior.

### Tests Added/Updated

- Updated `apps/web/shared/types/__tests__/mediaJob.test.ts` with compatibility matrix coverage.
- Updated `apps/web/client/src/services/__tests__/projectManagerValidation.test.ts` with a legacy normalization snapshot guard.
- Updated `python-backend/tests/unit/test_media_job_text_render.py` with policy matrix, i18n/security fixtures, and benchmark assertions.

### Follow-Ups

- Promote the text-heavy benchmark threshold into a dedicated CI perf gate if CI runtime variance changes materially.
