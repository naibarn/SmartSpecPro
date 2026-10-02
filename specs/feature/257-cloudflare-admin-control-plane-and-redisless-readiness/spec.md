---
spec_id: 257
title: Cloudflare Admin Control Plane and Redis-Free Queue/Cache Readiness
revision: 0.1
status: PROPOSED / PROVISIONAL NUMBER / PLANNING ONLY / NOT IMPLEMENTED
created: 2026-09-28
updated: 2026-09-28
numbering: PROVISIONAL 257; validate canonical registry, branches, worktrees, and active PRs before adoption
parent_program: Spec 245 Full-System Cloudflare Migration
queue_migration_authority: Spec 232 Redis/BullMQ to Cloudflare Migration
canonical_job_authority: Feature 186 / Feature 195 worker_jobs + transactional outbox
primary_owners: Platform / Admin UX / Job Control Plane / SRE / Security
risk_class: HIGH — credentials, job execution, and production cache migration
implementation_strategy: bounded inventory -> parallel independent workstreams -> per-family cutover -> one final Redis retirement gate
---

# Spec 257 — Cloudflare Admin Control Plane and Redis-Free Queue/Cache Readiness

> **Status:** planning only. This document does not claim that the catalog, credential assignments, Cloudflare Queue transport, KV cutover, or Redis retirement is implemented or production-ready. The number is provisional until the canonical spec registry and active work are checked.

## 0. Intent and outcome

Provide one understandable Admin control plane for Cloudflare services and credentials while accelerating SmartAIHub's transition to a Redis-free runtime. Admins can register any number of Cloudflare API tokens, inspect current Cloudflare permission groups, associate a credential with one or many service integrations, and choose a single shared credential or separate credentials according to their security and operational needs.

All durable background work across the application MUST be admitted through Feature 186/195 `worker_jobs` and its transactional outbox. PostgreSQL remains the business-state and job-state authority. Cloudflare Queues are delivery transport only. Redis, BullMQ, Celery brokers, parallel queue ledgers, and detached in-process work MUST NOT own or process application job queues after the applicable migration gates pass. Cache responsibilities move to Cloudflare KV when their consistency contract permits it. No cache is allowed to become a second business-data authority.

The delivery order prioritizes making canonical `worker_jobs` admission complete, then enabling the earliest safe KV and Cloudflare Queue canaries, then migrating all remaining families and removing Redis runtime dependencies. Full support need not be delivered in one release; this spec makes the desired end state and safe sequence explicit.

## 1. Scope and ownership

### 1.1 Spec 257 owns

- Cloudflare Admin credential inventory, profile/service assignment UX, catalog synchronization, operator guidance, and auditability.
- Explicit credential-source mapping for each SmartAIHub Cloudflare integration, including legacy settings and deployment-owned secrets.
- Cross-cutting completion tracking that connects this Admin center to Spec 232 job/cache migration receipts and Spec 245 migration readiness.
- Acceptance conditions that all long-running/background work uses the canonical job-control plane and that no Redis-backed application queue or cache remains at final Redis retirement.
- A practical rollout sequence that allows independently safe KV and Cloudflare Queue canaries as early as their readiness permits.

### 1.2 Existing authorities remain owners

| Concern | Authority | Spec 257 boundary |
|---|---|---|
| Job identity, status, attempts, leases, fencing, events, settlements | Feature 186 / Feature 195 `worker_jobs` | Consume and require these contracts; create no parallel ledger or finality authority. |
| Redis/BullMQ/Celery family migration, Queue transport, cache consistency and cutover receipts | Spec 232 | Consume and link family-level plans/evidence; do not duplicate or override its migration protocol. |
| Full hosting migration, promotion/rollback, disaster recovery, Debian retirement | Spec 245 | Consume its release gates and environment evidence. |
| Cloudflare agent/container runtime | Spec 242 | Preserve its runtime/security boundary. |
| Existing Vectorize and R2 service/data contracts | Existing service owners / Specs 229 and 245 | Synchronize legacy configuration; do not move Vectorize again or conflate R2 S3 data credentials with Cloudflare API tokens. |

