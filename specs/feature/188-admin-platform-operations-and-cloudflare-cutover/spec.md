# Feature 188 — Admin Platform Operations, Complete Data Promotion, and GCP/Cloudflare Cutover

**Status:** IMPLEMENTED LOCALLY / NOT ACTIVATED — additive platform-operation
schema, gate/evidence service, promotion checkpoint ports, admin API/UI, and
focused local contract tests are present; external target migration,
Cloudflare connectivity, deployment, and production cutover evidence remain
required.
Local additive migrations are applied through `0318_feature_188_platform_operations.sql`,
`0322_feature_188_promotion_binding.sql`, and
`0323_feature_188_promotion_batch_fencing.sql`; these extend the same
coordination schema and do not create a second job ledger.
**Created:** 2026-09-13
**Scope:** Admin infrastructure-screen redesign, GCP/Cloudflare platform selection, Feature 186 control-plane operational integration, final Dev-to-Production data-promotion orchestration, Cloudflare replacement readiness, GitHub release flow, one-time production cutover, and permanent Dev/Production separation.
**Authority:** This specification defines the operational UI, platform-control semantics, data promotion evidence, cutover gates, repository decision, rollback boundary, and post-cutover environment contract for SmartAIHub.
**Related features:** Feature 186 — Unified Job Control Plane Adapters; Feature 187 — Hybrid Cloudflare Migration Preparation, Environment Parity, and Promotion Readiness; Feature 189 — Unified Tenant Identity and Data Transfer.

## Feature order and ownership

Feature 188 is the final operational layer in the four-feature dependency chain:

0. **Feature 186** establishes the canonical job contract, persistence, lifecycle, adapters, lease/fencing, and recovery evidence.
1. **Feature 189** establishes the authenticated tenant/authorization boundary and transfer semantics on that accepted job boundary.
2. **Feature 187** prepares and rehearses the environment, data, release, and adapter boundaries, then hands over an immutable `CUTOVER_CANDIDATE` package.
3. **Feature 188** consumes those handoffs, exposes the Admin Platform Operations control center, and is the sole owner of production activation, the maintenance-window cutover, rollback/forward repair, and legacy retirement.

Feature 188 may build its read-only control-center shell and gate model while 187 is in preparation, but it must not expose an activation action until the 187 handoff and 189 tenant/authentication gates are accepted. The required gate keys `feature_187_cutover_candidate` and `feature_189_tenant_auth` represent those immutable handoffs and must both be passed before activation validation can succeed. Feature 188 does not reimplement Feature 186's job lifecycle, Feature 187's adapters, or Feature 189's identity/transfer handlers; it records and verifies their evidence through stable service ports.

## Outcome

SmartAIHub has one Admin Platform Operations control center where an authorized administrator can see and prepare either GCP or Cloudflare, inspect the canonical Job Control Plane, validate data promotion, and execute a guarded one-time production cutover.

The current mini-server environment remains a usable development environment during preparation. The current Dev Server dataset is promoted to the Cloudflare production target through a complete, continuously validated data-promotion process. Production activation is blocked until the application, data, storage, workers, schedules, side effects, and recovery path are all proven.

The production database is a newly provisioned PostgreSQL instance, separate from the current Dev Server database. During preparation, the current Dev Server database is the declared promotion source and the new instance is the promotion target. Cloudflare production connects to the new PostgreSQL instance through Hyperdrive; no Cloudflare runtime may connect directly to the Dev Server database.

After cutover:

- Cloudflare is the only active production platform.
- The promoted production database and storage are authoritative for production.
- Dev and Production have separate databases, storage, queues, workflows, secrets, credentials, and deployment permissions.
- No continuous data synchronization remains between Dev and Production.
- GCP, Celery, BullMQ, Redis-as-queue, Cloud Tasks, and legacy producers are not hidden fallbacks.
- Any unexpected legacy call is rejected, audited, and alerted.
- The same canonical worker_jobs.id, attempt identity, side-effect marker, and business data remain valid through activation or emergency rollback.

## Non-negotiable invariants

1. The existing worker_jobs table remains the canonical job identity and lifecycle source. This feature does not create a parallel generic jobs table.
2. PostgreSQL remains the source of truth for durable application and job data. Cloudflare, GCP, queues, workflows, containers, Redis, and provider IDs are transport or execution observations.
3. The current Dev Server data must be promoted completely before Cloudflare production activation. Every durable table and row receives a recorded migration disposition and validation result.
4. A database row may not disappear from the promotion without an explicit, approved disposition. A row-count match alone is not sufficient when a transformation or merge is required.
5. Continuous synchronization or an equivalent transaction-watermark process must run from the declared promotion source to the target until data validation and pre-cutover tests pass.
6. The source remains authoritative until the final write fence, final delta, and final validation complete.
7. After cutover, Dev and Production are permanently separated. Replication, CDC, scheduled exports, automatic object copying, and automatic database synchronization are disabled and their credentials revoked.
8. Production activation is a guarded control-plane action, not a direct environment-variable toggle.
9. An unknown readiness result is a failure. The system must fail closed rather than assuming that a missing metric, unreachable adapter, or incomplete inventory is healthy.
10. There is one active side-effecting producer for a job type at a time. Dual-run is allowed only for observation or side-effect-free execution.
11. No legacy runtime is used as a hidden fallback after Cloudflare activation. Emergency rollback is an explicit, audited, operator-controlled procedure.
12. GCP and Cloudflare use the same domain contract, canonical job ID, data ownership rules, idempotency keys, lease/fencing contract, and side-effect settlement markers.
13. GitHub is the source of immutable code and release artifacts, not a source of production data. Data promotion uses a separately versioned manifest and evidence bundle.
14. Secrets, raw credentials, sessions, expiring signed URLs, and ephemeral transport messages are never copied as ordinary application data.
15. No production cutover is accepted on the basis of mock adapters, local health checks, a successful build, or a 200 health endpoint alone.

