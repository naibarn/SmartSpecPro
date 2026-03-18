I have enough context now to generate the section content. Here is the output:

# Section 10: tRPC Routers

## Overview

This section creates all new tRPC routers for the Virtual AI Office Orchestrator feature. These routers expose the service layer (built in sections 04, 05, 07, and others) to the frontend via type-safe tRPC procedures. Each router follows the existing project conventions: Zod input validation, `protectedProcedure` for auth, tenant isolation via `ctx.tenantId`, and registration in the central `appRouter`.

## Dependencies

- **Section 01 (Schema Identity)**: Drizzle schema tables for `assistant_teams`, `assistant_profiles`, `assistant_team_templates`, `user_orchestrator_profiles`
- **Section 02 (Schema Rooms/Runs)**: Drizzle schema tables for `team_rooms`, `team_room_participants`, `team_room_messages`, `team_runs`, monitoring tables
- **Section 04 (Team Service)**: `teamService.ts` — team CRUD, template instantiation, member management
- **Section 05 (Room/Run Engine)**: `roomService.ts`, `runEngine.ts` — room lifecycle, run start/pause/resume/stop
- **Section 07 (Monitoring/Notifications)**: `monitoringService.ts`, notification extension — event timeline, agent status, notification CRUD

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/routers/team.ts` | Team CRUD + template instantiation |
| `apps/web/server/routers/assistantProfile.ts` | Assistant profile management |
| `apps/web/server/routers/teamRoom.ts` | Room lifecycle + messaging |
| `apps/web/server/routers/teamRun.ts` | Run lifecycle + intervention controls |
| `apps/web/server/routers/scopedMemory.ts` | Scoped memory CRUD + search |
| `apps/web/server/routers/monitoring.ts` | Run/agent monitoring queries |
| `apps/web/server/routers/automationHandoff.ts` | Cross-surface handoff approval |
| `apps/web/server/routers/externalIntake.ts` | External task source + inbox management |
| `apps/web/server/routers/__tests__/team.test.ts` | Tests for team router |
| `apps/web/server/routers/__tests__/teamRoom.test.ts` | Tests for teamRoom router |
| `apps/web/server/routers/__tests__/teamRun.test.ts` | Tests for teamRun router |
| `apps/web/server/routers/__tests__/scopedMemory.test.ts` | Tests for scopedMemory router |
| `apps/web/server/routers/__tests__/monitoring.test.ts` | Tests for monitoring router |
| `apps/web/server/routers/__tests__/automationHandoff.test.ts` | Tests for automationHandoff router |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/routers.ts` | Import and register all new routers in `appRouter` |
| `apps/web/server/routers/persona.ts` | Extend existing notification procedures (if notification extension is needed) |

---

## Tests (Write First)

All tests use Vitest. The pattern follows the existing project convention: mock dependencies with `vi.mock`, create a caller via `appRouter.createCaller(ctx)`, and assert results.

### Test File: `apps/web/server/routers/__tests__/team.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the team tRPC router.
 *
 * Mock dependencies:
 *   - teamService (createTeam, updateTeam, archiveTeam, createFromTemplate, etc.)
 *   - db (Drizzle instance)
 *   - drizzle/schema (table references)
 *
 * Test cases:
 *   1. team.create requires authenticated user with correct tenant
 *      - Call team.create with a public (unauthenticated) context
 *      - Expect UNAUTHORIZED TRPCError
 *
 *   2. team.create returns teamId + agencyId + member list
 *      - Call team.create with valid input (name, members with at least one lead)
 *      - Mock teamService.createTeam to return { teamId, agencyId, members }
 *      - Assert the response shape matches
 *
 *   3. team.create validates at least one member has isLead=true
 *      - Call team.create with members where none is lead
 *      - Expect BAD_REQUEST or Zod validation error
 *
 *   4. team.list returns teams for the current user's tenant
 *      - Mock DB query returning 2 teams
 *      - Assert both teams returned and belong to ctx.tenantId
 *
 *   5. team.cloneFromTemplate calls teamService.createFromTemplate
 *      - Provide templateId + overrides
 *      - Assert service called with correct arguments
 */
