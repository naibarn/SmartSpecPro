---
name: Brainstorm Feature to Team Rooms Evolution
description: Research on how Chat brainstorm mode works with 2 personas and how it evolved into Team Rooms for N participants
type: reference
---

# Research Brief: Brainstorm Feature → Team Rooms Evolution

**Date:** 2026-03-21
**Status:** COMPLETE — Feature fully researched; brainstorm deprecated but extensible patterns documented

## Executive Summary

The **Brainstorm skill** was a 2-participant collaborative mode in Chat where two LLM models debated a topic back-and-forth before producing a synthesis. It has been **DEPRECATED and replaced by Team Discussions** (the Team Room system), which supports N participants (agents, personas, human coordinators) with richer orchestration.

The migration path is **architectural: from simple turn-taking to complex multi-turn orchestration with work items, approvals, and state management.**

**Key Finding:** Team Rooms are not a "brainstorm at scale" — they're a fundamentally different system designed for structured teamwork with explicit roles, not just parallel thinking.

---

## Current State: How Brainstorm Worked (Legacy)

### Skill Definition
- **File:** `apps/web/skills/brainstorm/skill.md`
- **Category:** `chat_assistant` (LLM-only skill, no auto-execution)
- **Trigger patterns:** "brainstorm|brainstorming", "debate this|discuss this|analyze from multiple angles"
- **Frontmatter config:**
  ```yaml
  maxRounds: 3  # max 6
  requiresExplicit: true  # not auto-triggered
  ```

### Execution Flow

```
User sends message → Chat Router
    ↓
Optional skill detection: "brainstorm" matched
    ↓
Client shows: "Model A + Model B" toggle in toolbar
    ↓
User selects Model B (brainstorm partner)
    ↓
Server initiates 3-round debate loop:
    Round 1:
      - Call Model A with original question → save as (skillUsed="brainstorm", skillArgs={brainstormRole:"model_a", brainstormRound:1})
      - Call Model B with A's response + counter-perspective instruction → save as (skillUsed="brainstorm", skillArgs={brainstormRole:"model_b", brainstormRound:1})
    Round 2: Same pattern
    Round 3: Same pattern
    Final:
      - Call Model A with synthesis instruction + all prior responses → save as (skillUsed="brainstorm", skillArgs={brainstormRole:"summary"})
    ↓
Display all 7 messages in thread with colored badges and borders
```

### Database Schema (Legacy)

**Table:** `messages`
- `skillUsed: varchar(100)` — set to `"brainstorm"` for brainstorm mode
- `skillArgs: json` — `{ brainstormRole: "model_a" | "model_b" | "summary", brainstormRound: 1-6 }`
- **Conversation metadata:**
  - `brainstormPartnerModel: varchar(100)` — stores Model B name
  - `brainstormMaxRounds: integer` — default 3

**Credit tracking:**
- Credit source type: `"brainstorm"` (kept for backward compatibility)
- Cost: 3 rounds × 2 models + 1 summary = 7 LLM calls total

### Frontend Rendering

**File:** `apps/web/client/src/components/chat/ChatView.tsx` (lines 2449-2477)

```typescript
// Message styling based on brainstorm role
if (m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole === "model_a")
  → blue-50 bg + blue-400 left border
if (m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole === "model_b")
  → purple-50 bg + purple-400 left border
if (m.skillUsed === "brainstorm" && m.skillArgs?.brainstormRole === "summary")
  → green-50 bg + green-400 left border

// Badge displays:
// Model A: "Model A · Round 1 · gpt-4o"
// Model B: "Model B · Round 2 · claude-3-sonnet"
// Summary: "Brainstorm Summary · gpt-4o"
```

---

## Current State: Team Discussions (Replacement)

### Architecture Overview

**Team Rooms replaced brainstorm with a fundamentally richer system:**

