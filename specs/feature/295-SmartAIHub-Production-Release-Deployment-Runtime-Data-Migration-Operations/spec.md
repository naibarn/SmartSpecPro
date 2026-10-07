# SPEC-295 — SmartAIHub Unified Production Environment, Release, Deployment, Data Migration & Runtime Operations Fabric
## Cross-Service Release Sets, Cloudflare Runtime Topology, Schema Safety, Drift Detection, Health Projection & Production ChatOps Contract

**Status:** Proposed / Additive / Implementation-ready candidate  
**Spec ID:** 295  
**Stable semantic identity:** `smartaihub.production-release-deployment-runtime-migration-operations`  
**Revision:** R1.3 — additive SPEC-304 stable App identity integration
**Date:** 2026-10-06  
**Target repository path:** `specs/feature/295-production-release-deployment-runtime-data-migration-operations/spec.md`  
**Primary UI surface:** Admin → Platform Operations / Production Operations; App/Tenant deployment views consume scoped projections  
**Primary architectural role:** Normalized production environment/release/deployment/migration/runtime projection + cross-service release safety contract  
**Implementation rule:** ADDITIVE ONLY. This spec MUST NOT create a second deployment executor, second queue, second resource provisioner, second migration engine, second secret store, or second application lifecycle authority.

> **Numbering / G0 verification:** The canonical `naibarn/SmartSpecPro/specs/feature` inventory checked on 2026-10-06 had no `293-*`, `294-*`, or `295-*` directory at that observation time. Because parallel sessions may allocate numbers after that observation, implementation MUST re-run G0 immediately before commit. Stable semantic identity `smartaihub.production-release-deployment-runtime-migration-operations` is the durable dependency key; numeric ID 295 is accepted only when the current canonical inventory remains collision-free.

## G0 — Canonical slot, authority and deployed-topology discovery

Before creating schema/code or provider mutations, implementation SHALL:

1. re-read canonical `specs/feature` inventory, active Handoff/status records, active worktrees/PRs and any registered spec index;
2. resolve current revisions/semantic identities for SPEC-261, 267, 288, 293 and 294 plus current incident/monitoring authorities;
3. verify that numeric slot 295 still maps to this semantic identity or renumber safely before commit;
4. inventory existing deployment/migration/runtime tables, Cloudflare adapters, Wrangler/Terraform/GitOps controllers and production receipts so no second authority is created;
5. inventory live production topology and provider account/zone/project IDs read-only before designing reconciliation;
6. record the G0 evidence snapshot in the implementation Handoff.

A G0 mismatch is a planning/integration blocker, not permission to overwrite another Spec or deployed authority.

---

# 0. Executive Decision

SmartAIHub SHALL add a unified **Production Operations Fabric** that can answer, for every production or staging environment:

1. Which source revision is canonical?
2. Which build and artifact correspond to that source?
3. Which release is intended for the environment?
4. Which Worker version(s) are actively serving traffic and at what percentages?
5. Which Container images/instances are running, ready, unhealthy, inactive, failed or stopped?
6. Which database schema revision is active, which migration is next, and is it compatible with every active code version?
7. Which Queues are backlogged, how much consumer concurrency is active, and what downstream work is affected?
8. Which Workflows are queued/running/waiting/errored/rolling back?
9. What is the current state of Durable Objects, Hyperdrive, D1/PostgreSQL, R2, KV, Vectorize and other bound Cloudflare services?
10. Is production behind source, ahead of recorded source, partially rolled out, drifted, degraded, or unknown?
11. What must happen next to safely promote, finish, rollback, or repair a release?
12. What evidence proves the answer?

The Fabric is a **correlation, release-safety, projection, reconciliation and evidence layer**. Provider-specific execution remains with existing authorities.

```text
Source / Spec / Handoff
        │
        ▼
 Build / Package / Artifact
        │
        ▼
     ReleaseSet
        │
  ┌─────┼─────────────────────────────────────────────┐
  ▼     ▼       ▼        ▼        ▼       ▼          ▼
Worker DB Mig  Container Queue   Workflow  Storage   Config/Routes
  │     │       │        │        │       │          │
  └─────┴───────┴────────┴────────┴───────┴──────────┘
                    │
                    ▼
             EnvironmentRevision
                    │
         Runtime Health + Verification
                    │
                    ▼
              SPEC-294 UI / Chat
```

---

# 1. Authority Boundaries

| Concern | Canonical owner / authority consumed by SPEC-295 |
|---|---|
| App package/release/deploy lifecycle | SPEC-261 SPAAS |
| SmartAIHub Cloudflare production topology, migration/control-plane placement, control-plane deploy/rollback | SPEC-267 |
| Resource provisioning/provider selection/resource registry | SPEC-288 Resource Fabric |
| Git/repository/source lineage | SPEC-293 |
| Development status/UI/Chat aggregation | SPEC-294 |
| Development execution lifecycle | SPEC-224 |
| Command ingress/approval/authority routing | SPEC-279 |
| Canonical Spec lifecycle/requirements | `tools/spec_handoff` + canonical Handoff contract |
| Jobs/leases/fencing/idempotency | existing `worker_jobs` / event / outbox authorities |
| Secrets | existing credential/secrets authority (including SPEC-272 contracts where active) |
| Operational incidents/problems/changes | current canonical Reliability / Incident authority (Spec 228 where active); SPEC-295 projects links/impact only |
| User-configurable monitoring/alert evaluation | current canonical Monitoring/Alert authority (Spec 238 where active); SPEC-295 exposes production signals as inputs only |

SPEC-295 owns the normalized **production environment snapshot**, **cross-service release set**, **migration compatibility contract**, **drift/reconciliation model**, and **operational projection schema**. It does not perform provider mutations directly.

---

# 2. Core Invariants

```text
GIT COMMIT ≠ BUILD
BUILD ≠ ARTIFACT
ARTIFACT ≠ RELEASE
RELEASE ≠ DEPLOYMENT
DEPLOYMENT ≠ 100% TRAFFIC
DEPLOYED ≠ HEALTHY
HEALTHY ≠ VERIFIED
VERIFIED ≠ ACCEPTED

SCHEMA APPLIED ≠ SCHEMA VERIFIED
SCHEMA CURRENT ≠ SCHEMA COMPATIBLE WITH ALL ACTIVE CODE VERSIONS

WORKER SERVICE ≠ MANAGED REPLICA SET
CONTAINER INSTANCE ≠ WORKER INVOCATION
QUEUE CONSUMER CONCURRENCY ≠ CONTAINER INSTANCE COUNT

RESOURCE EXISTS ≠ RESOURCE HEALTHY
PROVIDER DASHBOARD STATE ≠ SMARTAIHUB AUTHORITY TO MUTATE
UNKNOWN ≠ HEALTHY
STALE ≠ FAILED
```

---

# 3. Production Environment Model

```text
ProductionEnvironment
  environment_id
  owner_scope: PLATFORM | TENANT | USER | CUSTOMER
  project_id?
  app_id?
  name
  class: DEVELOPMENT | PREVIEW | STAGING | CANARY | PRODUCTION | DR
  provider_accounts[]
  region_policy?
  release_policy_id
  deployment_policy_id
  migration_policy_id
  authorization_scope_ref
  current_environment_revision_id?
```

An environment may span multiple repositories and multiple Cloudflare products.

---

# 4. Environment Revision

An `EnvironmentRevision` is the immutable observed/declared composition of one environment at a point in time.

```text
EnvironmentRevision
  environment_revision_id
  environment_id
  release_set_id?
  observed_at
  provider_observation_id
  source_revisions[]
  artifact_digests[]
  service_deployments[]
  schema_revisions[]
  configuration_revision
  secret_reference_epoch
  traffic_state
  verification_state
  health_state
  freshness
  coverage
```

It MUST be possible to compare two revisions and explain every changed service, schema, binding, route, artifact or traffic allocation.

---

# 5. ReleaseSet — Cross-Service Release Unit

A SmartAIHub release may require coordinated changes across more than one runtime resource.

```text
ReleaseSet
  release_set_id
  project_id/app_id
  source_baseline[]
  artifact_set[]
  target_environment_id
  dependency_graph
  migration_set_id?
  worker_versions[]
  container_images[]
  workflow_revisions[]
  configuration_changes[]
  required_secrets_epoch?
  rollout_strategy
  rollback_strategy
  state
  created_by
  approved_by?
```

Release states:

```text
DRAFT
PREFLIGHT
BLOCKED
READY
DEPLOYING
PARTIALLY_DEPLOYED
VERIFYING
ACTIVE
DEGRADED
FAILED
ROLLBACK_REQUIRED
ROLLING_BACK
ROLLED_BACK
SUPERSEDED
```

A ReleaseSet is not necessarily one Git commit; multi-repo releases must pin every input revision.

---

# 6. Deployment Target and Service Topology

Every runtime/service is a node in a typed topology graph.