When documents disagree, Feature 186/195 owns durable job truth, Spec 232 owns queue/cache migration mechanics, and Spec 245 owns cross-system promotion. This spec owns Admin credential and mapping UX only.

## 2. Non-negotiable product and runtime rules

1. **One durable job authority:** Every user-, system-, schedule-, webhook-, agent-, media-, and provider-triggered long-running job is represented by one tenant-scoped `worker_jobs` record. The producer and its idempotency key are recorded at admission.
2. **One transactional publication boundary:** The canonical job, required state/event, and outbox record are committed atomically in PostgreSQL. Queue/network publication does not occur inside the database transaction.
3. **Cloudflare Queues are transport:** Queue messages contain a validated reference to the canonical job and required version/routing metadata, not an independent job status or business payload authority. Delivery is at-least-once; consumers claim through canonical PostgreSQL state and fencing.
4. **No alternate application queue:** No Redis/BullMQ queue, Celery broker, second database job table, ad hoc scheduler queue, detached promise, or framework queue manager may accept application background work after its certified cutover. Cron/timer invocations may wake a bounded PostgreSQL due-work scan; each occurrence still becomes a canonical `worker_jobs` record.
5. **Redis-free target runtime:** At final retirement, no production application service, worker, web process, scheduled task, deployment process, or required health probe depends on Redis. Redis-specific cache, lock, pub/sub, rate-limit, authentication, or coordination uses must be inventoried and assigned to a semantics-appropriate approved owner before Redis removal. Redis cannot remain as an undocumented “non-queue exception.”
6. **Cache is non-authoritative:** KV is for data whose declared consistency and privacy class tolerate eventual consistency. PostgreSQL/R2 or the service's existing canonical store remains the source on a miss, expiry, or KV outage. Auth revocation, ACL, credits, job leases, idempotency, and exact counters MUST NOT rely on stale KV.
7. **Credential sharing is Admin choice:** One saved token may be assigned to multiple Cloudflare service integrations; one service may use a selected token from among multiple credentials. The UI recommends least privilege but does not force one-token-per-service or a fixed token-purpose taxonomy.
8. **Cloudflare permissions remain authoritative:** Saving a token or mapping it to a service cannot grant permissions. Cloudflare rejects calls not covered by the token's account/user/zone/resource scope. Writes and production resource mutations require their existing approval and deployment procedures.
9. **No secret disclosure:** Raw tokens and secret-derived values never return to the browser, logs, traces, audit history, reports, or error messages. Saved values are encrypted at rest; secrets are only accepted through write-only inputs and are masked after save.
10. **No unrelated migration gate:** A missing Cloudflare credential for one feature must not block login or unrelated functionality. Readiness is per integration and per job family, not a system-wide auth switch.

## 3. Cloudflare credential and service control plane

### 3.1 Cloudflare service catalog

The Admin center MUST distinguish the **Cloudflare API permission catalog** from SmartAIHub's active integrations.

- Fetch and refresh the current permission-group catalog from Cloudflare's supported permission-groups API, including permission group ID, display name, description, supported scope types, and catalog retrieval time. Treat the remote ID as the stable key and display text as mutable.
- Display permission groups under Cloudflare's current user/account/zone scope categories and provide search/filter by product, scope, and read/write intent where Cloudflare metadata supports that distinction.
- Maintain a separate SmartAIHub integration catalog that links actual repository/runtime consumers to the permission groups and scopes they require. Each link includes source owner, environment, service endpoint or binding, credential source, probe method, and whether the integration is configured, optional, active, or planned.
- Refreshing the remote catalog MUST NOT silently grant, create, or change permissions, credentials, bindings, or Cloudflare resources.
- If catalog retrieval fails, show the last successful catalog with its age and a clear stale/unavailable state. Never present the cached catalog as current.
- Support a documented manual/custom integration entry for APIs or Cloudflare products that are not yet mapped to SmartAIHub. Such an entry must not claim an automated probe or working integration until a real consumer and safe probe exist.
- “All Cloudflare services” means all permission groups available from Cloudflare's current permission-group catalog plus explicit SmartAIHub/custom integration records. It does not imply that every Cloudflare product API is implemented by this application.

