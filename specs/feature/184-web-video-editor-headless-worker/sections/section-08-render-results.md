# Section 08 — Render submission, result application, replay, and notifications

## Scope and dependencies

Wire Section 06 export UI to Section 04 procedures and Section 05 verified artifacts, using Section 02 revision pins and Section 07 queue links.

## Tests first

- Test save-before-submit, preflight expiry/estimate/approval, credit reservation and duplicate idempotency.
- Test status reconnect, cancel/retry/replay, old-revision review/apply conflict, Library publication and indexing recovery.
- Test terminal notification dedupe/localization and trace-safe error copy.

## Implementation

Update `ExportDialog.tsx`, `VideoEditorPhase3.tsx`, `videoEditorService.ts` and job hooks to save/resolve conflicts, preflight, show approval/estimate, submit with idempotency key, and subscribe/poll server snapshots. Pin revision N and plan hash. Show N output while current project is N+1; applying analysis/subtitles/reframe requires expected version and explicit review. Call existing artifact/library services transactionally; use `(jobId, role, checksum)` publication idempotency. Use `jobCompletionNotificationService.ts`/`notificationService.ts` with `(jobId, terminalState, revision)` dedupe. Retry/replay must not create new reservations on duplicate polls.

## Acceptance and evidence

Record focused client/router/service tests and Library/notification results for AC-05, AC-06, AC-10, AC-12, AC-14, AC-15 and AC-17.

## Safety and rollback

Never overwrite a newer local revision with a background result. If publication/indexing fails, expose recovery and preserve verified artifact; do not render again automatically.

## Implementation status

Implemented the full Phase 3 Web editor Worker handoff with save-before-submit, revision/idempotency envelope, managed asset resolution, credit estimate, queue navigation and Worker artifact upload/QC completion. Pure stale-result decision and notification-dedupe helpers remain covered by focused tests. Automatic Library projection, stale-result apply/review, cancel/retry/replay UI and authenticated end-to-end evidence remain pending integration work.

## UI/UX Contract
### Target User / JTBD
Creator needs to review and apply a completed render or analysis safely.
### Surface Inventory
Export dialog, approval/credit, job status, stale-result review, Library link, notifications.
### Component Map
Export client pins revision; server applies CAS/publication; notification service dedupes events.
### State Matrix
Approval, submitting, queued, running, completed, review-required, applied, stale-conflict, publishing-recovery.
### Responsive Matrix
Export/review on desktop/tablet; mobile shows status, result preview, and recovery actions.
### Accessibility Acceptance
Dialog focus trap, approval labels, status announcements, and keyboard apply/review.
### Copy Contract
Thai explains revision N versus current N+1 and credit state; English fallback.
### Browser Evidence Required
jsdom stale-apply/notification tests and authenticated Playwright export/reopen evidence.
