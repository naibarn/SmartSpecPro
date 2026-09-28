# Spec Self-Review

## Round 1 — completeness

- Covered: two ZIP outputs, safe/full mode, background queue, status UI, download, 24-hour cleanup, admin authorization.
- Result: no `[AUTO-FIX]` required.

## Round 2 — repository fit

- Rechecked: existing `adminProcedure`, BullMQ startup/shutdown, Express session auth, shared menu resolver, `adm-zip` dependency.
- Result: no `[AUTO-FIX]` required.

## Round 3 — security and abuse

- Rechecked: no client path/SQL input, artifact enum, UUID validation, realpath containment, expiry check, full-mode confirmation, sanitized error storage.
- Result: `[AUTO-FIX]` added explicit path/connection redaction and safe application-field pattern coverage.

## Round 4 — failure and scale

- Rechecked: partial-file cleanup, stale running reconciliation, ZIP integrity, checksum, worker concurrency 1, table export cursor batching, `pg_dump` prerequisite.
- Result: `[AUTO-FIX]` changed application export from whole-table buffering to PostgreSQL cursor batches.

## Round 5 — interface and verification

- Rechecked: tRPC input/output, REST download contract, route guard, migration journal, focused backend/UI/menu tests, baseline typecheck separation, browser evidence requirement.
- Result: no `[AUTO-FIX]` required.

Two consecutive clean rounds were reached after the Round 3 and Round 4 fixes.
