# Section 02 — Persistence and Migration

## Goal

Extend existing `worker_jobs`/`worker_job_events` without creating a generic `jobs` table or deleting legacy values. Add all metadata required for durable lifecycle, attempts, dispatches, outbox, schedule occurrences, and audit.

## Files

- Modify `apps/web/drizzle/schema.ts` only in the Feature 186-owned schema declarations.
- Add `apps/web/drizzle/0303_feature_186_unified_job_control_plane.sql` and update the Drizzle journal/snapshot only through the repository's migration tooling.
- Add `apps/web/server/scripts/backfillJobControlPlane.ts` and `apps/web/server/scripts/verifyJobControlPlaneMigration.ts`.
- Add schema/migration tests under `apps/web/server/services/__tests__` or `apps/web/drizzle`.

## Requirements

Add definition hash, canonical retry/attempt/fencing/heartbeat/progress fields where absent; add event sequence/idempotency key; add attempts, dispatches, outbox, and schedule mapping with tenant-aware indexes, uniqueness, FKs, and retention comments. The expand migration is additive and rerunnable. Backfill is batched, resumable, dry-run by default, records complete/ambiguous/error counts, and never guesses identity from queue position or calls providers.

## TDD acceptance

Verify SQL shape, legacy status preservation, nullable idempotency behavior, existing assignment-sequence compatibility, uniqueness/FK constraints, rerun safety, dry-run no-write behavior, resume cursor, and quarantine of ambiguous legacy rows.
