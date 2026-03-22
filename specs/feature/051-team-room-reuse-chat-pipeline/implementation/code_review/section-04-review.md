# Section 04 Code Review

## Summary

The core deletion work is complete and correct: `teamOrchestrationBridge.ts` and `python-backend/app/services/team_orchestrator.py` are deleted, the `execute-turn` route and its models are stripped from `team_orchestrator_api.py`, `runEngine.ts` now calls `summaryService.generateSummary` directly, and the `test_team_orchestrator_security.py` file is trimmed appropriately. The Node.js rate limit (`teamRun.advance`) is confirmed in place.

However, there are three issues that need attention: two test files required by the spec are missing, and `rate_limit.py` was replaced with a stub that raises `ImportError` at import time instead of being deleted — breaking an existing unit test suite that legitimately imports it.

---

## Findings

### [HIGH] `rate_limit.py` replaced with a raise-on-import stub instead of deleted — breaks existing unit tests

- **File:** `python-backend/app/core/rate_limit.py` (new content) and `python-backend/tests/unit/core/test_rate_limit.py`
- **Issue:** The spec says to **delete** `rate_limit.py`. Instead, the diff replaces its content with a module-level `raise ImportError(...)`. The file at `python-backend/tests/unit/core/test_rate_limit.py` contains a full suite (`TestSlidingWindowAllow`, `TestExecuteTurnRateLimitDependency`) that imports `from app.core.rate_limit import sliding_window_allow` at the top of the file. With the stub in place, this import raises at collection time and the entire test file fails with an error — it does not skip, it errors. If the test file was intentionally kept in the repo it must be deleted; if the stub approach was chosen as a deletion marker it must be removed. In either case the current state breaks `pytest -x`.
- **Recommendation:** Either (a) delete `rate_limit.py` outright and delete `python-backend/tests/unit/core/test_rate_limit.py`, or (b) if the tombstone comment is desired for historical traceability, make the file a proper empty module (no `raise`) and delete the test file. Option (a) is cleaner and matches the spec's "Files to Delete" table.

### [HIGH] Plan-required Python verification test file not created

- **File:** `python-backend/tests/test_python_removal_verification.py` (absent)
- **Issue:** The spec requires a new file `test_python_removal_verification.py` with four tests: `test_execute_turn_endpoint_not_registered`, `test_team_orchestrator_service_not_importable`, `test_rate_limit_module_not_importable`, and `test_generate_summary_endpoint_exists` / `test_generate_summary_requires_proxy_token`. None of these tests were written. The removal has no automated coverage confirming the endpoint is gone and the summary path is preserved.
- **Recommendation:** Create the file with all five planned tests. The existing `TestRouterRegistration.test_execute_turn_route_removed` in `test_team_orchestrator_security.py` covers the route assertion partially, but the service/module importability and the generate-summary positive path are not covered anywhere.

### [HIGH] Plan-required Node.js bridge-removal test file not created

- **File:** `apps/web/server/services/__tests__/runEngine.bridgeRemoval.test.ts` (absent)
- **Issue:** The spec requires a new test file with two tests: one asserting no `"teamOrchestrationBridge"` string appears in `runEngine.ts`, and one calling `stopRun` with `requireFinalSummary: true` and verifying `summaryService.generateSummary` is invoked with `{ runId, tenantId }`. Neither test was written. The source-text assertion (first test) already exists inside `teamRunSkillExecutor.test.ts` for the executor file, but the `runEngine.ts` path and the behavioral mock test for `stopRun` are missing entirely.
- **Recommendation:** Create `runEngine.bridgeRemoval.test.ts` with both tests as specified.

### [MEDIUM] `tokenUsage` shape change in `runEngine.ts` is undocumented and potentially interface-breaking