```text
ServiceNodeKind
  WORKER
  PAGES
  CONTAINER_APP
  CONTAINER_INSTANCE
  QUEUE
  WORKFLOW
  DURABLE_OBJECT_NAMESPACE
  HYPERDRIVE
  POSTGRESQL
  D1
  R2_BUCKET
  KV_NAMESPACE
  VECTORIZE_INDEX
  AI_GATEWAY
  WORKERS_AI
  CRON_TRIGGER
  SERVICE_BINDING
  DOMAIN_ROUTE
  DNS_ZONE
  WAF_POLICY
  SECRET_REFERENCE
  EXTERNAL_SERVICE
```

Typed edges include:

```text
ROUTES_TO
CALLS
BINDS_TO
PRODUCES_TO
CONSUMES_FROM
PERSISTS_TO
INDEXES_FROM
USES_POOL
TRIGGERS
DEPENDS_ON
AUTHENTICATES_WITH
SERVES_DOMAIN
MIGRATES
```

Topology SHALL be queryable by project, App, environment, release, tenant, repository and Cloudflare account.

---

# 7. Cloudflare Workers Projection

Cloudflare Workers versions and deployments MUST be modeled separately.

```text
WorkerServiceProjection
  worker_service_id
  environment_id
  source_sha?
  build_id?
  uploaded_versions[]
  active_deployment_id
  active_versions[]:
    version_id
    version_tag?
    source_sha?
    artifact_digest?
    traffic_percentage
  routes/domains[]
  bindings_revision
  compatibility_date
  observability_health
  invocation_rate
  error_rate
  latency_summary?
  freshness
```

A deployment MAY have two active versions with traffic split. `production_version = latest Git SHA` is invalid unless evidence proves it.

Gradual deployment compatibility SHALL account for version skew across Worker-to-Worker service bindings.

---

# 8. Multi-Worker and Load Sharing Semantics

Cloudflare Worker invocations scale as a serverless runtime; SmartAIHub SHALL NOT invent a replica count for normal Workers.

Display instead:

```text
logical Worker services
active versions
traffic split
request/invocation rate
error rate
latency
queue consumer concurrency where applicable
service-binding dependency health
```

If architecture uses several logical Worker services for load/domain/functional partitioning, topology SHALL show all services and edges.

For Queue consumers, concurrency SHALL be shown as provider/runtime concurrency, not as persistent Worker replica count.

---

# 9. Cloudflare Containers Projection

```text
ContainerApplicationProjection
  application_id
  worker_owner_id
  scheduling_policy
  desired_image
  rollout_image?
  rollout_state
  desired_instance_count?      # only where application policy defines it
  observed_instances[]
  health_summary
  cold_start_summary?
  freshness

ContainerInstanceProjection
  instance_id
  application_id
  image
  state
  ready
  updated_at
  started_at?
  exit_code?
  memory_mib?
  vcpu?
  disk_mb?
  location?
  last_health_check?
  restart_count?
  work_binding?
```

Normalized lifecycle includes provider states such as:

```text
PROVISIONING
RUNNING_NOT_READY
READY
UNHEALTHY
FAILED
INACTIVE
STOPPING
STOPPED
UNKNOWN
```

Current Cloudflare Container behavior MUST be represented by a capability manifest because scheduling, autoscaling, rollout and routing semantics evolve. The UI MUST distinguish provider-managed autoscaling, full/manual strategies, Durable-Object-controlled scheduling and any future strategies by capability; it MUST NOT assume autoscaling is future-only or equate any strategy with a fixed replica set.

---

# 10. Queues Projection

Queue state SHALL distinguish realtime point observations from analytics windows. A provider adapter MUST NOT populate an exact-looking field from an averaged/time-bucket metric without its observation semantics.

```text
QueueProjection
  queue_id
  producers[]
  consumers[]
  realtime_metrics?:
    backlog_count?
    backlog_bytes?
    oldest_message_timestamp?
    observed_at
  analytics_metrics?:
    backlog_messages_avg?
    backlog_bytes_avg?
    consumer_concurrency_avg_or_summary?
    ingress_rate?
    processed_rate?
    failure_rate?
    retry_rate?
    window_start
    window_end
  max_concurrency?
  dlq_id?
  health
  freshness
  coverage
```

Mission Control MUST be able to correlate queue pressure with affected jobs/specs/services while preserving whether the pressure value is realtime or windowed.

---

# 11. Workflows Projection

```text
WorkflowProjection
  workflow_name
  instances_by_state
  running_instances[]
  waiting_instances[]
  errored_instances[]
  rollback_instances[]
  step_failure_summary
  duration_summary
  health
  freshness
```

Normalized instance states SHALL preserve provider distinctions including queued, running, paused, waiting, errored, terminated, complete and rollback outcome.

---

# 12. Durable Objects Projection

Track namespace-level and, when authorized/needed, object-level operational health:

```text
requests
errors
cpu time
memory percentiles
storage bytes
subrequests
websocket health?
selected object IDs/names?
```

DO state MUST NOT be inferred from Worker version alone. Durable Object migrations are a separate migration class.

---

# 13. Hyperdrive Projection

Hyperdrive telemetry SHALL preserve metric-window/sample semantics rather than presenting analytics summaries as exact instantaneous pool state.

```text
HyperdriveProjection
  config_id
  database_target_ref
  metric_observations[]:
    metric_name
    value_or_summary
    observation_kind
    window_start?
    window_end?
    observed_at
    confidence
  configured_max_pool_size?
  health
  freshness
  coverage
```

Pool contention can be a first-class blocker/cause candidate for production degradation, but causality requires mapped evidence.

---

# 14. Database & Schema Migration Fabric

Database migration status is first-class production state.

```text
MigrationSet
  migration_set_id
  release_set_id
  target_environment_id
  migration_units[]
  compatibility_policy
  rollback_policy
  backup_restore_evidence
  state

MigrationUnit
  migration_unit_id
  engine: POSTGRESQL | D1 | DURABLE_OBJECT_SQLITE | OTHER
  database_target_id
  source_repository_id
  source_sha
  migration_id
  checksum
  predecessors[]
  direction: EXPAND | BACKFILL | SWITCH | CONTRACT | REPAIR
  compatibility_class
  destructive_class
  lock/fence_ref
  state
  started_at?
  applied_at?
  verified_at?
  applied_by?
  row_progress?
  evidence_refs[]
  rollback_or_restore_ref?
```

Migration states:

```text
DISCOVERED
PLANNED
PREFLIGHT
READY
WAITING_DEPENDENCY
WAITING_LOCK
RUNNING
BACKFILLING
APPLIED_UNVERIFIED
VERIFIED
FAILED
REPAIR_REQUIRED
ROLLBACK_REQUIRED
ROLLED_BACK
SUPERSEDED
DRIFT_DETECTED
```

---

# 15. Zero-Downtime Expand/Contract Migration Contract

For schema changes used by multiple active application versions, the safe default is:

```text
1. PRECHECK / backup + restore evidence
2. EXPAND schema (backward-compatible)
3. Deploy code compatible with old + new schema
4. BACKFILL if required
5. Shift reads/writes / traffic
6. Verify all active versions + data invariants
7. Remove old version traffic
8. CONTRACT schema only after compatibility proof
```

A destructive/contract migration MUST NOT proceed while an incompatible old Worker or Container version can still receive traffic.

This rule is especially important during gradual Worker deployments, where two versions may be active concurrently.

---

# 16. PostgreSQL Migration Contract

SPEC-295 does not mandate one migration tool. The registered adapter SHALL expose:

```text
current schema revision
migration history/checksums
unapplied migrations
migration dependencies
migration lock/fencing
transactional capability
backup/restore point
apply result
verification result
schema drift
```

File timestamp or filename order alone MUST NOT establish migration authority.

Migration checksum/revision and exact source SHA are mandatory evidence.

---

# 17. D1 Migration Contract

D1 adapters SHALL correlate source migration files with the provider database migration history. D1 migration identity SHOULD use stable database identity rather than mutable binding names.

The production projection SHALL show:

```text
expected migration sequence
applied migration sequence
unapplied migration sequence
migration table identity
source SHA/checksum
provider apply outcome
verification outcome
```

---

# 18. Durable Object Migration Contract

Durable Object class/storage migrations MUST be represented separately from ordinary Worker version traffic because provider deployment semantics differ.

Release planning SHALL identify:

```text
DO class migration required?
old/new Worker compatibility
storage migration sequence
deploy command/path constraints
rollback feasibility
```

---

# 19. Storage & Data-Service Projections

## 19.1 R2

Track at minimum bucket identity, binding, operation/error health, storage usage, bandwidth, lifecycle policy health and source/deployment binding.

## 19.2 KV

Track namespace identity, operations/error health, storage, binding/config revision and stale/unknown observations.

## 19.3 Vectorize

Track index identity, dimensions/metric/config, namespaces where applicable, index availability, ingestion job freshness, last successful mutation/backfill and application-level coverage. Native provider events/metrics MAY be consumed, but ingestion completeness is an application-level fact and MUST NOT be inferred from index existence.

