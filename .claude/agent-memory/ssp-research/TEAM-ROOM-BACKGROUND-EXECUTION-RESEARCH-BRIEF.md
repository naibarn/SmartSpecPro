---
name: Team Room Background Execution & Session Persistence Research
description: Comprehensive audit of Team Room background job execution capability, session history, and summary generation for Feature 051
type: project
---

# Research Brief: Team Room Background Execution Capability

**Date:** 2026-03-21
**Status:** RESEARCH COMPLETE
**User Requirement:** Team runs must work as background jobs independent of browser/UI, with full session history and on-demand summary generation
**Context:** Feature 051 refactors Team Room to use Chat pipeline; must preserve background execution

---

## Executive Summary

**Current Background Execution Capability: WORKS (with caveats)**

Team Room auto_team execution mode runs independently of browser connection via in-memory timer-based auto-advance. Sessions are fully persisted and browsable. HOWEVER:

- **CRITICAL GAP:** No procedure to retrieve session history (list past runs in a room) — requires implementation
- **CRITICAL GAP:** Summary generation is triggered at run end but NOT exposed as user-facing API
- **PROCESS RESTART RISK:** In-memory timers lost on server restart; recovery mechanism exists but requires startup call
- **NOT FEATURE 051-BLOCKING:** Summary generation calls Python bridge (line 1198 in runEngine.ts) — Feature 051 must replace this with Node.js implementation

---

## Findings

### 1. Background Execution: OPERATIONAL

#### Auto-Team Loop (Primary Background Mechanism)

**How it works:**
1. User starts run with `executionMode: "auto_team"` via `teamRun.start` mutation
2. `runEngine.startRun()` creates run in "running" status
3. Calls `queueAutoAdvance(runId, tenantId, 3)` — schedules 3 initial turns via `setTimeout` (line 788)
4. After each turn in `advanceRun()`, system evaluates work items:
   - If assistant-actionable tasks exist → `queueAutoAdvance(runId, tenantId, 1, 200ms)` queues next turn
   - If awaiting human → pauses run
   - If no work items → stops run
5. Loop continues without any client involvement (line 1109-1111)

**Key code locations:**
- Start: `runEngine.ts:787-789` — `queueAutoAdvance()` on run start
- Loop: `runEngine.ts:1099-1111` — auto-advance decision logic in `advanceRun()`
- Queue: `runEngine.ts:338-359` — `queueAutoAdvance()` function uses `setTimeout()`

**Persistent Timers:**
```typescript
const activeAutoAdvanceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function queueAutoAdvance(runId, tenantId, maxTurns, delayMs = 0) {
  if (activeAutoAdvanceTimers.has(runId)) return;

  const timeout = setTimeout(() => {
    activeAutoAdvanceTimers.delete(runId);
    advanceRun(runId, tenantId, maxTurns).catch(...)
  }, delayMs);

  activeAutoAdvanceTimers.set(runId, timeout);
}
```

**Auto-Stop Policy Checker (Secondary Mechanism):**
1. Called after run start (line 785)
2. Runs every 30 seconds via `setInterval()` (line 1273)
3. Checks: max rounds, max duration, max budget, idle timeout (120s default)
4. Auto-stops run if any limit exceeded
5. Checker stopped when run ends/pauses (lines 854, 1175)

#### Process Restart Recovery

**Mechanism: `recoverActiveRunsOnStartup()` (line 1301-1340)**
- Calls on server startup (must be invoked by server entry point)
- Queries `teamRuns` table for status='running'
- For each running run:
  - Restarts auto-stop checker
  - If `executionMode='auto_team'`: queues 1 turn with 500ms delay
- Ensures runs aren't stuck "running" in DB after restart

**Verified in:** `runEngine.ts:1301-1340`

### 2. Message & Session Persistence: COMPLETE

#### Message Storage
- **Table:** `teamRoomMessages` (line 6259-6281 in schema.ts)
- **Key columns:** `roomId`, `runId`, `senderType`, `content`, `tokenUsageJson`, `createdAt`
- **Indexing:**
  - `team_room_messages_room_created_idx` (roomId, createdAt)
  - `team_room_messages_run_created_idx` (runId, createdAt)
