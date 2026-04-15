# Section 01 - Schema Foundation

## Objective

Create the relational foundation for the governed agent registry. This section is only about schema, table shape, enum shape, and migration-safe contracts. It should not implement selection logic or UI surfaces.

## Scope

- Add new registry tables in `apps/web/drizzle/schema.ts`.
- Define the enum/value sets for rollout posture, registry state, policy change class, and outcome-memory classification.
- Add the minimum indexes needed for tenant-scoped registry lookup and version selection.
- Preserve existing role-agent and delegated-worker tables unchanged.

## Files Likely Changed

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts` or a new schema-focused test file in the same pattern
- `apps/web/shared/agentRegistryContracts.ts` if shared schema-like constants belong there

## Implementation Notes

1. Keep the new tables additive and normalized.
2. Model the stable registry identity separately from immutable version rows.
3. Store rollout targeting in a dedicated binding table instead of overloading version rows.
4. Keep performance memory separate from runtime activity logs.
5. Use explicit indexes for the most likely access paths:
   - tenant + registry identity
   - tenant + rollout posture
   - tenant + workpack-family or queue targeting
   - version status + stable pointer relationships
6. Leave room for idempotent bootstrap/backfill markers so the migration can safely copy existing role-agent concepts into the new registry.

## TDD Stubs

- Test that the new schema exports the expected registry tables.
- Test that the rollout enum accepts only the approved states.
- Test that the version table exposes immutable-version fields and stable-pointer fields.
- Test that the schema still exports the existing role-agent tables.
- Test that registry lookup indexes exist for tenant-scoped queries.

## Completion Check

This section is done when the registry data model can be referenced by later sections without inventing placeholder shapes.