```

### Test File: `apps/web/server/routers/__tests__/teamRoom.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the teamRoom tRPC router.
 *
 * Mock dependencies:
 *   - roomService (createRoom, sendMessage, getMessages, etc.)
 *   - db / schema
 *
 * Test cases:
 *   1. teamRoom.sendMessage validates sender is a participant
 *      - Mock participant lookup to return empty (user is NOT a participant)
 *      - Expect FORBIDDEN TRPCError
 *
 *   2. teamRoom.sendMessage succeeds when sender is a participant
 *      - Mock participant lookup to find the user
 *      - Mock roomService.sendMessage to resolve
 *      - Assert success response
 *
 *   3. teamRoom.listMessages applies visibility filter
 *      - Call with viewMode=milestone
 *      - Assert roomService.getMessages called with correct filter
 *
 *   4. teamRoom.create requires teamId and creates room
 *      - Provide valid teamId, roomType, goalPrompt
 *      - Mock roomService.createRoom
 *      - Assert room created with orchestrator as participant
 */
```

### Test File: `apps/web/server/routers/__tests__/teamRun.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the teamRun tRPC router.
 *
 * Mock dependencies:
 *   - runEngine (startRun, pauseRun, resumeRun, stopRun)
 *   - monitoringService
 *   - db / schema
 *
 * Test cases:
 *   1. teamRun.start requires valid roomId and budget cap
 *      - Call with missing maxBudgetCredits
 *      - Expect Zod validation error
 *
 *   2. teamRun.start calls runEngine.startRun with correct config
 *      - Provide roomId + stopPolicy with maxBudgetCredits
 *      - Mock runEngine.startRun
 *      - Assert called with correct arguments
 *
 *   3. teamRun.intervene only allowed by orchestrator user
 *      - Look up team_room.orchestratorUserId
 *      - If ctx.user.id !== orchestratorUserId, expect FORBIDDEN
 *
 *   4. teamRun.pause/resume round-trip preserves state
 *      - Call pauseRun, then resumeRun
 *      - Assert runEngine methods called in order
 *
 *   5. teamRun.adjustBudget updates the run's budget
 *      - Provide runId + newBudgetCredits
 *      - Assert runEngine.adjustBudget called
 */
```

### Test File: `apps/web/server/routers/__tests__/scopedMemory.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the scopedMemory tRPC router.
 *
 * Mock dependencies:
 *   - scopedMemoryService (createMemory, searchMemories, promoteMemory, etc.)
 *   - db / schema
 *
 * Test cases:
 *   1. scopedMemory.search returns results filtered by caller's accessible scopes
 *      - User should only see memories from scopes they have access to
 *      - Mock service to return memories; verify caller's scopes are passed
 *
 *   2. scopedMemory.create validates ownerType and content
 *      - Call with empty content
 *      - Expect Zod validation error
 *
 *   3. scopedMemory.promote transitions ownership and creates audit record
 *      - Mock promoteMemory to succeed
 *      - Assert service called with correct from/to ownership
 */
```

### Test File: `apps/web/server/routers/__tests__/monitoring.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the monitoring tRPC router.
 *
 * Mock dependencies:
 *   - monitoringService
 *   - db / schema
 *
 * Test cases:
 *   1. monitoring.getActivityTimeline returns paginated events with cursor
 *      - Mock monitoringService to return 10 events + nextCursor
 *      - Assert response includes items array and cursor
 *
 *   2. monitoring.getRunStatus returns current run state
 *      - Mock DB query for team_runs row
 *      - Assert response includes status, activeAssistantId, budget info
 *
 *   3. monitoring.getAgentPerformanceCard returns stats for one agent
 *      - Mock agent_run_summaries query
 *      - Assert response includes turnCount, tokenUsage, costCredits
 */
```

### Test File: `apps/web/server/routers/__tests__/automationHandoff.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the automationHandoff tRPC router.
 *
 * Mock dependencies:
 *   - db / schema (automation_handoffs table)
 *
 * Test cases:
 *   1. automationHandoff.approve transitions status and triggers execution
 *      - Mock DB to find a handoff with status=pending, approvalState=pending
 *      - Call approve
 *      - Assert DB update sets approvalState=approved, status=executing
 *
 *   2. automationHandoff.reject sets rejectedAt and approvalState=rejected
 *      - Mock DB to find a pending handoff
 *      - Call reject
 *      - Assert approvalState=rejected
 *
 *   3. notification.markRead updates isRead and readAt
 *      - (Extend existing notification router if needed)
 *      - Mock DB update for orchestrator_notifications
 *      - Assert isRead=true and readAt is set
 */
