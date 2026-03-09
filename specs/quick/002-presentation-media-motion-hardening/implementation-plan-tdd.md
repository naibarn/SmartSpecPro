# Implementation Plan TDD

## Test-First Order

1. Shared motion contract/parity tests
2. Playback surface tests for `Play Slideshow` and `PlayMode`
3. ExportDialog warning surfacing tests
4. Server route parity/runtime tests for `mp4` export

## Expected First Failing Tests

### Shared motion

- contract test for new diagonal presets should fail until schema/options are extended
- helper test for diagonal translation and pan overscan should fail until motion math is updated
- parity test comparing shared helper assumptions to route runtime contract should fail until duplication is reduced or explicitly synchronized

### Slideshow pause/resume

- new editor test should fail because no assertion currently exists for:
  - paused transform remains constant while timers advance
  - resumed transform continues from paused frame

### PlayMode playback

- new `PresentationPlayMode` / shared canvas renderer tests should fail because the current hardening plan did not explicitly cover media-motion rendering on that route
- add failing assertions for:
  - image/video motion appears in PlayMode
  - video remains autoplay/live while motion applies
  - pause/play in PlayMode does not remount the video element if that control path is used

### Export warning UX

- new `ExportDialog` test should fail because dialog does not yet render a human-readable media-motion warning summary

### Route/export integration

- route test should fail until new presets/overscan semantics appear in generated HTML runtime
- degradation/export tests should fail until warning formatting/pipeline is wired end-to-end where needed

## Regression Matrix

- `none` motion remains no-op
- existing `zoom-in`, `zoom-out`, `pan-left/right/up/down` remain valid
- new diagonal presets parse and render
- pause freezes transform for image and video paths in `Play Slideshow`
- PlayMode renders motion for image/video paths
- resume continues without video remount
- static export warning appears for `png`, `jpg`, `pdf`
- MP4 export remains on dynamic capture path when motion exists and preserves the same motion semantics

## Suggested Commands

```bash
pnpm --dir apps/web test -- \
  shared/presentation/contracts.test.ts \
  shared/presentation/mediaMotion.test.ts \
  client/src/presentation-canvas/CanvasObjects.test.tsx \
  client/src/pages/PresentationEditor.test.tsx \
  client/src/pages/PresentationPlayMode.test.tsx \
  client/src/components/presentation/ExportDialog.test.tsx \
  server/routes/slideRender.test.ts \
  server/services/presentationExportDegradation.test.ts \
  server/services/presentationPlaybackExport.test.ts
```

## Review Gates

- No new raw hardcoded motion constants in server/runtime files unless sourced from shared metadata
- No UI copy that only surfaces warning codes without explanation
- Fake-timer slideshow tests must be deterministic and non-flaky
