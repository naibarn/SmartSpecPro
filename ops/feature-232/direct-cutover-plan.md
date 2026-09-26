# Redis → Cloudflare Direct Cutover Plan

**Status (2026-09-26, rechecked):** G1 verification remains incomplete. Worker and Web health checks return 200, but the Worker version cannot be queried (`CLOUDFLARE_API_TOKEN` is unavailable), and the Web service exposes no release SHA. It started at 20:06:32 +07, after HEAD `d7214f968` was committed at 19:46:25 +07, so its exact loaded revision is not provable. Beta/Admin Browser states, trace evidence, and caller-level Redis telemetry are unavailable. The Web fault flag is absent from its process environment. A G1 Web-only release is unsafe from this checkout: G2 callers in the same Web source use PostgreSQL unconditionally and have no activation gate.

**G2 Production recheck (read-only, schema at 13:26 UTC; state repeated at 13:47 UTC):** the connected `smartspec` PostgreSQL 15.17 database now has 310 migration rows, and 0345–0349 are applied; the latest hash matches local 0349. All four G2 tables exist. This supersedes the earlier 305-row/0344-only snapshot. Redis still has 272 active JTI revocations while PostgreSQL has 1 active row: all 272 Redis digests are absent from PostgreSQL, and the one PostgreSQL digest is absent from Redis. The Web process has no `JTI_REDIS_ROLLBACK_MIRROR` or encryption keyring variables. This is an **unsafe partial G2 state**: current source checks PostgreSQL only by default, so affected revoked tokens can be accepted if this source is serving requests. Do not roll back to Redis-only code; the two stores each contain a revocation absent from the other. No Production writes were made in this recheck. Backup/restore proof, all-instance inventory, maintenance attestation, and a safe two-way JTI reconciliation remain unverified. `CLOUDFLARE_ACTIVATION=disabled`; Redis remains required for Voice, Pub/Sub and G3–G6.

## Operating rules

- Direct cutover is allowed with an announced maintenance pause; no 14–30 day observation gate. Pause only the affected workload. The two beta users can be asked to stop submitting work during a cutover.
- PostgreSQL and existing `worker_jobs` + outbox stay the transactional source of truth. Cloudflare Queues, Workflows, Containers, Workers and Durable Objects are execution/coordination targets, never a second job authority.
- KV is only for disposable/read-mostly cache entries. Never put sessions, revocations, counters requiring exact global limits, locks, leases, credits, job state, or durable events in KV.
- Cut over one responsibility at a time. Stop intake, drain or reconcile in-flight work, fence the old writer, switch the one owner, probe a real operation, and resume. Never dual-write business effects.
- A source scan or local test is not production proof. Each release record names environment, Worker version, route/binding, timestamp, operator and sanitized probe/test output. Do not put secrets in evidence.

## Dependency order and readiness

| Order | Group | Destination/authority | Readiness now | Why this order |
|---|---|---|---|---|
| 1 | G1 SearchResultCache | Workers KV; cache loss is a miss | Existing target is deployed. New trace propagation, Worker outcome logs and request-scoped failure injection are code-only. Browser test script is prepared; authorized Production browser sessions are unavailable in this environment. | Isolated and disposable; no job/auth dependency. |
| 2 | G2 auth/session/revocation | PostgreSQL authority; KV never authorizes | G2-A–D code/tests pass locally. Production now has migrations 0345–0349, but revocation state is mismatched (272 Redis-only, 1 PostgreSQL-only). Backup restore, keyring, Maintenance, all-instance inventory and caller telemetry are missing; no rollback/cutover is safe yet. | Must prove revocation and active auth-state preservation before switching. |
| 3 | G3 rate limits/quotas/idempotency | Workers Rate Limiting for approximate abuse controls; PostgreSQL for credits/economic limits/idempotency; DO only for exact coordination if justified | Partial. Policies, routes and key semantics not enumerated. | Rate enforcement depends on separating abuse throttles from billable/transactional decisions. |
| 4 | G4 locks/leases/semaphores | PostgreSQL guarded writes and `worker_jobs` leases/fencing; DO for bounded live coordination only | Partial. Owners, callers, lease expiry and fencing coverage incomplete. | Must settle authority/fencing before switching realtime and queue consumers. |
| 5 | G5 pub/sub/realtime | Durable PG events/outbox and replay; DO for live WebSocket ownership/fan-out | Candidate mapped for voice; no DO binding/class handoff or replay proof yet. | Voice depends on G2 revocation and G4 ownership rules. |
| 6 | G6 queues/schedulers/job state | Existing `worker_jobs` + outbox; Queues/Workflow/Container/Runner as transports/executors | Partial; per-family ownership, active jobs and provider-side ambiguity need reconciliation. | Each family depends on G2–G5 contracts. Migrate independently after its executor/dispatch contract is ready. |