| Aspect | Brainstorm | Team Room |
|--------|-----------|----------|
| Participants | 2 LLM models | N agents/personas + humans + external connectors |
| Orchestration | Simple 2-turn debate | Complex state machine: queued → running → paused → completed |
| Turn ordering | Predetermined (A→B→A→B→summary) | Dynamic (depends on role, priorities, turn engine) |
| Message types | LLM responses only | Thoughts, approvals, work items, system messages |
| Work tracking | None | Work items with drafts, revisions, approvals |
| Persistence | In-conversation memory only | Explicit work items, artifacts, thread trees |

### Database Schema (Current)

**Table:** `teamRoomMessages` (separate from `messages`)
- `senderType: enum("user" | "assistant" | "system" | "internal")`
- `senderAssistantId: varchar(36)` — FK to assistantProfiles (LLM agent)
- `senderUserId: integer` — FK to users (human participant)
- `recipientType: enum("all" | "individual" | "work_item")`
- `recipientAssistantId: varchar(36)` — directed message to one agent
- `metadataJson: jsonb` — flexible for future message types
- `tokenUsageJson: jsonb` — `{ inputTokens, outputTokens, model }`
- **Note:** `skillArgs` intentionally NOT present — skills are handled via `workItems` instead

**Table:** `teamRuns`
- `status: enum("idle" | "queued" | "running" | "paused" | "completed" | "failed" | "stopped")`
- `stopPolicy: json` — `{ maxRounds, maxDurationMinutes, maxBudgetCredits }`
- `currentTurn: integer` — explicit turn counter
- `currentActor: varchar(36)` — whose turn it is

**Table:** `workItems`
- `title, status, approverMemberId, revisionVersion`
- Explicit work tracking (not metadata)

### Key Services

| Service | Purpose |
|---------|---------|
| `roomService.ts` | Room CRUD, participant management |
| `turnOrderEngine.ts` | Determine who speaks next |
| `roomIntentRouter.ts` | Route agent input to skills or LLM |
| `runEngine.ts` | State machine: queued → running → paused → completed |
| `automationHandoffService.ts` | Pass control between agents/humans |

---

## Design Differences: Why Team Rooms Aren't Just "Brainstorm N"

### 1. Turn Ordering (Not Simple Round-Robin)

**Brainstorm:** Hard-coded: A, B, A, B, A, B, Summary.

**Team Room:** Dynamic turn engine considers:
- Agent availability
- Priority (lead vs. contributor)
- Work item status (if waiting for approval, turn goes to approver)
- Skill detection (if input mentions a domain, relevant agent goes next)
- Stop policies (maxRounds reached → transition to completion)

**Code:** `turnOrderEngine.ts` — 200+ lines of state logic

### 2. Bidirectional Communication

**Brainstorm:** Unidirectional: A responds to original Q, then B responds to A's answer, etc.

**Team Room:** Messages can be:
- Broadcast to all (`recipientType="all"`)
- Directed to one agent (`recipientType="individual"`, `recipientAssistantId=xyz`)
- Attached to work items (`recipientType="work_item"`)
- Threaded replies (`threadRootMessageId`)

### 3. Work Item State Machine (Not Just Messages)

**Brainstorm:** No state beyond the message thread.

**Team Room:**
```
work_item created → [draft] → [ready] → [pending_approval]
                              ↓
                      [approved] → [in_progress]
                              ↓
                      [completed] OR [rejected]
```

Each state transition can emit system messages, notify the approver, or trigger skill execution.

### 4. Explicit Role System

**Brainstorm:** Implicit: "Model A" and "Model B".

**Team Room:** Explicit member kinds:
- `assistant` — LLM agent
- `human` — human coordinator
- `external_connector` — API or webhook

With roles:
- `lead` — has veto power, approves work
- `contributor` — suggests ideas
- `reviewer` — validates quality
- `approver` — explicit approval gate

### 5. Skills Integration

**Brainstorm:** Skills are metadata only. The "skill" is really just LLM prompt variations.

**Team Room:** Skills executed as first-class operations:
- Skill detected by `roomIntentRouter`
- Executed by `skillExecutor` with agent context
- Result saved as structured message (not free-form chat)
- Can emit work items or trigger handoffs

