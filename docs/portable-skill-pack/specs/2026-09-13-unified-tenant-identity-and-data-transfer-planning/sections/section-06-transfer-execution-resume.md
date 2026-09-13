# Section 06 — Transfer execution, queue kill, checkpoints, and resume

## Scope

Execute the approved transfer as a canonical Feature 186 job with durable per-item results. Make queued work killable without deleting evidence, make partial batches resumable, and prevent duplicate ownership/artifact/provider/credit side effects.

## Files and boundaries

- `apps/web/server/services/tenantDataTransfer.ts`: executor, batch/checkpoint, state mapping, resume/conflict actions.
- Existing Feature 186 control-plane/reconciler/adapter ports: claim, lease, heartbeat, progress, cancel, outbox, event history, and fencing.
- `tenant_data_transfer_previews`/`tenant_data_transfer_plans`/`tenant_data_transfer_items`: coordination/projection only; `worker_jobs` remains canonical execution truth.

## Queue kill policy

Before processing selected job-linked domain work, reload state under a guarded transaction. For `pending`, `queued`, and `retry_scheduled`, request/finalize cancellation, fence an attempt when present, mark unpublished outbox work cancelled, cancel/remove transport via the adapter where supported, append `CANCEL_REQUESTED`/`CANCELLED` with transfer reason, and retain worker job/events/attempts/dispatch references. Mark the transfer item `skipped` with `queue_cancelled` disposition and count it separately from copied work. Never flush a shared queue, requeue, clone, regenerate, call the provider, or consume credits.

For `leased`, `running`, or `waiting_external`, mark a blocking conflict and stop the item/operation according to policy. Resolve ambiguous provider work from persisted operation key/reference or require operator review; never assume timeout means cancellation or loss. For `succeeded`, terminal `failed`, `cancelled`, and `expired`, transfer only eligible domain output/work through a registered handler.

If adapter removal is unavailable or the transport message was already published, canonical cancellation/fencing remains authoritative: a later redelivery fails the claim guard and completes as a no-op or quarantine observation. A legacy queue item without a verified canonical binding is not inferred from queue position or payload; it is quarantined or killed under the legacy drain policy and reported separately from transferred work.

## Idempotent batch execution

Derive an item key from canonical `operationId`/`worker_jobs.id`, tenant, source user, target user, resource kind/source ID, handler version, and logical action. Before a side effect, lock/recheck item state, ownership, dependency, target conflict, and durable destination/result marker. A transferred/skipped item is not executed again. No overwrite/merge is allowed. Process deterministic parent-before-child batches; persist item outcomes, `queue_cancelled` dispositions, progress, and resume cursor atomically after each bounded batch. Storage/domain partial writes use durable settlement markers keyed by item.

## Pause and resume

System/database/transport failure pauses the operation at `paused_on_error` with safe reason and durable cursor, while the canonical job is `retry_scheduled` with `operatorReviewRequired` and no automatic outbox dispatch. `resume` is an idempotent guarded action that rechecks ownership/dependencies, creates the approved dispatch signal, and continues the same operation/job. `resolveItem` may explicitly choose `retry` after the declared conflict is repaired or `skip`; it never means overwrite or merge. Resume skips `transferred`/intentional `skipped`, retries only bounded `retryable_error`, and leaves `conflict`/`permanent_error` visible until authorized resolution/skip. It never creates a replacement operation or new paid key.

Set `completed` when all selected items settle by transfer/approved skip, `completed_with_conflicts` when unresolved conflict/unsupported/permanent items remain, `failed` for unrecoverable operation-level failure with operator review, and `cancelled` only through guarded cancellation. Map these projections to canonical worker-job terminal events without creating a second lease/retry/status source.

Cancelling the transfer operation fences its active attempt, marks the canonical job `cancelled`, and marks only unsettled items `skipped` with `operator_cancelled`. Already transferred items remain intact and are not rolled back automatically; cancellation is terminal and cannot be resumed as a hidden retry.

## Reconciliation

Extend the Feature 186 reconciler to find stale transfer leases, paused jobs, incomplete checkpoints, missing queue-cancellation evidence, and unresolved storage/domain settlement. Reconcile bounded and tenant-scoped; transport outage leaves durable state intact. Never bypass conflicts or create replacement jobs automatically.

## Tests before implementation

- Fake-adapter tests for queue cancellation/fencing/history retention and `queue_cancelled` disposition.
- Active/ambiguous provider blocking tests.
- Duplicate delivery, process loss, target conflict, parent-child ordering, destination marker, partial batch, and bounded retry tests.
- Pause/resume tests prove completed items are skipped and same operation/job/item keys remain.
- State-machine, stale lease, missing evidence, transport outage, and reconciler idempotency tests.

## UI/UX Contract

### Target User / JTBD

Tenant Admin needs truthful progress and conflict details with a visible way to continue a paused operation.

### Existing Pattern Reference

Reuse the existing async job monitor/progress patterns; add only per-item conflict and resume behavior. Detailed UI decisions are in section 07.

### Surface Inventory

`TransferOperationMonitor`, `TransferConflictPanel`, and `TransferResumeAction` under `components/tenant-transfer/`.

### Component Map

The monitor projects canonical job and operation state; the conflict panel shows redacted item states; the resume action sends a guarded idempotent command.

### State Matrix

Cover `running`, `paused_on_error`, `completed`, `completed_with_conflicts`, `cancelled`, retryable error, permanent error, conflict, and `queue_cancelled`; section 07 owns browser scenarios.

### Responsive Matrix

Use the required and extended dense-list viewports defined in section 07.

### Accessibility Acceptance

Progress uses a live region; actions are keyboard accessible with visible focus, semantic status, sufficient contrast, and reduced-motion behavior.

### Copy Contract

Always show `ดำเนินการต่อ` when resumable and distinguish copied, skipped, excluded, conflict, unsupported, and `queue_cancelled` outcomes.

### Browser Evidence Required

Section 07/08 captures fake-data pause, resume, conflict, and completion evidence.