### 3.2 Credential inventory and flexible assignment

Replace the hard-coded `audit` / `deployment` profile model with a credential inventory and explicit bindings.

- Admin can add any number of token records with a user-chosen label, Cloudflare account/environment association, optional notes, and token/expiry metadata only where safely available.
- A credential record is independent from a service record. A many-to-many assignment allows one token to serve several integrations and multiple credentials to be available for one integration/environment.
- Admin can choose whether to reuse a token or create separate least-privilege tokens. The UI explains the blast-radius tradeoff but permits the Admin's choice.
- Token changes use replace-and-verify rotation: save replacement, run safe probes, update binding, observe consumers, then revoke the old token through Cloudflare's own process. Never expose saved token contents to support the rotation.
- Never infer that a token has access from its label, chosen service, or configured state. Display Cloudflare probe outcomes separately from intended service assignments.
- Where a token's permissions cannot be introspected safely, show configured assignments as administrator-declared and mark live permission evidence as unverified until a read-only service probe confirms it.
- Credential deletion is blocked or explicitly confirmed when active service bindings still reference that credential. Show affected integrations and require reassignment first unless removing a known-invalid binding.
- Record actor, time, operation, credential ID, affected service bindings, and redacted outcome in the existing approved Admin audit mechanism. Never record token value, reversible ciphertext, full Authorization header, or token fingerprint that would enable recovery.
- Enforce exact-admin authorization, rate limits, input bounds, CSRF/session protections, and tenant-independent platform-admin scope for center mutations.

### 3.3 Service credential bindings and settings synchronization

- Each SmartAIHub integration has a declared credential source: encrypted Admin vault record, legacy database setting, deployment secret manager/environment, Cloudflare binding, or separate protocol credential such as R2 S3.
- Admin can see whether a value is present and where its source of truth lives. If a legacy and new source coexist, the UI names the canonical source and provides a controlled synchronization/migration state; it must not create silent duplicate secrets.
- Existing `vectordb.vectorizeAccountId` and `vectordb.vectorizeApiToken` remain synchronized during migration until all Vectorize consumers have moved under the declared binding contract and parity is verified.
- Existing R2 S3 credentials stay distinct from Cloudflare API token permission for R2 bucket administration. Preserve currently configured R2 profiles and never overwrite them with a Cloudflare token.
- Worker runtime tokens, Search Cache tokens, CI/deployment credentials, and Cloudflare API tokens are separate secret types. A shared value may be entered for more than one use only when explicitly supported by each consumer's contract; do not copy deployment-owned environment secrets into the Admin vault by default.
- UI mutations that update a legacy setting must write the existing canonical row and refresh the existing consumer cache/configuration path. Rollback preserves the previous encrypted value until consumers are confirmed on the new binding.

### 3.4 Permission and connectivity probes

- Provide read-only probes for each mapped integration, with exact API endpoint, scope, and expected permission-group IDs documented in code/catalog.
- Probe results distinguish: granted, missing permission, invalid/expired token, resource absent, unsupported endpoint, rate limited, network/provider unavailable, and not configured.
- Probe account and every configured managed zone, not one hard-coded production hostname. Zone inventory itself requires a clearly reported Zone Read permission.
- Never use write operations as a probe. A read probe cannot certify a write permission; show that limit explicitly.
- Bound concurrency, timeout, response size, and rate. Do not dump provider response bodies or secret-bearing data to the browser.
- Store last probe time/status and safe evidence; refresh on demand and show stale results as stale.

## 4. Canonical background work and queue convergence

### 4.1 Admission inventory and completeness

