# Section 05 Code Review Interview

## Auto-fixes Applied

### 1. TRPCError instead of plain Error (HIGH #2)
Changed `throw new Error(...)` to `throw new TRPCError({ code: "NOT_FOUND", message: "Model mapping not found" })` in `updateModelPriority`. Avoids leaking internal IDs and returns proper 404 status.

### 2. Removed `Record<string, any>` type erasure (HIGH #3)
Replaced `const setValues: Record<string, any>` in `upsertModelMapping` UPDATE path with typed spread: `...(isExplicitPriority ? { priority: input.priority, priorityLocked: true } : {})`. Preserves Drizzle type checking.

### 3. Added Array.isArray guard (MEDIUM #7)
Changed `(provider.availableModels as any[]) ?? []` to `Array.isArray(provider.availableModels) ? provider.availableModels : []` in `bulkSetAdminModelCatalogEnabled`. Prevents iterating over non-array JSON values.

## Decisions — Let Go

### backfillModelPriorities N+1 pattern (HIGH #1)
Backfill is an idempotent one-time admin action. N+1 is acceptable for this use case — the alternative (batched CASE statement) adds complexity for a rare operation. Safe to re-run if interrupted.

### Missing boundary value tests for priority 0/999 (MEDIUM #4)
The test mock setup uses a simplified tRPC procedure that doesn't run Zod validation. Boundary rejection tests would give false confidence. Zod schema `.min(0).max(999)` is correct — boundary validation is a tRPC framework responsibility.

### backfillModelPriorities missing contextLength (MEDIUM #5)
`computeModelPriority(ModelPriorityInput)` does not include a `contextLength` field — the reviewer's observation was incorrect. No change needed.

### Capability flags hardcoded to false for bulk inserts (MEDIUM #6)
By design per the plan. Provider `availableModels` JSON does not consistently include capability metadata. Capabilities are populated later via model sync.

### Test mock data missing priorityLocked (MEDIUM #8-9)
Mock chain tests bypass real typing. Not breaking — the mocked DB returns whatever shape is provided. The field is correctly added to actual SELECT queries.

### No test for not-found path / updatedCount accuracy (LOW #10-11)
Low severity, not blocking. Not-found path is now properly handled with TRPCError.

## User Interview Items
None — no items required user input. All findings were either auto-fixable or acceptable tradeoffs.
