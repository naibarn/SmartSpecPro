# Redisless Cutover Implementation Ledger

## User directive

Migrate active code paths from Redis/BullMQ/Celery to the existing canonical architecture now. Old queue work may be abandoned; do not migrate or replay old queue records. Preserve correctness for new work, authentication, rate limits, idempotency, and event delivery. Do not claim old security/session state is equivalent to queue backlog.

## Discovery

- Targeted runtime scan finds 63 source files importing/calling Redis client APIs, excluding test files. A broader scan also finds 83 runtime files across Redis and queue-related APIs; counts are candidate signals, not a complete ownership ledger.
- No direct BullMQ import remains in `apps/web/server`; several API names are compatibility/no-op surfaces. Node job families still use Redis for projections, status, dedupe, active pointers, or orphan scans after canonical `worker_jobs` admission.
- Python Celery task decorators and retry calls remain active. PostgreSQL admission exists via `app.services.job_control_plane.dispatch_python_task`; `postgres_job_worker` is the target worker, but task import registration and Beat schedule ownership remain incomplete.
- Non-queue Redis families include cache, auth/pairing ephemeral state, atomic rate limits/locks/idempotency, and pub/sub. They need distinct replacements; Redis removal cannot be a blind import deletion.
- Worktree is already dirty. Preserve all existing edits. Python files assigned in Wave 1 already contain active Spec 245 changes and require careful in-place integration.

## Wave 1 ownership contract

### Shared invariants

1. New long-running work is admitted only through canonical `worker_jobs` plus outbox and the PostgreSQL-pull worker.
2. No new work is submitted to Redis, BullMQ, or Celery.
3. Old queue records are not recovered, imported, replayed, or treated as a cutover prerequisite.
4. New-work dedupe, tenant ownership, status/progress/result visibility, cancellation, retry, and terminal notification semantics must remain correct using canonical storage.
5. Do not add a competing queue/state ledger, schema migration, or compatibility fallback without conductor review.
6. Preserve user-owned dirty hunks; inspect `git diff` before editing any dirty file.

### Writer boundaries

| Agent | Owned paths | Scope | Focused proof |
|---|---|---|---|
| Node job-family implementer | `apps/web/server/services/verticalDramaStoryJobs.ts`, `verticalDramaInteractiveJobs.ts`, `verticalDramaEpisodeStageJobs.ts`, `verticalDramaDraftCompositionJobs.ts`, `verticalDramaDraftQualityQcJobs.ts`, `verticalDramaShotPromptJobs.ts`, `verticalDramaShotVideoPromptJobs.ts`, `verticalDramaCharacterPromptJobs.ts`, `videoIntelligenceJobs.ts`, `jobExecutorRegistry.ts`; matching `apps/web/server/services/__tests__/*Jobs.test.ts`; only directly-required router bridge tests | Remove active Redis job status/projection/dedupe/orphan ownership in favor of `worker_jobs`; keep compatibility surfaces only where non-runtime callers require them | Focused Vitest suites for the owned job families; no root typecheck |
| Python media implementer | `python-backend/app/tasks/media_tasks.py`; directly matching media/Kie task tests only | Remove Celery queue/retry dispatch from media paths; use canonical Python job admission and worker-owned retry/lifecycle; inspect and preserve current dirty Spec 245 edits first | Focused pytest for touched media dispatch/retry behavior plus control-plane/worker tests if shared behavior touched |

The write sets are disjoint. Neither writer may edit shared control-plane gateways, schemas/migrations, global Redis client factories, runtime flags, `_core/index.ts`, or the other writer's paths. If their implementation requires one of those changes, stop and report the minimal required contract/change; conductor owns that follow-up.

## Wave 2 ownership contract

### Shared active-job contract now available

- `JobDefinition.activeDedupeKey` is tenant-scoped and unique only while a job is non-terminal.
- `createFeature186VerticalDramaJobRef` exposes both the canonical job ID and whether the request created/deduped an existing active job.
- `getActiveJobByDedupeKey` provides tenant/user-scoped status, progress, input, and output from `worker_jobs`.
- Additive migration `0366_feature_186_active_scope_dedupe.sql` is authored but not applied to a database.

### Writer boundaries

| Agent | Owned paths | Scope | Focused proof |
|---|---|---|---|
| Node job-family implementer (Wave 2A) | `apps/web/server/services/verticalDramaStoryJobs.ts`, `verticalDramaInteractiveJobs.ts`, `verticalDramaDraftCompositionJobs.ts`, `verticalDramaDraftQualityQcJobs.ts`, `verticalDramaShotPromptJobs.ts`, `verticalDramaShotVideoPromptJobs.ts`, `verticalDramaCharacterPromptJobs.ts`, `videoIntelligenceJobs.ts`; matching tests only | Finish canonical admission/status/progress/dedupe/pointer behavior using active-scope API; remove Redis job ownership and noncanonical enqueue branches | Focused Vitest suites for every touched job family |
| Python retry-path implementer (Wave 2B) | `python-backend/app/tasks/approval_timeout_tasks.py`, `social_publish_task.py`, `social_webhook_task.py`, `social_workflow_trigger_task.py`, `vector_db_backfill_tasks.py`, `vision_tasks.py`, `google_drive_tasks.py`; directly matching tests only | Replace remaining Celery-style `self.retry` behavior with canonical PostgreSQL worker-owned retries, preserving task-specific retry limits/backoff and idempotency; no broad decorator/scheduler removal in this packet | Focused pytest for touched task retry contracts plus worker/control-plane tests if shared behavior touched |

Both writers must inspect and preserve dirty hunks. Do not edit control-plane/schema/gateway files, global Redis clients, task registry, or each other's paths. The custom `job_task_registry` is the PostgreSQL worker's callable import registry and must remain; it is not Celery transport. If any old task has no canonical dispatch owner, report it rather than deleting its execution path.

## Later waves

- Wave 3: canonical job lifecycle projection, starting with Video Intelligence status/progress/result/cancel; then port compatible adapters to the Vertical Drama families and remove Redis job-record ownership.
- Wave 4: remaining Python media API and scheduler/task-import cutover.
- Wave 5: Redis-backed cache families; use Cloudflare KV only for cache semantics already proven, keep the search cache contract isolated.
- Wave 6: rate limits, locks, idempotency, pairing and ephemeral authorization state; require atomic Durable Object or PostgreSQL contracts and tenant isolation.
- Wave 7: realtime/pub-sub and stream routes; define durable event/reconnect semantics before removing Redis subscriptions.
- Wave 8: full source inventory reconciliation, residual grep gates, targeted tests, no-Redis runtime proof, and explicit production deployment/data cutover gates.

## Test design

