# Section 01 — Role Contract and Database Migration

## Goal

Create the single canonical narrative-role contract and add nullable persistent fields
without breaking existing character rows or the dirty worktree.

## Ownership

- Shared taxonomy beside `apps/web/shared/verticalDramaSeries/characterProfile.ts`.
- DTO/profile changes in `characterProfile.ts` and `contracts.ts`.
- Additive manual SQL migration and `apps/web/drizzle/schema.ts` alignment.
- Shared role contract tests and migration round-trip tests.

## Contract

Expose canonical `narrativeRole` values (`protagonist`, `co_protagonist`, `antagonist`,
`secondary_lead`, `supporting`, `ensemble`, `minor`) and detailed `roleTier` values from
the supplied production taxonomy: lead genders/life stages, open/hidden villains and
rivals, second leads, parents, elders, students, interns, memorable/background support,
same-person/age-stage/twin variants, and `other`.

Expose Thai/English labels, grouping, age/safety constraints, conservative legacy aliases,
lead detection, and label helpers from one module. Add nullable DTO fields for
`narrativeRole`, `roleTier`, `occupation`, `roleVisualIntent`, `roleProvenance`, and
`roleReviewStatus`; retain `role` unchanged.

Use an idempotent hand-authored SQL migration because this table lineage has a documented
drizzle journal collision. Add nullable columns matching the existing camelCase naming
convention and indexes only where the existing migration strategy supports them. Update
Drizzle types after SQL exists.

## TDD stubs

- Enum/label/group/age constraint tests.
- DTO round-trip with null, AI-assigned, user-confirmed, and review-required states.
- Legacy alias normalization does not mutate the source role string.
- Migration SQL is idempotent and tenant-safe.
- Canonical role-first lead detection beats occupation text.

## Completion proof

Run focused shared tests and migration status/check. Record the exact migration file and
schema diff in the implementation report; do not stage unrelated files.
