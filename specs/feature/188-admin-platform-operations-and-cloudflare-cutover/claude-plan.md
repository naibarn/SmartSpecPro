# Feature 188 — Detailed Implementation Plan

## 1. Implementation objective and boundaries

Implement an environment-scoped Platform Operations control center and the
guarded operational path from the current Dev Server to a Cloudflare-backed
Production environment.

The target database decision is fixed:

- Source during preparation: the current Dev Server PostgreSQL database.
- Target: a newly provisioned, separate Production PostgreSQL instance.
- Cloudflare database connection: Cloudflare runtime to Production PostgreSQL
  through a Production Hyperdrive binding.
- Forbidden topology: any Cloudflare Worker, Workflow, Container, Cron handler,
  queue consumer, callback, or test path connecting directly to the Dev Server
  database.

The implementation includes code, migrations, tests, CI/release definitions,
runbooks, evidence schemas, and provider capability gates. It does not include
live instance provisioning, credentials, .env mutation, production deployment,
data copy, traffic activation, or irreversible retirement of GCP/legacy
infrastructure. Those actions are executed later by an authorized operator
using the runbook and recorded evidence.

Feature 186 remains the canonical job lifecycle. This plan adds platform and
promotion coordination records only; it must not create a generic jobs table or
move job status truth into Cloudflare.

## 2. Existing code and required discovery

Before editing implementation files, re-run the following discovery against the
current tree and record the results in the rollout manifest:

- direct BullMQ queue adds/processors and Redis status writes;
- Celery delay/apply_async/send_task and Beat entries;
- Cloud Tasks creation, handlers, retries, and polling;
- provider callbacks, result polling, billing settlement, artifact
  publication, notification/webhook senders;
- imports and callers of InfrastructureSettingsPanel, infrastructure router,
  mediaJobs, scheduler, tasks route, scaleTier, db, storage, and
  jobTransportAdapters;
- all readers/writers of worker_jobs and worker_job_events;
- all current schema migrations after 0305 and any migration ordering checks;
- all GCP/Cloud Run/Artifact Registry references in source, generated bundles,
  and GitHub workflows.

Use SocratiCode impact/graph queries when the MCP is available. The research
session could not access SocratiCode, so targeted rg and narrow source reads
remain mandatory even after an index becomes available. Preserve unrelated
dirty or staged changes.

## 3. Planned repository structure

The exact implementation may refine names after discovery, but every new
responsibility must remain within these ownership boundaries:

~~~
apps/web/drizzle/schema.ts
apps/web/drizzle/0306_feature_188_platform_operations.sql
apps/web/drizzle/feature188PlatformOperationsMigration.test.ts

apps/web/server/services/platformOperations.ts
apps/web/server/services/dataPromotion.ts
apps/web/server/services/promotionChangeFeed.ts
apps/web/server/services/promotionValidation.ts
apps/web/server/services/hyperdrivePolicy.ts
apps/web/server/services/legacyRuntimeAudit.ts
apps/web/server/services/cutoverControlPlane.ts
apps/web/server/routers/platformOperations.ts
apps/web/server/services/__tests__/
apps/web/server/routers/__tests__/platformOperations.test.ts

apps/web/server/scripts/inventory-feature-188.ts
apps/web/server/scripts/promote-feature-188.ts
apps/web/server/scripts/verify-feature-188.ts
apps/web/server/scripts/audit-feature-188-call-sites.ts
apps/web/server/scripts/__tests__/

apps/web/client/src/components/admin/platform-operations/
apps/web/client/src/pages/AdminPlatformOperations.tsx
apps/web/client/src/pages/AdminPlatformOperations.test.tsx
apps/web/tests/e2e/admin-platform-operations.spec.ts

apps/cloudflare/package.json
apps/cloudflare/wrangler.jsonc
apps/cloudflare/src/index.ts
apps/cloudflare/src/env.ts
apps/cloudflare/src/db/hyperdrive.ts
apps/cloudflare/src/adapters/queues.ts
apps/cloudflare/src/adapters/workflows.ts
apps/cloudflare/src/adapters/containers.ts
apps/cloudflare/src/adapters/cron.ts
apps/cloudflare/src/adapters/workerApp.ts
apps/cloudflare/src/callbacks/providerCallback.ts
apps/cloudflare/src/adapters/__tests__/
apps/cloudflare/src/fixtures/

packages/job-control-plane/
packages/job-control-plane/src/

.github/workflows/deploy-cloudflare-staging.yml
.github/workflows/deploy-cloudflare-production.yml
.github/workflows/feature-188-gates.yml
ops/feature-188/
  environment-contract.yaml
  release-manifest.schema.json
  promotion-manifest.schema.json
  cutover-runbook.md
  rollback-runbook.md
  legacy-runtime-retirement.md
~~~

If the repository's package layout or existing shared package is a better home
for a listed boundary, keep the public contract and ownership the same rather
than duplicating it in a second location.

## 4. Shared domain contracts and configuration

Create provider-neutral TypeScript types in the shared job-control-plane
package, or extend the existing Feature 186 type module after impact review.
The shared package must be runtime-neutral and free of Node-only database
clients, BullMQ/Celery imports, Cloudflare bindings, and provider SDK calls so
both apps/web and apps/cloudflare can consume its ports safely. The contract
must contain fields, not implementation details:

~~~
EnvironmentName =
  "dev" | "staging" | "production" | "cutover" | "emergency-rollback"

PlatformKind = "gcp" | "cloudflare"

PlatformLifecycle =
  "preparing" | "blocked" | "ready_for_cutover" | "activating" |
  "active" | "rollback_required" | "separated" | "retired"