## 19.4 AI Gateway / Workers AI

Where used, adapters SHOULD expose request/error/latency, quota/capacity, provider/model routing health and cost/usage summaries without leaking prompts or secrets to unauthorized viewers.

---

# 20. Routes, Domains, Triggers, Bindings & Configuration Drift

Production correctness includes configuration, not code only.

Projection SHALL include:

```text
routes/domains
service bindings
queue bindings
R2/KV/D1/Vectorize/Hyperdrive bindings
cron triggers
compatibility settings
environment variables metadata
secret reference epoch (never plaintext)
WAF/security policy refs where relevant
```

Drift examples:

```text
CODE_MATCHES_CONFIG_DRIFTED
ROUTE_DRIFT
BINDING_DRIFT
TRIGGER_DRIFT
SECRET_EPOCH_STALE
RESOURCE_MISSING
UNEXPECTED_RESOURCE
```

---

# 21. Production Drift Model

Normalized drift dimensions:

```text
SOURCE_DRIFT
BUILD_DRIFT
ARTIFACT_DRIFT
RELEASE_DRIFT
DEPLOYMENT_DRIFT
TRAFFIC_DRIFT
SCHEMA_DRIFT
CONFIG_DRIFT
RESOURCE_DRIFT
HEALTH_DRIFT
OBSERVABILITY_DRIFT
```

Every drift finding SHALL include:

```text
expected
observed
source authority
observed_at
confidence
impact
recommended action
auto-repair eligibility
```

No destructive auto-repair is allowed merely because drift exists.

---

# 22. Release Dependency Graph

A ReleaseSet SHALL express prerequisites such as:

```text
expand DB migration
  → upload Worker version at 0%
  → smoke test explicit version
  → canary 5%
  → canary 25%
  → 50%
  → 100%
  → backfill/verification
  → contract migration
```

Other services may run in parallel when dependency predicates prove independence.

---

# 23. Rollout Strategies

Supported normalized strategies include:

```text
ALL_AT_ONCE
CANARY
GRADUAL_TRAFFIC
BLUE_GREEN
SHADOW
MANUAL_PROMOTION
JOB_DRAIN_AND_SWITCH
CONTAINER_RESTART_WAVE
```

Provider capabilities determine available strategies. Unsupported strategies MUST fail capability resolution, not silently degrade to another strategy.

---

# 24. Rollback & Recovery

Rollback planning MUST distinguish:

```text
code/version rollback
traffic rollback
configuration rollback
container image rollback
database rollback
restore-from-backup
compensating migration
workflow rollback
```

Schema/data rollback may be irreversible even when code rollback is easy. The UI MUST NOT display a generic “Rollback available” unless the relevant dimensions are actually recoverable.

---

# 25. Runtime Health Model

Use separate dimensions:

```text
LifecycleState
HealthState
Freshness
Coverage
VerificationState
TrafficState
```

Example:

```text
Container lifecycle = RUNNING
Health             = UNHEALTHY
Freshness          = FRESH
Coverage           = COMPLETE
```

or:

```text
Worker deployment  = ACTIVE
Health             = HEALTHY
Freshness          = STALE
```

`STALE` means the observation cannot prove current health.

---

# 26. Observability Sources

Adapters MAY consume:

- Cloudflare REST APIs;
- Cloudflare GraphQL Analytics API;
- Workers/Containers/R2/AI Gateway logs;
- provider events/event subscriptions;
- Wrangler/CI deployment receipts;
- SmartAIHub deployment receipts;
- worker_jobs/outbox/runtime events;
- database migration ledgers;
- smoke/UAT evidence;
- application-provided health/version endpoints.

No single provider dashboard is the complete source of truth for release lineage.

---

# 27. Release & Deployment Receipts

Every production mutation SHOULD emit a durable receipt:

```text
DeploymentReceipt
  receipt_id
  release_set_id
  environment_id
  target_service_id
  provider
  source_revisions[]
  build_ids[]
  artifact_digests[]
  migration_set_id?
  provider_deployment_ids[]
  provider_version_ids[]
  traffic_before
  traffic_after
  initiated_by
  authority_snapshot
  started_at
  completed_at
  outcome
  verification_refs[]
  rollback_ref?
```

Receipts are evidence, not permission to mutate again.

---

# 28. Production Operations UI

Admin navigation:

```text
Admin
└─ Platform Operations
   ├─ Overview
   ├─ Environments
   ├─ Releases & Deployments
   ├─ Data Migrations
   ├─ Services & Topology
   ├─ Workers & Traffic
   ├─ Containers
   ├─ Queues & Workflows
   ├─ Databases & Hyperdrive
   ├─ Storage & Indexes
   ├─ Drift & Incidents
   ├─ Capacity & Cost
   └─ Audit / Evidence
```

User/Tenant App views expose only resources bound to the authorized App/environment.

---

# 29. Overview UI Contract

The overview SHOULD answer in one screen:

```text
Production revision
Latest source revision
Release status
Deployment drift
Schema/migration status
Traffic rollout
Critical unhealthy services
Queue backlog
Container unhealthy count
Workflow failures
DB pool pressure
Open incidents
Next safe action
```

Example:

```text
SMARTAIHUB / PRODUCTION
Source main          92ad881
Release              R-184 — BLOCKED
Workers              7 healthy / 1 gradual rollout
Traffic              API v41 80% | v42 20%
Containers           5 ready / 1 unhealthy / 2 inactive
DB schema            pg-0148 VERIFIED
Pending migration    pg-0149 CONTRACT — BLOCKED
Reason               old API v41 still serves 80%
Queues               media-jobs backlog ↑ 18,220
Workflows            14 running / 2 errored
Hyperdrive            waiting clients P95 high
Next action           finish v42 rollout, verify, then apply pg-0149
```

---

# 30. Data Migration UI

```text
Database: production-postgres
Current schema: 0148
Expected release schema: 0149

0147  VERIFIED
0148  VERIFIED
0149  READY / CONTRACT
      Blocked by: api-worker v41 still active at 80%
      Backup: verified
      Rollback: compensating migration required
      Source: main@92ad881
```

Backfills SHALL show progress, rate, ETA only when measurable, and invariant/error counts.

---

# 31. Containers UI

Show application and logical instances separately:

```text
Container App: media-render
Image: sha256:...
Policy: durable_object

Instances
ID       State       Ready   Region  Job       Age
A1       READY       yes     APAC    J-991     21m
A2       UNHEALTHY   no      APAC    J-994     4m
A3       INACTIVE    no      —       —         —
```

Do not present inactive/sleeping-by-policy instances as incidents unless policy requires them running.

---

# 32. Workers & Traffic UI

```text
api-worker
Current deployment D-184
v41 80%  commit 75c8210  HEALTHY
v42 20%  commit 92ad881  HEALTHY
Version skew risk: LOW
Schema compatibility: BOTH PASS
```

Traffic actions require explicit authority and SPEC-279 routing.

---

# 33. Queues & Workflows UI

Queues view SHOULD surface backlog trend, concurrency and DLQ impact. Workflows view SHOULD surface instance state and rollback outcome.

A queue backlog may explain a Spec/Job wait, but queue pressure MUST NOT automatically classify source code as failed.

---

# 34. ChatOps Contract

Read-only questions:

```text
"production ตอนนี้รัน revision ไหน?"
"main กับ production ต่างกันกี่ commit?"
"migration ไหนยังไม่ apply?"
"migration ไหน apply แล้วแต่ยังไม่ verify?"
"ทำไม pg-0149 ยังลงไม่ได้?"
"Worker ตัวไหนกำลัง canary?"
"container ไหน unhealthy และกระทบงานอะไร?"
"queue ไหน backlog โตเร็วสุด?"
"workflow ไหน rollback failed?"
"Hyperdrive ตัวไหน connection pool ตัน?"
"service ไหนไม่มี telemetry สด?"
```

Mutation requests such as deploy, promote traffic, retry workflow, restart container, apply migration or rollback MUST route through SPEC-279 and the canonical owner with approval/fencing/idempotency.

---

# 35. Release Safety Gates

Before production promotion, the registered policy SHALL evaluate applicable gates:

```text
source pinned
build/artifact immutable and verified
required CI/UAT evidence fresh
required handoff/requirements satisfied
migration preflight complete
backup/restore evidence current
schema compatibility with all active versions
secrets/bindings/routes validated
resource capacity/admission healthy
canary/smoke plan available
rollback/repair plan classified
authorization/approval current
no unresolved critical drift
```

Not every release requires every gate; applicability must be explicit.

---

# 36. Multi-Service Partial Deployment

Cross-service release is not an atomic transaction. SPEC-295 SHALL model:

```text
NOT_STARTED
PARTIALLY_DEPLOYED
PARTIALLY_VERIFIED
PARTIALLY_ROLLED_BACK
```

and show exactly which components changed.

Failure of one service MUST NOT falsely imply that already-applied database migrations or other service changes were automatically undone.

---

