# Redis Retirement Continuation — 2026-10-03

## Goal

Continue the user-authorized Redis/Celery retirement and restore the backend service to usable health, without losing PostgreSQL data, unprocessed jobs, or unrelated worktree changes.

## Evidence ledger

- source: production `journalctl` and `systemctl` via `sudo -n`
- identifier: `smartspec-backend.service`, invocation `42d8002d091c4a469eafd042c7671731`
- observed failure: `ImportError: cannot import name 'HybridRuntimeStageRequest' from app.services.openai_agents_contracts`
- data state: backend startup recovered; all four application services are active; web readiness reports Redis is not required
- confidence: high for backend startup root cause and current local health
- JTI data gate: dry-run found 50 active revocations; before import, 11 were absent from PostgreSQL; guarded apply imported 50 idempotently; read-only parity now confirms 50/50 active source records in PostgreSQL
- G2 state gate: read-only audit found zero device authorization, runner/worker pairing, login-failure, and lockout state
- login-counter gate: read-only dry-run found zero active counters
- deployment boundary: current source has no Redis client imports in `apps/web/server` runtime modules; node-redis remains a development-only dependency for one-time audit/migration scripts
- remaining runtime state: active Redis is absent from the current infra Compose file and is an orphaned container from an older config. It still serves GlitchTip on DB 5 and legacy Celery clients on DB 0. DB0 `celery` has 18 queued messages; DB5 `vt:q:ingest` exceeds 512,000 entries and continues growing. Redis uses 2.98 GiB of its 3 GiB limit with `noeviction`. Celery media/presentation containers are unhealthy; Beat is healthy; their old media Compose file is absent from this checkout.
- legacy task audit: DB0's 18 queued messages all identify `app.tasks.system_health_task.monitor_system_health`; `media` and `presentation_export` queues are empty and no unacked messages were found. The user authorized discarding these stale system jobs; the doctor, Beat, and workers are now disabled/stopped and DB0 state was flushed.
- GlitchTip root cause: worker started at `2026-09-25T23:22:04.485Z`, seven seconds before Redis (`23:22:11.455Z`), and logged `Temporary failure in name resolution` for `smartspec-redis:6379`. `django-vtasks` 1.0.3 calls backend `_rescue_tasks()` before its retrying consumer loop; the error terminates the worker task while the management command continues waiting on a separate stop event. The process looked running with 0% CPU but never consumed the queue, while GlitchTip web continued pushing events. Effective backend/URL were `ValkeyTaskBackend` and `smartspec-redis:6379/5`; current DNS/TCP reachability after Redis startup worked. Queue reached 512,807 before ingress was stopped.
- backup/restore gate: created a permission-restricted pre-isolation snapshot at `orchestra/backups/smartspec-redis/backup-20261002-202800Z-redis-full-pre-isolation.rdb` (2,870,728,997 bytes; mode 0600; SHA-256 `c5b43543cc3fed1d9caf4c410f54cff0c027739c18b6b46677a53633fbadb110`). Restored it in a temporary isolated Redis container with persistence disabled; Redis loaded 10,910 keys, DB0 had 10,888 keys and DB5 had 8 keys, and DB5 `vt:q:ingest` length was 512,626. Removed only the temporary restore container after verification. Snapshot is local-only and does not prove off-host durability.
- setup script correction: Docker healthcheck probes `/`, while `scripts/setup-glitchtip.sh` previously probed `/api/0/health/` (404). The setup script now probes `/` to match the verified container healthcheck.
- recurrence prevention: worker Compose command waits for a successful Valkey `PING` using the configured `REDIS_URL` (host, auth, and DB) before running `run-worker.sh --scheduler`. Setup script refuses to start GlitchTip when its required Redis container is stopped or not responding.
- user disposition: confirmed no user-ordered work is pending and authorized discarding all queued work without migration; later directed that root-cause work proceed without further confirmation, including GlitchTip telemetry disposition.
- retirement action: disabled/stopped Celery doctor, Beat, media, and presentation containers; stopped GlitchTip web/worker; set all restart policies to `no`; verified no non-local Redis clients remained; flushed DB0 and DB5; saved an empty RDB and passed `redis-check-rdb` with zero keys; stopped Redis. The pre-discard RDB backup remains separately available.
- source inventory: no direct node-redis imports or `createClient()` calls remain in `apps/web/server` runtime TypeScript; only one-time migration scripts use Redis. Runtime ephemeral state and canonical job execution use PostgreSQL.