PromotionMode = "logical_replication" | "transaction_watermark"

PromotionPhase =
  "inventory" | "snapshot" | "syncing" | "validating" | "fenced" |
  "finalizing" | "validated" | "activated" | "separated" |
  "failed" | "quarantined"

GateStatus = "passed" | "failed" | "blocked" | "unknown" | "expired"

PlatformAction =
  "prepare" | "validate" | "request_maintenance" | "activate" |
  "reconcile_activation" | "cancel_activation" | "request_rollback" |
  "separate_sync" | "inspect_evidence"
~~~

The service/API contracts must also define these shapes before implementation:

~~~
PlatformActionRequest = {
  environment: EnvironmentName
  action: PlatformAction
  expectedControlVersion: number
  actionIdempotencyKey: string
  reason: string
  releaseIdentity?: ReleaseIdentity
  promotionId?: string
  cutoverId?: string
}

PlatformActionResult = {
  actionId: string
  action: PlatformAction
  environment: EnvironmentName
  controlVersion: number
  lifecycle: PlatformLifecycle
  gateSummary: GateSummary
  evidenceId: string
  repeated: boolean
}

PlatformOverview = {
  environment: EnvironmentName
  currentPlatform: PlatformKind
  targetPlatform: PlatformKind
  lifecycle: PlatformLifecycle
  releaseIdentity: ReleaseIdentity
  promotion: PromotionSummary
  gates: GateSummary
  adapters: AdapterSummary[]
  jobControlPlane: JobControlPlaneSummary
  separation: SeparationSummary
}
~~~

Define the referenced summaries as bounded read models with stable fields:

~~~
ReleaseIdentity = {
  commitSha: string
  artifactDigest: string
  schemaVersion: string
  adapterContractVersion: string
  promotionManifestDigest?: string
  gateBundleDigest?: string
}

GateSummary = {
  required: number
  passed: number
  failed: number
  blocked: number
  unknown: number
  expired: number
  activationEligible: boolean
}

PromotionSummary = {
  promotionId?: string
  phase: PromotionPhase
  mode?: PromotionMode
  sourceWatermark?: string
  targetWatermark?: string
  lagSeconds?: number
  finalFenceAt?: string
  validationStatus: GateStatus
}

AdapterSummary = {
  name: string
  environment: EnvironmentName
  capabilityStatus: GateStatus
  targetIdentity?: string
  legacyObservation?: string
}

JobControlPlaneSummary = {
  queued: number
  running: number
  waitingExternal: number
  retryScheduled: number
  stale: number
  outboxAgeSeconds?: number
  unresolvedSettlement: number
}

SeparationSummary = {
  syncEnabled: boolean
  syncCredentialState: "active" | "revoked" | "unknown"
  devToProductionDenied: boolean
  productionToDevDenied: boolean
}
~~~

Define configuration contracts for:

- environment identity and active/target platform;
- source database metadata and target database metadata, excluding secrets;
- Hyperdrive binding name, target identity, expected region/provider, pool and
  latency budgets, and allowed runtime environment;
- promotion mode, batch size, checkpoint interval, retention, and maximum lag;
- gate TTLs, required gate names, maintenance window, action idempotency;
- Cloudflare binding names for Queues, Workflows, Containers, Cron, R2, and
  Vectorize;
- immutable release identity: commit SHA, artifact digest, schema version,
  adapter contract version, promotion manifest digest, and gate bundle digest;
- legacy runtime behavior: observe, reject, quarantine, or explicit rollback.

Environment configuration is loaded from the process/runtime binding and
validated at startup. Production secrets and database URLs are never committed
to the repository or written by the Admin UI. A non-secret environment contract
may be committed and signed; secret binding and target endpoint checks remain
deployment evidence.

## 5. Database schema and migration

### 5.1 Drizzle model changes

Update apps/web/drizzle/schema.ts with the platform-operation records required
to make the UI and runbook queryable:

- platform_release_controls: one guarded current record per environment and
  release scope, with platform lifecycle, target/source identifiers, release
  digests, maintenance and activation metadata, fencing/version, and separation
  state;
- platform_gate_results: append-only gate evaluation with gate name, environment, release/promotion IDs,
  status, safe reason/code, evidence reference, source, actor, timestamps,
  and expiration;
- data_promotions: source/target identities, promotion mode, phase, schema and
  manifest IDs, current source/applied watermarks, lag, fence state, target
  validation state, and credential-revocation state;
- data_promotion_batches: promotion ID, idempotent batch key, table/partition,
  source watermark range, operation type, counts/digests, attempt/error
  metadata, and applied watermark;
- data_promotion_dispositions: table/partition/row scope, disposition,
  transformation version, approval, owner, reason, and evidence reference;
- platform_operation_outbox: durable, idempotent intent for a guarded platform
  action that needs an external deployment/provider acknowledgement, including
  action/environment/release/target identity, dedupe key, publisher lease,
  attempt/error state, external reference, and acknowledgement timestamp;
- platform_action_keys or an equivalent platform operation action ledger:
  environment, action key, actor/scope, requested state/version, result,
  response/evidence reference, and timestamps.

Use the project's existing naming, tenant/audit conventions, and deletion
policy. Do not add status/attempt/lease/result fields to these tables that
compete with worker_jobs. A platform action key is not a job idempotency key.

### 5.2 SQL migration

Add the next repository migration after Feature 186's 0305 migration:
apps/web/drizzle/0306_feature_188_platform_operations.sql. The migration must
be additive and idempotent where the repository convention requires it.

