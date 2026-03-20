## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `drizzle/0105_stop_legacy_team_runs.sql:9` | **`queued` status omitted from migration**: `team_run_status` enum includes `"queued"` (schema.ts line 6260). Queued legacy runs are left in an orphaned state — they will never start under the new pipeline but are not stopped. The SQL only targets `'running'` and `'paused'`. | Add `'queued'` to the `IN` list: `WHERE status IN ('running', 'paused', 'queued')`. The startup guard in `runEngine.ts` has the same gap — add `"queued"` to the `inArray` call at line 1304. |
| HIGH | `drizzle/0105_stop_legacy_team_runs.sql` (whole file) | **SQL migration does not guard `stopReason IS NULL`**: The startup guard in `recoverActiveRunsOnStartup()` correctly adds `stopReason IS NULL` to avoid re-stopping runs that were already explicitly stopped with a reason. The SQL migration has no equivalent guard. If a DBA runs the migration twice (e.g., during a rollback-and-redeploy), it will overwrite a legitimate `stopReason` on any genuinely running post-migration run that happens to have `startedAt < NOW() - 5 minutes`. | Add `AND "stopReason" IS NULL` to the SQL `WHERE` clause to match the startup guard's semantics. |
| HIGH | `server/services/__tests__/runEngine.migration.test.ts` (entire file) | **`recoverActiveRunsOnStartup()` startup guard is never tested**: The plan explicitly requires tests that verify the startup guard behavior (plan TDD stubs: "should set running runs to stopped", "should log count of affected runs", etc.). The implemented test file only reads the SQL migration file from disk and parses its text content — it never imports or calls `recoverActiveRunsOnStartup()`. The six plan-required test cases covering the Node.js path are entirely absent. | Mock `getDb()` to return a chainable Drizzle-shaped mock (the mock infrastructure is already in the file). Import `recoverActiveRunsOnStartup` from `runEngine`. Add at least: (1) verifies `update.set.where` is called with `status IN ['running','paused']` and `stopReason IS NULL`; (2) verifies `console.log` fires with the count when matches > 0; (3) verifies the function does NOT call `update` when no runs are affected. |
| MEDIUM | `drizzle/0105_stop_legacy_team_runs.sql` vs plan | **Migration numbered `0105` but plan specifies `0103`**: The plan's "File Summary" table lists `apps/web/drizzle/0103_stop_legacy_team_runs.sql` and section 5 instructs the implementer to verify the current max migration number before choosing the prefix. The implementation used `0105`, which is the correct next number given the current journal state (max is `0104`). However, the test in `runEngine.migration.test.ts` at line 124 asserts `entry.version === "7"` but does not assert the `idx` value. This is fine in isolation, but the journal file now has `0103_calm_vermin` and `0104_mean_power_man` occupying the slots the plan reserved for earlier sections. The discrepancy between plan text and actual file name is a maintenance hazard: if someone references the plan to locate the SQL file they will search for `0103_stop_legacy_team_runs.sql` and not find it. | No code change required. Add a comment to the plan or a note in the SQL file header clarifying the actual file name differs from the plan's example. Low-risk as the journal entry is consistent and the migration will apply correctly. |
| MEDIUM | `server/services/__tests__/runEngine.migration.test.ts:116-128` | **Journal test asserts `version: "7"` but not `idx: 105`**: The journal entry test only checks that the tag exists and the version string is `"7"`. It does not assert `idx === 105`, which is the field drizzle-kit uses to order migration execution. If the journal entry were added with a wrong `idx` (e.g., colliding with an existing entry), the test would still pass. The idx collision risk is real: the plan warned about migration number conflicts in the Round 3 verdict. | Add `expect(entry.idx).toBe(105)` to the journal entry test. |
| MEDIUM | `server/services/__tests__/runEngine.test.ts` (new tests added in diff) | **`deriveInitialWorkItemTitle`, `evaluateAutoTeamLoopDecision`, and `shouldContinueAutoTeamLoop` tests added to `runEngine.test.ts` but are out of scope for section-05**: Section-05's plan says to modify `runEngine.test.ts` only to remove the `formatPromptMessagesForAgent` test (already done). These new pure-function tests are coverage additions for existing behavior that were not in the section-05 plan. They are not harmful but represent scope creep and should have been in an earlier section. | Accept as-is (tests improve coverage and cause no harm). Flag in PR description as unplanned additions from section-05. |
| MEDIUM | `NotificationPreferencesPanel.tsx`, `NotificationPreferencesPanel.test.tsx`, `AdminAlertRules.tsx` (entire diffs) | **Scope creep — Spec 049 frontend fixes bundled into Spec 051 section-05 diff**: Three files entirely unrelated to the team-room pipeline migration are included: the feature-flag gate for `NotificationPreferencesPanel` (Spec 049 section-07 HIGH finding), the `AlertRuleFormDialog` / `EscalationPolicyFormDialog` conditional-render fix (Spec 049 section-07 HIGH finding), and the `form.watch` → `form.getValues` fix. None of these are referenced anywhere in the section-05 plan. | These fixes are individually correct and address previously flagged HIGH findings. Move them to a dedicated Spec 049 follow-up PR rather than bundling them here. If they must stay in this branch, acknowledge them explicitly in the PR description. |
| LOW | `server/services/__tests__/runEngine.migration.test.ts:7-10` | **Unused mock variables `mockSet`, `mockWhere`, `mockFrom`**: These are declared with `vi.fn()` but never attached to the mock return value (`getDb` returns `{ update: mockUpdate, select: mockSelect }`) and never referenced in any assertion. | Remove the three unused declarations to avoid confusion about what is actually being verified. |
| LOW | `server/services/runEngine.ts:1312` | **`console.log` used instead of structured logger for production observability**: The existing startup recovery function already uses `console.log` (lines 1330, 1342), but the coding conventions in CLAUDE.md require `logger.*` for production code. | Either use the existing structured logger if one is imported, or accept as-is given the surrounding code uses the same pattern. Raise as a housekeeping item. |
| LOW | `server/services/__tests__/internalSkills.cleanup.test.ts:23-27` | **`TEAM_DISCUSSION_SKILL_ID` absence verified by reading source file text**: The test reads the `.ts` file from disk and asserts the string is absent. This is correct and thorough. However it will break if the file is moved or renamed. | Low risk; acceptable pattern for this class of cleanup verification test. No change needed. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `TEAM_DISCUSSION_SKILL_ID` removed from `internalSkills.ts` | PASS | Constant and all associated objects deleted. File matches plan spec exactly. |
| `getInternalSkillDefinitions()` returns `[]` | PASS | Verified in source and tests. |
| `isInternalSkillId()` always returns `false` | PASS | Correct. `_skillId` parameter unused as expected. |
| `formatPromptMessagesForAgent` removed from `runEngine.ts` | PASS | Function deleted. Import of `PromptMessage` type also cleaned up. |
| `TEAM_DISCUSSION_SKILL_ID` import removed from `roomIntentRouter.ts` | PASS | Replaced with `FALLBACK_CONTENT_SKILL_ID = "general-article-writer"`. |
| `TEAM_DISCUSSION_SKILL_ID` reference in `roomIntentRouter.test.ts` updated | PASS | Now imports `FALLBACK_CONTENT_SKILL_ID` from `roomIntentRouter` and asserts positive equality rather than negative assertion. This is a stronger check. |
| `teamOrchestrationBridge` removed from `runEngine.ts` | PASS | Grep confirms zero occurrences in production code. Source tests verify absence. |
| `teamRunSkillExecutor.ts` has no dead references | PASS | Grep confirms no `TEAM_DISCUSSION_SKILL_ID`, `teamOrchestrationBridge`, or `formatPromptMessagesForAgent` in the file. |
| SQL migration `0105_stop_legacy_team_runs.sql` targets `running` and `paused` | PASS (partial) | Correct statuses targeted; `queued` status missing (see HIGH finding). |
| SQL migration includes 5-minute time-bound guard | PASS | `AND "startedAt" < NOW() - INTERVAL '5 minutes'` present. |
| Journal entry added for migration | PASS | `idx: 105`, `tag: "0105_stop_legacy_team_runs"` in `_journal.json`. |
| Startup guard in `recoverActiveRunsOnStartup()` implemented | PASS (partial) | Guard present and correct for `running`/`paused`; missing `queued` status (see HIGH finding). |
| `skillRegistry.ts` call to `getInternalSkillDefinitions()` still works | PASS | Call is now a no-op returning `[]`; no breakage. Plan noted this was optional to remove. |

---

### Summary

The core cleanup work is correctly implemented: `TEAM_DISCUSSION_SKILL_ID` and the `team-discussion-assistant` skill are fully removed, `formatPromptMessagesForAgent` is deleted, the bridge import is gone, and the SQL migration with its dual safety net (SQL + startup guard) is in place. Three issues require fixes before merge: the `queued` run status is omitted from both the SQL migration and the startup guard, leaving orphaned queued legacy runs in the database; the SQL migration is missing the `stopReason IS NULL` guard present in the Node.js startup equivalent; and the migration test file never actually exercises `recoverActiveRunsOnStartup()` — it only text-parses the SQL file, leaving the Node.js safety net untested. The bundled Spec 049 frontend changes are individually correct but should not be in this diff.

---

### Required Actions Before Merge

1. Add `'queued'` to the SQL `WHERE status IN (...)` clause and to the `inArray` call in `recoverActiveRunsOnStartup()`.
2. Add `AND "stopReason" IS NULL` to the SQL migration's `WHERE` clause.
3. Add tests that actually call `recoverActiveRunsOnStartup()` against the mocked DB and assert on the update call arguments and log output.