# 37. Reconciliation

Use event-driven updates where supported plus scheduled reconciliation.

Detect at least:

```text
OUT_OF_BAND_DEPLOYMENT
OUT_OF_BAND_MIGRATION
MISSING_DEPLOYMENT_RECEIPT
PROVIDER_VERSION_UNKNOWN
SCHEMA_CHECKSUM_DRIFT
CONTAINER_IMAGE_DRIFT
ROUTE_BINDING_DRIFT
QUEUE_CONSUMER_DRIFT
WORKFLOW_REVISION_DRIFT
RESOURCE_DELETED_OUT_OF_BAND
OBSERVABILITY_GAP
```

---

# 38. Security & Tenant Isolation

- Production source metadata and operational metrics are separately authorized.
- Raw secrets never enter projections.
- Database/table names MAY require redaction in tenant/user views.
- Provider account IDs and internal topology MAY be hidden from ordinary users.
- Cross-tenant aggregate counts apply authorization before aggregation.
- Mutation receipts include permission/authority snapshot references.
- Logs are untrusted content and cannot become Chat/system instructions.

---

# 39. Data Retention & Cost

Store durable release/deployment/migration/audit receipts long enough for rollback, incident review, tax/compliance and customer support policy.

High-volume telemetry SHOULD be retained in provider observability stores or summarized time-series systems rather than copied indefinitely into the operational database.

SPEC-295 SHALL define bounded retention tiers:

```text
hot operational projection
recent detailed telemetry
long-term summarized metrics
long-term immutable audit/evidence
```

---

# 40. SLO / Metrics

Track at least:

```text
deployment frequency
lead time source→production
deployment failure rate
rollback rate
mean time to recovery
source→production drift age
migration pending age
migration failure rate
container unhealthy duration
queue backlog age/growth
workflow error/rollback rate
Hyperdrive waiting-client pressure
stale telemetry count
unreconciled drift count
production query latency/freshness
```

---

# 41. Provider Capability Manifest

Each adapter SHALL declare capabilities and limitations dynamically.

Example:

```text
supports_gradual_worker_versions = true
max_active_worker_versions_per_deployment = 2
supports_container_instance_listing = true
supports_container_builtin_autoscaling = <observed capability>
supports_queue_concurrency_metrics = true
supports_workflow_instance_status = true
supports_d1_migration_history = true
```

Product evolution MUST NOT require rewriting core state semantics when provider capabilities change.

---

# 42. Implementation Phases

```text
P0  Register SPEC-295 + initialize canonical Handoff
P1  Read-only Environment/Service registry
P2  Source→Build→Release→Deployment lineage
P3  Worker versions/traffic + deployment receipts
P4  Database migration projection + compatibility gates
P5  Containers / Queues / Workflows adapters
P6  Hyperdrive / DO / D1 / R2 / KV / Vectorize projections
P7  Drift reconciliation + incident/attention model
P8  SPEC-294 UI/Chat integration
P9  Controlled mutations through SPEC-279/canonical owners
P10 Load/chaos/rollback/restore rehearsal
```

Read-only projection MUST precede mutation capability.

---

# 43. Acceptance Tests

Implementation MUST prove at least:

1. Git main can be newer than production without being mislabeled deployed.
2. One Worker deployment can show two active versions and correct traffic percentages.
3. A 0%-traffic version can be smoke-tested and remains distinct from active user traffic.
4. Service-binding version skew is represented as compatibility risk.
5. Worker invocations are not represented as replica counts.
6. Queue consumer concurrency is represented independently from Worker instances.
7. Container app lists multiple logical instances and preserves ready/unhealthy/inactive distinctions.
8. Container rollout/image change cannot hide an old still-running image.
9. Queue backlog rise links to affected jobs/services without marking code failed.
10. Workflow queued/running/waiting/errored/rollback outcomes remain distinguishable.
11. Hyperdrive waiting-client pressure becomes a health signal.
12. D1/Postgres schema revision is compared with expected release schema.
13. `APPLIED_UNVERIFIED` migration never appears as verified.
14. Contract migration is blocked while incompatible old code serves traffic.
15. Backfill progress and failure are persisted without claiming schema completion.
16. Multi-repo release pins every source revision.
17. Partial cross-service deployment remains partial; no fake transaction rollback.
18. Out-of-band provider deploy is detected as drift.
19. Out-of-band schema change/checksum mismatch is detected.
20. Secret values never enter projections/logging.
21. Production permissions are independent from Git repo read access.
22. Provider outage produces stale/unknown, not healthy.
23. Reconciliation can rebuild projection from receipts/provider state.
24. Rollback availability is dimension-specific; code rollback does not imply DB rollback.
25. SPEC-294 UI and Chat return the same production snapshot token.
26. User/Tenant App view cannot enumerate platform-global Cloudflare resources.
27. Resource Fabric remains provisioning authority and is not duplicated.
28. SPEC-267 remains SmartAIHub Cloudflare production/control-plane deployment authority.
29. SPAAS remains App lifecycle authority.
30. All mutations route through SPEC-279 and produce provenance/audit evidence.

---

# 44. Quality Gates

1. canonical spec-number/registry resolution;
2. authority non-duplication;
3. source/build/artifact/release/deploy identity chain;
4. immutable artifact digest binding;
5. environment isolation;
6. multi-repo release pinning;
7. Worker version/deployment separation;
8. gradual traffic split correctness;
9. version-skew compatibility;
10. Worker-no-fake-replica invariant;
11. container app/instance identity;
12. container readiness vs running distinction;
13. container image rollout drift;
14. queue backlog/concurrency correctness;
15. workflow state/rollback correctness;
16. DO migration separation;
17. Hyperdrive pool-pressure metrics;
18. database migration checksum/order/dependency tests;
19. migration lock/fencing tests;
20. applied-vs-verified separation;
21. expand/contract compatibility tests;
22. backfill resumability/idempotency tests;
23. backup/restore evidence tests;
24. destructive migration approval tests;
25. partial release state tests;
26. rollback dimensionality tests;
27. config/routes/bindings drift tests;
28. out-of-band deployment detection;
29. schema drift detection;
30. stale/coverage/unknown semantics;
31. provider capability manifest tests;
32. production authorization isolation;
33. secret redaction/non-disclosure;
34. authorization-before-aggregation;
35. webhook/event idempotency;
36. event ordering/reconciliation;
37. projection rebuild determinism;
38. Chat snapshot parity;
39. mutation SPEC-279 routing;
40. provider rate-limit/degraded-mode;
41. high-volume telemetry retention/cost bounds;
42. incident/drift attention deduplication;
43. mobile/tablet production read view;
44. accessibility/non-color state representation;
45. rollback/restore chaos rehearsal;
46. no production mutation from read-only collector;
47. audit receipt completeness;
48. user/tenant/platform environment scoping;
49. SPEC-293 binding integration;
50. SPEC-294 projection integration.

---

# 45. 16-Pass Production Architecture Audit

| Pass | Lens | Gap/risk closed |
|---:|---|---|
| 1 | Authority | Prevented production dashboard from becoming a second deploy/resource/job authority |
| 2 | Traceability | Defined source→build→artifact→release→deployment→runtime chain |
| 3 | Environments | Added immutable environment revisions and multi-scope environments |
| 4 | Workers | Separated versions, deployments, traffic and serverless invocation scaling |
| 5 | Containers | Added app/image/instance/ready/health lifecycle and explicit scaling capability model |
| 6 | Queues | Added backlog/concurrency/DLQ and causal impact projection |
| 7 | Workflows | Preserved queued/running/waiting/error/rollback semantics |
| 8 | Data migration | Added first-class PostgreSQL/D1/DO migration sets, checksums and fencing |
| 9 | Zero downtime | Added expand/backfill/switch/contract compatibility sequence |
| 10 | Cloudflare data services | Added Hyperdrive/DO/R2/KV/Vectorize/AI service projections |
| 11 | Drift | Added source/build/release/schema/config/resource/runtime reconciliation |
| 12 | Recovery | Separated code/traffic/config/container/schema/data rollback dimensions |
| 13 | Security | Split production authorization from source access and protected secrets/log content |
| 14 | UX/Chat | Defined production overview, migration, container, workers/traffic and conversational operations |
| 15 | Reliability | Added receipts, reconciliation, stale/unknown semantics, SLOs and chaos/restore gates |
| 16 | Portability | Added provider capability manifest so Cloudflare evolution does not leak into core semantics |

Audit outcome: **implementation-ready after G0 canonical registry resolution and normal authority review**.

---

# 46. Cloudflare Capability Notes — 2026-10-06 Baseline

These observations inform adapters but are NOT permanent core invariants:

- Workers create versions separately from deployments; a deployment can serve one or two versions with traffic split.
- Gradual deployments require compatibility awareness because two Worker versions may serve users concurrently and Worker-to-Worker calls can experience version skew.
- Queue consumers can scale concurrency based on backlog/error behavior.
- Container instances expose lifecycle/health states; current scaling/routing capabilities are provider-version dependent and must be capability-discovered.
- Workflows expose queued/running/paused/waiting/errored/terminated/complete plus rollback outcome.
- D1 maintains an applied migration history table for its migration system.
- Hyperdrive exposes query latency, cache and pool/waiting-client metrics.
- Durable Objects, R2 and KV expose product-specific operational metrics through Cloudflare observability/analytics interfaces.

The adapter capability manifest SHALL be refreshed as Cloudflare evolves.

---



# 47. Traffic Groups & Multi-Service Load Sharing

When architecture intentionally distributes load across multiple logical services, SPEC-295 SHALL represent an explicit `TrafficGroup` rather than pretending the services are replicas of one Worker.

```text
TrafficGroup
  traffic_group_id
  environment_id
  entrypoint
  strategy:
    PROVIDER_SERVERLESS
    ROUTE_PARTITION
    VERSION_SPLIT
    WEIGHTED_SERVICE_TARGETS
    QUEUE_CONSUMER_POOL
    CONTAINER_INSTANCE_POOL
    FAILOVER
  targets[]
  weights_or_routing_rules[]
  health_policy
  failover_policy?
  observed_distribution?
```

Examples:

- one Worker service automatically handling global invocations: `PROVIDER_SERVERLESS`;
- two versions of one Worker at 80/20: `VERSION_SPLIT`;
- API gateway routing `/media/*` to a media Worker and `/chat/*` to a chat Worker: `ROUTE_PARTITION`;
- Queue consumer concurrency: `QUEUE_CONSUMER_POOL`;
- multiple stateless Containers selected by an application-defined pool: `CONTAINER_INSTANCE_POOL`.

The UI MUST show the actual load-sharing primitive. It MUST NOT display one generic "replica count" across Workers, Queues and Containers.

---

# 48. Cloudflare Service Coverage Matrix

The Fabric SHALL discover and project only resources actually bound to the environment, while supporting these adapter classes:

| Service | Identity/state to project | Primary operational signals |
|---|---|---|
| Workers | service, version, deployment, traffic, routes, bindings | requests/invocations, errors, latency, version skew |
| Pages | project/deployment/source revision/domain | deployment outcome, source commit, availability |
| Containers | app, image, instance, lifecycle, readiness, placement | unhealthy/failed/restart/cold-start/resource state |
| Queues | queue, producer, consumer, DLQ | backlog, bytes, concurrency, retries/failures |
| Workflows | definition + instance IDs | queued/running/waiting/error/rollback/duration |
| Durable Objects | namespace/class/object where scoped | requests, errors, memory, storage, CPU, websocket health |
| Hyperdrive | config + database target | query/connection latency, cache, pool size, waiting clients |
| D1 | database + migration history | schema revision, migration state, query/storage health |
| PostgreSQL / managed DB | connection/resource identity | schema revision, locks, pool, latency, availability |
| R2 | bucket + bindings | operations/errors, storage, bandwidth, access-log health |
| KV | namespace + bindings | operations/errors, storage |
| Vectorize | index + config + ingestion lineage | availability, mutation freshness, coverage/backfill health |
| AI Gateway | gateway | provider/model errors, latency, cost/usage where authorized |
| Workers AI | model/runtime bindings | error/quota/capacity/usage where authorized |
| Cron Triggers | trigger + target | schedule revision, last/next observed run, failures |
| Domains/Routes/DNS | hostname/route/zone | routing/config drift, reachability |
| WAF/Security policies | policy refs | critical policy drift / relevant security events |
| Secrets/Bindings | reference/epoch only | missing/stale reference; never raw value |
| Observability/Issues | dataset/issue ref | telemetry freshness, incidents, real-time issues |

A service adapter MAY report `UNSUPPORTED` for provider data that is not exposed. `UNSUPPORTED`, `UNKNOWN`, `STALE`, `NOT_BOUND`, and `HEALTHY` are distinct outcomes.

---

# 49. Platform vs App Operations Surfaces

The same projection may power different authorized surfaces:

```text
Platform Admin
  → complete SmartAIHub production topology and cross-service dependencies

Tenant Admin
  → tenant-bound Apps, releases, databases and runtime resources

User / Creator
  → own App/Mini App deployment status and safe actions

Customer external org
  → only explicitly shared environment/release resources
```

Platform-wide capacity, account IDs, internal DB topology and unrelated service health MUST NOT leak into ordinary App views.

---

# 50. Final Architectural Invariant

> **Production truth is a chain of evidence, not a Git branch name.**

> **A release is safe only when code, schema, configuration, traffic, runtime health and required evidence are mutually compatible.**

> **The platform may observe all production dimensions in one place, but every mutation remains with the canonical owner that already controls that dimension.**


---

# 51. R1.1 — Migration Execution Safety, Desired-State Authority, Edge Configuration & Provider-Semantics Amendment

This amendment is normative and additive. SPEC-295 continues to define production projection, release-safety and reconciliation contracts only. Existing migration executors, deployment authorities, Cloudflare adapters, Resource Fabric, worker_jobs/outbox, secrets and incident systems remain canonical owners of their mutations.

## 51.1 Database migration lock, timeout and online-change safety

`WAITING_LOCK` is not sufficient by itself. Every database adapter that can execute or assess migrations SHALL publish execution-safety capability/facts appropriate to its engine.

Extend MigrationUnit:

```text
MigrationExecutionSafety
  migration_unit_id
  engine
  estimated_lock_class:
    NONE
    METADATA
    ROW
    TABLE
    EXCLUSIVE
    ENGINE_SPECIFIC
    UNKNOWN
  lock_timeout_policy?
  statement_timeout_policy?
  transaction_mode:
    TRANSACTIONAL
    NON_TRANSACTIONAL
    MIXED
    UNKNOWN
  online_operation_supported?
  long_transaction_risk
  connection_pool_impact
  write_amplification_risk
  disk_space_risk
  preflight_evidence_refs[]
```

Rules:

- the spec MUST NOT assume every DDL statement is transactional or online;
- destructive/high-lock migration requires explicit policy evaluation;
- an executor timeout MUST NOT be interpreted as proof that the database rolled back safely;
- before retry after uncertain failure, reconcile migration ledger/schema state;
- concurrent-index/online-DDL capabilities are engine/tool-specific and must be capability-discovered;
- migration evaluation SHOULD account for active long transactions and pool pressure when the adapter exposes them.

## 51.2 Read/write compatibility and cutover modes

Schema compatibility MUST model readers and writers, not only “old/new version compatible”.

Add:

```text
DataAccessCompatibility
  data_contract_id
  schema_revision
  reader_versions[]
  writer_versions[]
  read_mode:
    OLD_ONLY
    NEW_ONLY
    DUAL_READ
    COMPAT_READ
  write_mode:
    OLD_ONLY
    NEW_ONLY
    DUAL_WRITE
    COMPAT_WRITE
  backfill_required
  backfill_state
  invariant_checks[]
  cutover_fence_ref?
```

For dual-write/backfill transitions:

- writes SHOULD be idempotent or have duplicate/conflict handling;
- backfill progress MUST have a durable cursor/checkpoint where feasible;
- switching reads/writes requires evidence that active code versions support the target mode;
- `BACKFILL_COMPLETE` is not equivalent to data correctness until invariants/verification pass;
- cutover should be fenced against concurrent incompatible deployment/migration changes.

## 51.3 Tenant/cohort/shard migration waves

A single logical migration may apply progressively across tenant/data cohorts even when the schema is shared.

Add:

```text
MigrationCohort
  cohort_id
  migration_unit_id
  scope_kind:
    GLOBAL
    TENANT_SET
    ACCOUNT_SET
    SHARD
    PARTITION
    REGION
    CUSTOM
  scope_ref
  state
  cursor?
  rows_or_items_done?
  rows_or_items_total?
  failure_count?
  verification_state
  last_progress_at?
```

Rules:

- failure in one independent cohort MUST NOT falsely mark every cohort applied or failed;
- overall state derives from required cohort applicability/policy;
- cross-tenant UI aggregation follows authorization-before-aggregation;
- per-tenant/customer migrations MUST not leak identifiers through operational summaries;
- retry resumes from durable cohort progress instead of repeating already-verified work unless executor semantics require otherwise.

## 51.4 Desired-state authority / IaC ownership

Production resources may be controlled by Wrangler config, Terraform/OpenTofu, provider dashboard, SmartAIHub Resource Fabric, another GitOps/IaC system, or deliberate manual operations.

Add:

```text
DesiredStateAuthority
  resource_ref
  authority_kind:
    SMARTAIHUB
    WRANGLER_CONFIG
    TERRAFORM_OR_OPENTOFU
    GITOPS
    PROVIDER_MANUAL
    EXTERNAL_CONTROL_PLANE
    SHARED
    OBSERVE_ONLY
  authority_ref
  generation
  auto_repair_policy
  last_reconciled_at
```

Drift handling MUST NOT auto-repair a resource when another declared authority owns desired state.

