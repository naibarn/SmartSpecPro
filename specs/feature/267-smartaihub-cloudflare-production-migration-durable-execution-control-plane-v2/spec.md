---
spec_id: 267
title: SmartAIHub Cloudflare Production Migration & Durable Execution Control Plane V2
revision: 4.0
review_rounds: 38
review_date: 2026-10-02
review_status: HARDENED_AFTER_38_INDEPENDENT_GAP_PASSES
date: 2026-10-01
status: CANONICAL_IMPLEMENTATION_PLAN
numbering_status: PROVISIONAL_UNTIL_REGISTRY_COLLISION_GATE
risk_class: CRITICAL
primary_owner: SmartAIHub Production Platform / Execution Control Plane
canonical_migration_authority: SPEC_267
canonical_job_authority: PostgreSQL worker_jobs + worker_job_events + lease/fencing/idempotency/outbox contracts from Feature 186 / Feature 195
canonical_development_orchestration: Spec 224
target_control_plane_language: Go
target_edge_runtime: Cloudflare Workers
target_queue_transport: Cloudflare Queues
target_long_running_durable_steps: Cloudflare Workflows where explicitly selected
target_live_coordination: Durable Objects where explicitly selected
target_execution_runtime: Rust Runner / Cloudflare Containers / approved external providers
target_artifact_store: Cloudflare R2
production_workers_plan: Workers Paid
production_zone_plan: Cloudflare Pro for the primary revenue-producing public zone at GA unless a higher plan is required by measured security/SLA needs
default_managed_postgres_candidate: PlanetScale Postgres High Availability (1 primary + 2 replicas across 3 AZ), subject to certification gates
initial_go_container_pool: 2 x basic logical replicas, stateless/restart-safe, scale by measured bottleneck
production_budget_target_usd_per_month_excluding_ai_providers: 100-150
baseline_cloudflare_components: DNS-CDN-SSL-WAF, Workers Paid, Queues, Containers, Hyperdrive, R2, Workers Observability, KV, Vectorize
conditional_cloudflare_components: Workflows, Durable Objects
transitional_cloudflare_components: Workers VPC, Cloudflare Tunnel
initial_database_location: Existing Linux PostgreSQL
final_database_location: Certified managed PostgreSQL reached through the approved Cloudflare data path
supersedes:
  - Spec 232 Redis/BullMQ Migration R2.1 — entire migration/execution-plan authority
  - Spec 245 Cloudflare Migration Master R7.1 — entire migration/promotion-order authority
retains_as_contract_dependencies:
  - Feature 186 / Feature 195 job durability invariants
  - Spec 224 Autonomous Development Orchestrator lifecycle/finality
  - Spec 242 Cloudflare Agent/Sandbox capability contracts only
agent_read_policy:
  migration_planning_source: Spec 267 only
  do_not_use_as_active_plan:
    - Spec 232
    - Spec 245
  historical_files: evidence only; never used to derive current migration order or production authority
---

> **Renumbering note — 2026-10-01:** This document was previously drafted as **Spec 265 R2**. That number is considered occupied/conflicting. The document was renumbered to **Spec 267** without changing architectural ownership. **R4 is the current canonical candidate**; earlier Spec 267 R2/R3 revisions are historical. Any draft reference identifying this Cloudflare Production Migration & Durable Execution Control Plane V2 plan as Spec 265 is obsolete.

# Spec 267 — SmartAIHub Cloudflare Production Migration & Durable Execution Control Plane V2

> **R3 scope expansion — 2026-10-02:** Final production service map, managed PostgreSQL default-candidate policy, launch sizing, platform cost envelope, FinOps guardrails and anti-service-sprawl rules are now normative.

> **R4 hardening — 2026-10-02:** Queue transport leases are explicitly separated from execution fencing; provider-account governance, callback authenticity, queue sharding, privacy/retention, operational incident control, error budgets, emergency kill switches, failover epochs and machine-verifiable migration receipts are now normative.

## 0. Executive decision

SmartAIHub SHALL replace the fragmented queue/control-plane and Cloudflare migration plans with this single canonical implementation plan.

The migration SHALL begin with the subsystem that has historically caused the highest operational risk:

> **Job execution, queue delivery, recovery, provider-capacity control, and end-to-end job observability.**

The new subsystem SHALL be deployed to Cloudflare production **before** the main SmartAIHub application is migrated from the Linux server.

The existing PostgreSQL database SHALL remain the **single production source of truth** on the Linux server during the first migration stages. Cloudflare production services and the Linux development/debug environment SHALL intentionally observe the same canonical production data under different, strictly scoped database roles.

The long-term target is:

```text
Cloudflare = Production runtime
Linux       = Development + diagnostics environment
PostgreSQL  = One canonical database, eventually moved to certified managed PostgreSQL
```

There SHALL NEVER be two independent writable production databases.

---

# 1. Why this spec exists

The current planning set has accumulated multiple overlapping migration documents and implementation paths. This creates material execution risk because agents or developers can:

- read an older migration order;
- apply an obsolete Redis/BullMQ plan;
- create another job authority;
- interpret Cloudflare Queues as the source of truth;
- migrate PostgreSQL too early;
- modify Spec 224 as if it owned generic queue infrastructure;
- deploy a new runtime while a legacy runtime still claims the same jobs;
- rebuild large production applications for small control-plane changes.

This spec consolidates the required production migration decisions into one authoritative plan.

The operational problem to solve is not merely “replace Redis.”

The actual problem is:

```text
A user submits work
        ↓
The system must know where that work is
        ↓
The system must ensure an authorized executor owns it
        ↓
The system must know which provider/account is being used
        ↓
The system must survive rate limits, worker death, process restart,
provider delay, callback loss, artifact download failure and duplicate delivery
        ↓
The system must either complete the requested work
or reach a visible, explained, auditable terminal outcome
```

The following failure class is prohibited:

> **Accepted job silently disappears or remains indefinitely in an unknown state.**

---

# 2. Supersession and anti-confusion rules

## 2.1 Canonical authority table

| Area | Active authority after Spec 267 |
|---|---|
| Cloudflare production migration sequence | **Spec 267** |
| Redis/BullMQ/Celery queue migration | **Spec 267** |
| Go Control Plane V2 | **Spec 267** |
| Provider account pool / capacity management | **Spec 267** |
| Queue architecture / retry / DLQ / reconciliation | **Spec 267** |
| Production-vs-Linux-dev topology | **Spec 267** |
| Build/deploy/rollback for the new control plane | **Spec 267** |
| `worker_jobs`, event, lease, fencing, idempotency invariants | Feature 186 / Feature 195, consumed by Spec 267 |
| Development run lifecycle / Final Verify | Spec 224 |
| Cloudflare Agent/Sandbox feature behavior | Spec 242, subject to Spec 267 placement/cutover rules |
| LLM/model routing semantics | Spec 231 and later canonical provider-routing contracts |
| R2 artifact authority | Existing storage contract |
| Vector semantic index | Existing Vectorize authority |

## 2.2 Specs explicitly superseded

The following specs SHALL NOT be used as active migration plans after Spec 267 is registered:

- **Spec 232 — Redis/BullMQ Migration**
- **Spec 245 — Cloudflare Migration Master**

They remain historical evidence only.

If content conflicts:

```text
Spec 267 migration/cutover rule
    overrides
Spec 232 / Spec 245 migration/cutover rule
```

Feature 186/195 job-safety invariants and Spec 224 development finality are NOT superseded.

## 2.3 Repository anti-confusion work package

The implementation SHALL prevent agents from accidentally reading obsolete plans.

Required repository actions:

1. Register Spec 267 as `CANONICAL`.
2. Mark Specs 232 and 245 as `SUPERSEDED_BY_267`.
3. Move their full historical text to a clearly excluded historical directory, for example:

```text
specs/_superseded/232/
specs/_superseded/245/
```

4. Replace any old canonical entry path with a short tombstone:

```text
SUPERSEDED.
Do not implement from this file.
Canonical migration authority: Spec 267.
```

5. Update the Spec Registry so normal resolution of:
   - Cloudflare migration,
   - Redis migration,
   - BullMQ migration,
   - queue migration,
   - control-plane migration,
   - Debian/Linux retirement

   returns **Spec 267**.

6. Update agent bootstrap / repository instructions so `_superseded/**` is excluded from normal context discovery.
7. Glob-based spec loading SHALL be prohibited for implementation agents.
8. Spec resolution SHALL be registry/status based:

```text
status = CANONICAL | ACTIVE_DEPENDENCY
```

not:

```text
read every *.md under specs/
```

9. CI SHALL fail if more than one active spec claims:
   - `canonical_migration_authority`
   - `canonical_queue_migration_authority`
   - `canonical_production_cutover_authority`.

---

# 3. Non-negotiable architecture decisions

## 3.1 PostgreSQL remains the truth

PostgreSQL SHALL remain canonical for:

- users;
- tenants;
- ACL;
- credits and settlement;
- `worker_jobs`;
- `worker_job_events`;
- attempts;
- leases;
- fencing epochs;
- idempotency records;
- provider execution references;
- provider-account configuration;
- capacity reservations that affect durable execution;
- recovery state;
- artifact state;
- audit history.

Cloudflare Queues, Workflows, Durable Objects, Containers and Runner memory SHALL NOT become an independent job ledger.

## 3.2 Cloudflare Queues are transport

Cloudflare Queues SHALL be treated as an at-least-once message delivery transport.

Therefore:

```text
Queue message != Job
```

The queue payload SHALL normally contain references such as:

```json
{
  "job_id": "J...",
  "attempt_id": "A...",
  "lease_epoch": 12,
  "routing_family": "media.image",
  "trace_id": "T..."
}
```

Large prompts, files, secrets and artifacts SHALL NOT be embedded as the canonical job payload.

Consumers SHALL re-read canonical job state before performing a side effect.

Duplicate message delivery MUST be safe.

## 3.3 Go becomes the new execution-control core

The new Control Plane V2 SHALL be implemented primarily in **Go**.

Go owns:

- scheduling;
- dispatch decisions;
- provider routing;
- provider-account selection;
- rate-limit/capacity admission;
- capacity reservations;
- weighted tenant fairness;
- job reconciliation;
- recovery decisions;
- SLA monitoring;
- queue backlog interpretation;
- runner placement decisions;
- provider-health interpretation;
- capacity forecasting;
- provider-account expansion recommendations.

Go SHALL NOT become the canonical persistent state.

A Go process may disappear at any time without making a job unknowable.

## 3.4 Rust remains execution-oriented

Existing Rust Runner capability SHALL remain appropriate for:

- desktop execution;
- OS/process management;
- filesystem access;
- local GPU;
- native integrations;
- local tools;
- sandbox/process execution;
- PC/Mac runtimes.

This spec does NOT require rewriting Rust Runner in Go.

## 3.5 Cloudflare Workers remain the edge/control ingress

Workers SHOULD own:

- public/internal API entrypoints;
- authn/authz;
- tenant policy checks;
- request admission;
- internal service routing;
- queue producer/consumer bindings where useful;
- controlled database access through Hyperdrive;
- versioned deployment/canary front door.

## 3.6 Workflows are optional durable step executors

Cloudflare Workflows MAY own a selected long-running multi-step execution path such as:

```text
submit provider job
→ wait/poll/callback
→ fetch artifact
→ validate
→ persist R2
→ finalize
→ notify
```

But Workflows SHALL NOT become a second canonical business-job authority.

`worker_jobs` remains canonical.

## 3.7 Durable Objects are coordination, not the ledger

Durable Objects MAY be used for:

- live Runner sessions;
- WebSocket state;
- short-lived serialized admission;
- hot provider-account coordination;
- presence/capacity snapshots;
- connection ownership.

Durable Objects SHALL NOT bypass PostgreSQL lease/fencing guards for durable side effects.

---


## 3.8 Go/Container lifecycle is request-driven, not daemon-dependent

The Go Control Plane SHALL NOT depend on a Cloudflare Container process remaining alive indefinitely.

Cloudflare Container instances are lifecycle-managed by Workers and may sleep or restart. Therefore correctness MUST NOT depend on:

- an infinite in-memory scheduler loop;
- one permanently elected Go process;
- process-local timers;
- process-local retry queues;
- process-local provider-capacity counters;
- a singleton container that must never restart.

The production control loop SHALL be decomposed into durable triggers:

```text
new job / outbox event
    → Queue event
    → bounded control-plane command

provider callback/status event
    → authenticated event
    → bounded control-plane command

periodic reconciliation
    → scheduled Worker tick
    → enqueue reconcile shard commands

delayed recovery
    → PostgreSQL next_recovery_at and due-index
      OR a certified Workflow sleep/wait path
    → enqueue bounded recovery command
```

Go may maintain warm caches for efficiency, but restart SHALL be equivalent to cache loss, not control-plane loss.

### Initial Go Container topology

Until Cloudflare provides a certified autoscaling primitive that satisfies this spec, production SHALL explicitly configure the Go Container replica pool.

Conceptual topology:

```text
Queue Consumer Worker / Internal Control Worker
        │
        ├── cp-go-00
        ├── cp-go-01
        ├── cp-go-02
        └── ... cp-go-N
```

Requirements:

- replica count is an explicit versioned deployment setting;
- no replica has unique business authority;
- work is partitioned by durable shard key or routed to any healthy stateless replica;
- a failed/unavailable replica causes transport retry or alternate-replica routing;
- scale decisions are based on measured queue age, command latency, DB contention and CPU/memory pressure;
- increasing replica count MUST NOT increase effective provider capacity beyond durable reservation limits;
- decreasing replica count SHALL drain in-flight commands before shutdown where possible.

The design MUST NOT assume built-in Cloudflare Containers autoscaling exists unless current deployment-time documentation and runtime tests prove it.

### Initial production sizing policy

The first production-ready Control Plane pool SHALL be configured as:

```text
logical replicas: 2
instance type: basic
per replica: 0.25 vCPU / 1 GiB RAM / 4 GB disk
correctness model: stateless and restart-safe
```

The two-replica baseline is a **logical availability/canary baseline**, not a claim that two replicas are sufficient for all future traffic. Instances MAY sleep under Cloudflare lifecycle control; correctness SHALL NOT depend on both being simultaneously warm.