Protect invariants at the database level:

- one current platform control per environment/scope;
- unique gate identity for the same release/promotion/gate evaluation;
- unique promotion batch key and action key;
- unique platform operation outbox dedupe key;
- unique source watermark range per promotion stream where applicable;
- foreign keys from gate, batch, and disposition records to their parent
  control/promotion records;
- indexes for active environment controls, unresolved gates, stale sync,
  unpublished/retriable batches, evidence timeline, and source/target
  identities;
- bounded text/JSON payloads and safe evidence references;
- no destructive DROP/TRUNCATE/DELETE operation in the migration;
- explicit retention/archival policy for gate and promotion evidence.

Migration tests must verify additive behavior, duplicate protection, foreign
keys, index presence, safe JSON/text bounds, and compatibility with existing
Feature 186 migration ordering. Run the existing schema/migration tests before
adding stricter constraints to live data.

## 6. Platform Operations service and state machine

Implement the service boundary in
apps/web/server/services/platformOperations.ts. It owns platform control
records, gate aggregation, environment authorization, action idempotency, and
safe evidence reads. It does not call gcloud, Cloudflare deployment APIs, or
provider side-effecting operations directly from a request handler.

Required operations:

~~~
getOverview(input: { environment; scope }): Promise<PlatformOverview>
listGates(input: { environment; cursor; limit }): Promise<GatePage>
getPromotion(input: { environment; promotionId }): Promise<PromotionView>
listPromotionBatches(input: { promotionId; cursor; limit }): Promise<BatchPage>
listEvidence(input: { environment; cursor; limit; category }): Promise<EvidencePage>
requestAction(input: PlatformActionRequest): Promise<PlatformActionResult>
reconcileActivation(input: { cutoverId; actionIdempotencyKey; reason }): Promise<PlatformActionResult>
~~~

Guard every mutation by environment, expected control version, actor scope,
action key, current lifecycle, and required preconditions. Concurrent requests
with the same action key return the original result. Requests with a different
payload under the same key return a stable idempotency conflict.

An action that needs an external deployment or binding operation first commits
platform_operation_outbox intent in the same transaction as the guarded
control/action record. A publisher or release workflow claims that intent with
its own lease/fencing token, performs the provider operation with the stable
dedupe key, and settles the external reference and evidence in PostgreSQL. A
lost provider response is reconciled by provider/reference/dedupe inspection;
it is never handled by blindly issuing a second activation.

Legal lifecycle transitions must be explicit:

~~~
preparing -> blocked | ready_for_cutover
blocked -> preparing
ready_for_cutover -> activating
activating -> active | rollback_required
active -> separated | rollback_required
rollback_required -> active | retired
~~~

Unknown gate, expired evidence, missing release identity, stale promotion,
unrevoked sync credentials, target mismatch, or failed Hyperdrive probe blocks
activation. The service must append an operator/audit record for every
effective action and must not fabricate success from missing external data.

The gate aggregator reads durable gate results and live adapter probes through
read-only interfaces. A live probe that cannot execute returns unknown, not
passed. Gate results include the evidence reference and the exact release,
schema, target, and promotion identity they evaluated.

Implement cutoverControlPlane.ts as the coordinator for the ordered final-fence,
final-delta, validation, synthetic-test, activation, separation, and rollback
commands. It calls the promotion, gate, release, and audit ports but does not
bypass their guards or perform provider writes directly.

## 7. Data promotion engine

Implement data promotion as a separately testable service in
apps/web/server/services/dataPromotion.ts and
apps/web/server/services/promotionValidation.ts. The service is the only owner
of promotion checkpoints and batch state.

### 7.1 Inventory

inventory-feature-188.ts produces a signed, machine-readable inventory of:

- all application schemas/tables and row counts;
- primary/unique/foreign-key relationships and sequences;
- Feature 186 worker_jobs, worker_job_events, attempts, dispatches, outbox,
  schedule occurrences, settlements, and domain job bindings;
- domain rows for tenants, users, billing, media, projects, workflows,
  artifacts, notifications, and provider references;
- R2/S3 object manifests with tenant/prefix ownership;
- Vectorize document IDs, namespaces, and index version;
- secrets, credentials, sessions, signed URLs, queues, broker messages, and
  other prohibited/ephemeral values;
- differences between any legacy production dataset and the declared Dev
  source.

Every in-scope item receives TRANSFER, MERGE, TRANSFORM, REGENERATE,
RETAIN_ONLY, or PROHIBITED with owner, reason, and validation rule. A
PROHIBITED disposition for ordinary durable business data is rejected unless
approved by the data owner.

### 7.2 Target provisioning contract

Provisioning of the new PostgreSQL instance is an external gated operation.
The implementation must provide a non-secret target manifest and preflight
checker that confirms:

- provider, version, region, extensions, collation, timezone, and schema owner;
- backup, restore, point-in-time recovery, and maintenance evidence;
- network access for the promotion runner and approved application runtime;
- separate source and target credentials with minimum privileges;
- target accepts the chosen replication/watermark method;
- Hyperdrive can be bound to the target endpoint without exposing the source;
- target database identity matches the manifest after connection;
- target is not reachable by the normal production traffic path before
  activation.

If a selected provider does not support the required logical replication or
transaction-watermark access, the preflight fails and the operator must select
an approved compatible mode/provider. The tool must not silently fall back to a
periodic table copy.

### 7.3 Snapshot and continuous synchronization

Prefer native PostgreSQL logical replication/CDC only after the target
capability gate passes. The source is the publisher and the new target is the
subscriber. Capture the snapshot transaction watermark and confirm ordered
change application.

