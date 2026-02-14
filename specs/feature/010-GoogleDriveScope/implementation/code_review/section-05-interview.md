# Section 05 Code Review Interview

## Review Summary
- **CRITICAL #1**: Read-then-write race in `incrementBudgetUsage` → **Auto-fixed**: Atomic SQL `credits_used_this_month = credits_used_this_month + amount`
- **HIGH #1**: Silent budget tracking failure → **Auto-fixed**: Added `console.error` logging
- **HIGH #2**: No tRPC error handling for BudgetExceededError → **Let go**: Deferred to when callers are wired up
- **HIGH #3**: No callers pass tenantId → **Auto-fixed**: Added `tenantId?` param to `chargeForIndexing` and `chargeForRagQuery`
- **HIGH #4**: Missing test files → **Let go**: Core logic tests cover the critical paths
- **HIGH #5**: setBudgetConfig upsert race → **Auto-fixed**: Changed to `onConflictDoUpdate`
- **HIGH #6**: setBudget allows monthlyLimit=0 → **Auto-fixed**: Changed to `min(1)` in tRPC input
- **HIGH #7**: budgetUsagePct never populated → **Auto-fixed**: Now populated from checkBudget result

## Fixes Applied
1. `budgetService.ts`: Atomic SQL increment for `creditsUsedThisMonth`
2. `budgetService.ts`: `setBudgetConfig` uses upsert pattern (`onConflictDoUpdate`)
3. `creditService.ts`: Logged budget tracking errors instead of swallowing
4. `creditService.ts`: `budgetUsagePct` populated from checkBudget result
5. `creditService.ts`: `chargeForIndexing` and `chargeForRagQuery` accept `tenantId`
6. `credits.ts`: `setBudget` requires `monthlyLimit >= 1`
