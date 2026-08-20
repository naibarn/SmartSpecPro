# Section 01 — Visual Tier Contract

## Ownership

Own the shared marker and visual-bible service contract. Do not change stored
story-role semantics.

## Targets

- `apps/web/shared/verticalDramaSeries/ageStageVariant.ts`
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- service tests

## TDD

Prove child age-stage precedence, adult age-stage preservation, payload facts,
and unchanged standalone behavior.

## Acceptance

An age-stage child prompt is validated as `child`; an adult parent remains
`lead_male` in persistence and story-facing data.

## Risks

Do not let custom text override the canonical tier for a base adult row without
the explicit age-stage confirmation path.
