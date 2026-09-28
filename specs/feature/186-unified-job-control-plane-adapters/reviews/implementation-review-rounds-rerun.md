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
- Static inventory reports 52 direct legacy transport call sites and no migrated wave; these remain an explicit adapter-by-adapter rollout gate.

## Explicit remaining gates

The audit does not claim completion of the 52 legacy producer migrations, production Cloudflare account/deployment proof, or full repository typecheck. Those are intentionally outside the active canary scope and remain recorded in the rollout manifest/runbook.

## Current workspace continuation — 2026-09-13

The additional audit rounds below were run after the prior 22-round ledger:

| Round | Verification dimension | Result / action |
|---:|---|---|
| 23 | Canonicalization and payload safety | Rechecked NFC key normalization, object validation, schedule/timezone validation, data-URL/query/private-path redaction, and focused regression coverage. |
| 24 | Lease and timeout semantics | Confirmed hard timeout starts from `startedAt`/`createdAt`, not queue time; stale lease writes remain fenced. |
| 25 | Cancellation crash recovery | Added and tested durable `CANCEL_REQUESTED` reconciliation after an interrupted finalization. |
| 26 | Retry/outbox recovery | Prevented operator-review and cancellation-request rows from automatic requeue; reused/reset the same outbox instead of creating a duplicate. |
| 27 | Kie staged references | Added bounded content-length/byte checks and resolved managed relative references before provider-boundary validation. |
| 28 | Kie WebP boundary | Forced WebP references through lossless PNG normalization before upload; invalid/oversized inputs fail closed. |
| 29 | Python provider regression | Focused Python suite passed 84 tests; targeted Ruff and `py_compile` passed. |
| 30 | Admin security | Rate-limited control-plane mutation and persisted operator requeue reason in audit/recovery events. |
| 31 | Direct transport inventory | Corrected comment false-positive; inventory now reports 52 real legacy call sites. |
| 32 | Rollout manifest | Enumerated all 52 legacy call sites in the manifest and verified BullMQ/Celery counts and empty migrated wave. |
| 33 | Final focused proof | Node suite passed 6 files / 79 tests; Feature 186 verifier, manifest consistency, journal JSON, and diff check passed. |

TypeScript typecheck was not rerun because the user explicitly limited RAM usage. The earlier attempt was interrupted without compiler output and is not counted as a pass. Legacy producer migration and Cloudflare/Hyperdrive deployment proof remain explicit rollout/external gates.

## Current continuation — 2026-09-13

The following ten rounds were rerun after the action/callback evidence closure,
scheduler/Python port additions, cross-spec order alignment, and executor test
repair. SocratiCode and sub-agent tooling were unavailable in this workspace;
the review was therefore performed by the main conductor with focused source,
test, migration, and diff evidence.

| Round | Verification dimension | Result / action |
|---:|---|---|
| 34 | Action/callback persistence closure | Found the implementation had durable action/callback behavior but no schema/migration tables. Added `worker_job_actions` and `worker_job_callbacks`, partial replay uniqueness, and migration `0307_feature_186_action_callback_evidence.sql`. |
| 35 | Parent deletion and audit evidence | Found Feature 186 child FKs still permitted cascade deletion of lifecycle evidence. Added the additive 0307 FK replacement block using `ON DELETE RESTRICT`; no table/row destructive operation was added. |
| 36 | Operator action idempotency | Found long reasons could compare differently after the persisted 500-character bound and requeue could prepare an action before state validation. Normalized comparison and validate `retry_scheduled` before action insertion. |
| 37 | Callback replay safety | Found callers could provide both provider event ID and replay key while only one was queried. Enforced exactly one replay identity, trimmed before lookup/persistence, and added rejection coverage. |
| 38 | Scheduler occurrence contract | Found schedule occurrence validation was spread across the adapter and did not expose a reusable timezone/window validator. Added `jobScheduler.ts` with deterministic timezone-aware keys, tenant checks, policy checks, and focused tests. |
| 39 | External wait/Python parity | Found the Python port lacked external-wait, resume, and callback evidence methods and the web route boundary lacked corresponding endpoints. Added the methods/routes while preserving lease fencing and callback evidence-only semantics. |
| 40 | Result/settlement safety | Found completion persisted raw output in the canonical result projection and did not emit a settlement lifecycle event. Redacted result output before persistence and added idempotent `SETTLEMENT_RECORDED` evidence. |
| 41 | Executor integration regression | The Feature 186 executor suite exposed a stale storage mock missing `assertR2StorageActive`. Added the one missing test double; the integration suite then passed without changing production behavior. |
| 42 | Full focused contract proof | Web Feature 186 suite passed 11 files / 67 tests; focused Python control-plane suite passed 5 tests; migration verifier returned additive/ok; Python compile, journal JSON, and `git diff --check` passed. |
| 43 | Migration/backfill and cross-spec order | `db:migrate` applied successfully; dry-run backfill was write-free and reported `scanned:1, updated:1`; the manifest now records schema 0307. Aligned the four-feature order in Features 186/187/188/189: 186 foundation → 189 identity/transfer → 187 preparation → 188 cutover. |
| 44 | Review projection completeness | Found the canonical row had `operatorReviewRequired` without its bounded reason field. Added `operatorReviewReason` to schema and follow-up migration 0308, clear it on authorized requeue, persist it for unknown/force-fail outcomes, and added migration plus result-redaction assertions. |
| 45 | Applied-migration integrity | The previous 0307 edit occurred after its journal hash was already applied, leaving the database without the new column. Restored 0307's applied shape and moved the column addition to new migration 0308; this preserves migration history and makes the fix rerunnable. |
| 46 | Final convergence proof | Reapplied migrations, verified `operatorReviewReason` and both evidence tables in PostgreSQL, reran 11 web files / 68 tests, Python 5 tests, verifier, dry-run backfill, 8/8 section check, journal JSON, inventory, and diff check. All focused gates pass; typecheck remains intentionally deferred. |

