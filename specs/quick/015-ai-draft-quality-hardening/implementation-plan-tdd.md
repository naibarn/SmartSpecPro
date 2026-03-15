# TDD Plan

1. Add/extend service tests that fail on:
   - unsafe recipe families collapsing to one long-form recipe across multiple dense slides,
   - text-only persisted output when generated media is available for a slide that should be visual,
   - overlay-heavy fallback chosen where split/article layout should win.
2. Implement selection/fallback changes in `aiPresentationService.ts` and `aiPresentationLayoutEngine.ts`.
3. Re-run focused service tests.

## Regression checks

- Existing `aiPresentationService.test.ts` recipe-selection tests remain green.
- New deck-like quality tests cover missing image, layout diversity, and rendered-text preservation.