## Plan completed

1. Restore the missing Python Hybrid request/result contract and align its Node Zod contract; complete focused Python/Node tests and health checks.
2. Remove Redis from SmartSpecPro production dependencies/runtime, import active JTI revocations into PostgreSQL, and confirm Redis is not required for web readiness.
3. Audit Redis clients and queues; with user authorization to discard all pending work and not migrate, stop GlitchTip and Celery consumers, disable restart paths, clear DB0/DB5, persist an empty RDB, then stop Redis.
4. Prevent recurrence if GlitchTip is explicitly re-enabled by waiting for a successful configured Valkey PING before its worker starts; make setup fail closed when Redis is unavailable.

## Lifecycle

Current stage: Final Verify
Resume from: none; Redis runtime retirement complete
Stop reason: complete for current application/runtime scope; GlitchTip observability intentionally offline after authorized telemetry discard.

| Stage | Status | Evidence / next action |
|---|---|---|
| Planning | COMPLETE | Root cause and retirement boundary recorded |
| TDD/Test Design | COMPLETE | Contract schema acceptance and strictness cases added before implementation |
| Implement | COMPLETE | Backend startup contract repaired; Redis production dependency and application startup wiring removed |
| Verify | COMPLETE | 54 Python tests, 27 Telegram tests, fresh service health/readiness, and live revocation parity verified |
| Debug/Fix | COMPLETE | Fixed missing Hybrid contract import and strict Node result-schema mismatch |
| Review | COMPLETE | Application Redis callers are absent; GlitchTip and legacy Celery consumers are stopped; all Redis clients were gone before DB0/DB5 cleanup |
| Final Verify | COMPLETE | Empty RDB was saved/checked; Redis and dependent containers are stopped with restart disabled; all four application services pass health/readiness |

## Gaps

- GAP-1 — CLOSED / HIGH: Backend import failure repaired; all required local application services are active and health/readiness probes pass.
- GAP-2 — CLOSED / HIGH: All 50 active JTI revocations were imported and reconciled into PostgreSQL; G2 audit and login-counter audit are empty.
- GAP-3 — CLOSED / HIGH for current runtime: GlitchTip and legacy Celery were stopped after authorization to discard queues without migration; DB0 and DB5 were flushed after confirming there were no non-local clients; Redis was saved at zero keys and stopped with restart disabled. GlitchTip monitoring/ingestion is offline until reconfigured with an approved Redis backend.
- GAP-4 — CLOSED / MEDIUM: `pnpm-lock.yaml` importer and npm lock metadata match the development-only `redis` dependency; no full typecheck was run due the repository RAM restriction.

## Worktree boundaries

- Main checkout has unrelated user-owned edit `python-backend/app/api/approvals.py`; preserve it and do not stage it.
- All task changes remain uncommitted on divergent `main`; do not force-push or overwrite remote history.
- JTI import was additive/idempotent and ran with the web auth service paused; application health was rechecked after automatic service restoration.
- Redis DB0/DB5 were cleared only after queue ownership review and user authorization; PostgreSQL product state and the pre-discard RDB backup were preserved.

## Gap closure triage

- must_do_now: none; SmartSpecPro readiness is PostgreSQL-backed and all scanned active auth revocations reconcile.
- should_offer_next: none.
- safely_deferred: removing the stopped Redis container and named volume; runtime is off and the volume holds only an empty RDB, while the pre-discard snapshot remains available for recovery.
- no_action_needed: keep Redis development-only for guarded migration/audit scripts; production application modules no longer import it.

## Loop policy final

- iterations_used: unknown/12 (continuation crossed prior context compaction)
- tool_call_batches_used: unknown/30 (exact host accounting unavailable)
- estimated_cost_usd: unknown/0.50; local shell, tests, and read-only audits only
- dispatch_waves_used: 1/6; three read-only agents audited GlitchTip, Celery queues, and container ownership and were closed
- repair_rounds_used: 1/5
- timed_out_subagents: none
- stop_reason: completed (SmartSpecPro no longer depends on Redis; GlitchTip monitoring is offline)
