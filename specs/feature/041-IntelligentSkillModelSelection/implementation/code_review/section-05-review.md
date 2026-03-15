# Section 05 Code Review

## HIGH Severity

### 1. backfillModelPriorities N+1 sequential UPDATE — no transaction boundary
Row-by-row updates without transaction wrapper. Inconsistent state on failure.

### 2. updateModelPriority throws plain Error instead of TRPCError
Should be TRPCError({ code: 'NOT_FOUND' }) for proper 404 status.

### 3. upsertModelMapping UPDATE path uses `Record<string, any>`
Type safety escape hatch bypasses Drizzle type checking.

## MEDIUM Severity

### 4. Missing test: priority boundary values (0 and 999)
Plan specifies tests for `priority > 999` and `priority < 0` rejection.

### 5. backfillModelPriorities missing contextLength in computeModelPriority call
Plan passes `contextLength: row.contextLength` but implementation omits it.

### 6. bulkSetAdminModelCatalogEnabled hardcodes all capability flags to false
New items get degraded priority score (capability component = 0).

### 7. `availableModels` cast to `any[]` without validation
Should validate with `Array.isArray()` before iterating.

### 8-9. Test mock data missing priorityLocked
listModelMappings and listAdminModelCatalog test mocks lack priorityLocked field.

## LOW Severity

### 10. No test for updateModelPriority when mapping does not exist
### 11. updatedCount counts attempts, not actual updates
