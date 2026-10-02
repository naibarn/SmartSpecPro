# Redis / BullMQ / Celery Retirement Loop

## Objective

Move every active project Redis, BullMQ, and Celery responsibility to the canonical PostgreSQL `worker_jobs` + outbox / PostgreSQL state or an approved Cloudflare service. Retire project Docker services so PostgreSQL is the only project Docker service. Preserve unrelated worktree edits and do not restore abandoned Redis jobs.

## Execution boundaries

- Scope is repository-wide source, dependency, configuration, scheduled-work, and runtime inventory.
- Existing worktree was dirty across at least 255 paths before this task. Do not reset, stash, stage broadly, commit, or overwrite unrelated edits.
- Schema/migration changes are serial conductor-owned work. Existing migration `0367_postgres_rate_limit_events.sql` and `runtime_ephemeral_values` are present locally; production apply state is unknown and must be checked before claiming readiness.
- No Docker services are stopped until application callers have been migrated or explicitly retired. Redis task payload/state is abandoned per the user's prior cut-loss instruction; PostgreSQL product data must be preserved.
- Full TypeScript typecheck is prohibited by AGENTS.md. Focused tests/lint are authorized by the user's request to loop and verify.

## Initial evidence (2026-09-29)

- `systemctl is-active`: web/backend and Node job worker active; `smartspec-python-job-worker.service` inactive.
- `docker ps`: `smartspec-redis` healthy; `smartspec-celery-beat` healthy; `smartspec-celery-media` and `smartspec-celery-presentation` running but unhealthy. Redis `CLIENT LIST` returned 40 lines including the inspection command.
- `docker inspect` identifies Celery commands and a historical compose file `/home/dev/projects/SmartSpecPro/docker-compose.media.yml`, which is absent from the current checkout. Redis is sourced from `docker-compose.infra.yml`.
- Current source still contains direct Redis clients across web and Python APIs/services. No direct `bullmq` package/import was found in the scoped TypeScript runtime scan; app package still depends on `ioredis` and `redis`.
- `python-backend/app/services/job_control_plane.py::dispatch_python_task` creates canonical `worker_jobs` jobs under hard-cutover flags. Its runtime consumers and the Celery containers are not aligned.
- SocratiCode index was not available in this session; targeted `rg` and bounded file reads are the discovery fallback.

## Test design / evidence matrix

| Requirement | Observable behavior | Test/evidence | Residual boundary |
|---|---|---|---|
| No active web Redis state/queue calls | Production routes/services use SQL, `worker_jobs`, Cloudflare, or explicit fail-closed gates | Focused call-site tests and `rg` scan after each wave | Does not prove deployed old processes stopped |
| No active Python Redis state/queue calls | API/task/service semantics persist in PostgreSQL or approved Cloudflare service | Focused pytest suites and source scan after each wave | Does not prove provider/production state |
| New Python worker is executable | `worker_jobs` Python jobs are claimed, fenced, settled by the PostgreSQL pull worker | Worker tests and startup/runtime health evidence | Current service is inactive; production activation is separate |
| Redis/BullMQ/Celery dependencies removed | No active package/runtime/compose/service/env dependency remains | Manifest/config scans plus focused build/import checks | GlitchTip's own Celery worker is third-party and out of project scope |
| Docker target contains PostgreSQL only | Project compose definitions and runtime containers list only PostgreSQL | Compose config validation and `docker ps` | Existing stack has a deleted historical compose path; external cleanup may be required |
| User-approved legacy job cut-loss | Old Redis jobs are not imported/replayed; PostgreSQL state and credits stay intact | Static migration review; no Redis data deletion | Runtime queues may still contain old side effects; providers must not be blindly replayed |

## Loop ledger

Rounds 1-10 are required. Each round records: scan surface, concrete findings, fixes, fresh verification, and whether it is clean or creates a next round. The final round must have no active or unclassified project-owned Redis/BullMQ/Celery caller or Docker service.

### Round 1 — baseline runtime/source inventory