A drift finding SHALL distinguish:

```text
OBSERVED_DRIFT
EXPECTED_EXTERNAL_CHANGE
UNAUTHORIZED_CHANGE
DESIRED_STATE_UNKNOWN
RECONCILIATION_REQUIRED
```

## 51.5 Edge delivery configuration: routes, DNS, TLS, WAF, cache and triggers

Production correctness includes edge delivery state, not just Worker code.

Extend configuration projection to include, where applicable:

```text
custom domains / routes
route specificity / precedence
DNS records
TLS/certificate health and expiry window
WAF/rate-limit policy refs
cache rules
cache purge/invalidation operation refs
cron triggers
service bindings
compatibility date/flags
environment-variable metadata
secret-reference epoch
```

Required findings include:

```text
ROUTE_CONFLICT
ROUTE_SHADOWED
DNS_TARGET_DRIFT
TLS_CERTIFICATE_DEGRADED
CACHE_INVALIDATION_PENDING
WAF_POLICY_DRIFT
CRON_TRIGGER_DRIFT
```

A release that changes cached/static behavior MAY declare cache invalidation as an applicable release step. “Deployment complete” MUST NOT imply caches are coherent when invalidation is required and pending.

## 51.6 Provider incident and regional degradation overlay

Cloudflare/platform incidents SHALL be modeled separately from application health.

```text
ProviderIncident
  provider
  incident_id
  affected_products[]
  affected_regions_or_locations[]
  severity
  state
  started_at
  updated_at
  resolved_at?
  source_ref
  freshness
```

Rules:

- provider incident ≠ proven cause of application failure;
- provider incident MAY raise attribution context/confidence when mapped service/location evidence overlaps;
- an unrelated global incident MUST NOT mark every environment unhealthy;
- region/location-specific degradation SHOULD correlate with Container placement/Hyperdrive/edge telemetry where available;
- provider-status unavailability produces `UNKNOWN/STALE`, not healthy.

## 51.7 Health confidence and observation windows

Health is derived from observations with different precision.

Add:

```text
HealthObservation
  subject_ref
  health_state
  confidence:
    AUTHORITATIVE
    HIGH
    MEDIUM
    LOW
    UNKNOWN
  observation_kind:
    EVENT
    POINT_IN_TIME
    WINDOWED_METRIC
    SAMPLE
    SYNTHETIC
    DERIVED
  observed_at
  window_start?
  window_end?
  sample_size?
  freshness
  coverage
  evidence_refs[]
```

UI/Chat MUST NOT convert:

- sampled Container rollout health into a full exact instance census;
- time-bucket queue backlog into exact instantaneous queue depth;
- averaged Hyperdrive waiting-client metrics into a current point count;
- 31-day analytics retention into durable audit history.

Exact state, sampled health and analytics trend are separate facts.

## 51.8 Cloudflare Container scheduling-policy semantics

Container projection SHALL model scheduling policy because rollout/instance semantics differ.

```text
ContainerApplicationProjection
  application_id
  scheduling_policy:
    DEFAULT_OR_MANAGED
    DURABLE_OBJECT_CONTROLLED
    OTHER
    UNKNOWN
  desired_image_ref
  rollout_id?
  max_instances?
  provider_health_summary?
  provider_health_summary_kind:
    FULL
    SAMPLED
    UNKNOWN
  instance_counts
  freshness
```

Rules:

- `running` MUST remain distinct from application readiness;
- readiness/health endpoint proof is separate from process-running state;
- with Durable-Object-controlled scheduling, image replacement may depend on application-controlled instance restart rather than one global rollout;
- provider rollout summaries based on samples MUST NOT be presented as exact all-instance truth;
- adapter MAY expose provider semantics such as active/assigned counts, but normalized UI SHALL explain what they mean instead of equating them to a fixed replica set;
- location/region is observational and may change after restart.

## 51.9 Cloudflare Queues, Workflows and metric semantics

### Queues

Queue backlog/concurrency metrics are analytics observations.

Projection SHALL record the metric window and distinguish:

```text
BACKLOG_METRIC_OBSERVED
BACKLOG_GROWING
CONSUMER_CONCURRENCY_OBSERVED
DLQ_CONFIGURED
DELIVERY_FAILURE_EVIDENCE
QUEUE_STATE_UNKNOWN
```

Do not claim exact message count at an arbitrary instant unless an authoritative point-state API provides that fact.

### Workflows

Workflow instance state and rollback outcome are separate dimensions.

```text
WorkflowInstanceProjection
  provider_instance_id
  execution_status:
    QUEUED
    RUNNING
    PAUSED
    WAITING
    WAITING_FOR_PAUSE
    ERRORED
    TERMINATED
    COMPLETE
    UNKNOWN
  rollback_outcome:
    NONE
    RUNNING_OR_INFERRED
    COMPLETE
    FAILED
    UNKNOWN
```

Where a provider API reports the main execution as `running` while rollback handlers execute, adapters SHALL preserve the rollback dimension rather than replacing the execution status with a fabricated generic `ROLLING_BACK` state.

## 51.10 Durable Object current and legacy migration semantics

Durable Object lifecycle MUST be capability/version aware.

Cloudflare adapters SHALL support the provider's current declarative class lifecycle model where available and legacy migration declarations where still supported, without treating them as ordinary SQL migration files.

Normalized DO class operation:

```text
DurableObjectClassChange
  worker_service_id
  class_identity
  storage_kind?
  operation:
    CREATE
    DELETE
    RENAME
    TRANSFER_OUT
    EXPECT_TRANSFER
    LEGACY_MIGRATION
    NONE
  target_class_or_worker_ref?
  external_binding_blockers[]
  destructive
  rollback_feasibility
  provider_model_version
  evidence_refs[]
```

Rules:

- delete/rename/transfer are lifecycle/data operations and require explicit evidence/policy;
- delete MUST be blocked when provider reports external bindings that prevent safe deletion;
- transfer requires both source and destination expectations where provider semantics demand it;
- tombstone/declarative reconciliation state MUST remain visible until provider reconciliation proves completion;
- switching from a legacy migration model to a newer declarative model is itself a migration requiring compatibility validation.

## 51.11 Operational changes not represented by source deploy

Production state can change without a new Git commit.

Add:

```text
OperationalChangeReceipt
  change_id
  environment_id
  change_kind:
    SECRET_ROTATION
    CONFIG_CHANGE
    FEATURE_FLAG
    TRAFFIC_CHANGE
    CACHE_INVALIDATION
    ROUTE_DNS_CHANGE
    MANUAL_DATA_REPAIR
    PROVIDER_POLICY_CHANGE
    INCIDENT_MITIGATION
    OTHER
  authority_ref
  actor_ref
  before_revision?
  after_revision?
  evidence_refs[]
  created_at
```

These changes participate in EnvironmentRevision and drift/history.

A runtime may therefore be `SOURCE_MATCHES` while `CONFIG_CHANGED_AFTER_RELEASE`.

# 52. R1.1 Provider Baseline Notes — verified 2026-10-06

The implementation SHALL capability-discover rather than freeze documentation assumptions. The following current Cloudflare semantics motivated R1.1:

- Workers deployments may actively split traffic across two versions; Worker versions capture code/assets/bindings/compatibility settings but do not version KV/R2/Durable Object/D1 data state.
- Containers distinguish process running from readiness; scheduling policy changes rollout semantics.
- Queue backlog and consumer concurrency are exposed as analytics metrics and therefore require time-window semantics.
- Workflows expose execution state separately from rollback outcome.
- Hyperdrive pool/waiting-client observations are analytics metrics with bounded retention.
- Durable Object class lifecycle now has a declarative class export/lifecycle model in addition to legacy migration flows; adapter behavior must be provider-version aware.

These are adapter-baseline facts, not permission to bypass canonical mutation authorities.

**Authority correction:** Provider-status feeds and production telemetry are observation sources only. Incident declaration/command/problem/change records remain with the current canonical Reliability/Incident authority (Spec 228 where active), and user-configurable monitor/alert policies remain with the current Monitoring/Alert authority (Spec 238 where active). SPEC-295 may project/link those records but MUST NOT create a competing incident state machine, alert evaluator or notification provider.

**Container baseline correction:** Any predecessor wording that implied Cloudflare Container autoscaling was merely a future capability is superseded by R1.1. Adapters SHALL discover current scheduling strategy/capabilities (including provider-managed or Durable-Object-controlled strategies where exposed) and preserve readiness separately from process-running state.

# 53. R1.1 Acceptance Additions