## Current repository and architecture findings

The repository is currently:

- GitHub repository: naibarn/SmartSpecPro
- Primary branch: main
- Existing release workflows: .github/workflows/deploy-staging.yml and .github/workflows/deploy-production.yml
- Current deployment workflows: GCP/Cloud Run and Google Artifact Registry oriented
- Existing infrastructure UI: apps/web/client/src/components/admin/InfrastructureSettingsPanel.tsx
- Infrastructure navigation entry: apps/web/client/src/pages/AdminSettings.tsx
- Existing infrastructure APIs: apps/web/server/routers/infrastructure.ts
- Existing GCP/Cloud Tasks media paths: apps/web/server/routers/mediaJobs.ts and apps/web/server/routes/tasks.ts
- Existing scheduled Cloud Tasks path: apps/web/server/services/scheduler.ts
- Existing scale/deployment mutation path: apps/web/server/services/scaleTier.ts
- Existing transport adapters: BullMQ, Celery, and in-memory adapters in apps/web/server/services/jobTransportAdapters.ts, plus the provider-neutral binding-injected Cloudflare contract in apps/web/server/services/cloudflareJobAdapters.ts

The current repository already contains Cloudflare-related R2 and Vectorize integrations and a provider-neutral, binding-injected contract for Queues, Workflows, Containers, Cron, and Worker App in `apps/web/server/services/cloudflareJobAdapters.ts`. It is not yet a target-account Cloudflare job runtime: native bindings, Hyperdrive connectivity, deployment, and recovery evidence remain external gates under Feature 186 and this feature's migration plan.

The existing GCP paths are not cosmetic. They currently influence media/video dispatch, scheduled work, task handlers, deployment, and scale operations. They must therefore be replaced, retired, or retained only as an explicitly documented emergency rollback path.

## Repository decision

### Decision

Continue using the existing GitHub repository, naibarn/SmartSpecPro.

Do not create a new repository merely to separate the mini-server development environment from Cloudflare production.

### Required repository controls

The existing repository must be reorganized into a provider-neutral release system:

- GitHub Environments: development, staging, production, and emergency-rollback.
- Protected main branch with required checks and required reviewers for production.
- Immutable build identity based on commit SHA, image digest, worker bundle digest, migration bundle digest, and release manifest digest.
- Separate OIDC identities, secrets, Cloudflare account bindings, GCP rollback credentials, and deployment permissions per environment.
- Cloudflare deployment workflows added beside the existing workflows during preparation.
- Existing GCP deployment workflows retained only while GCP is active or required for emergency rollback, with an explicit retirement owner and gate.
- No production secrets in repository files, local .env files, or development artifacts.
- A release manifest records repository SHA, package versions, schema version, adapter contract version, build digests, data manifest, and cutover evidence.

### Why a new repository is not recommended

The current repository already contains the domain code, Feature 186/187 specifications, CI, migration history, release workflows, and the existing GCP integration. A second repository would create code drift, duplicated fixes, unclear release provenance, and a harder proof that Dev and Production use the same tested artifact.

A new repository is justified only if a separate legal owner, security boundary, compliance boundary, independent release cadence, or unavoidable repository-scale constraint is approved. Environment separation alone is not sufficient justification.

## Scope

### Included

- Replacement of the old Admin Infrastructure screen and its navigation model.
- GCP/Cloudflare platform selection and readiness control.
- Job Control Plane monitor and operational actions over the Feature 186 service boundary.
- Runner, capability, lease, heartbeat, and adapter observability.
- Complete database data promotion from the current Dev Server source.
- Continuous source-to-target synchronization and validation before cutover.
- R2/object and Vectorize promotion evidence where those resources are part of production data.
- Cloudflare Queues, Workflows, Containers, Cron, Worker App, Hyperdrive, R2, and Vectorize readiness based on Feature 187 adapter and environment evidence.
- Legacy producer and hidden-fallback detection.
- One-time maintenance-window cutover and explicit emergency rollback.
- Permanent post-cutover Dev/Production separation.
- GitHub repository and environment release controls.
- Migration manifests, runbooks, tests, and evidence requirements.

### Explicit non-goals

