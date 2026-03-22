---
name: Team Room Skill Selection Architecture
description: Complete data flow from run startup through skill selection for each agent turn
type: project
---

# Research: Team Room Skill Selection Flow

**Date:** 2026-03-21
**Status:** COMPLETE
**Scope:** Full tracing of how team room orchestrator selects skills for agent turns

---

## Executive Summary

Team room skill selection follows a **SINGLE UNIFIED PATHWAY** from `runEngine.ts` → `routeRoomIntent()` → `executeTeamRunSkillTurn()`:

1. **No persona-specific skill routing** — Personas provide context (systemPromptPrefix, tone) but do NOT affect which skill is selected
2. **No team/room configuration influence** — Team and room schemas have NO skill-related fields
3. **Skill selection is INTENT-DRIVEN** — Based solely on the message content via `detectSkill()` + confidence thresholds
4. **Fallback is hardcoded** — When confidence < 0.6 (assistant) or < 0.7 (human), always uses `"general-article-writer"`
5. **No language awareness** — The flow ignores `assistant.preferredLanguage` when routing to skills

### Key Decision Points:

| Point | Input | Decision | Owner |
|-------|-------|----------|-------|
| **Route Selection** | Message content | Chat vs Skill vs Agency | `roomIntentRouter.ts:37` |
| **Skill Detection** | Message + skill registry | Matched skill ID | `skillDetector.ts:60` |
| **Skill Execution** | Selected skill + objective | LLM system prompt | `teamRunSkillExecutor.ts:70` |
| **Confidence Threshold** | Skill detection score | Use detected vs fallback | `roomIntentRouter.ts:64, 83` |
| **Persona Integration** | Assistant context | System prompt injection | `runEngine.ts:372` |

---

## Complete Data Flow Diagram