If native replication is unavailable, use a durable transaction-watermark
exporter backed by an approved source change feed. The feed may be a provider
CDC stream or an explicitly installed source-side append-only change journal,
but it must expose a durable monotonic sequence, table/key identity, operation
type, row version, and delete tombstones for every in-scope table. Updated-at
timestamps or periodic row comparison alone are not an accepted change feed.
If the source cannot expose such a feed, promotion is blocked and native
logical replication or a provider with an equivalent capability must be used.
The exporter must:

- read source changes from a durable, ordered source watermark;
- represent inserts, updates, and deletes;
- apply batches idempotently using stable primary/business keys;
- record source range, target result, counts, digest, error, and retry state;
- advance the checkpoint only after the target transaction commits and the
  batch evidence is durable;
- resume after process, connection, or target failure;
- quarantine an ambiguous batch rather than applying it twice blindly;
- bound work per tick and expose lag/backpressure to the Admin UI.

The initial snapshot, continuous sync, and final delta must use the same
row-disposition and transformation rules. Never copy live Redis/BullMQ/Celery/
Cloud Tasks/Cloudflare messages as canonical data. Recreate or reconcile
transport intent from PostgreSQL according to Feature 186.

### 7.4 Validation

promotionValidation.ts must produce a promotion manifest with:

- source/target database identity and schema/release versions;
- per-table/partition source and target counts and deterministic digests;
- missing/extra rows and transformed/merged/regenerated counts;
- delete propagation evidence;
- foreign-key, unique/check constraint, and sequence results;
- tenant ownership and canonical job/event/attempt/dispatch/outbox checks;
- R2 object count/size/content hash/content type/metadata results;
- Vectorize index/document/namespace/version and retrieval checks;
- batch errors/retries/watermarks and signer;
- final overall status and gate references.

Use deterministic partitioning for high-volume tables and record the algorithm
and boundaries. A row-count-only match never passes a complete validation gate.

### 7.5 Final fence and cutover-ready sequence

The command sequence must be persisted as idempotent phases:

1. mark source as promotion authority and verify inventory;
2. confirm continuous sync is healthy and lag is within policy;
3. freeze/fence new producers and user writes in the approved maintenance
   scope;
4. drain safe work and reconcile all other canonical jobs by job_id;
5. capture final source transaction watermark;
6. apply final delta and wait for target acknowledgement;
7. validate all databases, objects, indexes, sequences, jobs, settlements,
   and domain projections;
8. run target synthetic tests while traffic remains closed;
9. mark the release ready for guarded activation.

The source remains authoritative until activation is committed. An incomplete
final delta, unresolved job, ambiguous provider operation, or target mismatch
blocks the action and leaves the source/target in an inspectable state.

Synthetic target tests use a dedicated non-production test tenant or isolated
transaction namespace, disable paid providers and irreversible side effects,
and record cleanup/retention evidence. They must exercise representative reads
and guarded writes against the target without creating ordinary production
rows or relying on the Dev database.

## 8. Hyperdrive and Cloudflare runtime package

Create apps/cloudflare as a dedicated Worker package if no existing Worker
package is found. It must have separate wrangler environments for staging and
production. The production Hyperdrive binding points only to the new
Production PostgreSQL instance.

### 8.1 Hyperdrive client boundary

Implement apps/cloudflare/src/db/hyperdrive.ts as the only database client
factory available to Cloudflare runtime code. It must:

- accept a typed environment binding and expected environment identity;
- create a client per request/step according to Hyperdrive guidance;
- enforce bounded connection/pool and query timeouts;
- expose transaction helpers needed by claim, heartbeat, progress, result,
  event, outbox, and reconciliation operations;
- reject a binding whose target identity is missing or mismatched;
- avoid logging connection strings, credentials, SQL payloads, or signed URLs;
- classify unavailable database errors for bounded transport redelivery or
  operator quarantine;
- make prepared-statement compatibility explicit and testable.

Cloudflare handlers must not import apps/web/server/db.ts or use a Dev
DATABASE_URL. A production binding test must prove the target identity and
deny a Dev target.

The existing Node application database boundary must also become environment
aware. Update apps/web/server/db.ts only through an approved resolver that
loads the declared environment connection and verifies the connected database
identity. During preparation, the Dev deployment uses the Dev source. If the
Node web/API process remains deployed during or after cutover, its Production
deployment uses the new Production target and separate credentials; it never
uses the Dev source. If the web/API surface is moved into the Cloudflare Worker
package, it must use the Hyperdrive factory above. This deployment choice is
recorded in the environment contract and cannot be inferred from a global
DATABASE_URL or a local .env file.

### 8.2 Queues adapter

Implement apps/cloudflare/src/adapters/queues.ts against the Feature 186
transport port. The message contains canonical job_id, contract version,
business attempt/dispatch metadata, and bounded routing metadata. Publishing
uses the stable outbox dedupe key. Consumer behavior is:

1. authenticate/validate the envelope;
2. load the canonical row through Hyperdrive;
3. claim a fenced lease;
4. run the thin executor boundary;
5. report heartbeat/progress/result/failure through the control plane;
6. acknowledge only after the required durable write succeeds.

Configure retry/DLQ behavior as transport protection. Queue retries must not
increment business attempt or re-run a paid side effect with a new key.

### 8.3 Workflows adapter

Implement apps/cloudflare/src/adapters/workflows.ts for multi-step, waiting,
approval, and long-lived coordination. Step names are deterministic and include
canonical job/attempt/logical step identity. Each side effect is inside an
idempotent step with a persisted completion/settlement marker before step
acknowledgement. Hyperdrive access is established inside the step that uses it.
Workflow replay resumes the same step result and never becomes a fresh business
attempt without a guarded control-plane transition.

