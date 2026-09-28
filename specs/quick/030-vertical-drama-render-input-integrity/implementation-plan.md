# Implementation plan

## Objective

Create a fail-closed render-input contract for Vertical Drama start-frame images and native-audio video prompts. A paid request may proceed only when its mandatory character attachments and dialogue are complete, correctly ordered, and protected through the final provider payload.

## Current-codebase fit

Keep the existing client flow and tRPC procedures. Add small shared pure helpers for deterministic contracts and call them from both image mutations. Complete and harden the existing dirty dialogue/model-family work instead of creating parallel implementations.

## Affected modules

- `apps/web/shared/verticalDramaSeries/characterIdentityMap.ts` and tests: deterministic identity-lock block construction/removal/validation.
- `apps/web/server/routers/verticalDramaEpisodes.ts`: canonical required-character manifest, preflight, shared attachment preparation, image and angle mutations, video persistence/provider gates.
- `apps/web/server/services/verticalDramaPromptQc.ts` and tests: protected ordered contract support without losing repeated dialogue.
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts` and tests: canonical source dialogue and deterministic block.
- `apps/web/server/services/modelRegistry.ts` and capability tests: verify provider-independent Grok invariant already present in the dirty tree.
- Targeted router test files for image payload ordering, missing portraits, capacity, no-credit/no-provider behavior, and angle parity.

No client component change is expected because existing mutation `onError` handlers display server messages. Change the client only if a targeted test proves one path does not surface the message or clear its loading state.

## Implementation approach

1. Add failing tests for shuffled character rows, missing one of three portraits, and model capacity smaller than mandatory portrait count.
2. Refactor reference resolution into an ordered canonical result containing required keys, resolved primary entries, optional sheets, and explicit missing/unknown failures.
3. Add a shared preflight/merge helper that reserves mandatory slots first and trims only optional references. Invoke it before credit reservation in both single-image and angle-grid mutations.
4. Restore a deterministic, idempotent system-authored identity-lock block based on the final primary portrait manifest. Protect and validate it through image prompt QC; persist/send the same final prompt.
5. Add failing dialogue tests for a three-line source with a two-line LLM echo, over-cap refinement, repeated identical lines, split-speaker path, persistence, and provider submission.
6. Consolidate the dirty dialogue changes around one ordered `Native dialogue (verbatim)` block. Ensure protected content is applied after all transformations and before both persistence and provider calls.
7. Verify the dirty Grok family classifier across Higgsfield, Kie, Magnific, and alias/config variants. Avoid provider-specific branches.
8. Run scoped tests, typecheck relevant package, diff checks, and a focused final review.

## Risks and mitigations

- Existing tests mock the character service with only `getPrimaryPortraitUrl`: preserve flag-off call shape and add defaults carefully.
- Optional sheet ordering can alter current snapshots: keep portraits first and update only assertions that encode the unsafe ordering.
- Image prompt length may overflow after lock insertion: reserve protected block capacity and fail explicitly if mandatory content alone exceeds the limit.
- Repeated dialogue could be accidentally collapsed: block construction must operate on ordered entries; substring presence is insufficient as the only validator.
- Mixed dirty worktree: use targeted patches and scoped staging only if a later explicit commit is requested.

## Acceptance criteria

- One, two, and three-character shots attach every primary portrait in `requiredCharacterRefs` order.
- Missing/unknown portraits and insufficient model capacity block before credits/provider calls with actionable Thai text.
- Final image prompt explicitly prevents face, hairstyle, and clothing changes for each character/index.
- Single and angle-grid image paths share the same contract.
- All canonical native dialogue appears verbatim and in order in stored and provider prompts.
- Grok native audio cannot be downgraded by provider catalog metadata.
- All targeted regression tests and relevant type checks pass.

## Rollout

No migration. Existing prompts are repaired on the next generation. Existing assets are untouched. Monitor preflight failures by counts and non-sensitive identifiers.