- **Persistence:** All turns stored immediately via `roomService.postWorkUpdate()` (line 950 in runEngine.ts)
- **Per-run messages:** Queryable by `runId` (line 131 in summaryService.ts)

#### Run Records
- **Table:** `teamRuns` (line 6310-6332 in schema.ts)
- **Status field:** `status` enum (values: queued, running, paused, stopped, completed, failed)
- **Tracking:** `startedAt`, `endedAt`, `objective`, `budgetSnapshotJson`, `stopReason`
- **Persistence:** Immediate update on status changes (line 989 in runEngine.ts)

#### Data Available to User
- ✅ All messages in a run (via `teamRoom.getMessages` query + `runId` filter)
- ✅ Run metadata (via `teamRun.get` query)
- ✅ Per-agent budget (in `budgetSnapshotJson`)
- ✅ Execution timeline (via `startedAt`, `endedAt`)

### 3. Session History: MISSING USER ENDPOINT

#### Problem
- Schema has full run history (all runs stored in `teamRuns` table)
- No tRPC procedure to retrieve run history for a room/team
- TeamRoomView UI cannot show "past sessions" list
- Users cannot browse previous runs

#### Workaround
Database query works:
```sql
SELECT id, executionMode, status, objective, startedAt, endedAt
FROM team_runs
WHERE roomId = ? AND tenantId = ?  -- needs tenantId filter for security
ORDER BY startedAt DESC;
```

#### Schema Support
- `team_runs_room_status_idx` index on (roomId, status) — efficient lookup

### 4. Summary Generation: PARTIALLY IMPLEMENTED

#### Current Flow
1. **Auto-trigger:** When run stops, if `stopPolicy.requireFinalSummary=true`:
   - Line 1196 in `runEngine.ts`: calls `teamOrchestrationBridge.generateSummary()`
   - This imports bridge and invokes summary generation
   - Reason: "Final summary is best-effort" (comment line 1203)

2. **Methods available** (from `summaryService.ts`):
   - `extractive` — data extraction only, no LLM
   - `system_generated` — LLM with neutral prompt
   - `agent_generated` — LLM with lead agent persona

3. **Data structure** (line 25-37 in summaryService.ts):
   ```typescript
   interface RunSummary {
     runId, method, objective, participants,
     keyDecisions, keyFindings, artifactsProduced,
     openQuestions, nextSteps, totalCost, totalDuration, generatedAt
   }
   ```

4. **Persistence:** Stored in `agentRunSummaries` table (one row per participant)

#### Issues

**Python Dependency (BLOCKER for Feature 051):**
- Line 1198: `const bridge = await import("./teamOrchestrationBridge");`
- Calls `bridge.generateSummary()` → Python endpoint at `/api/team-orchestrator/generate-summary`
- Feature 051 removes Python bridge entirely
- **ACTION REQUIRED:** Implement Node.js version or expose summaryService function

**NOT USER-FACING:**
- No tRPC procedure to generate summary on demand
- Users cannot re-run summary generation
- No UI to view generated summary
- Summary is only auto-generated at run end (line 1196)

**Database Table (line 6465-6475 in schema.ts):**
```sql
agentRunSummaries: {
  runId, assistantId, turnCount, totalInputTokens,
  totalOutputTokens, totalCostCredits, createdAt
}
```
Note: Only stores per-agent metrics, NOT the summary text itself — need to check if summary object stored elsewhere or lost.

### 5. SSE/Streaming: NOT REQUIRED FOR BACKGROUND EXECUTION

#### Current Implementation
- `orchestratorStream.ts`: Provides real-time event stream via SSE
- Routes: `/api/orchestrator/stream/run/:runId`, `/api/orchestrator/stream/team/:teamId`
- Client subscribes for live updates during active UI session
- Heartbeat every 15 seconds (line 21)

