# Section 12 Code Review Interview

## Auto-Triage Decisions (per user instruction: auto-decide except security)

### FIXED — #1 (Security): Missing `assertAgencyEnabled()` ✅
- **Decision**: FIX (Security concern — master kill switch bypass)
- **Action**: Added `await assertAgencyEnabled(tenantId)` to both `listTemplates` and `createFromTemplate` procedures, before the template-specific feature flag check.
- **Files changed**: `apps/web/server/routers/agency.ts`

### FIXED — #5: `creatingId` state leak on success ✅
- **Decision**: Auto-fix (obvious improvement)
- **Action**: Added `setCreatingId(null)` in `onSuccess` before navigation.
- **Files changed**: `apps/web/client/src/pages/AgencyTemplates.tsx`

### FIXED — #6: Silent swallow of invalid flows ✅
- **Decision**: Auto-fix (data integrity)
- **Action**: Replaced `if (fromId && toId)` guard with a throw on `!fromId || !toId`, ensuring bad template data fails loudly during agency creation.
- **Files changed**: `apps/web/server/routers/agency.ts`

### LET GO — #2: resolveJsonModule
- **Reason**: `bundler` moduleResolution handles JSON imports without needing this flag.

### LET GO — #3: Client tests don't render components
- **Reason**: Data shape tests are functional. Component rendering tests are a nice-to-have, not blocking.

### LET GO — #4: Missing tRPC procedure tests
- **Reason**: Template loader tests cover data integrity. Procedure-level tests would need full mock DB setup — out of scope for this section.

### LET GO — #7-11: Low severity style items
- **Reason**: Cosmetic/pedantic. No functional impact.

## Tests
All 12 tests pass after fixes (8 server + 4 client).
