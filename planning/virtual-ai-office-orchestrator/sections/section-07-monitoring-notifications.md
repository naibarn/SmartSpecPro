I now have enough context. Let me produce the section content.

# Section 07 -- Monitoring Service and Notification Extension

## Overview

This section implements two new services for the Virtual AI Office Orchestrator:

1. **`monitoringService.ts`** -- Records agent activity events, captures periodic run snapshots, computes per-agent run summaries on completion, and detects stuck/looping agents.
2. **Notification extension** -- Extends the existing `notificationService.ts` to support orchestrator-specific notification types, along with a new `orchestrator_notifications` table for persistent, team-aware notification records.

**Dependencies on prior sections (must be completed first):**
- Section 01 (schema-identity): `assistant_profiles`, `assistant_teams` tables must exist
- Section 02 (schema-rooms-runs): `team_rooms`, `team_runs`, `agent_activity_events`, `agent_run_summaries`, `run_snapshots`, `orchestrator_notifications` tables must exist in `drizzle/schema.ts`
- Section 05 (room-run-engine): The run engine calls `monitoringService` methods; this section defines those methods

**Blocks:**
- Section 14 (frontend-room-monitor): Consumes monitoring data
- Section 09 (inter-agent-communication): References notification delivery
- Section 10 (trpc-routers): Exposes monitoring data via tRPC

---

## File Inventory

| File | Action |
|------|--------|
| `apps/web/server/services/monitoringService.ts` | **Create** |
| `apps/web/server/services/__tests__/monitoringService.test.ts` | **Create** |
| `apps/web/server/services/orchestratorNotificationService.ts` | **Create** |
| `apps/web/server/services/__tests__/orchestratorNotificationService.test.ts` | **Create** |

---

## Schema Context (from Section 02)

The following tables are defined in Section 02 and consumed by this section. They are reproduced here so the implementer does not need to look elsewhere.

### `agent_activity_events`

Append-only event log for monitoring. Fields:

- `id` (uuid PK)
- `tenantId`, `teamId`, `roomId`, `runId`, `assistantId` -- foreign keys for scoping
- `eventType` (text) -- e.g. `"assistant_message_final"`, `"tool_call_started"`, `"handoff_requested"`
- `eventCategory` (enum: `status_change`, `communication`, `tool_use`, `memory_op`, `artifact_op`, `handoff`, `approval`, `error`)
- `visibility` (enum: `transparent`, `milestone`, `summary_only`, `private_internal`)
- `summary` (text) -- human-readable one-liner
- `detailJson` (jsonb) -- arbitrary event-specific payload
- `tokenUsageSnapshot` (int) -- cumulative tokens at time of event
- `costSnapshot` (numeric) -- cumulative cost at time of event
- `durationMs` (int) -- how long this specific action took
- `createdAt` (timestamp)

Indexes: `(runId, createdAt)`, `(assistantId, createdAt)`.

### `agent_run_summaries`

Per-agent performance summary, computed once on run completion. Fields:

- `id` (uuid PK), `runId`, `assistantId`
- Counters: `turnCount`, `totalInputTokens`, `totalOutputTokens`, `totalCostCredits`, `toolCallCount`, `toolSuccessCount`, `toolFailureCount`, `memoriesRead`, `memoriesWritten`, `memoriesPromoted`, `artifactsCreated`, `handoffsSent`, `handoffsReceived`, `errorCount`
- Timing: `activeDurationMs`, `waitDurationMs`
- `createdAt`

### `run_snapshots`

Periodic state captures during active runs. Fields:

- `id` (uuid PK), `runId`, `capturedAt`
- `activeAssistantId`
- `agentStatusesJson` (jsonb) -- map of assistantId to status
- `tokenUsageJson` (jsonb) -- cumulative token counts
- `costJson` (jsonb) -- cumulative cost breakdown
- `artifactCountJson` (jsonb)
- `pendingApprovalsCount` (int)

### `orchestrator_notifications`

Persistent notification records for orchestrator events. Fields:

