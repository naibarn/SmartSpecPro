# TDD Plan

## Test-First Strategy

Start with pure-contract and pure-runtime tests before editing UI wiring.

## Phase 1: Shared contract and motion math

Add/update tests first:

- `apps/web/shared/presentation/contracts.test.ts`
  - accepts valid `mediaMotion` payloads on image/video elements
  - rejects invalid presets / invalid intensity / invalid easing
  - keeps old slides valid when `mediaMotion` is omitted

- New pure helper test, likely under `apps/web/client/src/lib/` or `apps/web/client/src/presentation-canvas/`
  - computes stable transform output for `zoom-in`
  - computes stable transform output for `zoom-out`
  - computes stable transform output for one pan preset
  - clamps progress outside `0..1`

Expected initial failures:

- schema does not know `mediaMotion`
- no shared motion transform helper exists

## Phase 2: Property panel authoring

Add/update tests first:

- `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - selecting an image shows the motion controls
  - selecting a video shows the motion controls
  - changing the preset updates the selected element data
  - clearing the effect removes or resets the motion object

Expected initial failures:

- no motion controls rendered
- no patch path for the new fields

## Phase 3: Slideshow preview runtime

Add/update tests first:

- `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - slideshow preview applies the motion transform for a media element
  - pausing the slideshow freezes motion progress
  - resuming continues from the paused progress rather than restarting unexpectedly
  - video motion updates do not replace the underlying `<video>` element and playback remains active
  - video pan presets work in multiple directions while the clip is still playing

Expected initial failures:

- preview renderer has no motion layer
- pause/resume does not affect motion progress

## Phase 4: Export/runtime classification

Add/update tests first:

- `apps/web/server/routes/slideRender.test.ts`
  - generated HTML includes motion runtime for media elements with effects
  - generated HTML leaves unaffected media elements unchanged
  - generated HTML applies motion to a still-playing video element rather than a frozen poster-only path

- `apps/web/server/services/presentationPlaybackExport.test.ts`
  - image-only slides with motion mark MP4 render spec as dynamic capture
  - static slides without motion do not flip the dynamic flag

- `apps/web/server/services/presentationExportDegradation.test.ts`
  - static export emits a warning when motion is present

Expected initial failures:

- render HTML has no motion logic
- export classification ignores image motion
- degradation layer has no warning for omitted motion

## Regression Checks

- Existing crop controls still affect base media framing correctly.
- Existing slideshow preview still works for slides with no motion.
- Existing video autoplay/export tests still pass.
- Video motion does not force a pause, restart, or remount loop on the `<video>` element.
- Existing SVG image behaviors remain unchanged.
