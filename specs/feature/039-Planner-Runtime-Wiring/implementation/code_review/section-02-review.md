# Section 02 — Code Review

## MEDIUM SEVERITY

1. **chat.ts: `model: llmModel` can be null** — `recordStepAttempt` requires `model: string`, but `llmModel` is `string | null`. Plan specifies `llmModel ?? "unknown"` fallback. While the null check at line 1442 guards the path, the type doesn't narrow across 150+ lines.

2. **skillExecutor.ts: `provider` field missing from media recordStepAttempt calls** — All three media functions omit the `provider` field. This causes all media step_attempts to record `providerName: "unknown"`, degrading analytics value.

3. **callLLMStructured.ts: recordStepAttempt fires before JSON parse validation** — Step attempt is recorded as "completed" even if the attempt produces invalid JSON and triggers a retry.

4. **Snapshot attemptIndex never incremented across retries** — Same `plannerResult.snapshot` (attemptIndex: 0) is passed to every retry's `recordStepAttempt`. All step_attempt rows will have identical `attemptIndex: 0`.

## LOW SEVERITY

5. **skillExecutor.ts: `tenantId || "default"` fallback** — Creates orphaned task_runs with non-existent tenant. Consider warning when fallback triggers.

6. **skillExecutor.ts: audioGeneration uses hardcoded skillSlug** — `skillSlug: "audio-generation"` conflates all audio skills.

## TEST COVERAGE GAPS

7. No tests for skillExecutor.ts planner wiring
8. No test for chat.ts executeSkill planner wiring
9. No test for planner failure not blocking execution
10. No test for failed step_attempt recording (`.catch(() => {})` pattern)

## PLAN COMPLIANCE

11. Acceptance criterion 2 partially met — callLLMStructured does not pass executionPolicy
12. Acceptance criterion 5 partially met — no validation that planner's resolved model is usable