```

---

## Implementation Details

### Conventions to Follow

All routers in this project follow a consistent pattern. Key conventions observed from existing routers like `agency.ts`, `memory.ts`, `approvals.ts`:

1. **Imports**: `router`, `protectedProcedure`, `adminProcedure` from `../_core/trpc`; `z` from `zod`; `TRPCError` from `@trpc/server`; `db` from `../db`; schema tables from `../../drizzle/schema`.
2. **Export naming**: Each router exports a named constant, e.g., `export const teamRouter = router({ ... })`.
3. **Tenant isolation**: Protected procedures access `ctx.tenantId` and filter all queries by it.
4. **User access**: Protected procedures access `ctx.user` (guaranteed non-null) for user identity.
5. **Input validation**: All inputs use Zod schemas. Use `.input(z.object({ ... }))` before `.query()` or `.mutation()`.
6. **Drizzle queries**: Use `eq`, `and`, `desc`, etc. from `drizzle-orm`. Access the database instance via `const dbInstance = await db.instance;`.

### Router: `team.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/team.ts`

Procedures to define:

- **`team.list`** (`protectedProcedure.query`): Query `assistant_teams` filtered by `ctx.tenantId` and `ownerUserId = ctx.user.id`. Support optional `status` filter (active/archived/draft). Return array of team summaries (id, name, description, category, status, memberCount, createdAt).

- **`team.get`** (`protectedProcedure.input(z.object({ teamId: z.string().uuid() })).query`): Fetch team by ID with members (join `assistant_profiles`). Verify tenant ownership. Return full team object with embedded member profiles.

- **`team.create`** (`protectedProcedure.input(...).mutation`): Input schema includes `name` (string, 1-100), `description` (optional string), `category` (optional string), `members` (array of member definitions, min 1). Validate exactly one member has `isLead: true`. Delegate to `teamService.createTeam(ctx.tenantId, ctx.user.id, input)`. Return `{ teamId, agencyId, members }`.

- **`team.update`** (`protectedProcedure.input(...).mutation`): Input includes `teamId` plus partial team fields. Verify ownership (ownerUserId matches ctx.user.id or user is admin). Delegate to `teamService.updateTeam`.

- **`team.archive`** (`protectedProcedure.input(z.object({ teamId: z.string().uuid() })).mutation`): Sets `status = 'archived'`. Does NOT delete data.

- **`team.cloneFromTemplate`** (`protectedProcedure.input(z.object({ templateId: z.string().uuid(), overrides: z.object({...}).optional() })).mutation`): Delegate to `teamService.createFromTemplate(templateId, ctx.tenantId, ctx.user.id, overrides)`.

- **`team.listTemplates`** (`protectedProcedure.query`): Query `assistant_team_templates` where `tenantId IS NULL` (platform-wide) OR `tenantId = ctx.tenantId`. Return array of template summaries.

### Router: `assistantProfile.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/assistantProfile.ts`

Procedures:

- **`assistantProfile.create`** (`protectedProcedure.mutation`): Input includes `teamId`, `personaId`, `displayName`, `roleTitle`, `isLead`, `sortOrder`. Delegate to `teamService.addMember`.

- **`assistantProfile.update`** (`protectedProcedure.mutation`): Input includes `profileId` and partial fields. Calls `teamService.updateTeamMember` which syncs to both `assistant_profiles` and the underlying `agency_agents` row.

- **`assistantProfile.reorder`** (`protectedProcedure.mutation`): Input is `{ teamId, orderedProfileIds: string[] }`. Bulk-update `sortOrder` field for each profile.

- **`assistantProfile.setPersona`** (`protectedProcedure.mutation`): Input `{ profileId, personaId }`. Updates `assistant_profiles.personaId`.

- **`assistantProfile.setPolicies`** (`protectedProcedure.mutation`): Input `{ profileId, toolPolicyJson?, approvalPolicyJson?, visibilityPolicyJson? }`. Partial JSONB update.

- **`assistantProfile.setMemoryPolicy`** (`protectedProcedure.mutation`): Input `{ profileId, memoryPolicyJson }`. Updates memory policy for the assistant.

### Router: `teamRoom.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/teamRoom.ts`

Procedures:

- **`teamRoom.list`** (`protectedProcedure.query`): List rooms for a given `teamId` (or all rooms the user participates in). Filter by `status` (active/archived/paused). Join `team_room_participants` to verify user access.

- **`teamRoom.get`** (`protectedProcedure.input(z.object({ roomId: z.string().uuid() })).query`): Fetch room details + participants. Verify user is participant or orchestrator.

- **`teamRoom.create`** (`protectedProcedure.mutation`): Input includes `teamId`, `roomType` (enum: direct/team/auto-team/job-review), `title`, `goalPrompt` (optional), `viewMode`, `autonomyLevel`. Delegate to `roomService.createRoom`. Return created room with participant list.

- **`teamRoom.update`** (`protectedProcedure.mutation`): Partial update of room fields (title, goalPrompt, viewMode, summaryMode, autonomyLevel).

- **`teamRoom.setViewMode`** (`protectedProcedure.mutation`): Shortcut for updating viewMode only. Input: `{ roomId, viewMode }`.

- **`teamRoom.addParticipant`** / **`teamRoom.removeParticipant`** (`protectedProcedure.mutation`): Manage room membership. Only orchestratorUserId can add/remove participants.

- **`teamRoom.sendMessage`** (`protectedProcedure.mutation`): Input includes `roomId`, `content`, `recipientType` (all/assistant/user), `recipientAssistantId` (optional). **Validation**: Verify sender is a participant in the room (query `team_room_participants`). If not, throw `FORBIDDEN`. Delegate to `roomService.sendMessage`.

- **`teamRoom.listMessages`** (`protectedProcedure.query`): Input includes `roomId`, `viewMode` (optional, overrides room default), `cursor` (optional for pagination), `limit` (default 50, max 200). Delegate to `roomService.getMessages` which applies visibility filtering based on viewMode.

- **`teamRoom.getSummary`** (`protectedProcedure.query`): Returns the latest summary for the room (most recent `turnType=summary` message or run summary artifact).

### Router: `teamRun.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/teamRun.ts`

Procedures:

- **`teamRun.start`** (`protectedProcedure.mutation`): Input includes `roomId` (uuid, required), `objective` (string, optional), `stopPolicy` (object with `maxBudgetCredits` required, plus optional `maxRounds`, `maxDurationMinutes`, `stopOnConsensus`, `stopOnArtifactReady`, `stopOnLeadSummary`, `requireFinalSummary`, `idleTimeoutSeconds`). Delegate to `runEngine.startRun`.

- **`teamRun.get`** (`protectedProcedure.query`): Fetch run by ID. Verify tenant ownership. Return full run state including status, budget snapshot, active assistant.

- **`teamRun.listByRoom`** (`protectedProcedure.query`): List all runs for a given `roomId`. Return array sorted by `startedAt` descending.

- **`teamRun.pause`** / **`teamRun.resume`** / **`teamRun.stop`** (`protectedProcedure.mutation`): Each takes `runId`. Verify the calling user is the room's orchestratorUserId. Delegate to corresponding `runEngine` methods.

- **`teamRun.approve`** / **`teamRun.reject`** (`protectedProcedure.mutation`): For human-in-the-loop checkpoints during a run. Input: `{ runId, approvalId, comment? }`.

- **`teamRun.intervene`** (`protectedProcedure.mutation`): Input `{ runId, message, targetAssistantId? }`. **Authorization check**: Look up the room via the run, verify `ctx.user.id === team_rooms.orchestratorUserId`. If not, throw `FORBIDDEN`. Injects an orchestrator message into the run.

- **`teamRun.muteAgent`** / **`teamRun.unmuteAgent`** (`protectedProcedure.mutation`): Input `{ runId, assistantId }`. Toggle the `isMuted` flag on `team_room_participants` for the given assistant. Only orchestrator can mute/unmute.

- **`teamRun.adjustBudget`** (`protectedProcedure.mutation`): Input `{ runId, newMaxBudgetCredits }`. Updates `stopPolicyJson.maxBudgetCredits` in the run record.

### Router: `scopedMemory.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/scopedMemory.ts`

Procedures:

- **`memory.list`** (`protectedProcedure.query`): Input includes `ownerType` (optional), `ownerId` (optional), `memoryKind` (optional), `limit`, `offset`. Enforce scope access: user can only list memories they own or memories in teams/rooms they belong to.

- **`memory.search`** (`protectedProcedure.query`): Input includes `query` (string), `scopes` (array of `{ ownerType, ownerId }`), `topK` (default 10). Delegate to `scopedMemoryService.searchMemories`. Filter results by the caller's accessible scopes before returning.

- **`memory.create`** (`protectedProcedure.mutation`): Input includes `ownerType`, `ownerId`, `memoryKind`, `visibility`, `title`, `content`, `tags` (optional). Delegate to `scopedMemoryService.createMemory`.

- **`memory.update`** (`protectedProcedure.mutation`): Input `{ memoryId, content?, title?, tags?, importance? }`. Verify ownership before update.

- **`memory.promote`** (`protectedProcedure.mutation`): Input `{ memoryId, toOwnerType, toOwnerId, reason }`. Delegate to `scopedMemoryService.promoteMemory`.

- **`memory.dismiss`** (`protectedProcedure.mutation`): Soft-delete or mark a memory as dismissed.

- **`memory.getAccessLog`** (`protectedProcedure.query`): Return access history for a specific memory (via `memory_promotions` table).

### Router: `monitoring.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/monitoring.ts`

Procedures:

- **`monitoring.getRunStatus`** (`protectedProcedure.query`): Input `{ runId }`. Returns the `team_runs` record with current status, activeAssistantId, budgetSnapshotJson, and timing info.

- **`monitoring.getAgentStatuses`** (`protectedProcedure.query`): Input `{ runId }`. Returns latest status per assistant in the run (from `agent_activity_events` or `run_snapshots`).

- **`monitoring.getActivityTimeline`** (`protectedProcedure.query`): Input `{ runId, cursor?, limit? (default 50) }`. Query `agent_activity_events` for the run, ordered by `createdAt`, with cursor-based pagination. Return `{ items, nextCursor }`.

- **`monitoring.getAgentDetail`** (`protectedProcedure.query`): Input `{ runId, assistantId }`. Return detailed agent info: latest events, token usage, cost, tools used.

- **`monitoring.getRunSummary`** (`protectedProcedure.query`): Input `{ runId }`. Return the structured summary artifact for a completed run.

- **`monitoring.getAgentRunSummaries`** (`protectedProcedure.query`): Input `{ runId }`. Query `agent_run_summaries` for the run. Return per-agent performance data.

- **`monitoring.getActiveRuns`** (`protectedProcedure.query`): List all runs with `status IN ('queued', 'running', 'paused')` for the user's tenant.

- **`monitoring.getCostBreakdown`** (`protectedProcedure.query`): Input `{ runId }`. Aggregate cost data from `budgetSnapshotJson` or `agent_run_summaries`.

- **`monitoring.getAgentPerformanceCard`** (`protectedProcedure.query`): Input `{ assistantId, runId? }`. If `runId` provided, return stats for that run only; otherwise aggregate across all runs for the agent.

### Router: `approval.ts`

**Location**: `apps/web/server/routers/approval.ts`

Dedicated approval router per spec §17.12. Aggregates approvals from runs, automation handoffs, and external intake into a single queryable surface.

Procedures:
- **`approval.list`** (`protectedProcedure.query`): Aggregates pending approvals across team_runs (human-in-the-loop checkpoints), automation_handoffs (pending approval), and external_task_inbox (awaiting_review). Returns unified list with source type, description, risk level, aging.
- **`approval.get`** (`protectedProcedure.query`): Input `{ approvalId, approvalType }`. Returns full context for a specific approval.
- **`approval.approve`** (`protectedProcedure.mutation`): Input `{ approvalId, approvalType, comment? }`. Delegates to the appropriate service (runEngine, automationHandoffService, or externalIntakeService).
- **`approval.reject`** (`protectedProcedure.mutation`): Input `{ approvalId, approvalType, reason? }`. Same delegation pattern.
- **`approval.requestChanges`** (`protectedProcedure.mutation`): Input `{ approvalId, approvalType, feedback }`. Sends feedback back to the requesting agent/source without approving or rejecting.

### Router: Notification Extension

Rather than creating a separate file, extend the existing notification system by adding orchestrator notification types. If there is an existing `notification` router or service, add these procedures there. Otherwise, add them to the `monitoring.ts` router:

- **`notification.list`**: Query `orchestrator_notifications` for `ctx.user.id`, filtered by `isRead` and `isDismissed`. Paginated.

- **`notification.markRead`**: Input `{ notificationId }`. Set `isRead = true`, `readAt = now()`.

- **`notification.markAllRead`**: Bulk update all unread notifications for the user.

- **`notification.dismiss`**: Input `{ notificationId }`. Set `isDismissed = true`.

- **`notification.getPreferences`** / **`notification.updatePreferences`**: Read/write user notification preferences (stored in `user_orchestrator_profiles.defaultApprovalPolicy` or a dedicated preferences column).

### Router: `automationHandoff.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/automationHandoff.ts`

Procedures:

- **`automationHandoff.create`** (`protectedProcedure.mutation`): Input includes `roomId`, `runId`, `assistantId`, `destinationType` (enum: workflow/presentation/video_edit/browser_session/agency_job/scheduled_job), `intent`, `requestPayloadJson`. Insert into `automation_handoffs` with `status = 'pending'`.

- **`automationHandoff.get`** (`protectedProcedure.query`): Input `{ handoffId }`. Return the handoff record.

- **`automationHandoff.listByRun`** (`protectedProcedure.query`): Input `{ runId }`. Return all handoffs for the run.

- **`automationHandoff.approve`** (`protectedProcedure.mutation`): Input `{ handoffId }`. Verify current state is `approvalState = 'pending'`. Transition to `approvalState = 'approved'`, `status = 'executing'`. Trigger downstream execution (e.g., create workflow, start presentation generation).

- **`automationHandoff.reject`** (`protectedProcedure.mutation`): Input `{ handoffId, reason? }`. Set `approvalState = 'rejected'`, `status = 'rejected'`.

### Router: `externalIntake.ts`

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/externalIntake.ts`

