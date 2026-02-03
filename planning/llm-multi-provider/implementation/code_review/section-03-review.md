# Code Review: Section 03 - Cost Tracker

## Findings

1. **AdminUsageStats missing `providerName` and `topUsers`** (MEDIUM): Plan specifies `providerName` in `costByProvider` via join with `llmProviders`, and `topUsers` array. Both were missing.
   - **Fixed**: Added `leftJoin` with `llmProviders` for provider name, added `topUsers` aggregation query.

2. **UserUsageStats missing `totalCostUsd`** (MEDIUM): Plan specifies `totalCostUsd` field. Was omitted.
   - **Fixed**: Added `totalCostUsd` to interface, query, and return value.

3. **Test expected wrong value for model pricing calculation** (LOW): Comment and expected value miscalculated — prices are per-million, not per-token.
   - **Fixed**: Corrected expected value from `0.0000075` to `0.0075`.

4. **`vi.hoisted()` needed for mock variables** (LOW): Vitest hoists `vi.mock()` above `const` declarations, causing ReferenceError.
   - **Fixed**: Wrapped mock variables in `vi.hoisted()`.

## Let Go
- Silent `if (!db) return` in logRequest — acceptable defensive pattern, DB unavailability is an infrastructure issue not a cost tracker concern.
- No date range filtering test with real data — adequately tested via mock structure verification.
