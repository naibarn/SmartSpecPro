# Section 02 Code Review Interview

## User Decisions

### 1. Attach credits info to LLMStructuredOutputError
**Decision:** Yes - add tokensUsed and creditsUsed to error class
**Action:** Modify LLMStructuredOutputError constructor to accept and expose these fields

### 2. Forward costUsd to deductCreditsForModel
**Decision:** Yes - extract from response.usage.cost and pass through
**Action:** Extract costUsd from response and pass to deductCreditsForModel

## Auto-fixes (applied without interview)

### 3. Truncate raw response in retry prompt
**Reason:** Prevent prompt injection from long/adversarial LLM responses
**Action:** Limit lastRawResponse to 500 chars in retry message

### 4. Fix error propagation test
**Reason:** Test calls callLLMStructured twice unnecessarily
**Action:** Capture rejection once and assert on it

### 5. Add test for markdown fence stripping
**Reason:** Core behavior not tested
**Action:** Add test case for ```json wrapped responses

## Let Go (not applying)

- #2 (credit accumulation test) - implicitly covered
- #3 (fallback_required error type) - orchestrator catches all errors
- #4 (Message type import) - structural typing is fine
- #6 (fallback_required test) - edge case
- #9 (nested fences) - unrealistic
- #11 (tenantId docs) - obvious from code
- #12 (failure audit log) - executeWithFallback logs internally
