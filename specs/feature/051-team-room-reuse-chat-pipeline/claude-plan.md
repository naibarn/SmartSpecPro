# Implementation Plan: Team Room Reuse Chat Pipeline

## 1. Context and Motivation

SmartSpecPro has two AI conversation systems: **Chat** (1-on-1 with a persona) and **Team Room** (multi-agent orchestration). Chat works correctly — proper skill detection, memory injection, persona resolution with Thai language support, and produces actual deliverables. Team Room is broken — agents loop endlessly, respond in the wrong language, skip skill detection, and produce generic "Workflow Summary" plans instead of content.

The root cause: Team Room has a **separate execution pipeline** that duplicates Chat's functionality poorly. This plan refactors Team Room to **reuse Chat's proven pipeline** so that any improvement to Chat automatically benefits Team Room.

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| Skill detection | Skipped for agents → `team-discussion-assistant` | `detectSkill()` from Chat for all origins |
| Persona | Only `systemPromptPrefix` | Full `buildPersonaPromptSegments()` with Thai particles |
| Memory | Scoped memory only | Scoped + entity memories (global user facts) |
| History format | Flattened to single text blob | Multi-turn messages with `[Agent Name]` prefix |
| Language | Generic English | Follows detected skill's language config |
| LLM execution | Python backend bridge | Node.js `executeSkillLlmWithFallback()` directly |
| Python dependency | Required for agent turns | Removed entirely for LLM calls |

### What Stays Unchanged

- Run lifecycle management (`runEngine.ts` — start/pause/resume/stop)
- Turn order selection (`turnOrderEngine.ts`)
- Work item state machine (`workItemService.ts`)
- Budget tracking and stop policies
- Team Room UI (`TeamRoomView.tsx`)
- Message storage (`teamRoomMessages` table)

---

## 2. Architecture

### Current Flow (Broken)

```
runNextTurn()
  → routeRoomIntent() → SKIP detection → team-discussion-assistant
  → executeTeamRunSkillTurn()
    → composePrompt() → messages (simplified persona, no entity memory)
    → formatPromptMessagesForAgent() → FLATTEN to single string
    → executeSkillLlmWithFallback() OR executeAgentTurn() [Python]
  → store in teamRoomMessages
  → getNextSpeaker()
```

### Target Flow (Reusing Chat)

```
runNextTurn()
  → routeRoomIntent() → detectSkill(objective) → matched skill
  → executeTeamRunSkillTurn()
    → composePrompt() [ENHANCED]
      ├─ buildPersonaPromptSegments(persona) → full persona with Thai particles
      ├─ getEntityMemories(userId, null, personaId) → global facts
      ├─ retrieveForPrompt() → scoped memories (existing)
      ├─ compressHistory() → multi-turn with [Display Name] prefix (existing, fixed)
      └─ Token budgeting (existing)
    → messages = [skill.systemPrompt, ...composed.messages] (MULTI-TURN, not flattened)
    → executeSkillLlmWithFallback() (existing, Node.js only)
  → store in teamRoomMessages
  → getNextSpeaker()
```

### Dependency Graph

```
roomIntentRouter.ts ─── imports ──→ skillDetector.ts (detectSkill)
         │
         ▼
teamRunSkillExecutor.ts ─── uses ──→ promptComposer.ts (composePrompt, ENHANCED)
         │                                    │
         │                                    ├──→ personaService.ts (buildPersonaPromptSegments) [NEW]
         │                                    ├──→ chatService.ts (getEntityMemories) [NEW]
         │                                    └──→ scopedMemoryService.ts (retrieveForPrompt) [EXISTING]
         │
         └─── uses ──→ skillModelFallback.ts (executeSkillLlmWithFallback) [EXISTING]
```

---

## 3. Section 1: Enable Skill Detection for Agent Turns

### File: `apps/web/server/services/roomIntentRouter.ts`

**Current behavior (line 58-66):** When `origin !== "human_user"`, immediately return `team-discussion-assistant` without attempting skill detection.

**Change:** Remove the early return. Allow ALL origins to go through skill detection. The detection uses the message/objective text and confidence scoring — it works the same regardless of origin.