| Requirement | Observable behavior | Test and location | RED/GREEN | Residual boundary |
|---|---|---|---|---|
| New Node media jobs use only canonical admission | A new job creates one canonical row/outbox; status and dedupe work without Redis | Owned Node job tests with Redis adapter unavailable and real control-plane seam/fake | Agent records failing assertion before fix and passing focused suite after | Does not prove deployed worker availability or DB parity |
| Python media retries are worker-owned | Retryable task failure is represented/retried by `worker_jobs`; no Celery `self.retry`/publish occurs | Media task tests with Celery broker forbidden and PG worker retry contract | Agent records RED/GREEN | Does not prove production worker process is active |
| Old queue state is not replayed | Startup/admission ignores legacy Redis/Celery queue payloads | Focused wiring/source guard where relevant | Agent records RED/GREEN | Redis keys themselves are not deleted by local source edits |
| Auth/session, rate-limit, lock, and event semantics survive Redis retirement | Per-family behavioral proof after later wave contracts | Separate rows to be added before those waves | Pending | No global Redis retirement claim until every family and runtime caller is closed |

## Status

- Wave 0 read-only scout complete: confirmed Node job projection, Python Celery, and non-queue Redis are separate domains.
- Wave 1A `node_job_family_cutover` (gpt-5.6-terra): active writer, exact Node job paths above.
- Wave 1B `python_media_cutover` (gpt-5.6-terra): active writer, `media_tasks.py` and direct tests; these paths contain dirty Spec 245 edits and require preservation.
- Wave 1B `python_media_cutover` complete locally: image admission, delayed Kie retry/poll, video/audio generation, provider pollers, and clip-QC retry paths submit or retry through `dispatch_python_task`/`worker_jobs`. `media_tasks.py` has no `self.retry`, `.delay`, `.apply_async`, or `send_task` call. Decorators remain only as task-import registration for the PostgreSQL worker. Existing `celery_task_id` column now stores the canonical job claim/reference pending a separately owned schema migration; it is no longer a Celery transport ID.
- Wave 1B proof: baseline `tests/tasks/test_kie_image_fair_queue.py` 20 passed; after the retry cutover, `tests/tasks/test_kie_image_fair_queue.py tests/unit/test_kie_admission_reliability.py` 40 passed and `tests/services/test_job_control_plane.py` 17 passed. New direct tests prove poll, clip, video, audio, and Kie admission errors raise `HardTaskRetryRequested` without calling a Celery retry method.
- Wave 1B residual shared boundary: `KieSubmissionRateLimiter` still implements provider admission with Redis and must be migrated by its dedicated rate-limit/atomic-state wave. This media-file change preserves its fairness semantics but does not claim Redis retirement for that shared service.
- Dispatch mode: parallel; two writers with disjoint Node/Python ownership paths; conductor owns integration and merge decisions. Active writer count 2/2; dispatch waves used 1/6.
- Deployment, Redis deletion, systemd changes, and production mutations are out of scope for this local code wave.
- Wave 2B Python retry migration complete in seven task modules: `self.retry` and the webhook DLQ republish are removed; `HardTaskRetryRequested` transfers retry/terminal settlement to `worker_jobs`. Focused retry tests passed 7 tests. Root added per-task retry policy metadata (`maxAttempts`, delay caps, deterministic schedules) so legacy attempt limits and countdowns can be represented on canonical jobs; follow-up focused validation is running. A broader combined pytest command hit 3 Python 3.13/no-current-event-loop failures in existing async media tests after earlier files closed the loop; those are not in the retry assertions and need isolated rerun.
- Wave 2A Node partial: six Vertical Drama producers now carry tenant-scoped active dedupe keys; Episode Stage and Video Intelligence are canonical. Video Intelligence Redis projection/pointer/status/cancel has been removed. Redis projection/pointer/status/cancel and legacy queue fallback remain in Story, Interactive, Character Prompt, Draft Composition, Draft Quality QC, Shot Prompt and Shot Video Prompt; continue with the snapshot adapter and status/progress/output mapping.
- Root added `getJobSnapshot(jobId, scope)` to read durable worker_jobs input/progress/output/error/status and a retry-policy override contract; both need focused proof in the following implementation slice.
- Retry policy preservation completed and tested: registry task metadata (max retry count, delay, optional explicit delay schedule) is carried into `worker_jobs.retryPolicy`; canonical settlement supports explicit retry delays. Focused Python retry/control-plane tests: 24 passed; media fairness tests: 40 passed; Node control-plane/adapter/migration tests: 76 passed.
- Wave 3A Video Intelligence completed: service status/progress/result/active dedupe/cancel now read/write only `worker_jobs`; Redis JSON record, pointer, and orphan replay code removed; only Lane-A reconciliation remains. Focused service suite: 27 passed.
- Wave 3B Video Intelligence test cleanup completed: stale test path now asserts canonical executor behavior; router executor/service suites total: 49 passed.
- Wave 4A Python media API cutover is active: remove dead Celery inspection and inline fallback branches, enforce worker_jobs admission for image/video/audio.
- Worker Connect auth sidecar (2026-09-28): pairing state already uses PostgreSQL `ephemeral_authorization_sessions`; the live Web service lacked the optional dedicated encryption keyring. Both the primary checkout and active recovery worktree now derive a domain-separated session key from existing `LLM_ENCRYPTION_KEY` when no explicit keyring is configured; no Redis caller was added. Focused crypto/route tests passed 42/42, and live start/status smoke returned 201/200 with pending-state decrypt/readback; the single synthetic row was removed and the table returned to 0 rows. Web unit health remained 200 after restart. Full Redis retirement remains open; this only proves Worker Connect session state does not require Redis.

## Conductor runtime audit and follow-up — 2026-09-28

### Current production/runtime evidence (read-only)

- `smartspec-backend.service` and `smartspec-web.service` are loaded, enabled, and active. Backend local and public `/health` returned HTTP 200; the payload explicitly reports `redis: healthy`, so this is evidence of a live Redis dependency, not Redis retirement.
- `smartspec-infra.service` is active. `smartspec-celery-doctor.service` is also enabled and running. `smartspec-node-worker.service` is enabled and running; no PostgreSQL Python job-worker systemd unit is installed or active.
- Docker shows `smartspec-redis` healthy; `smartspec-celery-media`, `smartspec-celery-presentation`, and `smartspec-celery-beat` are still running (media and presentation are unhealthy). Legacy Celery runtime is therefore not retired, even though current repository task registration uses `job_task_registry` and source scanning found no Python `.delay()`/`.apply_async()`/`send_task()` dispatch calls.
- Presence-only env audit: Web `.env` contains `REDIS_URL` and `FEATURE_186_HARD_CUTOVER`; Python Backend `.env` contains `REDIS_URL` but no `FEATURE_186_HARD_CUTOVER` or `FEATURE_186_POSTGRES_PYTHON_WORKER`; neither file's values were printed. Web contains Cloudflare runtime/cache credential keys, while Python Backend does not.
- `docker-compose.yml`, `docker-compose.infra.yml`, `docker-compose.full.yml`, `docker-compose.dev.yml`, and `docker-compose.cloud-run-dev.yml` still define Redis and/or Redis URLs. `docker-compose.full.yml` has a PostgreSQL Python job worker definition, but the currently active systemd deployment does not.

