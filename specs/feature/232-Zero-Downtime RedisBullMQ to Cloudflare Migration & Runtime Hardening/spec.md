---
spec_id: 232
title: SmartAIHub Zero-Downtime Redis/BullMQ to Cloudflare Migration & Runtime Hardening
revision: 2.0
status: PROPOSED — implementation-ready contract; production certification pending
created: 2026-09-23
suggested_repository_path: specs/feature/232-zero-downtime-redis-bullmq-cloudflare-migration/spec.md
primary_owners: Platform Infrastructure / Job Control Plane / Security / SRE
implementation_strategy: incremental-expand-migrate-contract
risk_class: high
canonical_dependencies: ["Feature 186", "Feature 187", "Feature 195", "Spec 207", "Spec 213", "Spec 218", "Spec 219", "Spec 220", "Spec 224", "Spec 226", "Spec 228", "Spec 229", "Spec 230", "Spec 231 (LLM Routing; companion, distinct)"]
---

# Spec 232 — SmartAIHub Zero-Downtime Redis/BullMQ → Cloudflare Migration & Runtime Hardening

**Revision:** R2 · **Date:** 23 September 2026 · **Status:** Implementation-ready design subject to live registry uniqueness and verified acceptance gates, **not** evidence of an implemented or production-certified migration.  
**Suggested repository destination:** `specs/feature/232-zero-downtime-redis-bullmq-cloudflare-migration/spec.md`  
**Scope:** replace the six operational Redis/BullMQ responsibilities in independently promotable slices, with uninterrupted service and observable evidence.  
**Out of scope:** migrating Vectorize or pgvector again; creating a new generic job ledger; rewriting completed earlier specs; wholesale migration of all application services on one release date; selecting/changing the managed PostgreSQL provider in this spec.

> **Canonical numbering / collision resolution:** The user assigned **Spec 232** to this Redis/BullMQ migration because **Spec 231 is the independent Unified LLM Routing & Inference Orchestration spec**. These documents have different ownership, paths, acceptance matrices and work-package prefixes. Registry/main-branch and open-PR checks must still verify that 232 is not independently allocated before commit. If a fresh conflict exists, STOP and report; never overwrite either spec. Alias prior `spec-231-zero-downtime-redis-bullmq-cloudflare-migration-r1` to this document by **slug and source digest**; a bare `231` must resolve only to LLM Routing after reconciliation.

---

## 0. Executive decision and non-negotiable outcome

SmartAIHub MUST migrate Redis/BullMQ **one active responsibility and one job family at a time**, begin using completed Cloudflare paths as soon as their individual certification gates pass, and keep remaining **unmigrated** legacy paths serving traffic until their turn. No global cutover is required. A migrated path MUST NOT silently fall back to Redis/BullMQ during an outage. Rollback is an explicit, audited transfer of execution ownership that never produces two active executors for the same job.

Canonical architecture:

```text
Web / Mobile / SDK / External Harness / Scheduler
                      │
              Cloudflare Workers
       API / Auth / Routing / Orchestration
                      │
      ┌───────────────┼────────────────┐
      │               │                │
HYPERDRIVE_FRESH  R2 / Vectorize  DO / KV
      │          (existing services)   │
      ▼                            ephemeral coordination;
 PostgreSQL                         DO persistent state
 users / tenants / ACL / credits / audit
 worker_jobs / worker_job_events / outbox
 leases / idempotency / schedules / effects
      │
 Transactional outbox → publisher / reconciler
      │
 Cloudflare Queues [TRANSPORT ONLY]
      │
 Consumer → PG atomic claim + lease + fencing
      │
      ├─ bounded Worker execution
      ├─ Runner / External Agent / browser-computer use
      └─ Cloudflare Containers / approved runtime adapter
      │
 PG guarded settlement → events + outbox
      │
 DO WebSockets → client realtime; cursor replay from PG
```

**Ownership constraints:**

1. PostgreSQL is the sole system of record for users, sessions/ownership, ACL, metadata, credits, canonical job state and audit. `worker_jobs.id` is the immutable logical job ID; `worker_job_events` is its append-only history. Existing Feature 195 contracts prevail if column names differ from illustrative examples in this spec.
2. Queues, Workflows, Containers, Durable Objects, BullMQ and Runner state are transport, scheduling/execution or coordination mechanisms—not independent business job authorities. Outbox, dispatch metadata, schedules and effect markers are supporting tables, not a second job ledger.
3. Vectorize is the **already-migrated** semantic index, R2 stores original documents/media/artifacts, and neither grants permissions. Retrieval obtains authorized metadata from PostgreSQL and rechecks permission before revealing R2 content or passing text to a model. This spec changes **job dispatch around indexing**, not embedding models, index layout or retrieval architecture owned by Spec 229.
4. `NO DOWNTIME` means no planned interruption from a rollout; actual production promotion still requires measured error/latency budgets, canary gates and rollback readiness. Do not assert zero errors or exactly-once delivery as a Cloudflare feature.
5. Production actions, external paid-provider calls, credential rotation and destructive operations require existing approvals under Specs 207/213/220/224/226. Tests must default to deterministic/fake providers.

### 0.1 Precedence / cross-spec boundary

| Existing authority | Remains owner | Spec 232 adds |
|---|---|---|
| Feature 186 / Feature 195 | `worker_jobs`, events, leases, provider/runner adapter contracts, business retries | Cloudflare deployment/transport migration, route ownership and certification gates |
| Feature 187 / Spec 219 | Execution-plane architecture; deployment and placement | Per-family cutover, release mechanics, zero-Redis retirement evidence |
| Spec 207 | Credits, reservation, settlement and financial ledger | Idempotent calls to existing economic APIs; never a second credits ledger |
| Spec 213 / Spec 224 | Browser/Computer Use certification; development lifecycle/final verification | Preserve their certification gates, permissions and live blockers |
| Spec 220 | Identity, data, capability and security authority | DO/KV revocation enforcement, Hyperdrive consistency classes and migration-specific security tests |
| Spec 226 | Compatibility bridge and Task Control Center | Expose migration ownership, recovery and approvals through existing control surfaces |
| Spec 228 | Issue management / alert routing | Feed incidents, regression findings and owner notifications to the existing issue system |
| Spec 229 | RAG, Retrieval Broker, Cloudflare Vectorize | Queue-backed indexing job transport only; no changes to vector platform |
| Spec 230 | Harness bootstrap / context / methodology | Ensure Codex, Claude and other harnesses consume the same migration contract |
| Spec 231 (LLM Routing) | Provider/model selection, inference failover, inference budgeting | Preserve existing routing interfaces when the API/gateway moves; Spec 232 owns **deployment/transport migration only**, no new inference router |

**Implemented baseline rule:** Treat implemented Specs ≤213 as an existing compatibility boundary. Add adapters, migrations and bridge code; do not rewrite or fork historical specs merely to make this migration easier.

---

## 1. Mandatory inventory before changes (P232.0)

Inventory **all** of the six Redis/BullMQ responsibility groups and all actual entry points; a count of six categories does not establish that only six underlying job families exist. Produce an executable, version-controlled `redis-migration-inventory.yaml` after inspecting the repository, runtime config, scheduled jobs, PostgreSQL schema and service manifests.

| Group | Legacy patterns to locate | Target and authoritative fallback-on-miss |
|---|---|---|
| G1 Cache | Redis GET/SET, memoization, `isRedisAvailable()`, cache bypass flags | KV read-mostly; DO atomic state; PostgreSQL/R2 canonical read on cache miss |
| G2 Auth / revocation | session blacklist, token revocation, login attempt counters, impersonation, role/tenant change propagation | Workers Auth, PostgreSQL fresh authority, per-session/per-user DO coordination, KV only non-authoritative TTL hints |
| G3 Rate limiting | Redis counter, sliding window, token bucket, quota middleware | Workers Rate Limiting for approximate local protections; DO exact global admission; PostgreSQL for credits/economic limits |
| G4 Distributed locks | Redis semaphore, mutex, process lock, lease fallback | DO for serialization; PG guarded resource mutation; job leases/fencing only through `worker_jobs` |
| G5 Pub/sub / realtime | Redis pub/sub, socket rooms, invalidation topics, progress streams | DO WebSocket Hibernation; durable PG events + outbox + Queues; replay cursor |
| G6 BullMQ / background jobs | Queue, Worker, QueueScheduler, QueueEvents, repeat/delay jobs, cron producers | canonical `worker_jobs` + outbox → Queues; PG-owned retries/leases; bounded Workers or Runner/Containers |

Additionally audit Celery, Celery Beat and any Python `redis` client, cached Redis connections, Node/Python startup probes, `smartspec-node-worker.service`, systemd units, Docker/Compose, GitHub Actions, deployment environment variables, IaC, sidecars, monitoring exporters and undocumented direct Redis TCP calls. If a currently active Celery broker still uses Redis, migrate it or change it to an approved non-Redis path before declaring complete Redis independence. Unused Cloud Tasks/Dramatiq paths are **audit-only**, not new implementation scope without runtime evidence.

For each caller record: `{owner_team, repo, file, symbol, entrypoint, route, tenant_scope, environment, datastore_keys, read_write_semantics, consistency_class, latency_budget, job_family, scheduler, external_effect, producer, consumer, current_retry, current_lock, monitoring, test_refs, target, migration_status}`. Explicitly classify **unknown** rather than guessing.

Inventory deliverables:

- [ ] Code-backed import/call graph, dynamic import search, scheduled-task list and runtime trace sample for every group.
- [ ] Job family matrix (all concrete families discovered, not an assumed count), including media/LLM/embedding, mail/notifications, maintenance, approvals, development agents, browser/Computer Use, and any other actual families found.
- [ ] PostgreSQL schema and migration compatibility report; enumerate existing outbox, lease, lock, idempotency and settlement tables to **reuse** before authoring any DDL.
- [ ] Tenant-wise volume, current p50/p95/p99 latency, error rate, concurrent jobs, redis memory/CPU, queue lag, retry rate, credits reversals, provider spend and recovery drill baseline.
- [ ] Environment matrix: local Debian, Windows Runner, staging Workers, production Workers, tenant Worker variants and any Cloudflare Container availability/account restrictions.
- [ ] Legacy exit map for old processes/units and **redacted** inventory of credentials; never dump environment variables or secrets as evidence.

