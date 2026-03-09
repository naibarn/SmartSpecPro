# Research Notes

## Current Codebase Findings

### Shared contract and persistence

- `apps/web/shared/presentation/contracts.ts` defines `image` and `video` element schemas directly inside `presentationSlideContentSchema`.
- Media elements already support static crop controls:
  - `imageFit`, `imagePositionX`, `imagePositionY`, `imageZoom`
  - `videoFit`, `videoPositionX`, `videoPositionY`, `videoZoom`
- Slide JSON is already the persistence boundary, so adding optional fields here does not require a DB migration.

### Editor authoring surface

- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx` already has dedicated image/video sections with crop controls and media regeneration settings.
- The property panel is the correct place to add motion authoring because it already owns media-specific controls and patches via `onPatchSelected`.
- `PresentationElementPatch` is derived from the shared contract in `apps/web/client/src/lib/presentationEditorState.ts`, so new optional contract fields automatically flow into patch typing.

### Edit canvas rendering

- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx` renders image/video elements using static transforms derived from `imageZoom` / `videoZoom`.
- This canvas is optimized for editing interactions, not slideshow-accurate playback.
- Always-on animation in the edit canvas would likely fight selection, resizing, and drag interactions.

### Slideshow preview rendering

- `apps/web/client/src/pages/PresentationEditor.tsx` renders the slideshow overlay through `renderReadonlySlideElement(...)`.
- Preview transitions exist at the slide level, but element-level media motion does not.
- Preview has pause/resume and slide-advance state already, so a motion runtime should be tied to slideshow progress rather than free-running CSS animation if pause/resume correctness matters.

### Export/render path

- `apps/web/server/routes/slideRender.ts` generates HTML/JS used for screenshot and record capture.
- The route already mirrors image/video crop behavior in plain DOM/JS.
- `apps/web/server/services/presentationPlaybackExport.ts` marks MP4 jobs as dynamic only when slides contain renderable `<video>` elements via `hasRenderableVideoElements(...)`.
- If image/video motion is added, image-only slides can become dynamic too; the current detection is insufficient.
- For the new video requirement, motion must be applied to the live `<video>` node or its transform wrapper so playback time continues uninterrupted while zoom/pan changes over time.

### Degradation/warning path

- `apps/web/server/services/presentationExportDegradation.ts` already normalizes slide duration/transition and emits export warnings.
- This is the right place to add a warning for static formats that cannot preserve time-based media motion.

## Design Implications

1. A preset-based motion model fits the existing JSON contract and property panel better than freeform keyframes.
2. Motion should be additive to base crop/focus so current authoring behavior remains stable.
3. A shared progress-driven motion helper is safer than CSS-only animation because slideshow pause/resume already exists.
4. Video motion must be implemented as a moving viewport/transform over a live-playing video element, not as a frame-freeze effect.
5. MP4 export can likely reuse the current "record dynamic slide" path if dynamic-slide detection is broadened, avoiding Python architecture changes in v1.
6. Static export formats need explicit degrade behavior instead of silently dropping motion.

## Recommended v1 Preset Scope

- `none`
- `zoom-in`
- `zoom-out`
- `pan-left`
- `pan-right`
- `pan-up`
- `pan-down`

This keeps v1 implementable with deterministic transform math, covers the user's primary ask, and leaves room for future combinations without committing to keyframes now.

## Main Risks Observed

- Preview/export divergence if motion math is implemented twice with different formulas.
- Pause/resume bugs if motion runs on CSS animation time instead of slideshow progress.
- Video playback regressions if transforms accidentally remount or replace the `<video>` element during playback.
- Static export ambiguity if omitted motion is not surfaced in warnings.
- Naming mismatch around `hasDynamicVideo` because the current flag really means "dynamic slide capture needed".
