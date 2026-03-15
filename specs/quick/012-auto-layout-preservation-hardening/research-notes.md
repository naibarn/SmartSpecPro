## Research Notes

### Relevant code paths

- `apps/web/server/services/aiPresentationService.ts`
  - `relayoutExistingSlide`
  - `extractSlideNarrative`
  - `buildRelayoutPreservedElements`
  - `mergeRelayoutElementsWithPreserved`
- `apps/web/server/services/aiPresentationLayoutEngine.ts`
  - `generateSlide`
  - AI component recipe rendering path
- `apps/web/server/services/aiPresentationComponentRecipes.ts`
  - first-class recipe component instance generation
- `apps/web/shared/presentation/contracts.ts`
  - `getPresentationSlideRenderableElements`

### Findings

1. `relayoutExistingSlide` analyzed only `slideContent.elements`
   - component/block content stored in `slideContent.components[].fallbackElements` was invisible to relayout narrative extraction, primary media reuse, and preserve logic

2. `relayoutExistingSlide` passed only `imageUrl`
   - component recipes such as `photo-collage` can use multiple sources via `imageUrls`, but relayout discarded secondary media

3. text-only AI component recipes could visually drop media
   - `generateSlide` rendered the component and returned no media fallback if the recipe itself had no media slot

4. several non-media component slot builders had weak detail fallback
   - `process-steps`, `timeline-flow`, `feature-highlights`, `infographic-grid` could degrade to heading-only text when sections existed but details were sparse

### Risk Areas

- relayout of Draft-with-AI component slides
- relayout of video-first slides
- relayout of dense slides with preserved user media
- preserving warnings/UX semantics without making tests brittle

