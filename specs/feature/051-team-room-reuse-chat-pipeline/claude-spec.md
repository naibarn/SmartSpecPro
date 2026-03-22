# Specification: Team Room Reuse Chat Pipeline

## Overview

Refactor Team Room's agent turn execution to reuse Chat's proven execution pipeline (skill detection, memory, persona, language) instead of maintaining a separate, broken pipeline. This ensures any Chat improvement automatically benefits Team Room.

## Problem

Team Room agents:
1. Loop endlessly producing identical "Workflow Summary" content
2. Respond in English despite Thai objectives
3. Skip skill detection — always use generic `team-discussion-assistant`
4. Don't use entity memory (global user facts)
5. Use simplified persona (only `systemPromptPrefix`, missing tone/style/gender particles)
6. Flatten conversation history into a single text blob — LLM can't distinguish speakers

Chat handles all of these correctly with the same types of tasks.

## Solution

### Core Change

Replace Team Room's separate execution pipeline with a thin wrapper around Chat's functions:

```
BEFORE (broken):
  objective → roomIntentRouter (skips) → team-discussion-assistant
  → flattenMessages → Python backend → generic LLM → loop

AFTER (reuse Chat):
  objective → detectSkill() [from Chat] → matched skill (with language)
  → buildPersonaPromptSegments() [from Chat] → full persona with Thai particles
  → getEntityMemories() [from Chat] → global user facts
  → composePrompt() [enhanced] → multi-turn messages with token budgets
  → executeSkillLlmWithFallback() [existing] → LLM call
  → store in teamRoomMessages → turnOrderEngine → next agent
```

### What Gets Removed
- `teamOrchestrationBridge.ts` — Python bridge for LLM calls
- `team_orchestrator.py` (Python) — execute-turn endpoint entirely
- `team_orchestrator_api.py` execute-turn route — no longer needed
- `internalSkills.ts` `team-discussion-assistant` — replaced by detected skills
- `formatPromptMessagesForAgent()` — replaced by proper multi-turn messages

### What Gets Modified
- **`roomIntentRouter.ts`** — Enable skill detection for all origins (not just human_user)
- **`composePrompt.ts`** — Add `buildPersonaPromptSegments()`, `getEntityMemories()`, and proper multi-turn history with display names
- **`teamRunSkillExecutor.ts`** — Use detected skill's prompt, pass multi-turn messages directly (not flattened)
- **`runEngine.ts`** — Remove references to Python bridge

### What Stays Unchanged
- `turnOrderEngine.ts` — Agent selection logic
- `runEngine.ts` — Run lifecycle (start/pause/resume/stop), budget, stop policies
- `workItemService.ts` — Work item state machine
- `teamRoomMessages` table — Message storage
- `TeamRoomView.tsx` — UI with board panel
- `executeSkillLlmWithFallback()` — LLM execution wrapper

## Detailed Requirements

### 1. Skill Detection for Agent Turns

**Current:** `roomIntentRouter.ts` line 58: `if (input.origin !== "human_user")` → skip detection, return `team-discussion-assistant`

**Change:** Call `detectSkill(objective)` for ALL origins. Use detected skill's system prompt for the LLM call. If no skill detected with sufficient confidence, fall back to a sensible default (e.g., `general-article-writer` or similar content skill).

**Acceptance:** Running a team with Thai objective detects a Thai-capable skill (e.g., `parenting-article-writer`, `lifestyle-article-writer`).

### 2. Full Persona Resolution

**Current:** `composePrompt.ts` only uses `persona.systemPromptPrefix`

**Change:** Call `buildPersonaPromptSegments(persona)` to get:
- `prefix` — full [PERSONA START]...[PERSONA END] block
- `styleInstructions` — tone, nickname, Thai gender particles (ค่ะ/คะ/ครับ)
- `restrictionsBulletPoints` — persona restrictions

Include ALL three in the system prompt section.

**Acceptance:** Thai persona responses include appropriate gender particles and respect persona restrictions.

### 3. Entity Memory Injection