Scale-out or instance-size increase SHALL be triggered only after identifying the actual bottleneck. Candidate signals include:

- control-command p95 latency above its SLO for three consecutive measurement windows;
- oldest control-plane queue age above SLO while provider capacity remains available;
- sustained Go memory pressure above the configured safety threshold;
- sustained active CPU saturation;
- bounded worker pool saturation / rejected internal work;
- database wait/pool contention attributable to controller concurrency;
- reconciliation lag above its objective.

Before adding replicas, the system SHALL distinguish:

```text
CONTROL_PLANE_BOUND
DATABASE_BOUND
PROVIDER_CAPACITY_BOUND
RUNNER_BOUND
ARTIFACT_IO_BOUND
QUEUE_TRANSPORT_BOUND
```

Adding Go replicas while the real bottleneck is provider quota or PostgreSQL contention is prohibited because it can amplify rate-limit errors or lock contention.

Scale-in SHALL require:

- a sustained low-load window;
- no in-flight command owned exclusively by the retiring replica;
- queue age within SLO;
- no active incident/recovery surge.

Container replica-count and instance-type changes SHALL be versioned infrastructure configuration and shall be auditable.

## 3.9 Queue transport lease is never execution authority

Cloudflare Queue delivery ownership and SmartAIHub execution ownership are different concepts.

For pull consumers, a queue `lease_id` / visibility timeout is a **transport receipt lease only**. It SHALL NOT be used as the fencing token that authorizes provider calls, billing settlement, artifact finalization or durable job state transitions.

The canonical authority remains:

```text
worker_jobs
+ execution_attempt_id
+ PostgreSQL lease
+ lease_epoch / fencing epoch
```

A consumer receiving a Queue message SHALL:

1. read canonical state through the strict-fresh path;
2. acquire or validate the PostgreSQL execution lease;
3. confirm the expected routing/control-plane epoch;
4. only then perform a protected side effect.

The Queue message MAY already have been re-delivered while an older transport receipt is still acknowledged later. Therefore an accepted Queue acknowledgement is not proof that only one executor processed the logical job.

Queue acknowledgement SHALL occur only after the intended durable checkpoint is committed, subject to the workload-specific contract.

This rule is mandatory for both push and pull consumers and remains true if Cloudflare later changes visibility/ack semantics.

## 3.10 Consistency classes and authoritative time

All database reads used to make correctness-sensitive decisions SHALL use a **strict-fresh database path**.

`STRICT_FRESH` includes:

- job state;
- lease/fencing;
- idempotency;
- credits and settlement;
- provider capacity reservations;
- cancellation state;
- authorization/security decisions;
- outbox dispatch state;
- recovery ownership;
- reads immediately after writes.

Hyperdrive query caching SHALL be disabled for the binding/client used by `STRICT_FRESH` operations.

A separate cache-enabled Hyperdrive binding MAY serve bounded-stale analytical/UI reads that cannot change execution authority.

Correctness-sensitive lease expiry and due-time comparisons SHOULD use PostgreSQL time in the guarding transaction rather than trusting edge/container wall clocks.

Clock skew MUST be included in failure testing.

# 4. Target production architecture

```text
                         USERS / APPS
                              │
                              ▼
                    Cloudflare Workers
              Auth / Admission / API / Policy
                              │
                              ▼
                    PostgreSQL worker_jobs
                    SINGLE SOURCE OF TRUTH
                              │
                   Transactional Outbox
                              │
                              ▼
                    Cloudflare Queues
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
        Queue Consumer Worker       Recovery Trigger
                 │
                 ▼
      ┌──────────────────────────────┐
      │     GO CONTROL PLANE V2      │
      │                              │
      │ Scheduler                    │
      │ Provider Router              │
      │ Account Pool Manager         │
      │ Capacity / Rate Limit        │
      │ Lease / Dispatch             │
      │ Reconciler                   │
      │ Recovery Engine              │
      │ SLA Controller               │
      │ Capacity Forecaster          │
      └──────────────┬───────────────┘
                     │
       ┌─────────────┼──────────────┬───────────────┐
       ▼             ▼              ▼               ▼
 External AI      Rust Runner    CF Container   Workflow path
 Providers        PC / Mac       workloads      when selected
       │             │              │               │
       └─────────────┴──────────────┴───────────────┘
                              │
                              ▼
                             R2
                              │
                              ▼
                   durable finalization
                              │
                              ▼
                       PostgreSQL
```

No component may declare a job completed until the required durable completion contract has passed.

For media jobs this normally includes:

```text
provider success
AND artifact fetched
AND artifact validated
AND durable R2 object committed
AND worker_jobs finalized
```

---

# 5. Initial production topology — Control Plane first

The first production phase intentionally keeps PostgreSQL on the Linux server.

```text
                     CLOUDFLARE PRODUCTION
                     ─────────────────────
Users
  │
  ▼
Workers
  │
Queues
  │
Go Control Plane V2
  │
  └───────────────┐
                  │ private DB path
                  ▼
          Existing Linux PostgreSQL
          CANONICAL PRODUCTION DB
                  ▲
                  │
          Linux development/debug
```

Cloudflare SHALL connect to the private PostgreSQL database using a certified secure path such as:

```text
Worker
  ↓
Hyperdrive
  ↓
Workers VPC
  ↓
Cloudflare Tunnel
  ↓
Linux PostgreSQL
```

The production database port SHALL NOT be made publicly reachable merely to enable the Cloudflare migration.

This stage SHALL be completed before moving the main SmartAIHub application.

---

# 6. Final target topology

After the Control Plane and main application have migrated and soaked successfully:

```text
                         PRODUCTION
                  ┌────────────────────┐
                  │    Cloudflare      │
                  │ Workers            │
Users ───────────►│ Queues             │
                  │ Go Control Plane   │
                  │ R2 / KV / Vectorize│
                  │ Workflows / DO*    │
                  └─────────┬──────────┘
                            │
                            ▼
                    Managed PostgreSQL
                    SINGLE SOURCE OF TRUTH


                           DEV
                  ┌────────────────────┐
Developer ───────►│ Linux Dev Server   │
                  │ full source/debug  │
                  └─────────┬──────────┘
                            │
                  production-safe debug
                            │
                            ▼
                    SAME CANONICAL DB
```

`* Workflows / Durable Objects are activated only for job/session classes that pass their explicit workload gate; they are not mandatory wrappers around every job.`

Linux is no longer a production runtime host.

It becomes:

- development server;
- diagnostic workstation;
- read-only production investigation surface;
- controlled production-debug client.

## 6.1 Managed PostgreSQL production default and certification

The default final-production candidate SHALL be **PlanetScale Postgres High Availability**, using the provider's HA topology of:

```text
1 primary
2 replicas
3 availability zones
```

A single-node low-cost database MAY be used for development, ephemeral staging or low-risk test workloads, but SHALL NOT be the default canonical production database for SmartAIHub.

PlanetScale is a **default candidate, not an irreversible vendor lock**. Final production activation requires evidence for:

- region and latency acceptable from SmartAIHub's primary user geography and Cloudflare path;
- PostgreSQL version and required extensions;
- transaction, row-lock, `SKIP LOCKED`, isolation and connection semantics;
- Hyperdrive compatibility;
- connection limits and pool behavior under burst load;
- backup and PITR capability appropriate to the production tier;
- restore drill;
- operational observability;
- maintenance behavior;
- storage growth;
- encryption/TLS;
- support/escalation path;
- current price and forecasted 12-month cost.

If the default candidate fails a mandatory gate, another managed PostgreSQL service MAY be selected without changing the canonical database contract.

The application SHALL depend on standard PostgreSQL contracts and SmartAIHub repository abstractions, not provider-specific business semantics.

## 6.2 Database capacity policy

Database sizing SHALL be driven by measured workload, including:

```text
transactions/sec
p95/p99 transaction latency
active connections
Hyperdrive pool pressure
lock wait
deadlocks
IOPS/storage growth
worker_jobs active-set size
job_events write rate
reconciler query cost
admin/debug query cost
```

Production promotion SHALL include a connection-budget test covering Workers, Go Control Plane, migration/admin jobs and approved debugging.

Capacity expansion SHALL be triggered before sustained saturation. The exact provider tier is intentionally not hard-coded in this spec because prices and SKUs can change; the selected SKU and cost evidence SHALL be recorded in the deployment receipt.

---

# 7. Production-data debugging requirement

## 7.1 Why real production data remains accessible

SmartAIHub explicitly recognizes that many failures cannot be reproduced accurately using mock data, especially:

- orphan jobs;
- provider callback mismatches;
- account-specific rate limits;
- provider-side state;
- billing/settlement mismatches;
- artifact fetch failures;
- tenant-specific ACL behavior;
- long execution histories;
- concurrency races;
- legacy data shape problems.

Therefore production diagnostics SHALL retain controlled access to real production state.

## 7.2 Required database roles

At minimum:

```text
smartaihub_prod_app
control_plane_prod
dev_debug_readonly
migration_admin
```

`dev_debug_readonly` SHALL NOT:

- claim jobs;
- update credits;
- settle jobs;
- alter provider account state;
- delete jobs;
- modify production artifacts;
- consume production queues;
- acquire execution leases.

## 7.3 Controlled Production Debug Session

When a real-data bug requires a mutation, developers SHALL NOT switch the Linux dev server to unrestricted production write mode.

Use a time-bounded audited Production Debug Session:

```text
debug_session_id
operator
reason
tenant_scope
job_scope
allowed_operations
created_at
expires_at
approval_ref
trace_id
```

Example authorized operations:

```text
read full execution trace
refresh provider status
retry artifact fetch
invoke reconciler
replay an idempotent queue event
release an expired lease through canonical API
```

Every mutation SHALL record before/after state and actor identity.

## 7.4 Dev environment execution isolation

Even while reading the same production database:

```text
environment = dev
```

MUST NOT be able to:

- consume the production execution queue;
- claim a production lease;
- reserve production provider capacity;
- execute a paid production provider request;
- finalize production credits;
- notify production users.

This boundary SHALL be enforced server-side, not by UI convention.

---


## 7.5 Production-data protection and migration safety

Real production data access is operationally necessary, but unrestricted production visibility is not.

The Linux debug environment SHALL use:

- least-privilege database roles;
- tenant/job-scoped diagnostic APIs where practical;
- masking/redaction for secrets and sensitive fields;
- audited access;
- time-bounded elevation for exceptional investigations.

A read-only production role MUST NOT imply permission to reveal raw provider credentials, encryption keys, private auth tokens or unrelated tenant data.

The Linux development process SHALL NEVER auto-run application schema migrations against production on startup.

Production schema changes SHALL be executed only by the dedicated migration authority described in this spec.

# 8. Canonical job lifecycle

The new job model SHALL expose more detail than:

```text
queued / running / completed / failed
```

Minimum lifecycle vocabulary:

```text
CREATED
ADMISSION_ACCEPTED
WAITING_CAPACITY
QUEUED
CLAIMED
DISPATCHING
EXECUTOR_ACCEPTED
PROVIDER_ACCEPTED
PROVIDER_RUNNING
PROVIDER_SUCCEEDED
ARTIFACT_FETCHING
ARTIFACT_VALIDATING
ARTIFACT_STORED
FINALIZING
COMPLETED
```

Recovery/control states:

```text
WAITING_RATE_LIMIT
RETRY_SCHEDULED
RECOVERY_REQUIRED
RECONCILING
PAUSED_POLICY
CANCEL_REQUESTED
CANCELLED
FAILED_TERMINAL
```

Not all job classes require all states.

A state transition SHALL append a durable `worker_job_events` event.

Every external side effect SHALL be traceable to:

```text
job_id
attempt_id
lease_epoch
command_id / idempotency_key
provider
provider_account_id
provider_request_id
external_job_id where available
runner/executor identity
trace_id
```

---


## 8.1 Acceptance is a durable contract

The API SHALL distinguish:

```text
REQUEST_RECEIVED
        ↓
ADMISSION_EVALUATING
        ↓
ACCEPTED
or
DEFERRED_BEFORE_ACCEPT
or
REJECTED_BEFORE_ACCEPT
```

`ACCEPTED` means:

- the canonical job record exists durably;
- tenant/auth/budget policy passed;
- the system has an explicit execution/recovery policy for that job class;
- the job is now subject to the “never silently disappear” invariant.

Admission MUST consider capacity risk. The system SHALL NOT accept unbounded work merely because a Queue can buffer it.

When predicted capacity cannot meet the configured maximum acceptable wait, the API SHALL either:

- defer before acceptance;
- reject before acceptance with an explicit capacity reason;
- accept into a product-defined wait state only when the user contract permits that wait.

An accepted job is not guaranteed to succeed when an external provider permanently fails, but it IS guaranteed to converge to a visible terminal or authorized paused state. Indefinite silent limbo is prohibited.

## 8.2 Cancellation is durable intent

Cancellation SHALL be modeled explicitly.

Minimum rules:

1. `CANCEL_REQUESTED` is written durably before cancellation side effects.
2. If the provider supports cancellation, call it idempotently and persist the provider result.
3. If the provider cannot cancel, preserve the external job reference and decide whether to:
   - ignore/discard the eventual output;
   - retain it for audit/recovery;
   - expose it only if product policy permits.
4. A stale executor cannot finalize a cancelled job after a newer cancellation/fencing decision.
5. Billing/refund policy SHALL distinguish work that never started, provider work already incurred, and artifact-only post-processing.
6. Cancellation SHALL not delete the flight recorder.


## 8.3 Immutable execution intent

An accepted job SHALL have an immutable execution-intent snapshot or content-addressed reference sufficient to reproduce what the system intended to execute.

The snapshot/reference SHALL cover the execution-significant inputs appropriate to the job class, for example:

```text
input/prompt reference + hash
model/capability request
generation parameters
source asset versions
provider-routing constraints
tenant policy version
pricing/budget policy version
skill/workflow version
```

Automatic retry of the same logical external effect MUST NOT silently pick up mutable UI settings or a newly edited prompt.

A deliberate reroute/model substitution SHALL be recorded as a new execution decision/event and MUST comply with product/user policy.

Input payloads too large or sensitive for PostgreSQL SHALL be stored in R2 or another canonical store with immutable version/hash references.

