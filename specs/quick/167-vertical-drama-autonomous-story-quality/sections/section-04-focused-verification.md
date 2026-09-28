# Section 04 — focused verification

## Ownership

Regression tests, typecheck, diff hygiene, and final gap review.

## Target files

- focused test files only, unless a test exposes a production defect

## TDD expectations

Run five review passes: functional completion, semantic continuity, long-form
scale, failure safety/idempotency, and regression/scope.

## Acceptance

Focused tests and affected typecheck pass; `git diff --check` passes; unrelated
dirty files are unchanged; browser/provider/deployment status is reported
separately.
