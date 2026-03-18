Now I have all the context needed. Let me produce the section content.

# Section 02 -- Schema: Rooms, Runs, and Monitoring Tables

## Overview

This section defines the Drizzle ORM schema for the rooms, runs, and monitoring subsystem of the Virtual AI Office Orchestrator. It covers eight new database tables plus their associated enums, indexes, and TypeScript types. These tables power team conversations (rooms), orchestrated execution sessions (runs), and the observability layer (activity events, summaries, snapshots, notifications).

**Depends on:** Section 01 (schema-identity) -- the `assistant_teams`, `assistant_profiles`, `tenants`, and `users` tables must exist before foreign keys in this section can reference them.

**Blocks:** Sections 05 (room-run-engine), 07 (monitoring-notifications), 10 (trpc-routers).

## File Paths

| Purpose | Absolute Path |
|---------|--------------|
| Schema definitions | `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (append to existing file) |
| Migration SQL (auto-generated) | `/home/dev/projects/SmartSpecPro/apps/web/drizzle/XXXX_team_rooms_runs.sql` |
| Schema tests | `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/teamRoomRunSchema.test.ts` |

## Tests -- Write First

Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/teamRoomRunSchema.test.ts`. All tests use Vitest. The tests validate the Drizzle type shapes, enum memberships, and referential constraints. They do not need a live database -- they verify the schema module exports and type inference.

### Test Stubs

```typescript
import { describe, it, expect } from "vitest";

// Import all new tables, enums, and types from schema
// import { teamRooms, teamRoomParticipants, teamRoomMessages, teamRuns, ... } from "../../drizzle/schema";

describe("Room & Message Schema (section 02)", () => {

  describe("team_rooms", () => {
    it("exports teamRooms pgTable with all required columns", () => {
      // Verify columns: id, tenantId, teamId, orchestratorUserId, roomType, title, goalPrompt, status, etc.
    });

    it("roomType enum contains all expected values", () => {
      // direct, team, auto-team, job-review
    });

    it("roomStatus enum contains all expected values", () => {
      // active, archived, paused
    });
  });

  describe("team_room_participants", () => {
    it("exports teamRoomParticipants with roomId FK and participantType enum", () => {
      // participantType: user, assistant, observer
    });

    it("has uniqueness constraint for same participant in same room", () => {
      // Verify the unique index on (roomId, participantAssistantId) or composite
    });
  });

  describe("team_room_messages", () => {
    it("senderType='assistant' requires senderAssistantId to be non-null at application level", () => {
      // This is an application-level constraint documented in the schema comments
      // The column itself is nullable; the service layer enforces the rule
    });

    it("visibility enum contains all expected values", () => {
      // transparent, milestone, summary_only, private_internal
    });

    it("turnType enum contains all expected values", () => {
      // discussion, handoff, review, decision, execution_update, summary
    });

    it("recipientType enum contains all expected values", () => {
      // all, assistant, subgroup, user
    });
  });
});

describe("Run & Execution Schema (section 02)", () => {

  describe("team_runs", () => {
    it("exports teamRuns pgTable with all required columns", () => {
      // id, roomId, teamId, status, stopPolicyJson, budgetSnapshotJson, etc.
    });

    it("runStatus enum contains all expected values", () => {
      // queued, running, paused, completed, failed, stopped
    });

    it("executionMode enum contains all expected values", () => {
      // team_chat, auto_team, review
    });

    it("stopPolicyJson column is typed as jsonb", () => {
      // Verify the column accepts the StopPolicy shape
    });

    it("status transitions follow valid state machine", () => {
      // Document: queued -> running -> paused -> running (resume)
      //                              -> completed
      //                              -> failed
      //                              -> stopped
      // This is enforced at the service layer, not DB constraint
    });

    it("budgetSnapshotJson tracks per-agent cost accumulation", () => {
      // Verify the $type annotation shape
    });
  });
});

describe("Monitoring Schema (section 02)", () => {

  describe("agent_activity_events", () => {
    it("exports agentActivityEvents with append-only design (no update/delete exposed)", () => {
      // Table has no updatedAt column -- it is append-only by design
    });

    it("eventCategory enum contains all expected values", () => {
      // status_change, communication, tool_use, memory_op, artifact_op, handoff, approval, error
    });

    it("has indexes on (runId, createdAt) and (assistantId, createdAt)", () => {
      // Verify index definitions exist
    });
  });

  describe("agent_run_summaries", () => {
    it("exports agentRunSummaries with per-agent performance fields", () => {
      // turnCount, totalInputTokens, totalOutputTokens, totalCostCredits, etc.
    });
  });

  describe("run_snapshots", () => {
    it("exports runSnapshots with periodic state capture fields", () => {
      // capturedAt, activeAssistantId, agentStatusesJson, tokenUsageJson, etc.
    });
  });

  describe("orchestrator_notifications", () => {
    it("exports orchestratorNotifications with all required fields", () => {
      // tenantId, userId, notificationType, severity, title, body, isRead, etc.
    });

    it("severity enum contains all expected values", () => {
      // info, warning, error, critical
    });
  });
});
```