## Direct cutover card — required for every slice

1. Name the service, exact entry points, producers/consumers, schedule IDs, key prefixes, owner, target binding/route, and canonical data source. Identify the exact old Redis callers to disable/delete.
2. Prepare the target and secrets in the approved account. Verify binding identity and deployment environment; keep unrelated `CLOUDFLARE_ACTIVATION` disabled.
3. Pause only this slice's intake and scheduled producers. Stop its old consumers. Inspect PostgreSQL `worker_jobs`/outbox and any provider receipt to identify active, delayed, leased, retrying, or ambiguous work. Reconcile before resuming.
4. Fence the old writer/consumer. Switch one authority/route. Run a successful operation plus rejection, timeout, retry/duplicate and tenant-isolation cases applicable to that slice.
5. Resume only the new path. Inspect target telemetry and canonical PostgreSQL state; then remove the old caller, config, credentials and package reachability for this slice. Preserve a bounded recovery artifact and redacted proof.
6. Close the slice only when acceptance and old-caller closure evidence are attached. If the check fails, pause that slice and use its recovery steps; do not restore an unsafe stale authority.

## G1 — SearchResultCache KV

**Scope/authority:** `apps/web/server/services/searchResultCache.ts`; only Responses API search-result cache. Search/provider execution remains canonical on cache miss. No key migration is required; start cold. Admin provider is `disabled` until Worker probe succeeds.

**Prerequisites:** deploy `smartspec-cloudflare-runtime` with a real `SEARCH_RESULT_CACHE` namespace binding; configure its custom domain/route (the checked-in config has `workers_dev: false`); set the same dedicated `CLOUDFLARE_SEARCH_CACHE_TOKEN` in Worker and Web secret stores, and set Web `CLOUDFLARE_RUNTIME_URL`. Do not expose the token to browser config. Keep job activation off.

**Acceptance:** target Worker probe performs the temporary KV put/get/expiry check; authenticated get/put work with 60–3600s TTL; unauthenticated, malformed, oversized and invalid-scope requests fail; tenant/user keys do not cross; freshness bypass works; KV timeout/outage and missing entry return normal model result as miss/no-op; Admin cannot enable until a real probe succeeds and the secret is absent from UI/API. For Production closure, capture a real miss then hit for each of the two authorized Beta accounts, matching sanitized app/Worker traces, the authenticated Admin Cloudflare tab and evidence the SearchResultCache path issues no Redis commands.

**Rollback/recovery:** disable only the Search cache provider in Admin, continue with cache bypass/miss, and leave stale Redis entries untouched. There is no business data restore. Re-enable only after the real probe and beta request pass again.

**Old caller closure:** verify the Responses path no longer imports or calls Redis cache methods; focused tests prove KV mode never reaches Redis; production request trace shows Worker cache calls for the selected path and no Redis cache command from that caller. Redis itself remains for other groups.

**Current evidence:** Worker was not redeployed in this turn. Existing `/healthz` and authenticated cache probe returned HTTP 200; synthetic tenant A/B entries remained isolated and tenant C returned empty; unauthenticated probe returned 401. PostgreSQL selects `cloudflare_kv`; Redis scan found zero `search_cache:*` entries. Local tests now cover miss/hit/error trace events and a request-specific simulated KV-get failure that does not call KV. Production Beta searches, Admin inspection, new trace correlation, safe injected failure and caller-attributed Redis telemetry remain unverified. `/readyz` is 503 because unrelated job/runtime bindings and a job handler are absent; job activation remains disabled.