### Safe local cutover applied

- Removed the latent Dramatiq/Redis email actor. `EmailService.send_email` now sends bounded SMTP I/O through `asyncio.to_thread` with a 10-second socket timeout; it no longer serializes password-reset tokens or email bodies into a broker payload.
- Removed `python-backend/app/background_tasks.py` and the unused `dramatiq[redis]` dependency from all maintained Python requirements files. Repository search now finds no Dramatiq runtime use.
- RED evidence: the changed success test failed before implementation because `send_email` returned false on the removed queue call. GREEN evidence: `env -u DEBUG python-backend/.venv/bin/pytest -q --no-cov python-backend/tests/unit/test_email_service.py` passed 9 tests.

### Open retirement gaps (must remain visible)

- Redis remains required by live Web/Python runtime code for non-queue state, including rate limits, idempotency/locks, ephemeral OAuth or Telegram state, caches, progress/status, notification/realtime fanout, and feature-specific workflow state. The complete call-site inventory remains under audit; current source scans are candidates, not a closure proof.
- Redis/Celery containers, Celery doctor, Redis-backed health checks, env references, Docker profiles, and package dependencies have not been removed. Do not stop Redis while these consumers remain.
- The Python PostgreSQL pull worker is not active in the current systemd runtime. Enabling a worker requires a service/environment cutover and direct readiness proof before retiring Celery. Web/backend process restart or a source deployment is not proven by local edits.
- Cloudflare KV currently has a proven narrow Search Result Cache binding only. It cannot replace exact counters, distributed locks, revocation, leases, or job state. Other disposable cache families need separate privacy/consistency and binding contracts.

Current outcome: **Redis retirement incomplete**. Earliest resume stage is family inventory/target-owner mapping; final Redis stop/removal remains blocked until every in-scope responsibility has a replacement, tests, process/config cutover, and runtime no-Redis proof. Historical Redis queue records remain intentionally out of migration scope per user direction.

### Python worker admission guard — 2026-09-29

- `dispatch_python_task` already creates canonical `worker_jobs` records and has no Celery publish fallback, but previously only rejected admission when hard cutover was explicitly enabled and the PostgreSQL Python worker flag was disabled. With both flags absent, it could persist Python jobs without an enabled pull worker, leaving delivery dependent on unproven deployment state.
- Tightened the dispatch boundary to require `FEATURE_186_HARD_CUTOVER=true` before creating Python jobs; retained the existing requirement for `FEATURE_186_POSTGRES_PYTHON_WORKER=true` when hard cutover is enabled. This makes disabled worker state fail at admission rather than silently enqueueing an unconsumed job.
- Set both flags on the Python API service in `docker-compose.full.yml`, matching the existing canonical Python worker service in that same compose profile.
- Wired the PostgreSQL Python worker unit into the systemd install/finalize paths and set both flags in the systemd Python API templates after `EnvironmentFile` so the service-level cutover setting is authoritative.
- Regression coverage was added for hard-cutover-disabled admission. Focused control-plane and PostgreSQL worker suites passed: 27 tests. `systemd-analyze verify`, `bash -n`, full-compose config validation, and scoped `git diff --check` passed; only the existing obsolete Compose `version` warning remains. No production service/config was changed.
- Runtime recheck still shows the public backend health payload reporting Redis healthy, Celery Beat running, and `smartspec-python-job-worker.service` not installed. The updated templates are not deployed, so production cutover has not occurred.

### Media job projection and Telegram ingress — 2026-09-28

- Reworked `apps/web/server/routers/mediaJobs.ts` to admit renders to `video.render` and other media work through the canonical job ingress, return canonical `worker_jobs` IDs, read status/spec/result/history from PostgreSQL, cancel through the control plane, and project SSE by polling canonical state. Removed the per-user Redis active-job/concurrency gate; all media submissions are admitted to the central scheduler.
- Removed Redis status/result/error writes and Pub/Sub from `python-backend/app/tasks/media_job_worker.py`. Progress now requires an active fenced canonical lease and fails explicitly if invoked outside that execution context. Removed stale Redis active-set cleanup from the terminal `MediaTask` retention job while preserving its SQL retention behavior.
- Telegram webhook delivery dedupe now uses the existing unique `(botId, updateId)` PostgreSQL ledger before acknowledgment; duplicate deliveries return 200 and ledger failures return 503 for provider retry. Its burst limiter is process-local now, so multi-instance/global Telegram rate enforcement remains an open replacement item.
- Meta social webhook delivery dedupe now relies on the existing unique `social_webhook_events_raw(provider, deliveryId)` row and canonical job idempotency; message/comment duplicate handling stays at the existing PostgreSQL unique constraints in the normalizer. Social inbox unread counts now read/write only `social_conversations.unreadCount`; removed its Redis mirror from Node and Python writers.
- Source scan: `mediaJobs.ts`, `media_job_worker.py`, and `telegramWebhook.ts` no longer call Redis. This is local source evidence only. Focused tests were not run in this slice; no production deployment/restart or pull-worker activation was performed.
- Remaining families explicitly open: global/API-key and workflow-node rate limits, Channel webhook dedupe, social realtime stream/listener, other realtime/pub-sub routes, Redis cache/locks/revocation, Cloudflare binding completion, and live Python pull-worker installation/readiness. Redis/Celery must stay running until those runtime consumers are covered and deployment is proven.

### Rate limit, channel ingress, and realtime follow-up — 2026-09-28

- Added `rate_limit_events` PostgreSQL storage through migration `0367_postgres_rate_limit_events.sql`, with a shared advisory-lock sliding window. API-key RPM/tenant RPM, legacy API credit totals, MCP 5h/day/week credit usage, distributed endpoint limits, Lux TTS, and abuse duplicate/burst/sequence state now use PostgreSQL rather than Redis. The Python Typhoon OCR limiter uses the same table and shared system key; the LLM admin view now reports PostgreSQL storage status.
- Channel webhook delivery now admits `channel.webhook_ingest` through `worker_jobs` with a stable hashed idempotency key and a registered Node executor. The previous Redis NX key and fire-and-forget ingress are removed.
- Social webhook processing no longer publishes Redis streams or uses Redis message dedupe; durable delivery uniqueness and PostgreSQL normalizer constraints own dedupe. The Python SocialTriggerListener is no longer started at app lifespan. Its only consumer targeted the retired legacy Workflow runtime, so no replacement was added to that retired path.
- Notification SSE now polls persisted notification occurrences; notification preference reads go directly to PostgreSQL. Public API events are persisted in `public_api_events` and streamed by PostgreSQL polling. These changes remove their Redis pub/sub paths.
- Validation in this slice: scoped `git diff --check` passed. No tests or typecheck were run. Migration `0367` is authored only; it has not been applied. No production deployment, worker activation, Redis/Celery stop, or runtime cutover is claimed.
- Redis retirement remains incomplete. A broad source scan still finds Redis consumers in MCP/public auth and rate/state, authz/session revocation, credit reservation, voice gateway, widgets, presentation/browser paths, worker scheduler/locks, feature caches, and the inactive legacy social workflow task/listener files. Those require per-family mapping and migration; do not stop Redis/Celery based on this slice.

