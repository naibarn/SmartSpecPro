# Section 09: User Job Monitor UI

## Goal

Build a user-facing job monitor so users can submit many render jobs, close or
refresh pages, and later see worker assignment, progress, output links, cancel,
and reassign actions.

## Dependencies

- section-01-contracts-and-flags
- section-02-worker-queue-scheduler
- section-03-lease-attempt-watchdog
- section-04-artifact-verification
- section-05-hyperframes-projection-storyboard
- section-08-tauri-hyperframes-executor

## In Scope

- User job list API/procedure.
- User job detail API/procedure.
- Cancel queued job.
- Request another worker action.
- Job list/detail UI.
- Links from Storyboard Review.

## Files To Review

- existing app routing setup
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- existing admin/media/job UI components
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerSchedulerService.ts`

## Files To Change

- new web router/procedures such as `workerJobs`
- new client route/component for job monitor
- Storyboard Review link integration
- client/server tests

## Test First

- Test: list returns only requester-visible jobs.
- Test: list filters by queued/running/completed/failed/canceled.
- Test: detail returns events and output refs in order.
- Test: queued job can be canceled by requester.
- Test: running job cannot be canceled through queued cancel action.
- Test: request reassign appears only after threshold.
- Test: completed job shows verified output link.
- Test: empty/loading/error states render.

## Implementation Steps

1. Add user job monitor procedures.
2. Add projection DTO that is safe for normal users.
3. Add job list route and detail panel/page.
4. Add cancel and request-reassign actions with disabled reasons.
5. Add output link rendering only after verification passes.
6. Add source links back to Storyboard Review when source metadata exists.
7. Add Storyboard Review link to this monitor.

## UI/UX Contract

### Target User / JTBD

- Role: render job submitter.
- Goal: monitor all submitted render jobs without reopening every source page.
- Entry point: navigation/job monitor link or Storyboard Review status panel.
- Success outcome: user sees queue/running/completed state and output link.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Job monitor route | new client route | list and detail |
| Storyboard Review | existing route | link to monitor |

### Component Map

| Component | File | Owns | Consumes |
| --- | --- | --- | --- |
| Job filters | new route | status/date/type filters | query state |
| Job list | new route | rows/cards | list API |
| Job detail | new route/drawer | events/actions/artifacts | detail API |
| Job actions | new components | cancel/reassign/download | action APIs |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | stable skeleton | UI test |
| empty | no jobs message | UI test |
| queued | cancel action visible | UI test |
| running | progress and worker state | UI test |
| completed | verified output link | UI test |
| failed/stalled | safe error and next action | UI test |
| disabled/focus/hover | clear disabled reason, focus ring | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | card list + detail below | screenshot/manual |
| tablet 768x1024 | list + expandable detail | screenshot/manual |
| desktop 1440x900 | table + side detail panel | screenshot/manual |
| small-mobile 360x800 | long job titles/errors wrap | screenshot/manual |
| laptop 1024x768 | table remains usable | screenshot/manual |
| wide-desktop 1280x800 | dense layout uses width | screenshot/manual |

### Accessibility Acceptance

- Keyboard path: filter, select job, cancel, reassign, download.
- Focus visibility: all row/action controls visible.
- Labels/semantics: table/list and icon buttons labeled.
- Contrast: status badges readable.
- Reduced motion: progress animation restrained.

### Copy Contract

- Tone: practical Thai, with existing English fallback pattern.
- Required labels: Waiting for worker, Assigned, Rendering, Uploading, Verifying,
  Completed, Failed, Canceled, Request another worker, Cancel queued job.
- Validation/error copy: explain if action is unavailable due to status/time.
- Empty/loading/success copy: concise, no marketing hero.

### Browser Evidence Required

- Capture or manually record mobile/tablet/desktop for loading, empty, running,
  completed, and error states.

## Acceptance Criteria

- Users can monitor jobs independently from Storyboard Review.
- Queued jobs can be canceled.
- Completed verified jobs expose download/open links.
