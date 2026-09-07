# Section 02: Model-aware video prompt budgets

## Ownership

- `apps/web/shared/verticalDramaSeries/videoPromptBudget.ts`
- `apps/web/shared/verticalDramaSeries/__tests__/videoPromptBudget.test.ts`
- `apps/web/server/services/verticalDramaEnhancedVideoPrompt.ts`
- `apps/web/server/services/__tests__/verticalDramaEnhancedVideoPrompt.test.ts`
- bounded existing resolver call sites in the Vertical Drama router, pipeline, motion service, and storyboard panel

## Requirements

- Write failing parameterized budget tests first.
- Match known ceilings from model identity, not provider alone.
- Pass model identity through every resolver call.
- Add resolved budget to Enhanced skill input and fingerprint.
- Reject Enhanced bridge output above the resolved target budget.
- Avoid schema migration and unrelated catalog rewrites.

## Acceptance checks

- Focused budget and Enhanced service tests pass.
- `rg` confirms all production resolver call sites provide model identity when available.
- No new diagnostics are attributable to touched files in the focused check.
- `git diff --check` passes on all touched paths.

## Implementation notes

- Model identity now resolves Grok 4,096; MiniMax H3 7,000; Omni Flash 1.1 and Wan 3.0 20,000; Seedance 2.5 30,000 characters. Provider name alone no longer selects a model ceiling.
- Explicit video-only config may tighten a known ceiling; unknown models retain the existing default and all results remain capped at 30,000.
- Enhanced input, job fingerprint, Python bridge and TypeScript result validation share the same resolved budget. Older queued inputs are normalized from their immutable target-model facts.
- All production resolver calls now provide model identity when it is available. No schema migration was added.
- Verification: focused budget/Enhanced tests pass 33/33; motion-prompt integration tests pass 118/118.
