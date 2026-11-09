# Section 02: Auto Review Queue Cutover

## Goal

Move new Auto Review LLM/long operations to canonical jobs, preserve pollable run state, and ensure the old feature-local worker cannot also execute them.

## Ownership

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts`
- `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- `apps/web/server/routers/marketplaceCapture.ts` only where an operation contract changes.
- Focused Auto Review service/router/job tests.

## TDD

- QC request persists queued state and canonical job before LLM execution; duplicate request reuses job.
- Redraft and per-shot prompt authoring queue without invoking LLM in the request path.
- Worker completion projects final result; stale revisions, failed admission, retries and legacy queued rows are handled safely.
- No duplicate executor runs and all existing approval/credit gates remain intact.

## Acceptance

- New Auto Review long work uses `worker_jobs` and dispatch outbox; no direct in-process timer executes LLM work.
- Existing pending local queue entries have a stable idempotent migration/recovery path.
- UI polling exposes durable queued/running/terminal state and an actionable recovery state.

## UI/UX Contract

- **Target/job:** A seller reviewing the story and its 9-shot draft; confirm QC has entered the background queue and see whether it is waiting, running or failed.
- **Surface inventory:** Keep the existing Staged Auto Review Workbench and Creative QC panel; do not add a second job page or change the confirmed-story flow.
- **Component map:** The existing QC panel reads the persisted `creativeQc` run projection; the server projects canonical worker state into that projection.
- **State matrix:** `queued` shows “กำลังรอคิวตรวจ”; `running` shows “กำลังตรวจ”; `succeeded + pass` enables story confirmation; `failed` shows a safe reason and retry; missing/invalid job binding fails visibly and must not silently look like a running QC.
- **Responsive/accessibility:** Preserve current responsive layout, `role=status` for progress and `role=alert` for failures; disabled approval keeps a visible textual reason.
- **Copy/localization:** Keep Thai copy and existing English fallback; avoid raw job IDs, provider diagnostics and internal queue errors in the customer UI.
- **Browser evidence:** Verify the existing 1280px desktop and narrow mobile layout if user-visible status behavior changes; no visual redesign is planned.

## Risks

- Preserve historical outbox rows and use idempotency during migration.
- Ensure worker execution is not blocked by normal HTTP request timeouts and holds a renewable worker lease.
- Do not allow queue retry to double-reserve credits or repeat provider submissions.