---

## Implementation Timeline: How Brainstorm Was Phased Out

### Phase 1: Co-existence (Early 2025)
- Brainstorm skill available in Chat
- Team Rooms launch alongside Chat
- Help docs recommend Teams for "Compare two approaches"
- Both systems live in production

### Phase 2: Deprecation (Mid 2025)
- Brainstorm endpoint marked as "DEPRECATED — replaced by Team Discussions"
- `/api/llm/brainstorm` returns HTTP 410 GONE
- Help docs updated: "Use AI Teams" instead of "Brainstorm"

### Phase 3: Legacy Support (Current)
- Brainstorm messages remain readable in database (backward compatibility)
- Credit source type `"brainstorm"` kept for historical reporting
- No new brainstorm rounds can be started
- URL in llmRoutes: `/api/llm/brainstorm` → 410 with message

---

## Feasibility Assessment: Extending Brainstorm → N Participants

### Option 1: "Brainstorm N" — Extend the Legacy System

**Concept:** Keep the simple 2-persona debate loop, but support N models.

**Pros:**
- Minimal code changes (100-200 lines in llmRoutes.ts + chat router)
- Reuse existing UI (just add more colored badges for 3rd, 4th models)
- Backward compatible with existing brainstorm messages
- Quick to ship (1-2 days)