- Findings: active Redis and Celery containers; Python pull worker inactive; numerous direct Python Redis API/service uses; residual web Redis calls; Redis dependencies remain in manifests/Compose.
- Fixes: none yet; inventory/impact boundary only.
- Status: findings confirmed; continue to classify every call site before implementation.

### Round 2 — Python OAuth, Telegram linking, and alert dedupe

- Findings: Meta OAuth authorization state was stored in Redis and callback performed a separate read then delete. Telegram's web producer already writes hashed verification rows to `telegram_link_tokens`, while its Python webhook still read Redis, making the producer/consumer stores incompatible. The Telegram endpoint also used synchronous SQLAlchemy calls against the async database dependency. Admin alert dedupe used Redis check-then-set and could race across replicas.
- Fixes: introduced PostgreSQL atomic `take_value()` for one-time OAuth state; moved Meta OAuth to shared PostgreSQL TTL storage; changed Telegram to consume the same hashed PostgreSQL verification row atomically, use PostgreSQL sliding-window rate limiting, and await `AsyncSession`; changed admin alert dedupe to atomic PostgreSQL TTL claims with retry release if email delivery returns zero.
- Verification: Meta OAuth + ephemeral-store focused tests pass (9 passed) under the Python venv; first run exposed test-double transaction setup and was corrected. `ruff` found style warnings in touched modules; targeted auto-fix/recheck is pending. Telegram focused endpoint tests are not yet present. Current production DB migration application is still unverified.
- Status: the three direct Python feature call paths are removed, but full Python/web Redis callers and queue runtimes remain; continue.

### Round 3 — approvals and expired-interrupt cleanup

- Findings: approval expiration task still scanned Redis `PendingInterruptTracker` and attempted to recompile/resume the retired LangGraph `/workflows` engine; approval response also tried to delete the Redis projection after a database decision.
- Fixes: expiration now only marks durable approval rows terminal through the database service; removed the Redis interrupt scan/resume path and best-effort tracker cleanup. This keeps approval rows as the durable source and avoids routing work through the retired workflow engine.
- Verification: added a focused database-only expiration test; reran the related focused suite (13 passed before the health-check wave). Static scan is clean for the changed approval/OAuth/Telegram/alert files. Python worker task still needs active runtime proof.
- Status: this legacy Redis workflow projection is removed; continue.

### Round 4 — health and runtime readiness surfaces

- Findings: Python liveness/health code still imported Redis directly and treated its outage as a whole-system degraded/critical signal. The admin infrastructure panel exposed Redis memory as a runtime dependency.
- Fixes: health surfaces now report PostgreSQL `worker_jobs` availability/count instead of Redis; removed Redis health imports and renamed the admin panel indicator to Worker jobs.
- Verification: focused API health tests and migration tests are in progress. Broader health-service fixture currently fails before test execution because the existing SQLite test fixture cannot compile PostgreSQL JSONB models; that fixture limitation predates this change. Targeted `ruff` still reports whitespace-only legacy lines in these two health files; functional/import errors found in touched surface were addressed.
- Status: health checks no longer use Redis; proceed to active worker/cache callers.

### Round 5 — Playwright selector cache

- Findings: the active automation selector cache was Redis-backed even though the web automation node instantiated it without a Redis client, so the code path was already inconsistent.
- Fixes: moved selector JSON snapshots to the shared PostgreSQL TTL table; retained tenant/url/goal key isolation and seven-day expiry. Updated cache unit coverage to assert TTL and tenant isolation through the PostgreSQL adapter.
- Verification: selector cache and dependent browser automation tests pass in the focused suite; Python compilation and Ruff pass.
- Status: this cache caller no longer imports or calls Redis; continue.

### Round 6 — Automation Copilot job status and cancellation

