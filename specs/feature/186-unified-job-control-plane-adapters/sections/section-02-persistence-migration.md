# Section 02 — Persistence and Migration

## Goal

Extend existing `worker_jobs`/`worker_job_events` without creating a generic `jobs` table or deleting legacy values. Add all metadata required for durable lifecycle, attempts, dispatches, outbox, schedule occurrences, and audit.

## Files

- Modify `apps/web/drizzle/schema.ts` only in the Feature 186-owned schema declarations.
- Inspect the existing Feature 186 migrations `0303_feature_186_unified_job_control_plane.sql`, `0304_feature_186_contract_version.sql`, `0305_feature_186_timeout_policy.sql`, `0306_feature_186_outbox_cancellation.sql`, `0307_feature_186_action_callback_evidence.sql`, and `0308_feature_186_operator_review_reason.sql`. Add a later migration only when the inventory proves a missing field or constraint. If Drizzle generation is blocked by a pre-existing snapshot collision, record the exact blocker and review the hand-authored additive migration before applying it.
- Extend `apps/web/scripts/backfill-unified-job-control-plane.ts` for dry-run/batched backfill and use `apps/web/scripts/verify-feature-186.ts` for migration/artifact contract checks.
- Add schema/migration tests under `apps/web/server/services/__tests__` or `apps/web/drizzle`.

## Requirements

Add definition hash, canonical retry/attempt/fencing/heartbeat/progress fields where absent; add timeout policy, bounded canonical error/review projection, action/callback replay records, and event sequence/idempotency key allocated under the job lock; add attempts, dispatches, outbox, settlement, and schedule mapping with tenant-aware indexes, uniqueness, FKs, and retention comments. Feature 189 owns transfer plan/preview/item/checkpoint schema and must link those projections to this completed control-plane contract. The expand migration is additive and rerunnable. Backfill is batched, resumable, dry-run by default, records complete/ambiguous/error counts, and never guesses identity from queue position or calls providers.

## TDD acceptance

Verify SQL shape, legacy status preservation and explicit alias projection, nullable idempotency behavior, existing assignment-sequence compatibility, uniqueness/FK constraints, action/callback/settlement dedupe, bounded error/review projection, rerun safety, dry-run no-write behavior, resume cursor, and quarantine of ambiguous legacy rows. Feature 189 separately verifies its transfer item-key/snapshot/checkpoint constraints against the canonical job contract. Verify that deletion/retention cannot cascade-delete required lifecycle evidence without the approved archive/redaction workflow.
