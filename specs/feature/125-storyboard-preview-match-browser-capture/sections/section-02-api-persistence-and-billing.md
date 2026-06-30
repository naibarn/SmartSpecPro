# Section 02: API, Persistence, And Billing

## Goal

Create the durable server contract that queues preview-match capture jobs, projects status, supports cancellation, prevents duplicate submissions, and reconciles billing.

## Scope

- Add create/get/cancel procedures for preview-match capture.
- Add persistence for capture jobs and attempts.
- Add idempotency key and duplicate-click reuse.
- Add cancellation and stale-attempt protection.
- Add credit reservation/reconciliation.
- Add permission, tenant, product, run, and storyboard identity checks.

## UI/UX Contract

### Target User / JTBD

Storyboard Review user waiting for a final MP4 capture job. Backend projection must give the UI enough information to explain progress, cancellation, retry, quota, and billing blockers.

### Surface Inventory

- Storyboard Review final composite status panel.
- Capture retry/cancel controls.
- Toast or inline failure/status messages.

### Component Map

- API projection feeds the capture status component.
- API permissions control whether retry/cancel actions are enabled.
- Billing/quota decisions feed disabled or blocked UI states.

### State Matrix

- queued: show waiting copy and cancel when allowed.
- active: show stage and progress.
- blocked: show quota/permission/feature blocker.
- cancelled: show idempotent cancelled status.
- failed: show retry when allowed and safe reason.
- completed: hand off to Library/output state from Section 04.

### Responsive Matrix

N/A for direct layout in this section. The API must return concise copy and structured states that Section 01 can render responsively.

### Accessibility Acceptance

N/A for direct DOM changes in this section. Projection fields must be stable enough for Section 01 to announce state changes through accessible UI.

### Copy Contract

- Do not expose raw worker errors.
- Use user-safe Thai/English copy.
- Distinguish quota blocked, stale preview, cancelled, retryable failure, and permanent failure.

### Browser Evidence Required

- Browser evidence is produced through Section 01 UI states using the projection fields from this section.

## Files To Review

- `apps/web/server/routers/marketplaceCapture.ts` or nearest Storyboard Review router
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerBillingService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- database schema and migration conventions

## Files To Change

- API router/service for Storyboard Review final composite capture
- new or existing service module for capture job persistence
- schema/migration files for capture jobs/attempts if a new table is chosen
- billing/feature-access service tests
- projection tests

## API Contract

Add sibling procedures:

- `createPreviewMatchFinalCompositeCapture`
- `getPreviewMatchCaptureJob`
- `cancelPreviewMatchCaptureJob`

Create input:

- product id
- run id
- storyboard review id
- quality
- expected preview composition hash
- expected timeline hash
- final composite config hash
- output dimensions/fps

Create output:

- capture job projection
- status
- progress percent
- stage
- safe message
- retry/cancel permissions
- output refs when available

## Persistence Decision

During implementation, inspect current migration and worker-job patterns before choosing:

- use narrow `storyboard_capture_jobs` and `storyboard_capture_attempts` for server-managed capture if it is not claimed by desktop workers
- use `worker_jobs` only if the existing worker control plane can represent server capture without misleading desktop worker semantics

Required persisted fields:

- tenant id, requested user id, product id, run id, storyboard review id
- engine id, quality, status, progress, stage, failure code
- idempotency key
- preview composition hash, timeline hash, final config hash
- active attempt id, stale/cancelled markers
- billing reservation id and reconciliation status
- output/evidence refs and sanitized diagnostics

## Billing Rules

- Reserve credits before queueing.
- Reuse the reservation for duplicate idempotency hits.
- `standard` starts at 0.75x existing final composite estimate.
- `high` starts at 1.0x existing final composite estimate.
- Capture credits only after verification and publish.
- Release/refund on queued cancellation and verification/runtime failures according to existing render policy.

## Test First

- Test create rejects wrong tenant/user access.
- Test create rejects invalid quality, stale hashes, missing source videos, or unsupported dimensions.
- Test duplicate create returns existing active job.
- Test duplicate create does not reserve credits twice.
- Test get returns persisted projection after refresh.
- Test cancel is idempotent.
- Test cancellation marks active attempt stale.
- Test stale attempt completion is rejected.
- Test billing multiplier and reservation lifecycle for standard/high.

## Acceptance Criteria

- Capture jobs persist across page refresh.
- API returns user-safe status projection immediately after queueing.
- Duplicate clicks do not create multiple active jobs.
- Cancelled jobs cannot be completed by late worker output.
- Billing cannot be double-reserved for the same duplicate-submit capture.