# 9. Job flight recorder

Every accepted production job SHALL have an inspectable timeline.

Example:

```text
14:01:01 JOB_ACCEPTED
14:01:01 OUTBOX_CREATED
14:01:02 QUEUE_PUBLISHED
14:01:03 CLAIMED
14:01:03 CAPACITY_RESERVED
14:01:03 PROVIDER_ACCOUNT_SELECTED
14:01:04 PROVIDER_REQUEST_SENT
14:01:04 PROVIDER_ACCEPTED
14:04:51 PROVIDER_SUCCEEDED
14:04:52 ARTIFACT_FETCH_STARTED
14:04:53 ARTIFACT_FETCH_FAILED
14:04:58 RETRY_SCHEDULED
14:05:03 ARTIFACT_FETCHED
14:05:04 ARTIFACT_VALIDATED
14:05:05 R2_STORED
14:05:05 SETTLEMENT_COMMITTED
14:05:06 COMPLETED
```

The system SHALL answer for any non-terminal job:

1. Where is it?
2. Who owns it?
3. What is it waiting for?
4. What external provider/account is involved?
5. What was the last successful durable step?
6. What was the last failure?
7. What recovery is scheduled?
8. When is the next recovery attempt?
9. Is user action required?
10. Is the original requested work still expected to complete?

`UNKNOWN` is not an acceptable long-lived production state.

---

# 10. Transactional outbox requirement

The system SHALL NOT rely on:

```text
INSERT worker_jobs
then
queue.send()
```

as two unrelated operations.

Required pattern:

```text
BEGIN

INSERT / UPDATE worker_jobs
INSERT outbox_event

COMMIT
```

Then:

```text
Outbox Publisher
    ↓
Cloudflare Queue
    ↓
durable publish receipt / retry-safe reconciliation
```

If the publisher dies after sending but before marking the outbox record, duplicate publish is acceptable because consumption is idempotent.

The system MUST prefer duplicate-safe delivery over silent loss.

---


## 10.1 Queue delivery is a bounded transport phase

A Queue consumer SHALL NOT hold one delivery open for the entire lifetime of a long-running provider generation.

Preferred pattern:

```text
Queue receives dispatch command
    ↓
claim/fence job
    ↓
perform bounded provider submission
    ↓
persist provider acceptance/external_job_id
    ↓
commit durable state
    ↓
ACK queue message
    ↓
provider execution continues independently
    ↓
callback/status reconciliation drives later phases
```

If provider submission cannot complete safely within the bounded consumer phase, it SHALL transition to a recoverable state rather than relying on a consumer invocation to remain alive.

## 10.2 Queue/DLQ are not long-term recovery storage

Cloudflare Queue retention, retry and DLQ retention are platform-bounded. Therefore the durable recovery backlog SHALL exist in PostgreSQL.

Required durable recovery fields/tables SHALL support:

```text
job_id
recovery_action
reason_class
attempt_count
next_recovery_at
last_error
quarantined_at
operator_action_required
```

A DLQ consumer SHALL ingest/associate DLQ evidence with the canonical job/recovery ledger.

No correctness-critical job may become unrecoverable merely because a Queue or DLQ retention window expired.

Long-delay retries MUST NOT depend on Queue delay beyond the currently supported platform limit. Use:

- `next_recovery_at` + indexed due sweep; or
- Cloudflare Workflows for a certified workflow-specific wait.

# 11. Queue topology

Do not place every workload in one undifferentiated physical queue.

Initial logical queue families SHOULD include:

```text
interactive
media.image
media.video
media.audio
llm.async
artifact.fetch
artifact.process
external.agent
notification
recovery
```

Every production queue SHALL have:

- explicit retry policy;
- DLQ;
- max attempt policy;
- poison-message handling;
- backlog metrics;
- oldest-message alert;
- consumer concurrency policy;
- job-class SLO;
- replay/quarantine procedure.

Physical queues MAY be consolidated or sharded after measured load, but logical isolation SHALL remain.

Large/slow video workloads MUST NOT starve interactive or artifact-recovery workloads.

---


## 11.1 Delayed work and schedules

User schedules, recurring jobs and long-delay retries SHALL NOT be represented as thousands of per-user Cloudflare Cron expressions.

The canonical schedule authority SHALL remain durable application state, with fields such as:

```text
schedule_id
tenant_id
job_template_ref
next_due_at
timezone
recurrence_rule
misfire_policy
enabled
last_fired_at
schedule_epoch
```

A small bounded set of platform scheduler ticks MAY wake the due-work scanner.

The due scanner SHALL:

- query an index on `next_due_at`;
- claim due schedules with fencing / `SKIP LOCKED`;
- materialize canonical `worker_jobs`;
- advance `next_due_at` transactionally;
- be idempotent across duplicate ticks;
- support timezone/DST rules explicitly;
- define misfire behavior after outages.

Workflows MAY own a per-run sleep/wait after a job has been materialized, but SHALL NOT become a hidden second schedule registry.

## 11.2 Retry jitter and thundering-herd control

Retry and recovery schedules SHALL use bounded exponential/appropriate backoff with jitter.

After provider or infrastructure recovery, the system MUST avoid releasing every waiting job simultaneously.

Recovery waves SHALL respect:

- provider capacity;
- tenant fairness;
- maximum concurrency;
- queue age;
- retry budget;
- cost/budget policy.


## 11.3 Queue-to-Control-Plane concurrency coupling

Queue consumer concurrency SHALL be bounded by the downstream Go Container pool, PostgreSQL contention envelope and provider-admission throughput.

The Queue consumer MUST NOT autoscale dispatch into a saturated control-plane pool without a backpressure policy.

When downstream control capacity is temporarily unavailable:

```text
do not ACK as success
→ retry with bounded delay/jitter
→ preserve canonical job state
```

`max_concurrency`, batch size and retry delay SHALL be load-tested and versioned per queue family.

The system SHALL distinguish:

```text
QUEUE_BACKLOG
CONTROL_PLANE_SATURATION
DATABASE_SATURATION
PROVIDER_CAPACITY_EXHAUSTION
```

because each requires a different scaling/recovery response.


## 11.4 Queue sharding, routing epochs and rebalance

A single logical job family MAY use multiple physical queues when measured throughput, blast radius, workload latency or operational isolation requires it.

Sharding SHALL be versioned:

```text
queue_family
queue_shard
queue_routing_version
```

Routing MAY use stable hashing by tenant/job class or explicit capacity partitions, but business correctness SHALL NOT depend on Cloudflare Queue message order.

A shard-count change SHALL use an explicit rebalance procedure:

1. publish a new routing version;
2. route new jobs to the new shard map;
3. continue consuming the old shard map;
4. preserve canonical `job_id` and execution fencing across both;
5. drain/reconcile old shards;
6. prove zero undiscovered backlog before retirement.

The system MUST NOT move an already accepted provider-side external effect merely because its queue shard changes.

Shard expansion triggers SHOULD include:

- sustained backlog-age SLO breach;
- per-queue throughput approaching a configured safety threshold;
- one workload class starving another;
- excessive blast radius from poison/retry storms;
- consumer-concurrency saturation while downstream capacity is demonstrably available.

Queue sharding SHALL NOT be used to hide provider-capacity exhaustion.

## 11.5 Queue transport credentials and consumer authentication

If an HTTP pull consumer is used outside Workers, its Cloudflare Queue token SHALL:

- be scoped to the minimum Cloudflare account;
- have only required Queue permissions;
- be stored in the approved secret authority;
- be rotated with N/N-1 overlap where feasible;
- never be embedded in desktop/mobile clients;
- never be written into `worker_job_events`;
- be independently revocable from provider/API credentials.

SmartAIHub desktop/local Runners SHOULD normally receive work through SmartAIHub-authenticated control channels rather than being given raw Cloudflare Queue API credentials.


# 12. Go Control Plane V2

## 12.1 Repository boundary

Recommended location:

```text
services/control-plane-go/
  cmd/
    control-plane/
  internal/
    admission/
    scheduler/
    fairness/
    dispatcher/
    lease/
    reconciler/
    recovery/
    provider/
    providerpool/
    capacity/
    ratelimit/
    artifact/
    runner/
    sla/
    forecast/
    telemetry/
  pkg/
    contracts/
```

A language-neutral contract package SHOULD be maintained separately where required:

```text
packages/execution-contracts/
  json-schema/
  openapi/
  protobuf/
```

## 12.2 Stateless controller rule

The Go Control Plane SHALL be restart-safe.

It SHALL NOT depend on process memory for correctness.

Process memory MAY cache:

- recently observed capacity;
- routing hints;
- metrics;
- provider metadata.

But all correctness-critical state SHALL be reconstructable from durable state.

## 12.3 Controller model

The control plane SHOULD behave as a reconciler/controller:

```text
Observed State
  ├── worker_jobs
  ├── job events
  ├── queue backlog
  ├── provider capacity
  ├── provider responses
  ├── runner health
  ├── artifacts
  └── leases
          │
          ▼
    Go Reconciler
          │
          ▼
Desired Action
  ├── dispatch
  ├── wait
  ├── retry
  ├── reroute
  ├── recover
  ├── quarantine
  ├── finalize
  └── escalate
```

Restarting the controller SHALL trigger reconciliation, not job loss.

---


## 12.4 Leaderless/sharded control loops

The normal design SHALL avoid a permanent global leader.

Outbox publishing, due scheduling and reconciliation SHALL scale horizontally using durable sharding and database claim semantics.

Example:

```text
reconcile_shard = hash(job_id) % SHARD_COUNT
```

or an equivalent stable partition key.

Each sweep processes bounded batches using the equivalent of:

```sql
SELECT ...
FROM worker_jobs
WHERE next_reconcile_at <= $now
  AND reconcile_shard = $shard
ORDER BY next_reconcile_at
FOR UPDATE SKIP LOCKED
LIMIT $batch;
```

The exact SQL is implementation-specific, but full-table polling is prohibited in steady state.

Every sweep SHALL have:

- bounded batch size;
- bounded execution time;
- continuation cursor/due time;
- metrics;
- retry with jitter;
- no singleton dependency.

## 12.5 Reconciler trigger model

Periodic reconciliation SHALL be triggered by a durable Cloudflare Worker scheduling mechanism that enqueues shard commands.

The Go Container SHALL process bounded commands.

Do not implement correctness as:

```go
for {
    scanEverything()
    time.Sleep(...)
}
```

inside a Container.

A warm loop MAY optimize latency only if losing that loop changes no durable semantics.

## 12.6 Versioned execution protocol

All cross-runtime messages SHALL carry a protocol/contract version.

At minimum:

```text
contract_version
job_schema_version
command_type
command_id
producer_version
```

Workers, Go Control Plane, Rust Runner and other executors SHALL support an explicitly documented compatibility window, normally current (`N`) and previous (`N-1`) versions during rollout.

Unknown newer contract versions SHALL fail closed or route to a compatible executor; they SHALL NOT be guessed.

Capability negotiation SHALL be used where runner/provider features vary.


## 12.7 Go runtime engineering constraints

Because the Go service is a critical control component, implementation SHALL enforce:

- pinned supported Go toolchain version in CI;
- `context.Context` propagation for bounded operations;
- explicit network/provider/DB timeouts;
- no unbounded goroutine creation;
- bounded worker pools/channels;
- goroutine-leak checks on critical paths;
- race-detector coverage for concurrency-sensitive packages where feasible;
- fuzz/property tests for state-transition and provider-response parsers where valuable;
- controlled memory/cache bounds;
- no correctness dependence on `init()` side effects;
- graceful command drain on container shutdown;
- structured error classes rather than string matching for control decisions.

CGO SHOULD remain disabled for the core control-plane binary unless a reviewed dependency genuinely requires it.

Diagnostic endpoints such as `pprof` MUST NOT be publicly exposed in production.

# 13. Provider Account Pool

## 13.1 Objective

SmartAIHub SHALL support provider capacity as a first-class resource.

The scheduler SHALL not assume:

```text
provider = one API key
```

It SHALL support:

```text
Provider
  ├── organization/project/account A
  ├── organization/project/account B
  ├── organization/project/account C
  └── alternate certified provider
```

Only provider-approved and contractually permitted accounts/projects/keys may be pooled.

The system SHALL NOT create or rotate extra accounts merely to evade provider contractual rate limits or Terms of Service.

When capacity is insufficient, recommendation priority is:

1. request/upgrade official quota or capacity;
2. add an approved project/account/key where provider policy permits;
3. add certified capacity from another region/account class where permitted;
4. route compatible workload to another approved provider;
5. throttle/admit work according to policy.

## 13.2 Provider account data

Required logical fields include:

```text
provider
provider_account_id
credential_ref
enabled
health_state

rpm_limit
rpm_observed
tpm_limit
tpm_observed

concurrency_limit
concurrency_reserved
concurrency_observed

daily_quota
daily_usage
monthly_budget
monthly_usage

rate_limit_reset_at
last_429_at
rolling_429_rate

rolling_error_rate
average_latency
p95_latency

active_jobs
last_success_at
last_error_at

region
capabilities
model_scope
tenant_scope
cost_profile
```

Secrets SHALL remain in the approved secret system, not plaintext in these records.

---


## 13.3 Provider adapter capacity contract

Every provider adapter used by the capacity-aware scheduler SHALL expose a normalized observation contract, even if some fields are `UNKNOWN`.

Conceptual contract:

```text
ProviderCapability
ProviderAccountHealth
RateLimitSnapshot
QuotaWindow
ConcurrencyObservation
ReservationResult
SubmitResult
StatusResult
CancelResult
ArtifactResult
```

The adapter SHALL distinguish:

```text
SUPPORTED
UNSUPPORTED
UNKNOWN
```

for rate-limit dimensions rather than inventing values.

Observed provider headers and documented quotas override static configuration where safely applicable.

## 13.4 Circuit breaker and draining

Provider accounts SHALL support:

```text
HEALTHY
WATCH
RATE_LIMITED
DEGRADED
OPEN_CIRCUIT
DRAINING
DISABLED
```

Repeated provider 5xx/network failures or a severe 429 pattern SHOULD open a circuit according to configurable policy.

`OPEN_CIRCUIT` prevents new assignments but preserves status/recovery checks required for jobs already accepted by that provider.

