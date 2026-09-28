# TDD Plan

## Server first

1. Add unit tests for summary result mapping: positive-only, negative-only, mixed signed rows, and empty/null aggregates.
2. Add tests asserting source/start/end/tenant filters are included and endDate uses exclusive comparison.
3. Add router test that forwards authenticated tenant/user and filters to the service and returns the summary contract.

Expected initial failure: missing `getTransactionHistorySummary` and `historySummary` procedure.

## Client

1. Test date helper/default range and inclusive date-end conversion.
2. Test history and summary query calls receive identical source/start/end values and page resets when filters change.
3. Test three summary labels/values and invalid-range message; no query when range is invalid.

Expected initial failure: no date controls/summary and no summary query.

## Regression

- existing `credits.history` Dashboard usage remains an array
- existing source option list remains intact
- run targeted Vitest commands from repo root with jsdom for page-facing tests where needed
- run `git diff --check`; run web typecheck as a warning gate if baseline allows