- No immediate production cutover in this specification.
- No automatic deployment to Cloudflare.
- No automatic copying of secrets or .env files.
- No blind database dump restore over an existing production database.
- No copying of Redis, BullMQ, Celery, or Cloud Tasks messages as canonical data.
- No deletion of GCP, Celery, BullMQ, Redis, or Cloud Tasks before retirement evidence passes.
- No second generic jobs table.
- No rewrite of unrelated Admin features.
- No production data synchronization after the final cutover.
- No claim that local, mock, or staging tests alone prove production readiness.

## Architecture

~~~
                          GitHub repository
                 immutable commit and release artifact
                                  |
                                  v
       Mini Server/Dev -> CI Build/Test -> Cloudflare Preflight
             |                  |                    |
             |                  +-- data manifest ---+
             |                  +-- adapter evidence
             |                  +-- schema bundle
             |                  +-- release manifest
             |
             +-- current Dev Server database
                          |
              full snapshot + continuous delta sync
                          |
                          v
              new Cloudflare production PostgreSQL instance
                          |
              final write fence + final validation
                          |
                          v
       Hyperdrive -> Production PostgreSQL / Job Control Plane
                         |
             Queues / Workflows / Containers / Cron
                         |
                Cloudflare production runtime
                         |
                  +-- R2 bindings
                  +-- Vectorize bindings
~~~

Hyperdrive is the Cloudflare-to-PostgreSQL boundary only. R2 and Vectorize use
their own environment-scoped Cloudflare bindings and remain separate proof
surfaces from the database/job ledger. A successful code deployment does not
imply a successful data promotion.

## Platform selection model

### Platform state

Platform state is environment-scoped and deployment-scoped. It must not be represented only by a global database flag that can accidentally affect Dev and Production together.

The logical state is:

~~~
GCP ACTIVE
  |
  +-- Cloudflare PREPARING
  +-- Cloudflare BLOCKED
  +-- Cloudflare READY_FOR_CUTOVER
  |
  +-- maintenance -> Cloudflare ACTIVATING
                              |
                              +-- Cloudflare ACTIVE
                              +-- ROLLBACK_REQUIRED
~~~

The Admin UI displays both:

- Active Platform: the runtime currently permitted to create production side effects.
- Target Platform: the platform being prepared for a future cutover.

Selecting a target platform does not switch production. Only an approved activation command inside the cutover state machine can change Active Platform.

### Development environment

The mini server is a Development Environment, not a second production platform:

- It has its own database, object prefix or bucket, queues, workflow bindings, Vectorize index, secrets, provider policy, and admin scope.
- It may use local adapters or safe mocks where documented.
- It produces the commit, tests, migration bundle, data manifest, and immutable release metadata used for promotion.
- It must remain runnable without production-only credentials or bindings.
- After cutover it does not receive production data and does not synchronize with Production.

## Admin information architecture

The old infrastructure screen is replaced by a single control center. Existing capabilities are either moved into the appropriate new page or retired only after their replacement and evidence gate exist.

### Platform Overview

Shows:

- environment selector: Dev, Staging, Production, Cutover
- Active Platform and Target Platform
- release SHA, artifact digest, schema version, adapter contract version
- database authority and connection state
- data promotion state, sync watermark, lag, and checksum result
- R2/object and Vectorize state
- adapter coverage and readiness score
- current blocking gates
- last validation, actor, reason, and evidence links

### Job Control Plane

Shows canonical worker_jobs records, not only queue metrics:

- queued, leased/running, waiting external, retry scheduled, failed, stale, and terminal-unsettled jobs
- tenant, actor, job type, execution class, attempt/max attempts
- runner, lease expiry, heartbeat, active adapter
- chronological event timeline
- transport and provider references as observations
- safe retry, cancel, requeue, force-fail, and inspect actions
- settlement, notification, artifact, and provider reconciliation state

### Runners and Capabilities

Shows:

- Worker App, Cloudflare Worker, Container, Python runner, and emergency GCP runner
- supported job classes and capabilities
- software/build version
- heartbeat freshness
- lease age
- concurrency and capacity
- stale or fenced runner state

### Data and Storage

Shows:

- PostgreSQL or Hyperdrive connectivity
- promotion source and target
- source/target watermark
- table-by-table migration status
- R2 object manifest and checksum status
- Vectorize index/version status
- local disk as development-only storage
- Redis only as compatibility/cache/transport observation while it exists

This page must not present Redis as a selectable source of truth for job state.

### Platform Adapters

GCP view:

- read-only or masked project, region, service, and rollback state
- current legacy dependencies
- retirement gate

Cloudflare view:

- account and environment identity
- Queues bindings
- Workflows bindings
- Containers capability
- Cron schedules
- Hyperdrive/PostgreSQL connection
- R2 and Vectorize bindings
- connectivity and capability test results

Connectivity tests are separate from activation. Passing a connection test never activates an adapter.

### Release, Sync, and Cutover

Shows:

