# Section 05 Code Review

## CRITICAL
1. Race condition in incrementBudgetUsage: read-then-write pattern loses counter updates under concurrency → **Auto-fixed**: atomic SQL increment

## HIGH
1. Budget tracking failure silently swallowed in deductCredits → **Auto-fixed**: added console.error logging
2. No tRPC error handling for BudgetExceededError → **Let go**: deferred to caller wiring
3. No callers pass tenantId to deductCredits → **Auto-fixed**: added tenantId param to chargeForIndexing/chargeForRagQuery
4. Missing test files (BudgetPanel.test.tsx, creditService budget tests) → **Let go**: core logic tested
5. setBudgetConfig upsert has read-then-write race → **Auto-fixed**: onConflictDoUpdate
6. setBudget allows monthlyLimit=0 creating confusing UX → **Auto-fixed**: min(1) in tRPC input
7. budgetUsagePct declared but never populated → **Auto-fixed**: populated from checkBudget result