## Schema Definitions

All new enums and tables go into `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, appended after the Section 01 identity tables.

### Conventions (Match Existing Codebase)

- **Primary keys**: `varchar("id", { length: 36 })` for UUIDs (matching agencies/agencyAgents pattern).
- **Foreign keys**: Use `.references(() => targetTable.column, { onDelete: "cascade" })` where parent deletion should cascade, or `"set null"` for optional references.
- **Timestamps**: `timestamp("name", { withTimezone: true }).defaultNow().notNull()`.
- **Enums**: Use `pgEnum()` at module scope, then reference in column definitions.
- **JSON columns**: Use `jsonb("name").$type<TypeShape>()` for typed JSON.
- **Type exports**: Every table gets `export type X = typeof table.$inferSelect` and `export type InsertX = typeof table.$inferInsert`.

### New Enums

The following pgEnums need to be defined. Name them with descriptive suffixes to avoid collisions with existing enums.

1. **`teamRoomTypeEnum`** -- Values: `"direct"`, `"team"`, `"auto_team"`, `"job_review"`
2. **`teamRoomStatusEnum`** -- Values: `"active"`, `"archived"`, `"paused"`
3. **`roomParticipantTypeEnum`** -- Values: `"user"`, `"assistant"`, `"observer"`
4. **`roomMessageSenderTypeEnum`** -- Values: `"user"`, `"assistant"`, `"system"`
5. **`roomMessageRecipientTypeEnum`** -- Values: `"all"`, `"assistant"`, `"subgroup"`, `"user"`
6. **`roomMessageTurnTypeEnum`** -- Values: `"discussion"`, `"handoff"`, `"review"`, `"decision"`, `"execution_update"`, `"summary"`
7. **`roomMessageVisibilityEnum`** -- Values: `"transparent"`, `"milestone"`, `"summary_only"`, `"private_internal"`
8. **`teamRunStatusEnum`** -- Values: `"queued"`, `"running"`, `"paused"`, `"completed"`, `"failed"`, `"stopped"`
9. **`teamRunExecutionModeEnum`** -- Values: `"team_chat"`, `"auto_team"`, `"review"`
10. **`agentEventCategoryEnum`** -- Values: `"status_change"`, `"communication"`, `"tool_use"`, `"memory_op"`, `"artifact_op"`, `"handoff"`, `"approval"`, `"error"`
11. **`agentEventVisibilityEnum`** -- Values: `"transparent"`, `"milestone"`, `"summary_only"`, `"private_internal"` (can reuse `roomMessageVisibilityEnum` if identical)
12. **`notificationSeverityEnum`** -- Values: `"info"`, `"warning"`, `"error"`, `"critical"`

### Table 1: `team_rooms`

Durable room abstraction for team conversations.

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| tenantId | varchar(36) NOT NULL | FK tenants.id CASCADE | Tenant isolation |
| teamId | varchar(36) NOT NULL | FK assistant_teams.id CASCADE | From section-01 |
| orchestratorUserId | integer NOT NULL | FK users.id | Room creator/owner |
| backingAgencyConversationId | varchar(36) | FK agencyConversations.id SET NULL | Optional link to legacy system |
| roomType | teamRoomTypeEnum NOT NULL | | direct/team/auto_team/job_review |
| title | varchar(255) | | Human-readable name |
| goalPrompt | text | | Initial objective |
| projectId | integer | nullable | Optional project context |
| viewMode | varchar(30) | default "transparent" | transparent/milestone/summary |
| summaryMode | varchar(30) | | |
| autonomyLevel | varchar(30) | | manual/guided/autonomous |
| status | teamRoomStatusEnum NOT NULL | default "active" | |
| lastRunId | varchar(36) | nullable | Quick access to latest run |
| createdAt | timestamptz NOT NULL | defaultNow | |
| updatedAt | timestamptz NOT NULL | defaultNow | |

**Indexes**: `(tenantId, teamId)`, `(orchestratorUserId)`.

### Table 2: `team_room_participants`

Explicit participant roster per room.

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| roomId | varchar(36) NOT NULL | FK team_rooms.id CASCADE | |
| participantType | roomParticipantTypeEnum NOT NULL | | user/assistant/observer |
| participantUserId | integer | nullable, FK users.id | Set when type=user/observer |
| participantAssistantId | varchar(36) | nullable, FK assistant_profiles.id | Set when type=assistant |
| participantLabel | varchar(255) | | Display name in room |
| roleInRoom | varchar(100) | | e.g. "lead", "reviewer" |
| isMuted | boolean NOT NULL | default false | Muted agents skip turns |
| canWriteSharedMemory | boolean NOT NULL | default true | Memory write permission |
| joinedAt | timestamptz NOT NULL | defaultNow | |

**Indexes**: Unique index on `(roomId, participantAssistantId)` WHERE `participantAssistantId IS NOT NULL`. Unique index on `(roomId, participantUserId)` WHERE `participantUserId IS NOT NULL`. These prevent the same user or assistant from joining a room twice.

### Table 3: `team_room_messages`

Multi-party message store.

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| roomId | varchar(36) NOT NULL | FK team_rooms.id CASCADE | |
| runId | varchar(36) | nullable | Links to active run if part of one |
| senderType | roomMessageSenderTypeEnum NOT NULL | | user/assistant/system |
| senderUserId | integer | nullable, FK users.id | |
| senderAssistantId | varchar(36) | nullable, FK assistant_profiles.id | Required when senderType=assistant (app-level) |
| recipientType | roomMessageRecipientTypeEnum NOT NULL | default "all" | |
| recipientAssistantId | varchar(36) | nullable | For directed messages |
| recipientGroupJson | jsonb | nullable | For subgroup targeting |
| turnType | roomMessageTurnTypeEnum NOT NULL | default "discussion" | |
| visibility | roomMessageVisibilityEnum NOT NULL | default "transparent" | |
| content | text NOT NULL | | Message body |
| summaryContent | text | nullable | Condensed version for summary view |
| artifactRefsJson | jsonb | nullable | References to artifacts |
| memoryRefsJson | jsonb | nullable | References to memories |
| metadataJson | jsonb | nullable | Extensible metadata |
| tokenUsageJson | jsonb | nullable | `{ inputTokens, outputTokens, model }` |
| createdAt | timestamptz NOT NULL | defaultNow | |

**Indexes**: `(roomId, createdAt)` for chronological message retrieval, `(runId, createdAt)` for run-scoped queries.

### Table 4: `team_runs`

One orchestrated work session inside a room.

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| roomId | varchar(36) NOT NULL | FK team_rooms.id CASCADE | |
| teamId | varchar(36) NOT NULL | FK assistant_teams.id | Denormalized for query efficiency |
| backingAgencyRunId | varchar(36) | nullable | Optional legacy link |
| initiatedByUserId | integer NOT NULL | FK users.id | Who started the run |
| executionMode | teamRunExecutionModeEnum NOT NULL | | team_chat/auto_team/review |
| objective | text | | What the run aims to accomplish |
| constraintsJson | jsonb | nullable | Additional constraints |
| status | teamRunStatusEnum NOT NULL | default "queued" | |
| activeAssistantId | varchar(36) | nullable | Currently speaking agent |
| stopPolicyJson | jsonb | | See StopPolicy type below |
| approvalPolicyJson | jsonb | nullable | When human approval needed |
| budgetSnapshotJson | jsonb | | Per-agent cost tracking |
| summaryArtifactId | varchar(36) | nullable | Final summary reference |
| stopReason | text | nullable | Why the run ended |
| startedAt | timestamptz | nullable | Set on transition to running |
| endedAt | timestamptz | nullable | Set on completion/failure/stop |

**StopPolicy type shape** (for `$type<>` annotation on `stopPolicyJson`):

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
```

