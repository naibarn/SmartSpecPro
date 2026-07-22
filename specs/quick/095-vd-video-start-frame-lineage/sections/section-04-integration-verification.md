# Section 04: Integration Verification

## Ownership

- verification only; no new feature scope

## Work

1. Run all focused suites from `implementation-plan-tdd.md`.
2. Run Web typecheck, rustfmt check, Ruff, and `git diff --check`.
3. Inspect the final scoped diff against the production evidence.
4. Confirm no schema or unrelated file changes.
5. Report the deployment boundary before any service restart.

## Acceptance

- All focused tests pass.
- Static checks covering changed files pass or any unrelated baseline failure
  is clearly evidenced.
- No paid generation or production restart occurs without confirmation.

## Verification Results

- Web focused regressions: 7 passed.
- Web typecheck: passed.
- Hermes executor tests: 51 passed.
- Python retry-state tests: 11 passed.
- Scoped `git diff --check`: passed.
- No schema, migration, paid generation, deployment, or service restart was
  performed.