Credential rotation or account maintenance SHALL use `DRAINING` before disabling where possible.

Rotation MUST NOT strand existing `external_job_id` ownership.


## 13.5 Provider account governance and lifecycle

Every provider account/project/key in the production pool SHALL have governance metadata in addition to runtime capacity data.

Required logical governance fields include:

```text
provider_account_id
business_owner
technical_owner
credential_ref
credential_version
contract_or_plan_ref
terms_reviewed_at
allowed_capabilities
allowed_models
allowed_regions
data_residency_class
tenant_allowlist_or_scope
monthly_budget
hard_spend_guard_if_supported
rotation_due_at
created_at
retired_at
```

Lifecycle SHALL support at least:

```text
PROVISIONING
ACTIVE
WATCH
DRAINING
SUSPENDED
REVOKED
RETIRED
```

Rules:

- adding a new provider account requires explicit ownership and policy classification;
- pooled accounts SHALL comply with the provider's terms and shall not be created to evade contractual limits;
- credential rotation SHALL preserve access needed to reconcile already-running external jobs;
- a revoked credential SHALL immediately block new assignment;
- retirement SHALL wait until no active job requires that account for status/artifact recovery, or an alternative recovery path is proven;
- tenant-specific provider credentials SHALL never be silently pooled for other tenants;
- region/data-residency restrictions SHALL participate in scheduling policy.

The Account Pool admin UI SHALL expose capacity and health without revealing raw credentials.

## 13.6 Capacity-observation confidence

Provider quota/capacity observations SHALL carry a confidence/source class:

```text
PROVIDER_HEADER
PROVIDER_API
PROVIDER_DOCUMENTED_STATIC
CONFIGURED_ESTIMATE
INFERRED_FROM_TRAFFIC
UNKNOWN
```

Scheduler policy SHALL prefer direct provider evidence over inferred estimates.

A low-confidence capacity estimate MUST NOT be represented to operators as an exact provider quota.


# 14. Capacity-aware scheduling

A scheduling decision SHALL consider at least:

```text
job capability
job priority
tenant fairness
tenant quota
provider capability
provider account health
provider rate limit
provider concurrency
estimated cost
current account utilization
queue waiting age
provider latency
provider error rate
job locality / runner availability
policy constraints
```

A simple “round robin API key” implementation is insufficient.

## 14.1 Capacity reservation

Before dispatching a rate-limited paid action, the system SHALL acquire a capacity reservation.

A durable or transactionally guarded reservation must prevent two controller replicas from independently spending the same remaining capacity.

Durable Objects MAY accelerate hot coordination, but durable correctness SHALL remain reconstructable and reconcilable from PostgreSQL/provider evidence.

## 14.2 Rate limit handling

On provider `429` or equivalent:

1. persist the event;
2. parse provider reset/quota headers when available;
3. update account health/capacity observation;
4. release or adjust reservation safely;
5. evaluate another permitted account/provider;
6. otherwise transition to `WAITING_RATE_LIMIT`;
7. schedule a durable retry;
8. preserve the original logical job and external references.

Do not classify a rate limit as an unexplained generic job failure.

---


## 14.3 Backpressure and load shedding

The system SHALL treat Queue depth as a symptom, not infinite capacity.

Admission policy MUST monitor:

- arrival rate;
- completion rate;
- oldest accepted job age;
- provider capacity;
- database contention;
- recovery backlog;
- tenant budget;
- job-class SLO.

When the system cannot responsibly accept additional work, it SHALL apply explicit backpressure before silent degradation.

Possible actions:

```text
defer low-priority batch work
reduce burst allowance
reject new noncritical work before acceptance
reserve capacity for recovery/already-accepted work
route to certified alternate provider
surface longer wait estimates
```

Already-accepted recovery/finalization work SHOULD receive protection over speculative new work.

## 14.4 Capacity reservation lifetime and reconciliation

Every capacity reservation SHALL have:

```text
reservation_id
job_id
provider_account_id
dimension
amount
created_at
expires_at
state
lease_epoch
```

Reservations MUST expire or reconcile if a dispatcher dies.

On successful provider acceptance, reservation state SHALL transition to the appropriate observed/in-flight accounting state.

A periodic capacity reconciler SHALL compare local reservations with provider observations when the provider exposes suitable usage/quota data.

No process-local token bucket may be the sole authority for paid shared provider capacity.

# 15. Capacity forecasting and expansion recommendations

The system SHALL answer:

> “Do we need more provider capacity?”

Inputs include:

- queue arrival rate;
- queue backlog;
- oldest job age;
- observed provider throughput;
- successful completion rate;
- p95/p99 provider latency;
- current account utilization;
- 429 rate;
- quota-reset windows;
- tenant growth;
- time-of-day peaks;
- failure/retry amplification;
- approved budget.

Initial configurable health bands MAY use:

```text
< 60%    HEALTHY
60–75%   WATCH
75–85%   WARNING
85–95%   EXPANSION_REQUIRED
> 95%    CRITICAL
```

These bands SHALL NOT be used alone.

For example:

```text
utilization = 65%
429 rate = 8%
```

must still trigger risk.

The admin surface SHALL be able to produce a recommendation such as:

```text
Provider X / Image Generation

Current sustainable capacity:  420 jobs/min
Observed peak demand:          355 jobs/min
Projected 7-day peak:          480 jobs/min
429 rate:                      2.7%
Oldest queue age:              42s

Status: EXPANSION_REQUIRED

Recommended action:
- request +25% official quota, or
- add one approved account/project, or
- shift 15% compatible workload to Provider Y.
```

The system SHALL distinguish recommendation from automatic account creation.

---

# 16. Multi-tenant fairness

At thousands or tens of thousands of simultaneous users, one tenant must not monopolize shared provider capacity.

The scheduler SHALL support:

- priority classes;
- tenant weights;
- per-tenant concurrency;
- burst allowance;
- reserved enterprise capacity where configured;
- starvation prevention;
- aging of waiting jobs;
- budget guards.

A recommended model is weighted fair scheduling with bounded priority override.

Recovery jobs needed to finish already-paid/accepted work SHOULD receive higher protection than low-priority new batch work.

---

# 17. Reconciler and Recovery Engine

This is a P0 component.

The Reconciler SHALL continuously inspect non-terminal jobs.

Examples:

```text
RUNNING but runner heartbeat expired
PROVIDER_RUNNING but callback absent
PROVIDER_SUCCEEDED but R2 artifact absent
ARTIFACT_FETCHING but worker disappeared
QUEUED but no valid transport receipt
CLAIMED but lease expired
FINALIZING but settlement incomplete
```

For each condition, it SHALL produce a deterministic recovery action or escalation.

## 17.1 Provider completed, artifact missing

```text
provider = SUCCESS
R2 artifact = MISSING
```

Action:

```text
RECOVERY_REQUIRED
→ enqueue artifact.fetch
```

Do NOT regenerate the paid media unless the provider output is genuinely unrecoverable and policy authorizes regeneration.

## 17.2 Runner died

```text
heartbeat expired
lease expired
```

Action:

```text
fence old executor
→ increment lease epoch
→ recover from last durable step
→ dispatch to a new executor
```

The stale executor MUST NOT be allowed to commit after a newer lease epoch exists.

## 17.3 Queue uncertainty

If an outbox event may have been published but publish receipt is uncertain:

```text
republish safely
```

Deduplication is required downstream.

## 17.4 Provider unknown state

When request transmission succeeded locally but provider acceptance is uncertain:

- check provider using idempotency/request ID;
- search provider job status when API permits;
- do not blindly submit a second paid generation;
- escalate to `AMBIGUOUS_EXTERNAL_EFFECT` if safe determination is impossible;
- require explicit recovery policy.

---


## 17.5 Provider callback/webhook correctness

A provider callback is evidence, not automatically authority.

Callback endpoints SHALL:

- authenticate/verify provider signatures when supported;
- use provider-specific replay protection where supported;
- persist a unique provider event ID or deterministic dedup key;
- map the event to canonical `job_id` / `external_job_id`;
- reject cross-tenant/job mismatches;
- tolerate duplicate callbacks;
- tolerate out-of-order callbacks;
- apply guarded state transitions;
- record raw evidence safely with secrets removed.

If a provider offers no trustworthy callback authentication, the callback SHALL trigger an authenticated provider status query before a durable success/financial state change when feasible.

No unauthenticated callback alone may settle credits or finalize a high-value external effect.

### Callback cryptographic and replay requirements

When the provider supports signed webhooks, verification SHALL be performed against the **raw request body** before any transformation that could change the signed bytes.

The callback ingress SHOULD persist or derive:

```text
provider_event_id
signature_key_version
received_at
provider_timestamp
body_hash
replay_window_result
job_id
external_job_id
```

Required controls where supported:

- timestamp freshness window;
- constant-time signature comparison through vetted libraries;
- unique event ID/dedup constraint;
- body-size limit;
- content-type validation;
- replay rejection;
- callback secret/key rotation with an explicit overlap window;
- rate limiting and abuse detection;
- rejection of a provider/account identity that does not match the job's durable provider ownership.

Raw callback evidence, if retained, SHALL be encrypted/redacted according to data-retention policy and SHALL NOT expose provider secrets in admin surfaces.

## 17.6 Retry classification and recovery budget

Failures SHALL be classified before retry:

```text
TRANSIENT
RATE_LIMIT
PERMANENT_INPUT
PERMANENT_PROVIDER
AMBIGUOUS_EXTERNAL_EFFECT
ARTIFACT_ONLY
POLICY_BLOCKED
```

Each job phase SHALL have an explicit retry/recovery budget.

Infinite automatic retries are prohibited.

Exhausting an automatic retry budget SHALL transition to:

- a different certified recovery strategy;
- provider reroute when safe;
- `OPERATOR_ACTION_REQUIRED`; or
- `FAILED_TERMINAL`.

`OPERATOR_ACTION_REQUIRED` and terminal failure SHALL be visible in the user/admin status surfaces according to product policy; they may not be hidden as a generic “running” state.

## 17.7 Indexed reconciliation

Steady-state reconciliation MUST use indexed due fields such as:

```text
next_reconcile_at
next_recovery_at
lease_expires_at
provider_next_poll_at
```

and partition/shard keys.

The implementation SHALL provide query-plan evidence for high-volume reconciliation queries and prevent unbounded sequential scans of the full production job table.

## 17.8 Recovery convergence for providers with incomplete status APIs

Every provider adapter SHALL declare whether it can:

```text
lookup_by_external_job_id
lookup_by_idempotency_key
poll_status
refresh_artifact_url
cancel
verify_final_result
```

If a provider cannot answer enough questions to prove whether an ambiguous paid side effect occurred, SmartAIHub SHALL NOT guess.

Such a job transitions to:

```text
AMBIGUOUS_EXTERNAL_EFFECT
→ OPERATOR_ACTION_REQUIRED
```

or another explicitly governed state.

## 17.9 Dependency-cycle recovery

The canonical job control plane SHALL inspect no more than 128 unresolved dependency nodes during a claim-time cycle check. It SHALL fail the claim root with reason `dependency_cycle`, request operator review, and emit one idempotent `FAILED` event only when that bounded scan proves a dependency cycle. If the scan reaches its budget without proof, or otherwise cannot establish a cycle, the job SHALL remain queued or waiting; independent claimable jobs MUST remain eligible to proceed.

## 17.10 Bounded capability-aware claim scanning

The authenticated worker claim path SHALL inspect claimable jobs in deterministic keyset pages of at most 10 candidates, ordered by priority descending, creation time ascending, and job ID ascending. It SHALL apply the existing tenant/team/sharing, runtime, capability, affinity, health, and policy checks to each candidate before deciding that no job is claimable. A failed capability or policy match MUST NOT mutate or lease that job. The claim path MAY inspect at most 100 candidates per poll; after that bound it MUST return without dispatching an incompatible job, while leaving all unclaimed jobs eligible for another authorized worker. A successful dispatch MUST still use the existing conditional claim/lease fencing so concurrent workers cannot execute the same job.

When the bounded scan finds no compatible candidate, the worker MAY continue polling under the existing policy, but the control plane MUST preserve the queued jobs and MUST NOT interpret aggregate free capacity as proof that a specific worker can execute them. Runtime-family capability mapping remains owned by Feature 077; authenticated claim eligibility and durable job state remain in this control plane.

Provider integrations that lack sufficient recovery observability MAY be restricted to lower-risk job classes until a compensating control is certified.

# 18. Artifact reliability

For media jobs, provider completion is not equivalent to SmartAIHub completion.

Artifact state SHALL be tracked separately:

```text
EXPECTED
FETCHING
FETCHED
VALIDATING
STORING
STORED
FAILED_RECOVERABLE
FAILED_TERMINAL
```

A completed artifact SHOULD include:

```text
r2_key
content_type
size
checksum
provider_source_ref
created_at
verified_at
```

Where practical, artifact writes SHALL use temporary/staging object keys and durable finalization.

If a provider returns an expiring download URL or temporary artifact token, persist the expiry/refresh metadata needed for recovery, for example:

```text
provider_artifact_ref
source_url_expires_at
refresh_supported
last_refresh_at
```

Artifact recovery SHALL prioritize outputs whose provider-side retrieval window is close to expiry.

Reconciliation SHALL detect:

```text
provider says complete
but artifact not in R2
```

as a recoverable incomplete job.

---

# 19. Runner presence and health

Runner health SHALL include:

```text
runner_id
runtime_type
capabilities
version
online_state
last_heartbeat
current_jobs
available_slots
resource_pressure
draining
quarantined
```

Durable Objects/WebSockets MAY provide low-latency presence.

PostgreSQL SHALL retain the durable facts needed to reconstruct execution ownership.

Runner disappearance SHALL not rely solely on WebSocket close detection.

Lease expiry remains authoritative for takeover.

---

# 20. Observability and admin control surface

The production admin UI SHALL expose:

## System Execution Health

```text
Accepted
Queued
Waiting capacity
Running
Waiting provider
Artifact recovery
Reconciliation
Failed terminal
```

## Queue Health

Per queue:

```text
backlog
oldest message age
consume rate
retry rate
DLQ rate
consumer concurrency
```

## Provider Health