Create a machine-readable inventory of every background-work producer, consumer, schedule, callback, and runtime. Include Node, Python, browser/media, LLM/provider, notification, indexing, workflow/agent, maintenance, and user-created tasks. For each record document:

`{owner, producer, entrypoint, job_family, tenant_scope, idempotency_key, current_transport, current_consumer, retry_owner, lease_owner, external_effect, target_executor, migration_status, proof}`.

The inventory MUST include ad hoc `setTimeout`/detached promises, local process queues, BullMQ, Celery/Beat, Redis list/stream/pub-sub dispatch, framework queue wrappers, database polling workers, and Cloudflare Queues/Workflows usage. Mark non-work background timers that are safe inline separately with a written rationale; they must not hide user-visible, provider-costing, durable, or retryable jobs.

### 4.2 Target contract

```text
Any producer
    -> PostgreSQL transaction:
       canonical worker_jobs + event + idempotent outbox
    -> outbox publisher / reconciliation
    -> approved transport (initially PostgreSQL-pull worker; Cloudflare Queue as certified)
    -> consumer validates message and atomically claims canonical job + lease/fence
    -> existing executor/provider/Runner/Container
    -> guarded settlement and append-only events in PostgreSQL
```

- Producers submit all accepted work without UI-level concurrency queues. The control plane and workers own fairness, per-family concurrency, per-tenant limits, backpressure, retry schedule, lease, and settlement under Feature 186/195 contracts.
- UI requests use async receipt/status APIs and never wait for a long provider/render task in the request lifecycle. They do not decide batch dispatch width or create separate per-slot queue records unless each slot is a real canonical job by existing product contract.
- Queue transport may change from PostgreSQL-pull to Cloudflare Queues without changing canonical job identity, user-visible status, business retry rules, or settlement authority.
- A Cloudflare Queue message is only a wake/delivery reference. Duplicate, reordered, expired, malformed, or late messages cannot create a second business job or bypass PostgreSQL fencing.
- Queue outages persist/reconcile work through canonical PostgreSQL state with a typed publication/readiness status. There is no hidden Redis/Celery fallback and no unbounded inline execution fallback.
- Existing workers and runtime families can be moved incrementally, but once a family is promoted, only one fenced executor is authorized for new work. Historical messages/jobs receive explicit disposition; no stranded or duplicate job is silently restored.
- Cron and scheduled triggers create canonical occurrences with uniqueness on the existing schedule identity/time contract. Scheduler delivery is a wake-up hint, not a competing durable queue.

### 4.3 Redis and other queue-manager retirement

- Spec 232's responsibility inventory is mandatory; final proof includes all concrete families and producers, not an assumed fixed count.
- Remove Redis/BullMQ/Celery or other queue-manager producer/consumer packages, flags, deployment units, probes, secrets, scheduled processes, and network dependencies only after call-graph/runtime audits, family promotion evidence, and rollback/retention requirements pass.
- If a PostgreSQL-pull worker remains during transition, it still consumes canonical `worker_jobs`; it is not an independent queue authority. The final target can combine PostgreSQL/outbox with Cloudflare Queues transport while keeping one durable job system.
- Cloudflare Queues may be enabled family by family as soon as account entitlement, binding, idempotent consumer, retries/DLQ, reconciliation, observability, and rollback gates for that family pass. Do not wait for unrelated migrations or a fixed observation delay.
- Final “no other queue” proof uses source/config scans plus runtime process/network/metric evidence and synthetic jobs for every active family. No single green worker process or source grep proves completion.

## 5. Cache convergence: Redis to Cloudflare KV

