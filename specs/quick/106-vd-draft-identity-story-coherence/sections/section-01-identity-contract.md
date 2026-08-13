# Section 01 — Identity contract

## Ownership

Shared pure contracts only. Do not import server/db code.

## Targets

- `apps/web/shared/verticalDramaSeries/characterNaming.ts`
- new shared identity/story-context module and tests
- `apps/web/shared/verticalDramaSeries/index.ts`

## Work

- Define bounded optional fields for target market, setting, lead background, origin,
  spoken profile, naming policy, source and confidence.
- Render prompt guidance with strict precedence: creator facts > setting/casting > market.
- Add a helper that returns UI rows without presenting market as nationality.
- Preserve existing character naming helper behavior for legacy callers.

## Acceptance

- No country is inferred from `en-US` alone.
- Explicit “Asian international student in the US” is represented without collapsing the
  lead into an American national.
- Shared tests cover Thai UI/English dialogue and explicit cross-cultural names.
