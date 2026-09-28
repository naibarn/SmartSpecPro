# Feature 188 — Synthesized Implementation Specification

## Purpose

Feature 188 replaces the mixed Admin Infrastructure screen with an authorized
Platform Operations control center and establishes the operational path from the
current Dev Server/GCP-backed system to a Cloudflare production runtime. The
feature coordinates, but does not replace, Feature 186's canonical Job Control
Plane.

The implementation must support preparation, validation, a guarded one-time
cutover, and permanent Dev/Production separation. It must not perform a
production deployment, mutate credentials or .env files, copy production data,
or activate Cloudflare as part of the specification work.

## Approved stakeholder decision

Production will use a newly provisioned PostgreSQL instance. The current Dev
Server database is the promotion source during preparation. The target receives
a complete snapshot, durable continuous synchronization, a final write fence,
final delta, and validation. After activation, Cloudflare production connects
to the new Production PostgreSQL instance through Hyperdrive. Cloudflare must
never connect directly to the Dev Server database.

The target and source use separate credentials, network policies, storage
namespaces, queues, workflows, indexes, secrets, and admin scopes. Continuous
synchronization is disabled and its credentials revoked after the cutover
certificate is issued.

## Invariants

1. worker_jobs.id remains the canonical job ID; no generic replacement jobs
   table is introduced.
2. PostgreSQL is the source of truth for application data and Feature 186 job
   lifecycle. Queues, providers, workflows, containers, Redis, GCP, and
   Cloudflare references are observations or transport metadata.
3. The current Dev Server dataset is promoted completely. Every durable table
   and row has a transfer, merge, transform, regenerate, retain-only, or
   prohibited disposition with evidence.
4. The source remains authoritative through final write fence, final delta, and
   final validation.
5. No unknown or missing gate result is healthy. Activation fails closed.
6. One side-effecting producer is active per job type. Dual-run is only
   observation-only or side-effect-free.
7. No legacy GCP/Celery/BullMQ/Redis/Cloud Tasks producer is an implicit fallback
   after Cloudflare activation. Emergency rollback is explicit, audited, and
   operator-controlled.
8. Data promotion is idempotent, resumable, ordered, delete-aware, and
   checkpointed. A failed batch never advances its durable watermark.
9. A Cloudflare runtime reaches Production PostgreSQL only through Hyperdrive.
   Hyperdrive is a connection boundary, not a second source of truth.
10. Release identity is an immutable Git commit/artifact/schema/data-manifest
    bundle. GitHub is not a production data store.

## Current repository evidence and constraints

- Repository: naibarn/SmartSpecPro; branch main tracks origin/main.
- Root tooling declares npm 10.9.8; apps/web declares pnpm 10.4.1.
  Package-relative commands must run from their matching workspace.
- Existing tests use Vitest, jsdom/Testing Library, and Playwright.
- Drizzle migration and database integration scripts already exist in
  apps/web/package.json.
- InfrastructureSettingsPanel.tsx is a large mixed-responsibility UI and
  AdminSettings.tsx owns its navigation entry.
- infrastructure.ts currently exposes GCP, Cloud Tasks, Redis, queue,
  monitoring, scale, deployment, and Celery diagnostics.
- mediaJobs.ts, scheduler.ts, routes/tasks.ts, and scaleTier.ts contain
  direct or conditional GCP/Cloud Tasks/runtime behavior that must be inventoried
  before replacement.
- jobTransportAdapters.ts has BullMQ, Celery, and in-memory adapters; native
  Cloudflare Queues, Workflows, Containers, and Cron adapters are not complete.
- db.ts currently connects through DATABASE_URL; storage.ts supports R2/S3 and a
  local filesystem fallback that must be fail-closed in production.
- Existing GitHub workflows deploy GCP/Cloud Run and Artifact Registry.
  Cloudflare workflows and environment protections are implementation work.
- SocratiCode was unavailable during research. Before implementation, repeat
  impact and dependency discovery with SocratiCode if it is available, then
  confirm with targeted rg and source reads.

## Target architecture

~~~
GitHub commit + immutable release manifest
                 |
                 v
Current Dev Server PostgreSQL (source authority during preparation)
                 |
       full snapshot + durable CDC/watermark sync
                 |
                 v
New Production PostgreSQL instance (target)
                 |
       final write fence + final delta + validation
                 |
                 v
Cloudflare Workers/Workflows/Containers
                 |
          Hyperdrive connection
                 |
          Production PostgreSQL
~~~