```
START: Team Run Initiated
    │
    └──> runEngine.ts:startRun()
         ├─ Creates teamRuns record (status: "running")
         ├─ Creates kickoff workItem + message
         ├─ queueAutoAdvance() [if auto_team mode]
         └─> startAutoStopChecker()

    ┌─ LOOP: Auto-Advance Timer fires
    │
    ├──> runEngine.ts:advanceRun(runId, tenantId, maxTurns)
    │    └──> runEngine.ts:runNextTurn(runId, tenantId)
    │
    │    ┌─ RESOLVE: Who is speaking?
    │    │
    │    ├──> resolveCurrentAssistantId(db, run)
    │    │    └─ If run.activeAssistantId exists, use it
    │    │    └─ Else: getCoordinatorProfile(assistants) → highest priority
    │    │
    │    ├──> resolveAssistantTurnContext(db, assistantId)
    │    │    ├─ Load assistantProfiles row
    │    │    ├─ LEFT JOIN personaTemplates (via assistantProfiles.personaId)
    │    │    └─ LEFT JOIN agencyAgents (via assistantProfiles.agencyAgentId)
    │    │       Returns: { profile, personaName, personaPrompt, agentInstructions, agentModel }
    │    │
    │    ├──> buildPersonaContext(assistantContext)
    │    │    └─ Concatenate: displayName, roleTitle, personaName, memberRole,
    │    │                    preferredLanguage, specialtyTags, agentInstructions
    │    │       ⚠️ NOTE: personaContext IS USED IN LLM PROMPT, but does NOT affect skill selection
    │    │
    │    ┌─ ROUTE: What should this turn do?
    │    │
    │    └──> routeRoomIntent(message, origin: "assistant", context: "run_turn")
    │         │
    │         ├─ Input: run.objective (the message)
    │         ├─ Input: origin = "assistant" (key!)
    │         ├─ Input: context = "run_turn" (key!)
    │         │
    │         ├─ Check 1: Empty message? → route: "chat"
    │         ├─ Check 2: Agency signal regex? → route: "agency" + agencyEscalation
    │         │
    │         ├─ Check 3: [IF origin NOT "human_user"] ← TEAM RUN TAKES THIS PATH
    │         │    └──> detectSkill(message, conversationId=undefined, skillSettings=undefined, userId=undefined)
    │         │         │
    │         │         ├─ Confidence >= 0.6?
    │         │         │  └─ YES: return { route: "skill", selectedSkillId, confidence, source: "skill-detect" }
    │         │         │  └─ NO: return { route: "skill", selectedSkillId: FALLBACK, confidence: 0.5, source: "fallback" }
    │         │         │
    │         │         └─ FALLBACK_CONTENT_SKILL_ID = "general-article-writer" (hardcoded)
    │         │
    │         ├─ Check 4: Task/length signals → classifyIntent() [for human_user path]
    │         ├─ Check 5: Chat signal regex → route: "chat"
    │         ├─ Default: route: "chat"
    │         │
    │         └─ RETURNS: RoomIntentDecision
    │            { route, reason, selectedSkillId?, confidence, source }
    │
    │    ┌─ EXECUTE: Run the selected skill
    │    │
    │    └──> executeTeamRunSkillTurn(input)
    │         │
    │         ├─ Input.route.selectedSkillId from routeRoomIntent()
    │         ├─ Input.assistantContext.personaContext (built above)
    │         │
    │         ├──> resolveTeamRunSkill(selectedSkillId)
    │         │    ├─ If selectedSkillId: getSkillByIdAsync(selectedSkillId)
    │         │    ├─ Fallback: getSkillByIdAsync("general-article-writer")
    │         │    └─ Throws if neither resolves
    │         │
    │         ├──> resolveSkillExecutionPolicy(skill, conversationModel)
    │         │    └─ Determines LLM model for skill execution
    │         │
    │         ├──> runPlanner() [task planning middleware]
    │         │
    │         ├──> composePrompt(assistantId, runId, roomId, teamId, objective, tenantId)
    │         │    └─ Loads room messages, context, work items
    │         │    └─ Prepares LLM conversation history
    │         │
    │         ├──> buildLLMMessages()
    │         │    ├─ skill.systemPrompt (if exists)
    │         │    ├─ composed.messages (room context)
    │         │    └─ ⚠️ personaContext INJECTED HERE as additional system context
    │         │
    │         └──> executeSkillLlmWithFallback(messages, skillSlug, executionPolicy)
    │              └─ Calls LLM, handles fallback providers
    │
    │    ┌─ POST: Save turn result
    │    │
    │    ├──> roomService.postWorkUpdate(content, messageType: "work_update")
    │    │    └─ Saves message to teamRoomMessages
    │    │    └─ Includes: messageId, tokenUsageJson, metadataJson
    │    │
    │    ├──> getNextSpeaker(currentAssistantId, strategy, nextSpeakerHint)
    │    │    ├─ Inputs: turnStrategy (from execution mode: lead_directed, handoff, etc.)
    │    │    ├─ Inputs: nextSpeakerHint (parsed from LLM response [NEXT: name])
    │    │    ├─ Checks: consecutive turn limits, loop detection
    │    │    └─ Returns: nextAssistantId + reason
    │    │
    │    ├──> Update teamRuns.activeAssistantId = nextSpeaker.nextAssistantId
    │    ├──> Update teamRuns.budgetSnapshotJson (accumulated costs)
    │    │
    │    ├──> recordEvent(agentActivityEvents, eventType: "agent_turn")
    │    └──> publishEvent(createEvent("agent_turn_completed", ...))
    │
    │    ┌─ LOOP DECISION: Should we continue?
    │    │
    │    ├──> checkAndAutoStop(runId)
    │    │    ├─ Evaluates stopPolicy conditions
    │    │    ├─ If shouldStop: stopRun(runId, reason)
    │    │    │  └─ generateSummary() [if requireFinalSummary=true]
    │    │    └─ Returns: StopEvaluation
    │    │
    │    ├──> evaluateAutoTeamLoopDecision(runStatus, openWorkItems, shouldStop)
    │    │    ├─ Check: Are there assistant-actionable work items?
    │    │    ├─ Check: Are we waiting for human approval? → pauseRun()
    │    │    ├─ Check: Are we waiting for external member? → pauseRun()
    │    │    └─ Returns: continueLoop=true/false
    │    │
    │    ├─ IF continueLoop:
    │    │  └──> queueAutoAdvance(runId, tenantId, maxTurns=1, delayMs=200ms)
    │    │       └─ setTimeout → next iteration of this flow
    │    │
    │    └─ ELSE: Run ends (status: stopped/completed/paused)
    │
    └─ END: Run completion event published


```