#### For Background Execution
- **SSE is OPTIONAL** — used only for real-time UI updates
- Run progresses without SSE connection active
- Messages persisted to DB regardless of client connection
- Events published to Redis `runChannel` (line 1019-1034) for any connected clients

#### Gap: Replay of Missed Events
- Line 39: `replayMissedEvents()` function exists to catch up client on reconnect
- Uses `lastEventId` from client (expects EventSource to track this)
- Replays events from DB after that timestamp
- **Works correctly** — no gap here

### 6. Feature 051 Impact Assessment

#### What Stays (Background Execution Unaffected)
- ✅ Run lifecycle (`startRun`, `pauseRun`, `resumeRun`, `stopRun`) — purely in runEngine.ts
- ✅ Auto-advance loop (`queueAutoAdvance`, `advanceRun`) — purely in runEngine.ts
- ✅ Auto-stop checker — purely in runEngine.ts
- ✅ Message persistence — purely in roomService.ts
- ✅ Work item state machine — purely in workItemService.ts
- ✅ Turn order selection — purely in turnOrderEngine.ts
- ✅ Recovery on startup — purely in runEngine.ts
- ✅ SSE events — unchanged, still works

#### What Breaks (Feature 051 Removes Python Bridge)
- ❌ Summary generation (line 1198 in runEngine.ts) — imports `teamOrchestrationBridge`
- ❌ Bridge module itself (apps/web/server/services/teamOrchestrationBridge.ts) — scheduled for deletion
- ❌ Python endpoint `/api/team-orchestrator/generate-summary` — scheduled for deletion

#### Required Changes for Feature 051
1. **Line 1194-1205 in runEngine.ts** — Replace Python bridge call with local `summaryService.generateSummary()`:
   ```typescript
   // OLD:
   const bridge = await import("./teamOrchestrationBridge");
   (bridge.generateSummary as Function)(run.roomId, runId).catch(() => {});

   // NEW:
   const { generateSummary } = await import("./summaryService");
   generateSummary({ runId, tenantId, method: "extractive" }).catch(() => {});
   ```

2. **Add tRPC procedure** for on-demand summary generation:
   ```typescript
   generateSummary: protectedProcedure
     .input(z.object({ runId: z.string(), method: z.enum(["extractive", "system_generated", "agent_generated"]) }))
     .mutation(async ({ input, ctx }) => {
       return summaryService.generateSummary({ ...input, tenantId });
     })
   ```

---

## Current Architecture

### Background Execution Flow Diagram

```
User starts run (auto_team mode)
  ↓
teamRun.start mutation
  ↓
runEngine.startRun()
  ├─ Insert teamRuns record (status='running')
  ├─ Initialize work items
  ├─ startAutoStopChecker(runId) → setInterval(checkAndAutoStop, 30s)
  └─ queueAutoAdvance(runId, tenantId, 3) → setTimeout(advanceRun, 0ms)
  ↓
[Client can now close browser / disconnect]
  ↓
setTimeout fires → advanceRun()
  ├─ runNextTurn() → execute agent turn via skill
  ├─ Post message to teamRoomMessages
  ├─ checkAndAutoStop() → evaluate stop policy
  ├─ evaluateAutoTeamLoopDecision() → check work items
  └─ If continue → queueAutoAdvance(runId, tenantId, 1, 200ms)
  ↓
[Loop continues in background via setTimeout]
  ↓
Stop condition met (idle, budget, manual stop, etc.)
  ↓
stopRun()
  ├─ Update teamRuns status='completed'
  ├─ Insert agentRunSummaries records
  ├─ Call teamOrchestrationBridge.generateSummary() [WILL BREAK IN FEATURE 051]
  └─ Publish run_completed event to Redis
  ↓
stopAutoStopChecker() → clearInterval()
clearQueuedAutoAdvance() → clearTimeout()
```

### Process Restart Recovery

```
On server startup
  ↓
Call recoverActiveRunsOnStartup() [must be added to server init]
  ↓
Query teamRuns WHERE status='running'
  ↓
For each run:
  ├─ startAutoStopChecker(runId)
  └─ If auto_team: queueAutoAdvance(runId, tenantId, 1, 500ms)
  ↓
Timers resume; runs continue
```

