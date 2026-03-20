I now have enough context. Let me produce the section content.

# Section 01: Enable Skill Detection for Agent Turns

## Section ID
`section-01-skill-detection`

## Goal

Remove the early fallback to `team-discussion-assistant` when `origin !== "human_user"` in `roomIntentRouter.ts`. Instead, run actual skill detection for all message origins so that Team Room agent turns get language-appropriate, domain-matched skills -- exactly like Chat.

## Dependencies

- None (this section has no upstream dependencies)
- **Blocks:** section-03-skill-executor (which relies on `selectedSkillId` coming from real detection)

## Files

| File | Action |
|------|--------|
| `apps/web/server/services/roomIntentRouter.ts` | Modify |
| `apps/web/server/services/__tests__/roomIntentRouter.enhanced.test.ts` | Create |
| `apps/web/server/services/__tests__/roomIntentRouter.test.ts` | Update (adapt existing assertions) |

---

## Tests First

### New test file: `apps/web/server/services/__tests__/roomIntentRouter.enhanced.test.ts`

All tests mock `detectSkill` (from `../skillDetector`) and `classifyIntent` (from `../skillIntentClassifier`) using `vi.mock`. The tests verify routing logic, not detection accuracy.

```typescript
describe("routeRoomIntent -- assistant origin skill detection", () => {

  it("should call detectSkill for assistant origin messages", async () => {
    // Setup: mockDetectSkill returns a skill with confidence 0.75
    // Act: routeRoomIntent({ origin: "assistant", message: "เขียนบทความ..." })
    // Assert: detectSkill called once with the normalized message
    // Assert: decision.selectedSkillId matches the detected skill's id
    // Assert: decision.source === "skill-detect"
  });

  it("should return detected skill when confidence >= 0.6", async () => {
    // Setup: mockDetectSkill returns confidence 0.6 exactly
    // Act: routeRoomIntent({ origin: "assistant", message: "..." })
    // Assert: decision.route === "skill"
    // Assert: decision.selectedSkillId is the detected skill's id (NOT team-discussion-assistant)
    // Assert: decision.confidence === 0.6
  });

  it("should use language-appropriate fallback when confidence < 0.6 and message is Thai", async () => {
    // Setup: mockDetectSkill returns confidence 0.4 (below threshold)
    // Act: routeRoomIntent({ origin: "assistant", message: "สร้างเนื้อหาเกี่ยวกับ..." })
    // Assert: decision.route === "skill"
    // Assert: decision.selectedSkillId is NOT TEAM_DISCUSSION_SKILL_ID
    // Assert: decision.source === "fallback"
  });

  it("should use English fallback when confidence < 0.6 and message is English", async () => {
    // Setup: mockDetectSkill returns confidence 0.3
    // Act: routeRoomIntent({ origin: "assistant", message: "Write an article about..." })
    // Assert: decision.route === "skill"
    // Assert: decision.selectedSkillId is NOT TEAM_DISCUSSION_SKILL_ID
    // Assert: decision.source === "fallback"
  });

  it("should never return team-discussion-assistant as selectedSkillId", async () => {
    // Setup: mockDetectSkill returns detected: false
    // Act: routeRoomIntent({ origin: "assistant", message: "Continue the handoff." })
    // Assert: decision.selectedSkillId !== TEAM_DISCUSSION_SKILL_ID
  });

  it("should detect Thai-capable skill for Thai objective", async () => {
    // Setup: mockDetectSkill returns a Thai skill with confidence 0.8
    // Act: routeRoomIntent({ origin: "assistant", message: "ช่วยเขียนบทความเกี่ยวกับการเลี้ยงลูก" })
    // Assert: decision.selectedSkillId matches the Thai skill
    // Assert: decision.source === "skill-detect"
  });

  it("should still handle explicit agency signal for assistant origin", async () => {
    // Act: routeRoomIntent({ origin: "assistant", message: "escalate this multi-step task" })
    // Assert: decision.route === "agency"
    // Assert: decision.agencyEscalation === true
    // Assert: detectSkill NOT called (agency signal caught first)
  });

  it("should handle system origin the same as assistant", async () => {
    // Setup: mockDetectSkill returns a skill with confidence 0.7
    // Act: routeRoomIntent({ origin: "system", message: "Summarize the discussion" })
    // Assert: detectSkill called once
    // Assert: decision follows same skill-detect / fallback logic
  });

  it("should use 0.6 threshold for assistant vs 0.7 for human_user", async () => {
    // Setup: mockDetectSkill returns confidence 0.65
    // Test 1: origin: "assistant" -> should return detected skill (0.65 >= 0.6)
    // Test 2: origin: "human_user" -> should NOT return detected skill (0.65 < 0.7)
  });

});
```

