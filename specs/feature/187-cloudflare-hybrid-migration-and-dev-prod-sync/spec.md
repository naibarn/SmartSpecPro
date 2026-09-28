# Feature 187 — Hybrid Cloudflare Migration Preparation, Environment Parity, and Promotion Readiness

**Status:** IN PROGRESS — provider-neutral local adapter/Worker contract and evidence-only target preflight are implemented; `ops/feature-187/local-readiness-manifest.yaml` records local readiness, while no target-account runtime or production cutover is included in this document.
**Created:** 2026-09-13
**Scope:** Existing mini-server development environment, Cloudflare production target, PostgreSQL/R2/object/search preparation, asynchronous runtime migration preparation, staging rehearsal, and repeatable dev-to-production artifact/data promotion readiness.
**Authority:** This specification defines the environment contract, preparation phases, promotion model, staging evidence, and handoff package required before Feature 188 can execute a production cutover. It does not own production activation, cutover, or legacy retirement.
**Continuation:** Builds on Feature 186. `worker_jobs` and `worker_job_events` remain the canonical Unified Job Control Plane; this feature does not create a second job ledger.

## Outcome

SmartAIHub can continue to run reliably on the existing mini server as an isolated development environment while all Cloudflare migration work is prepared and tested. No production migration is performed by this feature. The current production server remains the production runtime until a separately approved maintenance window begins.

The two environments share contracts, migrations, adapter interfaces, build inputs, and test fixtures, but never share mutable production credentials, queues, secrets, or accidental data writes.

Promotion readiness is established by promoting one tested immutable release artifact from development/CI to staging and by rehearsing the data, adapter, recovery, and rollback boundaries. Production traffic, database authority, storage authority, schedules, and side-effecting job producers remain unchanged in this feature. The actual one-time production cutover is owned by Feature 188. “Sync dev to production” therefore means preparing an evidenced artifact/data handoff, not copying the dev database or queue blindly over production.

The target production architecture is:

```text
Users / API clients
        │
Cloudflare DNS · TLS · WAF · Rate limits · Turnstile
        │
 ┌──────┼────────┬────────┬────────┬────────┬────────┐
 │      │        │        │        │        │        │
Web   API      MCP    Webhooks  Jobs   Search   Email
Worker Worker  Worker  Worker    Worker Worker   Worker
 │      │        │        │        │        │        │
Static Hyperdrive / service bindings / queues / workflows
assets     │                         │
           ▼                         ▼
   PostgreSQL source of truth     Containers / external runners
   worker_jobs + events           for heavy or long-lived work
           │
      R2 binary objects + Vectorize rebuildable index
```

The mini server remains the default local development environment and may host break-glass diagnostic tooling. It is not an automatic production failover target and production must not depend on its availability. It may continue to run Node, Python, Redis, BullMQ, Celery, and local containers during migration, but all new code must use runtime-neutral ports so these are replaceable adapters rather than business dependencies.

## Relationship to Feature 186

Feature 186 remains the source-of-truth and runtime-neutral adapter contract. Its adapter-by-adapter language applies to implementation, compatibility wrapping, testing, and staging preparation. Feature 187 prepares and proves the environment and adapter boundaries; it does not activate production or retire legacy paths.

## Feature order and ownership

The four related features are delivered through one dependency chain:

| Order | Feature | Owns | Required handoff |
|---|---|---|---|
| 0 | Feature 186 | Canonical job contract, persistence, lifecycle, outbox, adapters, lease/fencing, and recovery evidence | Accepted runtime-neutral control-plane ports and migration manifest |
| 1 | Feature 189 | Authenticated tenant context, authorization, tenant moves, transfer handlers, previews, checkpoints, and transfer UI | Stable `currentTenantId`, tenant authorization, transfer fences, and tested transfer job integration |
| 2 | Feature 187 | Dev/staging parity, release artifacts, target data boundaries, Cloudflare adapter preparation, migration manifests, and staging rehearsal | `CUTOVER_CANDIDATE` package with immutable artifact, schema/data/adapter manifests, and evidence |
| 3 | Feature 188 | Admin Platform Operations, readiness aggregation, production activation, cutover certificate, rollback command, and legacy retirement | Guarded one-time production cutover and post-cutover separation |

Inventory work in Features 187 and 188 may begin in parallel with Feature 189. However, Feature 187 may not freeze or promote tenant-owned data until Feature 189's tenant ownership rules are stable, and Feature 188 may not enable activation until both handoffs pass. Feature 189 consumes Feature 186 ports and must not implement Cloudflare, Hyperdrive, or generic adapter work.

## Goals

1. Keep the current mini server usable as a complete development environment throughout every migration phase.
2. Establish Cloudflare production entrypoints without requiring a simultaneous rewrite of all Node, Python, worker, or domain services.
3. Prepare and validate database access, binary storage, search, scheduling, and asynchronous execution independently, then switch approved production boundaries in one coordinated window.
4. Preserve `worker_jobs.id` as the canonical identity across local, legacy production, staging, cutover, and Cloudflare runtimes.
5. Make dev-to-production promotion deterministic, auditable, repeatable, and easy to roll back.
6. Prevent development data, credentials, queue messages, and provider side effects from leaking into production.
7. Prove performance and operational efficiency against a measured baseline rather than treating a successful deploy or `/healthz` response as production readiness.

## Non-negotiable invariants

