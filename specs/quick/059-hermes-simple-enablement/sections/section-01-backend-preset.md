# Section 01 — Backend preset

## Ownership

- `apps/web/server/services/hermesWorkerSettings.ts`
- `apps/web/server/services/hermesConnectionService.ts`
- `apps/web/server/routers/systemSettings.ts`
- related service/router tests

## Work

Define the safe preset, add an admin-only atomic apply mutation, clear the cache,
and expose separate non-sensitive tenant/platform availability booleans.

## TDD and acceptance

- Test enabled and disabled gate combinations.
- Test preset key/value completeness.
- Verify transaction failure cannot leave partial state.
- Preserve fail-closed behavior and admin-only mutation access.