Procedures:

- **`externalSource.list`** (`protectedProcedure.query`): List `external_task_sources` for the tenant.

- **`externalSource.create`** (`protectedProcedure.mutation`): Input includes `name`, `sourceType`, `authMode`, `defaultTeamId`, `trustTier`. Create a new source with generated auth credentials.

- **`externalSource.update`** (`protectedProcedure.mutation`): Partial update of source fields.

- **`externalSource.rotateSecret`** (`protectedProcedure.mutation`): Generate new auth credentials for the source. Encrypt via `crypto.ts` and store in `authConfigJson`.

- **`externalTaskInbox.list`** (`protectedProcedure.query`): List `external_task_inbox` items for the tenant. Support filters by `status`, `sourceId`, `targetTeamId`. Paginated.

- **`externalTaskInbox.get`** (`protectedProcedure.query`): Input `{ inboxItemId }`. Return full inbox item with source info.

- **`externalTaskInbox.approve`** (`protectedProcedure.mutation`): Input `{ inboxItemId }`. Set `status = 'approved'`, `approvedByUserId`, `approvedAt`.

- **`externalTaskInbox.reject`** (`protectedProcedure.mutation`): Input `{ inboxItemId, reason? }`. Set `status = 'rejected'`.

- **`externalTaskInbox.materialize`** (`protectedProcedure.mutation`): Input `{ inboxItemId }`. Create a room and/or run from the approved inbox item. Set `status = 'materialized'`, record `materializedRunId` and `materializedRoomId`.