1. High-lock PostgreSQL migration cannot be labeled safe when lock/transaction capability is unknown.
2. Timed-out migration reconciles actual schema/ledger state before retry.
3. Dual-write transition records writer/read compatibility and cannot switch reads blindly.
4. Backfill completion without invariant verification remains unverified.
5. Per-tenant/cohort migration failure does not falsely mark unrelated cohorts failed/applied.
6. Drift on Terraform/GitOps-owned resource is reported without SmartAIHub auto-repair fighting the declared authority.
7. Route overlap/shadowing is visible before traffic promotion.
8. Required cache invalidation pending prevents “release fully verified” when policy marks it applicable.
9. Provider incident overlay does not automatically mark unrelated SmartAIHub services failed.
10. Sampled Container rollout health is not presented as a full exact instance count.
11. Container process `running` without readiness proof is not rendered `READY`.
12. Queue backlog analytics includes observation window and is not phrased as exact instantaneous depth.
13. Workflow rollback outcome remains visible while provider execution status remains running.
14. Durable Object delete is blocked/reconciled when external bindings still reference the class/namespace.
15. Legacy→declarative Durable Object lifecycle transition is explicit and not silently mixed.
16. Secret rotation/config/feature-flag/manual repair creates an EnvironmentRevision even without source SHA change.
17. Production can be `SOURCE_MATCHES + CONFIG_CHANGED_AFTER_RELEASE`.
18. TLS/certificate/DNS/WAF health can degrade an environment independently of code health.
19. Migration cohort summaries authorize before aggregate.
20. Provider/analytics telemetry outage yields stale/unknown with preserved last observation.

# 54. R1.1 Quality-Gate Additions

41. migration lock/timeout/transaction-capability tests;
42. uncertain-timeout reconciliation-before-retry tests;
43. dual-read/dual-write/backfill cutover tests;
44. tenant/cohort/shard migration isolation tests;
45. IaC/desired-state authority and no-fighting-controller tests;
46. route/DNS/TLS/WAF/cache/cron drift tests;
47. provider incident mapping/non-causality tests;
48. health-confidence/window/sample semantics tests;
49. Container scheduling-policy and running-vs-ready tests;
50. Container sampled-rollout vs exact-instance tests;
51. Queue analytics window/exactness tests;
52. Workflow execution-status/rollback-dimension tests;
53. Durable Object declarative/legacy lifecycle compatibility tests;
54. Durable Object external-binding destructive-operation tests;
55. OperationalChangeReceipt / config-after-source tests;
56. environment revision update without source commit tests.

# 55. Audit Passes 17–26

| Pass | Lens | Gap found | R1.1 resolution |
|---:|---|---|---|
| 17 | Migration execution | Lock/timeout/transaction semantics were too abstract | Added MigrationExecutionSafety and reconcile-before-retry |
| 18 | Data cutover | Compatibility did not explicitly model readers/writers/dual-write/backfill | Added DataAccessCompatibility and fenced cutover |
| 19 | Multi-tenant data | Migration was modeled too globally | Added MigrationCohort for tenant/shard/partition/region waves |
| 20 | Desired state | Drift auto-repair could fight Terraform/Wrangler/GitOps/manual authorities | Added DesiredStateAuthority and authority-aware drift |
| 21 | Edge delivery | DNS/TLS/route/cache/WAF details were under-modeled | Added route precedence, certificate, cache invalidation and policy drift |
| 22 | Provider incidents | Cloudflare/platform incident context had no normalized separation from app health | Added ProviderIncident overlay and no-false-causality rule |
| 23 | Health precision | Sample/window/event observations could collapse into one “health” truth | Added HealthObservation confidence/window/coverage semantics |
| 24 | Containers | Scheduling policy and running-vs-ready/provider-sampling nuances were incomplete | Added policy-aware Container projection |
| 25 | Queues/Workflows | Analytics windows and rollback-state semantics could be misrepresented | Added queue metric exactness and two-dimensional Workflow rollback projection |
| 26 | Durable Objects / config | Current declarative DO lifecycle and config-only production changes were incomplete | Added DO class lifecycle model plus OperationalChangeReceipt |

R1.1 cumulative audit count: **26 independent passes**.

# 56. R1.1 Final Architectural Invariant

> **Production truth is a versioned graph of source, artifacts, traffic, schema/data contracts, runtime resources, configuration, health observations and operational changes — not a single “deployed” flag.** SPEC-295 must preserve uncertainty, provider-specific semantics and desired-state ownership so safe next actions can be explained without creating a competing executor.

# 57. R1.2 — Artifact Provenance, Recovery, Multi-Target Migration & Capacity Amendment

This amendment is normative. It closes production-operation gaps that remain after R1.1 and corrects earlier base projections where point-in-time and windowed telemetry could be confused.

## 57.1 Pages deployment lifecycle projection

`PAGES` is a first-class `ServiceNodeKind` and SHALL have an explicit projection.

```text
PagesProjectProjection
  project_id
  environment_id
  source_mode: GIT_CONNECTED | DIRECT_UPLOAD | OTHER
  production_branch?
  production_deployments_enabled?
  preview_deployment_policy?
  current_production_deployment_id?
  current_preview_deployments[]
  deployments[]:
    deployment_id
    environment_kind: PRODUCTION | PREVIEW
    branch?
    commit_hash?
    commit_dirty?
    artifact_or_manifest_digest?
    build_config_hash?
    stage_states[]
    outcome
    url_ref?
    created_at
    finished_at?
  freshness
```

A Pages deployment SHALL NOT be inferred from Git branch state alone. Direct Upload deployments may lack normal Git provenance and therefore require artifact/manifest evidence instead.

## 57.2 Immutable artifact / image provenance and supply-chain evidence

Deployments SHALL pin immutable artifact identity whenever the runtime/provider supports it.

```text
ArtifactProvenance
  artifact_id
  artifact_kind: WORKER_BUNDLE | PAGES_MANIFEST | CONTAINER_IMAGE | PACKAGE | OTHER
  digest
  source_revisions[]
  build_id
  builder_identity_ref?
  build_recipe_digest?
  sbom_ref?
  signature_or_attestation_refs[]
  vulnerability_evidence_ref?
  created_at
```

Rules:

- mutable Container image tags are insufficient deployment identity; normalized production state SHOULD pin the image digest;
- provider-managed aliases MAY be shown for usability but never replace immutable digest/provenance where required;
- a release is not “same artifact” merely because version/tag labels match;
- SBOM/signature/attestation availability is evidence consumed from the canonical supply-chain/security authority, not a new signing engine owned by SPEC-295.

## 57.3 Recovery, backup, PITR and DR readiness

Production readiness includes the ability to recover stateful services according to policy.

```text
RecoveryReadinessProjection
  target_ref
  environment_id
  recovery_kind: BACKUP | PITR | REPLICA_FAILOVER | EXPORT | SNAPSHOT | OTHER
  provider_capability
  last_recovery_point?
  recovery_window_start?
  recovery_window_end?
  backup_or_bookmark_ref?
  replication_lag?
  policy_rpo?
  policy_rto?
  last_restore_rehearsal_at?
  last_restore_rehearsal_result?
  destructive_restore
  freshness
  evidence_refs[]
```

Rules:

- backup existence ≠ restore readiness;
- destructive restore requires explicit authorization and before/after evidence;
- D1 Time Travel/bookmark capability, PostgreSQL backup/PITR, R2/export strategies and other provider mechanisms are adapter-specific;
- rollback recommendations SHALL consider whether data/schema changes make code rollback insufficient or unsafe;
- DR environment health MUST remain separate from primary environment health.

## 57.4 Multi-target migration groups and partial-apply semantics

A release can require migrations across several databases/services that cannot be atomically committed together.

```text
MigrationGroup
  migration_group_id
  release_set_id
  migration_unit_refs[]
  dependency_graph
  atomicity: SINGLE_TARGET_ATOMIC | MULTI_TARGET_NON_ATOMIC | UNKNOWN
  compensation_plan_ref?
  state:
    PLANNED
    READY
    RUNNING
    PARTIALLY_APPLIED
    VERIFYING
    VERIFIED
    REPAIR_REQUIRED
    COMPENSATING
    FAILED
```

The system MUST NOT represent a non-atomic multi-target migration as one atomic transaction. Partial application requires explicit affected-target inventory and safe next action.

## 57.5 DataChangeSet for backfill, reindex and non-schema data evolution

Not every production data transition is a schema migration.

```text
DataChangeSet
  data_change_set_id
  release_set_id?
  target_refs[]
  kind: BACKFILL | REINDEX | REEMBED | COPY | REWRITE | CACHE_WARM | OTHER
  source_revision?
  algorithm_or_job_revision?
  cursor_or_checkpoint?
  total_estimate?
  completed_estimate?
  invariant_checks[]
  state
  evidence_refs[]
```

Examples include PostgreSQL backfills, Vectorize reindex/re-embedding, R2 object transformations and controlled KV data rewrites. Completion requires declared invariants, not only “job exited 0”.

## 57.6 Secret/config epoch compatibility during gradual rollout

Multiple active code versions may require overlapping configuration/credential compatibility.

```text
RuntimeConfigCompatibility
  environment_id
  config_key_or_contract_ref
  active_runtime_versions[]
  active_config_revision
  secret_reference_epoch
  compatibility:
    COMPATIBLE
    DUAL_EPOCH_REQUIRED
    OLD_VERSION_BLOCKS_ROTATION
    NEW_VERSION_BLOCKS_ROLLBACK
    UNKNOWN
  evidence_refs[]
```

