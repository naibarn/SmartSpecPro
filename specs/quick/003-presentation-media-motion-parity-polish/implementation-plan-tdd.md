# Implementation Plan TDD

## Test-First Order

1. shared helper normalization tests
2. shared canvas / slideshow inline SVG motion tests
3. PlayMode real-render motion regression
4. slide-render runtime motion regression
5. export selecting-phase warning regression

## Expected First Failing Tests

### Shared normalization

- add a test showing `normalizeMediaMotion({ preset: "garbage" as any })` resolves to inactive/default-safe output
- add a test showing `hasActiveMediaMotion({ preset: "garbage" as any })` is `false`

### Inline SVG motion parity

- add `CanvasObjects` coverage proving valid inline SVG image nodes receive motion transform updates
- add slideshow readonly coverage proving inline SVG image nodes move over time in the editor overlay

### PlayMode runtime

- add a PlayMode test that exercises real media rendering instead of a mocked `CanvasStage` pass-through for at least one motion-enabled case
- expected initial failure: progress changes but the rendered inline SVG/media node does not transform

### Slide-render runtime

- add a runtime-oriented test that boots the generated record-mode script in a DOM-like environment and asserts motion is applied to a registered node
- expected initial failure: HTML contains the runtime snippets, but no assertion yet proves actual motion on the inline SVG path

### Export warning UX

- add a test that selecting `png`/`jpg`/`pdf` with motion-bearing slides shows preflight advisory copy
- add a negative test that selecting `mp4` does not show the static-flattening advisory

## Regression Matrix

- valid raster image motion remains unchanged
- valid video motion remains unchanged
- valid inline SVG image motion matches the same preset semantics as raster image motion
- invalid inline SVG still falls back safely
- unknown preset => inactive motion
- invalid easing => default easing
- static export preflight warning appears only for static formats with active motion
- exporting/done warnings remain human-readable

## Suggested Commands

```bash
pnpm --dir apps/web test -- \
  shared/presentation/mediaMotion.test.ts \
  client/src/presentation-canvas/CanvasObjects.test.tsx \
  client/src/pages/PresentationEditor.test.tsx \
  client/src/pages/PresentationPlayMode.test.tsx \
  client/src/components/presentation/ExportDialog.test.tsx \
  server/routes/slideRender.test.ts \
  server/services/presentationPlaybackExport.test.ts \
  server/services/presentationExportDegradation.test.ts
```

## Review Gates

- no branch should treat `svgContent` images as static-only if `mediaMotion` is active
- no helper should classify unknown presets as active motion
- PlayMode and slide-render tests must validate runtime behavior, not just wiring strings/props
- preflight export UX copy must stay consistent with the backend warning language
