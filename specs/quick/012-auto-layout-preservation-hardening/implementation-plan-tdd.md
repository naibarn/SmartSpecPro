## TDD Plan

### Tests to add/update first

- `aiPresentationService.test.ts`
  - component fallback elements are used during relayout analysis
  - relayout reuses video as primary media when no image exists
- `aiPresentationLayoutEngine.test.ts`
  - text-only recipe receives supplemental media image
  - sparse section details still produce body-like text output

### Expected failing conditions

- relayout ignores `components[].fallbackElements`
- relayout drops secondary media URLs for component-backed slides
- video-only slides emit image-missing warning
- text-only recipes render without any media support
- component detail bindings collapse to headings only

### Regression checks

- existing Draft-with-AI service tests remain green
- existing component recipe selection tests remain green
- schema validation tests remain green