---

## Registering Routers in appRouter

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`

Add imports at the top of the file (alongside existing router imports around lines 27-80):

```typescript
import { teamRouter } from "./routers/team";
import { assistantProfileRouter } from "./routers/assistantProfile";
import { teamRoomRouter } from "./routers/teamRoom";
import { teamRunRouter } from "./routers/teamRun";
import { scopedMemoryRouter } from "./routers/scopedMemory";
import { monitoringRouter } from "./routers/monitoring";
import { automationHandoffRouter } from "./routers/automationHandoff";
import { externalIntakeRouter } from "./routers/externalIntake";
import { approvalRouter } from "./routers/approval";
```

Register them in the `appRouter = router({ ... })` definition (around lines 1786-1792, where the last batch of routers is registered):

```typescript
  team: teamRouter,
  assistantProfile: assistantProfileRouter,
  teamRoom: teamRoomRouter,
  teamRun: teamRunRouter,
  scopedMemory: scopedMemoryRouter,
  monitoring: monitoringRouter,
  automationHandoff: automationHandoffRouter,
  externalIntake: externalIntakeRouter,
  approval: approvalRouter,
```

---

## Zod Input Schema Patterns

Each router should define its Zod schemas at the top of the file. Key shared schemas to define (or extract into a shared file):

**Stop policy input schema** (used by `teamRun.start`):

```typescript
const stopPolicySchema = z.object({
  maxRounds: z.number().int().min(1).max(50).default(20),
  maxDurationMinutes: z.number().int().min(1).max(60).default(30),
  maxBudgetCredits: z.number().positive(),
  stopOnConsensus: z.boolean().default(false),
  stopOnArtifactReady: z.boolean().default(false),
  stopOnLeadSummary: z.boolean().default(false),
  requireFinalSummary: z.boolean().default(true),
  idleTimeoutSeconds: z.number().int().min(30).max(600).default(120),
});
```

**View mode enum** (used by `teamRoom`):

```typescript
const viewModeSchema = z.enum(["transparent", "milestone", "summary"]);
```

**Autonomy level enum**:

```typescript
const autonomyLevelSchema = z.enum(["manual", "guided", "autonomous"]);
```

**Room type enum**:

```typescript
const roomTypeSchema = z.enum(["direct", "team", "auto-team", "job-review"]);
```

**Memory kind enum** (used by `scopedMemory`):

```typescript
const memoryKindSchema = z.enum([
  "fact", "rule", "preference", "decision", "note",
  "checklist", "artifact_note", "handoff_note", "episode",
]);
```

**Owner type enum**:

```typescript
const ownerTypeSchema = z.enum(["user", "agent", "team", "room", "project", "run"]);
```

---

## Authorization Patterns

Several procedures need authorization beyond basic authentication:

1. **Orchestrator-only actions** (intervene, mute, adjustBudget, pause, resume, stop): Look up `team_rooms.orchestratorUserId` for the run's room. Compare with `ctx.user.id`. Throw `FORBIDDEN` if mismatch.

2. **Participant-only actions** (sendMessage, listMessages): Query `team_room_participants` for the user. Throw `FORBIDDEN` if not found.

3. **Tenant isolation**: All queries MUST filter by `ctx.tenantId`. Never return data from another tenant.

4. **Owner-only actions** (team.update, team.archive): Verify `assistant_teams.ownerUserId === ctx.user.id` OR `ctx.user.role === 'admin'`.

A helper function pattern used across routers:

```typescript
/**
 * Verify the calling user is the orchestrator for a given room.
 * Throws FORBIDDEN if not.
 */
