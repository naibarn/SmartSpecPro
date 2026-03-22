---
name: project_051_team_room_chat_pipeline
description: Feature 051 plan review — Team Room Reuse Chat Pipeline. Pre-implementation quality gate findings.
type: project
---

# Feature 051 — Team Room Reuse Chat Pipeline Plan Review

**Why:** Feature fixes broken Team Room (looping, wrong language, skips skill detection, no entity memory, flattened history). Plan refactors Team Room to reuse Chat's pipeline.

**How to apply:** When reviewing section implementations, check the HIGH findings below as the first pass — they are blocking issues that will cause compile errors or broken behavior if not addressed before coding begins.

## Verdict: NEEDS_REVISION before implementation

## Blocking Issues (2 empty section files)

- `section-02-prompt-composer.md` — file contains only 1 line of internal agent reasoning. No tests, no implementation guidance. This is the CORE section — all of section-03 depends on it.
- `section-04-remove-python.md` — file contains only 1 line of internal agent reasoning. No tests, no implementation guidance. The Python removal is described in claude-plan.md only.

## Key Technical Facts (from codebase)

- `roomIntentRouter.ts` already calls `detectSkill` for non-human_user origins (lines 60-78). The spec says it "skips detection" but the code has partial detection. The ONLY change needed is the fallback — replace `TEAM_DISCUSSION_SKILL_ID` fallback with `FALLBACK_CONTENT_SKILL_ID`. Section-01 correctly identifies this.
- `promptComposer.ts` already has multi-turn history with display names (lines 241-248). The spec's "flattened to single text blob" diagnosis is partially wrong. It's already multi-turn. The missing pieces are: `buildPersonaPromptSegments` (full persona) and `getEntityMemories` (entity memory).
- `teamRunSkillExecutor.ts` line 228: `costCredits: 0` — the LLM path NEVER deducts credits. This is a pre-existing bug. Section-03 collapses all paths to the LLM path, which means after the refactor ALL turns will return `costCredits: 0`. The plan does not mention this.
- `runEngine.ts` line 1198: uses `teamOrchestrationBridge.generateSummary` dynamically for the `requireFinalSummary` stop policy. Section-04 removes the bridge file but section-05 does not address what happens to this stop policy path.
- `TeamRunSkillExecutionResult` does NOT include `nextSpeakerHint`. But `runEngine.ts` reads `turnResponse.nextSpeakerHint` at lines 958, 975. This field comes from the agency/Python path (which returns it). After removing that path, `nextSpeakerHint` will always be `undefined`. Intentional or gap?
- Existing test `roomIntentRouter.test.ts` line 40: `expect(mockDetectSkill).not.toHaveBeenCalled()` — this test is ALREADY WRONG against the current live code (which DOES call detectSkill for assistant origin). Section-01 correctly flags this.
- `section-06-testing.md` line 45: the fallback test still asserts `TEAM_DISCUSSION_SKILL_ID` as expected result. This contradicts the section-01 and section-05 goal of removing that skill.
- `isTeamRunEligibleSkill()` in `teamRunSkillExecutor.ts` currently BLOCKS detected skills from being used (line 70: `if (selected && isTeamRunEligibleSkill(selected)) return selected` — most detected skills will fail this check and fall back to team-discussion anyway). Section-03 correctly removes this gating function.

## Migration SQL Numbering

Section-05 creates `0103_stop_legacy_team_runs.sql`. At review time the journal should be checked — the next available number may differ.

---

## Section-06 Review — Verdict: APPROVE_WITH_FIXES (2026-03-21)

3 HIGH, 2 MEDIUM, 2 LOW findings. Review file: `specs/feature/051-team-room-reuse-chat-pipeline/implementation/code_review/section-06-review.md`

**Core problem:** `teamRunIntegration.test.ts` mocks `promptComposer` — making it a unit test disguised as an integration test. The plan explicitly required this test to mock only DB and external services while letting internal wiring run.

**HIGH findings:**
- `promptComposer` is mocked in `teamRunIntegration.test.ts` — this is an internal section-02 component, not an external boundary. Fix: replace with DB/service mocks (`getDb`, `buildPersonaPromptSegments`, `getEntityMemories`, `retrieveForPrompt`).
- Entity memory injection cross-section path not tested — the plan required mocking `getEntityMemories` with `[{fact: "..."}]` and asserting that content appears in the messages sent to LLM.
- Multi-turn history continuity not tested — the plan required running `executeTeamRunSkillTurn` twice with the first turn's message in room history, then asserting the second LLM call includes the first turn.

**MEDIUM findings:**
- Unsafe `callArgs[0] as any` then `.messages ?? callArgs[0]` fallback — silently passes if call signature changes.
- `if (Array.isArray(msgs))` conditional guard makes the multi-turn assertion optional — remove the guard.

**What passes:** `teamRunSkillExecutor.test.ts` is well-structured. Source-file negative assertions (no bridge import, no `TEAM_DISCUSSION_SKILL_ID`) are a strong regression guard. Skill resolution fallback chain, `nextSpeakerHint` parsing, and credit calculation all tested correctly.