- release candidate and artifact identity
- code/schema/config/data drift
- full database promotion progress
- continuous sync health
- backup and restore evidence
- manifest validation
- maintenance state
- producer freeze and drain state
- final delta state
- activation and rollback gates
- zero-legacy verification

### UI states and safety

Every page must implement explicit loading, empty, error, disabled, stale, permission-denied, blocked, maintenance, and active states. The UI must never show green readiness while one required evidence source is missing.

The redesigned screen must be responsive for desktop, tablet, and mobile, but destructive operations require a sufficiently wide, explicit confirmation flow with the target environment, platform, release identity, data manifest, expected impact, actor, reason, and idempotency key.

## Admin control API contract

The backend exposes control operations through an authorized service port rather than direct UI mutation of environment variables.

Logical operations:

~~~text
getPlatformOverview(environment)
getReadiness(environment, releaseId)
getPromotionStatus(promotionId)
setTargetPlatform(environment, platform, reason, idempotencyKey)
startPromotion(promotionId, releaseManifestId, idempotencyKey)
validatePromotion(promotionId, validationProfile, idempotencyKey)
enterMaintenance(cutoverId, reason, idempotencyKey)
freezeSourceWrites(cutoverId, idempotencyKey)
applyFinalDelta(cutoverId, idempotencyKey)
activatePlatform(cutoverId, idempotencyKey)
reconcileActivation(cutoverId, idempotencyKey)
verifyZeroLegacy(cutoverId, idempotencyKey)
requestEmergencyRollback(cutoverId, reason, idempotencyKey)
retireLegacyRuntime(retirementId, reason, idempotencyKey)
~~~

Every mutating operation in this list receives a server-derived actor and
environment scope plus a required reason and idempotency key, even where the
compact logical signature above omits the repeated fields. Read operations do
not accept client-supplied scope as authority.

The exact router names are an implementation decision. The behavior and guards are not optional.

### Control record

A durable release/cutover control record must include:

- environment
- active platform
- target platform
- lifecycle state
- release ID and immutable artifact digest
- schema and adapter contract versions
- promotion source and target IDs
- data manifest ID and checksum
- sync watermark/lag
- readiness snapshot
- gate results
- maintenance window
- producer freeze/drain state
- activation and rollback actor/reason
- idempotency/action keys
- append-only platform action ledger keyed by environment, action key, and
  expected control version
- durable `platform_operation_outbox` intent for external deployment or
  binding operations, including stable dedupe key, publisher fencing, external
  reference, acknowledgement state, and quarantine/reconciliation reason
- timestamps and audit references

It must not become a second job ledger or define a competing job status. It coordinates release and environment state only.

## Complete data promotion

### Promotion source

For this feature, the current Dev Server dataset is the declared promotion source and the newly provisioned PostgreSQL instance is the production target. Cloudflare accesses that target through Hyperdrive after activation. Before migration begins, the owner must sign a source inventory identifying:

- source database identity
- source environment and deployment build
- source snapshot time
- transaction watermark or equivalent
- included schemas and tables
- source storage buckets/prefixes
- Vectorize indexes
- data owner and approval

The target inventory must separately identify the new PostgreSQL instance, provider/region, schema owner, connection policy, Hyperdrive binding, pool limits, and target backup/restore evidence. The Dev Server connection and the Hyperdrive production connection must use separate credentials and network policies.

If a legacy production environment contains durable rows that are not present in the current Dev Server, cutover is blocked until those rows are imported into the declared source dataset or receive an explicit, approved disposition. The system must not silently discard them or overwrite them by assuming that the Dev snapshot is complete.

### Row disposition

Every table and row must be assigned one of these dispositions:

| Disposition | Meaning |
|---|---|
| TRANSFER | Copy the durable row with its stable ID and validate its content. |
| MERGE | Reconcile by an immutable business key and preserve a complete audit trail. |
| TRANSFORM | Apply a versioned deterministic transformation and validate source-to-target mapping. |
| REGENERATE | Do not copy the ephemeral value; generate a new production-safe value and record the mapping. |
| RETAIN_ONLY | Keep only in protected archive/backup because it is not valid as live production state. |
| PROHIBITED | Do not transfer because it is a secret, credential, temporary token, live queue message, or unsafe ephemeral value. The reason is recorded. |

PROHIBITED must not be used as a shortcut for ordinary business data. Durable user, tenant, billing, media, project, workflow, artifact, and job records are TRANSFER, MERGE, or TRANSFORM unless a data owner approves a documented exception.

### Job data

The following durable records must be promoted:

- worker_jobs
- worker_job_events
- worker_job_attempts
- worker_job_dispatches
- worker_job_outbox
- result/settlement markers
- schedule occurrence mappings
- domain records bound by job_id

Transport messages in Redis, BullMQ, Celery, Cloud Tasks, or Cloudflare Queues are not copied as canonical data. Before final cutover, they are drained, acknowledged, reconciled, quarantined, or recreated from canonical PostgreSQL intent according to the Feature 186 recovery policy.

### Database validation

The promotion tool must produce a machine-readable data manifest containing:

