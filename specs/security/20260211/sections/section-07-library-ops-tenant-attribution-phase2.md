# Section 07 - Library Ops Tenant Attribution (Phase 2)

## Objective
Complete tenant scoping by adding tenant attribution to callback tables and migrating/backfilling existing rows.

## Scope
- Add tenant id columns to callback event and DLQ tables.
- Backfill tenant id for existing rows using linked entity inference.
- Update ops queries to use tenant filters across callback flows.

## Files to Add / Modify
- Add migration: `apps/web/drizzle/*_callback_tenant_attribution.sql`
- Modify: `apps/web/drizzle/schema.ts`
- Modify: `apps/web/server/services/libraryOpsService.ts`
- Add/Modify: backfill script/service + tests
- Modify: `apps/web/server/services/libraryOpsService.test.ts`

## TDD Stubs (Write First)
- Test: schema exposes tenant id fields for callback records.
- Test: backfill infers tenant id correctly from linked records.
- Test: unresolved rows are flagged/reportable.
- Test: callback retry/reprocess obey tenant filters post-migration.
- Test: cross-tenant callback operation is blocked.

## Implementation Tasks
1. Create and apply DB migration for tenant attribution columns + indexes.
2. Implement deterministic backfill job with dry-run mode.
3. Update services/routers to require tenant scope in callback operations.
4. Add post-migration validation report.

## Acceptance Criteria
- Callback operations are tenant-scoped after phase 2.
- Backfill completeness is measurable and documented.
- Cross-tenant callback ops are prevented by tests.

## Notes / Risks
- Some historical records may be non-attributable; define explicit handling policy.

## As-Built (Implemented)
- Added callback tenant attribution migration:
  - `apps/web/drizzle/0021_callback_tenant_attribution.sql`
  - `apps/web/drizzle/meta/_journal.json`
- Updated callback schema columns and tenant indexes:
  - `apps/web/drizzle/schema.ts`
- Completed tenant-scoped callback ops behavior:
  - `apps/web/server/services/libraryOpsService.ts`
  - `apps/web/server/routers/libraryOps.ts`
- Added deterministic backfill + reporting service:
  - `apps/web/server/services/libraryOpsTenantAttributionService.ts`
- Added/updated tests:
  - `apps/web/server/services/libraryOpsService.test.ts`
  - `apps/web/server/routers/libraryOps.test.ts`
  - `apps/web/server/services/libraryOpsTenantAttributionService.test.ts`

## Deviations From Plan
- Backfill was implemented as a reusable service (`libraryOpsTenantAttributionService`) with dry-run + report output rather than a standalone script-only implementation.
- Callback table schema mapping was aligned to existing database snake_case callback columns to preserve runtime compatibility.

## Test Evidence
- `bash -lc 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && cd apps/web && npm test -- server/services/libraryOpsService.test.ts server/routers/libraryOps.test.ts server/services/libraryOpsTenantAttributionService.test.ts'`
- Result: pass (19 tests)
