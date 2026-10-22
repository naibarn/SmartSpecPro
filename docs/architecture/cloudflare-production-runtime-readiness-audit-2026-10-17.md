# Cloudflare Production Runtime Readiness Audit

**Audit date:** 2026-10-17 (Asia/Bangkok)
**Source:** configured `origin/main`, commit `4b618cf901df7405009b11f6783dfcd3ebce0187`
**Scope:** production Web/API runtime placement on Cloudflare while PostgreSQL remains on its current host; no production changes, migrations, credential reads, or account mutations were performed.

## 1. Executive summary

### Reassessment for the expanded migration objective (2026-10-21)

The requested outcome is now broader than the original audit: move all SmartAIHub serving and background application duties from Debian to Cloudflare while leaving the existing PostgreSQL database and host in place. This audit's earlier “first slice” recommendation is not a completion plan for that outcome. Current code and the exact staging canary establish a bounded static/HTTP Container path, but not full-runtime replacement.

The latest integrated staging canary was built from `dbcaa592a8f402569360c811c78a1ddc563c6a54`, qualified the Node and Python Container images plus the retained-database health path, then restored the baseline and stopped all instances. That is staging-only evidence. The current production Worker template remains activation-disabled and only declares the existing runtime/SPEC-260 routes; it does not provide full application route ownership. The application HTTP Container profile, bridge and DO identity are all explicitly staging-only. Source now has two default-off staging paths: an immutable `staging-full-http-v1` capability routes manifest-classified auth/tRPC/REST/upload traffic to the bounded Node Container, and the realtime selector forwards only the voice, runner-control and widget WebSocket endpoints. Both generate edge-origin attestation at the Worker boundary, reject spoofed forwarding headers, preserve browser cookies and fail closed without retrying writes against the origin. The full HTTP selector is carried by the existing immutable Admin deployment descriptor, not an ad-hoc Worker flag. These source paths have focused unit coverage but have not been live-qualified; Socket.IO and `/ws` remain on the existing runtime. `apiRouteManifest.ts` still classifies those application APIs as origin-owned by default.

The important database constraint is architectural: Worker Hyperdrive/VPC bindings are available to Worker code, but are not automatically inherited by a Node/Python process inside a Cloudflare Container. Existing Container canary success for one Python database health request is not proof that all Node/Python SQL operations, transaction semantics, pool load or failover work. Cloudflare Containers support controlled outbound HTTP handlers and Worker binding access, so a private database connectivity/data-access design must be explicitly selected and tested. Do not make the old PostgreSQL listener public as a shortcut. Current provider metadata has no production deployment target/policy, so production deployment, broad routes, DNS changes and database-network changes remain outside the available authority.

The canonical Cloudflare job executor is also intentionally narrow despite having Queue/Workflow/Container/Worker App transport adapters: source currently admits `emergency.report.intake` (`short`, `feature-186-v1`) and a separate bounded `python.legacy_task` media-probe case. The adapters alone do not transfer existing AI/media/scheduler job families from the Debian workers.

