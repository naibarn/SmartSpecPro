# Implementation Plan

## Objective

Deliver the approved Feedback Hub attachment, unread queue, alert, and terminal
close lifecycle end to end with tenant-safe API behavior and focused proof.

## Work order

1. Add `commentId` to `feedback_ticket_attachments` and add
   `feedback_ticket_reads` with foreign keys, unique/index constraints, and a
   forward-only migration. Preserve existing rows as ticket-level attachments.
2. Extend feedback router detail/list APIs with nested resolved comment
   attachments, unread state/count/filter, `markRead`, owner/admin `close`, and
   server rejection of reply/upload on closed tickets. Keep internal note media
   out of user responses. Make attachment linking transactional and validate
   same-ticket/same-uploader/image-only reply IDs.
3. Add an idempotent recurring auto-close job using `updatedAt < now - 5 days`,
   register it in server startup/shutdown, and add unit coverage for eligible,
   active, already-closed, and repeated execution cases.
4. Update Admin Feedback Hub: unread summary/filter/badges, unread-first sort,
   mark-on-open, generic overdue modal cadence, larger ticket image previews,
   multi-image reply picker/upload/link flow, nested reply image galleries,
   lightbox navigation, and close confirmation/disabled composer.
5. Update My Feedback: nested reply image galleries with authenticated
   fullscreen preview, owner close action, and closed reply lockout.
6. Add focused server/client tests, run formatting/diff checks and affected
   typechecks, then perform targeted UI review and browser evidence if a
   runnable authenticated route is available.

## Affected files/modules

- `apps/web/drizzle/schema.ts`
- new migration under `apps/web/drizzle/`
- `apps/web/server/routers/feedback.ts`
- new or existing `apps/web/server/jobs/feedbackAutoCloseJob.ts`
- `apps/web/server/_core/index.ts`
- `apps/web/client/src/pages/AdminFeedbackHub.tsx`
- `apps/web/client/src/pages/MyFeedback.tsx`
- focused tests adjacent to router/pages/job/schema

## Security and integrity

- All new mutations use existing protected/admin procedures and tenant
  conditions; owner close is limited to own human ticket.
- Upload endpoint checks closed state before writing storage. `addComment`
  checks all attachment IDs before linking and never trusts client ownership.
- User detail filters attachments by `commentId IS NULL` or visible comment.
- Auto-close updates only non-closed rows and is safe to run more than once.

## Acceptance and verification

- Focused tests cover attachment linking, privacy, close guards, read receipt
  ordering, alert threshold/cadence, image rendering and lightbox actions.
- `git diff --check` passes.
- Affected web typecheck/test command is run; broad baseline failures are
  reported separately if unrelated dirty work causes them.
- Browser evidence follows `orchestra` UI browser matrix; skipped only with an
  explicit tooling/authentication reason.

## Rollout notes

Migration is additive and safe for existing attachment rows. Do not run a
production migration or deploy in this task. After deployment, the job should
be observed for bounded auto-close counts and upload/link errors.
