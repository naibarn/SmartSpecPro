## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| CRITICAL | `teamRunSkillExecutor.ts:70` | `general-article-writer` is not `teamRunEligible` and is not `internalOnly` nor `type: "chat-assistant"`. `isTeamRunEligibleSkill()` will return `false` for it, causing `resolveTeamRunSkill` to silently fall back to `TEAM_DISCUSSION_SKILL_ID` at execution time — the exact behaviour this change aims to eliminate. The router returns the right skill ID but the executor ignores it. | Add `teamRunEligible: true` to `general-article-writer/skill.md`, or extend `isTeamRunEligibleSkill` to accept `article_generation` category, or both. |
| CRITICAL | `roomIntentRouter.ts:61` | `detectSkill` is called with `conversationId: undefined` for assistant/system turns. The human-user path passes `input.conversationId` (line 80). Conversation context — which contains the agent's objective, prior turns, and role context — is the primary signal for assistant-turn routing. Dropping it means the detector is operating on the raw objective text with no memory of what role this agent is playing. | Pass `input.conversationId` on the assistant path: `detectSkill(normalized, input.conversationId, undefined, input.userId)`. |
| IMPORTANT | `roomIntentRouter.ts:3` | `FALLBACK_CONTENT_SKILL_ID` is a bare string literal that bypasses the deletion guard in `internalSkills.ts`. If the skill is ever renamed or disabled, the fallback silently routes to a non-existent skill ID. `getSkillByIdAsync` will return `null`, and `resolveTeamRunSkill` will then fall back to `TEAM_DISCUSSION_SKILL_ID` (line 75) anyway — recreating the old behavior without any visible error. | Add a startup / test-time assertion that `general-article-writer` exists, or import the constant from a shared skills manifest. At minimum, add a comment cross-referencing `teamRunSkillExecutor.ts:isTeamRunEligibleSkill`. |
| IMPORTANT | `roomIntentRouter.enhanced.test.ts:161-171` | The agency-signal test for assistant origin (`"escalate this multi-step task"`) does not mock `detectSkill`. The test asserts `mockDetectSkill` was not called, which is correct — agency check runs before skill detection. But the test passes trivially: because `AGENCY_SIGNAL_RE` fires, the function returns before reaching the `detectSkill` call. The test's assertion of `route === "agency"` is sound, but the comment `expect(mockDetectSkill).not.toHaveBeenCalled()` would also pass if the mock was simply broken/never set up. The structural guarantee is fine; the assertion is vacuously safe rather than actively protective. | Not blocking, but the test could document WHY detectSkill is not called: add a comment referencing the early-exit agency guard at line 47-56 of the source. |
| IMPORTANT | `roomIntentRouter.enhanced.test.ts:87-106` | The fallback test ("confidence < 0.6, Thai message") asserts `selectedSkillId` is not `team-discussion-assistant` and `source === "fallback"`, but it does not assert that `selectedSkillId === FALLBACK_CONTENT_SKILL_ID`. A future change that substitutes a different fallback skill (e.g., a Thai-specific writer) would not be caught by this test. The same gap exists in test at line 108-127. | Add `expect(decision.selectedSkillId).toBe("general-article-writer")` to both fallback tests. |
| IMPORTANT | `roomIntentRouter.ts:60-78` | The agency-signal check (line 48) fires before the `origin !== "human_user"` block, so agency escalation correctly bypasses skill detection. However, the `CHAT_SIGNAL_RE` and default-chat fallback at lines 133-147 are only reachable by the `human_user` path. If an assistant sends a pure greeting ("สวัสดี"), it will be routed to `general-article-writer` via the content fallback. This is a semantic mismatch: greetings from agents are now billed as article-generation turns. The original `team-discussion-assistant` had a `type: "chat-assistant"` and `executionMode: "llm-only"` that fit this conversational case. | Add a lightweight check for `CHAT_SIGNAL_RE` before the skill-detection block for non-human-user origins, routing those to `chat` or to a lightweight chat skill instead of `general-article-writer`. |
| SUGGESTION | `roomIntentRouter.ts:65` | `reason` encodes the skill ID: `` `assistant_skill_match:${assistantDetection.skill.id}` ``. The `reason` field is used for audit/logging. Embedding a dynamic skill ID in what is otherwise a static enum-like field makes log aggregation harder (each skill produces a unique reason string). | Consider a static `reason: "assistant_skill_detected"` and include the skill ID in a separate field, or at least document that the `reason` field is intentionally dynamic here. |
| SUGGESTION | `roomIntentRouter.enhanced.test.ts:194-221` | The "0.6 vs 0.7 threshold" test is the most valuable behavioural contract test in the file. It correctly verifies the asymmetric threshold. However it would be strengthened by also asserting what `humanDecision.selectedSkillId` actually IS (not just that it is not `general-article-writer`), demonstrating the human path falls through to chat/classifier correctly. | Add `expect(humanDecision.route).toBe("chat")` or verify the classifier path. |
| NITPICK | `roomIntentRouter.ts:3` | `const FALLBACK_CONTENT_SKILL_ID` is declared at module scope without `export`. This makes it invisible to tests that might want to assert the fallback value without hardcoding the string. | Export the constant so tests and consumers can reference it symbolically. |
| NITPICK | `roomIntentRouter.enhanced.test.ts:46-48` | Mock skill `{ id: "business-article-writer" }` cast as `any` — a non-existent skill ID. Tests that use fabricated skill IDs cannot catch real-world errors where `skillRegistry.getSkillByIdAsync` returns `null` for that ID. Low risk since the router only passes the ID through; but noteworthy for completeness. | Use an existing real skill ID (e.g., `"general-article-writer"`) in at least one test to verify the full detection-to-routing contract. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `routeRoomIntent` return shape unchanged | PASS | `RoomIntentDecision` interface untouched; all returned objects satisfy it |
| `TEAM_DISCUSSION_SKILL_ID` no longer returned by router | PASS | Both test files assert `selectedSkillId !== TEAM_DISCUSSION_SKILL_ID` |
| `detectSkill` called for non-human-user origin | PASS | New code calls `detectSkill` before fallback; existing test updated to assert `toHaveBeenCalledTimes(1)` |
| `TEAM_DISCUSSION_SKILL_ID` import removed from `roomIntentRouter.ts` | PASS | Import dropped; constant replaced by local `FALLBACK_CONTENT_SKILL_ID` |
| `teamRunSkillExecutor.resolveTeamRunSkill` eligibility gate | FAIL | `general-article-writer` does not pass `isTeamRunEligibleSkill()` — see CRITICAL finding above |
| `general-article-writer` skill exists on disk | PASS | Confirmed at `apps/web/skills/general-article-writer/skill.md` |
| Auth / tenant isolation | N/A | Router is a pure routing function; no auth surface |
| Confidence threshold for assistant path (0.6) is lower than human path (0.7) | PASS | Threshold difference is correct and tested |

---

### Summary

The core routing logic change is correct and purposeful: assistant/system origin messages now go through real skill detection before falling back to a content skill, which is a meaningful improvement over the blanket `team-discussion-assistant` default. The test suite is well-structured, covers the threshold boundary, and explicitly guards against regression to the old behavior.

There are two CRITICAL blocking issues. First, `general-article-writer` lacks the `teamRunEligible: true` flag required by `teamRunSkillExecutor.isTeamRunEligibleSkill` — the executor will silently fall back to `TEAM_DISCUSSION_SKILL_ID` at runtime, making the router change a no-op in practice. Second, the assistant-turn call to `detectSkill` drops `conversationId`, stripping the agent's role context from skill detection and reducing match quality. Both must be fixed before merge.