- Findings: Automation Copilot already dispatched and read status through `worker_jobs`, but Python tasks still imported Redis, opened clients, retained dead Redis status fallbacks, and had a Redis-only credit reconciliation sweep. API status/cancel endpoints also kept unreachable Redis branches behind constant-true cutover conditions.
- Fixes: removed Redis task-status fallbacks and clients, removed the stale Redis credit-reconciliation sweep/export, and made API status/cancel use only canonical job status and cancellation. Kept the active worker registry task executors.
- Verification: focused selector, self-healing, Automation Copilot task/API tests pass (31 passed); Python compileall and Ruff pass.
- Status: status API and executor path are Redis-free; browser cancellation/policy coordination still needs another dedicated runtime check and remains in the next round.

### Round 7 — browser policy counters and active cancellation

- Findings: SelfHealingExecutor used Redis for browser-policy counters and polled Redis cancellation on every action. Cancellation is already written to the canonical worker job by the API.
- Fixes: policy counters now use atomic PostgreSQL JSONB TTL field increments; cancellation polls canonical `worker_jobs.status` from the active fenced execution context. Added tests that prove cancellation is checked between actions and policy counter projections persist through the PostgreSQL adapter.
- Verification: included in the 31-pass focused automation test run; Python compileall and Ruff pass. Live PostgreSQL cancellation roundtrip still needs deployment/runtime proof.
- Status: no Redis call remains in Python Automation Copilot or SelfHealingExecutor source; continue.

### Round 8 — library reindex and cloud-drive enqueue fallback

- Findings: Admin/internal library reindex endpoints kept full Redis/Celery status/metadata paths after a constant-true PostgreSQL branch; Google Drive and OneDrive performed a Redis NX lock before dispatch even though dispatch already requires a canonical worker-job idempotency key.
- Fixes: removed the unreachable Redis branches and Redis-only batch metadata helpers; reindex enqueue/status now use `worker_jobs` only. Removed redundant Drive/OneDrive Redis locks and updated comments to identify PostgreSQL worker dispatch.
- Verification: internal-library and Feature 186 vector scheduling focused tests pass (7 passed); touched Python files pass focused undefined-name Ruff check. Broader Ruff on these legacy API files reports hundreds of pre-existing style/import diagnostics, so no mass formatting was applied.
- Status: those endpoints no longer import or call Redis; continue with live ephemeral state.

### Round 9 — MCP OAuth and Vision feature flag

- Findings: MCP OAuth stored PKCE state under two Redis keys and consumed them with separate reads/deletes; Vision accepted work only when a Redis feature-flag key was present even though current feature flags are stored in PostgreSQL.
- Fixes: MCP OAuth now stores one 10-minute PostgreSQL ephemeral row and atomically consumes it with `take_value`; Vision reads tenant then global PostgreSQL flag rows and fails closed on database errors. Updated Vision tests to mock canonical worker-job dispatch and PostgreSQL feature flags.
- Verification: MCP OAuth focused tests pass (10 passed); Vision feature-flag, API, and integration tests pass after updating stale Celery/Redis expectations (combined with social webhook tests, 24 passed). Focused Ruff undefined-name check passes.
- Status: those two Python paths no longer reference Redis; continue.

### Round 10 — social webhook stream orphan

- Findings: a Python Redis Streams consumer existed without a startup registration or any producer in application source; the only matching producer was a stale test expectation. The webhook task already persists normalized messages and raw-event status in PostgreSQL.
- Fixes: removed the unreferenced Redis-only stream listener and updated the webhook regression test to assert persisted PostgreSQL normalization without Redis arguments.
- Verification: included in the 24-pass Vision/social focused suite; no `social:stream` runtime caller remains under `python-backend/app`.
- Status: rounds 1-10 completed; repository-wide active Redis/Celery callers and Docker declarations remain, so continue to the next wave.

### Round 11 — retire Redis administration and status surfaces

