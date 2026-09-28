# Section 02 — Start Frame and Video Integration

## Ownership

Own prompt input construction for Start Frame, Legacy, and Enhanced. Do not
change paid job enqueue/settlement or episode data mutation behavior.

## Target files

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- `apps/web/server/services/verticalDramaEnhancedVideoPrompt.ts`
- existing Legacy/Enhanced prompt helpers and their focused tests

## Work

- Resolve physical/caller refs from the approved frame before building prompt
  identity blocks.
- Replace raw storyboard-character usage where an explicit frame cast exists.
- Keep narrative synopsis/action/continuity available as context with an explicit
  mention-only exclusion rule.
- Ensure Enhanced canonical context and skill input do not contain the extra
  physical character; preserve selected speaker positions and exact dialogue.
- Ensure Legacy receives the same resolved physical cast and caller separation.
- Do not add a block for an extra storyboard mention.

## TDD and acceptance

- All three paths use the same shot 9 cast fixture.
- Explicit caller remains available as media presence only.
- Existing cast-position and speaker-lock tests remain green.
- No provider or credit code is executed by the tests.

## Risks and coordination

The router is heavily modified in the dirty worktree. Apply narrow hunks only
and preserve unrelated changes. If an older path has no frame refs, retain its
existing compatibility behavior and add only the exclusion instruction rather
than broad refactoring.
