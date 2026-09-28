# Section 03 — Generation Hydration

## Ownership

Own `verticalDramaCharacterImageGeneration.ts`, `verticalDramaEpisodePipeline.ts`,
`verticalDramaStoryboardGeneration.ts`, and their focused tests.

## Work

- Reload current character rows/assets at prompt/image generation boundaries.
- Feed effective shared DNA plus per-twin local styling into prompt context.
- Preserve hard face lock and same apparent age/maturity range.
- Reject incompatible age-stage variants before paid/provider calls.
- Preserve separate character keys and shot-level selections.

## TDD and acceptance

Prove stale storyboard identity is not trusted, twin prompt facts are present, local
style survives, missing canonical DNA fails closed, and infant variant 198 is rejected
against the school-age pair.

## Risks

Do not rewrite existing storyboard JSON during normal generation. Mark stale state and
keep all retries/paid work behind existing admission and credit gates.

## Implementation status (2026-09-06)

Implemented provider-bound roster reloads for start-frame image generation and
shot prompt identity maps. Linked twins now contribute current canonical age and
shared-face facts immediately before paid admission; incompatible age-stage twin
looks are rejected before credit reservation.
This also catches legacy rows mislabeled as `outfit` when their stored age
clearly says infant/newborn or a materially different numeric age.
