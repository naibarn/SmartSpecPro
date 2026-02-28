# Section 02: Layout Engine

## Objective
Take the structured content from Section 01 and turn it into coordinate-based Canvas elements using predefined mathematical templates.

## Files to modify
- `apps/web/server/services/presentationLayoutEngine.ts` (new)
- `apps/web/server/services/__tests__/presentationLayoutEngine.test.ts` (new)

## TDD Acceptance
- Write unit tests that pass dummy content (text, image url, graphic svgs) to `generateSplitSlide()` and `generateFeatureGridSlide()`.
- Assert that the returned objects map to `$schema: "PresentationSlideContent"` and that no elements have negative `x` or `y`, and none exceed `1920` or `1080` dimensions.
- Images must have `src`, fallback strings must not be empty.

## Implementation Notes
- `generateSplitSlide`: A title and text block on the left (e.g. `x: 100`, `width: 800`), and an image on the right (`x: 1000`, `width: 800`).
- `generateFeatureGridSlide`: Image left, and 2 rectangular boxes on the right with icon+text overlapping inside the boxes.
