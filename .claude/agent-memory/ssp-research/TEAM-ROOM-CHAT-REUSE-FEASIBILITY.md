---
name: Team Room vs Chat System Reusability Analysis
description: Feasibility assessment of reusing Chat infrastructure for Team Room instead of separate orchestration system
type: project
---

# Research Brief: Reusing Chat System for Team Room

**Date:** 2026-03-21
**Status:** FEASIBILITY ASSESSED — Partial reuse viable, some Team Room functionality cannot be absorbed into Chat

---

## Findings

### Overall Verdict
**PARTIALLY FEASIBLE** — Can reuse Chat's skill detection + language + memory handling, but Team Room's orchestration requirements (multi-agent coordination, work item state machine, agent turn ordering) are fundamentally incompatible with Chat's single-turn LLM model. A hybrid approach is recommended: keep Chat-like message flow with skill detection, but maintain separate orchestration engine.

---

## Current Architecture Comparison

### Chat System (WORKING WELL)
- **Frontend:** `ChatView.tsx` (single-panel, message stream + input box)
- **Backend Router:** `chat.ts` (21 procedures, focused on conversation CRUD + LLM streaming)
- **Service Layer:** `chatService.ts` (111 lines, DB operations only)
- **Message Flow:**
  1. User sends message → `chat.sendMessage` tRPC procedure
  2. Skill detection happens via `detectSkill()`
  3. Memory loaded via `buildChatContext()` (includes entity memories, summaries, persona system prompt)
  4. Message sent to LLM provider (single turn)
  5. Response streamed to client, stored in `messages` table