### PostgreSQL API safety state follow-up — 2026-09-28

- API-key brute-force failures now use the PostgreSQL `rate_limit_events` store rather than Redis. The limit remains 20 failures per source IP in a five-minute sliding window.
- MCP HTTP sessions now persist in PostgreSQL with the same sliding TTL behavior. MCP idempotency replay responses now use a PostgreSQL table keyed by a SHA-256 digest of tenant, user, tool, and supplied key; raw idempotency keys are not stored.
- Public API idempotency locks and replayable responses now use PostgreSQL. Claims have a 60-second lease, response retention remains one day (large responses one hour), response payloads over 1 MB are not cached, and concurrent requests receive the existing 409 conflict contract. If the safety store is unavailable, the middleware returns 503 rather than executing an unprotected mutation.
- Migration `0367_postgres_rate_limit_events.sql` now also creates MCP state and API idempotency tables. It is authored only and has not been applied. Existing short-lived Redis MCP sessions/replay entries are not imported; clients may need to initialize a new MCP session after deployment.
- Static validation only: no test suite, typecheck, migration, service restart, deployment, Redis/Celery stop, or production runtime cutover was performed. This source work is not a Redis retirement proof.

### Remaining-caller scan after safety-state wave — 2026-09-28

- A targeted `rg -l` scan over `apps/web/server` still returns 73 candidate files matching Redis/BullMQ APIs, including generated `.js` counterparts, documentation, scripts, and legacy adapters; this is not a count of 73 proven active runtime consumers. High-risk unresolved runtime families include credit reservations/locks, auth and revocation state, voice gateway revocation/pub-sub, widget and browser state, presentation/draft progress and cancellation, worker scheduling/locks, disposable feature caches, and notification/orchestrator event streams.
- Python backend and deployment/configuration were not included in this 73-file count. Redis imports/dependencies, Docker/systemd services, health checks, and environment variables also remain to be audited after source families are mapped.
- The three touched execution entry points (`authz.ts`, `mcpPublicServer.ts`, `idempotencyMiddleware.ts`) no longer reference Redis. `git diff --check` passed. No tests/typecheck were run by instruction; no migration was applied and no deployment/runtime change was made.
- Overall status remains **incomplete**. Do not stop Redis/Celery until remaining callers have safe replacements and deployed runtime proof is collected.

### Public-contact replay and limiter status correction — 2026-09-28

- Public contact submission limits already use the shared PostgreSQL sliding-window limiter, but the guard still checked the obsolete `redis_unavailable` error discriminator and used Redis `SET NX EX` for 24-hour duplicate replay prevention. It now recognizes `storage_unavailable` and claims the replay fingerprint in PostgreSQL `runtime_dedupe_keys` with an atomic unique-key/expiry upsert.
- Added best-effort pruning for expired dedupe keys. The replay key itself remains SHA-256 hashed before persistence; raw email/message content is not stored by this dedupe table.
- Read-only discovery found `conversationStarterCache.ts` has no production callers in the active server tree and only supports the retired Agency feature; it is treated as legacy/dead code, not migrated or revived. Browser-policy release-control has Redis reads but no in-repository writer for the release/rollout keys; replacement source is unresolved and remains fail-closed until a durable authoring path is identified.
- Static verification: `git diff --check` passed; the public contact guard no longer imports or calls Redis. No tests/typecheck, migration application, deployment, or runtime mutation was performed.

### Browser-policy audit continuity and Telegram link state — 2026-09-28

- Browser-policy audit hash heads now read/write PostgreSQL `browser_policy_audit_heads`. Migration 0367 seeds the latest still-live 30-day head per tenant/execution/trace from durable `browser_policy_decisions`, and the runtime keeps the same 30-day refresh behavior. This preserves database-backed audit continuity without Redis.
- Telegram deep-link verification now relies on `telegram_link_tokens` as its sole token source. The router stores only the token hash and expiry in PostgreSQL before returning the link; failed SQL persistence now fails link creation rather than relying on Redis fallback. Redis verification-key deletion and an unused Redis failure-counter cleanup were removed.
- Read-only discovery: browser-policy release/rollout readiness keys have no in-repository writer. They remain an unresolved external/config authoring path and are not silently replaced with defaults.
- Static verification: `git diff --check` passed; touched browser audit and Telegram files no longer import Redis. The broad candidate scan still includes remaining files and stale/generated surfaces; no migration, tests/typecheck, deployment, or runtime mutation was performed.

### MCP media grant state — 2026-09-28

- MCP browser downloads and provider-facing media references now persist their hashed bearer/provider token grant and resource authorization in PostgreSQL `mcp_download_grants`, with the existing five-minute or provider-specific 24-hour expiry. Reads continue to fail closed on missing/expired grants and preserve `download_grant_unavailable` versus `download_ref_revoked` errors.
- New migration table stores only SHA-256 token hashes and the minimal grant payload; raw bearer/provider tokens are not persisted. Existing Redis grants are not copied, so already-issued ephemeral links may expire/revoke at deployment cutover; issuing a fresh reference uses PostgreSQL.
- Static validation: `git diff --check` passed. No tests/typecheck or production changes were performed.

### Continuation: replay guards, audit chain, Telegram links, and MCP grants — 2026-09-28

- Removed additional Redis-only state paths: public-contact duplicate-submission guard, browser-policy audit hash head, Telegram deep-link fallback/verification and stale failure-counter cleanup, plus MCP download/provider grants. Their active authority is now PostgreSQL-backed; token hashes and scoped identifiers are used where applicable.
- Telegram token issue now requires successful `telegram_link_tokens` persistence before exposing the deep link. Browser audit migration seeds live heads from `browser_policy_decisions` for the same 30-day horizon as the old Redis TTL. MCP download grants retain short/long expiry policy and authorize each fetch by tenant, user, resource type, and resource ID.
- `git diff --check` passed. A targeted server scan still returns 68 candidate files with Redis/BullMQ API markers. This includes generated `.js`, migration-only utilities, docs/fixtures, and runtime callers that still need adjudication; it is not a verified active-runtime count.
- Remaining blocker groups include credit reservation, device/worker auth replay and refresh state, voice gateway revocation, browser-policy release/rollout authoring, worker locks/scheduler, social/realtime streams, and presentation/widget/browser progress state. Deployment config and Python backend also still require a separate complete scan.
- No tests/typecheck, migration application, deployment, worker/service restart, or Redis/Celery stop was performed.

### Continuation: auth replay state, refresh grace, scheduler quota, and credit idempotency — 2026-09-28