- source and target database identity
- schema version
- table list
- source row count
- target row count
- source digest or partition digest
- target digest or partition digest
- transformed/merged row counts
- missing rows
- extra rows
- foreign-key results
- unique-constraint results
- sequence values
- error and retry history
- final status and signer

Validation must cover every in-scope table. High-volume tables may use deterministic partition digests, but the partition boundaries and algorithm must be recorded.

### Storage and index validation

For R2 and other managed objects:

- enumerate source objects
- copy to the production namespace
- compare object count, byte size, content hash, content type, and metadata policy
- identify missing, extra, or mismatched objects
- verify ownership and tenant prefix boundaries
- avoid treating expiring URLs as canonical data

For Vectorize:

- record source index/version
- promote or rebuild from the authoritative document manifest
- compare document IDs, namespaces, and version
- run representative retrieval checks
- record whether the index is transferred or rebuilt

## Continuous synchronization before cutover

The target must remain synchronized with the current Dev Server until the complete validation suite passes. The implementation must use one durable method:

- PostgreSQL logical replication/CDC with a persisted source transaction
  watermark, or
- a repeatable transaction-watermark delta exporter backed by an approved
  durable source change feed.

The fallback change feed must expose a durable monotonic sequence, table/key
identity, operation type, row version, and delete tombstones for every in-scope
table. Updated-at timestamps, periodic row comparison, or best-effort table
copying alone are not accepted because they cannot prove ordering, deletes,
resume safety, or final convergence. If the declared source cannot provide
such a feed, promotion is blocked until native logical replication/CDC or an
equivalent provider capability is available.

Periodic best-effort table copying is not sufficient.

During synchronization:

- Dev remains the only write authority.
- The target is not exposed to production traffic.
- Target writes are limited to migration operations, validation metadata, and explicitly isolated test transactions.
- Every sync batch is idempotent and resumable.
- A failed batch does not advance the durable watermark.
- Source deletes are represented and validated; they must not be silently ignored.
- Sync credentials are scoped to the migration and never reused after cutover.
- The Admin UI shows lag, watermark, batch state, errors, and checksum mismatches.

Tests run against the target must be read-only or isolated from production side effects. Paid provider calls, credit consumption, real notifications, live webhooks, and irreversible artifact publication are prohibited during pre-cutover validation.

## Cutover runbook

The one-time cutover occurs inside an approved maintenance window of up to 24–72 hours, with an explicit extension or rollback decision point.

### Preparation

1. Freeze the release candidate commit, artifact digests, schema bundle, adapter manifest, and data manifest.
2. Confirm the current Dev Server is the declared promotion source and that all legacy-production differences have an approved disposition.
3. Keep continuous synchronization running.
4. Run the complete validation suite until all required gates are green.
5. Confirm backup and restore evidence for the target.
6. Confirm Cloudflare account, bindings, database access, secrets, quotas, and capability limits.
7. Confirm no direct legacy side-effecting producer remains for the selected cutover scope.
8. Obtain required approvals and record the maintenance window.

### Maintenance and final promotion

1. Announce maintenance and disable new user writes.
2. Stop or fence producers and scheduled triggers.
3. Drain safe in-flight work and reconcile all other canonical jobs by job_id.
4. Freeze source writes.
5. Capture the final source transaction watermark.
6. Apply the final delta to the target.
7. Validate row counts, digests, foreign keys, constraints, sequences, storage manifests, indexes, and job recovery state.
8. Verify that the target application can read and write the promoted data using the release candidate.
9. Run representative synthetic tests against the target in maintenance/traffic-closed mode for short, long, external, CPU, GPU, scheduled, notification, billing, artifact, and callback paths.
10. Verify that canonical job state, event history, leases, side-effect markers, and domain projections converge.
11. Activate the Cloudflare platform through the guarded control-plane command.
12. Open production traffic only after activation and all final checks pass.
13. Block legacy producers and verify zero legacy calls.
14. Disable CDC/replication and revoke all source-to-target sync credentials.
15. Record the cutover certificate and close the maintenance window.

Activation is a two-party handoff. The control plane commits the activation
intent and fence through `platform_operation_outbox`; the release workflow
performs the provider operation with the same action/dedupe key and persists
the external reference before the control plane settles `ACTIVE`. If the
provider response is lost, `reconcileActivation` inspects the durable intent,
release identity, external reference, and provider state. It must settle the
existing operation or quarantine it for review, never issue a second
activation.

### Post-cutover separation

After the cutover certificate is issued:

- Dev receives no automatic production data.
- Production sends no automatic data back to Dev.
- Dev and Production use separate database users and network policies.
- Dev and Production use separate R2 prefixes or buckets, queues, workflows, Vectorize indexes, logs, rate limits, and admin scopes.
- The migration service is disabled and its credentials are revoked.
- Any attempted post-cutover sync is denied and audited.
- Production releases continue through GitHub artifact promotion, not database synchronization.

## Cloudflare replacement coverage

