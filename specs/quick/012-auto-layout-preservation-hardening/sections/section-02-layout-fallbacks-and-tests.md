## Section 02: Layout Fallbacks And Tests

### Goal

Prevent silent media/text loss during Auto Layout rendering.

### Required changes

- add supplemental background media for text-only component recipes when media exists
- improve detail fallback resolution for non-media recipe slot bindings
- fix relayout warning semantics for video-only primary media
- add focused tests for service + layout engine

### Done when

- Auto Layout does not silently drop media/text on the covered cases and focused regression tests pass