- Runner and Worker device-proof nonce consumption now uses the shared PostgreSQL TTL-dedupe table, with replay rejection across instances and fail-closed 503 behavior when PostgreSQL is unavailable. Their 60-second refresh-token grace state now uses a PostgreSQL ephemeral-value table with atomic first-writer convergence; database failures no longer silently return independently minted token sets.
- Remotion render submissions now use the PostgreSQL sliding-window limiter; the per-process local limiter and Redis Lua counter were removed.
- Removed Redis fast-path result caching from `deductCredits` and `addCredits`. Their durable `credit_transactions.idempotencyKey` unique constraint and duplicate recovery remain the authority. The separate mutable credit-reservation snapshot/draw/refund lifecycle still depends on Redis and remains unresolved.
- The shared revocation service was already PostgreSQL-backed; no Redis revocation authority was found in `_core/revocation.ts`.
- Migration 0367 now also creates `runtime_ephemeral_values` for hashed-key, TTL-bound shared transient values. New refresh-grace values are written there; existing 60-second Redis grace values are not copied.
- Static verification: `git diff --check` passed and the changed runner/worker auth plus scheduler files no longer call Redis. No tests/typecheck, migration, deployment, or live auth-flow proof was performed.

### Continuation: durable credit reservations and auth/scheduler stores — 2026-09-28

- Migrated the general credit reservation lifecycle out of Redis. New `credit_reservation_snapshots` PostgreSQL state now owns the 10-minute reservation snapshot, atomic draw budget, settled-call dedupe, and close lifecycle. Row locks serialize draws/close operations; close intent distinguishes refund from commit; deterministic refund transaction idempotency remains in the durable credit ledger. Redis Lua draw and reservation reads/writes were removed from `creditService.ts`.
- Removed `credit:idemp:*` Redis fast paths from add/deduct credit operations; durable SQL uniqueness and duplicate transaction recovery remain authoritative. Removed the now-obsolete `allowWithoutRedis` option and its caller arguments.
- Automation Copilot task-to-reservation Redis mapping was removed. Finalization locates the original credit transaction in PostgreSQL, checks the reservation lifecycle to avoid refunding committed/refunded reservations, and uses the existing durable ledger fallback only when the short-lived snapshot is gone.
- Runner and Worker proof replay plus 60-second refresh grace use PostgreSQL TTL-dedupe/ephemeral state; Remotion quota uses the shared PostgreSQL sliding-window store. Shared JTI revocation already used PostgreSQL.
- Migration 0367 now creates `credit_reservation_snapshots`; no Redis reservation snapshots were imported. Any old snapshot already expired at cutover remains unrecoverable by design. The previous 10-minute expiry and settlement semantics are retained for newly created reservations.
- Static verification only: `git diff --check` passed. No tests/typecheck, migration application, deployment, or live billing/auth exercise was performed.

### Continuation: general credit reservations, Automation Copilot linkage, and Python API rate limits — 2026-09-28

- General `creditService` reservations now use PostgreSQL for create, idempotent replay, snapshot reads, atomic draw/settlement-key dedupe, refund, and commit. Draws and close-intent transitions use `SELECT ... FOR UPDATE`; refund/commit intents cannot race each other, and a failed refund stays in a retryable `refunding` state. Redis Lua and reservation keys are removed from the TypeScript credit service.
- Automation Copilot no longer writes or reads `automation:task_reservation:*`; finalization finds the original charge in SQL and consults durable reservation lifecycle before using the existing expired-snapshot refund path. Obsolete `allowWithoutRedis` parameters were removed at callers.
- Python `RateLimitService` now consumes and reports the shared PostgreSQL sliding-window events table. It no longer creates Redis clients or uses Redis pipelines.
- `credit_reservation_snapshots` uses the same 10-minute expiry as the previous reservation key. No old snapshots are imported. Other Python rate-limit/admission paths (including KIE image admission), retired workflow/orchestrator modules, and many remaining web state families still require work.
- Static validation: `git diff --check` passed. No tests, syntax/type checks, migrations, deployment, or live billing checks were run.

### Continuation: Python KIE admission and webhook dedupe — 2026-09-28

- KIE image submission and polling admission now use the shared PostgreSQL sliding-window store instead of Redis Lua. Poll admission is enabled again; the prior unconditional bypass was removed. PostgreSQL errors defer/fail closed with an admission-unavailable result.
- KIE provider webhook and social webhook dedupe now use hashed TTL markers in `runtime_dedupe_keys`. They no longer call Redis and storage failures propagate so webhook requests can be retried instead of being silently processed without dedupe.
- The legacy `redis_available` field remains only as a compatibility name for existing task metadata/callers; it now reports shared-store availability. The public deferred-exception constructor accepts both names during transition.
- Static checks: `git diff --check` passed; Python AST parsing passed on the touched limiter, shared rate-limit service, media task, and LLM gateway files. No tests were run. Migration 0367 remains unapplied, so these paths require that schema before runtime use.
- Runtime inventory still has Redis API candidates across Python and Web; many need family-by-family conversion or classification. This change does not establish Redis retirement or production readiness.
- Current broad marker scan reports 24 Python and 83 Web candidate files after excluding tests and Python's retired `app/orchestrator`; the Web scan still includes generated `.js` and indirect/reference-only surfaces, so these are triage counts, not confirmed live callers.

### Retire Redis-only media-job stale cleanup — 2026-09-28

- The old `/tasks/cleanup-redis-stale` endpoint only cleaned Redis active-job sets and status keys, which are not the canonical `worker_jobs` control plane. Removed that Redis scan/mutation implementation; the route now returns a stable 200 `retired` response for any still-configured old scheduler so it cannot recover or mutate abandoned Redis state.
- Removed the obsolete cleanup schedule from `scripts/validate-cloud-scheduler.sh` and updated the regression contract to require the no-op response. This does not delete an already-created external Cloud Scheduler job; that resource remains an operations cleanup item.
- The Cloudflare video container entrypoint still references Redis for legacy progress projection. The current codebase routes new video renders through `worker_jobs`, while that old entrypoint has no in-repository active caller; it is not safe to wire progress to canonical events without a fenced container callback/lease contract. Keep it an explicit runtime/deployment adjudication item rather than writing unfenced job status directly.
- No tests were run. No external scheduler, database, Cloudflare binding, deployment, or service was changed.

### Browser-pool capacity state moved to PostgreSQL — 2026-09-28

- The active server-managed Live Browser backend obtains contexts through `BrowserPool`. Removed its Redis client creation and tenant `INCR/DECR/EXPIRE` counter. Shared capacity now uses `rate_limit_slots`, acquired under a PostgreSQL advisory transaction lock and released by slot ID; the existing tenant cap of two, per-process system cap of ten, and five-minute stale-slot expiry are preserved.
- Browser context setup failures and caller exceptions release both database and local capacity safely. Orphan cleanup now releases its PostgreSQL slot; the local semaphore is not double-released if orphan cleanup races with normal context finalization.
- Updated BrowserPool regression fixtures to simulate the shared slot contract. Tests were not run. The table is part of authored migration 0367, which remains unapplied; deployment/runtime behavior is not proven.