- Findings: the admin Infrastructure page still exposed Redis provider credentials, probes, health, and restart guidance even though rate/cache/queue paths are being cut over. Queue pages and the queue router still reported Redis connection as system status. Auto-draft progress writes had no readers and its Redis lock duplicated the PostgreSQL concurrent-slot service.
- Fixes: removed Redis admin tRPC procedures and Redis configuration panel; retained Cloudflare KV Search Cache probe/toggle in a dedicated Cache tab; removed Redis status cards and Redis readiness semantics from queue APIs/pages; removed Redis scale-tier knobs; auto-draft now uses PostgreSQL concurrent slots and no longer persists unused Redis progress.
- Verification: Python monitoring suite 31 passed. Auto-draft unit/integration + scaleTier focused Vitest suites passed 40 tests. AdminOverviewDashboard suite has one unrelated pre-existing failure: it expects retired Workpack Access UI (1 failed). ESLint CLI could not run because the invoked global ESLint 6.4.0 found no config; focused syntax/runtime tests pass. `git diff --check` passed for changed paths.
- Status: Redis is gone from these administration/status surfaces and auto-draft lock. Other direct runtime Redis clients, Python browser/MCP remnants, realtime stream, scheduler/compose, dependencies, and deployed Docker containers remain. Continue.

### Round 12 — media credit reconciliation

- Findings: generic media credit reconciliation used Redis as a 24-hour duplicate marker even though all mutations already use stable PostgreSQL credit-ledger idempotency keys; successful skill settlement is keyed by run ID and serialized in a database transaction.
- Fixes: removed the Redis pre-check/write marker. Retries now reach the durable idempotent ledger/settlement owner directly; updated the regression to call reconciliation twice and assert the same ledger key is passed on each retry.
- Verification: `creditReconciliation.test.ts` passes (18/18). A combined run also exposed two stale Hermes adapter tests relying on the removed Redis dependency-injection seam; those test fixtures are scheduled for a separate correction.
- Status: generic media reconciliation no longer has a Redis caller. Hermes fee reconciliation already stores state in PostgreSQL; proceed to active remaining service callers.

### Round 13 — hybrid orchestration temporary state

- Findings: the chat Hybrid Orchestration UI has a live tRPC caller; preview tokens and execution state were stored through Redis.
- Fixes: moved preview and execution TTL records to the existing PostgreSQL `runtime_ephemeral_values` store under isolated namespaces. Updated the service tests to use the PostgreSQL adapter seam.
- Verification: focused Hybrid Orchestration and media credit reconciliation tests pass (24/24); no migration needed.
- Status: hybrid runtime no longer imports Redis. Continue with event streaming, storyboard transcription, and remaining candidate audit.

### Round 14 — orphan Redis APIs and Python browser/MCP controls

- Findings: the Redis semaphore module had no production imports; an Agency conversation-starter Redis cache had no consumers and belongs to the retired Agency surface; `redisEphemeralKeyRegistry` had no consumers. Python BrowserSession carried an unused Redis semaphore class/constructor parameter while browser admission is performed in the Node/PostgreSQL layer. MCP limiter code still exposed an uncalled Redis adapter despite an existing PostgreSQL sliding-window implementation.
- Fixes: removed those three orphan Redis-only service modules and their obsolete test files; removed the unused Python browser Redis semaphore API; migrated MCP run/tenant limiter helpers to the shared PostgreSQL rate-limit store and made tenant disable cleanup unnecessary because records expire.
- Verification: Node focused suites passed 70/70 after updating Hermes adapter tests to mock its current PostgreSQL ephemeral-store seam. Python MCP adapter smoke passed. Python focused browser pytest had 13 pre-existing failures tied to retired Agency and isolated-browser dispatcher behavior; Ruff found pre-existing style diagnostics, while unused imports introduced/exposed by this cleanup were removed.
- Status: orphan Redis API count is reduced. Remaining direct runtime Redis code is the orchestrator SSE bus and the gated legacy storyboard transcription state/worker; Redis-dependent custom `/workflows` executor modules are also present under the explicitly retired engine. Continue; dependency manifests, Compose, and Docker runtime still remain.

### Round 15 — orchestrator realtime stream

