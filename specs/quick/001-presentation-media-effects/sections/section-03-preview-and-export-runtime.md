# Section 03: Preview And Export Runtime

## Goal

Apply media motion in slideshow preview and export capture, with pause/resume-correct timing and safe degradation for static export formats. Video effects must run over a continuously playing clip.

## Scope

- Slideshow preview runtime
- Server-generated slide render HTML
- Dynamic-slide detection for MP4 export
- Static-export warning behavior

## Files

- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/server/services/presentationExportDegradation.test.ts`

## Implementation Tasks

1. Add slideshow-progress tracking that can drive media motion independently of slide transition effects.
2. Apply motion transforms to the inner media node in `renderReadonlySlideElement(...)` so base positioning/crop remains intact.
3. Ensure slideshow pause/resume freezes and resumes motion progress correctly.
4. For video, preserve a stable `<video>` element and animate its wrapper/transform layer so playback continues while zoom/pan progresses.
5. Extend `slideRender.ts` HTML/JS so record-mode capture reproduces the same motion semantics for image/video elements.
6. Broaden MP4 dynamic capture detection:
   - keep the existing `hasDynamicVideo` compatibility flag
   - set it when a slide contains a renderable video or any media element with active motion
7. Add degradation behavior for static exports:
   - motion omitted from `png` / `jpg` / `pdf`
   - warning emitted through the existing warning contract

## TDD Notes

- Add preview tests that verify motion transforms change with progress.
- Add pause/resume regression tests in slideshow preview.
- Add tests that video playback remains active while motion changes over time.
- Add route tests that assert motion logic is embedded only when needed.
- Add export-service tests for motion-only dynamic slides.
- Add degradation tests for static export warning emission.

## Acceptance Notes

- Slides without motion remain byte-for-byte behaviorally equivalent.
- MP4 export captures motion on image-only slides, not just slides containing `<video>`.
- Video zoom/pan effects do not convert playback into a frozen poster-style animation.
- Static formats stay successful instead of failing, but the omission is visible via warnings.