---

## Skill Selection Logic Deep Dive

### Path 1: Skill Detection (routeRoomIntent.ts:60-80)

**ONLY taken when:** `origin !== "human_user"` (i.e., assistant or system turn)

```typescript
// assistantDetection = await detectSkill(message, undefined, undefined, undefined)
//   ↑ All skill filter params are undefined!
//   ↑ So detection uses GLOBAL enabled skills only (enabledByDefault=true)

if (assistantDetection.detected && assistantDetection.confidence >= 0.6) {
  // HIGH CONFIDENCE: Use the detected skill
  return {
    route: "skill",
    reason: `assistant_skill_match:${skill.id}`,
    selectedSkillId: assistantDetection.skill.id,
    confidence: assistantDetection.confidence,
    source: "skill-detect",
  };
}

// LOW CONFIDENCE or NO MATCH: Always fallback
return {
  route: "skill",
  reason: "assistant_content_fallback",
  selectedSkillId: FALLBACK_CONTENT_SKILL_ID,  // "general-article-writer"
  confidence: 0.5,
  source: "fallback",
};
```

**What `detectSkill()` does (skillDetector.ts:60):**

1. **Get available skills**: `getAvailableSkills()` → from skill registry (sorted by priority)
2. **Determine enabled skills** (since conversationId=undefined):
   ```typescript
   enabledSkillIds = new Set(
     skills.filter((s) => s.enabledByDefault).map((s) => s.id)
   );
   ```
   → **ONLY skills with `enabledByDefault: true`** are even considered
3. **For each enabled skill**, check trigger regex patterns:
   ```typescript
   for (const skill of skills) {
     if (!enabledSkillIds.has(skill.id)) continue;  // Skip if not enabled
     for (const trigger of skill.triggers) {
       const match = message.match(trigger.regex);
       if (match) {
         confidence = calculateConfidence(message, match[0], skill);
         return { detected: true, skill, confidence, matchedTrigger: match[0] };
       }
     }
   }
   return { detected: false, skill: null, confidence: 0 };
   ```

**Inputs to detectSkill():**
- `message` = `run.objective ?? room.goalPrompt ?? ""`
- `conversationId` = `undefined` (NO conversation context)
- `skillSettings` = `undefined` (NO skill preferences)
- `userId` = `undefined` (NO user visibility filtering)

⚠️ **IMPLICATION:** Team runs **cannot use conversation-specific skill preferences**. Skills detected are ONLY from globally enabled defaults.

### Path 2: Skill Resolution (teamRunSkillExecutor.ts:54-68)

```typescript
async function resolveTeamRunSkill(selectedSkillId?: string): Promise<SkillDefinition> {
  // Step 1: Try to load the selected skill
  if (selectedSkillId) {
    const selected = await getSkillByIdAsync(selectedSkillId);
    if (selected) {
      return selected;  // Found it!
    }
  }

  // Step 2: Fallback to general article writer
  const fallback = await getSkillByIdAsync(GENERAL_FALLBACK_SKILL_ID);
  if (fallback) {
    return fallback;
  }

  // Step 3: No skill found (database error or missing skill)
  throw new Error(`No skill resolved for team run: tried ${selectedSkillId ?? "(none)"} and fallback ${GENERAL_FALLBACK_SKILL_ID}`);
}
```

---

## Where Persona Influences (and Where It Doesn't)

### ✅ Persona IS Used For:

1. **System Prompt Context** (runEngine.ts:372-388)
   ```typescript
   function buildPersonaContext(row: assistantTurnContext): string | undefined {
     return sections.join("\n");  // Display name, role, persona name, etc.
   }

   // Then in executeTeamRunSkillTurn:
   messages.push({ role: "system", content: skill.systemPrompt });
   // ... other messages ...
   // personaContext is part of the composed prompt to LLM
   ```
   → Persona shapes **HOW** the skill responds, not **WHICH** skill is selected