### 1.1 Inventory-assisted static scan (illustrative; adapt to monorepo)

```bash
rg -n -i 'bullmq|ioredis|redis|isRedisAvailable|QueueScheduler|QueueEvents|celery|celery beat|pubsub|subscribe\(' \
  --glob '!**/node_modules/**' --glob '!**/dist/**' .
rg -n -i 'REDIS_|BULLMQ_|redis://|smartspec-node-worker|celery' \
  --glob '*.{ts,tsx,js,py,json,yml,yaml,toml,service,env.example}' .
```

A hit is **not automatically a prohibited runtime dependency**: mark tests, migration scripts, documentation and intentionally unmigrated callers separately in a machine-readable allowlist with expiry, owner and linked cutover gate. Include indirect dependencies and runtime smoke with Redis network traffic blocked in the final gate.

---

## 2. Canonical persistence and compatibility contracts (P232.1)

### 2.1 Hyperdrive: consistency classes

Provision **two logically distinct bindings** to the same managed PostgreSQL, subject to environment/account constraints:

- `HYPERDRIVE_FRESH`: **query caching disabled** for all auth/ACL/ownership/credits, `worker_jobs`, job events needed for correctness, outbox claims, leases/fencing, idempotency, scheduling decisions, revocation, billing settlement and resource mutation.
- `HYPERDRIVE_CACHED`: explicitly allowlist public/read-mostly catalog and non-security metadata where bounded staleness is acceptable. Do not reuse shared repository connection pools or ORM clients that obscure which binding a critical query uses.
- Cache miss or unavailable KV must read the existing PostgreSQL/R2 authority through a permitted fresh path; lack of DO for security-critical verification must **not** downgrade to stale KV/Hyperdrive cached reads.
- Every query and ORM repository must be tagged as `STRICT_FRESH`, `BOUNDED_STALE`, or `CANONICAL_OBJECT`; CI/lint and integration tests prohibit critical repositories binding to CACHED. Transaction paths MUST remain single-transaction PostgreSQL operations.
- Hyperdrive pools in **transaction** mode. No PostgreSQL advisory locks, session `LISTEN/NOTIFY`, SQL-level prepared statements or unsupported session state through Hyperdrive. Replace with row locks/`FOR UPDATE SKIP LOCKED`, outbox and DO as appropriate; use a separately governed direct connection **only** if a documented unmigrated requirement demands it.
- Monitor pool saturation, DB connection ceilings, failover/DNS/TLS, origin transaction latency, stale query budget and database geography. Add pooled vs non-pooled benchmarking before promotion.

**Platform evidence (checked 2026-09-23):** Hyperdrive enables eligible SELECT query caching by default (`max_age=60s`, `stale_while_revalidate=15s`), does not invalidate cache on writes, and has a documented `--caching-disabled` option. Read-after-write correctness therefore requires FRESH. See References §20.

### 2.2 Canonical job state machine

Reuse actual Feature 195 states/aliases after inspecting the repository; the following is a **semantic mapping**, not a replacement schema:

```text
CREATED / WAITING_DISPATCH
       ↓
QUEUED (PG logical state; queue delivery not authoritative)
       ↓
CLAIMED / RUNNING ──→ WAITING_EXTERNAL / WAITING_APPROVAL
       │                        │
       │          wake / poll / callback → RUNNING
       ▼
SUCCEEDED | FAILED_TERMINAL | CANCELLED
       ↑
RETRY_SCHEDULED ← retryable failure/expired lease after reconciliation
```

All transitions require tenant scope, allowed-from-state, attempt/generation check, job-row or lease lock, appropriate fence, and append-only event in the **same PostgreSQL transaction**. After terminal state, a late callback can add an observed/audited event if the existing schema permits, but cannot rewrite settlement or resurrect an old attempt.

### 2.3 Storage contract; illustrative additive schema only

Do **not** create or run the following as a blind migration. First map existing `worker_jobs`, `worker_job_events`, outbox and settlement tables and write **expand → backfill → verify → contract** migrations. Add missing fields to the existing system or auxiliary per-purpose tables only.

| Logical field | Authority and purpose |
|---|---|
| `worker_jobs.id`, `tenant_id`, `job_family`, `state` | immutable identity, isolation, canonical current state |
| `attempt`, `lease_owner`, `lease_until`, `fencing_token` | PG-owned exclusive execution; epoch increments on every successful re-claim |
| `route_generation`, `migration_mode` / linked ownership manifest | explicit route epoch for cutover/fencing; never inferred from queue |
| `next_run_at`, `schedule_id` when needed | durable retry/delay and schedule provenance |
| `idempotency_key`, external effect references | deduplicate job creation and side effects with scoped unique constraints |
| `worker_job_events(job_id, seq, transition, ...)` | ordered immutable history including recovery, ownership transfer and approvals |
| existing outbox `(event_id, job_id, attempt, generation, dispatch_seq, state, next_publish_at)` | transactional dispatch journal; not a second job truth |
| existing effect/settlement guard or additive `worker_job_effects` if truly absent | unique job+attempt+effect type+provider idempotency key; no duplicate media/credits/email effect |
| schedule definitions, existing table if available | recurrence specification/timezone/last fire; generated occurrences still materialize as `worker_jobs` |
| `migration_ownership(job_family, generation, active_backend, mode, ...)` | **new control metadata**, not a job ledger; unique active generation per family/tenant partition |
| `migration_audit` or existing audit | append-only human/automation cutover and rollback trail |

Required DB constraints: tenant-scoped idempotency uniqueness; event sequencing/optimistic CAS; current-lease owner+epoch guarding; one active route generation per partition; unique scheduled occurrence `(schedule_id, scheduled_for)` at job creation; unique economic-effect idempotency in Spec 207; outbox deduplication by `(job_id, attempt, generation, dispatch_seq, event_kind)`. Use DB-generated monotonic epochs for resource locks when needed. Add indexes for bounded sweeps, not unbounded full-table scans. **Check idempotency-key collisions with unequal canonical request digests (return a conflict, never the prior job as if parameters matched).**

### 2.4 Transactional outbox: exact failure semantics

1. Producer authenticates and authorizes; in **one** PostgreSQL transaction it inserts/returns the canonical idempotent `worker_jobs` row, the event and a `PENDING` outbox entry. No queue publish occurs inside the open transaction.
2. Dispatcher claims a bounded batch with `FOR UPDATE SKIP LOCKED` and a **time-bounded dispatcher lease**; it sends compact Cloudflare Queue envelopes. If publish succeeds but DB acknowledgement fails, the next dispatcher may publish again: duplicate transport delivery is expected and safe.
3. After broker acknowledgement, mark outbox as sent by compare-and-set **against the current dispatcher lease token and dispatch identity**; an expired publisher may not overwrite a newer publisher result. If publish response is uncertain, re-publish safely after bounded exponential backoff + jitter using the same immutable logical dispatch identity; persist publish attempts separately from business execution attempts.
4. Reconciler finds stale `PENDING`, expired publishing leases, and `SENT` entries with no durable claim within the job-family threshold. Confirm logical job state, current generation and provider status **before** creating a new dispatch sequence. `SENT` does not prove a consumer ran.
5. Queue envelope must fit Cloudflare limits and contain **references only**:

```json
{
  "schema_version": 1,
  "event_id": "uuid",
  "job_id": "uuid",
  "tenant_id": "uuid",
  "job_family": "media.thumbnail",
  "route_generation": 7,
  "attempt_hint": 2,
  "dispatch_seq": 4,
  "issued_at": "2026-09-23T02:00:00Z",
  "trace_id": "trace-ref"
}
```

Queue payload is an **untrusted routing hint**. Consumer refetches tenant, permissions, job family, active route, attempt and lease from fresh PostgreSQL. **Validate envelope shape, version, issued-at bounds, allowed family, and origin binding; reject forged tenant or cross-environment routing even if a queue is misconfigured.** Never place document bodies, provider secrets, full prompts, tokens or large media in queue messages; use R2/PG pointers. Never infer job success or failure solely from delivery attempts.

### 2.5 Job claim, handoff, terminal settlement

```text
consume(envelope):
  if unsupported schema: quarantine + audit + fail-safe retry/DLQ policy
  fresh PG fetch; validate tenant, job ID, family, generation, permissions
  if already terminal / already completed dispatch: ACK stale duplicate
  if old generation or active lease held elsewhere: ACK/no-op or bounded retry by policy
  atomic PG claim + increment fence + event
  if short safe execution: execute, guard all writes with fence, settle in PG, ACK
  if long external execution: durably record Runner/Container handoff + checkpoint in PG;
                              ACK after handoff is durable, not after work completes
  on transient PG outage BEFORE durable handoff: RETRY transport; do not ACK success
  on unknown external side effect: mark NEEDS_RECONCILIATION; NEVER blind retry
```

For terminal settlement: revalidate lease owner, fencing epoch, route generation and current state; verify artifacts/effects; use the existing Spec 207 credit reservation/settlement API with unique effect identifiers; append terminal event and post-terminal outbox in the permitted transaction model. External side effects cannot join a PostgreSQL transaction: record intent, pass provider idempotency keys when supported, reconcile provider state before replay, and require approval for uncertain non-idempotent effects.

For R2 artifacts use immutable per-attempt staged object keys; promote the canonical artifact pointer only after fresh-PG fencing validation. Garbage collection of superseded staged blobs must be delayed, audited and retention-aware.

---

## 3. Migration routing and zero-downtime ownership (P232.2)

