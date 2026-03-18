# Section 18: Integration Tests & Final Quality Verification

## Overview

This section defines the integration test suite that validates cross-section interactions, end-to-end flows, and performance under load. It is the final implementation section — all other sections (01-17) must be complete before these tests can fully pass.

**Depends on:** All sections 01-17
**Blocks:** Nothing — this is the final section

**Files to create:**
- `apps/web/server/services/__tests__/integration/teamRunLifecycle.test.ts`
- `apps/web/server/services/__tests__/integration/memoryScopeIsolation.test.ts`
- `apps/web/server/services/__tests__/integration/interAgentCommunication.test.ts`
- `apps/web/server/services/__tests__/integration/externalIntake.test.ts`
- `python-backend/tests/integration/test_team_orchestrator.py`
- `python-backend/tests/integration/test_memory_embedding.py`

---

## Test 1: Full Run Lifecycle

File: `apps/web/server/services/__tests__/integration/teamRunLifecycle.test.ts`

Tests the complete flow: create team → create room → start run → agent turns → stop → summary.

```typescript
describe("Team Run Lifecycle (integration)", () => {
  it("creates team from template with 3 agents", async () => {
    // teamService.createFromTemplate → verify agency + team + 3 profiles created
  });

  it("creates team room and adds all participants", async () => {
    // roomService.createRoom → verify room + 4 participants (1 user + 3 agents)
  });

  it("starts run with stop policy and executes 3 turns", async () => {
    // runEngine.startRun → verify status=running
    // Mock LLM responses for 3 turns
    // Verify: 3 team_room_messages with senderType=assistant
    // Verify: 3 agent_activity_events recorded
    // Verify: budgetSnapshotJson updated after each turn
  });

  it("stop policy triggers after maxRounds", async () => {
    // Set stopPolicy.maxRounds=3
    // After turn 3: evaluateStopPolicy returns shouldStop=true
    // Verify: run status=completed, stopReason=max_rounds_reached
  });

  it("generates agent_run_summaries on completion", async () => {
    // Verify: 3 agent_run_summaries rows (one per agent)
    // Verify: turnCount, totalInputTokens, totalCostCredits correct
  });

  it("generates final summary when requireFinalSummary=true", async () => {
    // Verify: summaryService called, summaryArtifactId set on run
  });

  it("orchestrator notification sent on run completion", async () => {
    // Verify: orchestrator_notifications row with type=run_completed
  });
});
```

## Test 2: Memory Scope Isolation

File: `apps/web/server/services/__tests__/integration/memoryScopeIsolation.test.ts`

```typescript
describe("Memory Scope Isolation (integration)", () => {
  it("agent A writes private memory, agent B cannot read it", async () => {
    // createMemory(ownerType=agent, ownerId=A, visibility=private)
    // searchMemories(scopes=[{type: agent, id: B}]) → result excludes A's memory
  });

  it("agent writes to team scope, all agents can read", async () => {
    // createMemory(ownerType=team, ownerId=teamId, visibility=shared_team)
    // searchMemories with any agent scope from same team → memory included
  });

  it("memory promotion creates audit trail", async () => {
    // createMemory(ownerType=agent, ownerId=A)
    // promoteMemory(memoryId, toOwnerType=team, toOwnerId=teamId)
    // Verify: memory_promotions record exists with correct from/to
  });

  it("hybrid retrieval combines keyword + vector scores", async () => {
    // createMemory with embedding + content matching query
    // searchMemories with embedding in options
    // Verify: combined score uses both keyword and vector weights
  });

  it("retrieveForPrompt returns memories in scope priority order", async () => {
    // Create memories across agent, run, room, team scopes
    // retrieveForPrompt → verify agent scope memories come first
  });
});
```

## Test 3: Inter-Agent Communication

File: `apps/web/server/services/__tests__/integration/interAgentCommunication.test.ts`

