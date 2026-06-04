# Section 07: Product Detail Dual-Mode UI

## Goal

Upgrade `MarketplaceCaptureProductDetail.tsx` so Auto Storyboard Review is truly auto-first while Standard Order remains fully usable.

The user should be able to start Auto with one primary CTA using backend defaults, then optionally open advanced overrides. The user must also be able to use the existing Standard Order flow with current controls.

## In Scope

- Product Detail dual launch mode UI.
- Auto plan query and status panel.
- Auto CTA, blocker states, reset-to-auto behavior.
- Standard Order visibility and preservation.
- Render progress/output panel.
- Responsive and accessibility evidence.

## Files To Create

- `apps/web/client/src/components/marketplaceCapture/MarketplaceAutoReviewLaunchModeSwitch.tsx`
- `apps/web/client/src/components/marketplaceCapture/AutoStoryboardReviewPlanSummary.tsx`
- `apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesRenderPanel.tsx`
- `apps/web/client/src/components/marketplaceCapture/__tests__/MarketplaceAutoReviewLaunchModeSwitch.test.tsx`
- `apps/web/client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.test.tsx`
- `apps/web/client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx`

## Existing Files To Touch

- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- existing Product Detail tests if present
- shared client route or tRPC hooks only as needed

## Test First

Add failing tests for:

- Auto Storyboard Review appears as the recommended first action when enabled and ready.
- The Auto start action does not require user-selected template, platform, render engine, frame strategy, or shot count.
- Standard Order remains visible/discoverable and can still start `storyboard_images`.
- Standard Order can still start `full_video`.
- Switching between Auto and Standard preserves each mode's local selections.
- Reset to Auto clears Auto overrides but does not rewrite Standard Order selections.
- Auto blocked states show one safe next action and do not hide Standard Order when Standard is still valid.
- HyperFrames disabled state preserves existing Standard Order UI.
- Running/completed render states show progress, output, and Library save state.
- Mobile view has no horizontal overflow and mode controls remain reachable by keyboard.

## User Experience Contract

Auto-first means:

- the first viewport exposes a single primary Auto CTA when ready;
- the auto plan summary explains what the backend selected;
- advanced overrides are collapsed by default;
- no required setup step asks for template, platform, render engine, output mode, frame strategy, shot count, or audio strategy before Auto start;
- blockers tell the user the next concrete action.

Dual-mode means:

- Standard Order is not removed;
- current `outputMode`, `frameStrategy`, `audioStrategy`, `shotCount`, `overlayTextMode`, `imageModel`, `qualityMode`, and reference anchors remain usable;
- Standard Order uses existing `startAutoReview`;
- Auto uses `startAutoStoryboardReview`;
- mode changes do not mutate the other mode's saved/local state.

## Component Responsibilities

`MarketplaceAutoReviewLaunchModeSwitch`:

- stable segmented control or tabs for Auto and Standard;
- keyboard accessible;
- indicates selected mode without changing layout size;
- keeps Standard Order reachable when Auto is disabled or blocked.

`AutoStoryboardReviewPlanSummary`:

- shows selected default plan;
- shows blockers/warnings;
- shows `primaryAction`;
- shows reset-to-auto when override diff exists;
- uses status copy IDs instead of page-local ad hoc strings.

`AutoStoryboardAdvancedOverrides`:

- collapsed by default;
- optional only;
- displays diff from auto plan;
- warns when an override creates a blocker;
- has reset-to-auto.

`HyperframesRenderPanel`:

- shows job status, progress, safe diagnostics, preview/output, cancel, retry, and save-to-Library state;
- does not expose raw paths, signed URLs, or internal stack traces.

## Product Detail Integration Steps

1. Add auto plan query near existing product/run queries.
2. Add launch mode state with default from feature access and product readiness.
3. Add Auto panel before Standard controls in the workflow area.
4. Wire Auto start mutation to `startAutoStoryboardReview`.
5. Keep existing `startAutoReview` callback for Standard Order.
6. Add render job polling only when a render job is active.
7. Add query invalidations from Section 06.
8. Add first-viewport layout checks for Product Detail density.

## Responsive Requirements

- 390x844: Auto CTA, plan status, and Standard switch are reachable without horizontal scroll.
- 360x800: no text clipping in controls or panels.
- 768x1024: panels stack predictably.
- 1024x768: first viewport remains dense enough to show Auto and Standard mode access.
- 1440x900: existing Media Panel and timeline remain usable.

## Accessibility Requirements

- Mode switch has accessible names.
- Focus order reaches Auto CTA, Standard controls, reset-to-auto, advanced overrides, cancel, retry, save-to-Library, and output links.
- Loading, blocked, running, failed, and completed states are announced through accessible text/status regions.
- Dialog focus is trapped/restored if preview/comparison dialogs are added.
- Reduced motion is respected where the existing app supports it.

## Acceptance Criteria

- Product Detail supports both Auto and Standard launch modes.
- Auto mode is operational with one click when ready.
- Standard Order behavior is unchanged when HyperFrames is off or on.
- All UI states come from server/shared projections.
- Component tests and focused page tests pass.
- Browser evidence covers mobile and desktop.

## Rollback Notes

Hide Auto panel by feature flag. Standard Order remains the default operational path.

## UI/UX Contract

### Target User / JTBD

Marketplace Capture users want to create a product review output quickly through Auto, while still retaining the familiar Standard Order workflow.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail first viewport | Auto CTA, plan summary, Standard mode access |
| Standard Order controls | existing output/frame/audio/quality controls retained |
| Timeline | Auto/render statuses and output links |
| Media Panel | final HyperFrames Library results |

### Component Map

| Component | Responsibility |
|---|---|
| MarketplaceAutoReviewLaunchModeSwitch | Auto vs Standard mode selection |
| AutoStoryboardReviewPlanSummary | auto defaults, blockers, warnings, next action |
| AutoStoryboardAdvancedOverrides | optional override diff and reset-to-auto |
| HyperframesRenderPanel | progress, output, cancel, retry, save |

### State Matrix

| State | Expected UI behavior |
|---|---|
| loading | stable skeleton, no layout jump |
| Auto ready | one primary Auto CTA |
| Auto blocked | blocker plus Standard availability where valid |
| Standard selected | existing controls remain usable |
| running | progress and polling status |
| completed | output and Library save state |
| disabled | Auto unavailable, Standard unchanged |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| 360x800 | no horizontal overflow, mode access reachable |
| 390x844 | Auto CTA and Standard switch in first workflow area |
| 768x1024 | panels stack cleanly |
| 1024x768 | dense first viewport remains usable |
| 1440x900 | Media Panel and timeline remain visible |

### Accessibility Acceptance

Mode switch, Auto CTA, Standard controls, advanced overrides, reset-to-auto, cancel, retry, save, and output links are keyboard reachable with accessible names.

### Copy Contract

Visible copy is concise and operational. It must not ask the user to customize Auto before starting. Use shared copy IDs where available.

### Browser Evidence Required

Playwright evidence must cover Auto ready, Auto blocked, Auto disabled, Standard with Auto enabled, running, completed, mobile, tablet, and desktop states.