## G2 — Auth, session and revocation

**Target/authority:** read current permission, tenant, session and revocation from PostgreSQL using a fresh path for security decisions. A DO may coordinate a live socket/session but must not become the revocation source of truth. KV is not permitted for an authorization allow decision.

**Source/runtime audit (2026-09-26):** `_core/revocation.ts`, `deviceAuthRoutes.ts`, and Runner/Worker connect state use PostgreSQL unconditionally in this checkout. There is no G2 activation switch to permit a safe G1 Web-only release. The active host `smartspec-web.service` started after current HEAD but does not expose its release SHA. Its source revision must be confirmed by the release owner. Read-only comparison found 272 active Redis revocations missing from PostgreSQL and one active PostgreSQL revocation missing from Redis; no Redis mirror flag is present in the inspected process. `revokeJti`/`isJtiRevoked` callers are `authz.ts`, `sdk.ts`, `deviceAuthRoutes.ts`, `routers.ts`, `routers/users.ts`, `connectedDeviceService.ts`, `hermesAgentPairingService.ts`, `workerAuthService.ts`, and `runnerAuthService.ts`. Voice uses Redis for one-time 30-second websocket tickets, 300-second active-session ownership, and consent-revocation Pub/Sub; these stay deferred to Spec 237/242. The voice socket owner/fan-out is the DO candidate; PostgreSQL remains consent/revocation authority.

### G2-A — PostgreSQL JTI revocation (implementation status)

`revoked_token_jtis` stores only a SHA-256 JTI digest plus `expires_at`; `NULL` expiry preserves any legacy persistent revocation. Unique-key upserts use PostgreSQL atomic conflict handling and retain the longest expiry; reads are shared across instances and fail closed. The importer uses `TOKEN_REVOKE_REDIS_URL` when configured, otherwise the same Redis URL priority as the Web runtime; it filters expired keys at scan time, verifies every still-active imported digest/expiry against PostgreSQL, emits aggregate counts only, and requires both `AUTH_WRITERS_PAUSED=1` and `JTI_REVOCATION_MAINTENANCE_CONFIRMED=1` for `--apply`. A temporary `JTI_REDIS_ROLLBACK_MIRROR=enabled` bridge writes to that same token-revocation Redis target before PostgreSQL and checks Redis on a PostgreSQL miss; keep it on only during cutover recovery validation, then disable and verify zero G2 Redis calls.

**Tests / Production evidence:** local JTI unit, PostgreSQL integration and late-snapshot rescan tests passed. Latest read-only Production scan at `2026-09-26T13:47:19Z` found 272 active Redis revocations, 0 persistent keys and imported 0. A digest-only comparison found 272 Redis digests absent from PostgreSQL and 1 active PostgreSQL row absent from Redis. These are not a maintenance-fenced import target. Do not treat the earlier counts 275, 273 or this 272 as a final import count.

**Production schema preflight (read-only, 2026-09-26 13:26 UTC):** target `smartspec` is PostgreSQL 15.17; `users.id` is `integer`. The journal has 310 rows through local index 333/tag 0349; the latest Production hash exactly matches local 0349. All four G2 tables exist and there are zero current lock waiters. This check ran in a read-only transaction and made no schema changes. The previous 305-row/0344 result is stale. No approved backup/restore drill evidence is available.

**Current Redis state snapshot (not a maintenance fence):** at `2026-09-26T13:47:19Z`, Redis held 272 active JTI revocations and zero persistent JTI entries. Login, device authorization, and Runner/Worker pairing keys were zero. A read-only DB aggregate found zero active login counters/lockouts, device grants or pairing sessions. Repeat after every writer is paused; zero state at this instant does not prove a maintenance fence.