- `id` (uuid PK), `tenantId`, `userId`
- `teamId` (nullable), `roomId` (nullable), `runId` (nullable)
- `notificationType` (text) -- e.g. `"agent_stuck"`, `"budget_warning"`, `"run_completed"`
- `severity` (enum: `info`, `warning`, `error`, `critical`)
- `title`, `body` (text)
- `actionUrl` (nullable)
- `isRead` (bool), `isDismissed` (bool)
- `createdAt`, `readAt` (nullable)

---

## Existing Patterns to Follow

### Notification Service

The existing notification service is at `/home/dev/projects/SmartSpecPro/apps/web/server/services/notificationService.ts`. It exports a `createNotification` function that inserts into `user_notifications` and optionally enqueues Telegram delivery. The orchestrator notification service should follow a similar fire-and-forget pattern but write to the `orchestrator_notifications` table instead and publish an SSE event via Redis pub/sub.

### Audit Logger

The existing audit logger at `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts` defines `AuditEventType` and writes JSONL. The monitoring service should add new audit event types for orchestrator events (e.g. `"orchestrator_event_recorded"`, `"orchestrator_snapshot_captured"`, `"orchestrator_stuck_detected"`).

### Queue Health Monitor

The pattern in `/home/dev/projects/SmartSpecPro/apps/web/server/services/queueHealthMonitor.ts` shows how to build a periodic background check with configurable thresholds and severity levels. The stuck-agent detector should follow a similar interval-check approach.

---

## Tests (Write First)

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/monitoringService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for monitoringService.ts
 *
 * Uses a mock Drizzle DB and mock Redis client.
 * Each test verifies a single responsibility of the monitoring service.
 */

describe("monitoringService", () => {

  describe("recordEvent", () => {
    it("creates an agent_activity_event with correct fields", async () => {
      // Arrange: mock db.insert chain returning { id: "evt-1" }
      // Act: call recordEvent(runId, assistantId, "assistant_message_final", { ... })
      // Assert: db.insert called with agent_activity_events table
      // Assert: inserted values include tenantId, teamId, roomId, runId, assistantId,
      //         eventType, eventCategory, visibility, summary, detailJson, createdAt
    });

    it("publishes event to Redis pub/sub channel keyed by runId", async () => {
      // Arrange: mock redis.publish
      // Act: call recordEvent(...)
      // Assert: OrchestratorEventBus.publishEvent called with runId
      //         and JSON-serialized event payload (publishes to orchestrator:run:{runId})
    });
  });

  describe("captureSnapshot", () => {
    it("saves all agent statuses at capture time into run_snapshots", async () => {
      // Arrange: mock db queries for active run agents, token usage, cost
      // Act: call captureSnapshot(runId)
      // Assert: db.insert called with run_snapshots table
      // Assert: agentStatusesJson contains status for each agent
      // Assert: capturedAt is set to current time
    });
  });

  describe("computeRunSummaries", () => {
    it("produces one agent_run_summaries row per agent per run", async () => {
      // Arrange: mock db query returning activity events for 3 agents
      // Act: call computeRunSummaries(runId)
      // Assert: db.insert called 3 times (once per agent) on agent_run_summaries
      // Assert: each row has correct turnCount, totalInputTokens, etc. aggregated
    });
  });

  describe("detectStuckAgent", () => {
    it("returns stuck=true when agent has no events for longer than threshold", async () => {
      // Arrange: mock db query returning last event for agent at (now - thresholdMs - 1000)
      // Act: call detectStuckAgent(runId, thresholdMs=60000)
      // Assert: result includes { stuck: true, assistantId, lastEventAt }
    });

    it("returns stuck=false when agent has recent events", async () => {
      // Arrange: mock db query returning last event for agent at (now - 5000)
      // Act: call detectStuckAgent(runId, thresholdMs=60000)
      // Assert: result includes { stuck: false }
    });
  });

  describe("notifyOrchestrator", () => {
    it("creates orchestrator_notification record and publishes SSE event", async () => {
      // Arrange: mock db.insert, mock redis.publish
      // Act: call notifyOrchestrator(userId, { ... notification params })
      // Assert: db.insert called with orchestrator_notifications table
      // Assert: redis.publish called with user notification channel
    });
  });

});
```

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/orchestratorNotificationService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for orchestratorNotificationService.ts
 *
 * Verifies notification CRUD, preference management, and delivery.
 */

describe("orchestratorNotificationService", () => {

  describe("createOrchestratorNotification", () => {
    it("inserts notification with all required fields", async () => {
      // Arrange: mock db.insert
      // Act: call with tenantId, userId, notificationType, severity, title, body
      // Assert: correct values inserted into orchestrator_notifications
    });

    it("publishes to Redis SSE channel for real-time delivery", async () => {
      // Arrange: mock redis.publish
      // Act: call createOrchestratorNotification(...)
      // Assert: redis.publish called with channel "user:notifications:{userId}"
    });
  });

  describe("markRead", () => {
    it("updates isRead and readAt for the given notification", async () => {
      // Arrange: mock db.update chain
      // Act: call markRead(notificationId)
      // Assert: isRead=true and readAt is set to current timestamp
    });
  });

  describe("markAllRead", () => {
    it("marks all unread notifications for a user as read", async () => {
      // Arrange: mock db.update chain with where clause
      // Act: call markAllRead(userId)
      // Assert: update WHERE userId=X AND isRead=false
    });
  });

  describe("dismiss", () => {
    it("sets isDismissed=true without deleting the record", async () => {
      // Arrange: mock db.update chain
      // Act: call dismiss(notificationId)
      // Assert: isDismissed=true in update
    });
  });

  describe("listNotifications", () => {
    it("returns paginated notifications filtered by userId and isRead", async () => {
      // Arrange: mock db.select chain returning 5 notifications
      // Act: call listNotifications(userId, { isRead: false, limit: 10, cursor })
      // Assert: results filtered and ordered by createdAt desc
    });
  });

});
```