- **Database:** `conversations` (user's chat sessions) + `messages` (single table, no threading)
- **Skill Detection:** `skillDetector.ts` — language-aware, multi-provider model detection
- **Language Support:** Full bilingual (English + Thai) via i18n system
- **Persona System:** Loaded in `buildChatContext()`, prepended to system prompt
- **Memory:** `entityMemories` table (facts linked to userId + personaId + entityType)

**Strengths:**
- ✅ Skill detection works (confidence scoring, keyword matching, model selection)
- ✅ Language detection works (Thai keywords, bilingual triggers)
- ✅ Memory system works (entity extraction, reinforcement count)
- ✅ Persona system works (system prompt injection)
- ✅ Clean separation: message → LLM → response
- ✅ No complex state management

### Team Room System (BROKEN)
- **Frontend:** `TeamRoomView.tsx` (1250 lines, complex: messages + work board + agent status)
- **Backend Routers:**
  - `teamRoom.ts` (6 procedures: create, get, viewerState, sendMessage, markViewed, listByTeam, getMessages)
  - `teamRun.ts` (8 procedures: start, pause, resume, advance, stop, get, etc.)
  - `teamWorkItem.ts` (work item state machine)
- **Service Layer:**
  - `runEngine.ts` (1200+ lines, multi-agent orchestration, turn ordering, stop policies)
  - `roomService.ts` (message persistence to separate `teamRoomMessages` table)
  - `turnOrderEngine.ts` (agent selection logic)
- **Message Flow:**
  1. User sends message → `teamRoom.sendMessage`
  2. Intent routing via `roomIntentRouter.ts` (decides: chat vs skill vs agency)
  3. **Room message persisted to `teamRoomMessages` table** (separate from Chat's `messages`)
  4. Run engine processes message on next turn
  5. Agent selected by `turnOrderEngine`
  6. Agent prompt constructed, sent to LLM
  7. Response persisted to `teamRoomMessages`
- **Database:**
  - `teamRooms` (session-like, but durable, linked to Team + Agency)
  - `teamRoomMessages` (message history with `metadataJson` for threading, work items, citations)
  - `teamRuns` (orchestration state, stop policy, budget tracking)
  - `assistantProfiles` (agents in the room)
  - `teamWorkItems` (parallel task state machine: planned → research → in_review → awaiting_approval → completed)
- **Skill Detection:** Uses same `detectSkill()` from Chat, but routed differently
- **Agent Turn Ordering:** Custom `turnOrderEngine` (not relevant to Chat)
- **Multi-Agent Coordination:** `roomIntentRouter` decides whether human message goes to skill or stays in room for agent discussion

**Problems:**
- ❌ Agents loop endlessly (wrong turn ordering logic)
- ❌ Language detection broken (agents responding in wrong language)
- ❌ Skills not being called (skill detection happens but routing fails)
- ❌ Over-engineered: 1200+ lines in `runEngine` for orchestration that could be simpler

---

## Shared Components (Can Reuse)

### ✅ Database Tables (Chat can adopt)
| Component | Chat Table | Team Room Table | Reuse? |
|-----------|-----------|---|---|
| Messages | `messages` (single-purpose) | `teamRoomMessages` (metadata-rich) | **YES** — Use Team Room schema, backward-compatible |
| Conversations | `conversations` | `teamRooms` | **PARTIAL** — Room is richer (agency link, run lifecycle) |
| Intent Routing | (none) | `roomIntentRouter` output stored in `metadataJson` | **YES** — Store intent detection results for audit |

**Recommendation:** Migrate Chat to use `teamRoomMessages` schema (or compatible superset) to standardize message storage.

### ✅ Skill Detection (`skillDetector.ts`)
- **Used by:** Both Chat and Team Room
- **Language-aware:** Thai keyword matching, bilingual triggers
- **Confidence scoring:** Proper signal weighting
- **Status:** Working, language detection is correct
- **Can reuse:** YES, directly

### ✅ Memory System (`chatService.ts` + `entityMemories` table)
- **Entity types:** user, project, preference, technical, decision, plan, architecture, component, task, code_knowledge, rule
- **Reinforcement:** `reinforcementCount` tracks repeated facts
- **Persona-scoped:** Memories can be persona-specific (linked via `personaId`)
- **Can reuse:** YES, no changes needed
- **Team Room can use:** Yes, by querying `entityMemories` for userId + current persona

### ✅ Persona System
- **Stored:** `personaTemplates` table (or loaded from user profile)
- **Built in:** `buildChatContext()` calls `resolvePersona()` + `buildPersonaPromptSegments()`
- **Language:** Persona instructions are bilingual (Thai + English)
- **Can reuse:** YES, currently working in Chat
- **Team Room can use:** Yes, call `buildChatContext()` for agent turn

### ✅ i18n System
- **Locales:** Thai (th) + English (en)
- **Used by:** `ChatView.tsx` uses `t("chat.x")` keys
- **Team Room:** Already using `t("orchestrator.room.x")` keys
- **Can reuse:** YES, already does

---

## Cannot Reuse (Team Room Specific)

### ❌ Multi-Agent Orchestration (`runEngine.ts`)
- **What it does:** Manages agent turn order, stop policies, budget tracking
- **Why unique:** Chat never needs to decide which agent speaks next (Chat = user + LLM)
- **Team Room needs:** Multi-agent state machine (Agent A → Agent B → User → Agent A)
- **Cannot merge:** LLM has no awareness of agent identity; would need to redesign LLM prompt injection

### ❌ Work Item State Machine (`teamWorkItem.ts`)
- **What it does:** Manages workflow: planned → research → in_review → awaiting_approval → completed
- **Why unique:** Chat has no parallel task tracking
- **Can keep separate:** Work items are orthogonal to message flow
- **Note:** Team Room frontend renders work items in side panel, but messages drive the state transitions

### ❌ Intent Router for Room (`roomIntentRouter.ts`)
- **What it does:** Routes human messages to "chat", "skill", or "agency" execution paths
- **Differs from Chat:** Chat just detects skill + executes; Room must decide routing (e.g., "is this a team discussion or a skill call?")
- **Example:** Thai message "ทำให้ฉันร่างบทความ" = "help me draft an article"
  - In **Chat:** Detected as skill → direct execution
  - In **Team Room:** Detected as task → room puts it on work items for agents to coordinate
- **Note:** Actually, this routing seems duplicative. Could simplify.

---

## Proposed Hybrid Approach

### Option 1: "Chat + Board" (Recommended)
Modify Team Room to use Chat's message infrastructure + skill detection, but keep separate orchestration for agent coordination.

**Structure:**
```
Team Room UI
├── Left: Message panel (like Chat, but multi-agent messages)
│   ├── Uses same skill detection as Chat
│   ├── Uses same memory system as Chat
│   ├── Stores in teamRoomMessages (not messages table)
│   └── Messages tagged with sender (user/agent/system)
├── Right: Work board panel
│   ├── Work items (list, kanban, or timeline)
│   ├── Agent status/availability
│   └── Run controls (pause/resume/stop)
└── Backend:
    ├── Message handling: Chat-like (detectSkill + store)
    ├── Agent orchestration: Keep runEngine (turn ordering, stop policies)
    └── Work items: Keep teamWorkItem service
```

**Changes to Chat:**
1. Add language detection during skill detection (already works, confirm it's being called)
2. Export `detectSkill()` + `buildChatContext()` as reusable utilities (already done)
3. No database migration needed (Chat uses `messages`, Room uses `teamRoomMessages`)

**Changes to Team Room:**
1. Replace broken agent loop with correct turn ordering (fix in `runEngine.ts`, not replace it)
2. Call skill detection + memory system when agents generate responses
3. Keep work item state machine as-is (it's working)
4. Ensure language is consistent (pass locale to skill detection, already supported)

**Blocked Errors to Fix:**
- Agents not respecting language setting → add `language` parameter to agent turn function
- Agents not calling skills → ensure `roomIntentRouter` is called, not skipped
- Agent looping → fix turn ordering (check `turnOrderEngine.getNextSpeaker()`)

**Code Changes Required:**
- `runEngine.ts`: Add language awareness to agent prompt construction
- `roomIntentRouter.ts`: Ensure it's called for all agent turns (not just user messages)
- `skillExecutor.ts`: Already language-aware; confirm it's being called from runEngine

**Risk:** Medium — requires debugging why agents loop + skills aren't called. But no architectural merge needed.

---

## Risks

### Risk 1: Skill Detection Not Being Called in Room
- **Probability:** HIGH (it's working in Chat, must be routing issue in Room)
- **Impact:** HIGH (agents can't perform tasks)
- **Mitigation:** Add logging to `roomIntentRouter` to verify it's called on every agent turn, not just user messages

### Risk 2: Language Detection Lost in Agent Turns
- **Probability:** MEDIUM (Chat detects language, but Room agents may regenerate without it)
- **Impact:** HIGH (wrong-language responses)
- **Mitigation:** Pass `locale` from room to agent turn function, ensure skill detection receives it

### Risk 3: Memory System Not Used in Room
- **Probability:** MEDIUM (memory system works, but agents may not call `buildChatContext()`)
- **Impact:** MEDIUM (agents lose user context)
- **Mitigation:** Have agents call `buildChatContext()` when generating responses, same as Chat

### Risk 4: Persona System Ignored
- **Probability:** MEDIUM (persona works in Chat, agents may not apply it)
- **Impact:** MEDIUM (personality inconsistency)
- **Mitigation:** Pass `personaId` to agent turn function, call `buildChatContext()` to inject persona

### Risk 5: Agent Orchestration Cannot Be Simplified
- **Probability:** LOW (Turn ordering is complex, but separate from skill detection)
- **Impact:** MEDIUM (won't fix the loop bug, will need careful debugging)
- **Mitigation:** Don't try to reuse Chat router; focus on reusing skill/memory/persona layers

---

## Open Questions

1. **Why are agents looping?** Is the turn ordering returning the same agent repeatedly, or is there a state bug?
2. **Why is skill detection not triggering in Room?** Is `roomIntentRouter` being skipped, or is detection confidence too low?
3. **What is `intentRoute` in `teamRoomMessages.metadataJson`?** Should it always be "chat" or "skill"? If "chat", agents can't call skills.
4. **Can we merge `conversations` + `teamRooms` into a single table?** Or keep separate because Room needs agency + run lifecycle?
5. **Is language currently being passed to LLM model selection in Room?** Or do agents ignore user's language preference?

---

## Implementation Path (If Pursuing Hybrid)

1. **Phase 1: Debug Room Intent Routing**
   - Add structured logging to `roomIntentRouter`
   - Verify it's called on agent turns (not just user messages)
   - Check if detected skills are being executed or ignored
   - Estimate: 1-2 hours

2. **Phase 2: Fix Language in Agent Turns**
   - Pass `language` param from room → agent turn function
   - Ensure skill detection gets it: `detectSkill(message, conversationId, skillSettings, userId, language?)`
   - Estimate: 1 hour

3. **Phase 3: Add Memory/Persona to Agent Turns**
   - Have agents call `buildChatContext()` when generating turn
   - Pass `personaId` if room has one
   - Estimate: 2 hours

4. **Phase 4: Test & Verify**
   - Create team room with bilingual prompt
   - Verify agent responds in user's language
   - Verify agent detects and calls skills
   - Verify agent respects persona
   - Estimate: 2-3 hours

**Total Estimate:** 6-8 hours of debugging/fixes (not a rewrite).

---

## Conclusion

**Reusing Chat infrastructure for Team Room is viable at the message/skill/memory layer, but not at the orchestration layer.**

- **Use:** Skill detection, memory system, persona system, i18n — all already work in Chat
- **Don't use:** Agent turn ordering, state machine — these are unique to multi-agent coordination
- **Fix:** Language awareness + intent routing in Room's agent execution pipeline
- **No database merge needed:** Keep `messages` (Chat) and `teamRoomMessages` (Room) separate for clarity

**Recommended next step:** Debug why agents loop and skills aren't being called (Phase 1 above). This is likely a routing or state bug, not an architectural problem. Once fixed, Team Room will have the same robust skill/language/memory support as Chat.