2. **Preferred Model Selection** (runEngine.ts:73)
   ```typescript
   const conversationModel = input.assistantContext.profile.preferredModelId
     ?? input.assistantContext.agentModel ?? undefined;
   ```
   → Uses `assistantProfiles.preferredModelId` to choose the LLM

3. **Specialty Tags** (for context only)
   ```typescript
   row.profile.specialtyTags?.length ? `Specialties: ${row.profile.specialtyTags.join(", ")}` : null
   ```

### ❌ Persona is NOT Used For:

1. **Skill Detection** — `detectSkill()` is called with `userId=undefined`, so:
   - No access to `assistantProfiles.id`
   - No access to `personaTemplates.id`
   - No filtering by user-visible skills

2. **Skill Selection Routing** — `routeRoomIntent()` has NO persona parameter

3. **Room/Team Configuration** — Neither `teamRooms` nor `teamRoomParticipants` has skill-related fields

4. **Language Awareness** — `assistantProfiles.preferredLanguage` is injected into persona context but DOES NOT affect:
   - Which skill is selected
   - Skill trigger patterns
   - Skill registry filtering

---

## Database Schema Analysis

### assistantProfiles
```sql
┌─ personaId (FK → personaTemplates)
├─ agencyAgentId (FK → agencyAgents)
├─ preferredModelId (varchar)
├─ preferredLanguage (varchar)
├─ memberRole (enum: orchestrator, specialist, reviewer, approver, facilitator)
├─ specialtyTags (text[])
├─ roleTitle, displayName, nickname
└─ NO SKILL FIELDS
```

### personaTemplates
```sql
┌─ systemPromptPrefix (text)  ← Used as context
├─ tone (enum: formal, casual, friendly, technical, creative)
├─ language (varchar, default: "auto")
├─ sourceTemplateIds (text[])
├─ restrictions (text[])
└─ NO SKILL FIELDS
```

### teamRooms
```sql
┌─ teamId, goalPrompt, description
├─ lastRunId, status, visibility
└─ NO SKILL FIELDS
```

### teamRoomParticipants
```sql
┌─ roomId (FK → teamRooms)
├─ participantAssistantId (FK → assistantProfiles)
├─ joinedAt, lastViewedAt
└─ NO SKILL FIELDS
```

---

## Critical Findings & Gaps

### Gap 1: No Conversation Context in Team Runs

**Current:**
```typescript
// In routeRoomIntent (teamRunSkillExecutor context):
const assistantDetection = await detectSkill(
  normalized,
  input.conversationId,  // ← UNDEFINED
  undefined,             // ← UNDEFINED
  input.userId           // ← UNDEFINED
);
```

**Impact:**
- Team runs **cannot use conversation-specific skill preferences** (e.g., "in this conversation, always use skill X")
- Team runs **cannot use user-specific skill visibility** (e.g., custom skills the user has access to)
- Only **globally enabled default skills** are considered

**Fix Required:** Pass `conversationId` or `teamId` + `runId` to `detectSkill()` for room-specific preferences

---

### Gap 2: No Language-Aware Skill Detection

**Current:**
- `assistantProfiles.preferredLanguage` is loaded but ONLY injected as context text
- Skill detection doesn't filter or weight skills by language compatibility
- Skill triggers are language-agnostic (e.g., `/draft` works in any language)

**Impact:**
- A Thai-speaking agent will still trigger English-named skills (e.g., "image-prompt-engineer")
- Output persona context includes "Preferred language: Thai" but skills are selected ignoring this

**Fix Required:**
1. Add language parameter to `detectSkill(language?: string)`
2. Add `supportsLanguages: string[]` to `SkillDefinition`
3. Filter/weight skills based on language compatibility

---

### Gap 3: No Skill Eligibility Filter for Team Runs

**Current:**
- `skillRegistry.ts` loads skills but has NO concept of "team run eligible"
- Some skills marked as `internalOnly` (filtered out in `getAvailableSkills()`)
- But no other eligibility gates

**Impact:**
- A skill requiring `supportsStructuredOutputs` could be assigned to an LLM that doesn't support it
- Skills with `maxRuntimeSeconds` constraint have no check before team turn assignment