1. **Feature 186 remains the job authority.** PostgreSQL, `worker_jobs`, `worker_job_events`, attempts, dispatch references, settlements, and outbox coordination remain the source of truth. Cloudflare Queues, Workflows, Containers, BullMQ, Celery, and provider IDs are adapters or observations.
2. **The mini server must remain runnable.** A Cloudflare migration may not make local development depend on a production-only binding, production hostname, production secret, or unavailable external service without a documented local adapter or mock.
3. **Production never depends on dev.** Production deploys consume immutable artifacts and versioned migrations from CI; they do not read the dev filesystem, dev database, dev queue, dev R2 bucket, or dev secrets.
4. **One active side-effecting producer exists per job class.** Shadow execution may observe or use a side-effect-free executor, but two producers must not charge credits, submit providers, publish artifacts, send email, or deliver webhooks for the same business operation.
5. **Promotion uses the same artifact.** The artifact tested in staging is the artifact promoted to production. Rebuilding from a moving branch during production deployment is not accepted.
6. **Database migrations are forward-compatible.** Schema changes use expand, backfill, validate, and contract stages. A deployment must remain compatible with the previous release until the cutover gate passes.
7. **Database source of truth changes only through an explicit cutover.** Dual-write is forbidden by default. During migration there is one authoritative primary; read-only shadow validation or CDC may be used only with a documented consistency boundary.
8. **Dev data is not production data.** Operational rows, users, credits, billing records, provider credentials, job payloads, and signed object URLs are never copied from dev to production automatically.
9. **Queues are never synchronized as data.** Queue messages are disposable transport state. In-flight jobs are reconciled through canonical PostgreSQL records and outbox/dispatch references, never by copying Redis, Celery, or Cloudflare queue contents.
10. **Rollback preserves canonical history.** A rollback changes routing, code, or adapter flags; it does not delete terminal job history, reverse committed billing, or reuse a provider ID as a job ID.
11. **Environment boundaries are explicit.** Dev, staging, legacy production, cutover, and production have separate credentials, object prefixes/buckets, queues, workflow bindings, Vectorize indexes, logs, rate limits, and admin scopes.
12. **Evidence is separated by type.** Build success, schema migration, service restart, browser behavior, provider behavior, worker connectivity, recovery behavior, and production cutover are separate proof obligations.
13. **Production migration is one-shot.** There is no partial production traffic migration or production job-family canary during the preparation phases. All enabled components must be staged and validated before the maintenance window.
14. **The maintenance window is explicit.** The old production server is placed into maintenance/read-only mode or stopped according to the cutover runbook for no less than the estimated migration and validation period, with a declared 24–72 hour window and an approved extension/rollback decision point.

## Current foundation and migration constraints

Feature 186 supplies the canonical contract and most of the required persistence model, but the current repository is not yet a Cloudflare production runtime. The migration plan must account for these known constraints:

- The primary web runtime is still Express/Node in a Docker image, with the client build and server process coupled in the existing deployment path.
- Existing code still contains BullMQ, Celery, Celery Beat, Cloud Tasks, in-process schedulers, and direct queue call sites. They remain compatibility paths until their migration wave is complete.
- The current job transport implementation includes BullMQ, Celery, in-memory adapters, and a provider-neutral binding-injected contract for Cloudflare Queues, Workflows, Containers, Cron, and Worker App; native target bindings remain external deliverables.
- The current startup path and outbox/reconciler must be proven to publish through the selected adapter registry before any new control-plane job class is enabled.
- Worker runtime claim/report paths must use the Feature 186 lease and fencing contract before the worker class is migrated.
- Database access currently uses application connection configuration directly; Hyperdrive binding and target-database transaction/locking compatibility must be proven separately.
- Storage has S3-compatible/R2 integration but also has local filesystem fallback in the current runtime; production Cloudflare paths must remove that fallback for authoritative objects.
- Existing deployment workflows still contain Cloud Run/GCP paths. They may remain during preparation, but each must have an owner, retirement gate, and rollback purpose.
- Heavy workloads such as FFmpeg, Chromium/Playwright, document rendering, audio/video processing, and arbitrary subprocess-based work do not belong in a Worker event loop. They require Containers or an external runner boundary.

These constraints are migration inputs, not permission to weaken the invariants. The implementation plan must inventory and close them phase by phase.

## Environment model

| Environment | Purpose | Runtime | Data | Allowed side effects | Promotion rule |
|---|---|---|---|---|---|
| `dev-mini` | Daily development, local debugging, fixtures, offline work | Existing mini server, Docker, Node/Python, local adapters | Dev PostgreSQL, dev Redis, dev object prefix, dev Vectorize or fake index | Mock/sandbox providers by default; explicit local provider calls only | Produces commit, test report, migration bundle, and immutable build metadata |
| `staging` | Cloudflare compatibility and canary rehearsal | Cloudflare Workers, Hyperdrive, Queues, Workflows, Containers where enabled | Dedicated staging PostgreSQL/schema, R2, Queues, Vectorize, secrets | Synthetic or explicitly allowlisted non-production providers | Same artifact digest and migration bundle must be promoted to production |
| `legacy-prod` | Current production before the one-time cutover | Existing approved production server/runtime | Current production PostgreSQL, storage, queues, and providers | Real production side effects | Remains authoritative until maintenance mode begins; no Cloudflare production traffic during preparation |
| `cutover` | Controlled 24–72 hour migration and validation window | Old runtime stopped/read-only; Cloudflare resources being activated | Frozen old source plus validated target resources | No user-side effects until validation gate passes; synthetic checks only | Opens production only after all cutover gates pass |
| `production` | Final target | Cloudflare edge/workers plus approved Containers/external runners | Production PostgreSQL via approved connection path, R2, Vectorize | Real production side effects | Only signed/approved artifact and migration manifest |

The environment selector is server-side configuration. A client cannot choose a target environment, adapter, database, bucket, tenant, or provider binding.

## Target component ownership