- Findings: the active run/team/user SSE routes subscribed to Redis pub/sub; existing `agent_activity_events` already provides tenant/team/run scoped durable storage and resume IDs.
- Fixes: `publishEvent` now persists the original realtime envelope into the existing event log, and SSE routes poll that log with tenant/scope filters and a `(createdAt,id)` resume cursor. User streams now also require tenant context. No new table or queue introduced.
- Verification: orchestrator event bus plus run-engine migration suites pass (14/14); the SSE route imports successfully with a local-only dummy JWT secret. No production credentials were read.
- Status: orchestrator event delivery no longer needs Redis. Re-scan direct callers; storyboard legacy worker, Python retired-workflow executor files, package/Compose/runtime remnants still require classification.

### Round 16 — gated Storyboard detached job and seed flag

- Findings: Storyboard Review's Redis-backed detached job service had no active submit path because the mutation hard-fails until a canonical Cloudflare transcription job exists; only the UI's poll endpoint and the standalone CLI referenced that stale job store. The GPT-5.4 seed script still wrote its default feature flag to Redis.
- Fixes: removed the unreachable Redis job service/CLI/launcher and made the old poll route fail closed with the same canonical-dispatch precondition. Kept inline transcription unchanged. The feature-flag seed now writes the default to `runtime_feature_flags` in PostgreSQL.
- Verification: source call-site scan confirms no production importer for the deleted detached worker. Final focused cross-surface Vitest pass is 5 files / 84 tests; orchestrator/router module imports pass with a local-only dummy JWT secret; the seed script transpiles successfully without running its DB side effect.
- Status: web runtime call sites no longer directly import Redis except test fixtures/migration utilities; proceed with Python legacy-workflow retirement and dependency/Compose inventory.

### Round 17 — retire Redis quota migration harness

- Findings: API-key quota runtime is PostgreSQL-backed, but an obsolete Spec 245 migration script and gated multiprocess test still imported Redis solely to replay/rollback Redis quota counters. A separate PostgreSQL API-key quota integration suite remains.
- Fixes: removed the one-off Redis quota importer and its Redis-only multiprocess fixture/test. No API-key quota runtime code was changed.
- Verification: source-reference scan found no remaining callers to those deleted paths. PostgreSQL quota integration coverage remains in `apiKeyQuotaService.integration.test.ts`.
- Status: Redis migration utilities that affect correctness-critical authentication/revocation state remain intentionally classified as one-time tools pending runtime/state verification; they do not act as queue or web request callers. Continue.

### Round 18 — remove Celery queue metadata from Python job registry

- Findings: Python task functions use `job_task_registry`, a callable metadata registry explicitly documented as having no broker/scheduler/result backend, but three task decorators still carried ignored `queue="celery"`/`queue="media"` metadata and comments described Celery Beat.
- Fixes: removed ignored queue labels and corrected reindex/maintenance task wording to identify PostgreSQL worker-job scheduling.
- Verification: Automation Copilot task tests pass (2/2). The combined Python task-registration test fails on a stale expectation for retired `app.tasks.workflow_tasks.check_scheduled_workflows`; it does not assert the changed task decorators.
- Status: these Python task registrations no longer name a Celery queue. Active Celery containers and project Compose definitions still remain; continue runtime/config audit.

### Round 19 — retire Redis-backed legacy workflow nodes

- Findings: five Python executor modules opened Redis for rate-limit, circuit-breaker, idempotency, dead-letter, and metrics state. Their only registry exposure was through the retired custom workflow node catalog; they are not the canonical `worker_jobs` executor registry.
- Fixes: removed those executor modules and their package exports. The retired node registry now omits those six legacy types, including its `run_history` DLQ stub, so persisted legacy workflows cannot resolve to removed Redis executors.
- Verification: focused NodeRegistry tests pass (7/7), including assertions that the retired Redis node types are absent; focused Ruff undefined-name/import check passed after removing a newly exposed unused import.
- Status: Python app source no longer imports redis package directly. Python `redis` requirement, Celery compatibility metadata/services, Compose definitions, and deployed containers remain to classify/cut over.
