# Research Notes

## Current review-driven gaps

### 1. Inline SVG images bypass media motion today

- `CanvasObjects.tsx` applies motion transforms only in the `<img>` / `<video>` branches; the `svgContent` branch returns a plain wrapper without `buildMediaTransformStyle`
- `PresentationEditor.tsx` slideshow overlay follows the same pattern for readonly image rendering
- `slideRender.ts` appends the inline SVG node directly and never calls `registerMediaMotionNode` for that path

Impact:

- an element with `type: "image"` and `svgContent` can expose effect controls in authoring but remain static in `Play Slideshow`, `PlayMode`, and `mp4` export runtime

### 2. Invalid presets are treated as active motion

- `normalizeMediaMotion()` currently accepts `motion?.preset ?? "none"` without validating membership in the known preset set
- `hasActiveMediaMotion()` only checks `preset !== "none"`
- runtime frame computation falls back to a no-op for unknown presets, so export classification can become stricter than actual rendering

Impact:

- corrupted or legacy data can trigger dynamic MP4 capture and static-export warnings even when no visible motion is applied

### 3. Stronger runtime verification is still missing

- `PresentationPlayMode.test.tsx` mocks `CanvasStage` and currently proves motion progress is passed through, not that a real media node transforms
- `slideRender.test.ts` verifies generated HTML contains runtime snippets and config strings, not that record-mode DOM nodes actually animate
- there is no regression for inline SVG motion parity on any playback surface

### 4. Export warning UX can still be earlier

- `ExportDialog.tsx` now renders human-readable warning summaries in exporting/done phases
- the selecting phase still does not proactively tell the user that static formats will flatten motion before export starts

## Existing repo patterns relevant to the next plan

- Shared motion math already lives in `apps/web/shared/presentation/mediaMotion.ts`
- PlayMode now receives `mediaMotionProgress` via `CanvasStage`, so inline SVG parity can likely be solved inside the shared canvas renderer instead of duplicating logic in PlayMode
- The repo has `vitest`-based "e2e gate" files, but they are not browser automation tests; stronger verification should likely stay in DOM/runtime integration tests unless a true browser harness is intentionally introduced

## Likely affected files for implementation

- `apps/web/shared/presentation/mediaMotion.ts`
- `apps/web/shared/presentation/mediaMotion.test.ts`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.test.tsx`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/client/src/components/presentation/ExportDialog.tsx`
- `apps/web/client/src/components/presentation/ExportDialog.test.tsx`

## Recommended planning depth

- `standard`
- Reason: the work is still an incremental follow-up, but it spans shared helpers, three playback/export surfaces, and test strategy upgrades
