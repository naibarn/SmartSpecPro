## Section 01: Relayout Source Expansion

### Goal

Make `relayoutExistingSlide` analyze renderable slide content rather than raw `elements` only.

### Required changes

- use `getPresentationSlideRenderableElements` to expand component fallback elements
- use expanded content for:
  - narrative extraction
  - primary image/video selection
  - preserved-element selection
- carry component recipe hints from AI design or existing built-in components into relayout
- collect ordered media URLs so collage-like relayout paths can reuse more than one asset

### Done when

- component-backed slides can feed text/media into Auto Layout even if raw `elements` are sparse