### Live Browser readiness and telemetry moved off Redis — 2026-09-28

- Live Browser readiness publication/watchdog now writes and reads the shared `runtime_ephemeral_values` PostgreSQL TTL store. The Web readiness gate reads the same namespace/key through `postgresEphemeralStore`; Redis readiness GET/SET is removed.
- Replaced Redis-backed live-browser counters/incidents with the existing metrics and structured observability sink. Persisted readiness itself remains shared in PostgreSQL; operational metrics are emitted directly and are no longer mirrored to Redis.
- Updated the readiness contract fixtures to use the PostgreSQL store seams and observability sink. Tests were not run. Migration 0367 remains unapplied, so the readiness store cannot be runtime-proven until schema deployment.
- Follow-up source marker scan is now 20 Python and 82 Web candidate files under the same broad exclusions. These counts include dead/retired code, generated files, and indirect references; no claim that all candidates are active consumers.

### Continuation: Widget rate and credit caps moved to PostgreSQL — 2026-09-28

- Widget WebSocket messages now consume a shared PostgreSQL sliding-window slot instead of Redis `INCR/EXPIRE`; a PostgreSQL limiter failure closes the connection instead of silently processing without protection.
- Widget per-session, per-day, and per-month credit caps now use a single PostgreSQL transaction with stable advisory-lock ordering. All caps are checked before usage is charged, preventing concurrent requests from exceeding a cap or partially consuming another bucket when one cap rejects the message. Visitor IP remains hashed before use as a daily scope.
- Usage event pruning is best-effort at 40 days, preserving the existing 32-day monthly retention horizon. No old Redis counters were copied; the user explicitly accepted abandoning old Redis state.
- Static validation: `git diff --check` passed for the three changed files. No tests/typecheck, migration, deploy, or runtime exercise was performed. Migration 0367 remains authored but unapplied.
- Redis retirement remains incomplete. Python video entrypoint progress still references Redis but has no active in-repository caller and lacks a fenced Cloudflare-container callback; voice gateway consent/session state, presentation progress/cancellation, worker scheduler and other remaining consumers need separate safe cutovers. Do not stop Redis/Celery or claim runtime retirement from this source change.

### Continuation: Voice Gateway session state moved to PostgreSQL — 2026-09-28

- One-time voice WebSocket tokens now use hashed keys in `runtime_ephemeral_values` and are consumed with one atomic `DELETE ... RETURNING`; concurrent upgrades cannot reuse the same token.
- The one-active-session-per-user slot is an atomic expiring PostgreSQL claim with an owner value. Disconnect releases only the caller's own slot, preventing an old socket from deleting a newer session claim.
- Consent withdrawal persists to the existing SQL user record, immediately closes this instance's socket, and is observed by other instances through a two-second poll of only their active user IDs. A failed consent query closes active local voice sessions (fail closed). Polls are serialized to avoid overlapping DB reads.
- Removed the voice route's Redis token, active-session, and pub/sub calls. State uses the existing authored `runtime_ephemeral_values` table; no Redis token/session state is imported.
- Static validation: `git diff --check` passed and targeted source scan found no Redis calls in the Widget or Voice Gateway cutover files. No tests/typecheck, migration, deploy, or runtime exercise was performed; migration 0367 is still unapplied.
- Redis retirement remains incomplete. Presentation progress/cancellation, scheduler/locks, Telegram/Python state, and other callers need further adjudication. The old Python video entrypoint has no active in-repository caller and cannot report fenced progress to the canonical job control plane; leave it classified as legacy until that runtime boundary is settled.

### Continuation: Presentation draft progress, cancellation, and locks moved to PostgreSQL — 2026-09-28

- Presentation draft lock claims, ownership refresh/release, progress snapshots, cancellation markers, and public SSE polling now use `runtime_ephemeral_values`; all `getRedisClient` calls were removed from the presentation router, public presentation API, and AI presentation service.
- Added shared ephemeral-store operations for unconditional TTL writes, lock-owner-conditional refresh/delete, and value-plus-TTL reads. Owner comparisons are JSONB exact matches, so a stale run cannot refresh or release a replacement run's lock.
- Progress SSE continues polling the shared record; failed database operations do not fall back to Redis. Old Redis progress/lock/cancel snapshots are intentionally not imported.
- Static validation: `git diff --check` passed. No tests/typecheck, migration, deploy, or runtime exercise was performed; migration 0367 remains unapplied.
- Important queue gap remains: the presentation routes still invoke `generateAIDraft`/layout work with in-process fire-and-forget calls. This change only removes Redis-backed state; it does not yet put those long-running actions behind canonical `worker_jobs` plus outbox. Other Redis candidate families also remain, and the broad Web scan currently reports 118 files with API markers (including test/generated/indirect candidates; not an active-runtime count).

### Continuation: Visual-state cache and notification digest marker moved off Redis — 2026-09-28

- `visualStateService` now reads its authoritative `conversation_visual_state` row directly from PostgreSQL and no longer maintains a best-effort Redis cache. The cache was only a 30-second projection; SQL writes and persisted values remain unchanged. A Cloudflare KV cache adapter is still a separate follow-up and was not implied by removing this Redis cache.
- The canonical `notificationDigestJob` now stores its seven-day last-send timestamp in the shared PostgreSQL ephemeral store instead of Redis. Existing bounded fallback behavior remains if that non-authoritative marker cannot be read or written.
- Static validation: `git diff --check` passed; targeted Redis API scan returned no matches in visual state, notification digest, voice, widget, or presentation cutover files. No tests/typecheck, migration, deployment, or runtime exercise was performed.

### Continuation: group cache and Hermes settlement marker removed from Redis — 2026-09-28

- Group membership reads now come directly from the authoritative PostgreSQL tables; the short-lived Redis cache and mutation-time invalidation calls were removed. Group mutation and authorization queries are unchanged.
- Hermes terminal media-fee reconciliation markers now use the shared PostgreSQL ephemeral store with the same 24-hour TTL. Refund execution remains delegated to the existing durable credit-reservation settlement path.
- Static validation: scoped `git diff --check` passed and targeted scans found no Redis API calls in group, visual-state, digest, Hermes settlement, voice, widget, and presentation state paths. No tests/typecheck, migration, deploy, or runtime exercise was performed.
- Redis retirement and Cloudflare KV cache migration remain incomplete. Presentation generation still runs fire-and-forget inside the Web process; other active consumers remain in media routes, auto-draft, Virtual Admin, MCP, realtime/event streams, browser tooling, worker-domain state, and Python services.

### Continuation: internal Browser Tool concurrency semaphore moved to PostgreSQL — 2026-09-28

