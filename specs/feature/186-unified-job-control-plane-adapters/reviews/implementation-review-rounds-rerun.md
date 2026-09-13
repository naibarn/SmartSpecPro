# Feature 186 implementation audit rerun

**Date:** 2026-09-12
**Scope:** Current workspace implementation after the previous Feature 186 review.
**Result:** 22 focused rounds completed; material findings were repaired during the run.

## Round ledger

| Round | Verification dimension | Result / action |
|---:|---|---|
| 01 | Canonical schema fields and migration presence | Found `timeoutPolicyJson` absent; added additive migration 0305 and schema field. |
| 02 | Canonical row completeness | Rechecked after migration/backfill; zero missing definition hash, timeout policy, or invalid attempt. |
| 03 | Event sequence uniqueness | Zero duplicate `(workerJobId,eventSequence)` rows. |
| 04 | Attempt/dispatch uniqueness | Zero duplicate attempt numbers or dispatch dedupe keys. |
| 05 | Lease/fencing guards | Verified lease hash, fencing version, lease generation, and stale-write guards on worker mutations. |
| 06 | Business retry ownership | Verified no adapter retry increments `attempt`; added class-or-code allowlist support and persisted retry delay metadata. |
| 07 | Timeout semantics | Found start time was not materialized on `worker_jobs`; fixed `start()` and added idempotent soft-timeout request/reconciler signal. |
| 08 | Retry jitter | Added deterministic bounded jitter and `retryDelayMs`/`jitter` audit payloads. |
| 09 | Outbox lifecycle | Verified request/attempt/publish/failure/quarantine events, publisher fencing, bounded retries, and poison-row isolation. |
| 10 | Adapter identity | Verified BullMQ/Celery/fake adapters carry canonical job ID and retain provider IDs as references. |
| 11 | Scheduler/external wait | Verified deterministic occurrence identity, schedule conflict handling, lease release, and durable resume signal. |
| 12 | Admin/security boundary | Verified admin procedure, internal token boundary, actor/action IDs, tenant filters, and redacted timeline payloads. |
| 13 | Python/Celery boundary | `compileall` passed; task accepts canonical `job_id`, loads server context, and reports through fenced client methods. |
| 14 | Parallel-ledger check | No Feature 186 migration or service creates a generic replacement `jobs` table. |
| 15 | Rollout manifest/runbook | Updated manifest to schema version 0305 and documented archive-before-retention for canonical events. |
| 16 | Focused regression suite | 8 files / 34 tests passed. |
| 17 | Post-backfill database invariants | Zero missing definition hashes, timeout policies, or invalid attempts; zero duplicate event sequences. |
| 18 | Migration journal | 0303, 0304, and 0305 are applied in the local database. |
| 19 | Backfill dry run | Scanned 0 rows after the repair; no further metadata work required. |
| 20 | Legacy status compatibility | Target lifecycle code uses one canonical status field; legacy values remain compatibility inputs and are not silently rewritten. |
| 21 | Append-only event audit | Found and disabled the legacy fleet cleanup path that deleted `worker_job_events`; no in-scope delete remains. |
| 22 | Environment/deployment boundary | `.env` unchanged; no provider call, credit operation, Cloudflare deployment, or production cutover performed. |

## Final evidence

- Local database snapshot: 507 `worker_jobs`, 7,262 `worker_job_events`, 502 attempts, 0 unpublished/unquarantined outbox rows, and 0 dispatch rows requiring reconciliation.
- Orphan checks for attempts, events, outbox, and settlements: zero.
- `npm --workspace @smartspec/web run db:migrate`: passed/no error.
- `npm --workspace @smartspec/web run verify:feature-186`: passed with additive migration and `cloudflareProductionProof: false`.
- Static inventory reports 53 direct legacy transport call sites and no migrated wave; these remain an explicit adapter-by-adapter rollout gate.

## Explicit remaining gates

The audit does not claim completion of the 53 legacy producer migrations, production Cloudflare account/deployment proof, or full repository typecheck. Those are intentionally outside the active canary scope and remain recorded in the rollout manifest/runbook.