---

## Implementation Details

### 1. Monitoring Service (`monitoringService.ts`)

**Location:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/monitoringService.ts`

This is a new service file. It should export the following functions:

#### `recordEvent(params)`

```typescript
// Note: Uses module-level db import, matching codebase convention.
// The db instance is NOT passed as a parameter.
interface RecordEventParams {
  tenantId: string; // varchar(36) matching tenants.id convention
  teamId: string;
  roomId: string;
  runId: string;
  assistantId: string;
  eventType: string;
  eventCategory: AgentEventCategory; // from schema enum
  visibility: EventVisibility;       // from schema enum
  summary: string;
  detailJson?: Record<string, unknown>;
  tokenUsageSnapshot?: number;
  costSnapshot?: number;
  durationMs?: number;
}
```

Steps:
1. Generate a UUID for the event ID.
2. Insert into `agent_activity_events` table using Drizzle.
3. Construct an SSE-compatible event envelope: `{ eventId, eventType, tenantId, teamId, roomId, runId, ts: createdAt, actorType: "assistant", actorId: assistantId, visibility, data: detailJson }`.
4. Publish the envelope to Redis pub/sub channel `orchestrator:run:{runId}` using `OrchestratorEventBus.publishEvent(...)` from `orchestratorEventBus.ts` (Section 11).
5. Return the created event record.

This function is called by the run engine (Section 05) after every significant agent action.

#### `captureSnapshot(runId: string)`

```typescript
// Note: Uses module-level db import. No db parameter.
```

Steps:
1. Query the current run from `team_runs` to get `activeAssistantId`.
2. Query all participants for the run's room from `team_room_participants`.
3. For each agent participant, determine current status based on the most recent `agent_activity_events` entry (e.g., last event type maps to idle/active/thinking/error).
4. Aggregate token usage and cost from `agent_activity_events` grouped by assistantId.
5. Count pending approvals from `automation_handoffs` where status is `"pending"`.
6. Insert a `run_snapshots` row with all gathered data.

The run engine should call `captureSnapshot` on a configurable interval (default every 15 seconds during an active run). This can be implemented as a `setInterval` that is started when a run begins and cleared when it pauses/stops.

#### `computeRunSummaries(params)`

```typescript
interface ComputeRunSummariesParams {
  runId: string;
  // Uses module-level db import (no DI), matching recordEvent/captureSnapshot pattern
}
```

Steps:
1. Query all `agent_activity_events` for the given `runId`, grouped by `assistantId`.
2. For each agent, compute aggregate metrics:
   - `turnCount`: count events where eventType is `"assistant_message_final"`
   - `totalInputTokens`, `totalOutputTokens`: sum from `detailJson.tokenUsage` fields
   - `totalCostCredits`: max `costSnapshot` (cumulative)
   - `toolCallCount`, `toolSuccessCount`, `toolFailureCount`: count events in `tool_use` category
   - `memoriesRead`, `memoriesWritten`, `memoriesPromoted`: count events in `memory_op` category
   - `artifactsCreated`: count events in `artifact_op` category
   - `handoffsSent`, `handoffsReceived`: count events in `handoff` category
   - `errorCount`: count events in `error` category
   - `activeDurationMs`: sum of `durationMs` for active events
   - `waitDurationMs`: total run duration minus active duration
3. Insert one `agent_run_summaries` row per agent.

Called by the run engine's `stopRun` function after the run transitions to `completed` or `stopped`.

#### `detectStuckAgent(params)`

```typescript
interface DetectStuckAgentParams {
  runId: string;
  thresholdMs: number; // default 120_000 (2 minutes)
  // Uses module-level db import (no DI), matching recordEvent/captureSnapshot pattern
}

