# Section 12 Code Review: Templates & Rollout

## Findings

### #1 — HIGH (Security): Missing `assertAgencyEnabled()` in template procedures
- **File**: `apps/web/server/routers/agency.ts` (listTemplates, createFromTemplate)
- **Issue**: Both template procedures only check `AGENCY_TEMPLATES_ENABLED` but skip the master `AGENCY_SWARM_ENABLED` check that every other agency procedure performs. If the master switch is off, templates are still accessible.
- **Recommendation**: Add `await assertAgencyEnabled(tenantId)` before the template-specific flag check.

### #2 — LOW: resolveJsonModule not in tsconfig
- **File**: `apps/web/tsconfig.json`
- **Issue**: No `resolveJsonModule: true` in compilerOptions, but JSON imports are used.
- **Note**: `bundler` moduleResolution handles this automatically; not needed.

### #3 — MEDIUM: Client tests don't render components
- **File**: `apps/web/client/src/pages/__tests__/AgencyTemplates.test.tsx`
- **Issue**: Tests only verify hardcoded data shapes, not actual component rendering.
- **Note**: Tests are functional for data contract verification. Component rendering can be added later.

### #4 — MEDIUM: Missing tRPC procedure integration tests
- **Issue**: No test verifies the actual tRPC procedure behavior (feature flag, template creation).
- **Note**: Server-side template loader tests cover data integrity. Procedure tests would need mock DB.

### #5 — MEDIUM: `creatingId` state not reset on success
- **File**: `apps/web/client/src/pages/AgencyTemplates.tsx`
- **Issue**: `onSuccess` callback navigates but doesn't reset `creatingId` to null.
- **Recommendation**: Add `setCreatingId(null)` before navigation.

### #6 — MEDIUM: Silent swallow of invalid communication flows
- **File**: `apps/web/server/routers/agency.ts` (createFromTemplate)
- **Issue**: `if (fromId && toId)` silently skips flows with unresolved agent names.
- **Recommendation**: Throw error on invalid template data rather than silently skipping.

### #7-11 — LOW: Various style/naming items
- Minor naming, comment, and import order suggestions. No functional impact.