### 3.1 States by **job family / optional tenant partition**

| State | Producer route | Executor allowed | Interpretation |
|---|---|---|---|
| `LEGACY_ACTIVE` | Existing BullMQ/Redis | legacy only | Normal state for work **not yet migrated** |
| `SHADOW_VALIDATE` | Existing legacy production route | legacy only; new consumer on synthetic/no-op clones only | Compare decisions and metrics; no duplicate provider calls, payments or emails |
| `CANARY_CF` | Deterministically sampled eligible traffic to CF; remaining to legacy | per-job durable route assignment | Bounded real traffic; route epoch bound to each job |
| `CF_ACTIVE` | Cloudflare Queue exclusively | CF logical owners; external Runner still allowed | Migrated slice; **no runtime Redis fallback** |
| `DRAIN_LEGACY` | No new legacy jobs for family/partition | finish/reconcile preexisting legacy jobs | Existing in-flight, delayed and repeat occurrences explicitly accounted for |
| `RETIRED` | CF only | legacy prohibited | Disable legacy producer/worker and later delete code after observations |
| `PAUSED` | No new execution of affected family; existing owned jobs handled by policy | recovery only | Incident response; fail-closed for privileged/financial workflows |

**Do not equate route selection with executor placement.** A CF-owned logical job may still be executed by a local Rust Runner, Python worker or external harness via the canonical Runner Protocol. What must stop is the Redis/BullMQ transport and its authority on migrated paths—not necessary local execution itself.

### 3.2 Promotion protocol

1. Freeze an inventory snapshot and list every active legacy job, delayed/repeat task and old provider callback for the chosen family.
2. Install/tests of fresh PG ownership generation. Run deterministic shadow verification; shadow workers **must not** perform external effects.
3. Set canary routing on a stable keyed sample (job ID/tenant class), storing chosen route+generation on **job creation** before dispatch. Do not dynamically flip a running job because a feature flag changed.
4. Require isolated canary queues/consumer budget when contention could damage other families. Compare error rate, lag, double effects, spend and customer-visible failures against baseline.
5. Promote eligible new jobs to `CF_ACTIVE` using an audited atomic generation transition. Keep legacy workers for **previously assigned** in-flight jobs only; drain and reconcile outstanding delayed/repeat tasks using occurrence keys before decommission.
6. Mark `RETIRED` only when live DB reconciliation shows no active legacy job, no legacy pending schedule occurrence, no orphan callbacks and no unaccounted external side effects. Do not rely solely on BullMQ queue length.
7. Back out only via a **new** ownership generation and planned transfer: stop new CF intake, reconcile/finish or fence CF in-flight jobs, prove effect safety, then explicitly promote a pre-certified backend for *new* jobs. Never silently fallback on any error.

Canary sampling, human approvals and ownership changes MUST be displayed in the Task Control Center and written to audit with actor, reason, work package, migration revision, prior/new epoch and correlated trace.

### 3.3 Dual-running and failure cases

- **Transport duplication:** multiple Queue deliveries → single claim by PG CAS, then ACK duplicate; never multiple provider calls for the same attempt.
- **Old owner resumes:** previous Redis worker or offline Runner reconnects → old epoch cannot settle in PG. It may report an observation; a forced new provider call requires provider-status reconciliation.
- **Dual producer bug:** unique `job_id`/idempotency and route-generation checks stop duplicate business jobs; surface an incident instead of hiding it.
- **Uncommitted cutover:** uncommitted route decisions cannot publish; commit ownership and job row atomically where possible.
- **Stuck `DRAIN_LEGACY`:** preserve legacy execution until each observed in-flight/recurring item is reconciled, or explicitly park with owner approval. Do not delete on a timeout.

---

## 4. G1 — Cache migration: Redis → KV / DO

- Inventory every cache key schema, TTL, invalidation trigger, write rate, memory footprint, cache stampede behavior, tenant scope and exposure classification.
- Use **KV only for eventually consistent, read-mostly** catalog/configuration and safely bounded stale content. Use versioned keys incorporating tenant, owner/scope where appropriate, schema and content epoch; use short-lived negative-cache entries only for non-auth queries.
- Use **Durable Objects** for per-key atomic read/modify/write coordination, resource serialization and high-write cache-like state; persist correctness-critical DO data in DO storage, not in-memory alone. DO storage is **not** permitted to become a second business source of truth.
- Hot-key single-flight, jittered TTL, circuit breakers and bounded TTL protect PostgreSQL/R2 from cache miss amplification; do not return stale privilege or financial state.
- Phase gate: mirrored reads and key-level parity tests → low-risk canary → CF-only per keyspace → remove Redis caller only after production trace coverage. A Redis cache outage affecting **unmigrated** paths is handled by their existing policy; a **migrated** path must never consult Redis.

## 5. G2 — Auth and revocation: PostgreSQL + DO, KV non-authoritative

**Consistency class:** `STRICT_FRESH` for permission-changing, session-revocation and privileged operations. Stable hashed session/token identifiers only; no plaintext secrets in DO names, KV, logs or Queue payloads.

- Use deterministic per-session and per-user DO IDs to coordinate immediate revocation checks across Workers regions. User-wide revocation/version increments must invalidate earlier session generations; tenant-wide emergency revocation checks must remain accurate even across multiple DO shards.
- A safe revoke handshake is: (a) send `PREPARE_BLOCK` to governing DO and durably block acceptance, (b) commit canonical revocation version and audit in fresh PostgreSQL, (c) finalize/reconcile DO state; reply *success* only when required policy checks confirm enforcement. On partial failure leave a fail-closed block/pending state and alert; ensure expiry/recovery cannot accidentally re-allow the token.
- On DO outage, privileged/high-risk endpoints fail closed. Other endpoints may use a **pre-approved fresh PostgreSQL enforcement path** if it preserves the exact revocation contract. KV and Hyperdrive Cached can serve UX hints only, never authorization.
- On startup/DO hibernation/redeploy, restore durable DO revocation watermark; **before a user- or tenant-wide revoke returns success, ensure every independent authorization shard is blocked or force protected reads through a fresh PostgreSQL version gate that applies globally**; use version-bound verification with fresh PostgreSQL when local state may be incomplete. Protected role/ACL changes must force fresh authorization even when the presented JWT has older role claims.
- Shadow comparisons use non-sensitive metadata. Canary negative tests cover token revoked in region A and checked in region B, offline Runner reconnect, permission demotion, concurrent refresh token rotation and tenant suspension.

**Security caveat:** No distributed atomic transaction exists across PostgreSQL and a DO. The prepare/block/commit/reconcile protocol is mandatory; do not claim a single PG+DO atomic commit.

## 6. G3 — Rate limits and capacity

| Control | Backing | Reason |
|---|---|---|
| Coarse abuse throttles, per-location HTTP bursts | Workers Rate Limiting API | Low-latency, approximate, per-location; **not** authoritative global financial quota |
| Exact tenant/user/API-key global admission | DO partitioned by the actual aggregation key | Serialized token bucket/fixed or sliding window with durable DO state as policy demands |
| Credit balance, consumption and economic eligibility | Existing Spec 207 PostgreSQL financial authority | Atomic reservations and settlement, not DO counters or Redis |
| Provider account slots / concurrent external execution | Existing capacity/Runner control plane with PG leases/fencing; DO optional gate | Global correctness and crash recovery |
| Rate-limit policy | PostgreSQL canonical; KV for bounded-stale published snapshots only | Controlled revisions, approval/audit |

Define policy on unknown, DO unavailable, clock drift, retries, timeout, variable request costs and tenant-wide hot keys. Use `429` with safe `Retry-After` where suitable; reserve budget only once under scoped request idempotency. Global DO hotspots need measured sharding or PG reservation strategies; sharding must not accidentally weaken a required global limit.

## 7. G4 — Distributed locks and leases

- Job lease/reclaim/fence lives **only** in Feature 195 `worker_jobs` and its approved lease tables. Queue visibility timeout and DO liveness are not job ownership.
- Resource serialization: partition DO by stable `(tenant_id, resource_type, resource_id)`; obtain a durable/DB-issued monotonic fencing epoch where writes touch PostgreSQL or an external system. For PG mutations enforce epoch/ownership in the target transaction; do not trust a DO lock without a target-side fence.
- Metadata mutation uses PG row locks, scoped unique constraints and transaction isolation; avoid Hyperdrive-incompatible advisory locks. For multi-resource operations use deterministic acquisition order and a bounded saga/compensation where no single atomic transaction is possible.
- Recovering a crashed lock holder cannot blindly replay non-idempotent external effects. Conformance tests cover lock expiry during slow writes, DO restarts, double acquire, clock skew and resource cross-tenant key collision.

## 8. G5 — Pub/sub and realtime

- Durable business changes: commit the PG state **and append-only event and outbox together**; dispatcher publishes Queue notifications. Ephemeral presence/typing/connection routing may remain in DO.
- DO WebSocket Hibernation supports live progress and notifications. Rehydrate connection metadata via `serializeAttachment`/`deserializeAttachment`; never rely on in-memory history surviving hibernation.
- Client protocol includes `{stream_id, tenant_id, last_event_seq}`; on connect/reconnect, authenticate via fresh policy, **register live subscription first and record a canonical PG high-watermark; replay from cursor through that watermark, buffer overlapping live messages and de-duplicate at handoff**, with gap detection and monotonic sequencing. Handle reconnect after a terminal job event and during Worker deployment.
- Queue delivery can be out-of-order or duplicated; clients de-duplicate by event ID/sequence and request canonical job snapshot on a detected gap. Push notification must not grant access to event payloads across tenants.
- Rate-limit fan-out and bound PG replay; large event bodies/artifacts stay in R2. Integration with Spec 228 issues/alerts is an outbox subscriber, not a second source of state.

## 9. G6 — BullMQ/background execution and scheduling

### 9.1 Job family classification