```typescript
describe("Inter-Agent Communication (integration)", () => {
  it("system incident triggers impact assessment on active runs", async () => {
    // Setup: active team_run
    // Call: assessImpact(incidentId, "llm_provider_down", ["openai"])
    // Verify: run paused, inter_agent_messages created, notification sent
  });

  it("system broadcast injects message into team room timeline", async () => {
    // Call: sendSystemBroadcast([roomId], "provider_degraded", "OpenAI is slow")
    // Verify: team_room_messages has entry with senderType=system
  });

  it("team escalation creates incident in 046", async () => {
    // Call: handleTeamEscalation(roomId, runId, assistantId, "tool_failure", context)
    // Verify: inter_agent_messages with channel=team_escalation
    // Mock: POST /api/internal/virtual-admin/team-escalation returns incidentId
  });

  it("resource state updates are readable by prompt composer", async () => {
    // Call: updateResourceState("provider:openai", "degraded", {...})
    // Call: getResourceState()
    // Verify: returns entry with correct status
  });
});
```

## Test 4: External Task Intake

File: `apps/web/server/services/__tests__/integration/externalIntake.test.ts`

```typescript
describe("External Task Intake (integration)", () => {
  it("external task submission creates inbox entry", async () => {
    // POST /v1/teams/:teamId/tasks with valid payload
    // Verify: external_task_inbox row with status=awaiting_review
  });

  it("inbox approval materializes into room + run", async () => {
    // externalTaskInbox.approve(taskId)
    // Verify: team_room created, team_run started, binding created
  });

  it("trusted source auto-materializes without approval", async () => {
    // Source with trustTier=trusted_internal
    // Verify: task goes directly to materialized status
  });

  it("rejected task does not create room or run", async () => {
    // externalTaskInbox.reject(taskId)
    // Verify: status=rejected, no room/run created
  });
});
```

## Test 5: Python Backend Integration

File: `python-backend/tests/integration/test_team_orchestrator.py`

```python
# pytest markers: @pytest.mark.integration

class TestTeamOrchestrator:
    async def test_execute_turn_calls_llm_and_returns_response(self):
        """POST /api/team-orchestrator/execute-turn returns content + tokenUsage"""

    async def test_execute_turn_tracks_cost_per_agent(self):
        """Token usage maps to correct credit cost"""

    async def test_generate_summary_returns_structured_output(self):
        """POST /api/team-orchestrator/generate-summary returns all required fields"""
```

File: `python-backend/tests/integration/test_memory_embedding.py`

```python
class TestMemoryEmbedding:
    async def test_embed_endpoint_returns_1536_dim_vector(self):
        """POST /api/memory/embed returns correct dimension vector"""

    async def test_search_endpoint_returns_ranked_results(self):
        """POST /api/memory/search returns results sorted by similarity"""

    async def test_batch_embedding_processes_multiple_items(self):
        """Batch endpoint handles array of content strings"""
```

---

## Load Testing Configuration

Create a load test script (not a formal test file — manual execution):

```bash
# Simulate 10 concurrent runs with 5 agents each
# Use k6 or artillery if available, otherwise a simple Node.js script

# Key metrics to validate:
# - agent_activity_events write throughput: target >500 events/second
# - SSE fan-out to 50 tabs: target <100ms delivery latency
# - Memory retrieval with 10K scoped_memories: target <200ms p95
# - Run start to first agent response: target <5s
```

---

## Final Quality Verification Checklist

After all integration tests pass:

1. **Schema completeness**: All 21+ tables exist in database (`psql "\dt"`)
2. **Migration journal**: All SQL files have entries in `drizzle/meta/_journal.json`
3. **Type check**: `cd apps/web && pnpm check` passes with zero errors
4. **Unit tests**: `cd apps/web && pnpm test` all pass
5. **Python tests**: `cd python-backend && pytest` all pass with >80% coverage
6. **SSE streaming**: Manual test — start run, open browser, verify events stream in real-time
7. **Backward compat**: Old chat conversations still load and render correctly
8. **Brainstorm cutover**: Old brainstorm conversations render in read-only mode
9. **Tenant isolation**: Verify team/room/memory queries always filter by tenantId
10. **Security**: Internal API endpoints require gateway token authentication