### Existing test updates: `apps/web/server/services/__tests__/roomIntentRouter.test.ts`

The first test currently asserts:
- `mockDetectSkill` is NOT called for assistant origin
- `selectedSkillId` equals `TEAM_DISCUSSION_SKILL_ID`
- `reason` equals `"assistant_discussion_default"`

This test must be updated to match the new behavior:
- `mockDetectSkill` IS called for assistant origin
- When detection fails (mock returns no match), the fallback skill is used (NOT `team-discussion-assistant`)
- `reason` changes to reflect the new fallback logic
- `source` remains `"fallback"` but `selectedSkillId` changes

---

## Implementation Details

### Changes to `apps/web/server/services/roomIntentRouter.ts`

**Current state (lines 58-78):** The `if (input.origin !== "human_user")` block calls `detectSkill` and returns the match if confidence >= 0.6. If no match, it falls back to `TEAM_DISCUSSION_SKILL_ID`. The detection call is already present -- the only change needed is the fallback behavior.

**Required change:** Replace the fallback at lines 71-77 that returns `TEAM_DISCUSSION_SKILL_ID` with a language-aware fallback that returns a content-appropriate default skill.

#### Fallback Logic

When `detectSkill` returns no match or confidence < 0.6 for non-human origins:

1. Check if the message contains Thai characters using a simple regex (e.g., `/[\u0E00-\u0E7F]/`)
2. If Thai: use a Thai-capable general content skill ID (e.g., `"general-article-writer"` or whichever general skill handles Thai content in the skill registry)
3. If English/other: use `"general-article-writer"` or similar general content skill
4. The fallback skill ID should be a constant defined at the top of the file (e.g., `FALLBACK_CONTENT_SKILL_ID`), NOT imported from `internalSkills.ts`

#### Constants to Add

```typescript
const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;
const FALLBACK_CONTENT_SKILL_ID = "general-article-writer"; // or appropriate general skill
```

#### Import Changes

- The import of `TEAM_DISCUSSION_SKILL_ID` from `./internalSkills` can be removed from this file once the fallback no longer references it. However, if other code still imports it from here (unlikely -- check first), keep it but stop using it in the routing logic.

#### Updated Fallback Block (replaces lines 71-77)

The fallback `RoomIntentDecision` should look like:

```typescript
{
  route: "skill",
  reason: "assistant_content_fallback",
  selectedSkillId: FALLBACK_CONTENT_SKILL_ID,
  confidence: 0.5,
  source: "fallback",
}
```

Key differences from current fallback:
- `selectedSkillId` is a real content skill, not `team-discussion-assistant`
- `confidence` is 0.5 (not 0.8 -- it is a fallback, not a confident match)
- `reason` is `"assistant_content_fallback"` (not `"assistant_discussion_default"`)

#### Validation: Fallback Skill Must Exist

The fallback skill ID must correspond to an actual skill in the registry. Before finalizing the constant value, verify which general-purpose skills exist by checking:

```
apps/web/skills/
```

