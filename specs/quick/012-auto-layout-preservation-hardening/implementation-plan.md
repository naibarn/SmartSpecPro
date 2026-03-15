## Objective

Harden Auto Layout so it preserves slide fidelity across element-based and component-based slides, with special attention to Draft with AI output and user-added media.

## Current-Codebase Fit

- Reuse `getPresentationSlideRenderableElements` as the compatibility bridge from first-class components to renderable elements
- Keep `relayoutExistingSlide` as the orchestration point
- Keep `generateSlide` as the visual renderer, but improve fallback behavior for text-only component recipes

## Affected Areas

- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/services/aiPresentationLayoutEngine.ts`
- `apps/web/shared/presentation/componentRecipeSlotBindings.ts`
- relayout/layout regression tests

## Implementation Approach

1. Expand component fallback elements before relayout analysis
2. Reuse component recipe hints and multi-media sources during relayout when available
3. Add visual media support for text-only recipes so generated media is not silently dropped
4. Improve text/detail fallback for non-media recipes
5. Add regression tests for:
   - component-based relayout source expansion
   - video-first relayout
   - text-only recipe with supplemental media
   - sparse-section text fallback

## Risks And Mitigations

- Risk: duplicated media or awkward overlays
  - Mitigation: supplemental media only when the recipe has no media slot
- Risk: more warnings from component fallback expansion
  - Mitigation: forward compatibility warnings, but do not fail relayout
- Risk: change in existing recipe selection semantics
  - Mitigation: do not alter component scoring in this slice

## Acceptance Criteria

- Auto Layout can reuse text/media from component-based slides
- secondary media for collage-style relayout is not discarded
- video-only slides no longer report missing image incorrectly
- text-only recipe slides still show media support when media exists
- focused tests pass