Secret rotation/config changes MUST NOT assume all active Worker/Container versions read identical keys/formats. Retiring an old credential epoch requires proof that no authorized active runtime still depends on it.

## 57.7 Capacity, quota and plan-limit projection

Provider limits can become production blockers independently of code health.

```text
CapacityQuotaProjection
  resource_or_service_ref
  limit_kind
  hard_or_soft
  configured_limit?
  observed_usage?
  observation_window?
  remaining_capacity?
  state: NORMAL | APPROACHING_LIMIT | THROTTLED | EXCEEDED | UNKNOWN
  policy_threshold_ref?
  evidence_refs[]
  freshness
```

The projection MAY include Workers/Queues/Containers/R2/D1/Vectorize/AI/provider account quotas where provider APIs expose meaningful facts. Billing remains with the canonical billing/FinOps authority.

## 57.8 Change windows, freezes and emergency-change linkage

Release safety SHALL consume change-governance facts without creating a second change-management system.

```text
ChangeWindowProjection
  environment_id
  state: OPEN | FROZEN | EMERGENCY_ONLY | UNKNOWN
  policy_ref
  starts_at?
  ends_at?
  emergency_change_authority_ref?
  active_change_record_ref?
```

A release `READY` state cannot bypass an active production freeze when the canonical change policy requires approval. Emergency mitigation links to the incident/change authority and remains auditable.

## 57.9 Pages/Workers/Container promotion identity must survive mutable labels

Promotion comparison SHALL use immutable artifacts + configuration/environment generations, not branch/version/image display labels.

At minimum compare:

```text
source revision set
artifact digest set
runtime version IDs
configuration revision
secret-reference epoch
migration/data-change revision
route/traffic state
```

This rule applies equally to staging→production, preview→production, canary→production and rollback comparisons.

## 57.10 External dependency operational projection

Typed `EXTERNAL_SERVICE` nodes SHALL expose bounded operational facts when authorized.

```text
ExternalDependencyProjection
  service_ref
  provider_or_owner
  endpoint_or_capability_ref
  contract_health?
  availability_observation?
  latency_observation?
  rate_limit_or_quota_state?
  provider_incident_refs[]
  freshness
  coverage
```

An external dependency incident/degradation is context, not automatic proof of SmartAIHub root cause.

# 58. R1.2 Acceptance Additions

1. Queue realtime backlog and analytics backlog are represented with different observation semantics; averaged metrics never populate an exact-looking point field.
2. Hyperdrive windowed metrics are not rendered as exact instantaneous open/waiting-client counts unless the provider exposes point state.
3. Git-connected Pages production branch can advance without a successful Pages deployment and therefore remains `SOURCE_AHEAD_OF_PRODUCTION`.
4. Direct Upload Pages deployment can be proven through artifact/manifest evidence without inventing a Git commit.
5. Container production identity pins immutable image digest when available; mutable tag alone is insufficient.
6. Same release label with different artifact digest is detected as different production content.
7. Backup/bookmark existence without restore rehearsal/policy evidence is not labeled “recovery verified”.
8. D1/PostgreSQL restore/PITR capability is projected separately from normal deployment and requires authorization for destructive restore.
9. Non-atomic migration across PostgreSQL + D1/DO can reach `PARTIALLY_APPLIED` and cannot be reported atomically complete.
10. Backfill/reindex job exit without declared invariant verification does not complete its DataChangeSet.
11. Old runtime version depending on an old secret/config epoch blocks unsafe credential retirement.
12. Provider quota/throttling can degrade release/runtime readiness independently of source health.
13. Production freeze/change-window policy can block promotion without changing build correctness.
14. Emergency change retains incident/change authority links and cannot bypass audit.
15. Staging/production comparison uses immutable artifacts/config/migration identity, not display labels.
16. External dependency degradation is correlated but does not establish root cause automatically.

# 59. R1.2 Quality-Gate Additions

57. queue realtime-vs-windowed projection contradiction tests;
58. Hyperdrive point-vs-window metric semantics tests;
59. Pages Git-connected/direct-upload deployment-lineage tests;
60. artifact/image immutable-digest provenance tests;
61. artifact label/digest mismatch tests;
62. recovery/PITR/RPO/RTO/restore-rehearsal tests;
63. destructive-restore authorization/evidence tests;
64. multi-target non-atomic migration partial-apply/compensation tests;
65. DataChangeSet backfill/reindex invariant tests;
66. secret/config epoch gradual-rollout compatibility tests;
67. quota/capacity/throttle projection tests;
68. change-window/freeze/emergency-link tests;
69. immutable environment-promotion comparison tests;
70. external-dependency health/non-causality tests.

# 60. Audit Passes 27–36

| Pass | Lens | Gap found | R1.2 resolution |
|---:|---|---|---|
| 27 | Queue exactness | Base QueueProjection contradicted later analytics-window semantics | Replaced base projection with realtime-vs-windowed metric model |
| 28 | Hyperdrive exactness | Base pool fields could look point-in-time despite analytics provenance | Replaced with typed metric observations and confidence/window semantics |
| 29 | Pages | Service kind existed but no Pages build/deploy/preview projection | Added PagesProjectProjection |
| 30 | Artifact supply chain | Release/runtime identity could still rely on mutable image/version labels | Added immutable ArtifactProvenance/digest rules |
| 31 | Recovery/DR | Backup evidence existed but recovery/PITR/RPO/RTO readiness was not first-class | Added RecoveryReadinessProjection |
| 32 | Multi-target migrations | Multiple database/service migrations could be implied atomic | Added MigrationGroup partial/compensation semantics |
| 33 | Data evolution | Reindex/re-embedding/object rewrite did not fit schema-migration model cleanly | Added DataChangeSet |
| 34 | Secret/config skew | Gradual rollout could rotate credentials incompatible with old active versions | Added RuntimeConfigCompatibility |
| 35 | Capacity/change governance | Provider quotas and production freezes were not first-class release blockers | Added CapacityQuotaProjection + ChangeWindowProjection |
| 36 | External dependencies | Topology had EXTERNAL_SERVICE nodes without normalized operational semantics | Added ExternalDependencyProjection |

R1.2 cumulative audit count: **36 independent passes**.

# 61. R1.2 Final Architectural Invariant

> **Production safety depends on immutable artifact identity, recoverable state, compatible configuration/data evolution and truthful telemetry semantics — not merely successful deploy commands.** SPEC-295 must be able to explain what is running, what data/config it expects, how it can be recovered, and which external/provider constraints still make promotion unsafe.

# 62. P0 Source-to-Production Convergence Receipt

SPEC-293 owns source/workspace identity and canonical convergence. SPEC-295
consumes its verified integrated source receipt and continues the chain through
`SOURCE_SHA` → immutable `BUILD_ARTIFACT_DIGEST` → required/applied migration
state → deployment release → runtime revision(s) → health evidence →
`PRODUCTION_CONVERGED`. A Git merge, tag, build label, successful deploy command,
or one healthy instance is insufficient evidence by itself.

The convergence record binds project/repository, integrated SHA and authority
receipt to artifact digest, target/environment, deployment ID, migration group
and per-target outcomes, runtime product/instance revisions, rollout state,
health evidence, actor and timestamp. It supports Workers, Containers,
Workflows, Queues and multiple runtime instances, plus staged rollout and
rollback. Every required instance and migration target must reach the intended
revision/state; partial rollout, stale container, migration lag, unknown
inventory, or rollback-in-progress remains pending/degraded and cannot be
reported as `PRODUCTION_CONVERGED`. Rollback is a new source/artifact/runtime
transition with its own receipt, not deletion of prior history.

`DEVELOPMENT_COMPLETE` is owned by the lifecycle contract and requires
integrated/canonical-verified source, canonical-user-or-managed-workspace
convergence, settled worktrees and required checks. `RELEASE_COMPLETE` requires
artifact provenance, migrations settled, deployment and all required runtime
instances converged with health evidence. `PROJECT_CONVERGED` requires both for
the selected release target. SPEC-294 displays a bounded projection of this
state; production mutation remains within the registered deployment and
migration authorities.

## R1.3 Additive SPEC-304 stable App identity integration — 2026-10-07

SPEC-304 owns stable `AppIdentity`/`publicAppId`, canonical app route and mutable aliases, App Shell/startup semantics, runtime requirement declarations, and app/channel-to-release/deployment references. SPEC-295 remains sole authority for release sets, migration execution, deployment lifecycle, desired/observed state, health, rollback, and production operations. A route resolution or App identity receipt MUST NOT imply deployment health, rollout completion, or acceptance. A domain/slug/owner change MUST NOT mutate historical deployment or release identity. Runtime requirements declared by SPEC-304 are inputs to SPEC-295's existing target/capacity/security gates, not a second provisioner or deployment executor. This is a contract alignment only; no production migration or deployment is authorized.
