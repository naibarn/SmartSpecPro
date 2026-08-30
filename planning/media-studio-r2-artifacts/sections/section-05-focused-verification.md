# Section 05 — Focused Verification and Closure

## Ownership

Own only verification commands, test fixes caused by sections 01-04, migration readiness checks, and the final evidence report. Do not fix unrelated baseline diagnostics.

## Checks

- Run focused Vitest suites for artifact service, polling/list projection, and Media Studio UI.
- Run Python media tests if the implementation changes the Python boundary.
- Run changed-file TypeScript diagnostics and record full-repo baseline noise separately.
- Validate migration syntax and, only if a target test DB is available, apply and verify the migration.
- Run `git diff --check` and inspect changed-file status/stat.
- Verify protected storage ETag/conditional and Range tests remain green.

## Acceptance

No required focused proof is skipped silently. Live provider/R2, authenticated browser, target-DB, and deployment checks are explicitly marked performed or unperformed.
