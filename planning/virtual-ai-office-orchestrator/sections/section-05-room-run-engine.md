Now I have all the context needed. Let me generate the section content.

# Section 05: Room & Run Engine

## Overview

This section implements the Room lifecycle service and Run execution engine -- the core runtime layer that drives multi-agent team conversations. The Room Service manages room creation, participant management, and message routing. The Run Engine orchestrates turn-based execution: start, pause, resume, stop, stop-policy evaluation, and per-agent budget tracking.

## Dependencies

- **section-01-schema-identity**: Provides `assistant_teams`, `assistant_profiles`, `user_orchestrator_profiles` tables and related Drizzle schema/types.
- **section-02-schema-rooms-runs**: Provides `team_rooms`, `team_room_participants`, `team_room_messages`, `team_runs`, `agent_activity_events`, `agent_run_summaries`, `run_snapshots`, `orchestrator_notifications` tables and related enums.
- **section-04-team-service**: Provides `teamService.ts` for loading team and member data.

## Blocked By This Section

Sections 06 (prompt composer / turn order), 07 (monitoring / notifications), 11 (SSE streaming), and 14 (frontend room monitor) all depend on the Room Service and Run Engine being available.

---

## Tests (Write First)

All tests use Vitest. Create two test files.

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/roomService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("RoomService", () => {
  describe("createRoom", () => {
    it("creates a team_room record and adds orchestrator user as participant", async () => {
      // Arrange: valid teamId, orchestratorUserId, roomType, goalPrompt
      // Assert: team_rooms row inserted, team_room_participants row for user with participantType='user'
    });

    it("adds all active team members as participants", async () => {
      // Arrange: team with 3 active assistant_profiles
      // Assert: 3 team_room_participants with participantType='assistant'
    });

    it("throws if teamId does not exist or is archived", async () => {
      // Assert: TRPCError with code NOT_FOUND
    });
  });

  describe("sendMessage", () => {
    it("routes user message to all agents when recipientType='all'", async () => {
      // Arrange: user sends message to room with 3 agents
      // Assert: team_room_messages row with recipientType='all'
    });

    it("routes user message to specific agent when recipientType='assistant'", async () => {
      // Arrange: user sends message with recipientAssistantId set
      // Assert: team_room_messages row with recipientType='assistant' and correct recipientAssistantId
    });

    it("validates sender is a participant in the room", async () => {
      // Arrange: userId not in team_room_participants
      // Assert: throws authorization error
    });
  });

  describe("getMessages", () => {
    it("returns all messages when viewMode='transparent'", async () => {
      // Arrange: room with messages of mixed visibility levels
      // Assert: all messages returned
    });

    it("filters out non-milestone messages when viewMode='milestone'", async () => {
      // Arrange: messages with visibility transparent, milestone, summary_only, private_internal
      // Assert: only transparent + milestone visibility messages returned
    });

    it("returns only summary turnType messages when viewMode='summary'", async () => {
      // Assert: only messages with turnType='summary' or visibility='summary_only'
    });

    it("excludes private_internal messages from user queries", async () => {
      // Arrange: messages with visibility='private_internal'
      // Assert: excluded when caller is a user (not system)
    });
  });
});
```

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/runEngine.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("RunEngine", () => {
  describe("startRun", () => {
    it("creates a team_run with status='queued', then transitions to 'running'", async () => {
      // Arrange: valid roomId, stopPolicy config, budget cap
      // Assert: team_runs row with status='running', startedAt set
    });

    it("rejects if user has reached max concurrent runs limit", async () => {
      // Arrange: user already has 3 active runs
      // Assert: throws rate limit error
    });
  });

  describe("executeTurn", () => {
    it("calls promptComposer, then LLM, then records events", async () => {
      // Arrange: mock promptComposer.composePrompt, mock LLM call, mock monitoringService.recordEvent
      // Assert: called in order, team_room_messages row created with agent response
    });

    it("tracks token usage and cost per agent in budgetSnapshot", async () => {
      // Arrange: LLM returns tokenUsage in response
      // Assert: team_runs.budgetSnapshotJson updated with per-agent cost accumulation
    });
  });

  describe("evaluateStopPolicy", () => {
    it("returns shouldStop=true when maxRounds reached", async () => {
      // Arrange: run with stopPolicy.maxRounds=5, current turn count=5
      // Assert: { shouldStop: true, reason: 'max_rounds_reached' }
    });

    it("returns shouldStop=true when maxBudgetCredits exceeded", async () => {
      // Arrange: run with stopPolicy.maxBudgetCredits=100, current cost=101
      // Assert: { shouldStop: true, reason: 'budget_exceeded' }
    });

    it("returns shouldStop=true when idleTimeoutSeconds elapsed", async () => {
      // Arrange: run with stopPolicy.idleTimeoutSeconds=60, last activity 65s ago
      // Assert: { shouldStop: true, reason: 'idle_timeout' }
    });

    it("returns shouldStop=true when lead emits summary and stopOnLeadSummary=true", async () => {
      // Arrange: latest message is from lead agent with turnType='summary'
      // Assert: { shouldStop: true, reason: 'lead_summary' }
    });

    it("returns shouldStop=true when maxDurationMinutes exceeded", async () => {
      // Arrange: run started 31 minutes ago, maxDurationMinutes=30
      // Assert: { shouldStop: true, reason: 'max_duration' }
    });

    it("returns shouldStop=true when stopOnConsensus=true and consensus detected", async () => {
      // Arrange: all agents have produced agreement messages (heuristic)
      // Assert: { shouldStop: true, reason: 'consensus_reached' }
    });

    it("returns shouldStop=true when stopOnArtifactReady=true and artifact produced", async () => {
      // Arrange: message with artifactRefsJson containing completed artifact
      // Assert: { shouldStop: true, reason: 'artifact_ready' }
    });

    it("returns shouldStop=false when no conditions met", async () => {
      // Arrange: all policy thresholds above current values
      // Assert: { shouldStop: false, reason: null }
    });
  });

  describe("pauseRun", () => {
    it("preserves activeAssistantId and sets status='paused'", async () => {
      // Arrange: running run with activeAssistantId set
      // Assert: team_runs.status='paused', activeAssistantId preserved
    });

    it("throws if run is not in 'running' status", async () => {
      // Arrange: run with status='completed'
      // Assert: throws invalid state error
    });
  });

  describe("resumeRun", () => {
    it("transitions from 'paused' back to 'running' and continues execution", async () => {
      // Arrange: paused run with preserved activeAssistantId
      // Assert: status='running', next turn begins
    });
  });

  describe("stopRun", () => {
    it("generates agent_run_summaries for each participant", async () => {
      // Arrange: run with 3 agents, various activity events
      // Assert: 3 agent_run_summaries rows with correct aggregated stats
    });

    it("triggers summary generation when requireFinalSummary=true", async () => {
      // Arrange: stopPolicy.requireFinalSummary=true
      // Assert: summaryService.generate called, summaryArtifactId set on team_runs
    });

    it("sets status='completed' and records stopReason", async () => {
      // Arrange: running run
      // Assert: team_runs.status='completed', stopReason set, endedAt set
    });
  });
});
```

