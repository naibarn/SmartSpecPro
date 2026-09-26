# Redis → Cloudflare Direct Cutover Plan

**Status (2026-09-26):** SearchResultCache is deployed and enabled on the Cloudflare target, but G1 Production verification is incomplete. The deployed Worker `smartspec-cloudflare-runtime` version `f6f0ba85-3d23-476e-b8af-55840609442d` serves `https://runtime.smartaihub.app` with KV namespace binding `SEARCH_RESULT_CACHE` (ID `df6d9bead8644d0f8f334f59b6bdfbeb`). Live health/authenticated probes, synthetic tenant isolation, unauthenticated rejection, PostgreSQL provider selection and an app-adapter roundtrip passed. There are zero legacy SearchResultCache keys in Redis. Real Beta searches for both accounts, Production Search traces, authenticated Admin UI inspection and Redis operation attribution are still missing; do not mark G1 `PRODUCTION_CUTOVER_VERIFIED`. G2-A–D PostgreSQL implementations and focused tests now exist locally; the JTI Redis dry-run found 277 active revocations and imported zero. Production migrations/import/caller cutover have not occurred. `CLOUDFLARE_ACTIVATION=disabled`; G3–G6 remain open.

## Operating rules

- Direct cutover is allowed with an announced maintenance pause; no 14–30 day observation gate. Pause only the affected workload. The two beta users can be asked to stop submitting work during a cutover.
- PostgreSQL and existing `worker_jobs` + outbox stay the transactional source of truth. Cloudflare Queues, Workflows, Containers, Workers and Durable Objects are execution/coordination targets, never a second job authority.
- KV is only for disposable/read-mostly cache entries. Never put sessions, revocations, counters requiring exact global limits, locks, leases, credits, job state, or durable events in KV.
- Cut over one responsibility at a time. Stop intake, drain or reconcile in-flight work, fence the old writer, switch the one owner, probe a real operation, and resume. Never dual-write business effects.
- A source scan or local test is not production proof. Each release record names environment, Worker version, route/binding, timestamp, operator and sanitized probe/test output. Do not put secrets in evidence.

## Dependency order and readiness

| Order | Group | Destination/authority | Readiness now | Why this order |
|---|---|---|---|---|
| 1 | G1 SearchResultCache | Workers KV; cache loss is a miss | Target deployed/enabled; authenticated probe and real app-adapter set/get passed. Browser guide/switch test passed at 3 viewports against mocked unconfigured state. Typecheck has 632 repository-wide errors. Real beta Responses API cache-hit and Redis caller/traffic closure remain open. | Isolated and disposable; no job/auth dependency. |
| 2 | G2 auth/session/revocation | Fresh PostgreSQL authority; limited DO coordination; KV hints are never authoritative | Partial. Caller, session, expiry and revocation keyspace/runtime ownership not complete. | Must establish safe identity/revocation contract before moving realtime session ownership. |
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

**Current evidence:** existing Worker was not redeployed. `/healthz` and authenticated cache probe returned HTTP 200; synthetic tenant A/B entries remained isolated and tenant C returned empty; unauthenticated probe returned 401. PostgreSQL selects `cloudflare_kv`; Redis scan found zero `search_cache:*` entries. Adapter failure-injection tests passed, but are not Production KV fault injection. Production Search for either Beta user, Production Admin UI, correlated Search traces, and active Redis command attribution remain unverified. `/readyz` is 503 because unrelated job/runtime bindings and a job handler are absent; job activation remains disabled.

## G2 — Auth, session and revocation

**Target/authority:** read current permission, tenant, session and revocation from PostgreSQL using a fresh path for security decisions. A DO may coordinate a live socket/session but must not become the revocation source of truth. KV is not permitted for an authorization allow decision.

**Source audit (2026-09-26):** `_core/revocation.ts`, `deviceAuthRoutes.ts`, and the Runner/Worker connect state now use PostgreSQL in this worktree; Production still runs the prior Redis version until migrations/import/deploy. `revokeJti`/`isJtiRevoked` callers are `authz.ts`, `sdk.ts`, `deviceAuthRoutes.ts`, `routers.ts`, `routers/users.ts`, `connectedDeviceService.ts`, `hermesAgentPairingService.ts`, `workerAuthService.ts`, and `runnerAuthService.ts`. Voice uses Redis for one-time 30-second websocket tickets, 300-second active-session ownership, and consent-revocation Pub/Sub; these stay deferred to Spec 237/242. The voice socket owner/fan-out is the DO candidate; PostgreSQL remains consent/revocation authority.

### G2-A — PostgreSQL JTI revocation (implementation status)

