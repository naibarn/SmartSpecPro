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

## As-Built Update
- Actual files changed:
  - `apps/web/server/services/libraryOpsService.ts`
  - `apps/web/server/services/libraryOpsService.test.ts`
  - `apps/web/server/routers/libraryOps.ts`
  - `apps/web/server/routers/libraryOps.test.ts` (new)
- Deviations from plan:
  - Global-operation role gating currently treats `admin` and `super_admin` as elevated roles; if stricter separation is required, narrow this in Section 07.
- Tests added/updated:
  - `apps/web/server/services/libraryOpsService.test.ts`
  - `apps/web/server/routers/libraryOps.test.ts`
- Test run:
  - `bash -lc 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && cd /home/dev/projects/SmartSpecPro/apps/web && npm test -- server/services/libraryFeatureFlags.test.ts server/services/libraryOpsService.test.ts server/routers/libraryOps.test.ts'`
  - Result: pass (18/18)
- Follow-ups:
  - In Section 07, replace callback global-scope fallback by strict tenant attribution and remove temporary restricted-path behavior.
