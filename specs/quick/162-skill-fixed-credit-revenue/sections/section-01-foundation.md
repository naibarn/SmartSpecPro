# Section 01: fixed-credit foundation

## Ownership

Schema, migration, registry synchronization, and admin CRUD contract.

## Targets

- `apps/web/drizzle/schema.ts`
- new `apps/web/drizzle/0247_skill_fixed_credit_revenue.sql`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/routers/skills.ts`
- focused schema/registry/router tests

## TDD

- Defaults are 2/0 for new and synced skills.
- Existing admin pricing survives content hash sync.
- Admin update accepts only non-negative integers and returns both values.

## Risks

Do not repurpose `creditMultiplier`; do not silently backfill owner ids.