- Inventory every Redis-backed cache key/prefix and every in-process or external cache involved in the targeted migration. Record owner, data classification, tenant/user scope, canonical source, TTL, payload size, freshness requirement, invalidation/deletion path, hit rate, and fallback behavior.
- Move the earliest safe, read-mostly, disposable cache to Cloudflare KV as soon as scoped namespace/binding, key strategy, security classification, cost/limits, miss fallback, and stale-data acceptance are certified.
- Cache keys must include required tenant/owner/scope, schema version, and content/config epoch. TTL and bounded stale windows are explicit. No credentials, tokens, session secrets, private data without approval, or authorization decisions go into KV by default.
- KV eventual consistency means no read-after-write or immediate delete/revocation guarantee. Do not use KV for job status, claims, outbox, leases, credits, authorization, session revocation, exact counters, distributed mutexes, or transactional invariants.
- Cache miss, stale value, malformed value, permission denial, KV timeout, or KV outage follows the integration's approved canonical-source path. It never falls back to Redis at runtime after that cache family is promoted.
- For each cache family, verify warm/cold behavior, regional propagation/staleness, version rollover, deletion/privacy erasure, outage behavior, cache stampede limits, read/write operation cost, and fallback-origin capacity before production promotion.
- After migration, remove only that family’s Redis cache reader/writer when its traffic and rollback gates close. Global Redis retirement waits until all remaining Redis responsibilities (not just cache and queues) have an owner and evidence.

## 6. Work plan and dependency order

This is one migration program with one completion condition: all production Redis responsibilities are retired and Redis access is denied. Family-specific cutovers are execution controls inside that program; they must not become separate projects with unrelated completion dates.

Parallelize independent work immediately. P257.0 records the complete target inventory and unknowns, but an unknown in one family blocks only that family and final Redis retirement. It does not block a safe cache canary, credential probe, non-production Queue test, or another family whose own contract and rollback are ready. Never wait for all job families to finish before starting the cache track, and never wait for the cache track before starting job admission work.

| Workstream | Can start when | Does not wait for | Blocks |
|---|---|---|---|
| Cloudflare credential/service probes | The specific credential source and target service are identified | Queue migration, G2, or full Redis inventory | Only provisioning/probing that service |
| Read-mostly cache to KV | The cache family, canonical fallback, privacy class, namespace, and rollback are known | `worker_jobs`, auth reconciliation, Queue handlers | Promotion of that cache family |
| Canonical job admission | The existing `worker_jobs`/outbox contract and producer are identified | KV cache migration and G2 reconciliation | Queue promotion for that job family |
| Cloudflare Queue canary | Canonical job admission, consumer contract, binding, and scoped credential are ready for the selected family | Other queue families and cache families | Promotion of that job family |
| G2 auth/revocation | Auth writers, restore path, and G2 maintenance procedure are ready | Cache, Queue, G3–G6 | Reopening bearer-authenticated paths that need the affected revocation authority |
| Final Redis retirement | Every family has a destination, cutover evidence, drained legacy work, and rollback that works without Redis | Nothing; this is the terminal gate | Redis shutdown/removal |

Work-package names below are local to Spec 257 and do not replace Spec 232's family contracts or Spec 245's release/rollback gates.

### P257.0 — Registry, baseline, and ownership lock

- Verify spec number/slug reservation and conflicts; map current 245/232 revision and implementation status.
- Inventory Admin credential code and every current Cloudflare setting/secret consumer without printing secret material.
- Build the complete background-job and Redis-responsibility matrices in parallel with safe family work; inspect runtime flags, migrations, systemd/Compose/CI, Redis network usage, and active workers.
- Capture per-family job backlog/lag/failure/retry/concurrency, cache hit/miss/staleness, provider spend, and current health baselines.
- **Exit:** every known family has an owner and dependency record; unknowns are assigned to an owner and block only their dependent family plus final Redis retirement. Production status is separated from local implementation. Inventory tools make no migration changes.

### P257.1 — Canonical job admission track (run in parallel)

- Close missing producer paths so all durable work enters `worker_jobs` + outbox.
- Keep current certified consumers only as adapters to canonical records; remove UI/request-layer dispatch throttling decisions from producer behavior.
- Add end-to-end admission, idempotency, tenant fairness/backpressure, lease/fence, duplicate delivery, retry, cancellation, and settlement receipts.
- **Exit:** each promoted job family has canonical admission and an identified consumer; missing/unavailable executors yield visible queued or typed blocked/retryable state. This work is not a prerequisite for unrelated KV cache work.

