# Section 06 — Code Review Interview

## Review Verdict: APPROVE_WITH_FIXES → Partial fixes applied

## Auto-fixes Applied

### 1. MEDIUM: Remove conditional guard on message array assertion
- **File:** `teamRunIntegration.test.ts` line 305
- **Fix:** Replaced `if (Array.isArray(msgs))` with unconditional `expect(Array.isArray(msgs)).toBe(true)`
- **Rationale:** Prevents false-positive pass if messages are flattened to string

### 2. MEDIUM: Add classifyIntent not-called assertions
- **File:** `teamRunIntegration.test.ts` — Thai and English objective tests
- **Fix:** Added `expect(mockClassifyIntent).not.toHaveBeenCalled()` assertions
- **Rationale:** Validates assistant-origin short-circuit in routeRoomIntent

### 3. LOW: Fix comment to accurately describe mock boundaries
- **File:** `teamRunIntegration.test.ts` header comment
- **Fix:** Updated to clarify that promptComposer is mocked for DB isolation, not as an external boundary

## Items Let Go

### HIGH: Unmock promptComposer for true integration testing
- **Decision:** Rejected. `composePrompt` queries 5+ database tables via Drizzle ORM. Mocking the full Drizzle chain for integration-level testing would be fragile and complex. The unit tests in `promptComposer.enhanced.test.ts` (11 tests) already validate the internal wiring of persona segments, entity memories, display names, and history formatting. The integration test validates the routing → execution flow.

### HIGH: Add entity memory injection scenario
- **Decision:** Skipped — requires unmocked `promptComposer` to be meaningful. Already covered by `promptComposer.enhanced.test.ts` tests (entity memory injection, prioritization, budget limits, error handling).

### HIGH: Add consecutive-turn history continuity scenario
- **Decision:** Skipped — requires unmocked `promptComposer` + DB query for `teamRoomMessages`. Already covered by `promptComposer.enhanced.test.ts` (display names, role structure, empty history).

### LOW: Extract shared test helpers
- **Decision:** Acceptable pattern for now. Can be refactored in a follow-up.