```text
provider
accounts healthy
accounts degraded
capacity utilization
429 rate
error rate
latency
active jobs
forecasted exhaustion
```

## Job Inspector

Search by:

- job ID;
- user;
- tenant;
- provider job ID;
- provider account;
- trace ID;
- artifact key;
- runner;
- time range.

The inspector SHALL show the complete flight recorder.

## Recovery controls

Admin actions MUST be audited:

```text
reconcile now
retry safe step
retry artifact fetch
quarantine job
release expired lease
reroute waiting job
mark provider account draining
disable provider account
replay DLQ item
```

---


## 20.1 End-to-end tracing

`trace_id` SHALL propagate across:

```text
Edge Worker
→ outbox
→ Queue message
→ Go command
→ Runner / Workflow
→ provider request
→ callback/status poll
→ artifact fetch
→ R2 write
→ settlement/finalization
```

Structured logs SHALL also carry:

```text
job_id
attempt_id
lease_epoch
tenant_id (safe identifier)
provider_account_id
external_job_id where safe
deployment_version
contract_version
```

Audit/job events SHALL not be discarded merely because telemetry sampling is enabled.

## 20.2 Alerting and runbooks

Every P0/P1 failure class SHALL have an owner, alert and operational runbook.

Minimum alerts include:

- accepted-job age beyond SLO;
- unexplained non-terminal job;
- reconciliation backlog growth;
- outbox age;
- Queue oldest-message age;
- DLQ arrival;
- provider 429/error spike;
- provider account capacity exhaustion;
- artifact recovery backlog;
- stale leases;
- DB/Tunnel connectivity loss;
- settlement inconsistency;
- control-plane version error regression.

An alert that has no actionable runbook SHALL be treated as incomplete production readiness.


## 20.3 Operational incident model

Production incidents SHALL be first-class auditable objects, not only chat messages or log notes.

Minimum incident fields:

```text
incident_id
severity
status
started_at
detected_at
acknowledged_at
resolved_at
owner
affected_job_families
affected_tenants_if_known
affected_providers
routing_epoch
deployment_version
runbook_ref
timeline_ref
postmortem_ref
```

At minimum define severity classes for:

```text
SEV1  systemic customer-impacting correctness/data/financial risk
SEV2  major degradation or material queue/provider outage
SEV3  bounded degradation with workaround
SEV4  low-impact operational issue
```

An incident MAY activate controlled actions such as:

- pause new paid external effects globally or by job family;
- drain a provider account;
- stop new assignments to a runtime;
- freeze a rollout;
- force strict admission control;
- route to a certified fallback;
- increase reconciliation frequency within safe DB limits.

All emergency actions SHALL be auditable and reversible.

A post-incident review is required for SEV1/SEV2 and SHOULD result in a test, invariant, runbook or monitoring improvement rather than only narrative documentation.


# 21. SLO and invariant requirements

The exact numeric business SLOs remain configurable, but the implementation MUST satisfy these invariants:

1. **No accepted job silently disappears.**
2. Every non-terminal job has an explicit state and reason.
3. Every active job has a determinable owner or a recovery path.
4. Queue redelivery does not duplicate durable external effects when the provider supports idempotency or when SmartAIHub can guard the effect.
5. A stale lease owner cannot settle after a newer fencing epoch exists.
6. Provider completion without artifact persistence is not reported as final completion.
7. A controller restart does not require human reconstruction of job state.
8. Unknown/untraceable job count must converge to zero.
9. DLQ items are visible, searchable and replayable/quarantinable under policy.
10. Capacity exhaustion becomes visible before it becomes mass silent failure whenever metrics permit prediction.

---


## 21.1 SLO classes and terminality budget

Each job class SHALL define:

```text
admission SLO
queue-wait SLO
provider-wait SLO
recovery SLO
terminality SLO
```

`terminality SLO` means the maximum time an accepted job may remain without either:

- successful completion;
- explicit authorized pause with reason;
- explicit terminal failure/cancellation.

The control plane SHALL page on terminality-SLO breaches even if Queue and provider metrics appear healthy.

SLO breach does not authorize unsafe duplicate provider execution.

## 21.2 Error budgets and burn-rate protection

For each production job class, define:

```text
availability / acceptance SLO
terminality SLO
queue-wait SLO
execution-latency SLO where meaningful
artifact-finalization SLO
recovery SLO
```

The platform SHALL calculate rolling error-budget consumption and distinguish at least:

```text
FAST_BURN
SLOW_BURN
WITHIN_BUDGET
```

A fast burn SHOULD automatically block risky rollout promotion and MAY trigger stricter admission or provider rerouting.

SLO metrics SHALL use canonical job/event state rather than sampled application logs as the only source.

# 22. Build architecture — production SHALL NOT build source

The historical production problem:

```text
change code
→ rebuild large system
→ high RAM usage
→ build OOM/fail
→ users wait
→ rebuild again
```

shall be removed by architecture.

## 22.1 Independent build boundary

The Go Control Plane SHALL build independently from:

- frontend;
- main SmartAIHub Node application;
- Media Studio;
- Rust Runner;
- unrelated Python packages.

A change to the Go scheduler SHALL NOT trigger a full SmartAIHub monorepo production build unless an explicit shared-contract change requires it.

## 22.2 CI artifact flow

Required:

```text
Git commit
   ↓
isolated CI build
   ↓
go test
contract tests
integration tests
security checks
   ↓
container image build
   ↓
immutable image digest
   ↓
registry
   ↓
staging
   ↓
smoke/fault/load tests
   ↓
production promotion
```

Production runtime hosts SHALL NOT compile application source as the deployment mechanism.

## 22.3 Pre-built Cloudflare Container image

The production deployment SHOULD use a pre-built immutable image referenced by digest.

Example conceptual identity:

```text
control-plane@sha256:<digest>
```

A failed new build SHALL have zero impact on the currently active production version.

## 22.4 Rollback

Rollback SHALL select a previously certified immutable version.

It SHALL NOT require:

```text
edit source
→ rebuild
→ hope build succeeds
```

Database migrations used during gradual rollout MUST follow expand/contract compatibility rules.

---

# 23. Deployment safety

Worker versions and container/control-plane releases SHALL be promoted independently from source build.

Production rollout sequence:

```text
0%   uploaded / smoke only
1%   canary
5%
20%
50%
100%
```

Actual percentages MAY change by risk class.

Promotion SHALL be evidence gated.

Rollback SHALL be executable without a new source build.

For stateful semantics, traffic split alone is insufficient. Job ownership SHALL use explicit:

```text
control_plane_owner
routing_epoch
job_family
cohort
```

so two controllers cannot race for one job.

---


## 23.1 Schema and protocol rollout compatibility

Every production rollout that changes DB or execution contracts SHALL use expand/contract sequencing.

Required pattern:

```text
EXPAND
  add backward-compatible fields/tables/indexes

DEPLOY N/N-1 COMPATIBLE CODE
  old and new runtimes coexist safely

BACKFILL / VERIFY
  resumable, observable, throttled

CUT OVER OWNERSHIP
  explicit routing epoch

CONTRACT
  remove obsolete fields only after no active runtime uses them
```

A rollback MUST NOT select an application version whose required schema/resources no longer exist.

Database migrations SHALL be versioned independently from application source deployment.

## 23.2 Feature/config versioning

Production-impacting scheduler, retry, capacity and provider-routing configuration SHALL be versioned and auditable.

A job event SHOULD record the effective policy/config version used for significant routing or retry decisions.

Emergency configuration rollback SHOULD NOT require rebuilding Go binaries.

### Emergency kill switches

The platform SHALL provide narrowly scoped, audited emergency controls for:

```text
pause_new_paid_effects_global
pause_job_family
pause_provider
pause_provider_account
pause_runner_class
freeze_rollout
force_read_only_debug_mode
```

Kill switches SHALL:

- default to fail-safe semantics;
- be stored durably;
- have actor/reason/timestamp;
- support expiry or explicit clear;
- propagate without requiring a new binary build;
- never erase existing jobs;
- leave already-running work in a reconcilable state.

Clearing a kill switch SHALL require the same or stronger authorization as setting it for high-risk scopes.

## 23.3 Build provenance and software supply chain

The Go Control Plane build pipeline SHALL produce:

- immutable image digest;
- source commit SHA;
- Go/toolchain version;
- dependency lock/module evidence;
- SBOM;
- vulnerability scan result;
- test result references;
- provenance/attestation where supported.

Production SHALL deploy by immutable digest, not mutable `latest` tags.

High-risk releases SHOULD use signed/verified artifacts according to the project's supply-chain policy.


## 23.4 Callback ownership during mixed-version rollout

Provider callbacks may arrive minutes or hours after dispatch and can cross a deployment/cutover boundary.

The callback ingress SHALL resolve the canonical job first and route the event according to durable job ownership/routing epoch, not according to whichever control-plane version is currently newest.

A callback for an in-flight legacy-owned attempt SHALL not be accidentally processed as a new V2 attempt.

Callback routing state MUST survive rollback.

# 24. Cloudflare database connectivity phase

Before Control Plane V2 can write production state from Cloudflare:

1. install/verify Cloudflare Tunnel on the Linux private network;
2. create Workers VPC service for PostgreSQL;
3. create Hyperdrive configuration;
4. use a dedicated production database role;
5. verify TLS;
6. verify connection limits;
7. verify transactions;
8. verify `SKIP LOCKED` / row-lock behavior used by job claims;
9. verify fail/reconnect behavior;
10. benchmark latency;
11. verify tunnel restart;
12. verify database restart;
13. verify no public `5432` exposure is required.

Any PostgreSQL feature incompatible with the selected Hyperdrive path SHALL be explicitly classified before cutover.

---


## 24.1 Two Hyperdrive consistency bindings

At minimum, define:

```text
HYPERDRIVE_FRESH
  caching disabled
  job/control/auth/billing/lease/capacity writes and reads

HYPERDRIVE_BOUNDED
  caching enabled only for explicitly approved stale-tolerant reads
```

No job-control repository may silently use `HYPERDRIVE_BOUNDED`.

CI/static policy SHOULD make the intended binding visible in repository code.

## 24.2 Transitional Linux database availability

During the control-plane-first phase, Linux PostgreSQL remains a production dependency and therefore remains a single-site risk until the database migration completes.

This transitional phase SHALL NOT be represented as final high availability.

Before moving material production job ownership to Cloudflare, require:

- redundant `cloudflared` connectors where supported;
- restart/startup supervision;
- tunnel health monitoring;
- tested DB backup/restore;
- tested power/network outage behavior;
- fail-closed execution when canonical DB authority is unavailable.

The Control Plane MUST NOT continue issuing new paid external side effects when it cannot durably acquire/verify job authority in PostgreSQL.

## 24.3 Dedicated migration connection

Production schema migration SHALL use a dedicated migration/admin connection path, not a normal cached application path.

Migration tooling SHALL be single-authority and SHALL use an explicit migration lock compatible with its direct PostgreSQL connection semantics.

Application startup MUST NOT perform opportunistic production DDL.

# 25. Go-to-database boundary

Initial preferred security boundary:

```text
Go Control Plane
      │
      ▼
Internal Control API / DB Worker
      │
      ▼
Hyperdrive
      │
      ▼
PostgreSQL
```

The internal API exposes narrow commands such as:

```text
claimJob
renewLease
reserveProviderCapacity
recordProviderAccepted
recordProviderProgress
recordProviderCompleted
markArtifactStored
scheduleRecovery
finalizeJob
```

This keeps database credentials and Cloudflare bindings out of the Go application where practical.

If performance testing proves this hop inadequate, a certified direct database connectivity path MAY replace it without changing the job semantics or public contracts.

The implementation choice MUST be made from load-test evidence, not convenience.

---

# 26. Migration plan

## 26.1 Machine-verifiable migration receipts

Every migration milestone or production cutover SHALL emit a durable evidence receipt.

Conceptual schema:

```text
migration_receipt_id
spec_id
spec_revision
milestone
environment
started_at
completed_at
source_commit_sha
deployed_worker_version
container_image_digest
schema_version
routing_epoch
job_families
cohort
tests
fault_injection_results
metrics_before
metrics_after
rollback_target
approvals
operator
status
evidence_refs
```

Allowed final receipt states:

```text
PASSED
PASSED_WITH_EXPLICIT_EXCEPTION
ROLLED_BACK
BLOCKED
FAILED
```

`PASSED_WITH_EXPLICIT_EXCEPTION` requires a named owner, bounded scope and expiry/review date.

Agents SHALL NOT infer that a milestone is complete solely because source code or a spec section exists. Promotion decisions SHALL consume the latest valid receipt and live runtime evidence.

Receipts SHALL be stored in PostgreSQL/audit storage with immutable evidence references; large evidence artifacts MAY be stored in R2.

## M267.0 — Canonicalize specs first

Before implementation agents begin:

- register Spec 267;
- archive/tombstone 232 and 245;
- update registry;
- update agent bootstrap;
- add duplicate-authority CI check.

**Exit gate:** an agent asking “how do we migrate queues/Cloudflare production?” resolves Spec 267, not 232/245.

## M267.1 — Production inventory and baseline

Inventory current:

- BullMQ queues;
- Redis uses;
- Celery workers;
- Celery Beat;
- Docker workers;
- watchdogs;
- current `worker_jobs` paths;
- provider callbacks;
- artifact download paths;
- R2 writes;
- provider accounts/API keys;
- queue backlog;
- known stuck jobs;
- build/deploy process;
- production memory failures.

Capture baseline:

```text
job completion %
unknown/stuck jobs
queue wait
provider 429
provider error
artifact fetch failure
retry count
p95 completion
build duration
build RAM peak
deployment interruption
```

No behavior change.

## M267.2 — Additive database contracts

Add only backward-compatible schema required for:

```text
control_plane_owner
routing_epoch
attempt_id
lease_epoch
trace_id
provider_account_id
provider_request_id
external_job_id
provider_state
artifact_state
recovery_state
last_progress_at
last_reconciled_at
next_recovery_at
```

Create/upgrade outbox and capacity tables as required.

No destructive rename/drop.

## M267.3 — Cloudflare private DB path

Establish:

```text
Workers → Hyperdrive → Workers VPC → Tunnel → Linux PostgreSQL
```

