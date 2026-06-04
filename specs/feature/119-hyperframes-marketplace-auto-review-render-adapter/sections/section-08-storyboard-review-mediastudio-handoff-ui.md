# Section 08: Storyboard Review and MediaStudio Handoff UI

## Goal

Extend Storyboard Review and MediaStudio so HyperFrames previews/results feel like a natural continuation of Marketplace Auto Review, while existing manual render and compound render paths remain available.

Storyboard Review should be review/result-first, not customization-first.

## In Scope

- Storyboard Review HyperFrames preview/result panel.
- Snapshot comparison and QA status display.
- Manual render as retry/fallback, not first required step.
- MediaStudio render-to-library session resume.
- Duplicate Library save prevention.
- Reload-safe fallback metadata.

## Files To Create

- `apps/web/client/src/components/marketplaceCapture/HyperframesStoryboardReviewPanel.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesSnapshotComparison.tsx`
- `apps/web/client/src/components/marketplaceCapture/__tests__/HyperframesStoryboardReviewPanel.test.tsx`
- `apps/web/client/src/pages/__tests__/StoryboardReviewPage.hyperframes.test.tsx`
- `apps/web/client/src/pages/__tests__/MediaStudio.hyperframesRenderSession.test.tsx`

## Existing Files To Touch

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- existing MediaStudio render library session helpers
- existing Storyboard Review Library handoff helpers

## Test First

Add failing tests for:

- Storyboard Review shows auto storyboard/review output first when HyperFrames render status exists.
- Preview output and QA status are visible without forcing manual template customization.
- Snapshot comparison handles ready, missing, failed, and stale snapshots.
- Manual render remains available only as retry/fallback when Auto render fails or user explicitly wants manual control.
- Existing compound render path remains functional when HyperFrames is disabled.
- MediaStudio resumes a pending HyperFrames render-to-library session after reload.
- MediaStudio save-to-Library is idempotent and does not duplicate items.
- Fallback metadata remains sufficient when route state/local state is missing.
- Safe auto-repair appears before manual customization for stale hash, missing
  snapshot, retryable worker error, and minor layout warning cases.

## Storyboard Review UX

The primary review flow should show:

- storyboard frame status;
- HyperFrames preview/render status;
- snapshot comparison;
- QA blockers/warnings;
- output link when ready;
- save-to-Library action when final QA passes;
- retry/fallback action when render fails;
- safe auto-repair action when the projection marks repair as available.

Avoid making the user choose a template or engine before seeing the automatic review output.

## Safe Auto-Repair UX

When `HyperframesRenderStatusProjection.repairActions` includes a safe repair
action, Storyboard Review should present the primary repair action before
template/platform/render engine customization:

- `regenerate_from_current_plan` for stale input hash when product/run evidence
  is still valid;
- `recreate_snapshot` for missing or stale snapshot artifacts;
- `retry_worker_step` for retryable worker/dependency/storage failures;
- `rerun_layout_inspect` for minor layout warnings that can be checked without
  changing user-authored content.

The UI must label repair actions as system recovery or retry, not as required
manual configuration. If repair fails or is not safe, the page may show manual
render/custom controls as fallback.

## MediaStudio Handoff

Use or extend the existing render library session model to support:

- `source: marketplace_auto_review_hyperframes_render` or equivalent shared source value;
- product ID;
- auto review run ID;
- render job ID;
- template/platform refs;
- output artifact ref;
- input hash;
- fallback title/description/thumbnail;
- Library finalize idempotency key;
- created/updated timestamps.

The session should resume after reload and remove itself after successful Library finalization.

## Duplicate Prevention

Duplicate prevention should happen at both UI and server levels:

- UI disables duplicate save while save is pending.
- UI recognizes existing finalized Library item.
- Server finalize service returns existing item for the same idempotency key.
- Credit charge or quota debit is not repeated.

## Existing Path Preservation

Do not remove:

- Storyboard Review manual render tools;
- existing add-to-Library paths;
- existing Video Shot paths;
- existing compound render path;
- current MediaStudio Library session handling.

## Acceptance Criteria

- Storyboard Review shows Auto preview/result first when available.
- Manual controls remain discoverable for retry/fallback.
- MediaStudio can resume and finalize HyperFrames renders.
- Existing Storyboard Review and Video Shot tests still pass.
- No duplicate Library saves occur on reload or repeated clicks.

## Rollback Notes

Hide HyperFrames panels by feature flag. Existing Storyboard Review and MediaStudio flows continue through current helpers.

## UI/UX Contract

### Target User / JTBD

Users reviewing generated storyboards need to see the automatic preview/result first, then save or retry without being forced into manual render setup.

### Surface Inventory

| Surface | Impact |
|---|---|
| Storyboard Review | preview/result-first panel, QA, snapshot comparison |
| MediaStudio | resume render-to-library session |
| Library save dialog/flow | duplicate-safe finalize |
| Existing manual render tools | remain available as fallback |

### Component Map

| Component | Responsibility |
|---|---|
| HyperframesStoryboardReviewPanel | auto preview/result status and actions |
| HyperframesSnapshotComparison | snapshot QA comparison |
| MediaStudio session helpers | resume/finalize render-to-library |
| Manual render controls | retry/fallback path |

### State Matrix

| State | Expected UI behavior |
|---|---|
| preview pending | progress/status shown |
| preview ready | result visible one click away or inline |
| QA warning | warning and next action shown |
| render failed | retry/fallback manual render visible |
| safe repair available | repair primary action visible before manual controls |
| save pending | duplicate click prevented |
| saved | Library item link shown |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | preview panel and actions stack |
| tablet | snapshot comparison does not clip |
| desktop | result and storyboard context can sit side by side if existing layout supports it |

### Accessibility Acceptance

Preview, comparison, retry, save, and Library links need accessible names and predictable focus restore after dialogs.

### Copy Contract

Manual render copy should read as fallback/retry, not as a required setup step for Auto.

### Browser Evidence Required

Storyboard Review and MediaStudio e2e must cover preview pending, ready, failed, reload session resume, duplicate save, and existing manual fallback.
Storyboard Review e2e must also cover safe auto-repair priority for stale hash,
missing snapshot, retryable worker error, and minor layout warning projections.
