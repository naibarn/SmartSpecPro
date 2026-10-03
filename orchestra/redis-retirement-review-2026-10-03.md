# Redis Retirement Review — 2026-10-03

## Review round 1 — code and contract

- Checked the Python Hybrid request/result contract against the Node runtime contract and the focused regression tests.
- Confirmed current SmartSpecPro runtime modules do not import node-redis or instantiate Redis clients; PostgreSQL is used for worker jobs, ephemeral values, and JTI revocation checks.
- Confirmed `redis` is dev-only in `apps/web/package.json`, both npm package locks, and the pnpm importer.
- Focused Python tests: 54 passed. Telegram service tests: 27 passed. Ruff, lock metadata parse, service health/readiness, and `git diff --check` passed.
- Result: no code-path finding remaining in SmartSpecPro runtime scope.

## Review round 2 — live runtime and data boundary

- Reconciled Redis source and PostgreSQL destination: all 50 active source JTI revocations match PostgreSQL after the guarded import; G2 auth-state and login-failure counter audits are empty.
- Confirmed backend, web, Node worker, and Python worker are active; backend health is healthy and web readiness reports `redis:not_required` and `feature186:ok:postgres-pull`.
- Container inspection found current Redis is an orphan from an older infra Compose definition. DB0 `celery` contains 18 `monitor_system_health` messages, with media/presentation queues empty and no unacked messages. Beat is healthy; media/presentation workers are unhealthy. The old media Compose file is absent.
- GlitchTip DB5 `vt:q:ingest` contains more than 512,000 entries and grows; Redis uses 2.98 GiB of its 3 GiB `noeviction` limit. GlitchTip web is healthy and the worker is active. Its worker banner's localhost broker string is a display fallback; the configured Valkey backend uses the environment URL.
- A 2,870,728,997-byte RDB snapshot was restored in a temporary isolated container. Restore reported 10,910 loaded keys, with DB0 10,888 keys and DB5 8 keys; restored `vt:q:ingest` length was 512,626. The temporary restore container was removed; source Redis/volume were untouched. Snapshot SHA-256: `c5b43543cc3fed1d9caf4c410f54cff0c027739c18b6b46677a53633fbadb110`.
- At the time of this audit, stopping shared Redis would interrupt GlitchTip and legacy Celery; queue/scheduler ownership and pending work were not yet retired, and no source container or Redis key had been deleted/stopped.
- After user authorization to discard stale system work and proceed without further confirmation, stopped Celery's doctor/Beat/workers and GlitchTip web/worker, disabled restart policies, flushed DB0 and DB5, saved/validated a zero-key RDB, and stopped Redis. The four SmartSpecPro application services remain healthy.

## Authorized Celery discard

- The user confirmed there is no pending user-ordered work and authorized discarding stale work without migration.
- The queued DB0 work was verified as 18 scheduled `monitor_system_health` tasks, not user tasks. Disabled the Celery self-healing doctor, disabled restart policies, gracefully stopped Beat/media/presentation, then deleted only the DB0 `celery` list. Verified LLEN is 0 and the SmartSpecPro app services stayed active.
- DB5 is GlitchTip error-event telemetry, not user-ordered work. The user directed us to proceed without more confirmation, so GlitchTip web/worker were stopped and telemetry discarded.
- Root cause was a startup race: GlitchTip worker started seven seconds before Redis and logged DNS failure at `smartspec-redis:6379`. The initial task-rescue call is outside django-vtasks' retrying consumer loop, and the command does not supervise that worker task, leaving an apparently live but idle process while GlitchTip web kept enqueuing events.
- Added a startup Valkey `PING` loop using the configured `REDIS_URL` before `run-worker.sh`; setup now fails early if required Redis is stopped or not responding.
- Verified there were no non-local Redis clients before flush. DB0 and DB5 were flushed, BGSAVE completed, `redis-check-rdb` validated a zero-key dump, then Redis was stopped with restart disabled.

## Safe fix found

- `scripts/setup-glitchtip.sh` previously called `/api/0/health/`, which returned 404 while the container healthcheck probes `/` successfully. Updated the setup script to probe `/`, matching the verified container healthcheck.

## Final gate

- TypeScript full typecheck: skipped, prohibited by repository `AGENTS.md` RAM policy.
- User-owned unrelated change preserved: `python-backend/app/api/approvals.py`.
- Branch integration: not attempted; `main` is divergent from `origin/main`, and no commit/push is part of this continuation request.
- Resume at: none; runtime retirement and verification are complete.