Run transaction and failure certification.

No production job ownership moves yet.

## M267.4 — Go Control Plane skeleton

Implement:

- contract client;
- scheduler;
- lease logic;
- provider router;
- reconciler;
- telemetry.

Run against staging.

Then production shadow-read mode.

No paid side effects.

## M267.5 — Flight recorder / observability

Before V2 owns jobs, Admin/Task Control must be able to answer “where did the job go?”

Implement:

- timeline;
- provider refs;
- artifact refs;
- attempt/lease history;
- queue refs;
- recovery state.

This gate is mandatory before production control transfer.

## M267.6 — Cloudflare Queues + transactional outbox

Introduce queue transport with:

- idempotency;
- ack after durable settlement;
- DLQ;
- replay/quarantine;
- metrics;
- queue family isolation.

Start in shadow/noncritical path.

## M267.7 — Provider Account Pool

Implement:

- provider account registry;
- health;
- rate/quota observations;
- capacity reservation;
- policy;
- compliant account/provider selection.

Initially compare decisions in shadow mode.

## M267.8 — Reconciler / Recovery certification

Implement and test:

- expired lease;
- missing heartbeat;
- provider callback loss;
- artifact fetch failure;
- queue duplicate;
- queue uncertainty;
- DB reconnect;
- R2 failure;
- provider 429;
- provider timeout.

No control-plane promotion before recovery tests pass.


## M267.8A — Scale, schedule and compatibility certification

Before first production ownership, certify:

- explicit Go Container replica topology;
- container restart/sleep behavior;
- event-driven reconciliation ticks;
- sharded `SKIP LOCKED` reconciliation;
- strict-fresh Hyperdrive use;
- protocol N/N-1 compatibility;
- delayed retry beyond Queue delay limits;
- schedule misfire/DST behavior;
- cancellation races;
- callback duplicate/out-of-order handling;
- retry jitter/thundering-herd protection.

## M267.9 — First production canary

First real V2-owned cohort SHALL be narrow and reversible.

Recommended progression:

1. low-risk idempotent internal job;
2. beta-user image-generation cohort;
3. wider image generation;
4. artifact recovery;
5. audio;
6. video;
7. external agents;
8. remaining background job families.

Charged/expensive media MUST NOT be the first ever V2 production workload.

## M267.10 — Provider capacity control production

Enable:

- capacity reservations;
- account routing;
- rate-limit wait states;
- fairness;
- backlog-aware scheduling;
- provider degradation handling;
- capacity recommendations.

## M267.11 — Retire legacy queue/control authority

After V2 reaches 100% for a job family:

```text
stop new legacy assignment
drain active legacy jobs
reconcile delayed/repeatable jobs
verify callbacks
verify no old consumer can claim V2 work
disable legacy consumer
observe
remove authority
```

BullMQ/Celery/Redis SHALL be removed by responsibility, not by package-name-only deletion.

Celery MAY remain as an execution adapter where Python execution is still needed; it SHALL not remain an independent business job authority.

## M267.12 — Migrate main SmartAIHub application

Only after Control Plane V2 is production-certified.

Migrate route families incrementally:

```text
API/Auth
Chat
LLM Gateway
Media APIs
Library
Mini Apps
other products
```

Each migrated component consumes the same Control Plane V2.

No new product may create a separate queue authority.

## M267.13 — Move PostgreSQL to managed production

Database movement occurs after the application/control plane can run from Cloudflare reliably.

Requirements:

- managed PostgreSQL selected;
- schema parity;
- extensions verified;
- backups;
- PITR;
- replication/migration rehearsal;
- consistency check;
- controlled writer cutover;
- single writable primary at all times;
- Hyperdrive re-pointed;
- application soak.

No dual-primary design.

## M267.14 — Linux becomes dev-only

Exit conditions:

- no production HTTP traffic;
- no production scheduler;
- no production queue consumer;
- no production provider execution;
- no production cron ownership;
- no canonical production file writes;
- no production database hosting if DB migration is complete.

Linux retains:

- source checkout;
- development tools;
- test tools;
- diagnostics;
- production read-only access;
- controlled debug-session client.

---

# 27. Failure injection matrix

The implementation SHALL intentionally test at least:

| Failure | Expected result |
|---|---|
| Kill Go controller before claim | job remains recoverable |
| Kill Go controller after claim | lease expires/fences and recovers |
| Kill after provider accepted | provider job is rediscovered; no blind duplicate |
| Queue delivers duplicate | no duplicate durable effect |
| Outbox sent but mark-sent failed | safe republish |
| Tunnel disconnects | no state corruption; retry/recovery visible |
| PostgreSQL restarts | controller reconnects/reconciles |
| Runner disappears | lease takeover after fencing |
| Provider returns 429 | waiting/reroute/retry, not silent failure |
| Provider is slow | visible waiting-provider state |
| Provider completes, callback lost | reconciler discovers completion when API permits |
| Provider completes, artifact fetch fails | fetch-only recovery |
| R2 write fails | artifact recovery; no false completion |
| DLQ reached | admin-visible quarantine/replay |
| Old controller receives stale job | fencing prevents settlement |
| New build fails | active production unaffected |
| New deployment unhealthy | rollback without rebuild |
| Linux dev tries to consume prod queue | denied |
| Dev tries direct production write | denied unless debug-session path permits |

---

# 28. Load and scale validation

The production design target is concurrent use from thousands to tens of thousands of users.

Testing SHALL model:

- burst traffic;
- sustained traffic;
- multiple tenants;
- one abusive/noisy tenant;
- high video backlog;
- provider account exhaustion;
- simultaneous provider degradation;
- large callback burst;
- artifact recovery burst;
- queue replay after outage;
- controller replica restart.

Load tests SHALL measure separately:

```text
API admission capacity
queue publish throughput
queue age
scheduler decision latency
database transaction contention
provider reservation contention
reconciler throughput
artifact recovery throughput
admin query latency
```

The provider, not Cloudflare, may become the first capacity bottleneck; therefore capacity tests MUST include actual provider quota models and observed production limits.

---


## 28.1 PostgreSQL scale and retention

The database design SHALL account for high event volume.

At minimum evaluate:

- indexes for active-state queries;
- partial indexes for due reconciliation/recovery;
- index on lease expiry;
- index on provider external IDs;
- index on tenant/job search;
- outbox dispatch indexes;
- partitioning strategy for `worker_job_events` if volume requires it;
- hot vs historical retention;
- autovacuum/bloat;
- write amplification;
- connection caps through Hyperdrive;
- slow-query budgets.

Historical event archival MAY move immutable cold history to R2 or another approved archive only under a documented retention/audit design.

Archival MUST preserve tamper-evident linkage and the ability to reconstruct a job timeline when required.

The active control plane SHALL never depend on scanning archived cold data for normal recovery.

## 28.2 Event partitioning and archival manifest

Before event volume requires emergency maintenance, the project SHALL establish an explicit `worker_job_events` growth policy.

The policy SHALL define:

```text
partitioning trigger
partition key/time window
hot retention window
cold archival window
archive manifest
checksum strategy
legal/audit retention override
restore/reconstruction procedure
```

Partition creation/retirement MUST be automated or operationally scheduled before a partition becomes a capacity incident.

Archiving SHALL produce a manifest linking:

```text
partition/range
row/event count
time range
checksum
R2/archive object
created_at
retention_class
```

Normal job inspection SHOULD transparently retrieve cold history when authorized, but core scheduling/recovery SHALL use hot indexed state only.

# 29. Security and secret handling

Provider credentials SHALL:

- be encrypted/stored using the approved secret authority;
- be referenced by ID;
- never appear in queue payload;
- never appear in job-event plaintext;
- never be exposed to Linux dev through read-only production queries;
- be scoped to the minimum provider/account capability.

Provider account routing metadata is not authorization to reveal credentials.

Debug sessions SHALL not expose raw secrets.

---


## 29.1 Production diagnostic privacy boundary

Diagnostic tools SHALL default to the smallest scope required:

```text
one job
one tenant
one time range
one trace
```

Broad cross-tenant searches require an elevated audited role.

PII/sensitive payload bodies SHOULD be masked by default in operational dashboards, with explicit privileged reveal when legitimately required.

Production database dumps SHALL NOT be copied to developer laptops as the normal debugging workflow.

## 29.2 Data classification, retention, deletion and legal hold

Production data SHALL be classified at minimum as:

```text
PUBLIC
INTERNAL
TENANT_CONFIDENTIAL
PERSONAL_DATA
SECRET
FINANCIAL_AUDIT
SECURITY_AUDIT
```

Each class SHALL define:

- allowed stores;
- encryption requirement;
- operational visibility;
- retention period or retention policy;
- deletion behavior;
- archival behavior;
- legal-hold behavior.

User/tenant deletion workflows SHALL explicitly address:

```text
PostgreSQL primary records
worker_job payload references
R2 user artifacts
Vectorize derived index entries
KV/cache entries
debug exports
provider-side deletion where supported/required
```

Immutable financial/security audit records MAY require retention after user-content deletion, but SHALL minimize personal payload content and preserve only what policy/law requires.

A legal hold MUST suspend destructive lifecycle rules only for the scoped records and SHALL be auditable.

Operational logs/traces SHALL avoid raw prompts, provider credentials, access tokens and unnecessary personal data.

# 30. Billing / credits / external side effects

A retryable technical failure MUST NOT create uncontrolled duplicate charges.

Required concepts:

```text
logical job
execution attempt
provider external effect
settlement
```

The same logical job may have multiple technical attempts.

Billing logic SHALL distinguish:

- provider request never accepted;
- provider accepted/running;
- provider completed;
- artifact recovery only;
- safe generation retry;
- duplicate provider effect;
- final customer-visible success.

Artifact-fetch retry MUST NOT be billed as a new generation.

---


## 30.1 Settlement idempotency

Financial settlement SHALL use durable uniqueness guards.

Conceptual effect identity:

```text
(job_id, settlement_type, settlement_epoch)
```

or an equivalent canonical unique key.

The following must be idempotent:

- credit reservation;
- provider-cost recognition;
- customer charge/usage settlement;
- refund/release;
- compensation.

A Queue retry, callback replay or stale executor MUST NOT double-settle the same economic effect.

# 31. Compatibility with Spec 224

Spec 224 remains the lifecycle authority for autonomous development runs.

Spec 267 supplies the production execution substrate.

Relationship:

```text
Spec 224 Development Run
        │
        ▼
canonical worker_jobs / events
        │
        ▼
Spec 267 Control Plane V2
        │
        ├── queue
        ├── scheduling
        ├── provider/runner capacity
        ├── recovery
        └── execution placement
```

Spec 267 MUST NOT change Spec 224 `FINAL_VERIFY` semantics.

Spec 224 MUST NOT create a parallel queue/control plane.

---

# 32. Compatibility with Spec 242

Spec 242 continues to define Cloudflare Agent/Sandbox integration capabilities where still applicable.

Spec 267 owns:

- when those capabilities move to production;
- how their jobs are queued;
- how execution ownership is fenced;
- how they participate in recovery;
- how they are observed.

Any migration-order statements in Spec 242 defer to Spec 267.

---

# 33. Cloudflare production platform map

The architecture SHALL use Cloudflare products by role, not as interchangeable substitutes.

## 33.1 Mandatory core at final production

| Product / service | Production role | Authority / state rule |
|---|---|---|
| **Cloudflare DNS/CDN/SSL/WAF zone** | public edge, TLS, DDoS/WAF, cache policy | network/security edge only |
| **Workers Paid** | Web/API/Auth/Chat/LLM Gateway, admission, short control handlers | application compute; not job ledger |
| **Cloudflare Queues** | durable at-least-once asynchronous transport | transport only |
| **Cloudflare Containers** | Go Control Plane V2 and certified container workloads | stateless/restart-safe controller |
| **Hyperdrive** | PostgreSQL connection pooling/acceleration | never source of truth |
| **R2** | durable media/files/artifacts | artifact authority, not business ledger |
| **Workers Observability** | logs/traces/runtime diagnosis | diagnostic telemetry, not lossless job history |
| **Managed PostgreSQL** (external to Cloudflare) | users, tenants, credits, `worker_jobs`, events, leases, provider capacity, settlement, audit | **single transactional source of truth** |

SmartAIHub already uses or plans the following data services as part of the broader production platform:

| Service | Role | Rule |
|---|---|---|
| **Vectorize** | semantic/RAG index | index only; PostgreSQL/R2 retain authoritative metadata/content |
| **KV** | disposable noncritical cache such as SearchResultCache | cache only; correctness may not depend on it |

Therefore the final platform SHOULD be understood as:

```text
Cloudflare production runtime/data plane:
  DNS/CDN/WAF
  Workers Paid
  Queues
  Containers
  Hyperdrive
  R2
  Observability
  KV
  Vectorize

External canonical database:
  Managed PostgreSQL

Conditional Cloudflare substrates:
  Workflows
  Durable Objects
  Workers VPC/Tunnel during transitional/private-network paths
```

This is **not** ten independent business databases. PostgreSQL remains the single business/job ledger.

### Baseline service count

For planning and billing discussions, the final baseline SHALL be counted as:

```text
9 Cloudflare platform components:
  1. DNS/CDN/SSL/WAF zone
  2. Workers Paid
  3. Queues
  4. Containers
  5. Hyperdrive
  6. R2
  7. Workers Observability
  8. KV
  9. Vectorize

+ 1 external managed PostgreSQL service
= 10 baseline platform components

Conditional, not counted until activated for a proven workload:
  Workflows
  Durable Objects

Transitional/private-connectivity only where needed:
  Workers VPC
  Cloudflare Tunnel
```

The count is an architecture/billing convenience, not a claim that each component has a separate subscription or database. Several capabilities share the Workers Paid plan and usage allocations.

## 33.2 Conditional services — use only when workload requires them

