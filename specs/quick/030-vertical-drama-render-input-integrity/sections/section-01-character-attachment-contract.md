# Section 01 — Character attachment contract

## Implementation status

Completed 2026-07-13. The router now resolves every shot character in canonical
order, requires a distinct approved primary portrait for each character, keeps
optional sheets supplementary, checks model reference capacity before credit
reservation, and protects a deterministic face/hair/outfit identity block.

## Ownership

- `apps/web/shared/verticalDramaSeries/characterIdentityMap.ts`
- Character-reference helper area of `apps/web/server/routers/verticalDramaEpisodes.ts`
- Corresponding shared/router tests

## Work

1. Write failing tests for deterministic required-key order, 1/2/3 characters, missing portraits, duplicate keys, and capacity overflow.
2. Implement an ordered required-character manifest that distinguishes mandatory primary portraits from optional sheets.
3. Implement fail-closed preflight before credit reservation.
4. Build an idempotent identity-lock block and protect it through QC.
5. Ensure actual provider URL order exactly matches Image numbering.

## Acceptance

- No missing mandatory character can be silently omitted.
- No mandatory portrait can be trimmed.
- Error includes all missing character names or exact capacity mismatch.
- Face, facial structure, skin, hair, clothing, accessories, and distinguishing features are locked for every manifest entry.

## Risk

Preserve existing flag-off mocks and do not assume DB row order.