Classify **actual** producers into: short bounded compute, provider-initiating asynchronous work, long-running CPU/media processing, browser/Computer Use, agent/development orchestration, indexing/reindexing, mail/notifications, maintenance and recurring schedules. Add/merge classes only after code inventory; these labels are not proof they all exist.

- Cloudflare Queue Worker consumer **must not** run a long browser session/media render directly; its documented max wall-clock invocation is **15 minutes**. For long work, record a durable handoff and ACK transport; execute in a registered Rust/Windows/Debian Runner, approved Cloudflare Container or other existing backend.
- Cloudflare Workflows may express bounded waits/retries/orchestration, but any Workflow instance is a **projection/executor** of the PG canonical job; its own state, retries and IDs may not independently determine finality. For implementation simplicity, prefer PG schedules + reconciler for simple delays; add Workflow adapters only when proven useful and permitted by existing Specs 195/215/224.
- Queue delivery is **at least once** and default transport retries can end with message deletion if no DLQ is configured. Mandatory explicit DLQ, alert and PG reconciliation; DLQ is a forensic delivery surface, not the job failure truth. **An unconsumed DLQ message expires after four days under current Cloudflare documentation; persist compact redacted DLQ evidence immediately in existing audit/incident storage, reconcile from PG, and alert well before expiry.**
- Outbox, claim and settlement policies are shared by all job families. Provider 429, callback lost, webhook duplicate, billing response unknown, manual approval wait and disconnected Runner have explicit distinct recovery state—do not funnel all into queue retry.
- Queue payload limit: **128 KB**; batch up to **100**; per-message delay up to **24h**; retention configurable up to **14 days** on eligible plan. Anything longer uses durable PG `next_run_at` and scheduled sweeper rather than assuming queue delay/retention is permanent. Validate actual account quotas at deployment time.

### 9.2 Durable schedules; Celery Beat boundary

- Canonical schedule definitions: tenant, owner, revision, timezone, IANA TZ, cron/interval, DST disambiguation, start/end, pause status, catch-up policy (`SKIP`, `ONE`, `BOUNDED`), idempotent occurrence key and audit revision. Reuse existing scheduling tables/services; do not fork scheduler authority.
- A Cloudflare Cron/approved scheduler periodically scans a **bounded PG due window** under transactional claim. Each due occurrence atomically creates/returns exactly one canonical `worker_jobs` row plus outbox, using `(schedule_id, scheduled_for)` uniqueness. Cron trigger fires are **hints**, not durable occurrence truth.
- Separate business retry from recurring occurrence: a failed occurrence retries under its original occurrence key; it must not create tomorrow's or yesterday's run twice.
- During cutover, freeze old Celery Beat/BullMQ repeat producer **for the selected schedule**, reconcile its future delayed/repeat definitions against PG, then atomically promote scheduler ownership. Explicitly certify DST gap/overlap, scheduler outage for 48h, missed run policy and deploy rollback. **Cloudflare Cron fires in UTC and trigger edits may require up to 15 minutes to propagate; it is a wake-up hint, never an occurrence-creation authority.**

### 9.3 Indexing/Vectorize unchanged

```
Fresh PostgreSQL ownership/metadata → R2 document/content
    → canonical indexing worker_jobs + outbox → Cloudflare Queue
    → approved embedder + Vectorize upsert (existing Spec 229 contract)
    → fresh PG indexed_at/index_version/content_hash status update
```

Before retrieval: validate tenant and user at request time; Vectorize tenant namespace/metadata filter is a retrieval scoping aid, **not** authorization. Post-filter every candidate against fresh PG ACL **before** fetching/decrypting restricted content, reranking or sending text to the LLM. Keep existing embedding dimensions/model/index version; no pgvector re-migration in this project.

---

## 10. Operator UI and audit surfaces (P232.3)

Implement the migration interface as an **additive panel within the existing Admin Task Control Center**, not a standalone parallel admin console. Reuse existing auth/approval/audit and Spec 228 alert delivery.

| UI surface | Required content/actions | Permission |
|---|---|---|
| Migration Overview | Six group readiness, each family state, current route epoch, completion/evidence, downtime/error SLO, last decision | admin/operator read; tenant view only own slice if enabled |
| Family Inspector | producers, legacy vs target routes, queue/outbox/lease counts, canary percentage, retries, backlog, blockers | scoped operator |
| Cutover Wizard | freeze inventory → shadow parity → safety validation → canary → promote → drain → retire; diff of route changes; approval record | privileged migration operator + second approver on high-risk paths |
| Job Trace | canonical job, `worker_job_events`, outbox dispatch attempts, transport observations, Runner/Container callbacks, effects and settlement IDs | existing job read ACL; redact sensitive payload |
| Outbox / DLQ / Reconciler | stuck events, last verified claim, retry reason, DLQ evidence, safe replay and quarantine | migration operator; audited manual recovery |
| Auth & Consistency | FRESH/CACHED binding mapping, revocation propagation tests, DO health, denied operations; no token display | security admin |
| Realtime Diagnostics | active DO/WebSocket groups, replay gaps, reconnect health, tenant-scoped observability | SRE/admin |
| Retirement Checklist | source scan manifest, zero-runtime Redis traffic, old systemd/cron disabled, rollback archive and credentials removal | release owner + security approval |

**UI semantics:** “Delivered”, “Claimed”, “Running”, “Provider succeeded”, “Settled” and “Verified” are distinct labels. Never display a green success status based only on Queue ACK or a healthy Worker. Every destructive/manual action requires preview, scoped reason, idempotency check, RBAC and immutable audit. For operator-wide cutovers and security/credits jobs require two-person approval if existing policy so requires. Errors and blocked gates surface through Spec 228 alerting.

### 10.1 Minimum control API contracts (versioned, audited)

```text
GET    /admin/migration/redis/overview
GET    /admin/migration/redis/families/:family
GET    /admin/migration/redis/families/:family/evidence
POST   /admin/migration/redis/families/:family/canary-proposal
POST   /admin/migration/redis/families/:family/promote
POST   /admin/migration/redis/families/:family/pause
POST   /admin/migration/redis/families/:family/rollback-proposal
POST   /admin/migration/redis/jobs/:id/reconcile
GET    /admin/migration/redis/outbox?state=...
GET    /admin/migration/redis/dlq?family=...
GET    /admin/migration/redis/audit
```

All mutations require `{expected_route_generation, request_idempotency_key, change_ticket, justification, evidence_refs}`; enforced by existing CSRF/auth/tenant policy, rate limiting and approvals. These endpoint paths are illustrative and must be aligned with actual installed Task Control Center route conventions before implementation.

---

## 11. Observability, SLO and operational budget (P232.4)

A Cloudflare dashboard screenshot or mocked consumer test is **not** production certification. Provide linked, redacted traces from **producer → canonical job/outbox → transport → claimed executor → terminal settlement → UI notification**.

| Signal | Metric / join key | Required action |
|---|---|---|
| Job correctness | canonical job ID, tenant, family, attempt, lease/fence, route generation, effect id | alert on any potential duplicate external side effect or cross-tenant event |
| Queue and outbox | `pending_age`, `publish_unknown`, `publish_failures`, delivery lag, claim age | bounded reconciler sweep; no blind producer retry |
| Lease/Runner | heartbeat age, expired leases, stale callback rejections, provider-status unknown | distinguish offline/disconnected from failed; safe recovery |
| Business outcome | per-family terminal error, p50/p95/p99 latency, consumer retry rate, SLA breaches | canary stop/pause policy |
| Security | revocation p95/p99 propagation, stale ACL deny count, DO mismatch, cached-critical-query attempt | fail closed + security incident |
| Financial | double-settlement detection, reservations stuck, unknown provider charges, spend by family | economic guard + owner review |
| Infrastructure | Hyperdrive fresh/cached pool, PG connections/CPU/locks, DO requests/duration/storage, KV read/write, Queue/Workflow/Container usage, R2 ops | threshold/cost alerts |
| Retirement | denied outbound Redis attempts; legacy process starts; raw Redis network connections; expected allowlist expiry | block deployment if unexplained hit |

SLO numbers MUST be baselined during P232.0 and ratified per family (illustrative defaults only: no missing canonical jobs, **zero proven duplicate financial settlements**, no authorization bypass, p95 dispatch and customer-visible error rate no worse than approved baseline during canary). A hard invariant violation stops promotion regardless of average p95 improvement. Capture account-specific Cloudflare pricing/quotas and PG provider costs in a forecast before each phase.

Redaction: log hashed identifiers/pointers; never log provider tokens, full session IDs, raw credentials, private document text or unredacted `.env` output. Retain supportable evidence hashes and versioned canary manifests.

---

## 12. Security and tenant isolation (P232.5)

1. **Fail-closed:** no Redis/BullMQ fallback on any **promoted** path. PG/DO security uncertainty blocks sensitive mutations rather than bypassing revocation or ACL.
2. **Tenant isolation:** PG RLS where already in use, explicit tenant-bound predicates and typed repository APIs; DO ID and queue envelopes carry scope but caller-provided tenant claims never bypass authenticated PG scope. R2 keys and Vectorize namespaces never act as sole permission checks.
3. **Runtime identities:** Workers ↔ Queue ↔ Runner/Container callbacks use existing mutual authorization, scoped capability, nonce/replay windows and session fencing under Specs 213/220/226. External webhooks validate source/authenticity **before** reading/updating job state.
4. **Secret migration:** use Cloudflare secrets and approved rotation workflow; do not copy Redis credentials into deployed new Workers as a fallback. Redact all owner-rotation evidence; never ship secrets in git, traces, migration manifests, Queue payloads or generated reports.
5. **Code/security gates:** SBOM and dependency scan, least-privilege Cloudflare API tokens, IaC review, staging/prod environment separation, WAF/abuse rules, supply-chain verification and secret-rotation approval.
6. **Incident behavior:** on suspected containment/credential leak, stop live certification and continue deterministic non-production work only until owner remediation evidence exists. Do not inherit a previously blocked live Runner or browser certification as a PASS.

