# Feature 051: Team Room Reuse Chat Pipeline

## Problem Statement

The Team Room orchestrator is fundamentally broken:
- **Agents loop endlessly** producing the same "Workflow Summary" repeatedly
- **Wrong language** — responds in English despite Thai objectives
- **Skill detection bypassed** — always falls back to generic `team-discussion-assistant`
- **Memory not used** — agents don't remember prior context
- **Persona not injected properly** — agent roles are ignored

Meanwhile, the **Chat page works perfectly** with the same types of tasks:
- Correct skill detection (bilingual, confidence-based)
- Memory injection (`buildChatContext`)
- Persona system (`resolvePersona`)
- Language handling (follows skill's language config)
- Produces actual deliverables, not meta-plans

## Root Cause

Team Room has a **separate execution pipeline** (`teamRunSkillExecutor.ts` → `teamOrchestrationBridge.ts` → Python `team_orchestrator.py`) that duplicates Chat's functionality poorly:

1. `roomIntentRouter.ts` skips skill detection for `origin !== "human_user"` → defaults to `team-discussion-assistant`
2. `team-discussion-assistant` has a generic English prompt that tells agents to "coordinate work" instead of producing deliverables
3. `formatPromptMessagesForAgent` flattens multi-turn history into a single text blob → LLM can't distinguish speakers
4. Python `team_orchestrator.py` adds its own system prompt that overrides persona/skill context
5. Memory service (`buildChatContext`) is never called for agent turns

## Proposed Solution

**Make Team Room agent turns use Chat's execution pipeline directly**, so that any feature added to Chat automatically works in Team Room.

### Core Principle
Chat and Team Room are essentially the same — an LLM responding to a prompt with context. The only difference is Team Room adds:
- **Turn management** — who speaks next (N agents instead of 1)
- **Work board** — work items, approvals, status tracking
- **Budget/stop policies** — auto-stop conditions

These orchestration features should wrap around Chat's execution, not replace it.

### Design

```
Current (broken):
  User objective → roomIntentRouter (skips detection) → team-discussion-assistant
  → flattenMessages → Python backend → generic LLM call → loop same output

Proposed:
  User objective → Chat's detectSkill() → matched skill (with language)
  → Chat's buildChatContext() (memory + persona)
  → Chat's LLM execution (skill prompt + multi-turn history)
  → store in teamRoomMessages
  → turnOrderEngine selects next agent → repeat
```

### What to Reuse from Chat
- `detectSkill()` from `skillDetector.ts` — skill matching with bilingual support
- `buildChatContext()` / `resolvePersona()` — memory and persona injection
- LLM call through `chat.ts` router's execution path (or extract shared function)
- Skill system prompt + language handling

### What to Keep from Team Room
- `turnOrderEngine.ts` — agent turn selection
- `runEngine.ts` — run lifecycle (start/pause/resume/stop), budget tracking, stop policies
- `workItemService.ts` — work item state machine
- `teamRoomMessages` table — separate from chat messages (different metadata needs)
- `TeamRoomView.tsx` — UI with board panel

### What to Remove/Replace
- `teamOrchestrationBridge.ts` — no longer needed (don't call Python for LLM)
- `teamRunSkillExecutor.ts` — replace with Chat pipeline wrapper
- Python `team_orchestrator.py` — only keep for tool-calling (MCP), not basic LLM
- `internalSkills.ts` `team-discussion-assistant` — no longer the default
- `formatPromptMessagesForAgent()` — replaced by proper multi-turn messages

## Key Requirements

1. **Skill detection** — Each agent turn must detect the right skill from the objective/context
2. **Language** — Response language must match the objective language (Thai → Thai, English → English)
3. **Memory** — Agent should have access to conversation memory (entity memories, facts)
4. **Persona** — Agent's persona (from `assistantProfiles` → `personaTemplates`) must be injected
5. **No looping** — Agent must see conversation history as multi-turn messages, not flat text
6. **Backward compatible** — Existing team rooms, runs, work items must still work
7. **Feature parity** — Any new Chat feature (new skill, memory improvement) should automatically work in Team Room

## Scope

### In Scope
- Refactor `teamRunSkillExecutor.ts` to use Chat's execution functions
- Extract shared LLM execution function from `chat.ts` router
- Wire skill detection, memory, persona into agent turn flow
- Ensure multi-turn history is preserved (not flattened)
- Keep all Team Room orchestration features (turns, board, budget, stops)

### Out of Scope (future work)
- Per-persona memory (agents remember individually) — can add later
- UI merge (combining Chat and Team Room views) — separate feature
- Real-time collaboration (multiple humans in team room) — exists but separate
- Agency builder integration — keep as-is

## Technical Context

### Existing Chat Flow (working, in `chat.ts` router)
1. `detectSkill(message)` → find matching skill
2. `resolvePersona(conversationId)` → get persona prompt
3. `buildChatContext(userId, conversationId)` → inject memories
4. Build messages array: [system prompt, persona, memories, history, user message]
5. Call LLM via `llmQueue` with proper model selection
6. Store response in `messages` table

### Existing Team Room Flow (broken, in `teamRunSkillExecutor.ts`)
1. `routeRoomIntent()` → always returns `team-discussion-assistant`
2. `composePrompt()` → builds messages (but they get flattened)
3. `executeSkillLlmWithFallback()` or `executeAgentTurn()` → LLM call
4. Store in `teamRoomMessages`
5. `turnOrderEngine.getNextSpeaker()` → select next agent
6. Repeat

### Database Tables
- `conversations` + `messages` — Chat (keep as-is)
- `teamRooms` + `teamRoomMessages` — Team Room (keep as-is)
- `teamRuns` — Run orchestration (keep as-is)
- `teamWorkItems` — Work board (keep as-is)
- `assistantProfiles` + `personaTemplates` — Shared persona system
- `entityMemories` — Shared memory system

## Success Criteria

1. Team Room agents respond in the correct language matching the objective
2. Team Room agents use detected skills (not just team-discussion-assistant)
3. Team Room agents don't loop with the same content
4. Team Room agents have memory context injected
5. Adding a new skill to Chat automatically makes it available in Team Room
6. Existing team rooms and runs continue to work (backward compatible)
7. All existing tests pass