**Recovery-first order:** no G2 cutover should be declared complete. First verify all Web instances and whether the current source is serving traffic. Obtain a verified isolated backup restore. Announce Maintenance and stop/fence all auth writers. Enable a Redis-first revocation bridge on every writer before accepting further auth traffic. Import the Redis-only revocations into PostgreSQL (272 in the current snapshot), keep the PostgreSQL-only digest in PostgreSQL (1 in the current snapshot), then repeat scans until no Redis-only digest remains. Do not use Redis-only rollback: the raw JTI for the PostgreSQL-only digest cannot be reconstructed. Migration 0345–0349 are already present; do not rerun DDL. Configure and verify the exact keyring on every instance before Runner/Worker pairing tests. Only then test cross-instance JTI deny/expiry, DB failure deny, counters, device replay and pairing. Reopen only after both-store reconciliation, all smoke tests and caller-level telemetry pass. Keep Redis for Voice/G3–G6.

**Acceptance:** enumerate every auth and token caller plus TTL/rotation/impersonation/device flows; prove revoke, password reset, tenant/role change and logout take effect on every web/backend instance; stale/replayed/expired token fails closed; concurrent one-time token consume succeeds once; no cross-tenant identity; outage behavior denies sensitive access safely. Run multi-instance browser/API tests and target synthetic revocation before cutover.

**Rollback/recovery:** keep maintenance active on any failed smoke test. While the bridge is enabled, each new revocation is written to Redis first and then PostgreSQL; a Redis mirror write failure aborts before claiming revocation success, and a PostgreSQL miss consults Redis fail-closed. Re-run the Redis-to-PostgreSQL importer and verify active digests before recovery. PostgreSQL stores only a one-way JTI digest, so a PostgreSQL-only revocation cannot be recreated as a Redis key from the database. Redis-only code is unsafe for the current Production state; recover forward with PostgreSQL-backed code. Never drop PG revocations or copy auth state to KV.

**Old caller closure:** source/reference scan removes active Redis revocation/session lookups; deploy telemetry shows no auth-related Redis commands after the direct cutover; route probes prove all checks use the fresh PG path; tests cover every listed producer/consumer.

### G2-B — Device Authorization

`oauth_device_authorizations` stores only SHA-256 code hashes and uses conditional PostgreSQL state transitions (`pending → authorized → consumed`), expiry checks, and an atomic one-time consume. Tests passed 2/2 across separate DB clients. Production migration 0346 is applied. The latest Redis scan and PostgreSQL aggregate found zero active device authorization state, but no caller-level telemetry or maintenance fence exists; verify again with all writers stopped.

### G2-C — Login Failure Counters

`auth_login_failure_counters` stores a normalized-email digest, count and sliding 15-minute expiry. PostgreSQL upsert increments are atomic across Web instances; success clears the counter and DB errors fail closed. Migrations 0347 and 0349 are applied. The latest Redis and PostgreSQL aggregate scans found zero active counters/lockouts; re-run after pausing writers and obtain caller-level telemetry before closure.

### G2-D — Ephemeral Authorization