| Existing capability | Cloudflare replacement | Required proof |
|---|---|---|
| Cloud Tasks dispatch | Cloudflare Queues adapter | duplicate delivery, lost publish response, idempotent dedupe |
| Cloud Scheduler/Celery Beat | Cloudflare Cron scheduler adapter | timezone, DST, missed occurrence, duplicate occurrence |
| Celery/Dramatiq execution | Queues, Workflows, Containers, or Worker App | thin wrapper, claim, lease, heartbeat, retry classification |
| BullMQ/Redis queues | Control Plane outbox plus Queues | outbox recovery, no queue truth dependency |
| Cloud Run Node/Python | Worker/API and Container/Worker App routing | capability and resource-boundary tests |
| Provider polling | Workflows, Queues, callback, or bounded poll adapter | external wait, operation key, callback authentication |
| Local filesystem | R2 and immutable result references | object checksum, tenant ownership, result recovery |
| Redis job status | PostgreSQL worker_jobs/events | broker outage and stale lease recovery |
| Queue dashboard | Job Control Plane Monitor | canonical state separated from transport observation |
| .env/gcloud scale controls | GitHub release pipeline and platform deployment policy | review, artifact identity, rollback, audit |

Every row in this matrix must have an owning implementation task, test evidence, production capability check, and retirement gate for the replaced path.

## Legacy replacement and zero-hidden-fallback enforcement

### Static audit

Before activation, scan the repository and generated bundles for:

- BullMQ add/process calls
- Redis queue/status mutations
- Celery delay/apply_async/send_task calls
- Celery Beat business execution
- Cloud Tasks enqueue calls
- direct provider execution outside the adapter boundary
- direct .env/gcloud scale mutation from Admin
- legacy status writers that bypass the control plane

Each result is classified as migrated, compatibility shim, emergency rollback-only, test-only, or unresolved. Unresolved results block activation.

### Runtime audit

After activation, observe:

- legacy hostnames and network destinations
- Redis/BullMQ/Celery/Cloud Tasks connections
- legacy producer counters
- adapter publish/claim/report calls
- provider callbacks
- job reconciler and outbox age
- database writes from each runtime identity

An unexpected legacy call must fail closed, create a bounded security/operations event, and page the responsible operator. It must not silently execute or trigger an automatic fallback.

## Failure handling

| Failure | Required behavior |
|---|---|
| Source database unavailable before final fence | Stop promotion, retain last durable watermark, and keep production inactive. |
| Target database unavailable | Mark target blocked; do not report readiness or activate. |
| Sync batch fails | Retry the same batch with the same idempotency key; do not advance the watermark. |
| Checksum mismatch | Stop the gate, identify the table/partition, repair or re-run the batch, and revalidate. |
| Missing legacy-production row | Block until imported into the source dataset or explicitly disposed. |
| Provider capability unavailable | Block only the relevant job class or the whole activation according to the manifest; never route silently to legacy. |
| Cloudflare publish acknowledgement lost | Retry through the same outbox/dedupe key and reconcile the dispatch reference. |
| Cloudflare activation acknowledgement lost | Reconcile the existing platform operation outbox intent and provider reference; never start a second activation. |
| Worker/container lost | Allow lease expiry and Feature 186 recovery; inspect side-effect evidence before retry. |
| Activation partially completed | Enter BLOCKED/ROLLBACK_REQUIRED and use the explicit runbook. |
| Legacy call after activation | Reject, audit, alert, and preserve canonical state. |
| Post-cutover sync attempt | Deny through credentials/network policy and audit the event. |
| Rollback requested | Freeze new production side effects, preserve the target database and canonical IDs, verify GCP emergency readiness, and activate only through an audited rollback command. |

## Security and authorization

- Only platform administrators can select a target or request activation.
- Production activation, final data promotion, and rollback require elevated authorization and required reviewers.
- Tenant operators can inspect only tenant-scoped jobs and data.
- All control actions include actor, reason, target environment, release ID, data manifest ID, expected state, and idempotency key.
- Secrets are stored in GitHub/Cloudflare/GCP secret systems and never exposed in the Admin UI.
- Connection tests return redacted results and never expose URLs, tokens, credentials, or signed storage URLs.
- Data promotion credentials are short-lived, scoped, audited, and revoked after cutover.
- Database, R2, Vectorize, queue, and workflow operations enforce tenant boundaries.
- Production and Dev admin scopes are separate.
- An activation request cannot be authorized from a client-supplied tenant or platform field alone; the server derives environment and permission scope.

## Work packages

### Package 1 — inventory and source authority

- inventory all Admin infrastructure call sites, runtime producers, data tables, storage objects, indexes, and release workflows
- declare the current Dev Server promotion source
- reconcile differences with legacy production
- produce the first data and replacement manifests

### Package 2 — control-plane and release records

- implement environment-scoped platform state
- implement readiness and gate aggregation
- implement durable promotion/cutover control records
- implement idempotent activation, rollback, and retirement commands

### Package 3 — Admin UI replacement

- replace InfrastructureSettingsPanel navigation and layout
- implement the six control-center pages
- implement loading, stale, blocked, error, permission, and confirmation states
- remove old controls from the primary navigation only after replacement APIs exist