---

## 13. Execution phases and independent delivery milestones

Each phase produces committed code/tests + a separately versioned evidence bundle; release commits may be smaller than phases. Parallelize inventory/read-only development where safe, **not** production ownership mutations.

### P232.0 — Baseline / inventory / collision audit (no provider calls)

- Discover live repo spec registry and exact current implementations of Feature 195/186/187 and Specs 207/213/219/220/224/226/228/229/230; no legacy-file rewrite.
- Enumerate six Redis categories, all concrete job families, all Python Redis/Celery dependencies, current service units and caches.
- Measure baseline; list DB schema reuse/expand deltas, platform account limits, runbook owners and production permission blockers.
- **Exit:** 100% observed/known caller assignment, all unknowns explicitly triaged, no live traffic changed.

### P232.1 — Canonical contract and fresh data access (safe while legacy runs)

- Add FRESH/CACHED Hyperdrive policy and static/runtime consistency tests.
- Reconcile existing `worker_jobs`/events/outbox/lease/fencing/settlement; additive expansion/backfill only.
- Implement shared `MigrationOwnershipResolver`, `QueueEnvelopeV1`, `OutboxDispatcher`, idempotent claim and reconciler **against deterministic adapters**.
- **Exit:** proof of atomic producer/outbox, duplicate delivery safety, uncertain publish recovery, stale fencing rejection and no new job ledger; legacy paths still handle real production traffic.

### P232.2 — Staging infrastructure and synthetic live Cloudflare transport

- Provision approved scoped Queues/DLQ, DO classes, KV namespaces, Hyperdrive bindings, Worker consumers, telemetry and non-production R2.
- Verify connectivity, account quotas, 15-minute consumer limit behavior, delayed scheduling and DLQ; fake provider workloads only.
- **Exit:** production-like synthetic path traces through real Cloudflare transport with deterministic success/fault injection; **not** a certification of paid providers or production traffic.

### P232.3 — G1 cache and initial low-risk G6 job family canary

- Start with non-auth read-mostly cache; cut over per keyspace and measure DB-load regression.
- Choose one truly low-risk job family **after inventory**, shadow deterministic decisions without external effects, canary target transport, observe and retire its legacy producer/consumer only.
- **Exit:** independently promoted group/keyspace and family, automatic block on any hard invariant violation, demonstrated per-family ownership transfer and pre-tested explicit rollback.

### P232.4 — G3, G4, G5 coordination and remaining G6 families

- Migrate rate limiting by policy class, resource locks with target-side fences, DO realtime+PG cursor replay.
- Migrate each job family separately: notifications/indexing, media, external-provider, long-running Runner/Browser, agent/development and any inventory-specific families; do not assume order if dependencies disagree.
- Move delayed/repeat schedules and Celery Beat only after occurrence deduplication/drain tests.
- **Exit:** per-family certified live evidence, all preexisting work accounted for, DLQ/recovery and Runner-offline reconnection proved under allowed contexts.

### P232.5 — G2 privileged Auth/revocation and economic-critical workloads

- Introduce DO blocking/revoke handshake, FRESH ACL/session enforcement, cross-region stale-read tests and fail-closed paths.
- Promote credits/economic-sensitive job families only after Spec 207 effect/settlement guards and multi-failure drills pass.
- **Exit:** independent security sign-off, no stale-permission access after required enforcement acknowledgement, zero proven duplicate settlement in destructive/concurrent tests.

### P232.6 — Zero-Redis retirement and full cutover

- Verify all job families and six groups are `RETIRED` or document approved non-production exceptions only; production has **zero** active Redis/BullMQ dependency.
- Drain/quarantine remaining legacy in-flight or recurring jobs, revoke/delete Redis secrets after approval, remove BullMQ/ioredis/Python Redis dependencies **when no longer used**, queue initializers, fallback flags, service units, stale environment vars and sidecars; prevent reintroduction with CI.
- Perform network-deny runtime exercise and production canary smoke; archive rollback/capacity runbooks and retired source/evidence under permitted retention policy.
- **Exit:** system starts and serves real authorized traffic with Redis endpoint **unreachable**, audited runtime and source dependency scan PASS, no unaccounted legacy job.

### P232.7 — Final verification and handoff

- Independent verifier reproduces the acceptance matrix in §16; every family records real production (or explicitly blocked) certification separately.
- SRE receives dashboard/alerts, reconciliation on-call playbooks, DR drill reports, cost forecast vs actual and explicit runbook to pause/recover **without Redis fallback**.
- **Exit:** `FINAL_VERIFY=PASS` only after evidence exists for every required gate and open blocker count is zero. Otherwise report `BLOCKED/PARTIAL` with precise next deterministic slice; never infer PASS from code merge.

---

## 14. Canary and rollback runbook

**Before a canary:** attach approved immutable build SHA, DDL migration version, binding IDs (non-secret), route-generation snapshot, inventory version, queue-family baseline, safe capacity, traffic cohort, owner/approver and rollback artifact. Ensure no unresolved credential-containment issue blocks the target environment.

**Canary progression (example, not mandated percentages):** synthetic → internal tenant → 1% → 5% → 25% → 100%, with hold periods determined from the family’s measured workload and completion time. Long-running families need enough observation time to observe completion, not only intake; low-volume cases need targeted synthetic jobs for failure modes.

**Automatic hold/pause:** uncertain duplicate economic effect, possible tenant data leak, stale revoked token authorization, lease-fencing acceptance, orphan jobs beyond a policy threshold, PG overload, sustained p95 regression, Queue DLQ anomaly, cost explosion or owner-required approval missing.

**Safe rollback:** freeze affected new intake and bump route generation via audited PG CAS; keep or fence prior executions **under per-job ownership**, query provider status and reconcile any unknown side effects; route **newly created** jobs to the approved previously certified backend only after readiness checks and operator authorization. **Do not** flip a global boolean that silently resubmits in-flight jobs to BullMQ. Already-retired Redis code/credentials are not an acceptable general recovery backend; recovery then uses PG/Queue/Runner replay under the canonical control plane or a separately approved disaster-recovery procedure.

**Postmortem:** save trace, immutable job/event IDs, detected gap, effect reconciliation, resource metrics, corrective code changes, test addition and Spec 228 issue/alert links.

---

## 15. Failure injection and disaster-recovery matrix

| Fault | Required behavior / proof |
|---|---|
| Outbox commit succeeds; Queue publish fails | bounded republish; no missing job; no duplicate business attempt |
| Queue publish succeeds; outbox ACK update fails | safe duplicate publish; consumer claim once; dispatch telemetry reconciles |
| Queue redelivers batch/late duplicate | PG fencing/idempotency; no double provider call/credit debit |
| PG/Hyperdrive unavailable mid-consume | no false Queue ACK before durable handoff; bounded retries/DLQ plus reconciler; no cached critical reads |
| Hyperdrive read-cache accidentally bound to ACL/jobs | integration/CI test fails; security gate blocks production |
| DO unavailable during revocation | fail closed (or explicitly certified FRESH PG path where policy allows); no stale token acceptance |
| DO hibernates during active WebSocket sessions | attachments rehydrate; event cursor replay fills missing events |
| DO lock holder expires and wakes late | stale fencing epoch rejected by PG/resource system |
| Runner browser/agent offline during external job | no blind regeneration; external state reconciliation; safe rebind and delayed resumption |
| Queue DLQ populated; retention expiration imminent | immediate alert and PG-driven replay/reconciliation; DLQ is not needed to recover identity |
| Old BullMQ worker restarts after CF promotion | stale route epoch prevents new claim/settlement; alert unexpected legacy traffic |
| Cron duplicate/missed 48 hours/DST fold | occurrence uniqueness; deterministic catch-up policy; no lost/double schedule run |
| R2 artifact upload completed; PG settle fails | staged immutable artifact; no stale pointer promotion; fenced settle on retry |
| Callback arrives after new lease/new generation | record as late observation only; reject stale settlement; provider status reconcile |
| Tenant delete/ACL change during Vectorize retrieval | fresh PG ACL check before content reaches reranker or LLM; deny and audit |
| Regional Cloudflare/PG provider disruption | documented blast radius, graceful degradation and approved DR; no fabricated zero-RTO claim |
| Redis network denied at final certification | no production startup/read/write failure in six groups; unknown traffic is a fail |

Run these at unit, integration, staging real transport and measured canary levels as applicable; do not generate real chargeable media, invoke paid models or use live production mutations without a scoped approval.

---

## 16. Acceptance matrix / traceability and Definition of Done

| ID | Required acceptance evidence | Gate |
|---|---|---|
| A01 | Audited spec number, cross-spec ownership/compatibility, complete discovered runtime callers | P232.0 |
| A02 | Two Hyperdrive consistency classes; critical reads demonstrably uncached | P232.1 |
| A03 | Atomic `worker_jobs`+events+outbox; old schema migrated without deleting data | P232.1 |
| A04 | Duplicated/lost Queue publish and PG outage recovery verified | P232.1/2 |
| A05 | Lease epochs and stale callbacks cannot settle a newer attempt | P232.1/2 |
| A06 | Genuine Cloudflare Queue + DLQ synthetic integration, not mocks only | P232.2 |
| A07 | Each cache keyspace has validated TTL, staleness, stampede and canonical miss | P232.3 |
| A08 | Each job family promoted independently, historic in-flight jobs drained/reconciled | P232.3–6 |
| A09 | Rate-limit consistency class and credit separation conformance | P232.4/5 |
| A10 | DO lock fencing and WebSocket hibernation/replay gap tests | P232.4 |
| A11 | Scheduled occurrence uniqueness, timezone/DST, old-repeat drain | P232.4 |
| A12 | Auth revoke cross-region, stale ACL prevention, fail-closed tests | P232.5 |
| A13 | Credits/economic idempotency and provider unknown-side-effect recovery | P232.5 |
| A14 | Vectorize retrieval uses fresh authorization and no pgvector remigration | P232.4/5 |
| A15 | Admin control surfaces enforce RBAC, approvals, redaction and audit | P232.3–6 |
| A16 | Baseline/canary SLO+spend, alerts, cost reporting and owner runbooks | P232.3–7 |
| A17 | `bullmq`, `ioredis`, Redis Python/broker modules removed when no longer required; no runtime imports/flags | P232.6 |
| A18 | Redis endpoint unavailable in production smoke; startup succeeds, required paths work | P232.6 |
| A19 | No active `smartspec-node-worker.service` Redis queue duty, legacy systemd/Cron/IaC references | P232.6 |
| A20 | Independent final verifier PASS for ALL gates; no unresolved high-risk blockers | P232.7 |