### 8.4 Containers and Worker App adapters

Implement Containers and Worker App adapters as capability-routed execution
boundaries. They receive canonical job context, not copied mutable status.
Container images are pinned by digest and retained through the rollback window.
Lifecycle events, instance identity, resource failures, restart, and timeout
are observations reported through the canonical lease/recovery contract.
CPU-heavy work must not run in a Worker event loop that is responsible for
renewing transport or application leases.

### 8.5 Cron adapter

Implement apps/cloudflare/src/adapters/cron.ts as a scheduler-only adapter.
Provider trigger time is UTC, but the application computes and validates
schedule timezone, version, missed-occurrence policy, and deterministic
occurrenceKey. Cron creates a job intent and never runs cleanup, billing,
polling, or other business work inline.

### 8.6 Callback and external provider boundary

Callbacks first verify provider signature/credential, replay protection, stored
operation/reference, tenant, and contract version. They then create a bounded
reconciliation signal. They cannot directly mark a job complete/cancelled or
write progress without a newly acquired fenced lease.

## 9. Feature 186 integration and legacy replacement

Extend the existing Feature 186 adapters and ports rather than creating a
second lifecycle implementation. The Cloudflare adapters use the same
DispatchRequest/DispatchRef/LeaseContext/JobReporter semantics.

Add a migration manifest per job type with:

- owning call sites and domain owner;
- active side-effecting producer and adapter;
- contract/schema version;
- compatibility status projection;
- execution/lease/heartbeat/timeout/retry/event-rate budgets;
- backfill/drain policy;
- rollback flag and evidence links.

For each queue family:

1. inventory direct calls and existing IDs;
2. bind new work to worker_jobs before publish;
3. add compatibility wrappers for in-flight legacy work;
4. route one low-risk class through the new adapter;
5. compare canonical state with transport observations;
6. run duplicate/lost-ack/worker-loss/lease-expiry tests;
7. disable the old side-effecting producer for new work;
8. retain old identifiers until the reconciliation window closes.

Update mediaJobs, scheduler, tasks route, scaleTier, and other discovered
callers so production cannot silently choose Cloud Tasks/Celery/BullMQ/Redis or
direct Python fallback after Cloudflare activation. Legacy calls in an
unmigrated scope remain explicitly allowlisted and observable; calls in an
activated scope are rejected, audited, and alerted.

Production storage must fail closed if R2/managed storage is unavailable. Local
filesystem fallback may remain for development only and must be impossible from
the production environment contract.

## 10. Admin API and authorization

Create apps/web/server/routers/platformOperations.ts and mount it through the
existing app router. Keep legacy infrastructure endpoints as compatibility
read-only or migration-only endpoints until their callers are migrated; do not
delete unrelated Admin functionality.

Recommended tRPC operations:

- platformOperations.getOverview
- platformOperations.listGates
- platformOperations.getPromotion
- platformOperations.listPromotionBatches
- platformOperations.listEvidence
- platformOperations.prepare
- platformOperations.validate
- platformOperations.requestMaintenance
- platformOperations.activate
- platformOperations.cancelActivation
- platformOperations.requestRollback
- platformOperations.separateSync

Input schemas require environment, expected control version, action idempotency
key, actor reason where a mutation is involved, and any target release/data
manifest identity. The server derives tenant/actor/admin scope; clients cannot
choose a database URL, binding, provider, target, or fallback.

Use existing auth, CSRF/rate-limit, audit, and admin authorization middleware.
Tenant-scoped operators cannot view or mutate platform-wide cross-tenant
evidence unless their existing elevated scope allows it. Redact credentials,
connection strings, raw provider responses, payloads, signed URLs, and
unbounded logs before the API response.

Every mutation returns a stable result with action key, resulting control
version, lifecycle state, gate summary, and evidence/correlation reference.
Unknown or unavailable dependencies return a visible unknown/blocked result,
not HTTP success with an empty payload.

## 11. Admin UI implementation

Replace the infrastructure tab's mixed panel through a staged boundary:

1. add AdminPlatformOperations and the API queries while leaving the old panel
   available behind a compatibility flag;
2. render the new platform/gate/promotion/job sections and verify data parity;
3. migrate safe read-only diagnostics;
4. migrate guarded actions one at a time;
5. remove only the obsolete direct mutation UI after browser evidence and
   call-site audit pass.

Suggested component ownership:

- PlatformOperationsHeader: environment/platform/release identity;
- GateSummaryCard: pass/fail/blocked/unknown/expired state and evidence link;
- PromotionHealthPanel: source/target/watermark/lag/fence/batch status;
- DataValidationTable: table/partition/object/index validation;
- JobControlPlaneSummary: canonical job/lease/outbox/recovery metrics;
- RuntimeAdapterMatrix: Cloudflare capability and legacy observation;
- CutoverActionRail: guarded action availability and confirmation;
- CutoverConfirmationDialog: target, release, maintenance window, actor/reason;
- EvidenceTimelineDrawer: cursor pagination, redaction, audit/correlation links.

Use existing Admin Settings navigation, cards, badges, data tables, dialogs,
mutation hooks, toasts, permission gates, and localization patterns after
confirming their current implementations. Do not add a global Astryx reset.
Use existing design tokens and component props; avoid raw color/spacing values.

### UI/UX Contract

#### Target User / JTBD

- Role: platform administrator or release operator.
- Goal: decide whether Cloudflare production is safe and execute a reviewed
  action with evidence.