Cloudflare Queues carries canonical job_id envelopes. Workflows provide
durable multi-step coordination. Containers or Worker App provide
CPU/memory/filesystem-heavy execution. Cron creates schedule intents. R2 stores
managed objects and Vectorize stores/searches derived indexes. None of these
systems owns job status or replaces worker_jobs/worker_job_events.

## Control-center product contract

The Admin Platform Operations surface is an environment-scoped control center,
not a generic settings form. It must show:

- selected platform, target platform, current activation state, and environment;
- readiness gate status with evidence, timestamp, actor, and safe failure reason;
- database source/target identity, schema version, sync watermark, lag, batch
  status, checksum mismatches, and last validation;
- Hyperdrive binding, target database connectivity, pool/latency/transaction
  probe status, and account capability status;
- adapter/job counts, stale leases, outbox age, retries, DLQ/quarantine, and
  legacy producer observations;
- release SHA, artifact digests, schema/data-manifest IDs, maintenance window,
  activation actor, rollback state, and audit/correlation IDs;
- safe actions for prepare, validate, request maintenance, activate, cancel,
  rollback request, and inspect evidence, all idempotent and authorized.

No screen action may directly mutate .env, run gcloud, copy secrets, submit a
paid provider operation, or toggle production traffic without the guarded
server-side control-plane transition.

## UI/UX requirements

### Target user / JTBD

- Role: platform administrator or authorized release operator.
- Goal: determine whether an environment and Cloudflare cutover are safe, inspect
  the evidence, and perform an approved action without guessing from queue state.
- Entry point: Admin Settings > Platform Operations.
- Success: the operator can distinguish ready, blocked, unknown, stale, active,
  and rollback-required states and can retrieve the evidence behind each state.

### Existing pattern reference

Search before implementation with targeted rg in
apps/web/client/src/components/admin, apps/web/client/src/pages, and existing
job/admin monitor components for status cards, async mutation confirmation,
paginated tables, redacted diagnostics, and authorization fallbacks. The
existing InfrastructureSettingsPanel.tsx is the baseline information inventory,
not the final component structure.

Default decision: reuse established Admin Settings navigation, card, table,
mutation, toast, confirmation, and permission patterns. Diverge only to add
explicit platform/gate/promotion evidence semantics that the old panel cannot
represent.

### Surface inventory

| Surface | Owner | Required behavior |
|---|---|---|
| Admin Settings navigation | AdminSettings.tsx | Preserve route and unrelated tabs; replace infrastructure entry safely. |
| Platform Operations page | new admin component/page | Environment selector, platform state, gate summary, release identity. |
| Promotion panel | new admin component | Source/target, watermark/lag, row/object/index validation, final-fence state. |
| Job Control Plane panel | new admin component | Canonical job state, leases, attempts, outbox, adapter observations. |
| Adapter/runtime panel | new admin component | Queues/Workflows/Containers/Cron/Worker App/Hyperdrive capability gates. |
| Cutover dialog | new admin component | Preconditions, maintenance window, actor/reason/action idempotency, guarded action. |
| Evidence drawer/timeline | new admin component | Paginated, redacted, chronological evidence and audit references. |

### UI state and responsive requirements

The implementation must specify loading, empty, blocked, unknown/stale,
partial-success, success/ready, mutation-pending, disabled, selected, hover,
focus, and error states. Unknown is visibly distinct from healthy. Destructive
or irreversible actions require a confirmation surface that names environment,
target database, release identity, and action scope.

Use the canonical browser viewport policy:

| Viewport | Requirement |
|---|---|
| 390x844 mobile | Stack cards; tables become labeled rows/drawers; no horizontal page overflow. |
| 768x1024 tablet | Two-column summaries where possible; evidence tables may scroll within a bounded region. |
| 1024x768 laptop | Preserve navigation and dense operations layout without clipping actions. |
| 1440x900 desktop | Full dashboard with summary, evidence, timeline, and action rail. |
| 1280x800 wide desktop | Verify dense tables and action rail do not overlap. |

Keyboard navigation, visible focus, semantic headings/table markup, accessible
labels, status text not conveyed by color alone, contrast, reduced-motion
behavior, and screen-reader announcements for mutation outcomes are acceptance
requirements. Copy is concise, operational, bilingual-ready Thai/English, and
must include stable error codes for blocked/unknown/authorization/idempotency
conflicts. Localization fallback is English when a translation is unavailable.

Browser evidence must include Playwright or equivalent screenshots/assertions at
390x844, 768x1024, 1024x768, and 1440x900, covering ready, blocked, unknown,
sync-lag, mutation-pending, authorization failure, and redacted evidence states.

## Backend and persistence contract

Add a platform-operations service boundary instead of extending arbitrary
infrastructure mutations. Recommended logical records are:

- platform_release_controls: environment, current/target platform, lifecycle
  state, release identity, maintenance window, fencing/version, actor/reason,
  activation/rollback timestamps, and separation state.
- platform_gate_results: immutable or append-only gate result, gate name,
  environment, release/data-manifest IDs, status, evidence reference, safe
  failure code, actor/source, and timestamp.
- data_promotions: source/target identity, mode, schema/data manifest,
  watermark, lifecycle, fence state, credentials/revocation state, and audit
  references.
- data_promotion_batches: idempotent batch key, source watermark range,
  table/partition, counts/digests, retries, error, and applied watermark.
- data_promotion_dispositions: table/row-key or partition scope, disposition,
  transformation version, reason, owner, and validation evidence.
- platform_operation_outbox: durable idempotent intent for deployment/binding
  operations, including stable dedupe key, publisher fencing, external
  reference, acknowledgement state, and quarantine/reconciliation reason.
- platform_action_keys: append-only action idempotency ledger keyed by
  environment, action key, and expected control version.

These records coordinate operations; they do not define job status, attempt,
lease, result, or idempotency identity. Feature 186's worker_jobs and
worker_job_events remain authoritative for job lifecycle.

All writes use guarded transitions and action idempotency keys. Read paths verify
environment and administrator scope. Events/audit records contain safe bounded
metadata, never credentials or signed URLs.

## Data promotion contract

### Source and target

The source is the current Dev Server PostgreSQL database. The target is a newly
provisioned Production PostgreSQL instance. Cloudflare reaches the target only
through Hyperdrive after activation. Before migration, record source and target
provider/version/region, schema owner, extensions, permissions, backup/restore
proof, database identities, Hyperdrive binding, pool limits, and network policy.

### Method

Prefer native PostgreSQL logical replication/CDC only after a capability gate
proves provider/version/permission/extension/schema compatibility. Otherwise use
a durable transaction-watermark exporter backed by an approved source change
feed with checkpointed inserts/updates/deletes, ordered application, retries,
and resume semantics. The feed must expose a durable monotonic sequence,
table/key identity, operation type, row version, and delete tombstones for
every in-scope table. Updated-at timestamps or periodic row comparison alone
are not accepted; if the source cannot provide this feed, promotion is blocked.
Periodic best-effort copying is forbidden.

The sequence is:

1. Inventory schemas, tables, rows, foreign keys, sequences, object manifests,
   Vectorize document manifests, job bindings, secrets/ephemerals, and legacy
   production differences.
2. Assign each durable item TRANSFER, MERGE, TRANSFORM, REGENERATE,
   RETAIN_ONLY, or PROHIBITED; unresolved differences block cutover.
3. Apply schema migrations to the new target with an immutable schema version.
4. Copy a full snapshot with stable IDs and record a source watermark.
5. Start continuous ordered sync from that watermark; do not expose target to
   production traffic.
6. Validate counts, deterministic digests, deletes, foreign keys, constraints,
   sequences, tenant ownership, job event order, outbox/settlement markers,
   R2 objects, and Vectorize IDs/namespaces/version.
7. During the maintenance window, stop/fence producers and new writes, drain or
   reconcile in-flight jobs, capture the final source watermark, apply final
   delta, and repeat validation.
8. Use the release candidate to run synthetic target tests while traffic
   remains closed. Only then activate Cloudflare and open traffic.
9. Issue the cutover certificate, disable replication/sync, revoke sync
   credentials, and prove post-cutover sync is denied and audited.

Every batch is idempotent and resumable. Source deletes are represented.
Promotion manifests include row counts, partition/content digests, missing/
extra rows, transformed/merged counts, FK/unique results, sequence values,
errors, retries, watermark, signer, and final status. Expiring URLs, secrets,
credentials, live queue messages, and temporary transport state are not copied.

## Hyperdrive contract

Hyperdrive is the only Cloudflare-to-PostgreSQL boundary. The implementation
must define a binding per environment and ensure production bindings resolve
only to the new Production PostgreSQL instance. Validate:

- connection establishment and authentication;
- per-request/client lifecycle and bounded pool behavior;
- transaction commit/rollback and isolation expectations;
- prepared statement compatibility or a documented safe mode;
- latency and timeout budgets for claims, heartbeats, progress, and terminal
  transitions;
- network allowlists, secret rotation, unavailable-database behavior, and
  observability without exposing connection strings.

Workers must not acknowledge a queue message or workflow step as successfully
complete when the canonical PostgreSQL write is unavailable. Use bounded
redelivery or operator-visible quarantine according to job class.

## Cloudflare adapter contract