**Full Definition of Done:** Every active Redis/BullMQ responsibility in all six groups is migrated and certified, including hidden Celery/Redis use if discovered; no runtime or deployment dependency on Redis remains; all newly created background jobs use `worker_jobs` + outbox; Cloudflare Queues remain transport only; no runtime fallback to BullMQ; Vectorize remains the existing production index; current tenant/user authorization is verified on every retrieval path before protected content enters RAG; every in-flight historical job has a recorded disposition; the admin UI, audit, alerting and DR runbooks are live; SRE and security jointly sign off. An unimplemented stage or missing live evidence is `BLOCKED`, not done.

---

## 17. Implementation work packages and dependency graph

```text
P232.0 Inventory + baselines + Spec 232 registry uniqueness
    └─ P232.1 PG contract + fresh Hyperdrive + migration ownership
         ├─ P232.2 Real CF staging transport + reconciler + DR tests
         │     ├─ P232.3 G1 cache + first low-risk G6 family → early production value
         │     └─ P232.4 G3/G4/G5 + additional G6 families/schedulers
         ├─ P232.5 G2 auth + financial-sensitive workloads [security dependency]
         └─ P232.3/P232.4/P232.5 evidence → P232.6 retire legacy
                                           └─ P232.7 independent Final Verify
```

**Parallel work:** inventory + UI wireframes + test harness + Cloudflare quota analysis can proceed concurrently with deterministic contract work, but live canary cannot precede required contract, security and staging gates. If Spec 213 live browser certification remains blocked, proceed with non-browser families and deterministic work; keep browser family gate blocked rather than claiming universal completion.

**Minimum code surfaces expected:** canonical job service/ORM, outbox dispatcher, queue envelope validator, Cloudflare Queue adapter, ownership resolver and durable per-family assignment, reconciliation scheduler, Workers fresh/cached DB bindings, DO auth/locks/realtime classes, KV cache adapter, provider/Runner completion callback, admin Task Control Center integration, telemetry/alerts, IaC, CI static rules, staged DB migrations and migration manifests. These are *targets to map onto existing code*—not instructions to create duplicate modules if the features exist.

**Change discipline:** `Plan → Implement → Unit/TDD → Integration → Fault Injection → Independent Review → Staging Verify → Approved Canary → Observe → Final Verify`; for each slice record exact changed files, migration scripts, commands/results, worktree status, test totals, build SHA, flags, rollback revision and remaining blockers. Respect an existing dirty worktree: do not reset, overwrite or commit unrelated developer changes.

---

## 18. Delivery artifacts

1. `specs/feature/232-zero-downtime-redis-bullmq-cloudflare-migration/spec.md` (this spec, maintained under normal review policy).
2. `migration/redis-migration-inventory.yaml`, six-group traceability, real discovered job-family manifest.
3. Approved DB expand/backfill/contract scripts and source-of-truth schema map, plus backward-compatible contract tests.
4. `MigrationOwnershipResolver`, route-generation tests, outbox/reconciler/Cloudflare Queue adapters and real staging proof.
5. Per-group compatibility shims/feature-flag removal plans, canary and drain evidence, deterministic fault-injection suite.
6. Existing Task Control Center extension and Spec 228 alert integration; scoped operator runbooks.
7. CI redis-import/dependency/IaC guard, Redis-network-deny runtime proof, full legacy retirement report.
8. `P232_FINAL_VERIFY.md` with signed gate matrix, trace/evidence links, actual SLO/cost results, security and SRE approvals, and explicitly listed blockers (if any).

---

## 19. Implementation kickoff command for Codex/Claude/Hermes via Spec 224

> Implement **P232.0 and the smallest deterministic P232.1 slice first**. Inspect the live repository and latest canonical Feature 186/187/195 + Specs 207/213/219/220/224/226/228/229/230 and reconcile differing field names before writing schema. Build a complete Redis/BullMQ/Celery caller inventory and family matrix, verify that Spec 232 is uniquely reserved in the live registry, establish baseline metrics, add the FRESH-vs-CACHED DB consistency contract, and make tests for atomic `worker_jobs`/outbox, route-generation claim and duplicate delivery. Do not replace currently serving Redis producers in this slice, do not invoke paid providers, do not rotate secrets, do not deploy to production and do not overwrite dirty worktree changes. Return exact files, migrations, tests/evidence, changed state, unmet gates and next safe slice. Never report production certification from mocked tests.

After each completed slice, the next command should use the **same canonical spec** and resume from the last independently verified gate, not restart architecture planning or silently reimplement a frozen earlier spec.

---

## 20. Official platform references (verified 2026-09-23; revalidate limits at deployment)