---

## Implementation Details

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/roomService.ts`

The Room Service manages room lifecycle, participant management, and message routing.

#### Exported Functions

**`createRoom(input: CreateRoomInput): Promise<TeamRoom>`**

- Input shape: `{ teamId: string, orchestratorUserId: number, roomType: 'direct' | 'team' | 'auto-team' | 'job-review', goalPrompt: string, projectId?: string, viewMode?: string, autonomyLevel?: string }`
- Steps:
  1. Load team from `assistant_teams` using `teamId`. Validate team exists and status is `active`.
  2. Insert row into `team_rooms` with provided fields plus defaults (status='active', summaryMode from team defaults).
  3. Insert `team_room_participants` row for the orchestrator user with `participantType='user'`, `roleInRoom='orchestrator'`.
  4. Load all active `assistant_profiles` for the team. For each, insert a `team_room_participants` row with `participantType='assistant'`.
  5. Return the created room record.

**`sendMessage(input: SendMessageInput): Promise<TeamRoomMessage>`**

- Input shape: `{ roomId: string, senderType: 'user' | 'assistant' | 'system', senderUserId?: number, senderAssistantId?: string, recipientType: 'all' | 'assistant' | 'subgroup' | 'user', recipientAssistantId?: string, recipientGroupJson?: object, turnType: string, visibility: string, content: string, metadataJson?: object, tokenUsageJson?: object, runId?: string }`
- Steps:
  1. Validate sender is a participant in the room by querying `team_room_participants`.
  2. If `senderType='assistant'`, validate the `senderAssistantId` is a participant and is not muted.
  3. Insert row into `team_room_messages`.
  4. Publish event to Redis pub/sub channel `room:${roomId}:messages` for SSE fan-out (Section 11 will consume this).
  5. Return the created message.

Room-posting rule:

- assistant work that changes team-visible state must be emitted through `sendMessage` or a thin wrapper such as `postWorkUpdate`
- message metadata should support `workItemId`, `messageType`, `artifactRefs`, `citationRefs`, and `replyToMessageId`
- this is how research posts, critique replies, revision proposals, and final decisions become inspectable to both the real user and the rest of the team

**`getMessages(roomId: string, filters: MessageFilters): Promise<TeamRoomMessage[]>`**

- Filters shape: `{ viewMode?: 'transparent' | 'milestone' | 'summary', callerType: 'user' | 'system', cursor?: string, limit?: number }`
- Steps:
  1. Query `team_room_messages` for the given `roomId`, ordered by `createdAt`.
  2. Apply visibility filtering based on `viewMode`:
     - `transparent`: return all except `private_internal` (unless callerType is system).
     - `milestone`: return only messages with visibility in `['transparent', 'milestone']`.
     - `summary`: return only messages with `turnType='summary'` or `visibility='summary_only'`.
  3. Always exclude `private_internal` visibility when `callerType='user'`.
  4. Apply cursor-based pagination.
  5. Return filtered messages.

---

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/runEngine.ts`

