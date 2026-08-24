# Section 02: Tests and Verification

## Ownership

- `apps/web/client/src/lib/legalContent.test.ts`

## Work

- Verify EN/TH section parity and stable IDs.
- Verify temporary controller/contact constants and absence of legacy unsupported claims.
- Run focused Vitest, formatting/diff checks, and changed-file TypeScript diagnostics.

## Acceptance

- Tests run in the repository's web workspace and do not require database or production
  credentials.
- Any full typecheck failure is reported with the distinction between changed-file diagnostics
  and unrelated baseline noise.