| Concern | Canonical owner | Development implementation | Cloudflare target | Migration rule |
|---|---|---|---|---|
| Web assets | Web release artifact | Vite/static server on mini server | Web Worker + Static Assets | Prepare and rehearse first; switch production delivery during the one-time cutover |
| HTTP/API | API contract | Express/Node API | API Worker and service bindings | Validate endpoint families behind stable auth/response contracts; provide evidence for Feature 188's coordinated cutover |
| Job identity/lifecycle | PostgreSQL + Feature 186 | Existing Drizzle/PostgreSQL control plane | Same PostgreSQL through approved connection path | Never create a parallel `jobs` table |
| Single-step async | Job Control Plane | BullMQ/Celery adapter | Cloudflare Queues adapter | Build and test per job class; activate production producers together at cutover; queue is transport only |
| Long/multi-step work | Job Control Plane + workflow adapter | Celery/task orchestration | Cloudflare Workflows | Rehearse persisted step references and idempotency before the one-time production switch |
| Heavy compute | Executor capability policy | Local process/Python/container | Cloudflare Containers or external runner | Do not move arbitrary user code into trusted containers |
| Desktop/Hermes | Runner Gateway | Existing worker runtime | HTTPS gateway/API Worker boundary | Desktop never holds Cloudflare bindings or direct DB credentials |
| Schedules | Schedule adapter | Celery Beat/in-process compatibility | Cloudflare Cron/Workflows | Creates job intent only; no inline business execution |
| Binary objects | R2/object gateway | S3-compatible/local dev storage | R2 binding/gateway | Postgres stores metadata and object key, not large binary payload |
| Exact/filter search | PostgreSQL | PostgreSQL query | PostgreSQL through Hyperdrive | Remains authoritative |
| Semantic search | Rebuildable index | Existing vector adapter/fake | Vectorize | Tenant metadata filter is required; rebuild from PostgreSQL |
| Cache/config | Cache policy | Local/Redis compatibility | KV/cache | Never stores credits, billing, leases, or job truth |
| Realtime | Optional live state | Polling/WebSocket compatibility | Durable Objects where needed | Not required for correctness; polling remains valid |
| Email | Email dispatcher | SMTP/Dramatiq compatibility | Queue + Email Worker + provider | Idempotency and delivery evidence required |
| Webhooks | Webhook dispatcher | Existing worker/queue path | Webhooks Worker + Queue | Signature, replay, tenant, and dedupe checks before delivery |

Cloudflare bindings must be configured through the deployment environment and Wrangler/IaC. The business layer imports ports, not provider-specific bindings.

## Control-plane boundary

Feature 187 does not change the Feature 186 domain contract. It adds environment and promotion requirements around it:

```text
Business service
      │
      ▼
JobControlPlane.create()
      │ same PostgreSQL transaction
      ├── worker_jobs (canonical current state)
      ├── worker_job_events (append-only history)
      └── worker_job_outbox (publication intent)
               │
               ▼
       Adapter registry / rollout flag
       ├── BullMQ / Celery (compatibility)
       ├── Cloudflare Queues
       ├── Cloudflare Workflows
       ├── Container / Runner Gateway
       └── Scheduler / Email / Webhook adapters
```

The adapter registry is environment-aware but the business contract is not. A local adapter and a Cloudflare adapter receive the same canonical `job_id`, contract version, business attempt, dedupe key, and bounded routing metadata.

The following are forbidden:

- A production API that publishes to a dev queue or dev outbox publisher.
- An adapter that creates a provider job before the provider operation key is durable.
- A Worker, plugin, skill, or agent that calls BullMQ, Celery, Redis, Cloudflare bindings, or a provider directly from business code.
- A production job whose only durable record is a queue message.
- A deployment that enables a Cloudflare consumer while the current producer can still create a second side-effecting message for the same job class.

## Dev server contract

The mini server is a first-class development target, not a temporary disposable host.

### Required capabilities

The dev environment must support:

- booting the web/API runtime with a documented one-command or one-script flow;
- applying the same schema migrations used by staging, with environment-specific connection settings;
- running the Feature 186 control-plane tests and at least one real local create → outbox → adapter → claim → report flow;
- running a local or fake adapter for every contract used by domain tests;
- loading sanitized fixtures for users, tenants, workers, job classes, schedules, billing guards, and managed object metadata;
- generating a release candidate using the same build entrypoints and lockfile as CI;
- running without production secrets, production hostnames, production R2 buckets, or production provider credentials;
- failing clearly when a required external dependency is unavailable rather than silently writing production-like state to a local fallback.

### Dev configuration rules

- Use an explicit environment profile such as `APP_ENV=dev-mini`; do not infer production from the hostname.
- Use separate database credentials and a separate database/schema from staging and production.
- Use namespaced local object keys such as `dev/{tenantId}/...` and a local/fake provider mode for tests.
- Keep Redis/BullMQ/Celery available only through compatibility adapters; domain services must not depend on them.
- Disable paid provider calls, real email delivery, public webhooks, and irreversible billing by default.
- Keep feature flags and adapter flags versioned in the environment manifest, not hard-coded in source.
- Never copy `.env` files to production. CI injects environment-specific secrets from the production secret store.

### Dev data lifecycle

Dev reset/seed operations are explicit and scoped. They may recreate dev rows and local objects, but must not run against a production connection. Fixtures must be sanitized and must not contain provider tokens, signed URLs, payment data, personal secrets, or real tenant exports unless separately authorized and redacted.

## Dev-to-production promotion and synchronization

### Source and artifact model

The recommended promotion model is:

```text
feature branch
     │
pull request checks
     ▼
main commit / release candidate
     │
CI builds immutable artifacts
     ├── Web Worker bundle + static assets
     ├── API/MCP/Webhook/Search/Email Worker bundles
     ├── Container images by digest
     ├── migration bundle
     ├── adapter/rollout manifest
     └── SBOM/provenance/test evidence
     │
     ▼
staging deploy → smoke/failure/recovery tests
     │ approval gate
     ▼
production promotion of the same artifact digests
```

The production deployment must record at least:

- source commit SHA and release tag;
- Worker bundle hashes and static asset manifest;
- container image digests;
- schema migration version and migration checksum;
- environment and binding manifest version;
- adapter flags and active producer per job class;
- test, security, migration, and smoke evidence links;
- operator/approver and deployment timestamp;
- rollback artifact and rollback decision window.

### Emergency hotfix promotion

An urgent production fix follows the same artifact chain with a narrower scope: create a dedicated hotfix commit, run the affected-path tests, security/secret checks, migration compatibility check, and build/provenance checks, deploy to staging, run the smallest relevant smoke/recovery suite, and promote the exact tested artifact. Skipping a check requires an explicit incident reason, owner, expiry, and follow-up issue; it must not become a permanent bypass. Hotfixes that require a database change use an additive migration first and keep the previous application release compatible.

### Synchronization matrix

| Item | Dev → production behavior | Safety rule |
|---|---|---|
| Application source | Promote commit through CI | Production never builds from an unpinned moving branch |
| Worker/static bundle | Promote exact tested artifact | Same digest in staging and production |
| Node/Python/Container image | Promote image digest | Do not rebuild during cutover |
| Database schema | Apply reviewed forward-only migrations | Expand before code, contract after reader migration |
| Reference/config data | Versioned seed/config promotion | No overwrite of tenant/business data without explicit migration |
| Production users/credits/billing | Never copy from dev | Production remains authoritative |
| `worker_jobs` and events | No blanket dev copy | Reconcile by canonical ID; preserve history |
| Queue messages | Never copy | Recreate dispatch through outbox if policy permits |
| R2 objects | Promote selected immutable objects by manifest/checksum | Do not mirror dev bucket wholesale |
| Vectorize | Rebuild or promote a verified index from authoritative metadata | Vectorize is never the only source of truth |
| Secrets | Inject separately per environment | No secret in Git, artifact, logs, or dev fixture |
| Feature flags | Promote reviewed flag state | Rollback must be independently controllable |
| Observability | Separate datasets with shared correlation schema | Never mix tenant or environment labels |

### Preparation release sequence

Every preparation release follows this order and does not change production authority:

1. Verify the commit, artifact digests, migration checksum, and manifest are immutable.
2. Run static checks, unit tests, contract tests, security checks, and migration dry-run against a representative schema/data fixture.
3. Deploy schema expand changes only to the relevant development/staging target when required.
4. Deploy the application/Worker artifact to staging with compatibility paths available.
5. Run health, readiness, API, adapter, outbox, lease, representative browser, failure-injection, load, and restore checks.
6. Rehearse the complete cutover and rollback procedure against staging using production-shaped data, object sizes, job classes, and resource limits.
7. Record the release as `CUTOVER_CANDIDATE` only when every required component, migration, binding, secret, adapter, and runbook gate is complete.
8. Keep the current `legacy-prod` runtime authoritative. No production route, database, storage, schedule, or side-effecting job producer is switched during preparation.

### Handoff to Feature 188

Feature 187 ends with a `CUTOVER_CANDIDATE` handoff. The handoff must contain the exact artifact digests, migration checksums, binding/secret manifest, source/target data manifests, unresolved-job inventory, adapter ownership map, backup/restore evidence, rollback artifacts, and staging rehearsal results. It must explicitly state that `legacy-prod` remains authoritative and that no production route, database, storage, schedule, or side-effecting producer has been switched.

Feature 188 owns the 24–72 hour maintenance window, final write fence and delta, production activation, traffic opening, rollback/forward-repair decision, zero-legacy verification, and post-cutover separation. Feature 187 supplies evidence to those gates but does not repeat or execute them.

## Database migration strategy

Database migration is separate from application deployment and has its own runbook and evidence.

### Preferred order

1. **Connection compatibility first.** Prove the selected target PostgreSQL provider (the intended PlanetScale PostgreSQL target or another explicitly approved compatible provider) and Hyperdrive path support the current schema, JSON operations, enums, indexes, foreign keys, transactions, row locks, unique constraints, and the Feature 186 guarded transition patterns. This is a preparation gate; the production connection switch occurs only in the one-time migration window.
2. **Schema expand.** Add nullable/additive fields, indexes concurrently where supported, compatibility views/projections, and migration bookkeeping without breaking the current mini-server release.
3. **Backfill.** Backfill `contractVersion`, definition hashes, timeout policies, event sequences/keys, attempts, dispatch references, and other Feature 186 fields in bounded idempotent batches. Record counts, failures, and resume cursors.
4. **Validate.** Compare row counts, key distributions, checksums for selected immutable columns, orphan counts, duplicate constraints, event ordering, tenant ownership, and sampled business projections.
5. **Connection shadow.** In staging, run representative control-plane transactions through the target connection path. Before the cutover window, legacy production remains authoritative; production shadow reads may be used only if they are isolated, read-only, tenant-safe, and explicitly approved. Shadow writes must never become a second source of truth.
6. **Prepare and rehearse Feature 188's cutover inputs.** In staging, execute the write-fence, final replication/validation, connection switch, and resume procedure as a rehearsal. Production actions belong only to Feature 188's approved maintenance window.
7. **Record pre-activation reconciliation evidence.** Verify new creates, idempotent duplicate creates, leases, retries, event append, outbox publication, external references, settlements, and representative domain projections before handoff.
8. **Contract cleanup.** Remove old connection paths and compatibility fields only after the rollback window, reader migration, and audit evidence are complete.

### Database migration safety

- A database export/import is not sufficient proof; it must be followed by semantic validation of job lifecycle, billing guards, tenant isolation, and domain projections.
- Do not use dev data to validate production identity, credit balances, or user ownership.
- Do not run irreversible destructive cleanup as part of the first cutover.
- Preserve backups and a tested restore path before every material data migration.
- Keep migration scripts resumable, idempotent, bounded, and observable.
- Treat `worker_job_events` as append-only history. Retention, tenant deletion, and privacy workflows must preserve required audit/settlement evidence.
- If the target database cannot provide the locking/transaction semantics needed by Feature 186, stop the migration and choose a compatible target or redesign the affected transition before cutover.