### Package 4 — Feature 186 operational integration

- consume the accepted Feature 186 control-plane contract
- expose canonical job, lease, settlement, and recovery evidence in the control center
- verify that migrated job classes have one active producer and an explicit rollback flag
- route any missing lifecycle capability back to Feature 186 as a dependency change; do not fork it here

### Package 5 — Cloudflare adapters

- validate the Feature 187 adapter, binding, capability, and connectivity evidence
- record readiness and blockers for Queues, Workflows, Containers, Cron, Worker App, Hyperdrive/PostgreSQL, R2, and Vectorize
- own the activation gate and operational rollback boundary, not the adapter implementation

### Package 6 — final promotion and cutover coordinator

- consume the Feature 187 source/target manifests and validated promotion machinery
- coordinate the final write fence, final delta, validation, and target handoff during cutover
- record the activation, sync shutdown, credential revocation, and post-cutover separation evidence
- do not create a second promotion engine or data source of truth

### Package 7 — release governance and cutover evidence

- consume the immutable release manifest and evidence artifacts produced by Feature 187
- configure GitHub Environment protection, required reviewers, and cutover approvals
- link schema/data/adapter evidence to the platform control record
- retain the GCP rollback workflow and legacy workflow retirement gates
- do not create a second build or promotion pipeline

### Package 8 — rehearsal and production runbook

- staging rehearsal with production-shaped data
- failure injection
- cutover/rollback rehearsal
- browser/admin verification
- zero-legacy static and runtime audit
- final sign-off package

## Migration phases

### Phase 0 — inventory

No runtime behavior changes. Produce call-site, data, storage, provider, job, workflow, and repository manifests.

### Phase 1 — control center foundation

Build environment-scoped control records, readiness/gate aggregation, audit, and platform-state contracts. Consume Feature 187 manifests rather than recreating its release or promotion machinery. Operate in observe-only mode first.

### Phase 2 — Admin redesign

Introduce the new control center and migrate old infrastructure capabilities into it. Do not expose an activation action until the backend gates exist.

### Phase 3 — adapter readiness and replacement acceptance

Accept the Feature 187 adapter and runtime-replacement evidence, verify recovery and one-producer ownership, and register any remaining blockers. Adapter implementation and job-family migration remain in Feature 186/187.

### Phase 4 — integrated promotion and cutover rehearsal

Run the Feature 187 promotion machinery through the Admin control records with representative data, continuous sync, validation, application tests, backup/restore, and rollback rehearsal. Do not switch production authority.

### Phase 5 — release candidate

Accept the immutable GitHub artifact and Feature 187 handoff through staging and Cloudflare preflight. Resolve every blocker and attach the final manifest to the cutover control record.

### Phase 6 — one-time production cutover

Execute the maintenance runbook, full final data promotion, activation, representative tests, zero-legacy verification, and sync shutdown.

### Phase 7 — post-cutover separation and retirement

Revoke synchronization, separate Dev and Production permanently, operate Cloudflare as the only active production platform, and retire GCP/legacy paths only after the evidence window closes.

## Verification plan

1. Unit tests for platform state transitions, gate aggregation, idempotent actions, authorization, data dispositions, checksum validation, and redaction.
2. Repository tests for full snapshot, delta replay, delete propagation, resume after failure, watermark handling, merge/transform mapping, and final convergence.
3. Feature 186 control-plane tests for create, claim, lease, heartbeat, stale completion, external wait, retry, settlement, outbox, and reconciler recovery.
4. Adapter contract tests for fake GCP, Cloudflare Queues, Workflows, Containers, Cron, Worker App, and storage adapters.
5. Failure-injection tests for database loss, network loss, sync batch loss, checksum mismatch, provider ambiguity, duplicate delivery, callback replay, worker loss, container restart, and lost publish acknowledgement.
6. Integration tests for media, video, presentation, sandbox, vision/audio, workflow, notification, billing, artifact, and scheduled jobs.
7. Browser tests for all new Admin pages, gate states, permissions, redaction, action confirmation, timeline, and responsive behavior.
8. Static scans proving that migrated business services have no direct legacy transport calls.
9. Runtime/network scans proving no unexpected legacy producer or database writer remains after activation.
10. Staging cutover rehearsal with production-shaped rows, object sizes, resource limits, job classes, and restore procedures.
11. Deployment evidence identifying commit SHA, build digest, schema version, data manifest, adapter manifest, Cloudflare bindings, worker connectivity, and recovery proof separately.
12. Post-cutover test proving Dev-to-Production sync credentials no longer work and that a sync attempt is denied and audited.

## Acceptance criteria

### Admin and platform selection

- Admin can select GCP or Cloudflare as Target Platform.
- Target selection does not immediately switch production.
- Active Platform changes only through the guarded cutover state machine.
- GCP remains visible as active or emergency rollback according to the actual lifecycle state.
- The old Celery/Cloud Tasks, Redis-provider, Queue Status, and direct scale controls are removed from the primary navigation after replacements exist.
- No new UI path edits .env or executes an unreviewed deployment mutation.