Runner connect and Worker connect handshakes use PostgreSQL, not KV. Migration 0348 is applied. The latest database aggregate and Redis audit found zero active pairing state. However, the inspected Web process and its only EnvironmentFile lack `AUTH_SESSION_ENCRYPTION_KEYS_JSON` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID`; new/active pairing operations through this process can fail closed. Keyring parser requires JSON object `{ "key-id": "<canonical base64 encoding of exactly 32 bytes>" }`, a key ID matching `[A-Za-z0-9_-]{1,32}`, and an active ID present in that map. Install it in the secret manager, separately from JWT signing, and confirm identical key IDs/key versions on every Web instance. Voice websocket tickets, active voice ownership and consent Pub/Sub remain Redis dependencies for Spec 237/242.

**G2 readiness:** `BLOCKED_NOT_PRODUCTION_READY` with a detected **partial-state mismatch**. Migrations 0345–0349 are applied, but 272 active Redis revocations are absent from PostgreSQL and one active PostgreSQL revocation is absent from Redis. The serving release SHA and all Web instances are not fully inventoried; the inspected process lacks the rollback-mirror flag and pairing keyring. A restorable backup and approved Maintenance Window are not evidenced. Do not perform Redis-only rollback or reopen auth after further changes until two-way revocation reconciliation is proven. Keep Redis for Voice/G3–G6 and keep `CLOUDFLARE_ACTIVATION=disabled`.

**Browser evidence script:** `apps/web/tests/e2e/cloudflare-search-cache-production.spec.ts` uses local Playwright storage-state file paths for Beta A, Beta B and Admin; it never takes a password/session token as a command-line value or records account identity/search text. It runs a unique real `/v1/responses` web search twice per beta account, records only sanitized `X-Trace-Id`/status/search-call booleans, and checks the Admin Cloudflare tab. The optional KV failure test requires `G1_FAULT_INJECTION_ENABLED=true`, the temporary Worker and Web flag `CLOUDFLARE_SEARCH_CACHE_FAULT_TEST_ENABLED=true`, and an authenticated Admin session sending the one-request `x-sah-cache-test-fault: kv-get` header. The Worker returns simulated 503 before touching KV only for that request; the Web adapter must continue as a cache miss. Disable both flags immediately after evidence collection. No authorized storage-state files, Production base URL or model were available in this environment, so this script was not run.

## G3 — Rate limits, quota and idempotency

**Target/authority:** Cloudflare Workers Rate Limiting for approximate edge abuse control; PostgreSQL remains authority for credits, billing, quotas and business idempotency. Use DO only if exact cross-region admission is required and no existing PG authority is correct. KV is not an atomic counter/lock.

**Acceptance:** inventory each policy, key, route, unit, window, fail-open/closed rule and tenant/user/API-key dimension; prove Cloudflare policy limits burst abuse at the edge; prove financial quota cannot be exceeded under concurrent requests; duplicate idempotency key returns the same business result and cannot repeat a paid effect; verify 429/Retry-After and legitimate-user behavior.

**Rollback/recovery:** restore the previous edge policy for abuse throttles. For quota/idempotency issues, pause the affected mutation and reconcile ledger/idempotency rows before resuming; never restore Redis counters as financial truth.

**Old caller closure:** route-by-route evidence that Redis middleware/client is no longer on the request path; security and concurrency tests plus sampled target decisions; PG ledger/idempotency audit has zero duplicate effects.

## G4 — Locks, leases and semaphores

**Target/authority:** durable job leases/fencing remain in PostgreSQL `worker_jobs`; domain writes use guarded PostgreSQL transactions. DO may serialize a named live resource (for example a voice session or browser admission) only if resource ownership, durable fence/epoch and failure behavior are specified. Never substitute KV.

**Acceptance:** list each lock key, owner, lease TTL/renewal/release, resource and callers; force expiry while an old owner continues; prove stale owner cannot commit after fence changes; exercise worker crash, DO/PG outage, reacquire, duplicate release, and per-tenant fairness; prove no double browser session or provider effect.

**Rollback/recovery:** stop intake for that resource/job family, fence current owners in PostgreSQL, reconcile resource state, then resume the previous or new coordinator only after a single owner is established. Never let independent Redis and DO owners write concurrently.

**Old caller closure:** all acquire/renew/release call sites for a resource point to one authority; race/fencing tests pass; runtime Redis command telemetry has no matching key-prefix operations after cutover.

## G5 — Pub/Sub and realtime

**Target/authority:** durable domain events in PostgreSQL/outbox with event ID and per-stream sequence; Cloudflare Queue delivers durable notifications; DO owns live WebSocket connections/fan-out where required. Live push is a hint; clients fetch canonical state or replay after cursor gaps.

**Acceptance:** enumerate producers, Redis channels, subscriber instances, event schema and retention; prove reconnect/cursor replay, duplicate and out-of-order dedup, sequence-gap recovery, multi-instance delivery, tenant authorization, consent revoke/disconnect and no event loss when DO/socket is offline. For voice, coordinate Spec 237/242 ownership before a DO namespace/class is deployed.

**Rollback/recovery:** stop publishing to the affected topic; retain events in PG/outbox; reconnect clients through the safe endpoint and replay from the last acknowledged cursor. No business event is restored from transient Pub/Sub.

**Old caller closure:** disable each legacy publisher and subscriber; prove no Redis `PUBLISH`/`SUBSCRIBE`/pattern subscription from the active processes; target end-to-end tests cover each producer/consumer and replay path.

## G6 — Queue, scheduler and job state

**Target/authority:** existing Feature 195 PostgreSQL `worker_jobs` + `worker_job_outbox` + dispatch/lease/event contracts remain the only job authority. Cloudflare Queues/Workflows/Containers or approved Runner carry execution only. Do not create a Cloudflare job table/state machine or bypass outbox.

**Acceptance (each family separately):** map all BullMQ queue/worker/scheduler/repeat/delay/DLQ and Celery/Beat broker/result callers; register the canonical executor/allow-list; prove PG job + outbox transaction, duplicate delivery idempotency, retry/backoff, cancellation, timeout, lease reclaim/fencing, DLQ/replay, provider idempotency/ambiguous outcome, shutdown and recovery. Compare family-specific outputs using deterministic/fake providers first; prove a target Worker/Queue/Workflow/Container synthetic job and reconcile its receipt to the original PG job ID. Scheduler has one writer per schedule ID and unique `(schedule_id, scheduled_at, tenant_id)` occurrence.

**Rollback/recovery:** pause that family's intake and scheduler, preserve canonical job IDs and PG state, reconcile provider receipts and active leases, fence Cloudflare executor, then republish only eligible existing job IDs through the last known-good executor. Never blindly replay an ambiguous paid call or create a new job authority.

**Old caller closure:** disable only that family's BullMQ/Celery producer, consumer, scheduler and retry loop; prove no Redis broker/result/queue commands for those keyspaces; compare job creation and terminal receipts in PostgreSQL; retain final runtime and source scans for every process/container/cron image.

## G1 target setup: completed evidence and remaining closure

The target was provisioned with the existing Vectorize Cloudflare credential after its Workers KV permissions were added. No new dependency was installed; Wrangler 4.141.0 ran through `npx`.

- Deployment config: `apps/cloudflare/wrangler.production.jsonc` (`workers_dev:false`, `CLOUDFLARE_ACTIVATION=disabled`, cache KV binding only).
- Namespace: `SEARCH_RESULT_CACHE`, ID `df6d9bead8644d0f8f334f59b6bdfbeb`.
- Worker: `smartspec-cloudflare-runtime`, version `f6f0ba85-3d23-476e-b8af-55840609442d`, custom domain `https://runtime.smartaihub.app`.
- A dedicated `CLOUDFLARE_SEARCH_CACHE_TOKEN` is stored on the Worker and in the Web environment. Secret values are intentionally not recorded here.
- `/healthz` returned HTTP 200; authenticated `/internal/cache/search` probe returned HTTP 200 with `{"ready":true}`. `/readyz` is HTTP 503 because this cache-only Worker has no Hyperdrive/job/workflow/container/media/vector bindings or job handler; job activation remains disabled.
- PostgreSQL provider is `cloudflare_kv`; after restarting `smartspec-web.service`, Web `/healthz` returned `{"status":"ok"}`. The app's SearchResultCache adapter completed an ephemeral write/read roundtrip through the deployed Worker.
- Remaining before G1 closure: exercise one real beta Responses API search then repeat it to capture a cache hit; verify no remaining Redis read/write traffic attributable to SearchResultCache. If needed, rollback by selecting `Disabled` in Admin → Settings → Infrastructure → Redis; the Worker and namespace may remain provisioned.

Reference: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) documents `kv_namespaces`, custom-domain route configuration and per-environment bindings; [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) documents the active-zone and hostname requirements.

## Global Redis retirement gate

Retire Redis only after G1–G6 are individually closed and a final process/deployment audit covers Node, Python, Celery/Beat, systemd, containers, cron, CI/CD, monitoring, backup/restore and secret/network configuration. Required final proof: zero active Redis caller in source/reachability scans; zero Redis command traffic from all production processes after every slice is switched; all expected user flows pass on target; PG job/financial/event invariants reconcile; Redis credentials and service are disabled only after a recoverable snapshot/retention decision. Record actual proof and retirement timestamp. A pre-existing Redis key count or a successful Worker health check is not proof of retirement.