### P257.2 — Early KV cache track (start as soon as its own gate passes)

- Select the lowest-risk read-mostly Redis cache family with a canonical-source fallback and useful measurable hit volume.
- Add/verify KV namespace/binding and configuration, then shadow-read/compare without changing response authority.
- Promote that family independently after stale-data, outage, privacy, cost, and fallback capacity gates pass.
- Migrate subsequent cache families by the same manifest. Keep authorization/session/financial/job truth out of stale KV.
- **Exit:** promoted families have measured KV behavior, no Redis path on fault, and a tested switchback that does not restore stale/unsafe state. Do not hold this track for G2 or queue-runtime readiness.

### P257.3 — Early Cloudflare Queue canary (per ready family)

- Provision a nonproduction Queue/consumer/DLQ using existing Feature 186/195 job IDs and Spec 232 envelope/claim contracts.
- Run deterministic duplicate, reorder, timeout-after-accept, poison-message, consumer crash, publisher crash, Queue outage, and reconciliation tests.
- Select the earliest low-risk family with bounded/idempotent effects for shadow then canary. Keep user-visible state in PostgreSQL.
- **Exit:** measured latency/lag/error/cost, retries/DLQ, audit traces and rollback ownership pass; no parallel executor can claim the same generation. Other job families remain independently scheduled.

### P257.4 — Cloudflare credential catalog and flexible bindings (independent track)

- Add dynamic Cloudflare permission catalog refresh with account/user/zone scopes, descriptions, refresh age, and stale state.
- Add credential inventory with write-only encrypted token handling and many-to-many service bindings; allow token reuse and separate-token patterns.
- Map every deployed/planned SmartAIHub Cloudflare consumer to actual credential source and probe. Sync existing Vectorize and R2 settings without duplicated or destructive writes.
- Migrate current fixed profiles and preserve their consumers before removing old fields/shapes.
- **Exit:** Admin can understand configured service coverage, user-declared assignment, verified permissions, missing scopes, deployment-owned secrets, and unimplemented services without exposing secret values. Missing permission for one service blocks only that service's probe or deployment.

### P257.5 — Migrate all remaining job families and Redis roles

- Promote each inventoried job family to Cloudflare Queue transport only after its independent gate.
- Move Redis cache, locks, auth/revocation hints, pub/sub, rate limit, and any other runtime use to its correct approved owner under Spec 232; do not blindly replace distinct semantics with KV.
- Drain/disable old consumers per family and prove no hidden producer can write after promotion.
- **Exit:** every runtime Redis role has a completed mapping and runtime proof; every application job family has a canonical `worker_jobs` admission and approved executor/transport.

### P257.6 — Redis-free release, verification, and handoff

- Run production-shaped synthetic user journeys across Node/Python/media/agent/provider paths and verify canonical receipts through terminal settlement.
- Block Redis access in isolated staging/runtime tests and prove login, cache, jobs, schedules, retries, realtime, provider callbacks, and recovery follow approved paths.
- Audit processes, deployment configs, secrets, systemd/Compose/CI, dependencies and network policy. Remove Redis only when no runtime dependency or rollback obligation remains.
- Rehearse application rollback with Redis still absent; recovery uses PostgreSQL/job/outbox and Cloudflare services, not a Redis resurrection.
- **Exit:** joint Platform/Security/SRE signoff with per-family and per-cache evidence; otherwise state remains `BLOCKED` with exact owner and missing proof.

## 7. State model and operator UX

Every service integration and job/cache family displays one of:

`DISCOVERED -> MAPPED -> CONFIGURED -> PROBED -> SHADOW -> CANARY -> PROMOTED -> RETIRED_LEGACY`