### Data promotion

- The current Dev Server durable dataset is fully inventoried and promoted.
- Every table and row has a disposition and validation result.
- Missing or extra rows are zero, or have explicit approved mappings.
- Row digests, foreign keys, constraints, sequences, object manifests, and Vectorize manifests pass.
- Continuous synchronization remains healthy until tests pass and final fence begins.
- Final delta converges to zero before activation.
- The fallback synchronization path uses an approved durable ordered source
  change feed with insert, update, and delete/tombstone coverage; otherwise
  promotion is blocked.
- Active jobs and durable job history are reconciled by canonical job_id.
- No raw queue message, secret, credential, session, or expiring URL is copied as ordinary data.

### Environment separation

- After cutover, Dev and Production use separate database, storage, queue, workflow, index, secret, network, and admin boundaries.
- CDC/replication/export is disabled.
- Sync credentials are revoked.
- Dev cannot automatically read or write Production data.
- Production cannot automatically synchronize data back to Dev.

### Cloudflare replacement

- Every legacy capability has an accepted replacement, owner, test evidence, and retirement gate.
- Cloudflare adapters use canonical worker_jobs.id and Feature 186 contracts.
- No business service directly imports or calls legacy transport APIs after its migration wave.
- No hidden legacy fallback can create a side effect.
- Cloudflare readiness is not reported from mock tests alone.

### Cutover and recovery

- Cutover is performed only inside the approved maintenance window.
- The final source write fence, final delta, validation, activation, representative tests, and zero-legacy verification are recorded.
- A failed gate blocks activation.
- External activation uses the durable platform operation outbox and action
  ledger; a lost provider acknowledgement is reconciled by the existing
  dedupe key/reference and cannot create a second activation.
- Rollback preserves canonical job IDs, attempts, side-effect markers, and durable production data.
- The post-cutover certificate contains all release, data, runtime, and recovery evidence.

### Repository and release

- The existing GitHub repository remains the single source of code and release provenance.
- Production receives the same immutable artifact proven in staging.
- GitHub environment protection, secrets separation, reviewers, and rollback workflow are configured.
- Existing GCP workflows have an owner and retirement condition.
- No second repository is created unless an independently approved legal, security, or ownership boundary requires it.

## Operational metrics and alerts

Required metrics include:

- platform_active
- platform_target
- platform_state
- readiness_gate_status
- data_sync_lag
- source_watermark
- target_watermark
- data_checksum_mismatch
- promotion_rows_missing
- promotion_rows_extra
- promotion_batch_failures
- object_manifest_mismatch
- vector_index_version
- adapter_coverage_percent
- legacy_call_detected
- legacy_network_connection
- outbox_age
- stale_lease_count
- terminal_unsettled_count
- cutover_activation_state
- rollback_requested
- post_cutover_sync_attempt

Alerts are based on canonical data state, sync lag, gate failure, stale leases, outbox age, legacy activity, and recovery SLOs. Queue length alone is not an activation or health criterion.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Dev data is not actually complete | Full table/row inventory, legacy-production reconciliation, source-owner sign-off, checksums, and a zero-unknown gate. |
| Target drifts while tests run | Keep Dev authoritative, use durable CDC/watermarks, repeat validation, and require final fence plus final delta. |
| A live write is missed at cutover | Freeze source writes, capture watermark, apply final delta, and validate before activation. |
| A provider operation is duplicated | Persist operation keys and side-effect markers; use Feature 186 fencing and idempotency. |
| Old GCP path remains hidden | Static call-site scan, runtime/network audit, explicit emergency-only classification, and fail-closed rejection. |
| New repository diverges from the current system | Continue one repository with immutable artifact promotion and environment protections. |
| Production data is accidentally copied back to Dev | Separate credentials, network policies, bindings, and post-cutover sync-denial tests. |
| Mock readiness is mistaken for production readiness | Separate account capability, connectivity, deployment, worker, provider, and recovery evidence. |
| Cutover takes longer than the window | Rehearse with production-shaped data, publish capacity estimates, maintain a rollback point, and do not open traffic before validation. |

## External platform references

These are implementation inputs and must be revalidated against the target Cloudflare account and plan:

- Cloudflare Queues delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare Queues batching, retries, and delays: https://developers.cloudflare.com/queues/configuration/batching-retries/
- Cloudflare Workflows overview: https://developers.cloudflare.com/workflows/
- Cloudflare Workflows rules: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
- Cloudflare Containers overview: https://developers.cloudflare.com/containers/

These references do not authorize coupling business services directly to provider APIs. All provider behavior remains behind the adapter and control-plane boundaries.

## Final boundary

This document authorizes planning and implementation preparation only. It does not authorize:

- production deployment
- production data migration
- cutover
- credential rotation
- .env mutation
- GCP retirement
- Cloudflare account provisioning
- deletion of legacy queues or data

Those actions require a separate implementation plan, verified evidence, explicit operator approval, and the maintenance-window procedure defined here.