| Product | Enable when | Do not use merely because available |
|---|---|---|
| **Workflows** | a bounded job path benefits from durable multi-step sleep/retry/event waits | do not wrap every queue job in a Workflow |
| **Durable Objects** | live WebSocket/presence or serialized hot-key coordination materially benefits | do not move canonical job/accounting truth out of PostgreSQL |
| **Workers VPC + Cloudflare Tunnel** | Cloudflare must reach the transitional Linux PostgreSQL or another private origin | remove/retire the dependency when final managed DB path no longer requires it |
| **Cloudflare for SaaS / Workers for Platforms** | later white-label/custom-hostname or creator-runtime requirements explicitly need them | not part of Spec 267 core migration |
| **Workers AI** | an approved model/use-case specifically chooses Cloudflare inference | SmartAIHub provider routing remains provider-neutral |
| **Browser Rendering / Sandbox / Agents** | a product capability explicitly requires them under its owning spec | not generic queue/control-plane dependencies |

## 33.3 Explicit non-core exclusions

Spec 267 SHALL NOT introduce any of the following as a second canonical store or mandatory production dependency without a separate justified requirement:

- D1 as replacement/duplicate of PostgreSQL;
- Cloudflare Stream as replacement for R2 merely because media exists;
- Cloudflare Images as a mandatory media store;
- Workers AI as the default LLM merely because the application runs on Workers;
- a Durable Object database as a duplicate business ledger;
- a Workflow as the only record that a customer job exists.

This rule prevents Cloudflare-service sprawl.

## 33.4 Production plan baseline

For the primary revenue-producing SmartAIHub public zone:

```text
Workers plan: Workers Paid — REQUIRED
Zone plan at public GA: Cloudflare Pro — DEFAULT
```

The zone may remain Free during development/private beta if the production-security review accepts that risk. A higher Cloudflare plan MAY be selected when WAF/SLA/support/compliance requirements justify it.

Workers Paid and the Cloudflare zone plan are separate billing concepts and SHALL be budgeted separately.

Tenant subdomains under the same zone SHALL NOT automatically create separate paid zones. Custom external tenant domains SHALL follow the white-label/custom-hostname architecture rather than provisioning a paid Cloudflare zone per tenant by default.

## 33.5 Cost-governance baseline

Pricing is usage-based and can change. The values in this section are a **2026-10-02 planning baseline**, not contractual prices. Deployment automation SHALL re-check official pricing before production activation and at least quarterly.

Known current baselines:

```text
Workers Paid:
  base = $5/account/month
  10M Worker requests/month included
  30M CPU-ms/month included

Primary zone Pro:
  $25/month billed monthly
  or current annual-equivalent pricing if annual billing is selected

Queues:
  1M operations/month included on Workers Paid
  +$0.40 / 1M operations
  operation charging is per 64 KB message unit

Containers:
  Workers Paid includes:
    25 GiB-hours memory
    375 vCPU-minutes
    200 GB-hours disk
  additional:
    memory $0.0000025 / GiB-second
    CPU    $0.000020 / vCPU-second
    disk   $0.00000007 / GB-second
  CPU is billed on active CPU usage; memory/disk on provisioned active resources
  incoming Container use also involves Workers and Container-associated Durable Object billing under current Cloudflare architecture; budget calculations SHALL include those dimensions rather than pricing the container VM resources alone

R2 Standard:
  10 GB-month included
  $0.015 / GB-month beyond included storage
  Class A and Class B operation pricing applies
  internet egress is currently $0

KV on Workers Paid:
  included read/write/storage allowances apply
  remain a cache, not a ledger

Hyperdrive on Workers Paid:
  database query count is currently unlimited under the paid-plan pricing model

Vectorize:
  queried/stored vector dimensions are usage-billed
  Workers Paid includes a monthly queried/stored-dimension allowance

Workflows when enabled:
  current Workers Paid baseline includes 500,000 steps/month
  additional steps are usage-billed under the current published pricing
  idle sleep/wait time does not by itself consume Workflow CPU

Durable Objects when enabled:
  current Workers Paid included request/duration/storage allowances apply
  hibernation SHALL be used for eligible WebSocket/presence workloads

Workers Logs/Tracing:
  current paid-plan included observability events apply
  logs/traces SHALL use intentional sampling and PII-safe fields
```

Cloudflare Containers may also incur network egress charges based on region. Large artifact bytes SHALL NOT be unnecessarily proxied through the Go Control Plane. Go SHOULD coordinate metadata/control while artifact-specific executors stream/store media through the appropriate R2/provider path.

## 33.6 Initial full-system infrastructure budget

For a small but production-ready launch, the planning target SHALL be:

```text
Cloudflare + managed PostgreSQL infrastructure:
  target budget: USD $100–150/month

EXCLUDED:
  OpenAI/Gemini/image/video/audio provider usage
  external GPU services
  user-specific paid model subscriptions
  domain registration
  taxes
```

This budget is a planning envelope, not a spending entitlement.

A reference small-production configuration is:

```text
Workers Paid
Cloudflare Pro on primary production zone
2 logical Go Control Plane `basic` replicas
modest Queues usage
100–500 GB class R2 footprint
KV/Vectorize/DO/Workflow usage largely within included or low usage bands
managed PostgreSQL HA
sampled Workers observability
```

With current Container rates, **two `basic` replicas kept active continuously at roughly 10% average CPU** are approximately a mid-teens USD/month Container workload after the Workers Paid included allocation; actual cost may be substantially lower when instances sleep. This example MUST NOT be used as a capacity guarantee.

Managed PostgreSQL cost SHALL be taken from the live provider quote/SKU at activation time. The public PlanetScale page confirms HA topology but does not expose one fixed universal HA monthly price because resource, region, storage and topology affect cost.

## 33.7 FinOps and denial-of-wallet controls

The platform SHALL maintain a monthly infrastructure budget ledger with at least:

```text
Workers requests / CPU
Queues operations
Container CPU / memory / disk / egress
R2 storage / Class A / Class B
KV operations/storage
Vectorize queried/stored dimensions
Workflow steps/storage
Durable Object requests/duration/storage
Observability events/export
Managed PostgreSQL compute/storage/backup/egress
```

Required controls:

- warning at 50%, 75% and 90% of configured monthly infrastructure budget;
- anomaly alert on abnormal day-over-day growth;
- per-service hard/soft limits where Cloudflare/provider controls permit them;
- tenant/job cost attribution where feasible;
- rate limits against abuse/denial-of-wallet;
- explicit approval for a material infrastructure-tier increase;
- provider inference spend tracked separately from infrastructure cost.

Cost optimization MUST NOT weaken job correctness, fencing, audit or artifact durability.

## 33.8 R2 lifecycle and large-media cost policy

R2 lifecycle configuration SHALL classify objects by business retention requirement.

Examples:

```text
active user media          → Standard
temporary processing data  → short TTL
recoverable intermediates  → bounded retention
old/rare artifacts         → evaluate Infrequent Access only after retrieval economics test
```

Deletion/retention rules MUST respect user/library ownership, billing/audit requirements and legal retention.

Provider-created large artifacts SHOULD be persisted to R2 as early as safely possible and referenced by immutable artifact metadata. The Go Control Plane SHOULD avoid loading whole video/audio artifacts into memory.

## 33.9 Pricing and platform verification gate

Before each production promotion wave, implementation SHALL capture a machine-readable `platform-baseline.json` or equivalent containing:

```text
verification_timestamp
Workers plan
zone plan
Queues limits/pricing snapshot
Containers types/pricing/scaling behavior
Workflows limits/pricing
DO limits/pricing
Hyperdrive behavior/pricing
R2 pricing
KV pricing
Vectorize limits/pricing
Observability pricing/retention
Workers VPC status/pricing if used
managed PostgreSQL selected SKU/region/current quote
```

A material provider/platform change triggers review before promotion.

---

# 34. Production promotion gates

No job family moves from legacy to V2 unless all relevant gates pass:

```text
G1 contract compatibility
G2 trace visibility
G3 outbox durability
G4 queue dedup
G5 lease/fencing
G6 recovery
G7 provider idempotency/ambiguity policy
G8 artifact durability
G9 billing/settlement safety
G10 capacity/rate-limit behavior
G11 canary rollback
G12 security/tenant isolation
G13 managed PostgreSQL capacity/restore/connection certification
G14 platform service-map and pricing baseline captured
G15 FinOps guardrails / budget alerts enabled
G16 Go Container bottleneck classification and scale policy verified
G17 Queue lease-vs-execution-fence and shard rebalance certified
G18 Provider-account governance and callback authenticity certified
G19 Data retention/deletion/legal-hold controls certified
G20 Incident/kill-switch/error-budget operations certified
G21 Database failover/split-brain runbook certified
G22 Migration evidence receipt emitted and validated
```

Promotion evidence SHALL be retained.

“Tests passed locally” alone is insufficient for production ownership.

---

# 35. Rollback rules

Rollback is an ownership transfer, not merely code rollback.

For each job family:

```text
control_plane_owner = legacy | v2
routing_epoch = N
```

Rollback SHALL:

1. stop new V2 ownership for the family;
2. preserve already-running V2 attempts until explicitly drained/reconciled;
3. prevent legacy from claiming jobs still validly owned by V2;
4. increment routing epoch when ownership changes;
5. preserve provider external references;
6. preserve all job history;
7. audit the rollback.

No rollback may reintroduce Redis-only execution authority that ignores PostgreSQL fencing.

---


## 35.1 Disaster recovery and dependency outage policy

The production design SHALL define recovery behavior for:

- Linux PostgreSQL outage during the transitional phase;
- managed PostgreSQL outage after migration;
- Cloudflare Queue outage;
- Cloudflare Worker/Container regional/platform incident;
- provider-wide outage;
- R2 outage;
- Tunnel/VPC failure;
- accidental credential revocation;
- bad schema migration.

The project SHALL define measurable targets:

```text
RPO
RTO
maximum accepted-job terminality breach during DR
maximum replay backlog
```

for each production tier.

## 35.2 Database recovery

Before the database becomes or remains production critical:

- automated backups MUST exist;
- restore MUST be tested;
- PITR capability MUST be tested where required by tier;
- backup encryption/access must be controlled;
- restore evidence must include application-level consistency checks for `worker_jobs`, credits, outbox and artifacts.

A backup that has never been restored does not satisfy the certification gate.

## 35.3 Fail-closed vs degraded-mode matrix

Every dependency SHALL be classified.

Examples:

```text
PostgreSQL unavailable
  → FAIL CLOSED for new paid external effects

R2 unavailable
  → provider result may remain recoverable;
    do not falsely finalize media job

provider unavailable
  → waiting/reroute according to policy

analytics/cache unavailable
  → degrade if safe; do not block core correctness
```

The matrix SHALL be stored as an operational runbook and verified in failure injection.

## 35.4 Managed PostgreSQL failover and split-brain prevention

Database failover SHALL preserve the single-writer invariant.

The control plane SHALL maintain or derive a durable:

```text
database_writer_epoch
```

or equivalent authority generation.

After a database failover/promotion:

1. confirm the new canonical writer;
2. advance/verify writer epoch;
3. invalidate or refresh stale connection paths;
4. ensure old writer is fenced/read-only/unreachable for production writes;
5. verify Hyperdrive/connection targets;
6. pause new paid side effects until canonical write authority is proven;
7. reconcile jobs whose transaction outcome was ambiguous during failover.

No application-level "multi-primary for availability" workaround is permitted.

Provider callbacks received during DB unavailability MAY be durably buffered only in an approved mechanism; they SHALL NOT directly finalize financial/job state without canonical DB authority.

## 35.5 Regional/platform failover

The architecture SHALL distinguish:

```text
Cloudflare edge routing availability
Go Container instance availability
managed PostgreSQL regional availability
external provider regional availability
```

A region/platform incident SHALL not cause the system to simultaneously execute the same paid external effect from two independent failover paths.

Failover plans SHALL use the same job lease/fencing/routing epoch rules as ordinary execution.

The DR runbook SHALL include:

- who declares failover;
- preconditions;
- traffic/control-plane routing change;
- database authority check;
- provider-account region restrictions;
- rollback/failback;
- post-failover reconciliation.

## 35.6 Queue outage behavior

If Cloudflare Queues cannot accept/publish new messages but PostgreSQL is healthy:

- canonical accepted work remains durable in PostgreSQL/outbox;
- outbox dispatch is retried later;
- operators can distinguish `OUTBOX_PENDING_QUEUE` from ordinary `QUEUED`;
- admission MAY be tightened if estimated recovery backlog would violate user contracts;
- no second ad-hoc broker becomes a hidden production authority.

# 36. Definition of Done

Spec 267 is complete only when:

### Control Plane
- Go Control Plane V2 is production primary.
- All production job families use canonical `worker_jobs`.
- Cloudflare Queues are transport only.
- Reconciler/Recovery is production active.
- Provider Account Pool is production active.
- capacity recommendations are available.
- tenant fairness is active.
- explicit backpressure/admission control is active.
- Queue/DLQ expiry cannot erase durable recovery intent.
- delayed schedules/retries are durable beyond Queue delay limits.
- DLQ/replay/quarantine is operational.
- Go Container replica/shard topology is certified without singleton assumptions.
- Queue transport leases are proven incapable of bypassing PostgreSQL execution fencing.
- queue sharding/rebalance procedure is proven without job loss or duplicate external effects.
- provider-account governance/credential lifecycle is operational.

### Reliability
- accepted jobs do not silently disappear in fault tests;
- job location and last durable step are queryable;
- stale executors are fenced;
- provider-complete/artifact-missing is recoverable;
- duplicate queue delivery is safe;
- controller restart/replacement recovery is proven.
- callback duplicate/out-of-order/replay handling is proven.
- cancellation races are proven.
- strict-fresh DB reads are proven for correctness-critical decisions.
- callback signature/replay controls are certified for providers that support them.
- weak-provider ambiguous-effect policy is certified.
- error-budget/burn-rate gates are connected to rollout/admission controls.

### Migration
- Specs 232/245 are no longer active planning sources;
- main SmartAIHub production runtime has migrated to Cloudflare;
- PostgreSQL has one canonical writable primary throughout migration;
- database migration has completed or is explicitly the only remaining independent track;
- Linux has no production runtime authority.

### Build/Deploy
- Control Plane build is independent;
- production does not compile source;
- failed builds do not affect current users;
- rollback does not require a rebuild;
- schema rollback compatibility is proven;
- build provenance/SBOM/image digest are recorded;
- canary/gradual promotion is operational.
- every production migration milestone produces a valid evidence receipt.
- emergency kill switches work without a rebuild and are audited.

