# Section 01: Inline SVG Motion Parity

## Goal

Ensure `image` elements backed by `svgContent` honor motion effects anywhere media motion is expected to render.

## Scope

- shared canvas renderer used by `PlayMode`
- editor slideshow readonly renderer
- server slide-render record runtime for MP4 export

## Implementation Notes

- treat valid inline SVG as the same motion class as raster images
- reuse the existing transform helpers/runtime registration instead of adding SVG-specific math
- keep invalid SVG fallback behavior unchanged

## Acceptance

- motion-enabled inline SVG image visibly transforms over time in `Play Slideshow`
- motion-enabled inline SVG image visibly transforms over time in `PlayMode`
- motion-enabled inline SVG image visibly transforms over time in record-mode slide render
- invalid SVG still renders the placeholder block

## Tests

- `CanvasObjects.test.tsx`
- `PresentationEditor.test.tsx`
- `slideRender.test.ts`