- The Browser Tool route now claims a single per-user and up to two per-tenant expiring slots through `rate_limit_slots`, replacing Redis `SET NX`, `INCR`, and `DECR` semaphore state. Partial claims are released if the tenant cap is reached or acquisition fails; request finalization releases only the exact UUID slots it acquired.
- The existing 310-second slot TTL is preserved. No old Redis semaphore counts were imported.
- Static validation: `git diff --check` passed and targeted source scan found no Redis calls in `browserTool.ts`. No tests/typecheck, migration, deploy, or runtime exercise was performed; migration 0367 remains unapplied.

### Continuation: deferred media retry credential minimization — 2026-09-29

- Removed the caller bearer token from newly written deferred-media Redis records. The retry submitter already issues a short-lived server token at execution time, and no code read the persisted token. Existing records are not migrated or recovered.
- The deferred retry queue itself remains on Redis and is not considered cut over: its timer is disabled under the current feature-192 policy, while the service still has Redis sorted-set scheduling, task status/list/cancel projections, and credit-refund behavior. A complete move needs a registered canonical executor plus owner-scoped status/cancel/list projection and retry/refund idempotency; replacing only the sorted set would leave jobs stuck or break task controls.
- Targeted source inventory still finds active Redis families in Vertical Drama domain state, deferred media retry, Virtual Admin, webhook-trigger dedupe/rate limiting, Hermes admission/observability, browser-policy release controls, and Python integrations. Hits under the retired Python orchestrator are not to be reactivated or migrated into that retired runtime.
- Static verification only: the deferred record and both producer call sites no longer persist/pass `userToken`; no tests/typecheck, migration, deploy, worker activation, or runtime exercise was performed. Redis/Celery retirement and Cloudflare KV cache migration remain incomplete.

### Continuation: webhook trigger state and notification count cache — 2026-09-29

- Webhook trigger dedup now uses the shared atomic PostgreSQL TTL-dedupe table; per-trigger request limits use the shared PostgreSQL fixed 60-second bucket, preserving the existing Redis bucket semantics. Old buckets for that subject are pruned atomically on the next request. The route returns 503 when either state operation is unavailable, so it does not dispatch without its dedupe/rate guard. Updated the existing service tests to mock the PostgreSQL stores instead of Redis; tests were not run.
- Public media `media.ready` once-only emission now uses the same PostgreSQL TTL claim for 24 hours. Claim failures retain the previous best-effort behavior and do not repeatedly emit the event.
- Unified unread notification count now reads its authoritative PostgreSQL tables directly; the old Redis value was only a 60-second derived cache. Search Result Cache already uses the Cloudflare KV store adapter in the active Responses route, so no new cache transport was introduced here.
- Targeted static scan found no Redis references in webhook trigger service/route, public media route, or unified notification service. `git diff --check` is the only verification run; no tests/typecheck, migration, deploy, or runtime exercise was performed. Migration 0367 remains unapplied.
- Open families remain: deferred-media retry; Vertical Drama Redis job projections/queues; presentation MCP fire-and-forget generation and progress; Virtual Admin realtime/cooldown/digest paths; scale-tier and browser-policy release locks; Hermes rate/counter state; other MCP/public/realtime state; Python services and runtime config. Retired `/workflows` and Agency paths are not to be revived or migrated into active use.

### Continuation: MCP presentation progress moved to shared PostgreSQL state — 2026-09-29

- MCP presentation creation now writes its initial progress to the same `presentation:draft:progress` PostgreSQL ephemeral store used by `generateAIDraft`; the progress tool reads that record and verifies the owning user before returning it. Redis-only `ai_draft_progress:*` reads/writes were removed from `mcpRegistry.ts`.
- The progress state store requires migration 0367 to be applied, like the existing presentation router path. This removes the Redis progress mirror only; the MCP create action still launches presentation generation in-process and must later be admitted through `worker_jobs` plus outbox.
- Static verification only: targeted Redis grep is clean for the MCP registry's former direct progress calls; `git diff --check` was run, no tests/typecheck/migration/deploy/runtime exercise was performed.

### Continuation: scale-tier mode and apply lock moved off Redis — 2026-09-29

- `getDeployMode()` now treats PostgreSQL `systemSettings` as the only persisted authority before the environment fallback; the Redis `feature-flag:DEPLOY_MODE` read and write-through cache are removed.
- Local scale-tier apply now claims/releases a five-minute owner-scoped lock through the existing PostgreSQL ephemeral store. A losing concurrent caller cannot clear the winning caller's lock, and database errors fail closed instead of allowing overlapping filesystem/service mutations.
- Scale-tier apply no longer writes `REDIS_MAX_CONNECTIONS` into the Python env file and no longer executes `docker exec ... redis-cli CONFIG SET`; its existing result shape reports the Redis tuning step as skipped/retired.
- Targeted source scan found no Redis client calls in `scaleTier.ts`; scoped `git diff --check` passed. Tests, typecheck, migration, deployment, and runtime apply were not run. This path depends on authored-but-unapplied migration 0367 (`runtime_ephemeral_values`).
- Open retirement gaps remain substantial: deferred media retry and Vertical Drama queue projections, Virtual Admin event delivery, Hermes admission/quota counters, additional MCP/browser/worker state, and the Python/runtime configuration families. This continuation does not establish Redis retirement.

### Continuation: Virtual Admin cooldown and email rate limit moved to PostgreSQL — 2026-09-29

- Guardian notification cooldown now uses the shared atomic PostgreSQL TTL-dedupe store. Duplicate incidents still publish the existing SSE update and skip channel delivery.
- Guardian email throttling now uses the shared PostgreSQL sliding-window limiter at 20 messages per tenant per hour; storage errors retain the previous best-effort behavior.
- Targeted source scan found no Redis state calls in these two notifier paths; `publishSSEEvent`, the Guardian SSE listener, actuator event publication, and the email-digest list remain unresolved because they carry delivery behavior and need a durable event/consumer mapping.
- No tests/typecheck/migration/deploy/runtime exercise was performed. Both stores require authored-but-unapplied migration 0367. This does not establish Redis retirement.

### Continuation: Hermes admission/quota and admin read caches — 2026-09-29

- Hermes media submission windows now use atomic PostgreSQL `rate_limit_events`, including all-or-none batch admission. Daily provider quotas read and record usage units in the same PostgreSQL store; the completion usage marker now claims through PostgreSQL TTL dedupe, with the existing durable `worker_job_events` marker retained as a second guard.
- `readUsageBetween` and `readNamespaceEventCountsSince` provide PostgreSQL-backed reporting. Widget monthly credits now report from the same `widget:monthly` usage events used by admission. Admin security stats aggregate recent rate-limit events rather than scanning Redis keys.
- Google Drive readonly-scope approval now reads `systemSettings` directly, removing both Redis and in-process caching so an approval revocation is immediately visible across Web instances.
- Admin R2 storage statistics keep their five-minute shared cache in PostgreSQL TTL state rather than Redis; cache failure still falls through to an R2 query/returns the computed result.
- Targeted scan is clean for Hermes admission/usage observability, Google Drive readonly approval, widget usage reporting, and Admin storage/security stats. Static diff checks only; tests/typecheck/migration/deploy/runtime proof were not run. The code relies on authored-but-unapplied migration 0367.
- Remaining Redis callers include canonical-job family projections/retries, auto-draft progress/lock, worker scheduling/operational endpoints, Virtual Admin SSE/digest delivery, Hermes Agent pairing, Marketplace render projection, and other security/integration state. Retired `/workflows`/Agency paths remain excluded.