**Logic:**
1. Check explicit agency signal (existing, keep)
2. Call `detectSkill(normalized, undefined, undefined, input.userId)` for ALL origins
3. If match with confidence ≥ 0.6 → use that skill
4. If no match → fall back to a content-appropriate default skill based on message language (not `team-discussion-assistant`)

**Fallback strategy:** When no skill is detected:
- If message contains Thai characters → use a Thai-capable general skill
- Otherwise → use `general-article-writer` or similar
- `team-discussion-assistant` is removed entirely

**Why 0.6 threshold (not 0.7 like human_user):** Agent turns use the objective (which is broader) rather than a specific user command, so slightly lower confidence is acceptable.

---

## 4. Section 2: Enhance Prompt Composer

### File: `apps/web/server/services/promptComposer.ts`

This is the core change — making `composePrompt()` build context at Chat's quality level.

### 4.1 Full Persona Resolution

**Current:** Loads `persona.systemPromptPrefix` only.

**Add:** Import and call `buildPersonaPromptSegments(persona)` from `personaService.ts`. This returns three components:
- `prefix` — full persona block with [PERSONA START]...[PERSONA END] markers
- `styleInstructions` — tone, nickname, Thai gender particles (ค่ะ/คะ/ครับ)
- `restrictionsBulletPoints` — persona restrictions list

Include all three in the system prompt section, within the existing `PERSONA_BUDGET` token allocation.

### 4.2 Entity Memory Injection

**Current:** Only uses scoped memory via `retrieveForPrompt()`.

**Add:** Import and call `getEntityMemories(userId, null, personaId)` from `chatService.ts`. This returns the user's top-10 global facts (sorted by reinforcement count).

Merge entity memories with scoped memories within `MEMORY_BUDGET`:
1. Scoped memories first (higher priority — team/room/run-specific)
2. Entity memories fill remaining budget (global user context)

**Note:** `getEntityMemories` needs a `userId` (number), but Team Room context has `assistantId` (string UUID). The `userId` should come from `run.initiatedByUserId` — the human who started the run. All agents share this user's memories (per interview decision: shared memory).

### 4.3 Multi-Turn History with Display Names

**Already partially done** in previous fixes. Ensure:
1. History messages preserve `role: "assistant"` / `role: "user"` — NOT flattened
2. Assistant messages prefixed with `[Display Name]` (from participant label lookup)
3. System messages (persona, team context, objective, memories) keep `role: "system"`
4. The composed messages array is returned as-is to the caller — no flattening

---

## 5. Section 3: Refactor Skill Executor

### File: `apps/web/server/services/teamRunSkillExecutor.ts`

### 5.1 Remove Agency/Python Routes

**Current:** Three routes — agency (Python), non-LLM (Python), LLM skill (Node.js).

**Change:** Single route — always use LLM skill path (Node.js). Remove:
- `executeAgentTurn` import and all calls
- `formatPromptMessagesForAgent()` function
- Agency route branch
- Non-LLM skill fallback to Python

### 5.2 Use Detected Skill's Prompt

**Current:** Always uses `team-discussion-assistant` skill prompt.

**Change:** Use the skill from `input.route.selectedSkillId` (which now comes from actual detection).

The skill's `systemPrompt` replaces the generic team-discussion prompt. This is what makes language work — skills have language-appropriate prompts built in.

### 5.3 Pass Multi-Turn Messages

**Current:** `messages = [skill.systemPrompt, flattenedText]` — two messages total.

**Change:** `messages = [skill.systemPrompt, ...composed.messages]` — full multi-turn array.

The `composePrompt()` output is already a properly structured array of `{role, content}` messages. Pass it directly instead of flattening.

---

## 6. Section 4: Remove Python Backend Dependency

### Files to Remove

| File | Reason |
|------|--------|
| `apps/web/server/services/teamOrchestrationBridge.ts` | No longer calling Python for LLM |
| `python-backend/app/services/team_orchestrator.py` | Entire service replaced by Node.js |
| `python-backend/app/api/team_orchestrator_api.py` | Remove execute-turn endpoint (keep generate-summary if used) |
| `python-backend/app/core/rate_limit.py` | Was only for execute-turn |
| `python-backend/tests/unit/core/test_rate_limit.py` | Tests for removed code |
| `python-backend/tests/test_team_orchestrator_security.py` | Proxy token + orchestrator tests (keep summary tests if applicable) |