interface StuckAgentResult {
  stuck: boolean;
  stuckAgents: Array<{
    assistantId: string;
    lastEventAt: Date;
    idleDurationMs: number;
  }>;
}
```

Steps:
1. Query the most recent `agent_activity_events` for each active agent in the run, using a subquery with `MAX(createdAt)` grouped by `assistantId`.
2. Compare each agent's last event time against `Date.now() - thresholdMs`.
3. Any agent whose last event is older than the threshold is flagged as stuck.
4. If any stuck agents found, call `notifyOrchestrator` with a warning notification.

This should be invoked periodically (e.g., every snapshot interval) or after each turn completes and the next agent does not respond within the threshold.

#### `notifyOrchestrator(params)`

```typescript
interface NotifyOrchestratorParams {
  tenantId: string;  // varchar UUID, matching all other sections
  userId: number;
  teamId?: string;
  roomId?: string;
  runId?: string;
  notificationType: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  body: string;
  actionUrl?: string;
}
```

Steps:
1. Insert into `orchestrator_notifications` table.
2. Publish to Redis channel `orchestrator:user:{userId}` for SSE delivery (Section 11 will consume this).
3. For `critical` severity, also call the existing `createNotification` from `notificationService.ts` to ensure it appears in the standard notification UI.
4. Return the notification ID.

### 2. Orchestrator Notification Service (`orchestratorNotificationService.ts`)

**Location:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/orchestratorNotificationService.ts`

This service handles CRUD and delivery for orchestrator-specific notifications. It wraps the `orchestrator_notifications` table and provides the query patterns needed by the tRPC router (Section 10).

#### Exported Functions

- **`createOrchestratorNotification(params)`** -- Insert + Redis publish (delegates to `monitoringService.notifyOrchestrator` internally, or can be a standalone function if preferred).
- **`listNotifications(userId, filters)`** -- Paginated query with cursor-based pagination. Filters: `isRead`, `severity`, `notificationType`, `teamId`, `runId`. Order by `createdAt DESC`.
- **`markRead(notificationId)`** -- Set `isRead = true`, `readAt = new Date()`.
- **`markAllRead(userId)`** -- Bulk update all unread notifications for the user.
- **`dismiss(notificationId)`** -- Set `isDismissed = true`. Does not delete the record.
- **`getUnreadCount(userId)`** -- `SELECT COUNT(*) WHERE userId = X AND isRead = false AND isDismissed = false`. Used by sidebar badge (Section 12).

### 3. Notification Types Taxonomy

The `notificationType` field on `orchestrator_notifications` uses these values:

| Type | Severity | When |
|------|----------|------|
| `run_started` | info | A run begins execution |
| `run_completed` | info | A run finishes successfully |
| `run_failed` | error | A run terminates with error |
| `run_stopped` | warning | A run is stopped by user or policy |
| `agent_stuck` | warning | Agent has no events beyond threshold |
| `agent_loop_detected` | warning | A-B-A-B cycle detected 3+ times |
| `agent_error` | error | Agent turn resulted in an error |
| `budget_warning` | warning | Run cost exceeds 80% of budget |
| `budget_exceeded` | critical | Run cost exceeds 100% of budget, run stopped |
| `approval_required` | info | Human-in-loop checkpoint reached |
| `summary_ready` | info | Run summary has been generated |
| `system_incident` | critical | System resource degradation affecting runs |