Failure or missing proof is a typed state (`NOT_CONFIGURED`, `PERMISSION_MISSING`, `PROBE_UNAVAILABLE`, `BLOCKED_BY_DEPENDENCY`, `ROLLBACK_REQUIRED`), not a generic green/red system banner. The UI must show:

- service/product and permission scope;
- selected credential label and source (never its value);
- whether assignment is Admin-declared or verified by a live read-only probe;
- active consumer/runtime owner and whether it actually reads this setting;
- queue/cache migration stage, last evidence time, blockers, rollback boundary, and responsible owner;
- links to exact Spec 232/245 work-package evidence and Cloudflare's current permission manual.

One service's unconfigured token MUST NOT produce a banner or gate that blocks independent Admin settings, login, or non-Cloudflare product behavior.

## 8. Data contracts and migration safety

- Before DDL, inspect the live Drizzle schema, migrations, `system_settings` sensitivity/encryption behavior, Feature 195 queue schema, and existing audit service. Reuse or extend canonical records; do not add a parallel job ledger or credential table without documented gaps.
- Any credential/binding schema change follows expand -> backfill -> parity verify -> reader switch -> old-shape retirement. Never overwrite or delete existing Vectorize/R2/runtime settings from an unverified migration.
- Credential migration supports rollback to the previous encrypted source while no job/runtime consumes a conflicting credential. Redacted rollback evidence is required.
- Queue/cache manifests are versioned, environment-scoped, owner-tagged, and safe to re-run. Production destructive cleanup defaults to dry-run and exact resource identities.
- Preserve in-flight job identity and disposition. No forced restoration/requeue of old work without the existing Feature 195 state/recovery contract.

## 9. Security, privacy, and cost requirements

- Admin APIs use exact-admin RBAC and audited, rate-limited mutations. Credential list responses contain labels, IDs, last-updated and configured/probe states only.
- Encrypt token values at rest using the established application secret/envelope strategy; support key rotation and preserve decryption/rollback until the governed retirement window closes.
- Do not store raw Cloudflare token policies or account resources in logs. Scrub all authorization headers and provider error bodies.
- Token reuse is permitted by the Admin but must visibly disclose the combined blast radius and actual selected scope. Recommend narrowly scoped account/zone resources and no unnecessary write groups.
- Staging and preview use isolated Cloudflare account/resources and credentials; no production mutation, paid provider, real tenant mail, or production cleanup from test code.
- Estimate Worker, Queue, DLQ, KV, Hyperdrive, database, R2, and Container costs from measured expected jobs/cache operations. Promotion needs cost per successful job and cost per cache hit, or an explicitly approved exception.

## 10. Acceptance criteria

### Admin / Cloudflare credentials

- [ ] Catalog refresh displays current Cloudflare permission groups with ID, scope, update time, and stale/unavailable fallback.
- [ ] Service/integration catalog includes every active and planned Cloudflare consumer found by source/runtime inventory, with owner and actual credential source.
- [ ] Admin can create multiple credentials, label them, assign one credential to many services, use multiple credentials for one service, and choose a single reused credential if desired.
- [ ] Raw secrets are never returned after save; API responses, browser state, logs, traces, and audit entries pass secret-leak tests.
- [ ] Probes are read-only, scoped to configured accounts/zones, bounded, and distinguish invalid token, missing permissions, absent resources, unavailable APIs, and unverified write permissions.
- [ ] Legacy Vectorize Account ID/token and existing R2 S3 profiles retain parity and their existing consumers continue to use the canonical source throughout migration.
- [ ] Deployment-owned Worker/CI/runtime secrets are clearly represented as external sources and are not falsely shown as active because a similar token exists in the Admin vault.
- [ ] Service readiness is isolated; one missing integration never blocks auth/login or unrelated system use.

### Jobs / Queues