### Files to Clean Up

| File | Change |
|------|--------|
| `apps/web/server/services/runEngine.ts` | Remove import of `executeAgentTurn`, remove any Python bridge references |
| `apps/web/server/services/internalSkills.ts` | Remove `team-discussion-assistant` or mark deprecated |
| `python-backend/app/main.py` | Remove `team_orchestrator_api` router registration |
| `python-backend/app/core/csrf.py` | Can remove `/api/team-orchestrator/` from CSRF exemptions |

### Generate-Summary Decision

Check if `generate-summary` endpoint in `team_orchestrator_api.py` is used elsewhere. If only used by Team Room, move to Node.js or keep as separate Python endpoint. If unused, remove.

---

## 7. Section 5: Migration and Cleanup

### Stop Old Runs

Create a one-time migration or startup script:
1. Find all `teamRuns` with status `"running"` or `"paused"`
2. Set status to `"stopped"`, `stopReason` to `"system_migration_051"`
3. Log the count of affected runs

This can be a Drizzle migration SQL file or a startup check in `runEngine.ts`.

### Clean Up Internal Skill

Remove `team-discussion-assistant` from `internalSkills.ts`. If `getInternalSkillDefinitions()` is called elsewhere, return an empty array or filter it out.

Update `roomIntentRouter.ts` to not reference `TEAM_DISCUSSION_SKILL_ID`.

---

## 7.5 Background Execution & Session Management (NEW)

### Background Execution — Already Working
The auto-advance loop (`queueAutoAdvance` → `setTimeout` → `advanceRun`) runs entirely server-side. No browser/UI required. Messages are persisted immediately via `roomService.postWorkUpdate()`. Server restart recovery via `recoverActiveRunsOnStartup()`.

**Feature 051 must preserve this** — the refactored `executeTeamRunSkillTurn()` is called from the same `advanceRun()` loop, so background execution continues working automatically.

### Summary Generation — Must Fix (Section 4)
Current code at `runEngine.ts:1194` imports `teamOrchestrationBridge.generateSummary` which is deleted in section-04. **Replace with** `summaryService.generateSummary({ runId, tenantId })` in the same section. Use extractive method (no LLM needed) as default.

