---
name: Team Room Background Execution Quick Reference
description: One-page summary of background execution status, gaps, and Feature 051 impact
type: reference
---

# Team Room Background Execution — Quick Reference

## Status

| Component | Status | Risk | Notes |
|-----------|--------|------|-------|
| **Background execution** | ✅ WORKS | LOW | Auto_team mode progresses via `setTimeout` timers (not polling) |
| **Process restart recovery** | ✅ EXISTS | MEDIUM | Function `recoverActiveRunsOnStartup()` exists; verify it's called on init |
| **Message persistence** | ✅ COMPLETE | NONE | All turns stored to `teamRoomMessages` immediately |
| **Session history retrieval** | ❌ MISSING | MEDIUM | Data exists in schema but no tRPC procedure to list past runs |
| **Summary generation** | ⚠️ BREAKS IN FE051 | **CRITICAL** | Will fail when Python bridge removed; no Node.js replacement in plan |
| **SSE/Real-time updates** | ✅ OPTIONAL | NONE | Works for live UI; not required for background execution |

## Background Execution Flow (How It Works)

```
1. User starts auto_team run
2. queueAutoAdvance(runId, 3) → schedules 3 initial turns via setTimeout()
3. [Browser can close now]
4. Each turn completes → evaluates work items
5. If work items remain → queueAutoAdvance(runId, 1, 200ms) loops
6. Auto-stop checker runs every 30s (checks budget, time, idle)
7. Loop continues until stop condition or no work items
8. All messages persisted to DB throughout
```

## Gap: Missing Session History Endpoint

**Problem:** Users cannot see list of past runs in a room

**Data available:** All in `teamRuns` table with indexes
- `team_runs_room_status_idx` on (roomId, status)

**Workaround:** Admin query:
```sql
SELECT id, executionMode, status, objective, startedAt, endedAt
FROM team_runs
WHERE roomId = 'xxx' ORDER BY startedAt DESC;
```

**Fix:** Add tRPC procedure
```typescript
export const teamRoom = router({
  listRuns: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return db.select().from(teamRuns)
        .where(and(eq(teamRuns.roomId, input.roomId),
                   eq(teamRuns.tenantId, tenantId)))
        .orderBy(desc(teamRuns.startedAt));
    })
})
```

## CRITICAL: Summary Generation Will Break in Feature 051

**Current code (line 1194-1205 in runEngine.ts):**
```typescript
const bridge = await import("./teamOrchestrationBridge");
(bridge.generateSummary as Function)(run.roomId, runId).catch(() => {});
```

**Problem:** Feature 051 deletes `teamOrchestrationBridge.ts` and Python endpoints

**Impact:** On run completion, this throws error → summary never generated

**Fix (must implement in Feature 051):**
```typescript
// Replace bridge call with:
const { generateSummary } = await import("./summaryService");
generateSummary({ runId, tenantId, method: "extractive" })
  .catch(() => {});
```

**Also add tRPC procedure for on-demand summary:**
```typescript
export const teamRun = router({
  generateSummary: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return summaryService.generateSummary({
        runId: input.runId,
        tenantId,
        method: "extractive"  // use extractive (no LLM risk)
      });
    })
})
```

## Process Restart Recovery

**Function exists:** `recoverActiveRunsOnStartup()` at line 1301-1340 in runEngine.ts

**What it does:**
1. Queries `teamRuns WHERE status='running'`
2. For each run: restarts auto-stop checker + queues 1 turn (if auto_team)
3. Timers resume; runs continue

**VERIFY:** Must be called on server init. Check `apps/web/server/_core/index.ts` for:
```typescript
await runEngine.recoverActiveRunsOnStartup();
```

## Verification: Browser Close → Background Execution

1. Start auto_team run
2. Close browser immediately
3. Wait 30 seconds
4. Query DB: `SELECT COUNT(*) FROM teamRoomMessages WHERE runId=?`
   - Should have grown by 1-3 messages (agents turned in background)
5. Open browser, reconnect
   - SSE replays missed messages (uses lastEventId)
   - See full conversation history

## Key Files

| File | Purpose | Key Functions |
|------|---------|----------------|
| `runEngine.ts` | Run lifecycle | `startRun`, `advanceRun`, `stopRun`, `recoverActiveRunsOnStartup` |
| `runEngine.ts:338-359` | Auto-advance loop | `queueAutoAdvance()` — uses `setTimeout()` |
| `runEngine.ts:1269-1285` | Auto-stop checker | `startAutoStopChecker()` — uses `setInterval(30s)` |
| `roomService.ts` | Message storage | `postWorkUpdate()` — saves to `teamRoomMessages` |
| `summaryService.ts` | Summary generation | `generateSummary()` — extractive/LLM methods |
| `teamOrchestrationBridge.ts` | Python bridge (TO DELETE) | Will fail when removed |
| `orchestratorStream.ts` | SSE streaming | `/api/orchestrator/stream/run/:runId` (optional for BG execution) |
| `schema.ts:6310-6332` | Run table | `teamRuns` — stores status, timing, budget |
| `schema.ts:6259-6281` | Message table | `teamRoomMessages` — stores all turns |

## For Feature 051 Planning

**Must do before merge:**
1. ✅ Replace Python bridge call with `summaryService.generateSummary()` (line 1194)
2. ✅ Add `teamRun.generateSummary` tRPC procedure for on-demand access
3. ✅ Verify `recoverActiveRunsOnStartup()` is called on server init
4. ✅ Integration test: auto_team run to completion → verify summary generated

**Can do after (medium priority):**
1. Implement `teamRoom.listRuns` procedure for session history UI
2. Add summary display UI to TeamRoomView

**Already safe:**
- Auto-advance loop (stays unchanged)
- Message persistence (stays unchanged)
- Process restart recovery (stays unchanged)
