# Section 06 — Migration and Schema Reconciliation

## Goal

Make local Drizzle migration handoff authoritative, rerunnable, and read-only.

## Owned paths

- New or adjacent `apps/web/scripts/verify-feature-192-migrations.ts`.
- Focused migration verifier tests and representative fixtures.
- Existing Drizzle schema/journal tests only where compatibility assertions are
  missing.

## Implementation

Use the Drizzle journal and explicitly selected `DATABASE_URL`/dry-run input as
the migration authority. Compare journal entries and SQL files by identity,
classify historical/superseded files, and report missing/orphan/ambiguous
entries. Provide dry-run, resume, bounded failure, and quarantine output. Do
not infer state from file counts, queue position, or naming alone. Never call an
external provider or mutate production.

Verify Feature 186 additive schema invariants: one status column with legacy
aliases, no second generic retry/lease/job ledger, event sequence and
idempotency uniqueness, attempt/dispatch/outbox/settlement/action/callback
foreign keys, tenant ownership indexes, retention/delete behavior, and safe
expand compatibility. Detect silently reinterpreted legacy enum values and
conflicting status columns.

## Tests

Use a representative local fixture to test journal drift, historical SQL,
rerun/resume/quarantine, nullable idempotency, legacy status projection,
assignment versus lifecycle sequence, foreign-key preservation, and no
production/external mutation.

## Acceptance

The verifier produces an auditable agreement/disagreement report from the
official journal path and cannot mark schema handoff complete when an
invariant is missing.

## Implemented

- Added read-only `verify-feature-192-migrations.ts` using Drizzle
  `meta/_journal.json` as authority, with historical/manual classification and
  second-status detection.
- Added focused tests; the verifier explicitly reports no database mutation or
  external-provider call and is safe to rerun.
