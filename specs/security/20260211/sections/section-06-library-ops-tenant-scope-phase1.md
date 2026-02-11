# Section 06 - Library Ops Tenant Scope (Phase 1)

## Objective
Introduce tenant-aware guardrails in ops paths where tenant data is already available, and lock down any necessary global actions.

## Scope
- Pass tenant scope through ops router/service APIs.
- Apply tenant filters on tenant-attributed entities (especially `library_index_jobs`).
- Mark and restrict global operations explicitly.

## Files to Add / Modify
- Modify: `apps/web/server/routers/libraryOps.ts`
- Modify: `apps/web/server/services/libraryOpsService.ts`
- Modify: `apps/web/server/services/libraryOpsService.test.ts`
- Add/Modify: route tests for role + scope behavior

## TDD Stubs (Write First)
- Test: tenant-scoped retry only updates tenant-owned failed jobs.
- Test: tenant-scoped summary excludes other tenants where possible.
- Test: global fallback action requires explicit elevated role and audit marker.

## Implementation Tasks
1. Add tenant scope parameters to service functions.
2. Apply tenant predicates to `library_index_jobs` operations.
3. Gate global-only actions with explicit role checks.
4. Expand audit payload to include operation scope (`tenant` vs `global`).

## Acceptance Criteria
- Phase 1 operations are tenant-safe where schema permits.
- Global actions are explicit, restricted, and auditable.

## Notes / Risks
- Callback tables still need tenant attribution (handled in section 07).