### Current evidence and remaining gates

- No type check was run in this continuation by explicit user instruction due to
  RAM constraints. Type checking remains a separate deferred gate.
- The static inventory still reports 52 direct legacy transport call sites and
  `migratedWave: []`; this is truthful incremental rollout state, not a claim
  that all producers are migrated.
- Cloudflare account capability, Hyperdrive origin/TLS/cache/pool evidence,
  production deployment, and live paid-provider recovery remain external gates.

## Local Cloudflare contract implementation — 2026-09-14

The user-requested local preparation was implemented without Cloudflare
credentials or target-account side effects. The following ten post-implementation
review rounds were run after the adapter contract was added; `FIXED` entries were
rechecked by the following focused gates.

| Round | Verification dimension | Result / action |
|---:|---|---|
| 01 | Canonical envelope and stable dispatch identity | PASS — envelopes carry canonical job/attempt/contract/outbox/dedupe data only; no tenant or business input authority crosses the binding. |
| 02 | Publication ambiguity and duplicate delivery | PASS — Queues remains unknown without evidence; Workflows/Containers use deterministic identities; Worker App has dedupe lookup recovery. |
| 03 | Secret, URL, payload-depth, and size safety | PASS — bounded JSON, allowlisted routing keys, forbidden secret keys and URL/data URI values are covered by tests. |
| 04 | Cron tenant authority | FIXED — moved expected tenant authority from request payload into the adapter constructor; mismatch regression test passes. |
| 05 | Capability routing | PASS — Containers are limited to long/cpu/gpu while all adapters enforce the supported contract version. |
| 06 | Transport cancellation and observations | PASS — optional provider cancellation uses retained references; adapters do not mutate canonical status. |
| 07 | Outbox/dispatch/event compatibility | FIXED — `DISPATCHED` event payload now includes provider, workflow, and container references; outbox and adapter tests pass. |
| 08 | Local readiness manifest completeness | FIXED — verifier now checks all five adapter class markers, required local evidence, and external-gate markers while keeping production proof false. |
| 09 | Call-site/migration ownership drift | PASS — direct BullMQ/Celery calls remain 0, unowned side-effecting producers remain 0, and legacy/compatibility counts are unchanged and explicit. |
| 10 | Integrated final local proof | PASS — 9 files / 64 focused tests, local readiness verifier, Feature 186 verifier, call-site audit, and `git diff --check` all pass. |

### Local Cloudflare contract evidence

- `apps/web/server/services/cloudflareJobAdapters.ts` provides injected
  contracts for Queues, Workflows, Containers, Cron, and Worker App plus a
  binding registry factory.
- `ops/feature-188/cloudflare-adapter-contract.yaml` records publication and
  ambiguity semantics without credentials or environment-specific bindings.
- `apps/web/scripts/verify-cloudflare-local-readiness.ts` reports local
  contract readiness separately from target-account/production proof.
- The Feature 186 verifier reports `cloudflareLocalContract.localContractReady:
  true` and continues to report `cloudflareProductionProof: false`.
- No Cloudflare deployment, Hyperdrive connection, provider call, `.env`
  mutation, production flag activation, or irreversible data operation was
  performed.