- [Cloudflare Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) — default 60s max age + 15s stale; no invalidation on write; separate cache-disabled config.
- [Hyperdrive supported/unsupported PostgreSQL features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/) — advisory locks, `LISTEN/NOTIFY`, SQL-level prepared statements unsupported through Hyperdrive.
- [Cloudflare Queues at-least-once delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) — consumer idempotency mandatory.
- [Queues platform limits](https://developers.cloudflare.com/queues/platform/limits/) — 128KB payload, 15-minute consumer wall clock, up to 24h delay, retention/account limits.
- [Queues batching/retries/delays](https://developers.cloudflare.com/queues/configuration/batching-retries/) — batch retry semantics and delays.
- [Queues DLQ](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/) — default deletion at retry limit without DLQ; DLQ retention considerations.
- [Cloudflare Workers KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) — eventual consistency; not transactional/atomic.
- [Durable Objects WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) — connection survives idle sleep but in-memory state resets.
- [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) — local to location; approximate/eventual, not accounting.
- [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/) — runtime/storage/step limits and optional orchestration boundary.
- [Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/) — pre-query scoping; not a replacement for authorization.
- [Cloudflare Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) — estimate actual plan, messages, retries, DLQ and operation sizes before each family promotion.

---

## 21. Architecture review / known non-goals

**Reviewed structural failure modes:** duplicate source-of-truth, stale Hyperdrive ACL read, Redis fallbacks on CF-owned paths, premature legacy worker removal, Queue at-least-once/ACK confusion, long-running Queue invocation timeout, lost outbox publish ACK, lock expiry without fencing, PG+DO split transaction, DO hibernation losing event history, exact-global-rate-limit confusion, Celery Beat forgotten, delayed recurrence beyond 24 hours, orphan provider charges, cross-tenant Vectorize/R2 leakage, credits double settlement, unrecoverable DLQ, secrets accidentally logged, expensive CF hot keys, false-positive static scan, dirty-worktree destruction and mock tests mistaken for live certification.

This document resolves these **in the specified design and acceptance gates**; actual code conformity, runtime behavior, Cloudflare account quotas and security cannot be certified until an independent implementation and live evidence review. The implementation agent MUST record newly discovered gaps as amendments and regression tests rather than changing canonical authority boundaries.


---

# R2 — Twenty-Pass Gap Audit and Mandatory Corrections

**Audit date:** 2026-09-23. **Baseline:** original migration document R1, previously misnumbered as Spec 231; renumbered to Spec 232 in this revision. **Scope:** design review, cross-spec consistency and current Cloudflare product-contract verification. **Limitation:** No SmartAIHub repository, production telemetry, actual Cloudflare account configuration, secrets or paid provider was modified or certified as part of this document-only revision. The matrix below records twenty *distinct failure-oriented design passes*, the identified risk and the contract/test added in R2. A spec review does not prove that a production system conforms to it.

## 22. Twenty-pass audit register

| Pass | Failure-oriented review lens | Gap or latent failure in R1 | R2 requirement / acceptance evidence |
|---:|---|---|---|
| 01 | Numbering / artifact identity | Migration and LLM Routing both used 231 in concurrent sessions. | Reserve migration **232**; distinguish historical references using exact slug+digest; reject bare ambiguous aliases; inspect live registry before commit (C01). |
| 02 | Existing schema and rollback | Generic schema names could trigger duplicate tables and irreversible constraints. | Source-schema discovery, additive migrations, historical-data backfill, backwards-compatible rollback window; gate contraction on old-binary retirement (C02). |
| 03 | Route transition races | Concurrent producers could observe different active family generations. | Atomic PG route-epoch transition; each job persists a single backend+generation+request digest; prove generation monotonicity and stable canary partitioning (C03). |
| 04 | Mixed-version legacy workers | Old code can bypass route checks even when modern producers use migration ownership. | Identify every direct BullMQ enqueue path; compatibility adapter or explicitly fenced legacy path; block newly migrated family entries at producer and legacy consumer, trace zero bypasses (C04). |
| 05 | Outbox double-publisher race | Lease expiry during `send()` could let stale dispatcher mark another attempt SENT. | Every outbox claim has publisher epoch/expiry; `SENT` CAS requires exact token; uncertain publish retries same immutable dispatch identity; per-message ACK tests (C05). |
| 06 | Queue batch partial failure | One failed message could redeliver all successfully processed messages. | Use per-message `ack()/retry()` when supported, never assume batch atomicity; assert business effects once under repeated full-batch delivery (C06). |
| 07 | Missing claim after SENT | Publisher success without claim can become orphan work; naïve resubmission can duplicate running external effects. | Reconciler checks state/attempt/last claim and provider outcome; bounded grace, safe re-dispatch of same intent only, never blind re-execution (C07). |
| 08 | External side-effect ambiguity | Billing/media/email provider accepted an operation but reply was lost. | Durable effect intent with provider idempotency or reconciliation handle; explicit UNKNOWN state and human review where query/idempotency unavailable (C08). |
| 09 | Economic lifecycle | Reservation expiry or partial refund may race long-running completion. | Separate admission hold from final settlement; canonical effect IDs, bounded hold-extension policy, lost-callback reconciliation and exact-one refund/charge (C09). |
| 10 | Schedule migration | UTC Cron change propagation, DST overlaps and delayed repeats could create duplicate occurrences. | PG `schedule_id + scheduled_for + revision` contract plus old-repeat inventory, clock simulation and 48h outage catch-up; UTC wake-up only (C10). |
| 11 | Global revocation | A single per-session DO cannot guarantee tenant-wide revoke across independent authorization shards. | Fresh PG global version gate or provably synchronized per-scope DO authority; block before success; cross-region tenant suspension and partial-commit tests (C11). |
| 12 | DO concurrency | Single-threaded DO can interleave at `await`; in-memory counters disappear on hibernation. | SQLite-backed DO persistent state, transaction-safe operations, per-resource shards, epoch/fencing tests during awaits and restart (C12). |
| 13 | Realtime replay gap | Replay-then-subscribe can lose events committed between phases. | Subscribe+high-watermark+buffer+replay+dedup protocol; gap tests under reconnect, terminal events and tenant revocation (C13). |
| 14 | KV deletion and privacy | Versioned caches can retain stale sensitive values or unbounded orphan versions. | Disallow protected data in eventually consistent KV unless expressly permitted; versioned-key retention, erasure/invalidation audit and negative-cache limits (C14). |
| 15 | Queue quota and backpressure | Account/queue/consumer limits, origin PG connections and provider 429 can create retry storms. | Hard concurrency budgets, adaptive batching, rate-limited admission, per-family DLQ and bounded exponential backoff with published capacity model (C15). |
| 16 | Disaster recovery / data residency | Plan had outage drills but no precise restoration point, identity fence or region-specific dependency map. | Postgres PITR/restore proof, R2 artifact reconciliation, route-generation recovery, encrypted redacted backups, country/provider placement review (C16). |
| 17 | Administrative control plane | Unsafe one-click replay or canary override could bypass tenant/approval protection. | Fine-grained RBAC, two-person high-risk gates, idempotent operator commands, expiry and correlation, replay preview, immutable audit (C17). |
| 18 | Deployment / release order | Deleting Redis too early or switching incompatible binaries can strand historical jobs. | Versioned producer/consumer compatibility matrix, staged deploy order, explicit traffic proof and contract migrations only after rollback horizon (C18). |
| 19 | Cost / observability cardinality | DLQ accumulation, long-lived DO hotspots, high-cardinality tracing and excess PG polling may erase savings. | Per-tenant/family volume forecast, sampling, bounded polling, objective early-canary cost gates and spend anomaly alerting (C19). |
| 20 | Truthfulness of final verification | Static scan/mocks might be mistaken for certified operational readiness. | Independent verifier checks real staging + scoped production smoke, exact artifacts, actual Redis-deny proof and all critical gates; never sign off a blocked family (C20). |

## 23. Normative R2 precedence and identifier isolation

1. R2 §§22–31 **supersede R1 §§0–21 where contradictory**; all other R1 requirements remain in force. Implementation must not cherry-pick weaker earlier language.
2. `spec_id=232`, slug=`zero-downtime-redis-bullmq-cloudflare-migration`, target path=`specs/feature/232-zero-downtime-redis-bullmq-cloudflare-migration/spec.md`, work packages=`P232.*`, acceptance=`A01–A20` plus R2 `C01–C20`, terminal record=`P232_FINAL_VERIFY.md`.
3. **Spec 231 = LLM Routing & Inference Orchestration**. Its API/provider-model-selection logic is a dependency/interface, not a submodule or synonym of this migration spec. Migration of the hosting environment must preserve provider-routing policy, API feature fidelity, quotas and live user settings; no inference-policy rewrite is authorized here.
4. Historical migration file aliases (`spec-231-zero-downtime-redis-bullmq-cloudflare-migration-r1`, the prior `P231.*` checkpoints and artifact URLs) are migrated to this Spec 232 **only if their slug and source identity match**. Generic/bare `231` resolves to the separately owned inference spec only after a signed registry migration. Never bulk-replace unrelated `Spec 231` links.
5. Before any canonical commit, fetch repo registry, `main`, open/merge-pending branches/PRs, spec manifest and actual adjacent paths. Atomically reserve 232 with an immutable identity, approved alias map, source digest and commit SHA; if unavailable/colliding, stop and report. The user's chosen number is an instruction for this deliverable, **not evidence of an already committed registry allocation**.
6. Add CI uniqueness/alias tests and a one-time reference migration for test fixtures, admin URLs, generated work orders, Spec 224 execution plans, README and spec navigation. Never reassign an in-flight `worker_jobs.id` merely to rename the spec.

## 24. Mandatory compatibility manifest, release sequence and evidence (C02–C04, C18)

A machine-readable manifest (reuse existing approved registry where present) SHALL include at least:

```yaml
spec_id: 232
spec_slug: zero-downtime-redis-bullmq-cloudflare-migration
migration_manifest_schema: 2
families:
  <real-family-discovered-from-repository>:
    owner: <team>
    partition_strategy: tenant-or-global
    active_backend: LEGACY_OR_CF
    route_generation: <positive-db-issued-integer>
    rollout_mode: LEGACY_ACTIVE
    producer_contract_version: <int>
    consumer_min_contract_version: <int>
    currently_serving_binary_sha: <sha>
    allowed_legacy_producer_ids: []
    legacy_inflight_count: <measured-int>
    delayed_repeat_count: <measured-int>
    allowed_new_effects: false
    rollback_window_end: <utc-timestamp-or-null>
    approval_id: <existing-approval-id>
    evidence_refs: []
```

The sample is a schema sketch, not fabricated inventory. Implement machine schema validation. Capture the immutable **request digest** at creation; same `(tenant, caller, idempotency_key)` with different payload or economic terms MUST return `409 IDEMPOTENCY_CONFLICT`, not an old job result. Legacy jobs without these fields require an explicit backfill/default-deny policy and visibility in the UI.

Canonical deploy order per family: **(1)** expand PG schema without dropping old columns → **(2)** deploy backward-compatible legacy producer/consumer guard binaries → **(3)** add route resolver + outbox/CF consumer disabled → **(4)** synthetic and shadow certification → **(5)** allowlist new canary creation with durable assignment → **(6)** drain old assignments and late callbacks → **(7)** promote CF route → **(8)** soak beyond the defined rollback horizon → **(9)** remove legacy binaries/credentials and contract schema after approving irreversible cleanup. If (2) is impossible for a legacy runtime, do **not** canary that family until a tested gateway or equivalent route-enforcement mechanism is available.

Each producer fetches or atomically resolves current family/partition generation in a **fresh PG transaction** that creates the canonical job; flag caches and KV snapshots are advisory only. A global migration-owner row is NOT one global execution lock; shard by independent family/tenant partition while retaining required tenant-wide uniqueness. Every legacy worker that can perform an effect must validate its per-job assignment and lease through its compatibility adapter before the effect, not merely at dequeue. Already-started external effects are quarantined from automated duplicate re-execution until observed/reconciled.

## 25. Outbox, consumer ACK, reconciliation and durable effects (C05–C09)

**Outbox token and state contract:** reuse the existing tables; required semantics are `PENDING → PUBLISHING(lease_owner, lease_epoch, expires_at) → SENT(ack_time)` and `PUBLISHING → PENDING(retry_after)` under CAS. The dispatcher must claim rows with bounded `FOR UPDATE SKIP LOCKED` transactions and **release the PG transaction before network publishing**. No DB transaction remains open across a Queue send or provider API. A crashed publisher may produce duplicate transport messages; a stale publisher must not mark SENT after its epoch has been stolen. On `429`/quota errors use family-level admission pause, exponential backoff+jitter and no retry storm.

**Per-message ACK contract:** use `message.ack()` after a terminal/no-op canonical observation or after **durable** execution handoff. On transient failure before that point use `message.retry({ delaySeconds })` only where allowed/needed and record the error code; do not blanket `ackAll()` after partial failure. Individual-message ACK is vital because one failed member otherwise causes full-batch redelivery. Queue retry count, DLQ status and retention are **transport evidence only**; the PG scheduler/reconciler is responsible for eventual job recovery and alerts even if Queue retention expires.

**UNKNOWN_EXTERNAL_EFFECT:** record `{job_id, attempt, route_generation, effect_type, effect_intent_id, provider_request_id, provider_idempotency_key, checkpoint, last_observed_at, next_reconcile_at}` as redacted existing effect metadata; do not log prompts/media bodies. Never retry an irreversible charge, email, video job, domain operation or browser submission solely because the queue ACK, provider response or Runner heartbeat disappeared. First query provider/job state if supported. If provider provides no reliable status/idempotency, park and require an authorized operator decision with displayed uncertainty and potential spend exposure.

**Credit settlement:** preserve Spec 207 authority; economic key is unique across retries and backend changes; maintain reservation/extension/expiry/partial-refund policy for waits and long renders. Charge or refund may be confirmed **only once** under a fresh PG CAS and existing credit ledger. A verification failure blocks the terminal transition; it does not authorize a second paid effect. Compare provider invoices/usage against `worker_job_effects` and credit settlement in bounded reconciliation windows.

**DLQ deadlines:** Cloudflare documentation as of 2026-09-23 says an unconsumed DLQ retains messages for **four days**. An automated redacted DLQ evidence ingestor and alert must persist forensic metadata in approved PG/R2 audit storage long before four days; disable payload retention of secrets. Do not treat either 14-day main-queue maximum or 4-day unconsumed DLQ as permanent recovery storage. Replay operates through existing canonical job state, not by blindly re-sending DLQ bodies.

**Consumer envelope:** reject invalid schema, excessive age or clock skew, mismatched environment/binding, unauthorized family and tenant mismatch before claim. Recheck all sensitive facts from fresh PG. `route_generation` and `dispatch_seq` are immutable signed/validated context (internal binding trust does not bypass database validation); deduplicate based on durable dispatch identity, not ephemeral Cloudflare message IDs.

## 26. Auth, DO, KV and realtime correctness (C11–C14)

- **Revocation scope:** model session-, user- and tenant-level `security_epoch` with fresh PG canonical value, monotonic increments and mandatory authorization comparison at protected decision points. A local session DO may accelerate checks but must not assert global tenant revocation completion while another shard accepts the old epoch. For emergency tenant suspension, protected routes use an always-fresh global PG gate or a single provably coordinated authoritative scope backed by PG and a tested fail-closed path. A failed partial `PREPARE_BLOCK` requires scope-wide deny/hold until recovery, not automatic unblock on DO alarm expiry. Include refresh-token rotation, API keys, SDK sessions and registered Runners in the threat model.
- **DO state:** use SQLite-backed Durable Objects for new namespaces, persistent versioned policy/lock state and per-key `storage` transactions; await boundaries permit request interleaving, so single-threaded execution is not by itself a lock guarantee. Document atom-of-coordination partitioning and load-test tenant hotspots. DO storage stores coordination facts, not a shadow copy of canonical ACL or credits.
- **KV:** default to public/non-sensitive read-mostly configuration; every permitted tenant-scoped key includes scope+version and bounded TTL, has a cleanup/erasure workflow, and is never an authorization cache on which the system relies for immediate revocation. KV propagates eventually across locations; a freshly deleted key may remain visible elsewhere until local caches expire.
- **Realtime race-free attach:** authorize; open/subscribe live stream with bounded buffer; read current PG stream high watermark `H`; replay `(last_event_seq,H]`; coalesce live events with `seq > H` without gaps; resnapshot on buffer overflow or non-contiguous sequence; enforce tenant scope and security epoch on replay and live delivery. Test disconnect/hibernate/redeploy and replay at the exact moment the job reaches terminal state. Never use a per-DO counter as canonical PG event ordering.

## 27. Scheduling, backpressure, recovery and geography (C10, C15–C16)

- **Cron:** Cloudflare Cron uses **UTC** and changes may take **up to 15 minutes** to propagate (docs updated 2026-09-04). It only wakes the PG due-occurrence sweeper; user-facing schedule timezone/DST semantics are evaluated in PG/application code. Deduplicate occurrence by the **actual existing schema's canonical schedule ID and occurrence instant, with revision/semantic-version collision rules documented**; never alter future occurrences already enqueued without an audited reschedule. Test 48h trigger outage, unexpected duplicate triggers and old Celery Beat repeat definitions.
- **Backpressure:** size Queue per family/isolation risk, never one hot global consumer bottleneck. Set `max_concurrency`, maximum batch size/wait, bounded in-flight PG transactions, tenant/provider slots and global PG connection ceilings. When Queue approaches documented account/queue limits (including per-queue throughput and concurrent consumer invocations), throttle new producer admission, preserve canonical job+outbox as PENDING and expose lag; do not lose jobs or hammer origin DB. Distinguish Queue publish 429 from provider inference 429; never conflate retry budgets.
- **Reconciler:** partition sweeps by family and indexed due windows with a bounded throughput budget; use durable cursor/checkpoint and jitter so outage recovery does not form a stampede. Detect work waiting past Queue max retention and re-drive from PG; alert on persistently unknown external effects rather than scheduling irreversible duplicate actions.
- **Backups/DR:** record verified PG PITR capability and tested RPO/RTO per family; restore job/events/outbox/ownership/effect state as one logically consistent snapshot. During failover, pause admission until fresh route epochs, prior leases, provider effects and R2 artifact pointers are reconciled. Document TLS, storage region/data residency requirements, Cloudflare DO affinity and managed-Postgres region; do not assume global edge compute implies globally local PG writes.
- **Capacity/pricing:** use measured baseline + predicted workload and account-specific 2026 limits for Queues operations/retries/DLQ, Workers CPU, DO active duration/storage, KV operations, Hyperdrive/origin connections, managed PG IOPS, R2 reads/egress and Container/Runner runtime. Canary promotion requires approved total cost per successful job or approved exception, not merely lower Queue latency.

## 28. Admin RBAC, irreversible operations and incident workflow (C17, C19)

Reuse the existing Task Control Center and Spec 228 issue/alert pipeline. High-impact actions (`PROMOTE`, `ROLLBACK`, `EMERGENCY_PAUSE`, `REPLAY_UNKNOWN_EFFECT`, `RETIRE_LEGACY`, `REVOKE_SECRETS`) require an authenticated scoped operator, fresh permission check, reason, immutable change ID and independent second approval when financial, security-wide or irreversible. An operator may not approve their own privileged request. All command APIs enforce idempotency, expected generation, expiry, CSRF/origin protection as appropriate and audited failure—not UI-only RBAC. `REPLAY` defaults to a read-only preview with side-effect classification, price exposure and owner-visible risk.

Dashboards SHALL label canonical PG state separately from Queue delivery observations; display canary percentage, traffic errors, lag age, delayed backlog, pending outbox age, orphan effect age, expired lease backlog, DO hotspots, PG saturation, DLQ oldest age, Queue retention risk, credit settlement discrepancies and **marginal cost per completed job**. Trace IDs are sampled/redacted and bounded in cardinality; high-cardinality tenant IDs must not explode metrics bills. Incident commands create/update existing Spec 228 issues and alert admin through currently authorized channels.

## 29. R2 conformance expansion, required tests and release stop rules

In addition to R1 A01–A20, implement **C01–C20** as the audit-linked test gates in §22. Each C-gate must have one named automated test suite, a bounded representative staging experiment where applicable and a reproducible redacted evidence location; unsupported staging features remain BLOCKED, not silently skipped. Suggested test IDs `S232-C01`–`S232-C20` may map into the repo's existing naming scheme rather than creating a duplicate runner.

Hard stops: `spec_id=232` registry conflict; unverifiable canonical schema; a legacy producer bypass; privilege/tenant leakage; duplicate paid settlement; unknown irreversible effect automatically retried; persistent Queue ACK before handoff; stale fencing accepted; failed cross-region tenant suspension; canary SLO/cost regression beyond ratified threshold; missing Rollback Operator; or live Redis dependency at retirement. No deadline, cost saving or green unit suite overrides these. A failed family gate blocks that family and overall FINAL_VERIFY; unrelated safe families may continue to advance with independent evidence.

An independent verifier SHALL read actual deployment build SHA, migration manifest digest, current PG migration version, family route epoch, real Queue/DLQ configuration, test logs and controlled production observations. Evidence that a synthetic job works does not certify media providers, authenticated browser sessions, credits or tenant-wide revocation. Final certification requires SRE + Security and existing finance approval for financially sensitive families; publish a concise signed matrix mapping all six groups, all discovered job families, A01–A20 and C01–C20 to PASS/BLOCKED/PARKED with reason and `resume_from`.

## 30. R2 rollout delta and revised kickoff

**No broad rollback to the old architecture is implied by this renumbering or document upgrade.** Preserve existing production traffic, implemented <=213 behavior and concurrent engineering work. After checking repo cleanliness and Spec 232 uniqueness, perform P232.0 and the smallest P232.1 deterministic slice with no actual paid providers, no secret rotation and no production cutover. New tests in §§24–29 are incremental to the R1 delivery plan. First real Cloudflare canary is still a low-risk family after live staging evidence, not auth/credits or browser certification.

**Hand-off prompt for an implementation agent:**

> Implement Spec **232** (slug `zero-downtime-redis-bullmq-cloudflare-migration`), starting with `P232.0` plus minimal `P232.1`. Do not implement the distinct Spec 231 LLM Router as part of this work. Read the actual repository spec registry, older job contracts and active production binaries before changing code; prove no 232 collision, inventory all six Redis responsibilities and all job families/Celery broker uses, map existing PG schema, then implement backward-compatible migration ownership and fresh Hyperdrive conformance tests. Apply C01–C20 and A01–A20; start with deterministic fakes and safe staging. No production cutover, payment/provider call, credential rotation or destructive cleanup without the existing approval gates. Output exact files, commit/worktree status, executed tests, evidence, blockers and the next independently safe slice.

## 31. Additional official platform references checked for R2

- [Cloudflare Queues batching, message-by-message acknowledgement](https://developers.cloudflare.com/queues/configuration/batching-retries/) — explicit per-message ACK prevents unnecessary full-batch redelivery.
- [Cloudflare Queues DLQ retention](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/) — unconsumed DLQ messages persist for four days, not forever.
- [Cloudflare Queues platform limits](https://developers.cloudflare.com/queues/platform/limits/) — 128 KB messages, up to 100 batch, 5,000 messages/sec/queue, 250 concurrent push-consumer invocations, 15-minute consumer wall clock; check plan/account before deployment.
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — UTC schedule and trigger-change propagation up to 15 minutes.
- [Cloudflare Durable Objects best practices](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) — SQLite-backed persistence, per-entity sharding, `await` interleaving and hibernation.
- [Cloudflare Workers KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) — cross-location eventual consistency; not authorization authority.
- [Cloudflare Hyperdrive feature support](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/) — session advisory locks and LISTEN/NOTIFY unsupported; transaction pooling.