The Run Engine manages the complete run lifecycle and coordinates turn execution.

#### Types

```typescript
interface StopPolicy {
  maxRounds: number;            // default 20
  maxDurationMinutes: number;   // default 30
  maxBudgetCredits: number;     // required
  stopOnConsensus: boolean;
  stopOnArtifactReady: boolean;
  stopOnLeadSummary: boolean;
  requireFinalSummary: boolean;
  idleTimeoutSeconds: number;
}

interface BudgetSnapshot {
  totalCreditsUsed: number;
  perAgent: Record<string, {
    inputTokens: number;
    outputTokens: number;
    creditsUsed: number;
    turnCount: number;
  }>;
}

interface StopEvaluation {
  shouldStop: boolean;
  reason: string | null;
}

interface StartRunInput {
  roomId: string;
  initiatedByUserId: number;
  executionMode: "team_chat" | "auto_team" | "review";
  objective: string;
  stopPolicy: StopPolicy;
  constraintsJson?: object;
  approvalPolicyJson?: object;
}
```

#### Exported Functions

**`startRun(input: StartRunInput): Promise<TeamRun>`**

- Steps:
  1. Check concurrent run limits: query `team_runs` where `status IN ('queued', 'running')` for the user. If count >= 3 (configurable per tenant), throw rate limit error. Also check tenant-level limit (default 10).
  2. Load the room and its team. Validate room status is `active`.
  3. Insert `team_runs` row with `status='queued'`, `stopPolicyJson`, `budgetSnapshotJson` initialized to zero counters.
  4. Determine the first agent: find the `assistant_profile` with `isLead=true` for the team.
  5. Update run `status='running'`, set `activeAssistantId` to the lead, set `startedAt`.
  6. Publish `run_started` event via `OrchestratorEventBus.publishEvent(...)` (publishes to `orchestrator:run:${runId}` and fan-out channels).
  7. Kick off the first turn asynchronously (do not block the response -- use `setImmediate` or a BullMQ job).
  8. Return the run record.

**`executeTurn(runId: string): Promise<void>`**

This is the core turn loop. It is called after each turn completes (and after startRun for the first turn).

- Steps:
  1. Load the run. If `status !== 'running'`, return (run was paused/stopped externally).
  2. Evaluate stop policy via `evaluateStopPolicy(runId)`. If `shouldStop`, call `stopRun(runId, reason)` and return.
  3. Determine next agent using the turn order engine (Section 06 dependency). For Phase 1, use the `activeAssistantId` from the run, or fall back to round-robin by `sortOrder`.
  4. Call `promptComposer.composePrompt(activeAssistantId, runId, turnInput)` (Section 06 dependency). For initial implementation, assemble a minimal prompt: persona system message + last N room messages.
  5. Call the Python backend via `agencyBridge` or a new `teamOrchestrationBridge` to execute the LLM call: `POST /api/team-orchestrator/execute-turn` with the composed prompt.
  6. Process the LLM response:
     a. Create a `team_room_messages` row with `senderType='assistant'`, `senderAssistantId`, the response content, and `tokenUsageJson`.
     b. Update `budgetSnapshotJson` on the `team_runs` row with accumulated tokens and cost.
     c. Record an `agent_activity_events` row via `monitoringService.recordEvent({ tenantId, teamId, roomId, runId, assistantId, eventType, eventCategory, visibility, summary, ... })` (Section 07). For initial implementation, insert directly.
     d. Extract `nextSpeakerHint` from the response metadata if present.
  7. Update `activeAssistantId` on the run to the next agent (from hint or turn order).
  8. Increment the internal round counter (track in `budgetSnapshotJson` or a dedicated field).
  9. Schedule the next turn: `setImmediate(() => executeTurn(runId))` or via BullMQ delayed job.

