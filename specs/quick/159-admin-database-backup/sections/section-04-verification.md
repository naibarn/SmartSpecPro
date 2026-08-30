# Section 04 — Verification and Closure

## Ownership

Conductor owns integration, focused tests, migration review, security review and browser evidence.

## Checks

- focused backend and UI tests
- `git diff --check`
- relevant lint/typecheck
- migration/schema consistency inspection
- route path traversal/expiry/admin review
- browser evidence or explicit skip artifact

## Completion boundary

Do not claim live `pg_dump`, restore, deployment, or production browser proof unless it is actually run.