**BudgetSnapshot type shape** (for `$type<>` on `budgetSnapshotJson`):

```typescript
interface BudgetSnapshot {
  totalCreditsUsed: number;
  perAgent: Record<string, {
    creditsUsed: number;
    inputTokens: number;
    outputTokens: number;
    turnCount: number;
  }>;
}
```

**Indexes**: `(roomId, status)`, `(teamId, status)`, `(initiatedByUserId)`.

### Table 5: `agent_activity_events`

Append-only event log for monitoring. This table has no `updatedAt` column by design -- records are write-once.

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| tenantId | varchar(36) NOT NULL | | Tenant isolation (no FK for write perf) |
| teamId | varchar(36) NOT NULL | | |
| roomId | varchar(36) NOT NULL | | |
| runId | varchar(36) NOT NULL | | |
| assistantId | varchar(36) | nullable | null for system-level events |
| eventType | text NOT NULL | | Free-form event type string |
| eventCategory | agentEventCategoryEnum NOT NULL | | |
| visibility | roomMessageVisibilityEnum NOT NULL | default "transparent" | Reuse the visibility enum |
| summary | text | | Human-readable event description |
| detailJson | jsonb | | Event-specific data |
| tokenUsageSnapshot | integer | | Running token total at event time |
| costSnapshot | numeric(12,4) | | Running cost at event time |
| durationMs | integer | | Time taken for this action |
| createdAt | timestamptz NOT NULL | defaultNow | |

