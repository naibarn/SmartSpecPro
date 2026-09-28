# Feature 186 Research

## Research decision

- Codebase research: required because this is an existing git repository with a Drizzle/PostgreSQL web service, a Python/FastAPI/Celery backend, Worker Runtime routes, and multiple queue implementations.
- SocratiCode: attempted by policy but the `codebase_*` MCP tools are not available in this session; targeted `rg`, `find`, and line-range reads were used as the fallback.
- Web research: the original spec already contains official Cloudflare references. No new provider-specific design is needed for the first implementation; provider behavior must be revalidated during deployment.
- Testing: web uses Vitest with `apps/web/vitest.config.ts`; Python uses pytest with an 80% coverage gate in `python-backend/pyproject.toml`.

## Existing architecture findings

### PostgreSQL and schema

- Canonical tables already exist in `apps/web/drizzle/schema.ts` as `workerJobs` and `workerJobEvents`.
- `worker_jobs` currently uses the `worker_job_status` enum with legacy values (`queued`, `claimed`, `preparing`, `running`, `uploading`, `publishing`, `indexing`, `completed`, `failed`, `canceled`, `expired`). It already has tenant scope, worker binding, JSON input/output, timeout/retry policy, idempotency key, lease token, lease expiry, and lifecycle timestamps.
- `worker_job_events` currently has `eventType`, `assignmentId`, `sequence`, JSON payload, and timestamps. Assignment sequence uniqueness must not be overloaded for lifecycle ordering.
- The latest recorded Drizzle migration is `0302_qwen_image_3_media_models`; Feature 186 must use the next migration number and preserve the existing journal convention.
- Existing artifact/delegation tables reference `worker_jobs.id`, so the canonical ID must remain stable and schema changes must preserve those foreign keys.

### Existing web consumers

- `apps/web/server/routers/workerJobs.ts` and `workerJobMonitorService.ts` expose user-scoped list/detail/cancel behavior and currently read legacy statuses.
- `apps/web/server/routes/workerRuntime.ts` and `workerSeriesControlPlane.ts` perform worker-facing reads/writes and create jobs directly. These are compatibility call sites that need an adapter boundary before their wave can be marked migrated.
- `workerStallWatchdogService.ts` has independent legacy reassignment/requeue logic. The new reconciler must coexist during migration and avoid double recovery ownership.
- Existing queue services include BullMQ in media/notification/vertical-drama paths and Cloud Tasks in LLM/scheduler paths. Queue metrics are observations and must not become canonical job state.

### Python/Celery

- `python-backend/app/core/celery_app.py` configures Redis broker/backend, late acknowledgements, prefetch, time limits, queue routing, and a large Beat schedule.
- Celery tasks live under `python-backend/app/tasks` and `app/workers`; tests already mock Celery task IDs and broker failures.
- Celery and Redis dependencies are available through `requirements.txt`/`requirements-celery.txt`, but the Python service does not currently expose a unified job persistence port. The implementation should add a small HTTP client/port and thin wrapper helpers without rewriting every task in the first migration.

### Testing and delivery constraints

- Tests must be focused because the worktree is intentionally dirty and repository-wide checks are baseline-noisy.
- Database integration tests are opt-in in the web package and use a separate test database by default.
- Python migration tests are colocated under `python-backend/tests/unit/migrations`.
- `.env` must not be edited. Local database migration execution requires a backup and explicit evidence of the target database; code and migration artifacts can be prepared without mutating live data.

## Implementation implications

1. Add the control-plane service and adapter contracts in `apps/web/server/services` with dependency-injected repositories so concurrency and failure behavior can be tested without Redis.
2. Add Drizzle schema fields/tables and one additive migration. Do not remove legacy enum values or rewrite existing job rows in the first expand step.
3. Add an idempotent backfill/verification command that maps existing rows to canonical metadata without guessing legacy identity. It must run in batches, support dry-run, record counts, and fail closed on ambiguous rows.
4. Add BullMQ and Celery transport adapters as thin publishers/inspectors; migrate only explicit low-risk entry points behind the new port and leave an inventory for later waves.
5. Extend monitor APIs with canonical state/event data and guarded actions, preserving legacy response aliases for existing consumers.
6. Add focused Vitest and pytest coverage for canonicalization, guarded transitions, outbox publication, duplicate delivery, lease fencing, migration backfill, and adapter contracts.