### Session History Browsing — Add tRPC Procedure (Section 5)
Add `teamRoom.listRuns` tRPC procedure to expose past runs:
- Input: `{ roomId: string }`
- Output: `Array<{ id, status, objective, startedAt, endedAt, stopReason, budgetSnapshotJson }>`
- Query: `SELECT * FROM team_runs WHERE roomId = ? ORDER BY startedAt DESC LIMIT 50`
- Include tenant validation (only show runs for user's tenant)

### On-Demand Summary — Add tRPC Procedure (Section 5)
Add `teamRun.generateSummary` tRPC procedure:
- Input: `{ runId: string }`
- Calls `summaryService.generateSummary()`
- Returns summary result to client
- Rate limit: max 5 per minute per user

### External Triggers & Workers (Future Scope)
The following capabilities extend this feature but are NOT in scope for Feature 051. They should be planned as separate features:

1. **External triggers** — MCP, API, webhook, Telegram can start/advance runs via tRPC or REST endpoints
2. **Scheduled runs** — cron-based auto-start using existing scheduler service
3. **External workers** — tools/bots join as virtual participants in chat sessions, posting messages through the room service API
4. **Virtual personas** — external systems impersonate team members via `roomService.postWorkUpdate()` with a designated `senderAssistantId`

These require separate planning because they involve:
- Auth boundaries (API keys for external triggers)
- Webhook/Telegram integration infrastructure
- Schedule management UI
- External worker registration and permission model

## 8. Section 6: Testing

### New Test Files

**`apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`**
- Test that `executeTeamRunSkillTurn` calls `executeSkillLlmWithFallback` (not Python bridge)
- Test that detected skill's prompt is used (not team-discussion)
- Test that composed messages are multi-turn (not flattened)
- Test Thai objective → Thai skill detection

**`apps/web/server/services/__tests__/promptComposer.enhanced.test.ts`**
- Test that `buildPersonaPromptSegments` is called
- Test that entity memories are included
- Test that history messages have display name prefix
- Test token budget is respected

**`apps/web/server/services/__tests__/roomIntentRouter.enhanced.test.ts`**
- Test assistant origin goes through skill detection
- Test confidence threshold (0.6 for assistant, 0.7 for human)
- Test fallback when no skill detected

### Existing Tests to Verify

- `runEngine.test.ts` — budget accumulation still works
- `personaService.test.ts` — persona resolution unchanged
- `skillDetector` tests — detection unchanged
- Python `test_team_orchestrator_security.py` — remove or adapt (since Python endpoint removed)

### Manual Verification

1. Create team room with Thai objective → verify Thai responses
2. Create team room with English objective → verify English responses
3. Run 3 turns → verify no repetition, progressive content
4. Check that detected skill matches objective (audit log)
5. Verify entity memories appear in agent context (debug log)

---

## 9. Security Requirements (from Audit)

### CRITICAL — Must Fix in Section Implementation

| ID | Issue | Fix Location |
|----|-------|-------------|
| **CRIT-1** | `getEntityMemories(userId)` has no `tenantId` — cross-tenant memory leak | Section 2: validate user belongs to tenant before calling |
| **CRIT-2** | `composePrompt` queries `assistantProfiles` without `tenantId` filter | Section 2: add `tenantId` to `ComposePromptInput`, filter query |

### HIGH — Must Fix During Implementation

| ID | Issue | Fix Location |
|----|-------|-------------|
| **HIGH-1** | `objective` injected as `system` role — prompt injection vector | Section 2: move to `user` role or sanitize + wrap in delimiters |
| **HIGH-3** | Python rate limiter removed, no Node.js replacement | Section 4: add tRPC rate limit on `teamRun.advance` before removing Python |
| **HIGH-4** | History/participant queries use `roomId` only — IDOR risk | Section 2: validate `roomId` belongs to `tenantId` at start of `composePrompt` |

### MEDIUM — Should Fix

| ID | Issue | Fix Location |
|----|-------|-------------|
| **MED-1** | Migration SQL may stop new-pipeline runs | Section 5: add `startedAt < NOW() - 5min` guard |
| **MED-2** | `retrieveForPrompt` uses `profile.tenantId` not `input.tenantId` | Section 2: use `input.tenantId` explicitly |
| **MED-3** | History content not sanitized — stored prompt injection | Section 2: sanitize `msg.content` before injecting |
| **MED-4** | History not scoped by `runId` — context contamination | Section 2: prefer current run messages, fallback to room |
| **MED-5** | Fallback skill ID not validated at startup | Section 1: add startup check in skillRegistry |

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Skill detection picks wrong skill for objective | Medium | Medium | Lower confidence threshold (0.6), fallback to general content skill |
| Token budget exceeded with entity memories added | Low | Low | Existing budget system handles truncation |
| Existing Team Room UI expects Python-format responses | Low | High | Verify `tokenUsage` shape matches — bridge normalization already handles this |
| `generate-summary` depends on removed Python code | Medium | Medium | Replace bridge import with summaryService import |
| Turn order breaks without Python coordination | Low | Low | Turn order is entirely in Node.js (`turnOrderEngine.ts`) |
| Cross-tenant data leak via entity memory | High | Critical | Add tenantId validation before memory fetch (CRIT-1) |
| Prompt injection via objective | Medium | High | Move objective to user role (HIGH-1) |

---

## 10. Implementation Order

The sections should be implemented in this order due to dependencies:

1. **Section 1: Skill Detection** — `roomIntentRouter.ts` changes (no dependencies)
2. **Section 2: Prompt Composer** — `promptComposer.ts` enhancement (depends on persona/memory imports)
3. **Section 3: Skill Executor** — `teamRunSkillExecutor.ts` refactor (depends on sections 1+2)
4. **Section 4: Remove Python** — cleanup (depends on section 3 working)
5. **Section 5: Migration** — stop old runs, cleanup (depends on section 4)
6. **Section 6: Testing** — can start in parallel with sections 1-2, complete after all
