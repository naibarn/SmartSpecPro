# Section 01 — Prompt Guard

## Ownership

- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- `apps/web/server/services/__tests__/verticalDramaStartFrameGeneration.imagePromptModes.test.ts`

## Work

- Introduce pure sanitation and validation for excluded roster names.
- Protect selected physical and screen-caller names.
- Apply the guard to policy-safe and all final authored prompt paths.

## TDD acceptance

- Reported Thai example removes `ปราง` and keeps `คุณกฤต`.
- Parenthetical exclusion text containing `ปราง` is removed.
- Overlapping allowed names remain intact.
- A residual excluded name fails closed.
