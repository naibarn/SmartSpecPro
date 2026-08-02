# Section 03: Migration and Verification

## Ownership

Own the SQL migration, migration safety assertions, focused test execution,
typecheck, and scoped diff verification.

## Files

- new `apps/web/drizzle/*.sql` migration
- migration/schema verification tests
- scoped auth tests

## TDD

- Assert duplicate preflight and functional index clauses are present.
- Assert token backfill excludes `channel = 'sms'`.
- Run auth tests before and after migration implementation.

## Acceptance

- Duplicate migration aborts before updates.
- Existing data is canonicalized safely.
- SMS token phone values are preserved.
- `git diff --check`, focused tests, and `pnpm check` pass.