- [ ] Every concrete background job family and durable trigger from inventory has one `worker_jobs` ID, tenant boundary, idempotency contract, owner, and executor/transport disposition.
- [ ] No UI/client producer dispatches or controls queue width; producer request returns a durable async receipt and work is processed in the background.
- [ ] Queue publish failure and duplicate delivery do not lose, duplicate, or settle canonical jobs incorrectly; outbox reconciliation resumes safely.
- [ ] Every promoted family uses Cloudflare Queue only as transport and PostgreSQL for claim/lease/fence/status/settlement.
- [ ] No unapproved Redis/BullMQ/Celery/other application queue is active after its family promotion; final acceptance proves none remain.
- [ ] All Redis-based runtime roles, including non-queue roles, have documented and certified replacements before Redis is fully retired.

### Cache / KV

- [ ] Every migrated cache key family has canonical source, data classification, scope, TTL/stale window, invalidation/deletion contract, and named owner.
- [ ] Eligible high-value cache families have a KV binding, safe fallback, regional consistency proof, privacy/delete proof, outage handling, cost/latency baseline, and rollback evidence.
- [ ] No exact authorization, revocation, job, lease, financial, or transactional decision depends on KV.
- [ ] A promoted family never silently falls back to Redis.

### Release and proof

- [ ] Focused tests cover contracts, APIs, RBAC, encryption, assignments, catalog staleness, endpoint probes, outbox atomicity, concurrency/fencing, duplicate delivery, cache consistency and no-Redis behavior.
- [ ] Build and focused tests pass without running the prohibited workspace-wide TypeScript typecheck.
- [ ] Staging and production evidence are reported separately. Mocks/static source/tests alone cannot certify provider entitlement, Cloudflare service configuration, deployment bindings, production traffic, or Redis retirement.
- [ ] Rollback and incident runbooks operate without reintroducing Redis or a parallel queue manager.

## 11. Required artifacts

1. Cloudflare service/permission mapping manifest and credential-source inventory.
2. Background-work/job-family inventory and Redis-responsibility inventory, linked to Spec 232 evidence.
3. Per-service credential binding matrix (environment, consumer, credential ID/source, required scope, probe, owner, state).
4. Per-cache migration manifest (keys, data class, TTL/staleness, canonical source, fallback, KV binding, evidence).
5. Per-job-family promotion receipt (admission, outbox, transport, consumer, fencing, SLO/cost, rollback and proof).
6. Redacted migration and secret-rotation audit trail.
7. Current operator manual, least-privilege guidance, runbooks, and one-page readiness summary.

## 12. Out of scope

- Creating a new job ledger, queue scheduler, retry authority, billing ledger, auth authority, or generic Cloudflare provisioning engine.
- Automatically creating/editing Cloudflare resources merely by saving a credential or refreshing the permission catalog.
- Requiring all Cloudflare products to be actively integrated before an Admin can use any configured product.
- Moving PostgreSQL, Vectorize, or R2 data ownership again; changing model/provider selection; rewriting historical specs <=213.
- Claiming complete Cloudflare product support from a list of permission groups. Each SmartAIHub consumer needs its own implemented integration and live evidence.

## 13. External gates and unresolved evidence

- Canonical reservation of Spec 257 and ownership of this scope must be verified before implementation or merge.
- Current Cloudflare account plan, token entitlements, account/zone IDs, API catalog behavior, Queues/KV availability, limits, pricing, and required permissions must be verified in the target environment at implementation time.
- Existing fixed credential-center code, live DB settings, deployment secret manager, and service consumers need a fresh source-to-runtime audit before schema migration.
- All job producers/consumers, Redis responsibilities, active service processes, in-flight jobs, data retention, and rollback windows need current inventory; prior/spec-only counts are not proof.
- Cloudflare read probes cannot certify write capability, successful resource provisioning, deployment bindings, Worker execution, or production service behavior.

## 14. Official references

- Cloudflare API token permissions and permission groups: https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- Cloudflare token API / permission-group listing: https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/
- Cloudflare KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Cloudflare Queues delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Related owners: Feature 186 / Feature 195, Spec 232, Spec 242, Spec 245.