Cloudflare Queues is at-least-once transport; duplicate delivery is expected.
Messages contain canonical job_id, contract version, attempt/dispatch metadata,
and bounded routing data. Duplicate claim/report/side-effect operations converge
through Feature 186 fencing and durable idempotency.

Workflows use deterministic step names and idempotent step bodies. Paid or
irreversible side effects occur inside a durable step with a persisted
completion/settlement marker before acknowledgement. Hyperdrive clients are
created in the step that uses them.

Containers and Worker App are capability-routed execution boundaries for
CPU/memory/filesystem-heavy work. Images are pinned by digest and retained
through rollback windows. Cron creates deterministic schedule occurrence
intents using application timezone/version policy even though provider triggers
are UTC.

Provider callbacks require authenticated signature/credential validation,
replay protection where available, correlation to stored reference and tenant,
and a fenced control-plane command before progress or terminal state changes.

## Legacy replacement and release controls

Inventory and then eliminate or explicitly mark every direct .add(), .delay(),
.apply_async(), send_task(), Redis status mutation, Cloud Tasks handler, GCP
deployment call, Celery Beat business action, local filesystem production
fallback, and provider callback that bypasses the control plane.

The same GitHub repository remains the source of code and immutable artifacts.
Use protected main, environment-scoped approvals, short-lived OIDC trust,
separate Cloudflare/GCP rollback identities, commit/artifact/schema/data
manifest digests, and release manifests. Existing GCP workflows remain only
until rollback/retirement evidence closes.

## Cutover and rollback boundaries

Preparation is reversible. Activation requires all required gates green:
source/target inventory, schema, snapshot/continuous sync, final validation,
Hyperdrive, Cloudflare bindings/capabilities, adapter contract, job recovery,
storage/index, release identity, security, backup/restore, legacy audit, and
operator approval.

The maintenance sequence is producer freeze, safe drain/reconciliation, source
write fence, final watermark/delta, complete validation, target synthetic tests
with traffic closed, guarded activation, traffic opening, legacy-call audit,
sync shutdown, credential revocation, and cutover certificate.

Rollback is an explicit incident procedure. It may return new work to the
previous runtime only while canonical data and side-effect evidence remain
consistent and the rollback image/schema compatibility gate passes. It does not
erase committed terminal history, undo the cutover certificate, or silently
reopen terminal jobs. If data writes occurred on the target after activation,
rollback must first use a documented reverse-reconciliation or forward-fix
decision; a blind switch back is prohibited.

## Verification and acceptance

Required evidence includes:

- Vitest unit/service tests for gates, state transitions, idempotency,
  dispositions, watermark/backoff, manifests, redaction, and Hyperdrive policy.
- Drizzle/database tests for schema constraints, guarded transitions,
  concurrent actions, create/lock/fence, batch resume, delete propagation,
  sequence/FK/unique validation, and target isolation.
- Adapter contract and failure-injection tests for duplicate delivery, lost
  publish response, worker/container restart, workflow replay, PostgreSQL/
  Hyperdrive outage, provider ambiguity, queue/DLQ, and callback replay.
- Playwright/admin tests and viewport evidence for all UI states and safe
  action authorization.
- Static and generated-bundle audits proving no hidden legacy producer remains
  in the activated scope; runtime/network audit proving Cloudflare cannot reach
  Dev DB and post-cutover sync is denied.
- Deployment evidence that separately identifies schema migration, artifact
  identity, release/build restart, binding state, worker connectivity, target
  synthetic tests, activation, and recovery proof.

No real paid provider call, credit consumption, production notification,
irreversible artifact publication, credential migration, or production cutover
is performed by ordinary tests or by this planning work.

## Research sources and limitations

Official Cloudflare and PostgreSQL documentation informed the design:

- Cloudflare Queues delivery guarantees, retries, batching, and DLQ:
  https://developers.cloudflare.com/queues/reference/delivery-guarantees/
  https://developers.cloudflare.com/queues/configuration/batching-retries/
  https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- Cloudflare Workflows rules:
  https://developers.cloudflare.com/workflows/build/rules-of-workflows/
- Cron Triggers:
  https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Hyperdrive PostgreSQL connection and pool guidance:
  https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
  https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/
- Containers architecture and limits:
  https://developers.cloudflare.com/containers/
  https://developers.cloudflare.com/containers/platform/limits/
- PostgreSQL logical replication:
  https://www.postgresql.org/docs/16/logical-replication-architecture.html
- GitHub Environments and OIDC:
  https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
  https://docs.github.com/en/actions/reference/security/oidc

Provider account limits, database provider capabilities, credentials, and
production network behavior must be revalidated during implementation. Mock or
local readiness is not production proof.