`revoked_token_jtis` stores only a SHA-256 JTI digest plus `expires_at`; `NULL` expiry preserves any legacy persistent revocation. Unique-key upserts use PostgreSQL atomic conflict handling and retain the longest expiry; reads are shared across instances and return revoked on a database error. `apps/web/scripts/migrate-jti-revocations.ts` is dry-run by default, scans only the configured literal revocation prefix, imports hashes/expiry (including persistent entries), emits aggregate counts only, and requires `JTI_REVOCATION_MAINTENANCE_CONFIRMED=1` for `--apply`. It has not been run with `--apply`.

**Tests:** unit contract 5/5 and PostgreSQL integration 2/2 passed on the dedicated `smartspec_test` database. Production dry-run found 277 active Redis revocation keys, 0 persistent keys and imported 0. The Production DB does not yet have `revoked_token_jtis`; Production still uses Redis. No Production caller is closed.

**Direct cutover order:** (1) apply migration `0345_feature_245_postgres_jti_revocations.sql` through the approved DB migration path; (2) keep the JTI importer in dry-run and verify counts without printing identifiers; (3) pause login, token issuance, refresh, revoke, device/worker/runner auth flows across every Web instance; (4) rerun dry-run while paused, then apply with `JTI_REVOCATION_MAINTENANCE_CONFIRMED=1`; (5) deploy the PG-backed revocation code and restart every Web instance while auth remains paused; (6) verify imported revocations fail closed across two connections, expiry works, new revocations are shared, and DB failure denies; (7) resume auth. Keep Redis running for G2-B–D/G3–G6. If any check fails, keep auth paused and deploy the last-known-good Web version; the unmodified Redis snapshot remains available to rerun the importer. Never remove imported PG revocations during rollback.

**Acceptance:** enumerate every auth and token caller plus TTL/rotation/impersonation/device flows; prove revoke, password reset, tenant/role change and logout take effect on every web/backend instance; stale/replayed/expired token fails closed; concurrent one-time token consume succeeds once; no cross-tenant identity; outage behavior denies sensitive access safely. Run multi-instance browser/API tests and target synthetic revocation before cutover.

**Rollback/recovery:** pause login/token issuance or the affected sensitive action while reconciling. Do not roll back to a checker that misses newer revocations. Replay/repair the PostgreSQL revocation/session records first, then restore availability. Never recover by copying authorization state into KV.

**Old caller closure:** source/reference scan removes active Redis revocation/session lookups; deploy telemetry shows no auth-related Redis commands after the direct cutover; route probes prove all checks use the fresh PG path; tests cover every listed producer/consumer.

### G2-B — Device Authorization

`oauth_device_authorizations` stores only SHA-256 code hashes and uses conditional PostgreSQL state transitions (`pending → authorized → consumed`), expiry checks, and an atomic one-time consume. Tests passed 2/2 across separate DB clients, including replay and expiration. Production has not applied migration 0346. Before cutover, pause device-code issuance and wait up to its 10-minute maximum lifetime; verify the old Redis device-code prefix is empty before deploying the PostgreSQL caller. If it cannot drain, export/import active grants using a reviewed one-time migration tool before switching.

### G2-C — Login Failure Counters

`auth_login_failure_counters` stores a normalized-email digest, count and sliding 15-minute expiry. PostgreSQL upsert increments are atomic across Web instances; success clears the counter and DB errors fail closed. A 12-concurrent-request integration test across two clients passed. Production has not applied migration 0347 and still runs the Redis implementation.

### G2-D — Ephemeral Authorization

Runner connect and Worker connect handshakes are correctness/security state shared across instances, so they move to PostgreSQL, not KV. Migration 0348 stores one paired row per device code with SHA-256 device/user-code lookup indexes, an AES-256-GCM encrypted session payload and expiry. Writes update both indexes atomically in one row; approved Worker sessions retain their existing 2-minute TTL, other pairing states retain 15 minutes. A two-client PostgreSQL integration test passed. Production has not applied migration 0348. Voice websocket tickets, active voice ownership and consent Pub/Sub remain Redis dependencies for Spec 237/242 and have not moved.

**G2 readiness:** G2-A–D implementations/tests exist locally, but the group is **not cut over**. Production migrations 0345–0348, JTI import and a coordinated auth maintenance window remain mandatory. Before deploying G2-D, confirm every Web instance shares the same existing `JWT_SECRET` (used only as the encryption-key input; never log it). Acceptance requires all auth/pairing flows paused across every Web instance, migration application, a fresh Redis revocation import, device-grant drain, deployment, multi-instance probes and proof that revoked tokens remain denied before resuming traffic. Keep Redis for G3–G6 and deferred Voice dependencies.

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
