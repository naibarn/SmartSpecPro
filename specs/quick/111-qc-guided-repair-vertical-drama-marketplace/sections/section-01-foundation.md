# Section 01 — foundation

## Ownership

Shared QC contracts, deterministic repair-plan builders, Skill schemas/prompts,
and pure tests only.

## Targets

- `apps/web/shared/verticalDramaSeries/draftQualityQc.ts`
- `apps/web/shared/marketplaceAutoReview/draftQualityQc.ts`
- both draft-quality Skill mirror directories and output schemas
- shared contract tests

## TDD

Start with plan/state/schema tests, including passed/no-safe-plan and legacy
state compatibility. Implement additive fields and deterministic mapping without
changing either score rubric.

## Acceptance

Server can derive a bounded plan from stored report data; client data cannot
widen target/preserve paths; both Skill contracts describe complete replacement
repair mode.