### Data Flow: Browser Closed → Background Execution

```
Browser Open                    → Browser Closed               → Browser Reopened
   ↓                                   ↓                              ↓
User views run                    Auto-advance continues        User loads page
SSE connected                     in background every 200ms      SSE reconnects
Real-time updates shown          Messages stored in DB          lastEventId provided
                                  Budget accumulating            Missed events replayed
                                  Work items advancing           Full conversation shown
                                  Stop policy checked (30s)
                                  Run completes if no work
```

---

## Risks

### HIGH Risk: Summary Generation Will Break in Feature 051
- **Impact:** On run completion, summary generation will fail (bridge module removed)
- **Current:** Line 1196 in runEngine.ts calls `teamOrchestrationBridge.generateSummary()`
- **After Feature 051:** Bridge import will fail (module deleted)
- **Mitigation:** Implement Node.js replacement before removing bridge
- **Detection:** Integration test that starts auto_team run and waits for completion

### MEDIUM Risk: Process Restart Timing
- **Impact:** If server restarts while auto_team run active, next turn may be delayed 500-600ms
- **Current:** `recoverActiveRunsOnStartup()` queues turn with 500ms delay
- **Reason:** Allows time for services to fully initialize
- **Mitigation:** Document recovery behavior; users can manually `advance` if needed
- **Note:** Not critical; recovery happens, just with slight delay

### MEDIUM Risk: Session History Not Exposed
- **Impact:** Users cannot browse past runs in a room
- **Workaround:** Admin can query DB directly; data is there
- **Mitigation:** Implement `teamRoom.listRuns` procedure
- **Severity:** UX gap, not functional gap

### LOW Risk: Summary Storage Location Unclear
- **Impact:** After Feature 051, unclear where summary text is persisted
- **Current:** `agentRunSummaries` table only has per-agent budget, not summary text
- **Question:** Is summary text stored in `teamRoomMessages` as system message? Need verification
- **Mitigation:** Clarify schema before Feature 051; add schema if needed

---

## Options

### Option A: Minimal Feature 051 Changes (Recommended)
**Scope:** Fix summary generation only
1. Replace Python bridge call (line 1194-1205) with local `summaryService.generateSummary()`
2. Use `extractive` method by default (no LLM required, always works)
3. Add user-facing tRPC procedure for on-demand summary generation
4. **Cost:** 2-3 hours
5. **Risk:** Low
6. **Benefit:** Feature 051 completes on schedule; background execution preserved

### Option B: Full Summary Implementation
**Scope:** Enhanced summary with optional LLM generation
1. All of Option A
2. Add system setting to choose summary method (extractive, system_generated, agent_generated)
3. For LLM methods: use Node.js `executeSkillLlmWithFallback()` instead of Python
4. Implement retry logic (summary generation can fail silently in current code)
5. **Cost:** 6-8 hours
6. **Risk:** Medium (LLM integration adds complexity)
7. **Benefit:** Production-ready summary system

### Option C: Defer Summary (Not Recommended)
**Scope:** Remove summary generation entirely in Feature 051
1. Comment out lines 1194-1205 in runEngine.ts
2. Remove bridge call
3. Leave `agentRunSummaries` schema as-is (only stores per-agent budget)
4. **Cost:** 0.5 hours
5. **Risk:** High (user-facing feature broken; can be re-added later but disruptive)
6. **Benefit:** Feature 051 ships faster
7. **Downside:** Users expect summaries after run completion

---

## Recommendation

**Implement Option A (Minimal):**
1. **Priority:** CRITICAL — Must do before Feature 051 merges
2. **Why:** 2-3 hour fix prevents production regression
3. **Implementation:**
   - Replace bridge import with local summaryService call
   - Use extractive method (deterministic, no LLM risk)
   - Add `teamRun.generateSummary` tRPC procedure for UI on-demand access