Hyperdrive is a connection boundary, not proof that a target database is semantically compatible. The target account/provider must pass the transaction and failure-injection test suite before production use. Cloudflare documents PostgreSQL connectivity and Worker binding configuration through Hyperdrive ([Hyperdrive PostgreSQL example](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)).

## Object storage and search migration

### R2

R2 becomes the production authority for binary objects. PostgreSQL stores object metadata, ownership, content type, size, checksum, immutable key, and lifecycle state.

Migration steps:

1. Inventory local/S3-compatible objects and classify authoritative, temporary, duplicate, expired, and unowned data.
2. Copy only selected authoritative objects to environment-specific R2 prefixes/buckets.
3. Verify size, checksum, content type, tenant ownership, and object-key mapping.
4. Enable shadow reads or controlled fallback reads with metrics; do not silently write new authoritative production objects locally.
5. Switch new writes to R2 and make result references durable before terminal job completion.
6. Reconcile missing/corrupt objects by canonical job/domain reference.
7. Retain old objects until the rollback and audit windows expire, then delete only through an approved retention workflow.

Production must not use local filesystem fallback for authoritative media. Large objects must not pass through a Worker unnecessarily when direct managed-object operations are available.

### Vectorize

Vectorize is a rebuildable semantic index, not source of truth. Index records must carry tenant/customer metadata and use a tested metadata filter. Rebuild is driven from PostgreSQL and is resumable by a versioned index build manifest. Search correctness is proved separately for exact filters, tenant isolation, stale-index behavior, rebuild, and delete/privacy workflows. Cloudflare documents metadata filtering and required metadata-index behavior ([Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)).

## Cloudflare async migration order

The runtime fit rule is:

| Workload | Preferred target | Reason |
|---|---|---|
| Short, retryable, single-step dispatch | Queues + thin consumer | Simple transport with at-least-once handling |
| Long wait, approvals, multi-step workflow | Workflows | Durable sleeps, retries, and step boundaries |
| FFmpeg, Chromium, Python, memory/filesystem-heavy work | Containers or external runner | Keeps heavy execution outside Worker limits |
| Desktop/local GPU or customer-managed runtime | Runner Gateway | Preserves device capability and trust boundary |
| Scheduled intent | Cron/Workflow scheduler | Scheduler creates job intent only |
| Email/webhook delivery | Dedicated queue worker | Isolates delivery retry and provider credentials |

