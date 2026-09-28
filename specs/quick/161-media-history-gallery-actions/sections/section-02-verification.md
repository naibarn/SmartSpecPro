# Section 02: Verification

## Ownership

Run focused tests and static checks for the implementation and record any
baseline-wide failures separately. Do not alter unrelated dirty files.

## Checks

- Focused client/server tests for gallery actions and deletion.
- Changed-file TypeScript or workspace typecheck diagnostics.
- `git diff --check`.
- Final diff review for exact Admin/tenant boundaries and no storage deletion.

## Acceptance

- Fresh relevant tests pass or a concrete environment blocker is recorded.
- No must-do-now correctness, security, or user-goal gap remains.

## Verification record

- Passed focused Vitest run: 6 files, 20 tests.
- Passed `git diff --check`.
- Passed Prettier check for the new tenant-scope TypeScript files.
- Workspace typecheck was started but did not return diagnostics within the
  bounded run and was stopped; no changed-file type error was observed in the
  focused test transform.
