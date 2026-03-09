# Implementation Plan

## Objective

Add media motion properties to `Presentation Editor` so authors can apply gradual effects such as zoom-in, zoom-out, and directional pan to `image` and `video` elements, with matching behavior in slideshow preview and MP4 export, while degrading safely for static export formats. For video specifically, motion must run while the clip continues normal playback.

## Current-Codebase Fit

- The editor already stores media configuration inside slide JSON, so this feature fits naturally as additive optional fields in `presentationSlideContentSchema`.
- The existing property panel already contains image/video-specific controls and patch plumbing.
- The slideshow overlay and `slideRender.ts` already have separate rendering layers for media elements, which makes them the right insertion points for motion application.
- The export service already distinguishes static vs dynamic MP4 capture; it only needs broader detection logic.

## Proposed Architecture

### Shared contract

Add a reusable media motion schema and attach it to `presentationImageElementSchema` and `presentationVideoElementSchema`.

Suggested contract:

- `mediaMotion.preset`
- `mediaMotion.intensity`
- `mediaMotion.easing`

Keep the field optional so existing slides remain valid with no data migration.

### Authoring UI

Add a new `Motion` subsection inside the image and video property blocks in `PropertyPanel.tsx`.

Recommended controls:

- Effect preset select
- Intensity slider
- Easing select
- Reset/clear action

Authoring rule:

- `none` or missing object means no motion
- controls are shown only for `image`/`video`
- multi-select patch broadcasting is allowed only across same-type selections

### Runtime behavior

Implement a deterministic motion helper that converts:

- base media crop config
- motion preset config
- slide progress `0..1`

into an extra transform for the media inner node.

This helper should be used by:

- slideshow preview in `PresentationEditor.tsx`
- slide render HTML in `apps/web/server/routes/slideRender.ts`

Behavioral rules:

- motion spans the full slide duration
- motion pauses when slideshow preview pauses
- motion restarts when slide playback restarts
- base crop remains the reference frame
- video motion applies to a live-playing `<video>` element or stable wrapper without replacing the media node
- pan presets support multiple directions while keeping the clip playing continuously

### Export behavior

For MP4:

- broaden dynamic-slide detection so any non-`none` media motion marks the deck as requiring dynamic capture
- continue using the current record-mode path
- ensure the record-mode HTML keeps the video element playing while the effect transform updates over time

For `png` / `jpg` / `pdf`:

- render the base frame only
- emit a warning through export degradation logic so omission is explicit

## Affected Files / Modules

- `apps/web/shared/presentation/contracts.ts`
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx` or a new shared motion helper module
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationExportDegradation.ts`
- Related tests in:
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx`
  - `apps/web/server/routes/slideRender.test.ts`
  - `apps/web/shared/presentation/contracts.test.ts`
  - `apps/web/server/services/presentationPlaybackExport.test.ts`
  - `apps/web/server/services/presentationExportDegradation.test.ts`

## Risks And Mitigations

### Risk: preview/export drift

Mitigation:

- centralize motion semantics in a tiny pure helper with fixture-style tests
- where the server route cannot import browser code directly, keep test fixtures asserting equivalent output

### Risk: pause/resume becomes inconsistent

Mitigation:

- derive motion from slideshow progress rather than CSS animation timeline
- add pause/resume regression tests in the slideshow preview layer

### Risk: video effect breaks playback continuity

Mitigation:

- animate a stable wrapper or transform style around the existing `<video>` node
- avoid remounting the `<video>` element as progress changes
- add tests that video motion and playback can coexist

### Risk: static exports silently lose motion

Mitigation:

- add explicit degradation warning coverage
- document that only MP4 and live slideshow preserve motion in v1

### Risk: `hasDynamicVideo` naming no longer matches behavior

Mitigation:

- preserve the flag for compatibility in v1
- add local comments clarifying that it now means "record-mode dynamic capture required"

## Acceptance Criteria

- Image and video elements expose motion properties in the Presentation Editor properties panel.
- Authors can choose at least `zoom-in` and `zoom-out`, plus a small set of simple pan presets.
- Slideshow preview applies media motion deterministically over the slide duration.
- Slideshow pause/resume freezes and resumes media motion correctly.
- Video elements can zoom/pan in multiple directions while the video keeps playing.
- MP4 export marks media-motion slides as dynamic and captures the motion path.
- Static exports omit motion predictably and emit a warning rather than failing silently.
- Existing slides without motion continue to render and export exactly as before.

## Rollout / Verification Notes

- This can ship behind the existing presentation editing rollout practices without a DB migration.
- Verify on both image-only and video-containing slides.
- Verify that video motion does not pause, restart, or replace the underlying clip during preview/export capture.
- Verify mixed decks where some slides are static and some require dynamic capture.
- Verify that old drafts with no `mediaMotion` continue to parse and save unchanged.
