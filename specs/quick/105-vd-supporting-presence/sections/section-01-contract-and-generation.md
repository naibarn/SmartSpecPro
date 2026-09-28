# Section 01 — Contract and generation

## Ownership

Own the shared supporting-presence type/normalizer and storyboard schema/prompt
normalization. Do not change portrait attachment resolution.

## Targets

- `apps/web/shared/verticalDramaSeries/supportingPresence.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/server/services/verticalDramaStoryboardGeneration.ts`
- `apps/web/skills/vertical-drama-storyboard-shotgrid/SKILL.md`

## TDD

Test exact/bounded counts, valid visibility values, status/source normalization,
and shot-local output. Verify generic roles are not converted into character ids.

## Acceptance

Structured roles survive schema validation, are bounded, and are only emitted
when the shot's own visual action makes them visible.