**`evaluateStopPolicy(runId: string): Promise<StopEvaluation>`**

Checks all 7 stop conditions in order. Returns on the first condition that is met.

- Steps:
  1. Load the run with its `stopPolicyJson` and `budgetSnapshotJson`.
  2. **maxRounds**: Count distinct turn messages in the run. If count >= `stopPolicy.maxRounds`, return `{ shouldStop: true, reason: 'max_rounds_reached' }`.
  3. **maxDurationMinutes**: Compare `Date.now() - run.startedAt` against `stopPolicy.maxDurationMinutes * 60 * 1000`. If exceeded, return `{ shouldStop: true, reason: 'max_duration' }`.
  4. **maxBudgetCredits**: Compare `budgetSnapshot.totalCreditsUsed` against `stopPolicy.maxBudgetCredits`. If exceeded, return `{ shouldStop: true, reason: 'budget_exceeded' }`.
  5. **idleTimeoutSeconds**: Query the most recent `agent_activity_events` for this run. If `Date.now() - lastEvent.createdAt > stopPolicy.idleTimeoutSeconds * 1000`, return `{ shouldStop: true, reason: 'idle_timeout' }`.
  6. **stopOnLeadSummary**: If `true`, check latest message from the lead agent. If its `turnType='summary'`, return `{ shouldStop: true, reason: 'lead_summary' }`.
  7. **stopOnConsensus**: If `true`, apply a heuristic: check if the last N messages (e.g., last 3) from different agents all contain agreement signals (this can be a simple keyword check in Phase 1, upgraded to LLM classification later). Return `{ shouldStop: true, reason: 'consensus_reached' }` if detected.
  8. **stopOnArtifactReady**: If `true`, check if any message in this run has `artifactRefsJson` with a status of `completed`. Return `{ shouldStop: true, reason: 'artifact_ready' }` if found.
  9. If none triggered, return `{ shouldStop: false, reason: null }`.

**`pauseRun(runId: string): Promise<TeamRun>`**

- Steps:
  1. Load the run. Validate `status === 'running'`.
  2. Update `status='paused'`. Do NOT clear `activeAssistantId` (preserve for resume).
  3. Publish `run_paused` event.
  4. Return updated run.

**`resumeRun(runId: string): Promise<TeamRun>`**

- Steps:
  1. Load the run. Validate `status === 'paused'`.
  2. Update `status='running'`.
  3. Publish `run_resumed` event.
  4. Schedule the next turn via `executeTurn(runId)`.
  5. Return updated run.

**`stopRun(runId: string, reason: string): Promise<TeamRun>`**

- Steps:
  1. Load the run. Validate `status IN ('running', 'paused')`.
  2. Update `status='completed'`, `stopReason=reason`, `endedAt=new Date()`.
  3. Compute `agent_run_summaries` for each participant:
     - Aggregate from `agent_activity_events` and `team_room_messages` for this run.
     - For each assistant: count turns, sum input/output tokens, sum cost, count tool calls (success/failure), count memory reads/writes/promotions, count artifacts created, count handoffs sent/received, count errors.
     - Insert one `agent_run_summaries` row per assistant.
  4. If `stopPolicy.requireFinalSummary` is `true`, call the summary service (Section 08 runtime dependency). If the summary service is not yet available, log a warning and skip.
  5. Publish `run_completed` event.
  6. Return updated run.

---

### Bridge to Python Backend

Create a thin HTTP client for team orchestration LLM calls.

#### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/teamOrchestrationBridge.ts`

```typescript
/**
 * HTTP client for Python team orchestrator endpoints.
 * Calls POST /api/team-orchestrator/execute-turn on the Python backend.
 */

interface ExecuteTurnRequest {
  runId: string;
  assistantId: string;
  prompt: string; // assembled by promptComposer
  modelId?: string;
  tenantId: string;
  userId: number;
}

interface ExecuteTurnResponse {
  content: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  costCredits: number;
  nextSpeakerHint?: string;
  metadata?: Record<string, unknown>;
}

export async function executeAgentTurn(
  params: ExecuteTurnRequest
): Promise<ExecuteTurnResponse>;
```

- Uses the same pattern as `agencyBridge.ts`: reads `ENV.pythonBackendUrl`, sends `SMARTSPEC_WEB_GATEWAY_TOKEN` for internal auth, has a configurable timeout (default 120s).