Cloudflare product references for the current connectivity boundary: [Workers VPC](https://developers.cloudflare.com/workers-vpc/), [private database with Hyperdrive](https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/), and [Container outbound handlers](https://developers.cloudflare.com/containers/configuration/outbound-traffic/). These describe platform capability, not provisioned account resources or permission.

**Overall readiness: BLOCKED for production Web/API cutover; PARTIAL for bounded Cloudflare slices.** The repository contains a real Cloudflare Worker package, a disabled production Wrangler template, targeted SPEC-260 emergency API routes, search-result KV cache code, and canonical queue/control-plane adapters. This is meaningful groundwork, but it is not a Cloudflare-hosted replacement for the SmartAIHub Web/API application.

The current Web application is a large Express/Node service that serves the browser bundle, connects directly to PostgreSQL, starts schedulers, exposes long-lived streams and WebSockets, and includes routes with filesystem, native binary, browser, media, and subprocess dependencies. The Python FastAPI backend and specialized Node/Python workers also carry runtime-bound work. The appropriate first move is to publish the already-built static browser assets to Cloudflare and route one small, stateless, same-origin API slice through the existing Worker boundary; keep the current application and job executors on their existing runtime until each route or job family passes its own gates.

The key safety blockers are: (1) recent available production evidence is from 2026-09-28 and reports public Web/API 502s, a disabled/not-ready Worker, and PostgreSQL/Redis listeners on wildcard addresses; (2) the current host-local PostgreSQL endpoint is reported on the same `smartspec` host used by the production runtime, while the host snapshot does not establish development/production workload isolation; (3) no current Cloudflare runtime connectivity, deployment, rollback, or live database evidence is available; and (4) the Cloudflare Worker must not become a second executor for jobs already owned by existing workers.

This audit found overlapping planning authorities. SPEC-267 claims it supersedes SPEC-245 and SPEC-232, but the canonical index currently labels SPEC-267, SPEC-245, SPEC-232, and SPEC-224 `DORMANT_UNRESOLVED` with `UNRESOLVED` authority. SPEC-295 also covers production environment, deployment, migration, and runtime operations. Do not create another SPEC number. Reconcile registry ownership and place the production migration sequence under the existing authoritative SPEC after that reconciliation; keep SPEC-224 as a lifecycle contract only.

### Final status requested

- **READY services:** isolated Worker health endpoint and bounded KV search-cache implementation exist in code; static browser assets are independently deployable in principle. Production readiness for these is not established.
- **READY_WITH_CHANGES:** static web delivery; SPEC-260 edge routes; Hyperdrive/VPC PostgreSQL connectivity; private R2 access; selected short, idempotent queue steps.
- **BLOCKED:** full Web/API replacement, production Hyperdrive connectivity, broad auth/OAuth migration, general AI Gateway, Cloudflare ownership of existing jobs, production deployment/cutover.
- **KEEP_ON_EXISTING_RUNTIME:** native/browser/media-heavy API routes, Python backend capabilities, coding/testing/computer-use runners, and job families lacking a proved single execution owner.
- **UNVERIFIED:** current public health, deployed SHA, live binding connectivity, current database port exposure, current Cloudflare account write/dispatch permissions, latency, schema parity, recovery, and rollback.

**Recommended first migration slice:** static SPA assets only, on a non-production hostname, using the existing browser build and a Worker assets binding, with the existing API origin unchanged. The next API slice should be one read-only, tenant-scoped endpoint that already has an explicit route contract and does not depend on sessions, filesystem, streaming, jobs, or provider calls. SPEC-260 routes are already a candidate Worker slice but have their own origin attestation, tenant, auth, domain, R2, and retention acceptance gates; they are not a proxy for full application readiness.

## 2. Evidence and method

Evidence tags used below:

- `VERIFIED_BY_CODE` — directly inspected at the source revision above.
- `VERIFIED_BY_TEST` — a test artifact exists in source. Tests were not run for this audit, so existence is not a passing result.
- `VERIFIED_BY_RUNTIME` — a time-bound runtime observation exists in the repository; it proves only that snapshot.
- `DOCUMENTED_ONLY` — a spec, README, or plan states an intended contract, not runtime capability.
- `UNVERIFIED` — evidence was unavailable or stale for a present-day claim.

The audit read application entrypoints, package manifests, Docker/Compose topology, Cloudflare package/configuration, selected API/auth/storage/job adapters, SPEC index/status and relevant existing SPECs, CI/deployment workflows, and available Cloudflare/host evidence. No tests were run; no Cloudflare credentials, production secrets, or database were accessed. The production observations cited below are from 2026-09-28/29, not a fresh 2026-10-17 probe.

Key evidence files:

| Evidence | What it supports | Limit |
|---|---|---|
| `apps/cloudflare/README.md`, `apps/cloudflare/src/index.ts`, `apps/cloudflare/wrangler*.jsonc` | Worker routes, activation/readiness contract, bindings, scoped API routes | Source only; deployment/binding use unverified |
| `apps/web/server/_core/index.ts`, `apps/web/server/db.ts`, `apps/web/server/storage.ts` | Node app, DB pool, storage paths | Source only |
| `apps/web/Dockerfile`, `docker-compose.full.yml`, `scripts/deploy-prod.sh` | Current container runtime and deploy mechanism | Compose file is configuration; live topology can differ |
| `ops/feature-245/evidence/production-host-readonly-2026-09-28.yaml` | Historical host, ingress, listener and health snapshot | Stale; does not prove today's runtime state |
| `ops/feature-245/evidence/production-host-database-readonly-2026-09-28.yaml` | Historical local DB version/head and host-local endpoint | Stale; does not prove current DB state or Hyperdrive target |
| `ops/feature-245/evidence/cloudflare-permission-probe-2026-09-29.yaml` | Read permissions and missing dispatch namespace permission at that time | Read-only probe; no write/connectivity certification |
| `apps/cloudflare/src/*.test.ts`, `apps/web/scripts/__tests__/verify-cloudflare-target-readiness.test.ts` | Local contract/readiness test coverage exists | Not executed here; cannot establish production readiness |

## 3. Current architecture from source

```text
Browser / Mini Apps / tenant domains
          │ Cloudflare DNS/Tunnel (historically observed)
          ▼
Linux/Docker host: Express Node Web + Vite-built SPA ── PostgreSQL
          │                                       ├── Redis/Celery/BullMQ responsibilities
          │                                       ├── R2/S3-compatible storage
          ├── Python FastAPI backend               └── worker_jobs + outbox authority
          ├── Node/Python job workers
          ├── Linux/Windows/desktop runners and native tools
          └── control-plane / specialist execution services

Separate Cloudflare Worker package:
  health/readiness + KV search cache + SPEC-260 route proxy + queue/control-plane adapters
```

The source Compose configuration defines PostgreSQL, Web, Python backend, Node/Python workers, Redis and other services in the same full stack. PostgreSQL is bound to `127.0.0.1:5432` in `docker-compose.full.yml`. However, the historical production host snapshot reports `5432` and `6379` listening on wildcard addresses. Treat the difference as a material configuration/runtime discrepancy and recheck the live host before any private Worker path is enabled. The historical host evidence identifies a single host named `smartspec` for production services and a host-local `DATABASE_URL`; the current audit cannot establish whether development workloads share that physical host now. If they do, moving Web CPU away will not isolate database CPU, memory, I/O, connection slots, or noisy-neighbor effects.

The Worker package is not the full Express app. `apps/cloudflare/src/index.ts` exposes health/readiness, internal search cache, canonical job publication/consumption, and the route manifest for SPEC-260 emergency APIs. `wrangler.production.jsonc` maps `runtime.smartaihub.app` and emergency API patterns; it does not route all `/`, `/api/*`, auth, tRPC, Mini App, or API subdomains to Cloudflare. Both Wrangler configs keep `CLOUDFLARE_ACTIVATION` disabled. The production template declares queues/KV and routes, while README requires pipeline-injected bindings and dedicated secrets; there is no checked-in Worker deploy workflow in `.github/workflows`.

The primary production deploy script builds and starts Docker Compose (`scripts/deploy-prod.sh`), not Wrangler. The app's browser code is built separately by Vite, while production starts `server/_core/index.ts` under Node (`apps/web/Dockerfile`, `apps/web/package.json`). The API server creates a Node HTTP server, attaches WebSocket upgrade handlers, runs startup tasks and schedulers, and uses an in-process Postgres client (`apps/web/server/_core/index.ts`, `apps/web/server/db.ts`).

## 4. Service-by-service readiness matrix

| Service / capability | Status | Evidence and reason |
|---|---|---|
| Vite browser bundle / static SPA | `READY_WITH_CHANGES` | `apps/web` has a Vite build and `apps/web/Dockerfile` copies `dist`; static assets can be hosted separately. No current Cloudflare assets configuration, build artifact receipt, SPA fallback test, cache policy proof, or custom-domain validation is present. (`VERIFIED_BY_CODE`, deploy `UNVERIFIED`) |
| Full Web shell, SSR/dev middleware, Mini App host routing | `BLOCKED` | Production uses Express/Node. Host-sensitive routing exists in `apps/web/server/_core/vite.ts`; API application is not registered as a Worker app. Mini App/custom-domain resolution and same-origin cookies need route-by-route proof. (`VERIFIED_BY_CODE`) |
| General Node/tRPC/REST APIs | `BLOCKED` as a wholesale Worker move; `KEEP_ON_EXISTING_RUNTIME` pending decomposition | `apps/web/server/_core/index.ts` mounts the large route set and Node HTTP server. Native APIs and package imports exceed the compatibility surface proven by `nodejs_compat`; no full Worker bundle/build has been demonstrated. (`VERIFIED_BY_CODE`; Cloudflare Node docs confirm Node compatibility is a subset) |
| SPEC-260 emergency API routes | `READY_WITH_CHANGES` | Explicit route manifest and proxy exist in `apps/cloudflare/src/spec260*`; production routes are declared. Needs private-origin bypass, dedicated edge/control-plane tokens, tenant/custom-domain route parity, R2 policy/lifecycle and live same-origin acceptance. (`VERIFIED_BY_CODE`, tests exist, runtime `UNVERIFIED`) |
| Static assets / CSS / downloads | `READY_WITH_CHANGES` | Browser bundle is separate, but downloads and protected file streaming currently use Node storage routes. Move public immutable assets first; preserve protected downloads through authorized APIs. |
| PostgreSQL Web access | `READY_WITH_CHANGES` | Web currently uses `postgres` (postgres.js) + Drizzle in `apps/web/server/db.ts`, with pool default 5 and 10s connect timeout. Hyperdrive adapter is a separate contract. Need a least-privilege role, private VPC path, schema/migration parity, TLS, session/transaction compatibility and connection/load measurements. (`VERIFIED_BY_CODE`) |
| Auth, cookies, OAuth and sessions | `BLOCKED` for migration | Auth is coupled to app/DB/Redis decisions. Existing source includes PostgreSQL auth state and Redis compatibility paths; cookies/callbacks are bound to app origin and secrets. Keep the established auth issuer and cookie semantics on existing runtime for the first slice. No cross-runtime production cookie/OAuth proof. |
| Tenant ACL / API keys / rate limits | `KEEP_ON_EXISTING_RUNTIME` initially | Authorization middleware and business routes are in the canonical app. A Worker may attest/route but must not independently recreate tenant authorization, API key policy, or rate counters. Prove forwarded host/tenant context and fail-closed behavior before moving a decision boundary. |
| AI Gateway / provider routing and streaming | `KEEP_ON_EXISTING_RUNTIME` initially | Node and Python own provider selection, timeouts, usage/credit settlement, and SSE streaming. Worker transport can proxy bounded requests but does not replace the business accounting boundary. No Cloudflare provider routing/credit proof. |
| WebSockets / SSE / live browser / voice | `BLOCKED` for blanket migration | Node uses `ws` upgrade handlers for voice, runner control, and widgets; multiple routes emit SSE (`voiceGateway.ts`, notification/public event/presentation/orchestrator routes). Must separately test WebSocket termination, hibernation, reconnect, backpressure, replay, auth refresh and per-tenant limits. |
| Canonical short queue dispatch | `READY_WITH_CHANGES` | Worker Queue producer/consumer and fail-closed logic exist. Keep PostgreSQL `worker_jobs`/outbox as sole state authority; queue is transport. Enable only one executor family at a time after fencing and duplicate-execution proof. |
| Long-running media, browser, code/test, native jobs | `KEEP_ON_EXISTING_RUNTIME` | Docker image includes Python, Chromium, FFmpeg, PostgreSQL client, fonts; Node/Python workers and native runners execute jobs. They need processes, filesystem, native tools, long duration or interactive host access. Cloudflare Containers/Workflows could be candidates only after individual qualification; do not move runner workloads wholesale. |
| R2 media/library objects | `READY_WITH_CHANGES` | `apps/web/server/storage.ts` supports S3/R2-compatible storage and local fallback; Worker has R2 binding contract. Need tenant-scoped signed upload/download, object ACL, multipart/size limits, CORS, staging cleanup, integrity checks and proof that app never relies on local fallback. |
| Vectorize / RAG | `READY_WITH_CHANGES` for the vector adapter; keep retrieval composition initially | Python has a Cloudflare Vectorize store; Worker contract supports vector upsert/query/delete. Retrieval also depends on Python services, provider calls and tenant filters. Establish one index writer and prove tenant-scoped query/delete before routing. |
| MCP endpoints | `KEEP_ON_EXISTING_RUNTIME` initially | MCP registry/server is in the Node app and uses DB-backed tenant/provider configuration. No standalone Worker routing or session parity evidence. |
| Scheduled jobs / reconciliation | `BLOCKED` for transfer | Worker has cron configuration and scheduler adapters; existing app/Python/Redis/Celery schedules remain. Each schedule needs one declared owner, durable cursor/idempotency and fencing before a cron is enabled. |
| Existing coding/testing/computer-use runners | `KEEP_ON_EXISTING_RUNTIME` | Native Linux/Windows/desktop runner functionality is explicitly host-bound; preserve current Runner/SPEC-224 execution and task-control contract. Cloudflare must not become a second runner or alter finality/acceptance ownership. |

## 5. PostgreSQL connectivity assessment

### Recommended path while keeping the current PostgreSQL host

1. Retain the existing PostgreSQL instance and data as the sole system of record. Do not move, replicate as a writable primary, or change ownership in this phase.
2. Reconcile current bind/firewall state first. PostgreSQL should be reachable only from its private Docker/host network and the explicitly approved `cloudflared` connector. No public listener/port is part of this plan.
3. Use Cloudflare Workers VPC TCP service over an outbound Cloudflare Tunnel connector located on the private DB network; attach Hyperdrive to that VPC service. Cloudflare documents this path for private PostgreSQL and supports self-hosted Postgres through VPC/Hyperdrive. This is a proposed design, not provisioned evidence. [Workers VPC overview](https://developers.cloudflare.com/workers-vpc/), [private database example](https://developers.cloudflare.com/workers-vpc/examples/private-database/).
4. Give Hyperdrive a dedicated, least-privilege DB role. Separate read-only pilot access from write access. Restrict role grants by schema/table/function and avoid giving migration ownership to request-serving Workers. Keep migrations owned by the existing release/migration process and run only with an explicitly authorized migration job.
5. Use TLS with certificate verification (`verify_ca` or `verify_identity` where host/certificate names permit it), enforce connection/query/statement budgets, and monitor connection count, transaction duration, query latency, lock waits, CPU, memory, disk I/O, and tunnel health.
6. Run tenant isolation, ACL, row-scope, schema parity, and DB grant tests against a disposable staging clone with production-like schema. A local mock cannot prove Worker-to-current-host network connectivity.

### Driver and transaction findings

- `apps/web/server/db.ts` uses postgres.js/Drizzle with a per-process pool (default max 5). Python uses SQLAlchemy/asyncpg in `python-backend/app/core/database.py`; background jobs may maintain separate pools. Aggregate connection demand must include all Node/Python/worker/runner instances, Hyperdrive configured pool capacity, and operator/migration sessions.
- `apps/cloudflare/src/hyperdrive.ts` is an adapter contract, not yet shown wired to the canonical repository. It returns transaction wrapper behavior and retries only SQLSTATE `40001`/`40P01`; retry safety depends on the caller keeping side effects outside retried transactions, as its own contract notes.
- The helper hard-codes `prepare: false`. Cloudflare's current Hyperdrive guidance specifically warns that `prepare: false` with postgres.js can hang/fail intermittently in transaction pooling. The current helper is driver-injected and has no production caller in the scanned package, so this is a compatibility risk to resolve before binding it to postgres.js, not proof that a live DB call is failing. [Connect to PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/), [connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/).
- Hyperdrive transaction pooling does not support all session-level PostgreSQL features. Inventory SQL using advisory locks, LISTEN/NOTIFY, session state, temporary tables, prepared statements and migration DDL before selecting it. Query-level transactions are supported but hold a backend connection for transaction duration.
- A host-local source snapshot reported PostgreSQL 15.17 and a migration head at `0349`, while source migrations extended through `0365`. This is a dated September 28 observation, not current schema evidence. Resolve the current production schema/source head drift through the DB owner before a Cloudflare writer pilot. Do not have Cloudflare apply migrations.
- A single existing PostgreSQL host remains a single point of failure and a shared resource boundary. Workers scale-out increases concurrent DB demand; Hyperdrive pools origin connections, but does not provide database HA, backup, recovery, or capacity. No latency, connection-limit, backup-restore, or failover evidence was available.

### What local checks can and cannot prove

Local tests can verify SQL adapter construction, bounded transaction semantics, tenant predicates, migrations as static artifacts, and queue retry/idempotency behavior with fixtures. They cannot prove Cloudflare account binding correctness, VPC/Tunnel reachability, origin TLS, live DB grants/schema, production latency/egress, HA, backup restore, or Cloudflare-to-host outage behavior. Those require a provisioned non-production Cloudflare account and authorized private network/database credentials; production credentials are not needed for Phase 1.

## 6. Authentication, security, AI, storage and tenant boundaries

- Preserve the existing auth issuer, cookie name/domain/path, secure/SameSite behavior, logout/revocation checks, CSRF policy, OAuth callback origins, and JWT key ownership for the static-asset and read-only API pilot. Do not issue a second independent session or token authority in Workers.
- Keep Redis-backed compatibility decisions on their existing owner until a fresh inventory proves each responsibility and its replacement has converged. Existing evidence says Redis remains active for voice/pub-sub and unmigrated queue families, and records auth reconciliation/keyring concerns. No auth-wide Redis retirement is implied by the Cloudflare slice.
- `apps/cloudflare/src/index.ts` forwards selected SPEC-260 routes to the canonical platform; it is designed not to validate user sessions itself. Require the dedicated edge attestation token, separate control-plane token, private origin host allowlist, original host/protocol validation, and existing route ACL at the platform. Do not reuse the general internal gateway token.
- Forwarded tenant identity must be derived and checked by the canonical platform. Tenant IDs, user IDs, request host, custom-domain mapping, API key scope, credit owner, and rate-limit bucket must not be trusted from caller-controlled headers. Test cross-tenant reads, writes, object URLs and cache-key collisions.
- Keep provider selection, API key decryption, token accounting, credit reservation/settlement/refund, model budgets and provider timeout policy on the existing Gateway/service authority. A proxy can stream only after disconnect cancellation, total deadline, partial usage accounting, retry and duplicate settlement are verified.
- Use R2 for direct object storage only after access-policy review. Keep sensitive files private and tenant-authorized; do not expose bucket-level public reads. Ensure temporary upload prefixes have lifecycle expiry and promoted object checksums/metadata. Existing S3-compatible/local fallback means “R2 configured in code” is not proof that every production object is in R2.
- MCP, retrieval/RAG and Mini App routes carry DB-backed configuration and tenant context; keep them behind canonical auth and application routing until their route map and custom-domain behavior are tested in staging.
- Production and staging need distinct Worker scripts/configs, databases roles, queues and DLQs, buckets/prefixes, KV, secrets, tunnel/VPC services, origins, callback URLs and log sinks. The production Wrangler template currently names queue/KV resources; README says other bindings/secrets are injected by an approved pipeline. Never copy production secret values into dev or test evidence.

## 7. Background execution ownership

`worker_jobs` plus its outbox/events/lease/fencing/idempotency remain the business execution authority. Cloudflare Queues are delivery transport, and Cloudflare Workflows are a possible durable step engine only where the canonical job contract allows them. Queue consumers must validate ownership, acquire a current lease/fence, record attempts, settle through canonical control-plane APIs, and make duplicate delivery harmless. No production activation until the same family cannot be claimed by the old worker and Worker consumer concurrently.

| Work class | Placement decision | Required single-owner rule |
|---|---|---|
| Bounded control-plane delivery, cache refresh, small idempotent webhook fan-out | Cloudflare Queue/Worker candidate | One active consumer per job family; canonical DB lease/fence gates every effect |
| Retryable multi-step tasks with bounded external calls | Workflow candidate after proof | Workflow instance ID is derived from canonical job/attempt; canonical settlement still in `worker_jobs` |
| CPU/native/large media/browser/video/rendering | Existing Linux/Windows or approved Container/Runner after family assessment | One executor registry/lease; no Cloudflare + existing worker dual claims |
| Coding, tests, computer use, interactive/native tooling | Existing approved Runner | SPEC-224 task authority and current Runner fencing remain unchanged |
| Cron/scheduler/reconciliation | Keep current owner until cutover | One schedule owner; durable cursor and schedule epoch; disable old only after new-owner observation and rollback test |

The existing Worker Queue consumer has retry and dead-letter configuration in `wrangler.production.jsonc`; source code also requires binding/readiness and activation gates. Tests exist, but no live producer/consumer, lease expiry/reclaim, duplicate settlement, DLQ repair, credit settlement, approval reconciler, or old-consumer exclusion receipt was available. SPEC-277's existing outbox/worker authority remains a contract dependency; do not add a competing receipt authority. SPEC-224 remains the development lifecycle/finality owner and does not need changes to support Web hosting migration.

## 8. Blocking issues

| Severity | Blocker | Evidence / root cause | Resolution gate |
|---|---|---|---|
| **Critical** | Production Worker is deployed but not ready; public route attachment is unproven | The Sep 28 baseline (502 on the app/API) is stale. A fresh read-only probe on 2026-10-22 returned 200 for `smartaihub.app/` and healthy for `api.smartaihub.app/health` (database, worker_jobs, and llm_proxy healthy); `api.smartaihub.app/readyz` is 404. `runtime.smartaihub.app/healthz` identifies the Cloudflare Worker and returns 200, but `/readyz` returns 503: activation disabled, job handler unconfigured, and HYPERDRIVE, JOB_QUEUE, JOB_WORKFLOW, JOB_CONTAINERS, WORKER_APP, MEDIA_BUCKET and VECTOR_INDEX all absent. Requests to configured `/api/*/emergency/*` paths on `smartaihub.app` currently reach the Linux app fallback and return 404, so production route attachment has not been proven. | Keep the Linux app as serving origin. Use authorized Cloudflare account inventory to reconcile live script/version, exact bindings/secrets and zone routes against `wrangler.production.jsonc`; validate one route with a canary before expanding. Capture deployed SHA, serving replicas and rollback target. Do not enable Worker activation while required bindings and handler are absent. |
| **Critical** | DB exposure/network boundary discrepancy | Compose binds DB on loopback; host snapshot reports wildcard 5432/6379 listeners. | DB owner confirms actual bind, firewall, Docker publish, `pg_hba`, TLS and tunnel path. DB is not exposed publicly. Resolve discrepancy before VPC/Hyperdrive. |
| **Critical** | App is not a drop-in Worker | Express Node server, `http.createServer`, background startup schedulers, `ws`, many Node/native/filesystem/process consumers; Worker package routes only bounded areas. | Use additive decomposition: static UI first; route allowlist/proxy for proven APIs; retain incompatible routes on existing runtime. Require route-by-route compatibility tests. |
| **Critical** | No current live private PostgreSQL proof or capacity budget | Hyperdrive binding/adapter contract only; no account binding or private network acceptance. Shared DB host capacity and current schema are unknown. | Non-production tunnel/VPC/Hyperdrive connection, role grant review, schema parity, pool sizing, load/latency/error/rollback evidence. |
| **Critical** | Potential DB driver/Hyperdrive incompatibility | Hyperdrive helper hard-codes `prepare:false`; official guidance warns against this with postgres.js in transaction pooling. No current production caller found. | Select and pin the exact driver/options; add live staged query + parameter + transaction/prepared-statement compatibility tests before using helper. |
| **Critical** | Job duplicate execution / ownership not proven | Worker queue plumbing exists while host snapshot shows active Node worker, Redis and Celery Beat. | For each family, prove old/new claim exclusion, fencing, idempotency, settlement and rollback. Keep all unproven families on current owner. |
| **High** | No production deployment/rollback pipeline evidence | `scripts/deploy-prod.sh` deploys Docker Compose. No checked-in Wrangler deployment workflow found. Permission evidence is read-only and incomplete; Workers for Platforms dispatch namespace probe returned 403. | Approve a repeatable staging deploy with secret injection, pinned SHA, smoke checks, canary routing and tested rollback. Resolve precise account scopes for the selected service only. |
| **High** | Auth/OAuth/session continuity unproven across edge/origin | Existing cookie, Redis revocation compatibility, OAuth callbacks and secrets are app-origin specific. | Synthetic staging browser tests cover login, refresh, logout, revocation, CSRF, OAuth callback, custom domains, CORS and tenant boundary. |
| **High** | Tenant/custom-domain routing incomplete for broad app | Wrangler production route list covers runtime hostname and SPEC-260 paths on named zones, not all app/API routes or every tenant domain. | Enumerate domains and route manifest; validate Host/original scheme and domain ownership resolution before each route activation. |
| **High** | Runtime/schema drift and ownership unresolved in SPEC registry | Sep 28 DB evidence records migration head 0349 vs source 0365; canonical index reports relevant migration specs as unresolved. | Fresh schema snapshot and registry authority reconciliation before assigning implementation work; do not apply migrations from Workers. |
| **Medium** | Resource/cost budget unknown | No request counts, CPU profiles, storage/operation rates, DB egress, RTT or production invoice dataset included. | Baseline one month of request/CPU, R2 bytes/classes, Queue ops/retries, workflow steps/state, DB QPS/bytes/RTT and origin uplink/network costs. Set budget and alarms before pilot. |

## 9. Target architecture

```text
Clients and tenant domains
       │
       ▼
Cloudflare DNS / TLS / WAF / routing
       ├── Static UI assets (cacheable, versioned, immutable)
       ├── Worker edge: explicitly allowlisted small APIs and SPEC-260 routes
       │      ├── existing canonical auth/tenant/business service as origin
       │      ├── Hyperdrive → Workers VPC TCP service → outbound Tunnel
       │      │                    → current private PostgreSQL host (no public port)
       │      ├── KV only for bounded, explicitly stale-tolerant cache data
       │      ├── R2 for private objects under existing tenant authorization
       │      └── Queue transport → canonical worker_jobs/outbox/fence check
       └── remaining API routes → existing Node/Python runtime (initially)

Existing Linux/Windows runtime remains the owner for Node/Python services,
unmigrated schedules, native/long-running jobs and approved development runners.
PostgreSQL remains the single system of record on its current host.
```

Use one public origin and same-origin APIs for the first pilot. Use an origin-only private hostname to reach the legacy platform from the Worker; prevent recursion through public Worker routes. The Worker only selects the approved route and forwards trusted edge metadata; the platform remains authoritative for auth, tenant ACL, business state, credits and job settlement. R2, KV, Queues, Workflows, Containers and Vectorize should be added per capability, not all enabled as a package.

## 10. Migration phase plan

### Phase 0 — Readiness audit (this deliverable; status: incomplete on live evidence)

- **Dependencies:** repo/SPEC scan; read-only production and Cloudflare authority for a fresh snapshot.
- **Tasks:** this code/config audit; refresh public health/deployed SHA/listeners; reconcile SPEC registry; map route/job owners; resolve DB bind discrepancy and schema head.
- **Acceptance:** current inventory has every public host, route, origin, runtime, secret identifier, DB role, queue and job family; evidence is timestamped and redacted; no public DB path; one owner per side effect.
- **Failure:** missing host/route/replica, unbounded DB access, live auth mismatch, uncertain job owner, unsafe port exposure, or unresolved required security boundary.
- **Rollback:** no runtime change occurred; discard audit conclusions only by superseding with a dated, evidence-backed refresh.
- **Evidence:** read-only health/host/Cloudflare probes, deployed SHA, route and binding export, DB schema/role snapshot, owner mapping.
- **Go/No-Go:** **No-Go** today for Web/API production cutover. Phase 1 staging can proceed only after fresh authorization/evidence and private DB network check.

### Phase 1 — Cloudflare staging (static assets then one isolated API)

- **Dependencies:** Phase 0 DB/network/route discrepancy resolved; non-production Cloudflare environment and credentials; staging data or synthetic tenants; pinned staging SHA; approved cost budget.
- **Tasks:** build static SPA artifact and deploy to staging asset binding; preserve legacy API origin; test SPA routing/cache/source maps; add one read-only stateless API under an explicit route; if it needs PostgreSQL, provision private outbound Tunnel + VPC service + Hyperdrive using a restricted staging role. Do not run migration DDL.
- **Acceptance tests:** browser deep-link and asset hash/caching; API parity/status/schema; auth absent or exactly shared with canonical platform; cross-tenant denial; CORS/CSRF; DB TLS and connection cap; p50/p95/p99 latency and timeout behavior; tunnel outage returns bounded 5xx without leaking data; no public DB reachability; deployment SHA and rollback receipt.
- **Failure conditions:** no host parity, stale/wrong tenant context, elevated DB privilege, unexpected query/connection growth, response mismatch, origin recursion, broken cookies/deep links, no rollback.
- **Rollback:** route staging hostname back to existing origin; restore previous asset version; revoke staging-only credentials; preserve DB state (read-only pilot means no data rollback).
- **Evidence:** Wrangler deployment receipt with SHA, target binding IDs (redacted), synthetic browser/API reports, DB grants and TLS proof, metrics, rollback rehearsal.
- **Go/No-Go:** only the tested static/API slice advances; no global hostname or auth/job cutover.

### Phase 2 — Limited production pilot

- **Dependencies:** Phase 1 accepted; current prod health restored and verified; security/tenant review; tested production-equivalent rollback; approved audience and support/on-call owner.
- **Tasks:** enable a feature-flagged route for internal/beta allowlisted users; start with static assets, then a low-risk read-only endpoint; use canonical origin for all auth and mutations. Record release SHA and selected backend per request without PII/secrets.
- **Acceptance tests:** session continuity on current authority; synthetic tenant probes; error/latency comparison to legacy; cache correctness; WAF/rate limits; origin health; kill switch; route revert drill; no increase in DB saturation or job duplicate claims.
- **Failure conditions:** auth/session regression, tenant leak, DB saturation, elevated 5xx/timeout, mismatch, unexplained cache staleness, logging of PII/secrets, rollback exceeds agreed RTO.
- **Rollback:** disable feature flag/route and return pilot audience to legacy origin; retain old API and auth; no dual-write or mutation shadowing.
- **Evidence:** cohort and flag config identifiers, per-route SLOs, synthetic user journey, DB/network metrics, incident/rollback drill, exact source SHA.
- **Go/No-Go:** expand only when pre-agreed error/latency/security thresholds pass for an observation window sized by product/SRE.

### Phase 3 — Controlled production cutover

- **Dependencies:** each route has accepted staging and pilot evidence; complete route/domain matrix; auth, DB, secrets, observability, rollback and backup recovery tested; business owner and SRE approval.
- **Tasks:** increase traffic by route/cohort; keep API and DB authority stable; move writes only after transaction, idempotency, credit and audit semantics are proven; retain the old runtime warm for rollback until the rollback window closes.
- **Acceptance tests:** end-to-end login and representative user journeys; API contract/parity; tenant isolation; billing/credit exactly-once; webhook/OAuth callbacks; WS/SSE separately if in scope; alarms and kill switch; measured RTO/RPO; no route loops; no forgotten custom domains.
- **Failure conditions:** data divergence, duplicate side effect, missed revocation, elevated DB connections/latency, unbounded retries, stale release identity, partial/unknown rollback.
- **Rollback:** change only the affected route/cohort to the pre-certified origin; preserve in-flight job owner and DB generation; no reverse data copy unless an explicit forward/backward-compatible data plan has been accepted.
- **Evidence:** route-by-route canary dashboard, request IDs/source SHA, smoke and browser receipts, migration ledger, data consistency proof, signed go/no-go, rollback receipt.
- **Go/No-Go:** traffic expansion is per route, never an automatic all-app switch. Existing runtime is not retired as part of this phase.

### Phase 4 — Background runtime optimization

- **Dependencies:** Phase 3 stable; SPEC-267/Feature 186/195 job contract mapped; family-specific runner and queue acceptance; Cloudflare capability bindings and quotas approved.
- **Tasks:** choose one bounded job family; prove queue transport only, canonical DB lease/fence, idempotency, DLQ/replay, credit settlement, retries and old consumer exclusion. Move heavier jobs only if Containers/Workflow/runtime requirements and cost justify it. Keep runners for coding, tests, computer use and native work.
- **Acceptance tests:** duplicate/reordered delivery, worker death at every boundary, lease expiry/reclaim, stale fence rejection, provider timeout/callback duplication, artifact integrity, cancellation, DLQ repair, accounting exactly once, rollback to prior single owner.
- **Failure conditions:** double claim, stale settlement, lost/duplicate charge, unbounded retry, stranded accepted work, object leakage, dual schedule owner.
- **Rollback:** stop new-family dispatch; drain or replay from canonical outbox under one fenced owner; do not start old and new consumers simultaneously; preserve attempt/fence histories.
- **Evidence:** family-level owner matrix, kill/crash receipts, queue metrics/DLQ report, settlement ledger reconciliation, recovery-time and cost profile.
- **Go/No-Go:** migrate only families whose operational and financial behavior is proven; leave all others on existing owners.

## 11. Acceptance matrix

| Domain | Minimum acceptance before production route/job | Evidence type required |
|---|---|---|
| Build and asset deployment | Reproducible artifact tied to Git SHA; SPA fallback, immutable asset cache, rollback to prior version | `VERIFIED_BY_TEST` + deployment `VERIFIED_BY_RUNTIME` |
| API compatibility | Route contract, headers/status/body, timeouts, origin allowlist, request size, streaming behavior | Staging contract and live probe |
| Authentication | Login/logout/refresh/revocation/CSRF/OAuth/cookie domain unchanged or explicitly redesigned and accepted | Synthetic browser run and sanitized runtime evidence |
| Tenant isolation | Positive and negative read/write tests across tenant, custom domain, API key and object paths | Tests plus security review and staged runtime proof |
| PostgreSQL | Private tunnel/VPC/Hyperdrive, verified TLS, restricted role, supported driver/options, max connection budget, schema parity, query/transaction tests, p95/p99 latency | Code tests + live staging network and DB evidence |
| Queue/job | Canonical `worker_jobs` lease/fence/idempotency/outbox, one execution owner, retries, DLQ, cancellation and settlement proof | Existing job tests plus failure-injection receipts and DB reconciliation |
| AI/credits | Same provider policy, budget, timeout, usage ledger and exactly-once credit settlement | Synthetic provider run and ledger proof |
| R2 / files | Private bucket/prefix, tenant-scoped signed operations, lifecycle, integrity, upload size/CORS, no local fallback | Staging upload/download and ACL test |
| Streaming/realtime | Disconnect, backpressure, reconnect, replay, auth expiry, timeout/idle behavior and limits | Browser/protocol tests and staging runtime evidence |
| Operations | Alerting, dashboards, deployed SHA, health/readiness semantics, kill switch, support owner, rollback RTO/RPO | Live drills and incident runbook receipt |
| Cost/resource | Measured request, CPU, storage, operations, retries, DB QPS/bytes/RTT and DB host capacity with alerts | Baseline and budget-owner approval |

Unit tests are necessary for code behavior but do not replace live binding, network, production-health, rollback or recovery evidence.

## 12. Rollback and disaster recovery

- Keep `smartaihub.app`/API traffic on the existing origin until a route has passed its own canary. Maintain an independently addressable legacy origin that bypasses the Worker to prevent recursive routing.
- Use a durable per-route/cohort flag or routing control with audit trail and a tested kill switch. Do not use deployment rollback as a substitute for traffic rollback.
- Keep DB schema additive/backward-compatible during the rollback window. Do not use dual writable primaries. For the initial static/read-only slice, rollback changes no database data.
- Preserve one job executor owner per family through rollback. Stop dispatch to the new owner, settle/drain or replay by canonical job ID/fence, then enable the legacy owner only after the new owner is fenced off.
- Do not delete old secrets, queues, origins, database grants, schemas, or code until rollback-window exit criteria are approved and recovery is rehearsed.
- Establish backup/PITR restore evidence for the existing PostgreSQL host, R2 object version/retention policy, tunnel/origin recovery, DNS/route restoration, and expected RTO/RPO before write traffic moves. This audit did not verify backups or DR.

## 13. Cost and resource impact

No SmartAIHub bill or traffic/DB measurements were available, so this report does not claim a project-specific monthly cost. Measure actual requests, CPU ms, bundle size, cache hit ratio, R2 GB-month and Class A/B operations, Queue message size/retries, Workflow steps/state, Vectorize operations, database queries/bytes, tunnel uplink and origin host utilization before estimating.

Current Cloudflare published pricing (verify again at procurement): Workers Paid starts at $5/month per account with included usage and usage-based overages; Hyperdrive is included in Workers Free/Paid, with Free query limits and Paid unlimited queries; Queues Paid includes one million standard operations/month then $0.40/million, with each message generally incurring write/read/delete and retries add reads; R2 Standard lists $0.015/GB-month, Class A $4.50/million, Class B $0.36/million, with direct R2 egress free; Workflows charge compute/requests plus state/steps according to current plan. These are product list prices, not SmartAIHub estimates. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).

Main cost/resource risks:

- Public API traffic moves compute to Workers but retains DB CPU/I/O/connection pressure on the same current database host. Hyperdrive pools connections; it does not provide DB HA or remove query load.
- Cross-region distance from Cloudflare execution to the DB host can increase RTT and hold DB transactions longer. Measure actual regions/latency and origin uplink; Cloudflare service transfer pricing does not establish the host provider's transfer charges.
- Retries and DLQ replay can multiply Queue operations and external provider/credit work unless idempotent. A large long-running workload may cost more in Containers/Workflow/storage than on the current host; profile per family first.
- Static asset delivery may reduce origin CPU/network use, but build/storage/logging/egress and existing origin obligations remain. Current R2 egress pricing does not mean all traffic paths or external network providers are free.

## 14. SPEC relationships and next executable WorkUnits

- **SPEC-267:** intended Cloudflare production migration and durable execution authority per its source text; its declared supersession of SPEC-245/232 is not yet registry-confirmed. Reconcile canonical identity/status and scope, then add this audit as evidence to the established migration authority rather than issuing a new SPEC.
- **SPEC-245 / SPEC-232:** contain valuable historical/runtime evidence and migration analysis, but SPEC-267 claims they are superseded. Keep as provenance until the canonical index/registry resolves authority; do not use their old cutover order as active direction meanwhile.
- **SPEC-295:** overlaps environment/deployment/runtime operations and reports partial integration in its index record. Resolve the division: SPEC-267 owns Cloudflare capability placement and route/job-family migration gates; SPEC-295 owns shared release/deployment/data-migration operations only where confirmed by its canonical requirements. Avoid a second migration plan or duplicate gates.
- **SPEC-224:** remains the development run/Runner lifecycle and finality contract, not the Web production hosting authority. Cloudflare hosting work must not add a dependency to the SPEC-224 critical path. Coding, testing, computer-use and native runner work remain on approved existing runners. The independent Mini App artifact runtime work mentioned by SPEC-224 may consume owner-provisioned non-production Cloudflare authority, but it does not need the general Web/API cutover.
- **SPEC-277 / Feature 186/195:** retain canonical task-control/outbox/lease/fencing/accounting authority. Cloudflare Queue/Workflow is transport/execution placement only and must integrate through existing ownership and settlement rules.

### Suggested next WorkUnits

| Priority | WorkUnit | Dependencies / owner | Output and done condition |
|---|---|---|---|
| P0 | Refresh production read-only health/topology and DB port evidence | Platform/SRE + DB owner; current host/Cloudflare read-only authority | Timestamped deployed SHA, route/origin/replica/listener snapshot, public health, DB bind/firewall/TLS, Worker `/readyz`; no secret values |
| P0 | Resolve canonical migration SPEC registry authority and overlap | Spec registry owner; inspect SPEC-267/245/232/295 records and handoffs | One active migration authority, explicit SPEC-295 boundary, no new SPEC number |
| P0 | Static SPA staging artifact and route proof | Web + Cloudflare staging owner | Pinned build SHA, static asset/SPA deep-link tests, custom staging hostname and tested asset rollback; API stays at current origin |
| P1 | Private PostgreSQL staging connectivity spike | DB + Cloudflare platform owner; requires authorized staging account and private host path | Tunnel/VPC/Hyperdrive from staging Worker with least-privilege role, TLS, supported driver config, bounded connection/latency proof; no DDL |
| P1 | One read-only API slice acceptance | Web/API owner + tenant-security reviewer | Route contract, same-origin/tenant tests, staging parity/latency, kill switch and origin rollback |
| P1 | Production deploy/rollback pipeline plan for Worker and assets | Platform/release owner; exact account scopes needed | Secret-safe environment injection, pinned SHA, deploy receipt, health gates, canary route and rollback rehearsal |
| P2 | Job-family owner map and Cloudflare Queue selection | Feature 186/195 + SPEC-267 + SPEC-277 owners | Inventory all schedules/producers/consumers; choose one low-risk family; prove fencing/idempotency and exactly one consumer before activation |

## 15. Deployment-target tenant picker follow-up — 2026-10-22

The production Admin page could not locate the SmartAIHub tenant because the
currently served selector is the older non-searchable native select. The live
tenant record is named `Smart AI Hub` and has domain `smartaihub.app`; searching
for the unspaced text `smartaihub` in the old UI therefore does not find it.
The selector has been changed to search tenant name, domain, and ID, with a
focused regression test for the domain case. Commit
`ee5547ccd9e039be186707d48d8772ce574bb649` is integrated into `origin/main`,
and canonical artifact from `35d92f1eff37a877ea56babe18fa5d25a021bab7`
contains the updated picker. The production release still serves source
revision `57fcb31aaff713494291e8acdc033964a28a29f5`; the updated artifact has
not been activated there.

Do not use the Linux full-stack release as a shortcut for this UI fix. The
candidate range since the serving revision contains 166 changed paths across
the web client, server, runtime and migration journal, so this is not a
frontend-only promotion. The live-schema audit already identified the active
`projectWikiPagesService.ts` callsite whose `0394_project_wiki_pages_mini_app`
table is absent. First establish exact candidate-to-serving DB compatibility
and required migration receipts through the existing authority, then use the
normal release controller with its rollback proof. Until a safe release path
is established, the UI change is integrated and built but not available on
production.

The Admin operator subsequently configured the exact staging target and
credential. A read-only production DB check confirmed the target is enabled,
its account and Worker references are present, its credential reference is
scope-bound, and one trusted non-expired staging executor exists. The latest
published artifact remains source `35d92f1eff37a877ea56babe18fa5d25a021bab7`
with build digest `aca257b8cca87e2872cd7d19252e7e18473d9e6c476ffe6460a1d364baa29dd7`.
There is no active staging deployment policy and no grant for that artifact;
prior grants are expired. A grant can only be issued by the existing
authenticated tenant-owner policy endpoint. The local browser automation
provider was unavailable (`orca-ide computer` sidecar exited with code 1), so
no owner-authenticated operation was performed. Do not replace that path with
direct DB writes or Wrangler.

### Required human authorization

No authorization was needed for this read-only repository audit. Future staging work needs a Cloudflare staging account/token with only the required Worker/Assets, Hyperdrive, VPC/Tunnel, KV/R2/Queue permissions, plus a non-production DB/network role. Production pilot/cutover requires explicit platform/SRE and DB owner approval, a scoped audience/traffic decision, approved budget, on-call/rollback owner, and current backup/restore evidence. The 2026-09-29 permission probe was read-only, incomplete, and reported a 403 for Workers for Platforms dispatch namespace access; do not treat it as deployment approval.

## 15. Audit conclusion

The safe path is incremental: keep PostgreSQL at its current location and keep the Web/API, auth and job execution authorities stable while Cloudflare first takes static assets and then a single bounded API slice. A private Tunnel → Workers VPC → Hyperdrive path is technically plausible without a public database port, but remains an unverified deployment capability. Production API cutover and background-worker migration are **No-Go** until the critical blockers and route/job-specific acceptance evidence above are closed.

## 16. Execution plan update — 2026-10-22

This update continues the existing phases above; it does not create a new SPEC or change the database hosting boundary. PostgreSQL remains on its current host. No database mutation, Cloudflare account write, production release, or DNS/route change has been performed for this update.

### Confirmed failure in the current preflight

The repository migration-checker incorrectly treated every `.sql`, `.ts`, and `.js` file below `apps/web/drizzle` as a migration, compared that count with `_journal.json` entries, and labeled the difference “pending migrations.” A Drizzle journal is the source migration manifest; it is not the live database's applied ledger. The checker also missed the configured `drizzle/schema.ts`. Therefore its reported “83 pending” count and “no schema” finding are invalid and must not be used to decide whether DDL is required. A separate repository manifest found duplicate journal index `135` on `0138` and `0139`. Git history traced the regression to commit `fe1da0762`, which accidentally changed `0138` from `134` to `135`; the correction restores `134` without changing SQL. The checker now validates journal/file consistency and duplicate indices, and explicitly reports database state as unchecked.

The fresh read-only ledger comparison on 2026-10-22 observed 349 database ledger rows versus 396 journal entries. Classification by both timestamp and current SQL hash yields 298 exact matches, eight journal migrations whose hashes appear under different timestamps, 14 timestamp matches whose hashes differ from current SQL, and 76 entries matching neither. The DB ledger also has 312 rows with a current journal timestamp, 10 rows whose hash matches a journal migration at another timestamp, eight rows whose hash matches unjournaled SQL, and 19 rows matching no current SQL. These overlapping classes are a reconciliation problem, not a list of safe-to-run migrations: some rows may represent renamed/edited/manual migrations. A reusable, read-only row-by-row audit command now exists at `cd apps/web && pnpm run db:audit-ledger`; its output omits the connection string and marks the target with a one-way hash. Do not run `drizzle-kit push` to “fix” this discrepancy.

The live schema was then introspected read-only to `/tmp` (not into the repository): 666 tables, 9,556 columns, 203 enums, 1,714 indexes, 1,663 foreign keys, 322 check constraints, 15 policies, and 3 views. Comparing table names to current `drizzle/schema.ts` found 19 source tables absent from the live schema and 65 live tables absent from the current source schema. Missing source tables are `agency_subgraphs`, `commercial_ledger_postings`, `commercial_payment_attempts`, `commercial_payment_refunds`, `commercial_payment_requests`, `commercial_settlements`, `commercial_spending_limits`, `commercial_usage_receipts`, `content_composer_drafts`, `menu_config`, `mini_app_project_wiki_pages`, `project_wiki_package_candidates`, `rag_projection_items`, `retrieval_instance_routes`, `webhook_calls`, `workflow_audit_events`, `workflow_cache_metadata`, `workflow_policy_rules`, and `workflow_secrets`. `agency_subgraphs` is explicitly excluded as retired-system scope. The remaining missing tables require a code-callsite and migration-owner check; this difference alone cannot prove each should be created. Fifteen current source enums were also absent from the live catalog, including retired and feature-specific types; classify them against the exact allowed migration set before applying DDL. The 65 extra tables include a mix of legacy runtime, auxiliary, backup, and retired objects; preserve them while resolving code/schema ownership.

The call-site check found a concrete live feature gap: journal entry `0394_project_wiki_pages_mini_app` (idx 380) is absent from both the current production migration ledger (by timestamp and SQL hash) and the live catalog, while `apps/web/server/services/projectWikiPagesService.ts` queries `mini_app_project_wiki_pages`. Its SQL is additive and has foreign keys to the canonical project/app identity tables, but it cannot be applied until the migration authority/receipt and backup preconditions for this target are established. Other live-missing names were classified before considering DDL: the seven commercial payment/ledger tables and `rag_projection_items` / `retrieval_instance_routes` appear only in migration-focused tests; `workflow_secrets` is explicitly a future fallback while current Python code reads `system_settings`; and no production application callsite was found for the other missing tables. Keep these excluded from a blanket migration replay. Do not recreate retired systems or run old migrations solely to make the table counts agree.

The latest ledger timestamp that maps to the current journal is `0388_worker_job_event_context`; 21 journal entries (`0389`–`0409`) follow it. A live object check shows these entries are not simply unapplied: objects from `0389`, `0391`–`0393`, `0397`–`0398`, `0401`–`0404`, and `0409` already exist even though the corresponding current SQL hashes/timestamps are not consistently represented in the ledger. At the same time, the `0390` migration receipt attempt index is absent, and tables from `0394`, `0396`, `0405`, `0406`, and `0408` are absent. This is evidence of out-of-band or partial migration application. Replaying from `0389` would fail immediately on its non-idempotent `CREATE TABLE provider_deployment_targets`; manually inserting 21 ledger hashes would also make false claims about unapplied objects. Reconcile each migration's complete postconditions and hash history, repair only verified missing objects via the existing migration authority, then record a migration as applied only after its full postcondition check passes. In particular, `0394` depends on `0392`/`0393` objects that already exist and has a real production service caller; `0396` has no production caller; `0405`/`0406` and `0408` have no production callsite in the scanned web/Python code. The last three feature families must not be added to production just to close the journal gap.

### 2026-10-22 production observation refresh

Unauthenticated HTTPS GET/HEAD probes were made without changing configuration or data. `smartaihub.app/` returned 200 over a Cloudflare edge address with dynamic, no-cache HTML. `api.smartaihub.app/health` returned healthy at version `0.2.0`; its database, worker_jobs and llm_proxy checks were healthy. The API `/readyz` endpoint is not implemented (404). The correctly configured Worker hostname is `runtime.smartaihub.app` (`workers_dev` is disabled in production), not `smartspec-cloudflare-runtime.workers.dev`; its `/healthz` returned `{"ok":true,"service":"smartspec-cloudflare-runtime"}`, while `/readyz` returned 503 with all seven production capability bindings absent and activation disabled. Two configured emergency API route probes returned the web app's 404 fallback, so the route configuration in Git is not proof those routes are live. These observations show Cloudflare DNS/proxy plus a separately deployed, inactive Worker; the main app/API still serve through the existing runtime. No account inventory, deployed SHA, secret binding, Hyperdrive connection, or host-level listener/replica check was available from this read-only session. The Wrangler CLI is not installed in this checkout and `gh` has no Cloudflare deployment token/account ID configured; do not infer that an Admin-stored credential is available to this deployment process.

The Cloudflare staging target is present and enabled in `provider_deployment_targets`, and one staging deployment credential is configured. The existing control plane has 82 succeeded staging deployment jobs (most recent observed deployment source SHA `c84a29b5…` on 2026-10-21); deployments are expected to run through that grant-bound job executor, not a direct Wrangler command. A fresh canonical build of `487672af362eb8a669ec7b624312282d665f6894` passed and published the staging artifact to immutable R2 (`sha256:d822ad68c811c10b2827432d51ec09858ca93fb3e0c042b97cf59b87238aa855`, 1,593 assets, 2 Worker modules). The R2 provider resolved from the canonical workspace and a temporary conditional-write/read-back/delete probe passed. Thus the prior `artifact_storage_unavailable` state was not reproduced; historical PUBLISH_PENDING build receipts have `configuration_source` unset, while the current build used `canonical_workspace`, consistent with those earlier publishers lacking the canonical server configuration. The current artifact is published but not deployed. Read-only approval-state inspection found zero active Cloudflare staging policies and no policy matching this artifact; deployments need the existing authenticated grant authority to issue a job bound to this exact artifact and its rollback target. No Cloudflare Container was provisioned or used.

### 2026-10-22 latest canonical build and live health recheck

The canonical build was repeated against the then-current `origin/main` SHA `7c576f947c626d5fbf143dbd742362b98992c030`. It finished `BUILD_PASSED` and published a fresh immutable staging artifact (`sha256:445191cd8ce0b678deedefb6b3784c8188791a4ed5960a7ca3f01b14afe70e5f`, 1,593 assets, 2 Worker modules) from `canonical_workspace`. The full web artifact digest is `sha256:9aeb3254233d2f7a2e1d4fa53cde1d7e9738e83eb24688c2bb015e30074ff775`. This is build and artifact publication evidence only; no staging deployment, Worker version activation, route attachment, Linux release, production migration, or DNS change followed.

A new unauthenticated read-only probe returned 200 for `smartaihub.app/`, `api.smartaihub.app/health`, and `runtime.smartaihub.app/healthz`; the API reported database, worker_jobs, and llm_proxy healthy. `runtime.smartaihub.app/readyz` remained 503 with activation disabled and all seven bindings absent (`HYPERDRIVE`, `JOB_QUEUE`, `JOB_WORKFLOW`, `JOB_CONTAINERS`, `WORKER_APP`, `MEDIA_BUCKET`, `VECTOR_INDEX`). Local scoped verification passed: Cloudflare runtime TypeScript check; 27 runtime test files / 309 tests; migration ledger audit tests (2); migration checker (4); migration manifest (6). No repository-wide `npm run typecheck` was run.

The existing authenticated deployment route could not be reached from this session: the local computer-use provider failed to start (`computer sidecar exited with code 1`), and local Wrangler reported that this environment is not authenticated. No credential was extracted from Admin storage, no direct provider API write was attempted, and no deployment or migration approval was fabricated. The exact next action is to use an authenticated Admin session with the existing grant authority to issue a staging deployment grant bound to this artifact and its retained rollback target, then validate staging before any production-route work. The production cutover remains **NO-GO**.

### Ordered work and completion evidence

| Gate | Work | Done when |
|---|---|---|
| 0. Authority and source baseline | Re-read current `origin/main`, deployed SHA/health, active migration owner and overlapping SPEC-232/245/267/295 registry records; preserve dirty primary checkout. Do not assign a new SPEC or revive retired systems. | One current source SHA, one confirmed migration authority, fresh runtime evidence, and an explicit database boundary (same existing host). |
| 1. Repair migration preflight | Make the static checker distinguish SQL files, journal tags, schema path, and DB state; test missing/duplicate/untracked files. | Static checks never label file-count differences as applied/pending database migrations; test fixtures pass. |
| 2. Produce exact read-only drift manifest | Through the existing read-only DB authority, compare ordered journal `(idx, tag, when, SQL hash)` with `drizzle.__drizzle_migrations` rows, then inspect catalog state for each unmatched entry. Record redacted IDs, dependency/order, object deltas, and query-only evidence. | Every journal and ledger row is classified: applied-and-matching, applied-but-untracked, unapplied, duplicate/unknown, changed hash, or unresolved; generated file is reproducible and secret-free. |
| 3. Classify and close migration gaps | Run read-only dependency/runtime audit first. Exclude all retired Agency/workpack/OpenSandbox migration paths. Split additive DDL, already-materialized schema, data backfills, destructive DDL, and obsolete/retired changes. Fix code/schema/migration defects and add focused tests. | Each allowed migration has an owner, forward SQL, compatibility window, rollback/recovery path, backup/PITR evidence and expected lock/data impact; no unresolved destructive or retired migration is in the execution set. |
| 4. Apply only approved database changes | Use the existing receipt/advisory-lock migration runner and least-privilege migration identity, first on a production-like clone, then the current production DB only when the existing authority grants the exact operation. Verify before/after catalog and receipts; do not use `db:push` as a substitute. | Exact ordered migration set is applied once, post-check confirms schema and application queries, recovery/rollback receipt is recorded, and DB remains on its current host. |
| 5. Restore release correctness | Build a provenance-pinned full-stack artifact against latest integrated main; prove application/schema compatibility, run focused smoke and migration preflight. Production Debian/Linux release remains the rollback baseline until Cloudflare canary proves parity. | Exact SHA and artifact digest serve healthy web/API on the existing origin; health, OAuth/Google auth, enabled 2FA, billing via the active non-Stripe provider, uploads, async jobs and rollback pass. |
| 6. Complete Cloudflare runtime prerequisites | Configure the required bindings and private DB path (Hyperdrive → VPC/Tunnel without exposing PostgreSQL); confirm target credential/zone scope and deployment artifact authority. Classify route, WebSocket, scheduled task and job-family owners; enable Containers only for workload profiles that need them and have an approved cost envelope. | Cloudflare `/readyz` is healthy with required bindings; private DB TLS, connection caps, transactions and representative queries pass; each migrated route/job has one owner and a kill switch. |
| 7. Stage, canary, then cut over by route | Deploy exact artifact to staging, run browser/API/auth/tenant/job/load/rollback drills, then use per-route internal cohort with same database and legacy origin warm. Move public routes progressively only after evidence and existing production route authority permit it. | Current public traffic reports the exact Cloudflare artifact; synthetic user journeys and observability pass; no auth/data/job divergence; route rollback is rehearsed and remains available through the observation window. |

The user's authorization to migrate tables permits necessary migration work within the existing database boundary, but does not authorize bypassing the repository's production migration authority, running retired-system migrations, exposing the database publicly, or making an unbounded production route change. Independent coding, static-check repairs, test fixtures, and read-only audits continue while any external account or production authority is unavailable.