Look for a skill that:
- Has `category: "chat_assistant"` or `"prompt_enhancement"`
- Is language-agnostic or bilingual
- Has broad triggers (not domain-specific)

If no suitable general skill exists, the implementer should either:
1. Use the best available general skill
2. Create a minimal general-content skill as part of this section (unlikely needed)

---

## Behavioral Summary

| Origin | Detection Result | Before (current) | After (target) |
|--------|-----------------|-------------------|----------------|
| `assistant` | Skill found, confidence >= 0.6 | Returns detected skill | Returns detected skill (unchanged) |
| `assistant` | No skill or confidence < 0.6 | Returns `team-discussion-assistant` | Returns `FALLBACK_CONTENT_SKILL_ID` |
| `system` | Same as assistant | Same as assistant | Same as assistant |
| `human_user` | Skill found, confidence >= 0.7 | Returns detected skill | Returns detected skill (unchanged) |
| `human_user` | No skill | Falls through to classifier/chat | Falls through to classifier/chat (unchanged) |
| Any | Agency signal in message | Returns agency route | Returns agency route (unchanged) |

---

## Risks and Edge Cases

1. **Fallback skill not in registry**: If `FALLBACK_CONTENT_SKILL_ID` does not match any skill in the database, downstream code in `teamRunSkillExecutor.ts` will fail to load the skill. Mitigation: section-03 must handle "skill not found" gracefully. Additionally, add a startup validation in `skillRegistry.ts` initialization that checks the fallback skill exists and logs ERROR if missing:
```typescript
// In skillRegistry.ts initializeSkillRegistry() after loading skills:
const fallback = await getSkillByIdAsync(FALLBACK_CONTENT_SKILL_ID);
if (!fallback) logger.error(`[SkillRegistry] FALLBACK_CONTENT_SKILL_ID="${FALLBACK_CONTENT_SKILL_ID}" not found in registry — team room agent turns will fail`);
```

2. **Existing test breakage**: The existing `roomIntentRouter.test.ts` first test asserts `mockDetectSkill` is NOT called for assistant origin. However, the current source code at line 61 already calls `detectSkill` for assistant origins. This means the existing test is already failing or was written against an older version. The implementer should verify and update accordingly.

3. **No behavioral change to human_user path**: All human_user routing logic (lines 80-148) is completely untouched by this section.

---

## Verification

After implementation, run:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/roomIntentRouter
```

Expected: All tests in both `roomIntentRouter.test.ts` (updated) and `roomIntentRouter.enhanced.test.ts` (new) pass. No test references `TEAM_DISCUSSION_SKILL_ID` as an expected `selectedSkillId` for assistant-origin routing.

---

## Implementation Notes (Post-Implementation)

### Actual Changes Made

1. **`roomIntentRouter.ts`**: Replaced `TEAM_DISCUSSION_SKILL_ID` import with exported `FALLBACK_CONTENT_SKILL_ID = "general-article-writer"`. Changed fallback block to use new constant with confidence 0.5 and reason `"assistant_content_fallback"`.

2. **Code review fix**: `detectSkill` for assistant path now passes `input.conversationId` (was `undefined`), providing conversation context for better detection accuracy.

3. **`roomIntentRouter.enhanced.test.ts`** (NEW): 10 tests covering assistant/system origin detection, threshold boundaries (0.6 vs 0.7), agency escalation, fallback behavior.

4. **`roomIntentRouter.test.ts`** (UPDATED): First test updated to expect `assistant_content_fallback` reason, `detectSkill` being called, and `selectedSkillId !== TEAM_DISCUSSION_SKILL_ID`.

### Deferred to Section-03
- `general-article-writer` does not currently pass `isTeamRunEligibleSkill()` in `teamRunSkillExecutor.ts`. Section-03 refactors the executor to bypass this gate, making the router change effective end-to-end.

### Test Results
- 13/13 tests passing (3 existing + 10 new)