**Current:** `composePrompt.ts` only uses scoped memory (`retrieveForPrompt`)

**Change:** Also call `getEntityMemories(userId, null, personaId)` to inject global user facts (top 10 by reinforcement count). Merge with scoped memories within the MEMORY_BUDGET.

**Acceptance:** Agent responses reference facts the user has taught the system in Chat.

### 4. Multi-Turn Message Structure

**Current:** History is flattened via `formatPromptMessagesForAgent()` into a single user message

**Change:** Pass `composePrompt()` output directly as multi-turn messages array:
- System messages: persona, team context, objective, memories
- Assistant messages: previous agent responses (prefixed with `[Agent Name]`)
- User messages: human user inputs

**Acceptance:** LLM receives proper `[{role: "system", content: ...}, {role: "assistant", content: "[Content Director] ..."}]` — not a wall of text.

### 5. Language Handling

**Current:** Generic English prompt regardless of objective language

**Change:** Detected skill handles language natively (skill definitions include language config). Additionally, `buildPersonaPromptSegments` adds Thai particles when persona has Thai gender setting.

**Acceptance:** Thai objective → Thai responses. English objective → English responses.

### 6. Remove Python Backend for LLM

**Current:** `teamOrchestrationBridge.ts` calls Python `/api/team-orchestrator/execute-turn`

**Change:** Remove this bridge entirely. All LLM calls go through Node.js `executeSkillLlmWithFallback()` → `executeWithFallback()`.

Also remove:
- `python-backend/app/api/team_orchestrator_api.py` execute-turn endpoint
- `python-backend/app/services/team_orchestrator.py`
- Rate limiter dependency added for execute-turn

Keep `generate-summary` endpoint if it's used elsewhere.

**Acceptance:** No Python backend calls for agent turn execution. Python backend process not required for Team Room to function.

### 7. Backward Compatibility

**Approach:** Reset — old runs are cleared, no migration needed.

- Existing `teamRooms` and `teamRoomMessages` are preserved (read-only)
- Old `teamRuns` with status "running" or "paused" are set to "stopped"
- No data migration — new runs use the new pipeline automatically

### 8. No Agent Looping

**Root causes addressed:**
1. History as multi-turn → LLM sees what others said → doesn't repeat
2. Detected skill prompt → produces deliverables, not meta-plans
3. Display names in history prefix → LLM distinguishes speakers
4. `checkAndAutoStop()` fixed to pass tenantId (already done)

**Acceptance:** Running 3 turns produces 3 DIFFERENT responses with progressive content.

## Files Affected

### Remove
- `apps/web/server/services/teamOrchestrationBridge.ts`
- `python-backend/app/services/team_orchestrator.py`
- `python-backend/app/api/team_orchestrator_api.py` (execute-turn route only, keep generate-summary)
- `python-backend/app/core/rate_limit.py` (was only for execute-turn)
- `python-backend/tests/unit/core/test_rate_limit.py`

### Modify
- `apps/web/server/services/roomIntentRouter.ts` — enable skill detection for assistant origins
- `apps/web/server/services/promptComposer.ts` — add persona segments, entity memory, display name prefix
- `apps/web/server/services/teamRunSkillExecutor.ts` — use detected skill prompt, pass multi-turn messages
- `apps/web/server/services/runEngine.ts` — remove Python bridge references, clean up
- `apps/web/server/services/internalSkills.ts` — remove or deprecate team-discussion-assistant

### Add
- `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts` — new tests
- `apps/web/server/services/__tests__/promptComposer.test.ts` — new tests
- Migration script to stop old running runs

## Success Criteria

1. Team Room agents respond in the correct language matching objective
2. Agents use detected skills (not team-discussion-assistant)
3. Agents don't loop — 3 turns produce 3 different progressive responses
4. Entity memory is injected — agents reference user's known facts
5. Full persona with Thai particles and style instructions
6. Adding a new skill to Chat automatically works in Team Room
7. Python backend not called for LLM in Team Room
8. All existing tests pass + new tests for modified code