**Fix Required:**
1. Add `teamRunEligible: boolean` field to skills schema
2. Filter `detectSkill()` by eligibility
3. Or: Implement eligibility check in `resolveTeamRunSkill()`

---

### Gap 4: Confidence Thresholds are Asymmetric

**Current:**
```typescript
// For assistant turns (team runs):
if (assistantDetection.confidence >= 0.6) { ... } else { fallback }

// For human turns (in roomIntentRouter):
if (detection.confidence >= 0.7) { ... } else { fallback }
// THEN:
if (shouldClassify) { classifyIntent() } // adds extra layer
```

**Impact:**
- Assistant turns use **lower confidence** (0.6) → more aggressive skill selection
- Human turns have **higher confidence** (0.7) + intent classifier → more conservative

**Why:** Assistants are guided by objective; humans are exploratory. But code doesn't document this.

---

### Gap 5: No Skill Selection Audit Trail

**Current:**
- `metadataJson` in `teamRoomMessages` records: `{ routeReason, selectedSkillId, llmModelId, ... }`
- But NO record of:
  - Confidence score of selected skill
  - Competing skills (why was skill X rejected?)
  - Trigger pattern that matched

**Impact:**
- User cannot debug why a skill was selected
- No analytics on skill coverage/accuracy

**Fix Required:**
```typescript
metadataJson: {
  skillSelection: {
    selectedSkillId,
    confidence,
    source: "skill-detect" | "fallback",
    competingSkills?: [{ id, confidence, matchedTrigger }],
    triggerMatched: matchedTrigger,
  }
}
```

---

## Recommendation: Improvements to Skill Selection

### Phase 1 (Urgent): Add Language Awareness
1. Pass `assistant.preferredLanguage` to `detectSkill()`
2. Filter skills or weight confidence by language compatibility
3. Test with Thai-speaking agents

### Phase 2 (High): Add Conversation/Room Context
1. Pass `runId` to `detectSkill()` to enable room-specific preferences
2. Implement `teamRunSkillPreferences` table (optional, per-room skill overrides)
3. Test with multi-run scenarios

### Phase 3 (Medium): Eligibility Filtering
1. Add `teamRunEligible` boolean to skills schema
2. Filter in `resolveTeamRunSkill()` before assignment
3. Add LLM capability checks (model requirements → provider filtering)

### Phase 4 (Low): Audit Trail
1. Enhance `metadataJson` with full skill selection details
2. Add UI in team room to show "Why this skill was selected"
3. Analytics on skill selection accuracy

---

## Files to Monitor

- `apps/web/server/services/runEngine.ts` — Turn execution loop
- `apps/web/server/services/roomIntentRouter.ts` — Routing decisions
- `apps/web/server/services/skillDetector.ts` — Skill matching algorithm
- `apps/web/server/services/teamRunSkillExecutor.ts` — Skill execution
- `apps/web/server/services/skillRegistry.ts` — Skill loading
- `apps/web/server/services/turnOrderEngine.ts` — Next speaker selection
- `apps/web/drizzle/schema.ts` — `assistantProfiles`, `personaTemplates`, `teamRooms`

---

## Testing Guidance

Test scenarios for skill selection gaps:

1. **Language Switch Test:**
   - Create Thai-speaking agent
   - Trigger skill with Thai prompt
   - Verify: Does it use Thai-compatible skill or English fallback?

2. **Preference Conflict Test:**
   - Set agent preferredLanguage="th", skill triggers in English
   - Does intent router favor detected skill or fallback?

3. **Confidence Threshold Test:**
   - Craft message with 0.65 confidence match
   - Assistant turn: Should select (threshold 0.6)
   - Human turn: Should fallback (threshold 0.7)

4. **Multi-Run Preference Test:**
   - Run 1 requests Skill A
   - Run 2 requests Skill B
   - Do they use same skill registry or maintain separate preferences?

---

## References

- Team Room Background Execution: See TEAM-ROOM-BACKGROUND-EXECUTION-RESEARCH-BRIEF.md
- Chat Memory System: See CHAT-MEMORY-SYSTEM-RESEARCH.md
- Skill System Inventory: See SKILL-SYSTEM-COMPREHENSIVE-RESEARCH.md
