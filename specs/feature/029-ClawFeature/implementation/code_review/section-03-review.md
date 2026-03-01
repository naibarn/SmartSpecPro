# Section 03 Code Review: Per-Response Cost Display

## Critical Issues

### 1. Multiple providerUsageLog rows per traceId -- wrong row selected (HIGH)
**File:** `messageCostService.ts` lines 61-76
When fallback occurs, multiple rows share the same traceId. The query returns ALL rows and `rows[0]` is used without ordering -- could pick a failed attempt.
**Fix:** Add `.orderBy(desc(providerUsageLog.id)).limit(1)` or filter by `statusCode: 200`.

### 2. Hardcoded responseTimeMs: 0 in streaming path (MEDIUM)
**File:** `llmRoutes.ts` line 1166
Streaming handler passes `responseTimeMs: 0`. Could use available timing data.

### 3. Missing AgencyChat integration (MEDIUM)
Plan section 2.6 requires AgencyChat integration. Not done due to AgencyStreamMessage using string IDs (no DB-backed messageId).

### 4. Missing chatCostTrace test file (MEDIUM)
Plan section 1.2 specifies `chatCostTrace.test.ts` for traceId correlation tests. Not present.

## Moderate Issues

### 5. Error handling uses string matching (MEDIUM)
`messageCostService.ts` throws `new Error("FORBIDDEN")` and router catches by string matching. Fragile pattern.

### 6. Frontend test lacks expanded content assertions (LOW-MEDIUM)
Test verifies `enabled: true` but doesn't assert rendered data (provider name, tokens, etc).

### 7. costUsd could be NaN for edge cases (LOW-MEDIUM)
If `params.costUsd` was NaN, stored as "NaN" string, `Number("NaN")` returns NaN.

### 8. Plan specified Chat.tsx but diff modifies ChatView.tsx (LOW)
Correct decision -- ChatView.tsx is where rendering happens.

## Minor Issues

### 9. Redundant role="button" on button element (TRIVIAL)
### 10. Dynamic import for traceContext in llmRoutes.ts (LOW)
Could use static import for consistency with llmRouter.ts.