### 4. Integration Points

**Run Engine (Section 05) calls monitoring service:**
- After each turn: `recordEvent(...)` with the turn result
- On run start: `recordEvent(...)` with `eventType: "run_started"`
- On run pause/resume/stop: `recordEvent(...)` with corresponding type
- On run stop: `computeRunSummaries(runId)`
- Periodic interval during active run: `captureSnapshot(runId)` and `detectStuckAgent(runId)`

**SSE Streaming (Section 11) subscribes to Redis channels:**
- `orchestrator:run:{runId}` -- for run-scoped event streams
- `orchestrator:user:{userId}` -- for user notification streams

**tRPC Routers (Section 10) call notification service:**
- `monitoring.getActivityTimeline` queries `agent_activity_events`
- `notification.list` / `notification.markRead` / `notification.markAllRead` call `orchestratorNotificationService`

**Redis Pub/Sub Channel Convention:**
- Event channels: `orchestrator:run:{runId}` -- publishes all activity events for a run
- Team channels: `orchestrator:team:{teamId}` -- aggregates events across all runs for a team
- User notification channels: `orchestrator:user:{userId}` -- user-scoped notifications

### 5. Snapshot Interval Manager

The snapshot capture and stuck detection should run on a periodic interval during active runs. Implement a lightweight manager:

```typescript
/** Manages periodic snapshot capture for active runs. */
class SnapshotIntervalManager {
  private intervals: Map<string, NodeJS.Timeout>; // runId -> interval handle

  /** Start capturing snapshots for a run. Called by runEngine.startRun. */
  startCapture(runId: string, intervalMs?: number): void;

  /** Stop capturing snapshots. Called by runEngine.stopRun/pauseRun. */
  stopCapture(runId: string): void;

  /** Resume capturing. Called by runEngine.resumeRun. */
  resumeCapture(runId: string, intervalMs?: number): void;
}
```

Default interval: 15 seconds. Each tick calls `captureSnapshot(runId)` and `detectStuckAgent(runId, 120_000)`.

Export a singleton instance so the run engine can import and use it:

```typescript
export const snapshotManager = new SnapshotIntervalManager();
```

### 6. Event Category Mapping

When calling `recordEvent`, the caller provides an `eventType` string. The service should map it to the correct `eventCategory` enum value. Provide a helper:

```typescript
function categorizeEvent(eventType: string): AgentEventCategory {
  // status_change: run_started, run_paused, run_completed, run_failed, agent_status_changed
  // communication: assistant_message_final, assistant_message_delta, handoff_requested, handoff_completed
  // tool_use: tool_call_started, tool_call_completed
  // memory_op: memory_written, memory_promoted
  // artifact_op: artifact_created, artifact_updated
  // handoff: handoff_requested, handoff_completed
  // approval: approval_required, approval_resolved
  // error: agent_error, agent_retry
}
```

This mapping should be a simple lookup object, not a complex switch statement.

---

## Implementation Checklist

1. Write tests in `__tests__/monitoringService.test.ts` (stubs above)
2. Write tests in `__tests__/orchestratorNotificationService.test.ts` (stubs above)
3. Create `monitoringService.ts` with: `recordEvent`, `captureSnapshot`, `computeRunSummaries`, `detectStuckAgent`, `notifyOrchestrator`, `categorizeEvent`, `SnapshotIntervalManager`
4. Create `orchestratorNotificationService.ts` with: `createOrchestratorNotification`, `listNotifications`, `markRead`, `markAllRead`, `dismiss`, `getUnreadCount`
5. Verify tests pass with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/__tests__/monitoringService.test.ts server/services/__tests__/orchestratorNotificationService.test.ts`
6. Confirm the monitoring service integrates with the Redis pub/sub channel convention used by SSE (Section 11) and the tRPC query patterns used by the monitoring router (Section 10)