async function assertOrchestrator(
  dbInstance: DbInstance,
  roomId: string,
  userId: number
): Promise<void> {
  // Query team_rooms for orchestratorUserId
  // If not matching, throw new TRPCError({ code: "FORBIDDEN" })
}
```

---

## Pagination Convention

For paginated endpoints, use cursor-based pagination consistent with the monitoring timeline:

```typescript
// Input
z.object({
  cursor: z.string().optional(),  // opaque cursor (typically a createdAt timestamp or ID)
  limit: z.number().min(1).max(100).default(50),
})

// Output shape
{
  items: T[],
  nextCursor: string | null,  // null when no more items
}
```

---

## Error Handling

Follow the existing project convention: throw `TRPCError` with appropriate codes:

- `UNAUTHORIZED` — user not authenticated (handled by `protectedProcedure`)
- `FORBIDDEN` — user authenticated but not authorized for this action
- `NOT_FOUND` — requested resource does not exist or not in this tenant
- `BAD_REQUEST` — invalid input beyond what Zod catches (e.g., business logic validation)
- `CONFLICT` — state transition not allowed (e.g., approving an already-approved handoff)
- `INTERNAL_SERVER_ERROR` — unexpected service errors (catch and wrap)

---

## Checklist

1. Write all test files with stubs as described above
2. Create `team.ts` router with all 7 procedures
3. Create `assistantProfile.ts` router with 6 procedures
4. Create `teamRoom.ts` router with 10 procedures
5. Create `teamRun.ts` router with 11 procedures
6. Create `scopedMemory.ts` router with 7 procedures
7. Create `monitoring.ts` router with 9+ procedures (including notification extension)
8. Create `automationHandoff.ts` router with 5 procedures
9. Create `externalIntake.ts` router with 8 procedures
10. Register all routers in `apps/web/server/routers.ts`
11. Run `pnpm check` from `apps/web/` to verify TypeScript compiles
12. Run `pnpm test` to verify all tests pass