---

### Budget Tracking

Budget tracking is managed inside the run engine via `budgetSnapshotJson` on the `team_runs` row. After every turn:

1. The LLM response includes `tokenUsage` (inputTokens, outputTokens) and `costCredits`.
2. The engine reads the current `budgetSnapshotJson`, adds the turn's cost to the active agent's entry and the `totalCreditsUsed` counter.
3. The updated snapshot is written back atomically (single UPDATE with JSON merge).

The `evaluateStopPolicy` function reads this snapshot to check the `maxBudgetCredits` condition.

---

### Redis Pub/Sub Events

The run engine publishes events to Redis channels for downstream SSE consumption (Section 11). The channel naming convention is:

- `orchestrator:run:${runId}` -- all events for a specific run
- `orchestrator:team:${teamId}` -- aggregated events for a team

**Note:** Use `OrchestratorEventBus.publishEvent()` from `apps/web/server/services/orchestratorEventBus.ts` (Section 11) rather than calling Redis directly. The event bus handles fan-out to run, team, and user channels.

Events follow the envelope format defined in the plan:

```typescript
interface RunEvent {
  eventId: string;       // uuid
  eventType: string;     // e.g., 'run_started', 'assistant_message_final', 'run_completed'
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  ts: string;            // ISO timestamp
  actorType: "user" | "assistant" | "system";
  actorId: string;
  visibility: "transparent" | "milestone" | "summary_only" | "private_internal";
  data: Record<string, unknown>;
}
```

Use `redisPublisher.publish(channel, JSON.stringify(event))` from the existing Redis client in `apps/web/server/services/redis.ts`.

---

### Concurrency and Rate Limits

The run engine enforces these limits at `startRun`:

| Limit | Default | Source |
|-------|---------|--------|
| Max concurrent runs per user | 3 | Tenant setting or hardcoded default |
| Max concurrent runs per tenant | 10 | Platform setting or hardcoded default |

The check queries `team_runs` where `status IN ('queued', 'running')` filtered by user or tenant. If the limit is reached, `startRun` throws a `TRPCError` with code `TOO_MANY_REQUESTS`.

Sequential turn execution is enforced by the engine itself: only one `executeTurn` call runs at a time per run. The next turn is only scheduled after the current turn completes (or a timeout fires).

---

### Error Handling

- If the Python backend call fails during `executeTurn`, the engine should:
  1. Record an `agent_error` event in `agent_activity_events`.
  2. Retry once with exponential backoff (2 seconds).
  3. If retry fails, pause the run automatically with `stopReason='agent_execution_error'` and publish a notification to the orchestrator user.
- If `evaluateStopPolicy` throws, log the error and default to `shouldStop=false` (fail-open to avoid silently killing runs).
- All database operations within `stopRun` (writing summaries, updating status) should be wrapped in a Drizzle transaction.

---

### Integration Points Summary

| This section provides | Consumed by |
|----------------------|-------------|
| `roomService.createRoom` | Section 10 (tRPC teamRoom router), Section 17 (migration) |
| `roomService.sendMessage` | Section 10 (tRPC teamRoom router), `executeTurn` internally |
| `roomService.getMessages` | Section 10 (tRPC teamRoom router), Section 06 (prompt composer) |
| `runEngine.startRun` | Section 10 (tRPC teamRun router) |
| `runEngine.pauseRun / resumeRun / stopRun` | Section 10 (tRPC teamRun router) |
| `runEngine.executeTurn` | Called internally after startRun and after each turn |
| Redis pub/sub events | Section 11 (SSE streaming) |

| This section consumes | Provided by |
|-----------------------|-------------|
| `assistant_teams`, `assistant_profiles` schema | Section 01 |
| `team_rooms`, `team_room_messages`, `team_runs` schema | Section 02 |
| `teamService` for loading team/member data | Section 04 |
| `promptComposer.composePrompt` | Section 06 (stub with minimal implementation until available) |
| `monitoringService.recordEvent` | Section 07 (insert directly until available) |
| `summaryService.generate` | Section 08 (optional runtime call, skip if unavailable) |

---

### File Inventory

| File | Action |
|------|--------|
| `apps/web/server/services/roomService.ts` | Create |
| `apps/web/server/services/runEngine.ts` | Create |
| `apps/web/server/services/teamOrchestrationBridge.ts` | Create |
| `apps/web/server/services/__tests__/roomService.test.ts` | Create |
| `apps/web/server/services/__tests__/runEngine.test.ts` | Create |
