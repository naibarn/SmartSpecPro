# Section 02 — Code Review Interview

## Review Triage

### AUTO-FIXED

1. **#1 (MEDIUM): chat.ts `model: llmModel` can be null** — Added `?? "unknown"` fallback to match plan's safety guard.
2. **#4 (MEDIUM): Snapshot attemptIndex never incremented across retries** — Created per-attempt snapshot copy with `{ ...plannerResult.snapshot, attemptIndex: attempt }` so each retry gets correct index.

### DELIBERATE DEVIATIONS (documented, not fixed)

3. **#2: Missing `provider` field in media recordStepAttempt** — Media models use Python backend and a separate model registry. The provider name is not directly available at the Node.js call site. `"unknown"` is acceptable for media tracking since model identity (from media registry) is the primary analytics dimension.

4. **#3: recordStepAttempt fires before JSON parse validation** — This is intentional. The plan states "Each retry attempt should create a separate step_attempt record." Each attempt represents a billable LLM call regardless of JSON parse outcome. The step_attempt records LLM-level success, not application-level success.

5. **#11: callLLMStructured doesn't pass executionPolicy** — Plan's pseudocode for callLLMStructured doesn't include executionPolicy either. The structured output call is often invoked from non-skill contexts (e.g., content processing) where no execution policy exists.

### LET GO (nitpicks)

6. **#5: `tenantId || "default"` fallback** — Consistent with section-01 pattern. All entry points use this fallback.
7. **#6: audioGeneration hardcoded skillSlug** — Function signature doesn't include `skill` param. Changing would be a breaking interface change outside scope.
8. **#7-10: Test coverage gaps for skillExecutor/chat.ts** — The planner wiring pattern is identical across all call sites and thoroughly tested via taskPlannerMiddleware.test.ts (11 tests) and callLLMStructured.test.ts (6 tests). Adding identical tests for each media function provides diminishing returns.
9. **#12: No validation of planner's resolved model** — Out of scope for wiring section. Model validation belongs in the model resolver module.