**Indexes**: `(runId, createdAt)`, `(assistantId, createdAt)`.

Note: No foreign keys on tenantId, teamId, roomId, runId, or assistantId to keep writes fast for the append-only pattern. Referential integrity is maintained at the application layer.

### Table 6: `agent_run_summaries`

Per-agent performance summary computed when a run completes.

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| runId | varchar(36) NOT NULL | FK team_runs.id CASCADE | |
| assistantId | varchar(36) NOT NULL | FK assistant_profiles.id | |
| turnCount | integer NOT NULL | default 0 | |
| totalInputTokens | integer NOT NULL | default 0 | |
| totalOutputTokens | integer NOT NULL | default 0 | |
| totalCostCredits | numeric(12,4) NOT NULL | default 0 | |
| toolCallCount | integer NOT NULL | default 0 | |
| toolSuccessCount | integer NOT NULL | default 0 | |
| toolFailureCount | integer NOT NULL | default 0 | |
| memoriesRead | integer NOT NULL | default 0 | |
| memoriesWritten | integer NOT NULL | default 0 | |
| memoriesPromoted | integer NOT NULL | default 0 | |
| artifactsCreated | integer NOT NULL | default 0 | |
| handoffsSent | integer NOT NULL | default 0 | |
| handoffsReceived | integer NOT NULL | default 0 | |
| errorCount | integer NOT NULL | default 0 | |
| activeDurationMs | integer NOT NULL | default 0 | |
| waitDurationMs | integer NOT NULL | default 0 | |
| createdAt | timestamptz NOT NULL | defaultNow | |

**Indexes**: `(runId)`.

### Table 7: `run_snapshots`

Periodic state captures during active runs (every ~15 seconds by default).

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| runId | varchar(36) NOT NULL | FK team_runs.id CASCADE | |
| capturedAt | timestamptz NOT NULL | defaultNow | |
| activeAssistantId | varchar(36) | nullable | Who was speaking at capture time |
| agentStatusesJson | jsonb | | `{ [assistantId]: "idle"|"active"|"error" }` |
| tokenUsageJson | jsonb | | Cumulative token usage at capture |
| costJson | jsonb | | Cumulative cost at capture |
| artifactCountJson | jsonb | | `{ [type]: count }` |
| pendingApprovalsCount | integer NOT NULL | default 0 | |