- **File:** `apps/web/server/services/runEngine.ts` (lines 18-22, 29-32, 40-41, 49-50 in the diff)
- **Issue:** The diff flattens `turnResponse.tokenUsage.inputTokens` / `turnResponse.tokenUsage.outputTokens` to `turnResponse.inputTokens` / `turnResponse.outputTokens` throughout `runNextTurn`. This implies that the `TurnResponse` type (returned by `teamRunSkillExecutor.executeTeamRunSkillTurn`) had its shape changed in Section 03 from a nested `tokenUsage` object to flat fields. The diff also reconstructs the nested shape at line 1047: `tokenUsage: { inputTokens: turnResponse.inputTokens, outputTokens: turnResponse.outputTokens }` for `RunTurnResult`. This is internally consistent, but the change has no associated type diff shown here. If `teamRunSkillExecutor.ts` still returns `{ tokenUsage: { inputTokens, outputTokens } }` (which the deleted bridge's `ExecuteTurnResponse` used), these accesses will silently return `undefined` at runtime.
- **Recommendation:** Verify that the Section 03 diff on `teamRunSkillExecutor.ts` changed `ExecuteSkillTurnResult` / equivalent return type to flat `inputTokens`/`outputTokens` fields. If not, this is a silent runtime bug producing `NaN` token counts and `0` cost credits for every turn.

### [MEDIUM] `TestExecuteTurnRateLimitDependency` class in `test_rate_limit.py` imports deleted symbols from `team_orchestrator_api`

- **File:** `python-backend/tests/unit/core/test_rate_limit.py` (lines 151, 175, 189)
- **Issue:** Even if the `raise ImportError` stub were removed, `TestExecuteTurnRateLimitDependency` still imports `_EXECUTE_TURN_LIMIT` from `app.api.team_orchestrator_api` and patches `app.services.team_orchestrator.TeamOrchestratorService.execute_turn` — both of which no longer exist. This class cannot pass under any circumstances after this section lands.
- **Recommendation:** Delete `python-backend/tests/unit/core/test_rate_limit.py` in its entirety. The sliding-window algorithm tests (`TestSlidingWindowAllow`) test a deleted module; the integration tests (`TestExecuteTurnRateLimitDependency`) reference deleted symbols. There is nothing salvageable.

### [LOW] Inline `console.error` added to `loadRunWithTenantCheck` without going through structured logger

- **File:** `apps/web/server/services/runEngine.ts` (line 10 in diff)
- **Issue:** The diff adds `console.error(...)` to the tenant-mismatch path. All other logging in `runEngine.ts` uses the project's structured audit logger or is silent. A bare `console.error` bypasses log aggregation, structured fields (`traceId`, `tenantId`), and the JSONL audit trail described in CLAUDE.md.
- **Recommendation:** Use the existing structured logger if one is available in this module, or at minimum log through `logger.error(...)` with a structured object containing `runId`, `roomId`, `resolvedTenant`. This is a minor improvement; it does not block the section.

### [LOW] `checkAndAutoStop` tenant resolution is not scoped to the run's owner tenant

- **File:** `apps/web/server/services/runEngine.ts` (lines 72-78 in diff)
- **Issue:** The new DB query in `checkAndAutoStop` selects `teamRooms.tenantId` for the run's `roomId` with no additional filter. If `run.roomId` is correct this is safe, but `run` was fetched earlier in the function without a tenant guard (it comes from `getRun(runId)` which does not enforce tenant). The bridge removal is not the cause of this pre-existing pattern, but the diff introduces new code that assumes the un-tenant-checked `run` is authoritative.
- **Recommendation:** No immediate action required — this is a pre-existing pattern not introduced by this diff. Note it for a future hardening pass.

---

## Verdict

**NEEDS_CHANGES**

Two spec-required test files are absent (`test_python_removal_verification.py` and `runEngine.bridgeRemoval.test.ts`), and the `rate_limit.py` stub will cause `pytest -x` to abort at collection time due to the existing test file that imports it. The `tokenUsage` shape change should be verified against the Section 03 executor diff before merge.
