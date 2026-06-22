# Section 05: HyperFrames Projection And Storyboard Review

## Goal

Bridge worker job state into the existing HyperFrames render projection and wire
Storyboard Review final composite submission/polling to worker-backed jobs.

## Dependencies

- section-01-contracts-and-flags
- section-02-worker-queue-scheduler
- section-03-lease-attempt-watchdog
- section-04-artifact-verification

## In Scope

- Worker job to `HyperframesRenderStatusProjection` mapping.
- `createHyperframesFinalComposite` worker-backed response.
- `getHyperframesRenderJob` reads worker jobs and legacy outbox.
- Storyboard Review refresh/reopen recovery.
- User-readable error/status copy and job monitor link.

## Files To Review

- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`
- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`

## Files To Change

- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- tests listed above

## Test First

- Test: queued worker job maps to `queued` projection.
- Test: claimed/running worker job maps to rendering/progress projection.
- Test: uploading/verifying events map to user-readable status.
- Test: verified output appears as primary video output.
- Test: stale/stalled/failed worker job has actionable safe message.
- Test: legacy outbox job remains readable.
- Test: worker projection takes precedence for new final composite.
- Test: Storyboard Review recovers job by URL render id after refresh.
- Test: Storyboard Review recovers latest job by product/run when render id is
  missing.

## Implementation Steps

1. Add a worker-backed projection helper in `hyperframesRenderService.ts`.
2. Query by source render id and by latest product/run final composite.
3. Map worker statuses and latest events to HyperFrames render statuses.
4. Include output refs only after server verification passes.
5. Keep existing outbox projection for legacy jobs.
6. Update `getHyperframesRenderJobForApi` to prefer worker job projection for
   worker-backed jobs.
7. Update Storyboard Review to preserve existing render polling behavior and add
   job monitor link.
8. Ensure runtime blockers say no fallback render occurred and explain how to
   fix worker/runtime readiness.

## UI/UX Contract

### Target User / JTBD

- Role: Storyboard Review user.
- Goal: submit final composite and understand render state after refresh.
- Entry point: `Render Final Composite` button on Storyboard Review.
- Success outcome: user sees queued/worker/rendering/uploading/verifying/done
  states and an output link when complete.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Storyboard Review | `apps/web/client/src/pages/StoryboardReviewPage.tsx` | worker-backed projection, monitor link, safer errors |

### Component Map

| Component | File | Owns | Consumes |
| --- | --- | --- | --- |
| Final composite status panel | StoryboardReviewPage | status copy, elapsed time, repair actions | HyperFrames projection |
| Render button | StoryboardReviewPage | submit action and disabled reasons | feature access + local form state |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | existing stable loading/polling state | component test |
| queued | waiting for worker, no server fallback copy | service + UI test |
| running | worker/render stage with elapsed time | service + UI test |
| verifying | server verification copy | service + UI test |
| completed | video output/open/download link | service + UI test |
| error | safe Thai/English next action | service + UI test |
| disabled/focus/hover | existing button style with clear disabled reason | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | status panel stacks without horizontal overflow | screenshot/manual |
| tablet 768x1024 | status and controls remain reachable | screenshot/manual |
| desktop 1440x900 | current dense layout remains stable | screenshot/manual |
| small-mobile 360x800 | long errors wrap | screenshot/manual |
| laptop 1024x768 | render button and status remain visible | screenshot/manual |
| wide-desktop 1280x800 | no card nesting or awkward whitespace | screenshot/manual |

### Accessibility Acceptance

- Keyboard path: render, cancel/repair, and monitor link reachable.
- Focus visibility: all action buttons show focus.
- Labels/semantics: icon-only controls have accessible names.
- Contrast: warning/error/success panels remain readable.
- Reduced motion: polling/progress animation respects reduced motion.

### Copy Contract

- Tone: direct, actionable Thai with English fallback.
- Required labels: queued, assigned, rendering, uploading, verifying, completed,
  stalled, failed, open job monitor.
- Validation/error copy: explain whether a job was queued and whether fallback
  was avoided.
- Empty/loading/success copy: preserve existing Storyboard Review copy style.
- Localization notes: use existing i18n pattern if available; otherwise match
  existing inline Thai/English style in this page.

### Browser Evidence Required

- Record mobile/tablet/desktop screenshots or manual notes for status panel and
  long error copy.

## Acceptance Criteria

- Preview/polling UI sees the same worker-backed job after refresh.
- Completed worker render output appears in Storyboard Review.
- Runtime-not-ready errors are actionable and do not hide real failure.
