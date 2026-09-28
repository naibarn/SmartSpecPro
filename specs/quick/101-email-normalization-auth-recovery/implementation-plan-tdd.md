# TDD Plan

## Red phase

1. Add helper tests for lowercase and surrounding whitespace.
2. Add lookup tests showing a mixed-case/whitespace stored row matches
   canonical input.
3. Add router-level/contract tests for invalid reset code status, verification
   rate-limit procedure, and null-password login rejection.
4. Add migration assertions proving duplicate preflight exists and SMS rows are
   excluded from email backfill.

Run the focused tests before implementation. Failures must be behavior
failures, not import/configuration failures.

## Green phase

- Implement the helper and shared lookup first.
- Wire canonicalization through each listed auth boundary.
- Add migration and functional index.
- Make expected errors explicit tRPC errors.
- Run focused tests after each section.

## Refactor and regression

- Deduplicate route normalization without changing phone behavior.
- Run `cd apps/web && pnpm exec vitest run` with the selected auth test files.
- Run `cd apps/web && pnpm check`.
- Run migration SQL/static verification against the disposable/test database if
  available; otherwise report the exact blocker.
- Run `git diff --check` and inspect only scoped diffs.
