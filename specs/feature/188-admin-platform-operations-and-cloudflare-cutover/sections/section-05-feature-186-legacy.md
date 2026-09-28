# Section 05 — Feature 186 Integration and Legacy Replacement
+## UI/UX Contract

### Target User / JTBD

- N/A — Feature 186 integration and legacy enforcement only; section-06 presents observations.

### Existing Pattern Reference

- N/A — no new browser component is implemented here.

### Surface Inventory

- N/A — no route, dialog, table, or form is changed.

### Component Map

- N/A — adapters, migration manifests, and audits only.

### State Matrix

- N/A — canonical/legacy states are verified by service and audit tests.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — legacy warning copy is owned by section-06.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and final integration.

## Scope

Bind migrated queue families to the canonical Feature 186 Job Control Plane and
remove hidden GCP/Celery/BullMQ/Redis/Cloud Tasks fallback from activated
scopes while preserving compatibility shims and in-flight work until evidence
allows retirement.

## Ownership paths

- apps/web/server/services/jobTransportAdapters.ts:
  extend existing adapter ports and add Cloudflare-compatible registration.
- apps/web/server/services/jobControlPlaneTypes.ts and related Feature 186
  services: consume shared contracts after impact review.
- apps/web/server/routers/mediaJobs.ts:
  migrate direct dispatch and provider polling call sites.
- apps/web/server/services/scheduler.ts:
  route schedule intent through SchedulerAdapter.
- apps/web/server/routes/tasks.ts:
  retain only an explicit rollback/compatibility boundary, or reject after
  activation according to the rollout manifest.
- apps/web/server/services/scaleTier.ts:
  remove direct Admin-triggered runtime mutation from migrated scope.
- apps/web/server/scripts/audit-feature-188-call-sites.ts:
  static source and generated-bundle audit.
- ops/feature-188/job-family-manifests/:
  one manifest per migrated job family.

## Migration rules

Each job type has one active side-effecting producer. A migration wave:

1. inventories direct producers, processors, callbacks, side effects, timeouts,
   retries, and legacy IDs;
2. binds new work to worker_jobs before any transport publish;
3. adds a thin compatibility wrapper for in-flight legacy work;
4. routes one low-risk class through the adapter;
5. compares canonical state to transport observations;
6. proves duplicate delivery, lost acknowledgement, worker loss, lease
   expiry, provider ambiguity, and settlement recovery;
7. disables the old side-effecting producer for new work;
8. retains legacy identifiers until the reconciliation window ends.

Transport observations never write terminal business state alone. A job ID plus
the complete attempt/lease/fencing context is required for worker reporting.
Retries preserve provider operation keys and settlement markers.

## Legacy enforcement

The audit scans direct BullMQ add/process calls, Redis queue/status mutation,
Celery delay/apply_async/send_task, Beat business work, Cloud Tasks creation/
handler/polling, direct GCP deployment/scale calls, local filesystem
production fallback, provider callbacks bypassing control plane, and generated
bundles.

Compatibility shims are explicitly enumerated in each manifest with owner,
environment, active flag, and retirement gate. In activated scope, an
unexpected call is rejected, audited, metered, and alerted; it is not routed
to a hidden fallback. Production storage returns a controlled failure if R2/
managed storage is unavailable rather than using local disk.

## TDD stubs

- Feature 186 canonical job/event/attempt/dispatch/outbox data survives
  migration and promotion with stable identity.
- Duplicate delivery cannot double-charge, resubmit provider work, publish
  duplicate artifact, notify twice, or fire duplicate webhook.
- Stale worker/callback cannot overwrite current terminal state.
- Transport observation cannot change canonical status without a guarded command.
- Each rollout manifest has one active side-effecting producer and valid
  rollback flag.
- Static/generated audit catches direct activated-scope legacy calls and
  distinguishes allowed compatibility shims.
- Legacy Cloud Tasks/Celery/BullMQ calls are rejected after activation.
- Local filesystem fallback is impossible under Production environment config.

## Acceptance

Every migrated job family has a manifest, one side-effecting producer, a
canonical job binding, adapter evidence, rollback behavior, and a zero-hidden-
fallback audit. Unmigrated work remains explicitly documented and does not
silently influence the new path.