### Continuation: hard-cutover transcription admission guard — 2026-09-29

- The Storyboard Review background transcription route previously wrote a queued record into Redis and then unconditionally threw the hard-cutover `PRECONDITION_FAILED`, leaving an orphan record on every attempt. It now rejects before creating any record or launching the local compatibility worker; unused worker-launch imports were removed.
- This is an admission safety correction, not completion of the feature. A canonical `worker_jobs` executor/admission contract is still missing, and the legacy status/CLI adapter remains an inventory candidate until that executor is implemented or its callers are fully retired.

### Continuation: Hermes Agent pairing state moved to PostgreSQL — 2026-09-29

- Pairing records and normalized user-code indexes now use the shared hashed-key PostgreSQL TTL store. Pairing codes remain claim-once; a collision removes only the newly-created pairing record it owns.
- Approval and token exchange now conditionally replace the exact state they read. Concurrent approvals cannot overwrite each other, and only one exchange can transition an approved pairing to redeemed and receive tokens.
- Pairing/PKCE/device binding and TTL values are preserved. No old Redis pairing state is imported. Targeted source scan found no Redis calls in `hermesAgentPairingService.ts`.
- Static checks only; no tests/typecheck/migration/deploy/runtime pairing exercise was run. The service requires migration 0367's `runtime_ephemeral_values` table.

### Continuation: residual inventory and current proof boundary — 2026-09-29

- Additional derived-state callers moved off Redis: Admin R2 stats use a five-minute shared PostgreSQL TTL cache; Admin security metrics query recent rate-limit events; widget monthly usage reads PostgreSQL units over the selected UTC calendar month; Google Drive readonly approval reads its SQL authority directly.
- The latest targeted source marker scan returns 27 Web/Python candidate files after excluding tests, generated JavaScript, Markdown, and the retired Python orchestrator. This is still an inventory count, not 27 confirmed active Redis dependencies: it includes Redis factories, migration tooling, legacy/dead helpers, and compatibility worker adapters.
- Confirmed remaining functional/high-risk families: `worker_jobs` projections in Vertical Drama and Marketplace Auto Review; deferred media retry producer/state with its in-process consumer explicitly disabled; MCP/auto-draft progress boundaries; Virtual Admin SSE plus an email-digest Redis list; system startup/health/shutdown Redis checks; Hermes pairing was migrated in this continuation; external browser-policy release keys without a source writer. Retired `/workflows`/Agency/Orchestrator paths remain excluded from migration.
- The PostgreSQL replacements rely on migration 0367, which is authored locally but not shown as applied. No tests/typecheck, migration apply, worker activation, production config change, Redis/Celery stop, or deployment was performed. Local source changes do not prove production cutover.

### Continuation: deferred media, Vertical Drama, Marketplace, Guardian, and startup paths — 2026-09-29

- Deferred video retries now admit a scheduled `media.deferred_retry` job into `worker_jobs` with `scheduledAt`; the job type is registered for the PostgreSQL Node worker. Owner-scoped task projections and list reads use PostgreSQL `runtime_ephemeral_values`; no in-process timer, Redis sorted set, or Redis record scan remains. Cancel requests the canonical job cancellation and refunds only before provider submission using the existing idempotency key. A retry that finds `submitting` after a worker loss terminates as ambiguous instead of resubmitting and risking duplicate provider charges.
- Vertical Drama story, interactive, draft composition, draft QC, shot prompt, shot-video prompt, and character prompt no longer instantiate a Redis client. Their short-lived UI/dedupe projections use PostgreSQL ephemeral state or canonical `worker_jobs` snapshots. New dispatches use `worker_jobs`; registry executors for shot prompts and character prompts now return their domain result to canonical settlement instead of checking a still-running projection before settlement. Shot prompt and shot-video prompt admission also carry canonical active dedupe keys. Story checkpoint recovery remains behind canonical control-plane recovery evidence.
- Marketplace Auto Review render status/result now read the owner-scoped `video.render` `worker_jobs` snapshot; render inputs include the render spec, and cancellation delegates to canonical job cancellation. Unread Redis active/recent render indexes were removed. Cloudflare render completion still needs deployment/runtime evidence; the Node executor remains fail-closed for `video.render`.
- Guardian SSE now polls tenant-filtered incident and approval rows in PostgreSQL, including durable creation/update/resolution/decision events. Redis pub/sub publishers were removed. The warning email-digest Redis list had no consumer; its writes were removed, leaving the already-persisted in-app notification path. Direct email remains a logging stub, and `sensor.alert`/`feedback.new` have no active producers in the repository. The legacy exported SSE hook is retained as a deprecated no-op for source compatibility.
- The Guardian stale-cache action now removes only expired PostgreSQL ephemeral rows. `/readyz`, startup preflight, and graceful shutdown no longer ping or close Redis; readiness still requires PostgreSQL and retains the existing Cloudflare runtime gate when hard cutover is enabled.
- `postgresEphemeralStore` now supports bounded namespace reads, deletion, and atomic increment used by these projections. Those paths require migration 0367 (`runtime_ephemeral_values`) to be applied.
- Static verification: `git diff --check` passed. A targeted production-file scan across these paths found no `getRedisClient()` calls. No tests/typecheck, migration apply, service restart, external Cloudflare render execution, or production runtime proof was performed; Redis/Celery retirement is not established globally.

### Continuation: Vertical Drama startup queue wiring removed — 2026-09-29

- Web startup and shutdown no longer invoke the retired Vertical Drama story, interactive, draft-composition, draft-QC, character-prompt, shot-prompt, and shot-video-prompt queue hooks. Their admission paths now create canonical `worker_jobs` entries, with executor registrations in the Node PostgreSQL worker registry.
- Kept `verticalDramaEpisodeStageJobs` startup/shutdown hooks because they only run the PostgreSQL stale-run reconciler; they do not initialize BullMQ. Video Intelligence startup remains separate and unchanged.
- Final scoped scan found no direct Redis client creation/import or Redis environment-based queue construction in the deferred-media, Vertical Drama, Marketplace Auto Review, Guardian SSE/notifier/actuator, or web readiness health-check paths. `_core/index.ts` still initializes the separate Telegram Redis queue, outside these cited families; therefore startup as a whole and global Redis retirement are not complete.
- `git diff --check` passed. No tests/typecheck, migration apply, service restart, Cloudflare render worker execution, or production runtime proof was performed. Migration 0367 remains unapplied; Cloudflare `video.render` still has no in-repository active completion consumer proven by this pass.
