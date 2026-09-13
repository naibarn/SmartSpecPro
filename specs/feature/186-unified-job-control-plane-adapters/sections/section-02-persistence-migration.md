# Section 02 — Persistence and Migration

## Goal

Extend existing `worker_jobs`/`worker_job_events` without creating a generic `jobs` table or deleting legacy values. Add all metadata required for durable lifecycle, attempts, dispatches, outbox, schedule occurrences, and audit.

## Files

- Modify `apps/web/drizzle/schema.ts` only in the Feature 186-owned schema declarations.
- Inspect the existing Feature 186 migrations `0303_feature_186_unified_job_control_plane.sql`, `0304_feature_186_contract_version.sql`, `0305_feature_186_timeout_policy.sql`, and `0306_feature_186_outbox_cancellation.sql`; add a later migration only when the inventory proves a missing field or constraint, and update the Drizzle journal/snapshot only through the repository's migration tooling.
- Extend `apps/web/scripts/backfill-unified-job-control-plane.ts` for dry-run/batched backfill and use `apps/web/scripts/verify-feature-186.ts` for migration/artifact contract checks.
- Add schema/migration tests under `apps/web/server/services/__tests__` or `apps/web/drizzle`.

## Requirements

Add definition hash, canonical retry/attempt/fencing/heartbeat/progress fields where absent; add timeout policy and bounded canonical error projection using the existing `statusReason`/`failureReason` mapping or explicitly approved new fields; add event sequence/idempotency key; add attempts, dispatches, outbox, settlement, and schedule mapping with tenant-aware indexes, uniqueness, FKs, and retention comments. If transfer records are not already available, add only plan/preview/item/checkpoint companions linked to the canonical `tenant_data_transfer` job, with immutable full-snapshot fingerprint, deterministic item keys, handler/policy versions, explicit dispositions, and no independent lifecycle/retry/lease/result identity. The expand migration is additive and rerunnable. Backfill is batched, resumable, dry-run by default, records complete/ambiguous/error counts, and never guesses identity from queue position or calls providers.

## TDD acceptance

Verify SQL shape, legacy status preservation and explicit alias projection, nullable idempotency behavior, existing assignment-sequence compatibility, uniqueness/FK constraints, transfer item-key/snapshot/checkpoint constraints, bounded error projection, rerun safety, dry-run no-write behavior, resume cursor, and quarantine of ambiguous legacy rows. Verify that deletion/retention cannot cascade-delete required lifecycle evidence without the approved archive/redaction workflow.