Cloudflare Queues are at-least-once by default, so every consumer must be duplicate-safe ([Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)). Workflows should use explicit durable waits/retries for long-running coordination ([Workflows sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)). Containers are deployed and updated through the Worker/ Wrangler boundary and require a separate image/lifecycle proof ([Containers get started](https://developers.cloudflare.com/containers/get-started/)).

## Phased migration plan

Each phase has an entry gate, deliverables, exit gate, and rollback boundary. Phases 0–9 are preparation, compatibility, and staging-rehearsal work only. The current `legacy-prod` runtime remains authoritative throughout all phases. Production activation and the maintenance window belong exclusively to Feature 188.

### Phase 0 — Inventory, baseline, and migration manifest

**Purpose:** Establish a fact-based map before changing traffic or data ownership.

Deliverables:

- component audit matrix covering current runtime, source of truth, queue, scheduler, Cloudflare target, owner, risk, and migration wave;
- direct `worker_jobs` insert inventory and direct BullMQ/Celery/Beat/Cloud Tasks call-site inventory;
- job-class catalog with execution class, side effects, timeout, retry, capability, tenant, and rollback owner;
- current performance/cost baseline for API, DB, queue, job latency, provider latency, R2/storage, and worker resource use;
- environment/binding inventory and secret ownership map;
- per-wave migration manifest template.

Exit gate: every job class is either mapped to a migration wave or explicitly declared legacy/unmigrated with an owner. No production cutover begins from an unknown producer.

Rollback: none required; this phase is read-only.

### Phase 1 — Feature 186 correctness hardening on the mini server

**Purpose:** Make the existing environment a safe control-plane reference before introducing a new runtime.

Deliverables:

- outbox publisher wired to the real adapter registry and tested on startup/restart;
- all new job creation routed through canonical create/idempotency/definition-hash logic;
- worker claim, heartbeat, progress, completion, failure, cancellation, and recovery using lease/fencing context;
- event retention/FK behavior preserving required append-only evidence;
- reconciler observe-only and bounded-recovery modes with metrics and operator review;
- direct legacy call sites classified as migrated, compatibility-wrapped, or intentionally unmigrated.

Exit gate: a local job can survive broker loss, duplicate delivery, worker loss, lease expiry, stale completion, and publisher response loss without losing canonical truth or duplicating paid side effects.

Rollback: keep legacy adapters for unmigrated classes; do not enable new adapter flags until the local proof passes.

### Phase 2 — Mini-server development parity

**Purpose:** Guarantee that local development remains usable as Cloudflare migration proceeds.

Deliverables:

- explicit `dev-mini` environment profile and safe configuration validation;
- reproducible local boot, migration, seed, test, and smoke commands;
- fake/in-memory adapters for Queues, Workflows, Containers, scheduler, email, and webhook contracts;
- sanitized fixtures and local provider stubs;
- local R2-compatible/object gateway contract and Vectorize fake/rebuild fixture where required;
- development documentation for debugging a job end-to-end by canonical ID.

Exit gate: a new contributor can clone the repository, provision only dev dependencies, apply migrations, run focused tests, execute a representative job, and inspect the timeline without production credentials.

Rollback: retain the previous local compose/runtime path while the new dev profile is corrected.

### Phase 3 — Release and promotion pipeline

**Purpose:** Make dev-to-production sync an artifact-promotion operation rather than manual server copying.

Deliverables:

- CI checks for changed-path tests, full relevant tests, schema dry-run, static call-site audit, security/secret scan, build, bundle/image digest, and provenance;
- immutable release manifest containing source SHA, artifact digests, migration checksum, flags, bindings, and evidence;
- staging deploy and promotion workflow using the same artifact digest;
- environment-specific secret/config injection and approval gates;
- automated post-deploy health/readiness, API, adapter, outbox, worker, and rollback checks;
- deployment history queryable by release, environment, and canonical job ID.

Exit gate: staging can be promoted without rebuilding, and rollback can restore the previous artifact/flag combination without changing data identity.

Rollback: disable promotion and keep the current production artifact; no source or data mutation is required.

### Phase 4 — Cloudflare landing zone and edge compatibility

**Purpose:** Establish and rehearse Cloudflare routing and Worker entrypoints while the existing production origin remains authoritative.

Deliverables:

- separate dev/staging/prod Cloudflare resources and bindings;
- Web, API, MCP, Webhooks, Jobs, Search, and Email Worker entrypoint contracts;
- DNS/TLS/WAF/rate-limit/Turnstile and service-auth configuration;
- static asset deployment and cache policy;
- transitional origin proxy strategy with explicit timeout, header, auth, and observability behavior;
- Worker-compatible configuration and dependency audit.

Exit gate: staging Worker routes serve the intended asset/API contract, can reach only the correct environment resources, can route back to the existing origin for rehearsal, and have an approved production binding/route manifest ready for the cutover window.

Rollback: route traffic to the existing origin while keeping Cloudflare configuration disabled or read-only.

Workers Static Assets deploy a Worker and static assets as one unit with Wrangler asset configuration ([Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)); the implementation must not treat a successful Vite build alone as Worker deployment proof.

### Phase 5 — Database, R2, and Vectorize boundary

**Purpose:** Prepare and rehearse data access and object/search authority independently, without changing production authority.

Deliverables:

- target PostgreSQL/Hyperdrive compatibility evidence;
- expand/backfill/validate migration for existing and Feature 186 fields;
- database backup/restore rehearsal and cutover runbook;
- R2 inventory, copy, checksum, ownership, and fallback-removal evidence;
- Vectorize index/build manifest and tenant-filter validation;
- data privacy/export/delete behavior across PostgreSQL, R2, and Vectorize.

Exit gate: representative control-plane transactions, domain reads/writes, object reads/writes, search filters, restore flows, final-sync rehearsal, and recovery flows pass from staging through the target data boundaries; production still uses `legacy-prod` authority.

Rollback: return connection/storage/search routing to the previous authoritative boundary only within the validated rollback window; preserve both histories and do not silently split writes.

### Phase 6 — API and application workload migration

**Purpose:** Build and rehearse endpoint-family compatibility without opening partial production traffic.

Deliverables:

- API Worker routes for low-risk read/write endpoints;
- stable auth, tenant, billing, idempotency, error, and request-correlation contracts;
- route flags by endpoint and environment for staging/rehearsal; production route activation is reserved for Feature 188;
- API latency/error/load evidence compared with the mini-server baseline;
- explicit origin fallback for unmigrated endpoints.

Exit gate: selected endpoints run in Cloudflare staging and full cutover rehearsal without changing domain source of truth or requiring a second job model.

Rollback: route the affected endpoint family to the prior origin artifact.

### Phase 7 — Queue, Workflow, and Scheduler migration

**Purpose:** Implement and validate all approved transport/scheduling adapters before the Feature 188 production cutover.

Deliverables:

- Cloudflare Queues adapter for one non-paid, reversible, low-risk job class;
- Workflows adapter for one long/multi-step class with persisted step/reference mapping;
- Cron/scheduler adapter that creates deterministic schedule occurrences only;
- duplicate delivery, lost publish, provider ambiguity, workflow pause/resume, and rollback tests;
- per-job-family producer ownership plan, drain procedure, and cutover ordering; no production producer switch occurs before Feature 188's cutover;
- legacy BullMQ/Celery/Beat/Cloud Tasks compatibility shims and retirement evidence.

Exit gate: staging has one active side-effecting producer per class, canonical ID is preserved, outbox age is within SLO, business attempt count is unchanged by transport retries, the full cutover is rehearsed, and rollback/forward-repair decisions are tested.

Rollback: return new work to the previous adapter while preserving canonical jobs and committed history; reconcile in-flight dispatch references before resuming.

### Phase 8 — Heavy workloads, external runners, email, and webhooks

**Purpose:** Build and validate all heavy-workload, external-runner, email, and webhook targets before the Feature 188 production cutover.

Deliverables:

- capability-based routing to Containers or Runner Gateway;
- runner registration, heartbeat, lease, artifact, and cancellation boundary;
- trusted-container image provenance and resource limits;
- explicit policy for user-code sandboxing; OpenSandbox is not assumed to be part of the baseline target;
- Email Dispatcher → Queue → Email Worker path with provider idempotency;
- Webhooks Worker with signature validation, replay protection, tenant correlation, and delivery evidence;
- removal or isolation plan for SMTP/Dramatiq/legacy delivery paths; actual production removal occurs during Feature 188's cutover.

Exit gate: staging and rehearsal jobs survive worker/container restart, heartbeat loss, provider ambiguity, and retry without duplicate credits, provider submissions, artifacts, notifications, or webhooks; production bindings and rollback artifacts are ready.

Rollback: keep the previous runner or delivery adapter for new work; never dispatch the same side-effecting operation to both runtimes.

### Phase 9 — Cutover-candidate handoff to Feature 188

**Purpose:** Freeze the tested preparation package and hand it to Feature 188 without changing production authority.

Deliverables:

- immutable release, schema, data, adapter, binding, and rollback manifests;
- complete staging cutover/rollback rehearsal with production-shaped data and job classes;
- unresolved-job, tenant-ownership, side-effect-settlement, and legacy-producer inventory;
- named owners and evidence links for every Feature 188 activation gate;
- explicit handoff approval while `legacy-prod` remains authoritative.

Exit gate: every enabled target has passed staging and recovery evidence, the handoff package is immutable and complete, no required producer or tenant mapping is unknown, and Feature 188 accepts the package for cutover planning.

Rollback: correct the preparation artifact, manifest, adapter, or staging environment while production remains on `legacy-prod`.

## Performance and efficiency requirements

Performance targets are initially baseline-relative and must be recorded per workload class before Feature 188's one-time production migration window. Staging canaries and rehearsals are allowed; production canaries or partial production cutovers are not part of the preparation phases.

### Required measurements

- API p50/p95/p99 latency and error rate by endpoint family;
- PostgreSQL transaction latency, lock wait, connection saturation, and serialization/deadlock rate;
- outbox age, publish success rate, duplicate publication rate, and quarantine rate;
- queue age, delivery latency, duplicate delivery, retry, and dead-letter rate;
- job end-to-end latency by execution class and business attempt;
- lease freshness, expiry recovery time, stale completion rejection, and reconciler throughput;
- R2 upload/download latency, object hit/miss, checksum failures, and egress;
- Vectorize query latency, filter correctness, rebuild duration, and stale-index rate;
- Worker/Container cold start, CPU/memory, execution duration, concurrency, and cost per job;
- provider request latency, rate limits, ambiguous outcomes, and idempotency convergence;
- cost per successful job and cost per failed/recovered job compared with the mini-server baseline.

### Efficiency rules

- Use Queues for short transport, Workflows for durable waiting/multi-step coordination, and Containers/external runners for heavy compute.
- Do not hold an application lease while waiting on a provider that supports an external wait state.
- Batch outbox/reconciliation work within bounded tenant-aware limits, but keep each transition guarded and idempotent.
- Keep large payloads and binaries out of Worker memory and PostgreSQL rows; use managed object references.
- Use Vectorize only for semantic retrieval; do not duplicate authoritative business filters into an unverified index.
- Use KV/cache only for cacheable configuration and read acceleration, never for job leases, credit balances, billing, or session authority.
- Use Durable Objects only when live coordination or WebSocket state materially benefits; polling must remain a supported correctness path.
- Scale by job class and tenant admission limit before increasing global concurrency.

Suggested initial staging/rehearsal gates, to be calibrated against baseline, are zero duplicate paid side effects, zero cross-tenant results, zero job rows without outbox intent, no unexplained stale completion, bounded outbox/recovery SLOs, and no material regression in p95 latency or cost per successful job. The same gates become mandatory production-open gates during Feature 188's cutover.

## Security and data safety

- Cloudflare Worker, API, runner, database, storage, queue, workflow, and provider credentials are environment-specific and stored only in the approved secret manager.
- CI logs, build artifacts, migration output, job events, and admin screens must redact secrets, database URLs, signed URLs, provider tokens, prompts, and raw provider responses.
- Service-to-service calls carry authenticated service identity plus `tenantId`, `jobId`, attempt ID, correlation ID, and contract version; client input cannot override server-derived scope.
- Hyperdrive, R2, Vectorize, Queues, Workflows, Containers, and Durable Objects must be bound to the intended environment at deployment time and validated by startup/readiness checks.
- Tenant deletion/export must define behavior for PostgreSQL rows, append-only events, outbox/dispatch records, R2 objects, Vectorize metadata, logs, and provider references.
- R2 object keys, Vectorize metadata, queue messages, workflow references, runner sessions, and webhooks must be tenant-correlated and replay-safe.
- Production admin actions require existing authorization, reason, target state/attempt, idempotency key, and audit evidence.
- Arbitrary user code, shell commands, container images, and Worker bindings are never selected directly from user payloads.

## Observability and operations

Every request, job, event, adapter operation, provider call, object operation, and deployment record should correlate where applicable using:

```text
environment
request_id
trace_id
job_id              # worker_jobs.id
attempt_id
workflow_id
dispatch_id
runner_id
tenant_id
provider_request_id
release_sha
schema_version
adapter
```

Required dashboards and alerts:

- canonical job counts and age by tenant/class/status;
- outbox unpublished/quarantined age and publisher health;
- lease freshness, expired lease recovery, stale completion rejection;
- database latency/locks/errors and Hyperdrive connectivity;
- R2 object failures and Vectorize rebuild/filter health;
- queue/workflow/container delivery and retry observations;
- deployment version, binding version, migration version, and feature flags;
- cost, throughput, p95 latency, and error budget by environment.

An HTTP 200 health endpoint proves only liveness. Readiness must verify the environment contract without exposing credentials, and production proof must include build identity, binding identity, migration state, representative business flow, worker connectivity, and recovery evidence.

## Acceptance criteria

### Mini-server continuity

- The mini server boots with an explicit dev profile and no production secrets.
- Local development can run migrations, sanitized fixtures, focused tests, and a representative canonical job flow.
- Local adapters implement the same contracts as staging Cloudflare adapters.
- Production-only bindings have documented local substitutes or fail-closed diagnostics.
- Dev resets cannot connect to or mutate production resources.

### Promotion and synchronization

- A release is promoted by commit SHA and immutable artifact digest, not manual source copying.
- Staging and production use the same tested Worker bundle and container image digests.
- Migration checksum, schema version, feature flags, binding manifest, and evidence are recorded for every release.
- Code rollback, adapter rollback, and schema rollback boundaries are explicit and tested.
- Dev operational data, queue messages, secrets, and production user/credit/billing rows are never copied automatically.
- Selected R2 assets and rebuildable Vectorize indexes can be promoted by manifest and checksum.

### Database and source of truth

- The target PostgreSQL/Hyperdrive path passes transaction, locking, unique-constraint, tenant-isolation, and failure-injection tests.
- Feature 186 canonical job ID and append-only event invariants survive database migration.
- Expand/backfill/validate/handoff/cleanup steps are resumable, idempotent, and evidenced.
- No job is created, completed, billed, or recovered solely from a queue/provider record.
- No second generic `jobs` table or competing lifecycle status is introduced.

### Cloudflare readiness

- Worker entrypoints and environment-specific bindings exist for the enabled production components.
- Static assets, API routing, Hyperdrive, R2, Queues, Workflows, Containers, Cron, Vectorize, and optional Durable Objects have contract tests for the enabled scope.
- A Queues-like duplicate delivery converges on one canonical job and one side effect.
- A Workflow-like pause/resume/replay preserves step idempotency and PostgreSQL truth.
- A Container-like restart preserves lease/recovery and artifact reporting.
- Webhook and email delivery are authenticated, deduplicated, rate-limited, and auditable.

### Handoff readiness

- Phases 0–9 are complete and every enabled target has a passed staging/rehearsal gate.
- The immutable `CUTOVER_CANDIDATE` package contains release, schema, data, adapter, binding, secret, backup, rollback, and evidence manifests.
- Each job class has one active side-effecting producer in staging, a drain plan, a rollback flag, and a reconciliation window.
- Data checksums, object manifests, Vectorize state, unresolved-job inventory, tenant ownership, and restore evidence are complete for handoff.
- No direct legacy producer remains unowned; intentionally unmigrated paths and their owners are listed in the manifest.
- Recovery drills cover database loss, broker loss, publisher loss, worker loss, provider ambiguity, container restart, stale callback, and adapter rollback.
- Performance, cost, error, and recovery metrics meet the approved preparation gates.
- Feature 188 has a named owner for every activation gate and has accepted the handoff; production remains on `legacy-prod` until Feature 188 executes its cutover.

## Verification plan

1. Repository/static checks for direct transport calls, direct `worker_jobs` inserts, environment leakage, missing manifests, and unsupported Worker dependencies.
2. Unit tests for environment selection, promotion-manifest validation, migration compatibility, adapter routing, redaction, and rollback decisions.
3. Database tests for expand/backfill/validate, idempotent resume, row-lock/fencing behavior, event retention, tenant isolation, and restore validation.
4. Local dev smoke tests for boot, migration, fixture load, create/outbox/claim/report, R2 contract, search contract, and safe shutdown.
5. Cloudflare adapter contract tests for Queues, Workflows, Containers, Cron, Webhooks, Email, R2, Hyperdrive, Vectorize, and optional Durable Objects.
6. Failure-injection tests for lost DB connection, lost publish response, duplicate delivery, expired lease, stale completion, provider ambiguity, workflow replay, container restart, and rollback.
7. Staging end-to-end tests using the exact release artifact intended for promotion.
8. Browser/API tests for authentication, tenant boundaries, admin monitor, job timeline, redaction, route flags, and truthful readiness state.
9. Load and cost tests by execution class with bounded concurrency and representative payload/object sizes.
10. The handoff evidence separately records release identity, schema state, adapter flags, worker connectivity, staging data/object synchronization, representative business flow, recovery result, and the Feature 188 cutover gate mapping; it must not be presented as production cutover proof.

## Risks and trade-offs

| Decision | Benefit | Cost / mitigation |
|---|---|---|
| Keep mini server as dev | Low disruption and easy local debugging | Requires environment parity and explicit dependency adapters |
| Promote immutable artifacts | Repeatable and auditable releases | Requires CI provenance and artifact retention |
| Separate code/data/secret sync | Prevents accidental production overwrite | Requires several promotion manifests and gates |
| One database authority during migration | Avoids dual-write divergence | Requires compatibility proof and possibly a short write fence |
| Prepare by job family, activate together | Limits preparation risk while honoring one-shot production cutover | Legacy adapters remain until the window; maintain a complete inventory |
| Use Queues/Workflows/Containers by capability | Better cost and runtime fit | More deployment surfaces; keep ports provider-neutral |
| Keep Vectorize rebuildable | Prevents search index from becoming business truth | Rebuild jobs and metadata filters must be maintained |
| Use R2 for production binaries | Avoids local disk coupling | Requires checksum, lifecycle, and privacy workflows |

## Explicit non-goals

- No production cutover, traffic switch, or legacy retirement in Feature 187.
- No new parallel generic `jobs` table.
- No automatic copying of dev PostgreSQL, Redis, queue, R2, secrets, or provider state into production.
- No production dependency on the mini server after a component is declared Cloudflare-owned.
- No assumption that a mock adapter, local health check, successful build, or Cloudflare route alone proves production readiness.
- No use of KV, Vectorize, Redis, queue state, provider IDs, or workflow IDs as replacements for PostgreSQL job truth.
- No arbitrary user-code sandbox migration into trusted Cloudflare Containers.
- No deployment, credential migration, destructive data cleanup, or production cutover as part of writing this specification.

## External platform references

These references inform the target boundary and must be revalidated against the deployment account, plan, limits, and actual production configuration during implementation:

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Hyperdrive PostgreSQL connection](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [Cloudflare Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [Cloudflare Queues configuration](https://developers.cloudflare.com/queues/configuration/configure-queues/)
- [Cloudflare Workflows sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)
- [Cloudflare Containers get started](https://developers.cloudflare.com/containers/get-started/)
- [Cloudflare Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)
- [Cloudflare Durable Objects WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

These links are architectural inputs, not permission to couple business services directly to Cloudflare APIs.
