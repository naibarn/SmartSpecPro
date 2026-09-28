# Implementation Plan

## Objective

Make selected shot references the enforceable visible-cast boundary even when
the synopsis mentions another roster character.

## Approach

1. Add pure prompt sanitation/validation helpers in
   `verticalDramaStartFrameGeneration.ts`.
2. Extend shot-prompt params with `excludedVisualCharacterNames` and apply the
   guard to deterministic policy-safe output and every authored/retry/fallback
   final positive prompt.
3. In `verticalDramaEpisodes.ts`, resolve all tenant-series roster names,
   subtract physical and screen-caller selections, and pass only excluded
   names to the prompt service.
4. Add pure-service and router-wiring regressions for the reported one-person
   shot mentioning `ปราง`.

## Risks and mitigations

- Name overlap: temporarily protect allowed selected names before redaction.
- Invalid prose after deletion: remove containing parentheses and normalize
  whitespace/punctuation; exact cast matters more than retaining non-visual
  exposition in an image prompt.
- Missed path: centralize final-prompt guarding before return/persistence and
  test policy-safe plus normal output.

## Acceptance criteria

- `ปราง` cannot remain in a one-person `คุณกฤต` positive image prompt unless
  selected as physical cast or screen caller.
- No paid image task receives a prompt that fails excluded-name validation.
- Existing cast/reference mapping behavior remains intact.