**Cons:**
- **Still just turn-taking**, not true collaboration (no work items, approvals, state)
- No way for models to reply to each other selectively (broadcasts only)
- No explicit role system (who's the "lead" synthesizer?)
- Credit calculation becomes complex (3 models × N rounds = messy)
- **Doesn't solve the real use case:** structured teamwork with explicit outcomes
- Will likely be deprecated again when Team Rooms features mature

**Code Changes Required:**
```typescript
// chat.ts — expand brainstorm schema
brainstormPartnerModels: json("brainstormPartnerModels")
  .$type<string[]>()  // ["gpt-4", "claude-3", "gemini"]

// llmRoutes.ts — loop over N instead of 2
for (const model of brainstormPartnerModels) {
  const response = await callLLM(model, conversationHistory);
  messages.push({
    skillUsed: "brainstorm",
    skillArgs: {
      brainstormRole: `model_${index}`,  // "model_0", "model_1", etc.
      brainstormRound: currentRound
    }
  });
}

// ChatView.tsx — generate more badge colors
const BRAINSTORM_COLORS = [
  "blue", "purple", "orange", "teal", "rose", "emerald"
];
const colorIndex = parseInt(role.split("_")[1]) % BRAINSTORM_COLORS.length;
```

**Effort: 8-12 hours | Risk: MEDIUM-HIGH (still not the right solution)**

---

### Option 2: "Structured Brainstorm" — Hybrid Approach

**Concept:** Keep brainstorm in Chat for quick 2-3 model comparisons, but wire it to emit work items in a team room.

**Pros:**
- Brainstorm becomes a "meeting starter" that generates a work item
- Results can be reviewed/approved in Team Room
- Bridges Chat and Teams workflows
- Reuses most existing code

**Cons:**
- Still doesn't support true N-participant debate (round-robin only)
- Team Room isn't really integrated (just displays the results)
- Overengineered for the simple use case
- Users confused about which tool to use

**Code Changes Required:**
```typescript
// After brainstorm completes, create a work item
const workItem = await workItemService.create({
  roomId: currentRoom.id,
  title: `Brainstorm: ${userQuestion}`,
  status: "pending_review",
  metadata: {
    brainstormParticipants: [modelA, modelB],
    brainstormResults: [msgA, msgB, summary],
    brainstormRounds: 3
  }
});

// Emit system message to room
await createTeamRoomMessage({
  roomId: currentRoom.id,
  senderType: "system",
  content: `Brainstorm completed with ${modelA} vs ${modelB}. Review results in Work Item #${workItem.id}`
});
```

**Effort: 16-20 hours | Risk: HIGH (architectural mismatch)**

---

### Option 3: "Migrate to Team Rooms Only" — The Right Solution

**Concept:** Users who want brainstorm experience just use Team Rooms with 2 agents configured as "Debater A" and "Debater B" with appropriate personas/system prompts.

**Pros:**
- **True solution:** Team Rooms already support N participants, so naturally extends to 2, 3, 4+
- Single source of truth for multi-participant conversations
- All Team Room features (work items, approvals, skill routing) available
- Sunset brainstorm entirely (less maintenance)
- Users learn one system instead of two

**Cons:**
- Requires Team Room to be "easy enough" for casual brainstorming (currently it feels heavyweight)
- Need UI shortcut: "Quick Debate" template that auto-creates 2-agent room
- Help docs need clear migration path

**Code Changes Required:**
```typescript
// New tRPC procedure in team.ts
quickDebate: protectedProcedure
  .input(z.object({
    topic: z.string(),
    model1: z.string(),
    model2: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Create team with 2 agents pre-configured
    const team = await teamService.create({
      name: `Quick Debate: ${input.topic}`,
      isTemporary: true,
    });

    // Add 2 agents as members
    await addMembersToTeam(team.id, [
      { agentId: agent1, role: "debater" },
      { agentId: agent2, role: "debater" }
    ]);

    // Start run
    const run = await startRun(team.id);
    return { teamId: team.id, runId: run.id };
  })

// Frontend shortcut in Chat header
<Button onClick={() => startQuickDebate(userMessage, modelA, modelB)}>
  Start Debate
</Button>
```

**Effort: 20-24 hours (mostly UI/UX, backend mostly exists) | Risk: LOW**

---

## Risks Analysis

### If We Extend Brainstorm to N:

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Conflicting with Team Rooms** | HIGH | Users confused which tool to use; maintenance burden doubles |
| **Credit calculation complexity** | HIGH | N models × M rounds = exponential costs; need cost warnings |
| **UI scale problem** | MEDIUM | Brainstorm colors only defined for 6 models (line 2466 ChatView); 7+ breaks rendering |
| **No state management** | HIGH | Can't pause, resume, or approve outputs like Team Rooms can |
| **Skill routing not supported** | MEDIUM | `roomIntentRouter` won't activate; skills stay LLM-only |
| **Will be deprecated again** | HIGH | Users invest in workflow, then Team Rooms become the standard |

### If We Do "Structured Brainstorm":

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Architectural debt** | CRITICAL | Trying to bolt Team Room features onto Chat; becomes unmaintainable |
| **Duplication** | HIGH | Same message store logic in 2 places (`messages` + `teamRoomMessages`) |
| **UX friction** | HIGH | Users don't understand why Chat and Team Room both needed |
| **Testing complexity** | MEDIUM | Test both paths; bugs in sync between systems |

### If We Migrate to Team Rooms Only:

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Team Room UX heavyweight** | MEDIUM | Add "Quick Debate" template to streamline; test with users |
| **Help docs confusion** | LOW | Clear migration guide + deprecation message |
| **Backward compatibility** | LOW | Old brainstorm messages still readable; just don't create new ones |

---

## Recommendation

**Migrate brainstorm users → Team Rooms with "Quick Debate" template (Option 3).**

**Rationale:**
1. **Eliminates duplicate code** — one system instead of two
2. **Future-proof** — Team Rooms already support N participants, so asking 3 people to collaborate is "the same problem solved"
3. **Richer experience** — users who want to actually *do* something with the debate results (turn into a blog post, email, decision document) can stay in Team Room
4. **Cleaner UX** — less jargon for new users (just explain: "Chat for 1-on-1, Teams for collaboration")

**Implementation Roadmap:**

**Phase 1 (This sprint):** Create "Quick Debate" template + help docs
- Add `team.quickDebate` tRPC procedure (3 hours)
- Add Chat button "Start Debate" (2 hours)
- Update help: chat.md + new teams-brainstorm.md (1 hour)
- User testing with 3-5 beta users (async feedback)
- **Total: 6 hours**

**Phase 2 (Next sprint):** Monitor usage, refine UX
- Collect analytics: how many users click "Start Debate" vs skip it?
- Refine Team Room UI for quick workflows (lighter sidebar, simpler run controls)
- Add "Templates" panel to Teams page for quick debate / code review / audit patterns
- **Total: 8 hours**

**Phase 3 (Sunset):** Deprecate brainstorm
- Mark brainstorm skill as `deprecated: true` in schema
- Old conversations still render brainstorm messages
- Help docs link users to teams alternative
- Remove from skill picker UI
- **Total: 2 hours**

---

## Open Questions

1. **Quick Debate UX** — Should it auto-start the agents, or wait for user confirmation? (Auto-start feels snappier; "confirm" feels safer)
2. **Debate templates** — Should we pre-fill system prompts for "Optimist vs Pessimist", "Expert vs Novice", "Entrepreneur vs Accountant"? (Yes, but as separate feature)
3. **Chat integration depth** — If user is in a Chat conversation and clicks "Start Debate", should that conversation context carry over to the room? (Yes, auto-add as first work item)
4. **Historical data** — Do we need to migrate old brainstorm messages to Team Room format? (No; read-only in Chat is fine)
5. **Backward compatibility** — How long to keep `/api/llm/brainstorm` endpoint 410? (6 months for gradual migration)

---

## Files Affected by This Decision

### If Option 3 (Recommended):

**To ADD:**
- `apps/web/server/routers/team.ts` — new `quickDebate` procedure
- `apps/web/client/src/components/chat/QuickDebateModal.tsx` — new UI component
- `apps/web/docs/help/en/teams-brainstorm.md` — new help topic

**To MODIFY:**
- `apps/web/client/src/components/chat/ChatView.tsx` — add "Quick Debate" button in header
- `apps/web/docs/help/en/chat.md` — update brainstorm section to point to Teams
- `apps/web/docs/help/en/teams.md` — add "Quick Debate" section
- `apps/web/server/routers/chat.ts` — consider deprecating brainstorm-related parameters (later)

**To KEEP (no changes):**
- `apps/web/skills/brainstorm/skill.md` — remains for legacy read-only access
- `apps/web/server/services/creditService.ts` — `creditSourceType: "brainstorm"` stays for historical data
- All existing brainstorm messages in database — remain readable

**Lines of Code:**
- Add: ~200 lines (team.ts + component)
- Modify: ~50 lines (help docs + chat button)
- Delete: 0 lines (backward compatible)
- **Total effort: 6-8 hours for Phase 1**

---

## Appendix: Code Pointers

### Brainstorm Legacy Code (READ-ONLY)

- Skill definition: `/home/dev/projects/SmartSpecPro/apps/web/skills/brainstorm/skill.md`
- Chat UI rendering: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.tsx:2449-2477`
- Database schema: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts:1347-1351` (conversation fields)
- Deprecated endpoint: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts:2114-2130`

### Team Room Code (Foundation for Option 3)

- Core router: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/team.ts`
- Turn engine: `/home/dev/projects/SmartSpecPro/apps/web/server/services/turnOrderEngine.ts`
- Intent router: `/home/dev/projects/SmartSpecPro/apps/web/server/services/roomIntentRouter.ts`
- UI component: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- Schema: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts:6220-6254` (teamRoomMessages)

---

## Summary Table: All Options Compared

| Aspect | Option 1: Brainstorm N | Option 2: Structured | Option 3: Teams Only |
|--------|----------------------|-------------------|-------------------|
| **Time to implement** | 8-12 hrs | 16-20 hrs | 6-8 hrs |
| **Code duplication** | None added | High | None |
| **Supports N participants** | Yes | Yes | Yes |
| **Has work items** | No | Hybrid | Yes |
| **Has skill routing** | No | Partial | Yes |
| **Future-proof** | No (sunset soon) | No (complexity) | Yes |
| **Maintenance burden** | Medium | High | Low |
| **User confusion** | High | High | Low |
| **Recommended** | NO | NO | **YES** |