- Entry point: Admin Settings > Platform Operations.
- Success outcome: the operator sees an authoritative, environment-scoped
  status and cannot accidentally activate an unvalidated target.

#### Existing Pattern Reference

- Search: targeted rg across
  apps/web/client/src/components/admin, apps/web/client/src/pages, and
  existing job-monitor/admin approval surfaces for status cards, async
  mutations, confirmation dialogs, redacted diagnostics, and paginated tables.
- Found: InfrastructureSettingsPanel.tsx for current operational inventory;
  AdminLLMProviders.tsx/AdminQueueLLM.tsx for AlertDialog/mutation patterns;
  AdminSettings.tsx for navigation; existing admin dashboard pages for
  status/table patterns.
- Decision: reuse the existing Admin interaction model and diverge only in
  information architecture so gate evidence, environment scope, and
  irreversible cutover confirmation are explicit.

#### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Admin navigation | client/src/pages/AdminSettings.tsx | Replace infrastructure panel entry with new page boundary. |
| Operations page | client/src/pages/AdminPlatformOperations.tsx | Compose query-driven control center. |
| Operations components | client/src/components/admin/platform-operations/* | Own cards, tables, dialogs, and timeline. |
| API contract | server/routers/platformOperations.ts | Typed reads and guarded actions. |
| Browser evidence | tests/e2e/admin-platform-operations.spec.ts | Capture required state/viewport proof. |

#### Component Map

| Component | Owns | Consumes |
|---|---|---|
| PlatformOperationsHeader | environment/release identity display | overview query |
| GateSummaryCard | one gate state and evidence affordance | gate result |
| PromotionHealthPanel | source/target sync and fence summary | promotion query |
| DataValidationTable | bounded validation rows | validation evidence page |
| JobControlPlaneSummary | Feature 186 operational summary | job/control-plane metrics |
| RuntimeAdapterMatrix | adapter capability/legacy state | runtime gate data |
| CutoverActionRail | action eligibility and pending state | gate summary and action mutation |
| CutoverConfirmationDialog | explicit destructive-action confirmation | selected action and mutation |
| EvidenceTimelineDrawer | paginated redacted timeline | evidence query |

#### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | Skeletons with stable headings; actions disabled | component test and browser assertion |
| empty | Explain no promotion/gates yet; show safe next action | component test |
| blocked | Red status, reason code, evidence link, no activation action | browser test |
| unknown/stale | Distinct warning; freshness timestamp; refresh/retry path | browser test |
| partial success | Passed items visible, unresolved items highlighted | component test |
| ready | All required gates and identities visible; activate enabled only for scope | browser test |
| mutation pending | Dialog locked, progress text, duplicate-click protection | browser test |
| success/active | Activation certificate/evidence and current target displayed | browser test |
| error/forbidden | Redacted stable error; no sensitive detail; no state assumption | component/browser test |
| hover/focus/selected/disabled | Existing tokenized affordances and visible focus | accessibility/browser evidence |

#### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Cards stack; tables become labeled rows/drawers; no page overflow | Playwright screenshot/assertion |
| tablet 768x1024 | Summary grid adapts; evidence table scrolls in bounded region | Playwright screenshot/assertion |
| laptop 1024x768 | Action rail and navigation do not clip; dense rows remain readable | Playwright screenshot/assertion |
| desktop 1440x900 | Full dashboard with summary, evidence, timeline, and action rail | Playwright screenshot/assertion |
| wide-desktop 1280x800 | Dense table and action rail do not overlap | Extended screenshot |
| small-mobile 360x800 | Required if table/drawer layout is risky | Extended screenshot |

#### Accessibility Acceptance

- Keyboard path reaches environment selector, evidence links, filters, tables,
  action rail, confirmation dialog, and close controls in logical order.
- Focus remains visible and returns to the triggering control after dialog close.
- Headings, table headers, status labels, dialog names, and live mutation
  announcements are semantic and screen-reader accessible.
- Color is never the sole status signal; contrast meets the existing product
  accessibility baseline.
- Reduced-motion preference disables nonessential status animation and avoids
  layout-shifting polling effects.

#### Copy Contract

- Tone: concise, calm, operational, and explicit about risk.
- Primary languages: Thai and English via the existing i18n mechanism; English
  is the fallback for missing translations.
- Required labels: Environment, Source database, Production target, Hyperdrive,
  Sync lag, Final write fence, Gate evidence, Activate, Rollback request,
  Legacy calls, Unknown, Blocked, and Action ID.
- Validation/error copy must include stable codes such as
  TARGET_IDENTITY_MISMATCH, GATE_UNKNOWN, SYNC_LAG_EXCEEDED,
  IDEMPOTENCY_CONFLICT, AUTHORIZATION_REQUIRED, and JOB_RECOVERY_INCOMPLETE.
- Empty/loading/success copy must state what is being checked and whether a
  safe action is available; never say "healthy" for missing data.

#### Browser Evidence Required

Follow the ui-browser-verification guidance and capture ready, blocked,
unknown/stale, sync-lag, mutation-pending, authorization-failure, and redacted
evidence states at the canonical viewports. Record build identity, test fixture,
environment, and screenshot paths without exposing real credentials.

## 12. Release workflow and repository controls

Keep naibarn/SmartSpecPro as the single source repository. Add repository
controls rather than creating a second repo:

- protected main branch and required checks;
- GitHub Environments for development, staging, production, and
  emergency-rollback;
- required reviewers/wait timers and branch restrictions for production;
- OIDC trust bound to repository, branch/workflow, and environment claims;
- separate Cloudflare production/staging identities and GCP rollback identity;
- no long-lived cloud credentials in repository files;
- immutable commit, Worker bundle, container image, migration, schema, and
  manifest digests;
- container images retained through the rollback window;
- release manifest signed or otherwise integrity-protected.

Add Cloudflare workflows beside current GCP workflows:

1. Build/test shared packages and apps.
2. Generate and validate release, adapter, schema, and promotion-manifest
   schemas.
3. Deploy non-production Cloudflare bindings with environment-specific
   identity.
4. Run adapter contract, Hyperdrive target-identity, synthetic, and smoke
   checks.
5. Require production environment approval before any deployment or activation
   step.
6. Publish evidence bundle keyed by commit/artifact/schema/target identity.

Do not let a workflow auto-create a production database, copy secrets, activate
traffic, or run paid providers. Database provisioning and final cutover remain
separate reviewed operations.

## 13. Cutover runbook implementation

Write ops/feature-188/cutover-runbook.md with executable checklists and
evidence fields. The order is fixed:

1. freeze release candidate and all immutable digests;
2. verify source inventory and approved legacy-production dispositions;
3. verify new target PostgreSQL identity, backups, extensions, and network;
4. verify Hyperdrive production binding resolves only to the new target;
5. run full snapshot and continuous synchronization;
6. pass schema, data, object, index, job, settlement, security, adapter, and
   recovery gates;
7. approve maintenance window;
8. stop/fence new user writes, producers, and schedules;
9. drain safe work and reconcile other canonical jobs by job_id;
10. freeze source writes and capture final watermark;
11. apply final delta and run complete final validation;
12. run representative synthetic tests against the target while traffic is
    closed and before activation;
13. activate Cloudflare through the guarded control-plane action;
14. open production traffic only after activation evidence is durable;
15. verify zero-legacy calls in the activated scope and publish the
    zero-legacy verification evidence;
16. disable replication/CDC/watermark sync and revoke sync credentials;
17. prove a post-cutover sync attempt is denied and audited;
18. issue the cutover certificate and close the window.

The runbook records actor, reason, action key, release/data/schema/target
identities, timestamps, gate bundle digest, maintenance outcome, and evidence
references. It includes an explicit extension/rollback decision point for the
24–72 hour maintenance window.

Activation is a two-party handoff: the control plane durably records the
activation intent and fence, the release workflow applies the Cloudflare
deployment/binding change using the same dedupe key, and the control plane
settles ACTIVE only after target-identity and runtime probes are durable.
Traffic opening is a separate guarded step. Provider response loss is resolved
by inspecting the release identity and external operation reference.

Write ops/feature-188/rollback-runbook.md with:

- target/source compatibility checks;
- whether target writes occurred after activation;
- canonical job and side-effect reconciliation;
- image/schema/artifact retention check;
- explicit forward-fix versus reverse-reconciliation choice;
- producer switch and traffic controls;
- audit and evidence requirements.

Rollback never deletes event history, reopens terminal jobs implicitly, or
blindly switches to Dev after target writes. It is an incident procedure, not
an Admin button that bypasses the control plane.

## 14. Observability, security, and failure handling

Use structured logs and metrics containing job_id, attempt_id, environment,
promotion_id, batch_id, release SHA, target identity, adapter, gate, source/
target watermark, lag, action key hash, and correlation ID. Never log raw
tokens, passwords, connection strings, signed URLs, or unbounded payloads.

Alert on:

- unknown/expired required gate;
- target identity or Hyperdrive mismatch;
- sync lag, batch quarantine, failed final delta, checksum/FK/sequence drift;
- stale Feature 186 leases, outbox age, unresolved settlement;
- duplicate/legacy producer calls after migration;
- Cloudflare-to-Dev connectivity attempt;
- post-cutover sync attempt;
- missing or expired rollback artifacts.

Failure handling must be explicit:

| Failure | Required behavior |
|---|---|
| New DB unavailable | Block provisioning/promotion; never publish production traffic. |
| Hyperdrive unavailable | Queue/workflow redelivery or quarantine; do not acknowledge durable work. |
| Source unavailable during sync | Preserve last checkpoint and report lag; do not advance watermark. |
| Target unavailable during batch | Retry boundedly; preserve batch key; quarantine ambiguous commit. |
| Snapshot/delta mismatch | Block activation; retain evidence and allow operator inspection. |
| Duplicate delivery | Reuse canonical job/attempt/side-effect markers. |
| Legacy call in activated scope | Reject, audit, alert; do not fallback. |
| Gate probe timeout | Record unknown/blocked, not passed. |
| Callback unauthenticated/cross-tenant | Record bounded security observation; no job mutation. |
| Action concurrency race | Guard by control version/fence; return stable conflict/result. |
| Cloudflare activation response lost | Inspect durable activation intent, release digest, and provider operation; settle or quarantine without a second activation. |
| Target write after activation and rollback request | Stop, reconcile, and choose forward-fix/reverse process; no blind switch. |

## 15. Test-first implementation sequence

Write tests before each implementation slice. Tests are stubs/specifications in
the plan; the implementer writes actual fixtures and assertions.

### Slice A — schema and contracts

- migration is additive and follows 0305;
- platform control/gate/promotion records contain required fields;
- database uniqueness/FK/index constraints reject duplicates and orphan records;
- environment/platform/promotion state transitions accept only legal edges;
- configuration rejects missing, mismatched, or secret-bearing target metadata.

### Slice B — control-plane service

- concurrent same-key action requests converge on one outcome;
- same action key with different payload returns IDEMPOTENCY_CONFLICT;
- unknown, expired, stale, or mismatched gates block activation;
- activation requires final fence, final delta, target identity, Hyperdrive, and
  synthetic-test evidence;
- unauthorized tenant/admin action is rejected and audited;
- rollback does not delete history or reopen terminal jobs.

### Slice C — promotion engine

- inventory covers all configured schemas, durable tables, objects, indexes,
  sequences, and Feature 186 records;
- every row/partition requires a valid disposition;
- snapshot resumes after interruption;
- watermark sync applies inserts, updates, and deletes exactly once;
- failed batch does not advance checkpoint;
- duplicate batch key converges;
- ambiguous batch is quarantined;
- source/target digest, FK, unique, sequence, object, and Vectorize checks
  identify missing/extra/mismatched data;
- final write fence and final delta are ordered and idempotent;
- post-cutover sync credentials are revoked and denied.

### Slice D — Hyperdrive and adapters

- production binding target identity is the new database, never Dev;
- client lifecycle/pool/transaction/prepared-statement behavior is covered;
- Hyperdrive outage does not acknowledge a required durable message/step;
- Queues duplicate delivery converges;
- Workflow replay uses the same deterministic step/settlement key;
- Container restart/timeout is reported with lease fencing;
- Cron occurrence timezone/DST/missed-occurrence behavior is deterministic;
- callback signature/replay/tenant/reference checks fail closed.

### Slice E — Feature 186 integration

- canonical job/event/attempt/dispatch/outbox data is preserved in promotion;
- no duplicate billing/provider/artifact/notification side effect;
- stale worker/callback cannot overwrite a newer terminal state;
- transport observations are never treated as canonical status;
- migrated queue-family static audit has no direct producer imports/calls.

### Slice F — Admin API/UI

- API redacts secrets and enforces environment/admin scope;
- overview and cursor pages handle loading/empty/error/unknown/stale states;
- action button eligibility reflects gate state and control version;
- confirmation dialog includes target, release, maintenance, actor, reason,
  and action key;
- browser tests cover all required viewports and responsive overflow;
- keyboard/focus/semantic labels/reduced motion/contrast acceptance passes.

### Slice G — release and evidence

- workflows require correct environment/OIDC claims and production approval;
- release manifest digests are stable and tamper-detectable;
- generated bundle/static audit catches hidden legacy calls;
- target synthetic test suite has no paid provider or irreversible side effect;
- deployment evidence distinguishes build, migration, binding, data, runtime,
  activation, rollback, and separation proof.

## 16. Verification commands and evidence

Use the repository's existing package-relative tooling:

- focused web tests from apps/web with the existing JWT test secret pattern;
- schema/migration Vitest tests;
- service/router/adapter tests;
- database integration tests only against an explicitly isolated test database;
- Playwright admin tests with canonical viewports;
- apps/web typecheck and focused changed-path checks;
- audit:feature-186-call-sites plus a Feature 188 legacy/runtime audit;
- Cloudflare package typecheck/build/tests once the package exists;
- workflow YAML/schema validation without triggering deployment.

Record command, commit SHA, package/build identity, environment, database
identity class (never a secret), result, artifact path, and reviewer in the
evidence bundle. A successful local test, build, health endpoint, or mock
adapter is not production Cloudflare proof.

## 17. Rollout phases and dependency order

1. Inventory and SocratiCode/rg impact map; no runtime behavior change.
2. Shared contracts, schema migration, state service, and migration tests.
3. New PostgreSQL target preflight and promotion manifest tooling.
4. Snapshot plus continuous sync in an isolated, non-traffic target.
5. Hyperdrive target-identity adapter and Cloudflare non-production package.
6. Cloudflare adapter contract/failure tests and Feature 186 queue-family canary.
7. Platform Operations API and read-only Admin UI.
8. Guarded admin actions, evidence timeline, and release workflows.
9. Full validation, maintenance-window synthetic tests, and operator runbook
   rehearsal.
10. Authorized one-time cutover, traffic opening, sync revocation, and
    separation certificate.
11. Post-cutover legacy retirement only after the rollback/reconciliation
    evidence window closes.

Parallel work is allowed only after shared contracts and migration schemas are
stable: UI read surfaces can proceed with fixtures while promotion/adapter
services are built; Cloudflare adapter contract tests can proceed against the
in-memory Feature 186 adapter. Activation, target write tests, and production
credentials remain sequential gates.

## 18. Definition of done

The implementation is complete only when:

- the Platform Operations UI replaces the old infrastructure control surface
  without losing unrelated Admin capabilities;
- all platform mutations are guarded, idempotent, authorized, audited, and
  fail closed on unknown evidence;
- the new PostgreSQL target is declared, capability-validated, and uniquely
  identified without exposing credentials;
- complete snapshot, durable continuous sync, final write fence, final delta,
  row/object/index/job validation, and signed evidence exist;
- Cloudflare runtime access to Production PostgreSQL is exclusively through the
  Production Hyperdrive binding;
- duplicate delivery, workflow replay, container restart, provider ambiguity,
  lease loss, and database outage converge through Feature 186;
- production no longer has hidden GCP/Celery/BullMQ/Redis/Cloud Tasks fallback
  in the activated scope;
- GitHub environment/OIDC/release identity gates and rollback artifact
  retention are verified;
- target synthetic tests ran with traffic closed before activation;
- post-cutover Dev/Production synchronization is disabled, credentials are
  revoked, and denied attempts are audited;
- deployment/cutover evidence separately proves schema, data, binding, build,
  runtime, activation, recovery, and permanent separation.