### Debug
- Linux dev can inspect real production data with read-only role;
- controlled production debug sessions work;
- dev cannot consume production queues or claim production jobs;
- every debug mutation is audited.
- data retention/deletion/legal-hold behavior is documented and tested for canonical stores/indexes/artifacts.
- managed PostgreSQL failover is proven without split-brain write authority.

---

# 37. Immediate implementation order

The first implementation mission generated from this spec SHALL be:

```text
1. Spec registry + supersession cleanup
2. Current runtime/queue/provider inventory
3. worker_jobs/event schema gap report
4. Cloudflare private PostgreSQL connectivity proof
5. Go Control Plane repository skeleton
6. canonical execution contracts
7. job flight recorder
8. shadow scheduler + reconciler
9. transactional outbox + first Cloudflare Queue
10. provider account/capacity shadow model
11. failure-injection certification
12. beta canary
```

Do NOT begin by migrating the full web application.

Do NOT begin by moving PostgreSQL.

Do NOT begin by deleting Redis.

Do NOT begin by rewriting Rust Runner.

The first production objective is:

> **Make job execution observable, recoverable and capacity-aware on Cloudflare while the rest of SmartAIHub remains operational on Linux.**

---


# 37A. Thirty-eight-round hardening review record

This revision contains the previous twenty-six hardening passes plus twelve additional independent R4 passes, for thirty-eight documented review passes in total.

| Round | Review focus | Gap found | Resolution |
|---|---|---|---|
| R1 | Spec authority / duplicate plans | Specs 232/245 could still influence agents; dependency specs could be misread as migration authority | strengthened supersession/registry policy; Feature 186/195 and 224 retained only for their actual contracts |
| R2 | Cloudflare Container / Go lifecycle | original text could be read as an always-on Go daemon; Containers currently require explicit instance lifecycle/routing | added request-driven/event-driven controller model, explicit replica pool, no singleton correctness |
| R3 | Queue semantics / retention | Queue/DLQ retention and bounded consumer lifetime were not reflected in recovery design | added bounded dispatch phase, PostgreSQL recovery ledger, durable long-delay handling |
| R4 | PostgreSQL/Hyperdrive consistency | Hyperdrive query cache defaults could return stale state in lease/job decisions | added mandatory cache-disabled `HYPERDRIVE_FRESH` path and authoritative DB time |
| R5 | Provider capacity correctness | account pool lacked normalized adapter observations, circuit breaker and draining semantics | added provider capacity contract, circuit breaker, draining and reservation lifecycle |
| R6 | Admission/backpressure | an unlimited accepted backlog could violate “job must finish/terminate visibly” | added durable acceptance contract, capacity-aware admission, load shedding and terminality SLO |
| R7 | Provider callbacks / retries | duplicate/out-of-order/unauthenticated callbacks and infinite retry loops were underspecified | added callback verification/dedup/state guards and retry classification/budgets |
| R8 | Scheduling/time | Queue delay cannot be the durable scheduler and user schedules need timezone/misfire semantics | added PostgreSQL schedule authority, due scanner, DST/misfire rules and jitter |
| R9 | Horizontal scale / DB performance | full-table reconciliation would fail at large job volume | added shard/due indexes, `SKIP LOCKED`, bounded sweeps and query-plan evidence |
| R10 | Deployment/schema/version skew | code rollback could be unsafe after schema/resource changes; Worker/Go/Runner version skew lacked a contract | added expand/contract migrations, N/N-1 protocol compatibility, versioned policy/config |
| R11 | Debug/security/DR | real production debugging needed stronger privacy boundaries and transitional Linux DB remained a single-site risk | added scoped/masked diagnostics, no dev auto-DDL, tunnel redundancy/fail-closed policy, RPO/RTO/restore gates |
| R12 | Operations/supply chain/economics | alert/runbook ownership, immutable build provenance and double-settlement guards were incomplete | added tracing/runbooks, SBOM/provenance requirements and settlement idempotency |
| R13 | Go runtime / downstream backpressure | control-plane code quality and Queue→Container overload behavior were not explicit | added Go runtime constraints, bounded concurrency and differentiated saturation states |
| R14 | Execution immutability / rollout edge cases | retries could inherit mutable inputs; long provider callbacks and expiring artifact URLs could cross rollout boundaries | added immutable execution intent, callback ownership routing and artifact-expiry recovery metadata |
| R15 | Final service map | Cloudflare products were listed but mandatory vs conditional services were not explicit | split final platform into mandatory core, existing data services, conditional substrates and explicit non-core exclusions |
| R16 | Managed PostgreSQL decision | final DB was generic, leaving implementers to choose different vendors/topologies | made PlanetScale Postgres HA the default candidate with strict provider-neutral certification/fallback gates |
| R17 | Production plan selection | Workers Paid vs DNS/WAF zone plan could be conflated | separated Workers Paid from zone plan and set Pro as default primary-zone GA posture |
| R18 | Go initial sizing | replica strategy existed but no initial production baseline | set 2 logical `basic` replicas as starting availability/canary baseline with explicit non-guarantee |
| R19 | Scaling correctness | adding replicas could worsen provider/DB bottlenecks | added mandatory bottleneck classification and scale-out/scale-in triggers |
| R20 | FinOps | architecture had no consolidated Cloudflare/DB budget or denial-of-wallet controls | added $100–150/month launch planning envelope, service ledger, thresholds and budget alerts |
| R21 | Pricing drift | copied prices/limits can become stale | added deployment-time/quarterly pricing verification and machine-readable platform baseline |
| R22 | Container network/media economics | large artifacts could accidentally traverse Go containers and increase memory/egress cost | made Go metadata/control-oriented and added direct artifact-to-R2 policy |
| R23 | Service sprawl | D1/Workers AI/Stream/Images/DO state could be introduced as duplicate infrastructure | added explicit non-core exclusions and no-second-ledger rule |
| R24 | Observability economics/privacy | logs/traces can become expensive and may contain user/provider data | added sampling, cost governance and PII-safe telemetry requirements |
| R25 | R2 lifecycle | media retention/storage class policy was underspecified | added lifecycle/TTL/retention and Infrequent Access evaluation rules |
| R26 | Multi-tenant/domain billing | white-label growth could accidentally create paid zones per tenant | separated tenant subdomains/custom-hostname architecture from per-zone production plan |
| R27 | Queue lease semantics | pull-consumer transport leases/late acknowledgements could be mistaken for execution ownership | explicitly separated Queue transport receipt lease from PostgreSQL lease/fencing authority |
| R28 | Queue sharding/rebalance | high-volume queue expansion had no deterministic drain/rebalance contract | added versioned shard maps, routing version, drain and retirement gates |
| R29 | Queue credential boundary | external pull consumers could lead to raw Cloudflare Queue tokens on untrusted runners | added minimum-scope token lifecycle and prohibition on desktop/mobile credential distribution |
| R30 | Provider-account governance | capacity pool tracked runtime health but not account ownership, ToS/region/credential lifecycle | added governance metadata, lifecycle and capacity-observation confidence |
| R31 | Callback cryptographic authenticity | callback section lacked raw-body signature/key-version/replay-window requirements | added signature-before-parse, body hash, event uniqueness, replay and key-rotation controls |
| R32 | Weak-provider recovery | provider integrations without strong status APIs could remain ambiguously retried | added capability declaration and `AMBIGUOUS_EXTERNAL_EFFECT` operator path |
| R33 | Operational incident control | no formal incident object, severity model or emergency systemic action contract | added incident lifecycle, severity, audited mitigation and postmortem requirements |
| R34 | SLO error budgets | SLO classes existed without burn-rate enforcement | added canonical error-budget metrics and rollout/admission protection |
| R35 | Migration proof | milestones could be declared complete from source/spec state without machine-verifiable runtime evidence | added durable migration receipts with deployments, tests, metrics and rollback evidence |
| R36 | Data lifecycle/privacy | job/history/debug data lacked unified classification, deletion and legal-hold propagation | added data classes, retention, deletion propagation and legal-hold controls |
| R37 | Database failover | HA database promotion lacked explicit split-brain writer fencing | added database writer epoch, fail-closed paid effects and failover reconciliation |
| R38 | Queue/platform outage | queue outage could tempt an emergency second broker or hide accepted work | added outbox-preserving queue-outage behavior and no-hidden-broker rule |

### R4 review conclusion

No known architectural gap from these thirty-eight passes remains intentionally deferred without an explicit implementation or certification gate.

This does **not** mean production certification is complete. Runtime evidence, repository inventory, provider-specific contracts, load tests and failure-injection results remain mandatory before promotion.

# 38. External platform baseline verified for this revision

The following Cloudflare capabilities and pricing surfaces were re-checked for this revision on 2026-10-02:

- Workers Paid currently starts at $5/account/month and includes base Workers/KV/Hyperdrive/Durable Objects allocations; Workers requests/CPU are usage billed beyond included amounts.
- Cloudflare Pro for a public zone is currently $25/month on monthly billing ($20/month equivalent when billed annually at the currently published rate); zone-plan billing is separate from Workers Paid.
- Queues currently include 1M operations/month on Workers Paid and bill additional standard operations at the documented per-million rate.
- Containers currently offer predefined instance types including `basic` (0.25 vCPU, 1 GiB memory, 4 GB disk) and usage billing for memory/CPU/disk; current scaling/routing still requires explicit application control.
- Workers VPC is currently free during Open Beta, but this MUST NOT be assumed permanent.
- Workers Logs currently include 20M events/month on Workers Paid with 7-day retention; Workers tracing entered usage billing on 2026-10-01 under current observability pricing.
- PlanetScale's current public pricing page confirms Postgres single-node starts at $5/month and HA uses 1 primary + 2 replicas across 3 AZ; production SHALL use a live HA quote/SKU rather than infer HA price from the single-node price.
- Cloudflare pull consumers can have multiple concurrent HTTP consumers; delivery uses a visibility lease, and queue acknowledgements are transport semantics rather than SmartAIHub execution authority.
- Current Cloudflare pull-consumer visibility timeout is documented up to 12 hours, while queue message retention is configurable up to 14 days; these platform limits reinforce the PostgreSQL recovery ledger design.
- Cloudflare Queues use at-least-once delivery; application idempotency is required.
- Queues expose backlog metrics and bounded platform limits; as of this review the documented paid limits include up to 14-day message retention, 24-hour per-message delay, 15-minute push-consumer wall time, and 12-hour pull visibility timeout. These values MUST be re-verified at deployment time rather than treated as permanent architectural constants.
- A Queue DLQ is still a Queue; DLQ retention therefore does not replace PostgreSQL recovery/audit state.
- Cloudflare Workflows provide durable multi-step execution, sleep/retry and event waits; workflow-specific limits MUST be checked before assigning a workload.
- Hyperdrive can reach private PostgreSQL through Workers VPC + Cloudflare Tunnel.
- Hyperdrive query caching is enabled by default and does not provide read-after-write invalidation; correctness-critical control-plane reads therefore use a cache-disabled binding.
- Workers versions and deployments support decoupled versions, gradual deployment and rollback, but storage/resource/schema changes are not automatically rolled back with Worker code.
- Cloudflare Containers support pre-built container images, but current scaling/routing still requires explicit application control; this spec therefore does not assume transparent autoscaling.

These platform features support the architecture above but do not replace SmartAIHub's own canonical job state, fencing, recovery or provider-capacity rules.

---


## 38.1 Cloudflare implementation reference links

Implementation agents SHALL re-check these official documents at the start of each production promotion wave because product limits and rollout semantics can change:

- Queues delivery guarantees: `https://developers.cloudflare.com/queues/reference/delivery-guarantees/`
- Queues limits: `https://developers.cloudflare.com/queues/platform/limits/`
- Queues DLQ: `https://developers.cloudflare.com/queues/configuration/dead-letter-queues/`
- Queues consumer concurrency: `https://developers.cloudflare.com/queues/configuration/consumer-concurrency/`
- Workflows limits: `https://developers.cloudflare.com/workflows/reference/limits/`
- Workflows sleep/retry: `https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/`
- Hyperdrive query caching: `https://developers.cloudflare.com/hyperdrive/concepts/query-caching/`
- Hyperdrive private DB via Workers VPC: `https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/`
- Workers versions/deployments: `https://developers.cloudflare.com/workers/versions-and-deployments/`
- Workers gradual deployments: `https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/`
- Workers rollbacks: `https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/`
- Containers deployment: `https://developers.cloudflare.com/containers/guides/deploy/`
- Containers scaling/routing: `https://developers.cloudflare.com/containers/configuration/scaling-and-routing/`
- Workers pricing: `https://developers.cloudflare.com/workers/platform/pricing/`
- Queues pricing: `https://developers.cloudflare.com/queues/platform/pricing/`
- Queues pull consumers: `https://developers.cloudflare.com/queues/configuration/pull-consumers/`
- Containers pricing: `https://developers.cloudflare.com/containers/platform/pricing/`
- Containers limits/instance types: `https://developers.cloudflare.com/containers/platform/limits/`
- Workers VPC pricing/status: `https://developers.cloudflare.com/workers-vpc/platform/pricing/`
- KV pricing: `https://developers.cloudflare.com/kv/platform/pricing/`
- Vectorize pricing: `https://developers.cloudflare.com/vectorize/platform/pricing/`
- Workers Logs: `https://developers.cloudflare.com/workers/observability/logs/workers-logs/`
- Workers Tracing: `https://developers.cloudflare.com/workers/observability/traces/`
- R2 pricing: `https://developers.cloudflare.com/r2/pricing/`
- PlanetScale pricing: `https://planetscale.com/pricing`
- Cloudflare Pro plan: `https://www.cloudflare.com/plans/pro/`

A copied numeric limit in this spec is a reviewed baseline, not permission to skip deployment-time verification.

# 39. Final architecture principle

The implementation SHALL preserve this rule above all others:

> **Once SmartAIHub accepts a job, the system must always be able to explain what happened to it and what will happen next.**

A production job may be:

```text
waiting for known capacity
queued with known transport state
owned by a known executor
waiting on a known provider
recovering from a known failure
completed with durable output
cancelled by a known authority
failed terminally with an explicit reason
```

It may not be:

```text
"we sent it somewhere and do not know what happened."
```