4. **Testing:** Integration test that verifies summary generated on run stop
5. **Future:** Implement Option B (LLM summaries) as follow-up feature

---

## Open Questions

1. **Where is summary text stored?**
   - `agentRunSummaries` table only has budget metrics, not text
   - Is summary returned to frontend and stored in memory only?
   - Is summary stored as system message in `teamRoomMessages`?
   - **Resolution:** Clarify schema before Feature 051; add column if needed

2. **Is `recoverActiveRunsOnStartup()` actually called?**
   - Function exists but need to verify it's invoked on server startup
   - Should be in `apps/web/server/_core/index.ts` or server init
   - **Resolution:** Verify in startup code; add call if missing

3. **What's the expected summary format for UI display?**
   - RunSummary interface has arrays (keyDecisions, keyFindings, etc.)
   - UI component to display these?
   - Standalone summary view or embedded in run message list?
   - **Resolution:** Check TeamRoomView.tsx for summary rendering

4. **Should users be able to choose summary method?**
   - Current: always extractive (via bridge, which is removed)
   - LLM summaries available but need Node.js implementation
   - **Resolution:** Clarify product requirement before implementation

5. **Auto-team runs can pause for human approval — what then?**
   - Run status becomes 'paused'
   - Auto-advance queue cleared (line 855)
   - Can user resume and continue background loop?
   - **Resolution:** Verify resume logic (line 878-880) works as expected

---

## Verification Checklist

- [ ] Start auto_team run via `teamRun.start` with `executionMode='auto_team'`
- [ ] Close browser immediately after start
- [ ] Wait 30 seconds
- [ ] Query `teamRoomMessages` for new messages — should have 1-3 agent turns
- [ ] Query `teamRuns` — status should still be 'running' or 'completed' (depending on stop policy)
- [ ] Open browser and reconnect — verify SSE replays missed messages
- [ ] After run completes, verify summary generated (query `agentRunSummaries`)
- [ ] Restart server while auto_team run active — verify run continues (check logs)
- [ ] Call `teamRun.advance` while paused — verify manual advance works

---

## File Reference Map

| Purpose | File | Key Functions |
|---------|------|----------------|
| Run lifecycle | `apps/web/server/services/runEngine.ts` | `startRun`, `advanceRun`, `stopRun`, `recoverActiveRunsOnStartup` |
| Auto-advance loop | `apps/web/server/services/runEngine.ts:338-359` | `queueAutoAdvance()`, auto-stop checker |
| Message storage | `apps/web/server/services/roomService.ts` | `postWorkUpdate()`, `sendMessage()` |
| Summary generation | `apps/web/server/services/summaryService.ts` | `generateSummary()` |
| Python bridge (TO DELETE) | `apps/web/server/services/teamOrchestrationBridge.ts` | (marked for removal in Feature 051) |
| Schema | `apps/web/drizzle/schema.ts:6259-6332` | `teamRoomMessages`, `teamRuns` |
| tRPC router | `apps/web/server/routers/teamRun.ts` | `start`, `advance`, `stop`, `pause`, `resume`, `get` |
| tRPC room router | `apps/web/server/routers/teamRoom.ts` | `getMessages` (but no `listRuns` procedure) |
| Server startup | `apps/web/server/_core/index.ts` | Must call `recoverActiveRunsOnStartup()` |
| SSE streaming | `apps/web/server/routes/orchestratorStream.ts` | Real-time events (not critical for background) |

---

## Summary

**Current State:** Team Room background execution works correctly. Auto_team runs progress independently via in-memory timers and are recoverable after process restart. All messages and run state persisted to database.

**Gaps:**
- Session history endpoint missing (UI cannot show past runs)
- Summary generation will break in Feature 051 (Python bridge removed)
- Summary generation not exposed to user (no on-demand endpoint)

**Feature 051 Impact:** Summary generation at run completion will fail. Must replace Python bridge call with local Node.js version before merging Feature 051.

**Recommendation:** Implement Option A (minimal fix) as part of Feature 051 review: 2-3 hour task to replace bridge with `summaryService.generateSummary()` using extractive method.
