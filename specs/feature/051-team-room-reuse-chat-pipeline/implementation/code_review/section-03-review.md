# Section 03 Code Review

## Summary

The core executor refactor is well-executed. All four deprecated symbols are gone (`teamOrchestrationBridge`, `TEAM_DISCUSSION_SKILL_ID`, `formatPromptMessagesForAgent`, `isTeamRunEligibleSkill`). `costCredits` is correctly derived from `calculateCreditsForLLMDynamic`. The `nextSpeakerHint` parser strips the token from content and surfaces it as a top-level field. The `advance` procedure is rate-limited as required. Tests are substantive and cover the key spec scenarios.

There are two issues requiring changes: one HIGH (significant scope creep — Spec 049 escalation job bundled into this diff) and one MEDIUM (the `[NEXT:]` regex anchors to end-of-string only, which diverges from the spec's non-anchored pattern and may miss hints appended with trailing whitespace in edge cases). Several low-priority observations follow.

---

## Findings

### [HIGH] Scope creep — Spec 049 escalation job bundled into section-03 diff

- **Files:** `apps/web/server/jobs/escalationJob.ts`, `apps/web/server/jobs/notificationJobs.ts`, `apps/web/server/jobs/__tests__/escalationJob.test.ts`, `apps/web/server/jobs/__tests__/notificationJobs.test.ts`, `apps/web/server/_core/index.ts` (the `initializeNotificationJobs` hunk)
- **Issue:** These five file changes belong to Spec 049 Section-06 (Phase 5 Escalation Job), not to Spec 051 Section-03 (Skill Executor Refactor). The section-03 spec has no mention of escalation jobs or notification orchestration. Bundling unrelated Spec 049 work makes the diff impossible to review accurately against the section-03 spec, contaminates the git history of this feature, and means that Spec 049's escalation job is merged under a section-03 review that does not have the Spec 049 Section-06 review criteria applied. The escalation job content also has previously-identified tenant isolation issues (from the Spec 049 Section-06 review on 2026-03-21) that have not been resolved in this diff.
- **Recommendation:** Split the escalation job changes into a separate PR/commit against Spec 049 and apply the Section-06 review criteria before merging. Section-03 diff should contain only: `teamRunSkillExecutor.ts`, `teamRunSkillExecutor.test.ts`, and `teamRun.ts`.

### [MEDIUM] `parseNextSpeakerHint` regex anchors to end-of-string only; spec pattern does not anchor

- **File:** `apps/web/server/services/teamRunSkillExecutor.ts`
- **Line:** ~37 (the `parseNextSpeakerHint` function)
- **Issue:** The implementation uses `/\s*\[NEXT:\s*([^\]]+)\]\s*$/i` — the `$` anchor means only a `[NEXT:]` token appearing at the very end of the content (after optional trailing whitespace) is matched. The spec's reference pattern is `/\[NEXT:\s*([^\]]+)\]/i` with no anchor. This divergence has two practical consequences: (1) a hint followed by a newline character that is not caught by `\s*` before `$` would silently be missed; (2) if the LLM ever places `[NEXT: X]` mid-content (the spec says "at the end" but does not enforce it in the regex), the hint is lost. Additionally, the test at line 913 expects `result.content` to equal `"Great analysis of the topic."` after stripping `" [NEXT: Content Director]"`, which works with the current implementation but would fail silently if the LLM adds a trailing newline.
- **Recommendation:** Either match the spec's unanchored pattern and strip the first occurrence (safest for spec compliance), or document the intentional end-anchor constraint with a comment explaining the deliberate tightening.

### [LOW] `creditsUsed: 0` still hardcoded in `recordStepAttempt` call

- **File:** `apps/web/server/services/teamRunSkillExecutor.ts`
- **Line:** ~128 (the `recordStepAttempt` call)
- **Issue:** The diff changes `creditsUsed: fallback.totalDurationMs ? 0 : 0` to `creditsUsed: 0`. This is a cleanup of dead code but the value is still hardcoded `0`. The `recordStepAttempt` signature accepts `creditsUsed?: number` and would benefit from receiving the actual `costCredits` value calculated two lines later. Since `recordStepAttempt` fires inside the planner guard (`if (plannerResult)`), the calculated `costCredits` is available in scope.
- **Recommendation:** Move the `calculateCreditsForLLMDynamic` call above the `recordStepAttempt` call and pass `creditsUsed: costCredits`. This gives the task planner accurate cost data. If ordering is a concern, the `calculateCreditsForLLMDynamic` call can run concurrently alongside `recordStepAttempt` using `Promise.all`.

### [LOW] `teamRunStartProcedure` defined at module scope but only used for one procedure

- **File:** `apps/web/server/routers/teamRun.ts`
- **Line:** ~10 (the `teamRunStartProcedure` constant)
- **Issue:** The `start` procedure uses a module-scoped `teamRunStartProcedure` variable (10 req/hr per IP), while `advance` inlines `.use(createRateLimitMiddleware(...))` directly on the procedure. This is inconsistent — the spec showed both as inline `.use()` calls. Not a correctness issue but makes the module style uneven.
- **Recommendation:** Either inline the `start` rate limit (matching the `advance` style) or name both as module-scoped constants for symmetry.

### [LOW] `route` enum narrowing removes `"agency"` but `runEngine.ts` callers may still pass it

- **File:** `apps/web/server/services/teamRunSkillExecutor.ts`
- **Line:** ~27 (the `route` field type in `TeamRunSkillExecutionInput`)
- **Issue:** The diff changes `route: "chat" | "skill" | "agency"` to `route: "chat" | "skill"`. This is correct per the spec, but if `runEngine.ts` or any other caller still constructs the input with `route: "agency"`, TypeScript will now catch it at compile time (correct) but only if both files are type-checked together. The spec's section-04 (remove Python) is responsible for deleting the agency route from `runEngine.ts`, so this could cause a transient type error until section-04 lands.
- **Recommendation:** Note in the PR description that this change will produce a TypeScript error in `runEngine.ts` until section-04 is merged. The compile-time enforcement is desired behavior — just ensure CI does not gate a green build on section-03 alone before section-04 is merged.

### [LOW] `isLlmStyleSkill` removal is implicit — no negative test for its absence

- **File:** `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`
- **Issue:** The "no Python dependency" describe block checks for absence of `teamOrchestrationBridge`, `TEAM_DISCUSSION_SKILL_ID`, and `formatPromptMessagesForAgent` by reading the source file. It does not check for absence of `isLlmStyleSkill` or `isTeamRunEligibleSkill`. This is minor since these are internal helpers, but adding them to the source-scan tests would be complete.
- **Recommendation:** Add `expect(source).not.toContain("isLlmStyleSkill")` and `expect(source).not.toContain("isTeamRunEligibleSkill")` to the no-Python-dependency describe block.

---

## Contract Compliance

| Check | Status |
|---|---|
| `teamOrchestrationBridge` import removed | PASS — confirmed absent from `teamRunSkillExecutor.ts` |
| `TEAM_DISCUSSION_SKILL_ID` import removed | PASS — confirmed absent |
| `formatPromptMessagesForAgent` removed | PASS — confirmed absent |
| `isTeamRunEligibleSkill` removed | PASS — confirmed absent |
| `isLlmStyleSkill` removed | PASS — confirmed absent |
| `costCredits` not hardcoded 0 | PASS — `calculateCreditsForLLMDynamic(inputTokens, outputTokens, modelId)` used |
| `calculateCreditsForLLMDynamic` exists in `creditService.ts` | PASS — verified at line 719 |
| `nextSpeakerHint` parsed and stripped from content | PASS — `parseNextSpeakerHint` implemented and tested |
| `nextSpeakerHint` returned as top-level field | PASS — present in result interface and return statement |
| `nextSpeakerHint` also placed in `metadata` | PASS — `metadata.nextSpeakerHint` set |
| Multi-turn messages passed as array (not flattened string) | PASS — loop over `composed.messages` preserves roles |
| Skill `systemPrompt` prepended as first system message | PASS |
| `advance` procedure added to `teamRun.ts` | PASS |
| `advance` procedure rate-limited | PASS — `limit: 30, windowMs: 60_000` |
| `start` procedure rate-limited | PASS — `limit: 10, windowMs: 60 * 60_000` (hourly cap) |
| `requireTenantId` helper uses correct `resolveTenantIdVarchar` signature | PASS — `resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId)` matches 2-arg signature |
| `getRoom` call in `start` verifies room belongs to tenant | PASS — tenant-scoped lookup |
| `GENERAL_FALLBACK_SKILL_ID = "general-article-writer"` | PASS — matches spec constant |
| Test: `costCredits` not hardcoded to 0 | PASS — asserts `result.costCredits === 42`, not 0 |
| Test: `calculateCreditsForLLMDynamic` called with `(500, 300, "gpt-4o")` | PASS |
| Test: `nextSpeakerHint` parsed from content | PASS |
| Test: `nextSpeakerHint` absent when no hint | PASS |
| Test: no Python bridge source scan | PASS |
| Scope creep (Spec 049 escalation job in diff) | FAIL — see HIGH finding |

---

## Verdict

NEEDS_CHANGES

The executor refactor itself is correct and complete. The single blocking issue is the bundled Spec 049 escalation job content, which must be separated before this diff can be merged as a section-03 review. The MEDIUM regex anchoring issue should also be addressed. Once the Spec 049 content is extracted and the regex is aligned with the spec pattern, this section can be approved.