**Indexes**: `(runId, capturedAt)`.

### Table 8: `orchestrator_notifications`

Persistent notification records for the orchestrator user.

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| id | varchar(36) PK | | UUID |
| tenantId | varchar(36) NOT NULL | FK tenants.id CASCADE | |
| userId | integer NOT NULL | FK users.id | Recipient |
| teamId | varchar(36) | nullable | Context team |
| roomId | varchar(36) | nullable | Context room |
| runId | varchar(36) | nullable | Context run |
| notificationType | text NOT NULL | | e.g. "run_completed", "agent_stuck", "budget_warning" |
| severity | notificationSeverityEnum NOT NULL | default "info" | |
| title | varchar(255) NOT NULL | | |
| body | text | | Detailed description |
| actionUrl | text | nullable | Deep link URL |
| isRead | boolean NOT NULL | default false | |
| isDismissed | boolean NOT NULL | default false | |
| createdAt | timestamptz NOT NULL | defaultNow | |
| readAt | timestamptz | nullable | When marked as read |

**Indexes**: `(userId, isRead, createdAt)` for unread notification queries, `(tenantId, createdAt)`.

## Implementation Steps

1. **Define enums** -- Add all 12 pgEnum declarations to `schema.ts` (after existing enums, before table definitions).

2. **Define tables** -- Add all 8 pgTable definitions to `schema.ts`, in order: `teamRooms`, `teamRoomParticipants`, `teamRoomMessages`, `teamRuns`, `agentActivityEvents`, `agentRunSummaries`, `runSnapshots`, `orchestratorNotifications`.

3. **Export types** -- For each table, export `type X = typeof table.$inferSelect` and `type InsertX = typeof table.$inferInsert`.

4. **Write tests** -- Create the test file at the path listed above. Run with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test server/services/__tests__/teamRoomRunSchema.test.ts`.

5. **Generate migration** -- Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push` to generate and apply the migration SQL. Follow the Database Safety Protocol from CLAUDE.md (backup existing tables first, verify row counts after).

6. **Verify** -- Confirm all 8 tables exist in the database, all indexes are created, and the migration journal in `drizzle/meta/_journal.json` has the new entry.

## Key Design Decisions

- **No FKs on `agent_activity_events`**: This is the highest-write-volume table. Dropping foreign keys avoids lock contention during concurrent run execution. The service layer guarantees referential integrity.

- **Reuse `roomMessageVisibilityEnum`** for agent event visibility to keep the visibility model consistent. Both messages and events use the same 4-tier visibility system (transparent > milestone > summary_only > private_internal).

- **`stopPolicyJson` and `budgetSnapshotJson` are JSONB**: These structures evolve frequently (new stop conditions, new budget dimensions). JSONB gives flexibility without migration churn. The TypeScript `$type<>` annotations provide compile-time safety.

- **Unique participant constraints use partial indexes**: `WHERE participantAssistantId IS NOT NULL` and `WHERE participantUserId IS NOT NULL` -- this allows multiple observer entries without a user or assistant ID while still preventing duplicates for identified participants.

- **`team_room_messages.senderAssistantId` is nullable at DB level**: The "required when senderType=assistant" constraint is enforced by the Room Service (Section 05), not by a DB CHECK constraint. This simplifies the schema and keeps validation logic in one place.

## Implementation Notes (Actual)

**Migration:** `drizzle/0085_secret_harpoon.sql` — 11 enums, 8 tables. Partial unique indexes for participants applied via manual SQL.

**Files created/modified:**
- `apps/web/drizzle/schema.ts` — added 11 enums + 8 tables + StopPolicy/BudgetSnapshot interfaces
- `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts` — 19 tests (all passing)
- `apps/web/drizzle/0085_secret_harpoon.sql` — migration SQL

**Deviations from plan:**
- Only 11 enums defined (not 12) — `agentEventVisibilityEnum` reuses `roomMessageVisibilityEnum` as spec suggested.
- `agentActivityEvents.costSnapshot` uses numeric(12,4) matching `agentRunSummaries.totalCostCredits`.

**Test count:** 19 tests, all passing.