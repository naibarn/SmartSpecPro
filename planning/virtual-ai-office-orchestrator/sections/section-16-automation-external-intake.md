Now I have all the context I need. Let me produce the section content.

# Section 16: Automation Handoffs and External Task Intake

## Overview

This section covers two related subsystems that let team agents and external systems initiate cross-surface work:

1. **Automation Handoffs** -- cross-surface actions initiated by team agents during a run (e.g., "create a presentation", "start a browser session").
2. **External Task Intake** -- a pipeline for external systems (API clients, webhook partners, MCP clients) to submit work into teams.

Both subsystems require schema tables, service logic, tRPC routers, Express endpoints for external submissions, and trust/approval policies.

### Dependencies

- **Section 09 (Inter-Agent Communication)**: The inter-agent message system and `inter_agent_messages` table must exist. External intake events are delivered through inter-agent channels.
- **Section 02 (Schema Rooms/Runs)**: `team_rooms`, `team_runs`, `team_room_messages` tables must exist.
- **Section 01 (Schema Identity)**: `assistant_profiles`, `assistant_teams` tables must exist.
- **Section 05 (Room/Run Engine)**: Room creation and run lifecycle services are called during materialization.
- **Section 10 (tRPC Routers)**: The `automationHandoff` and `externalIntake` tRPC routers defined in section 10 are fully implemented here.

---

## Tests First

All tests use Vitest. File locations are given relative to the project root `/home/dev/projects/SmartSpecPro`.

### Schema Validation Tests

**File:** `apps/web/server/services/__tests__/automationHandoffSchema.test.ts`

```ts
/**
 * Tests for automation_handoffs schema behavior.
 */

// Test: automation_handoffs.approvalState transitions
//   - "not_required" must not transition to "approved" or "rejected"
//   - "pending" can transition to "approved" or "rejected"
//   - "approved" and "rejected" are terminal states

// Test: automation_handoffs.status transitions follow valid flow:
//   pending -> approved -> executing -> completed
//   pending -> rejected (terminal)
//   executing -> failed (terminal)
//   executing -> completed (terminal)
```

**File:** `apps/web/server/services/__tests__/externalTaskInboxSchema.test.ts`

```ts
/**
 * Tests for external_task_inbox schema behavior.
 */

// Test: external_task_inbox.status transitions follow valid flow:
//   received -> awaiting_review -> approved -> materialized
//   received -> awaiting_review -> rejected (terminal)
//   approved -> materialized
//   approved -> failed
//   received -> materialized (auto-materialize for trusted sources)
```

### Automation Handoff Service Tests

**File:** `apps/web/server/services/__tests__/automationHandoffService.test.ts`

```ts
/**
 * Tests for automationHandoffService.
 */

// Test: createHandoff inserts a row with status="pending" and correct fields
// Test: createHandoff with destinationType not requiring approval sets approvalState="not_required"
// Test: approveHandoff transitions approvalState from "pending" to "approved" and status to "executing"
// Test: approveHandoff throws when handoff is not in "pending" approvalState
// Test: rejectHandoff transitions approvalState to "rejected" and status to "rejected"
// Test: completeHandoff transitions status from "executing" to "completed" and stores resultPayloadJson
// Test: failHandoff transitions status from "executing" to "failed" with error detail
// Test: listByRun returns only handoffs for the given runId, ordered by createdAt desc
// Test: getHandoff returns full handoff record by id
// Test: approveHandoff emits "approval_resolved" event via monitoringService
```

### External Intake Service Tests

**File:** `apps/web/server/services/__tests__/externalIntakeService.test.ts`

```ts
/**
 * Tests for externalIntakeService -- the intake pipeline.
 */

// Test: registerSource creates external_task_sources row with encrypted authConfig
// Test: registerSource validates required fields (name, sourceType, authMode)
// Test: rotateSecret generates new secret, encrypts, updates authConfigJson
// Test: submitTask from untrusted source sets status="awaiting_review"
// Test: submitTask from trusted_internal source with auto-materialize policy sets status="materialized"
// Test: submitTask validates payload shape against expected schema
// Test: submitTask creates external_task_inbox record with correct tenantId, sourceId
// Test: submitTask emits "external_task_received" event
// Test: approveInboxTask transitions status from "awaiting_review" to "approved"
// Test: rejectInboxTask transitions status from "awaiting_review" to "rejected"
// Test: materializeTask creates room and/or run based on materialization mode
// Test: materializeTask with mode "create_room_and_run" creates room, starts run, sets materializedRunId
// Test: materializeTask with mode "create_room_and_wait" creates room but no run
// Test: materializeTask with mode "attach_to_existing_room" adds task context to existing room
// Test: materializeTask creates external_task_bindings record linking external IDs to SmartSpec IDs
// Test: materializeTask emits "external_task_materialized" event
// Test: getInboxTask returns full task with source info joined
// Test: listInboxTasks filters by tenantId and status, returns paginated results
```

### Trust Tier Policy Tests

**File:** `apps/web/server/services/__tests__/trustTierPolicy.test.ts`

```ts
/**
 * Tests for trust tier policy evaluation.
 */

// Test: untrusted source always requires human review before materialization
// Test: verified source requires human review for side-effecting destinations only
// Test: trusted_internal source allows auto-materialization
// Test: policy respects team-level overrides (team can require review even for trusted sources)
// Test: policy respects source-level approvalPreference field from submission
```

### External Submission Endpoint Tests

**File:** `apps/web/server/services/__tests__/externalSubmissionEndpoint.test.ts`

```ts
/**
 * Tests for Express REST endpoints accepting external task submissions.
 */

// Test: POST /v1/teams/:teamId/tasks with valid auth returns 201 + inbox task record
// Test: POST /v1/teams/:teamId/tasks without auth returns 401
// Test: POST /v1/teams/:teamId/tasks with invalid source token returns 403
// Test: POST /v1/teams/:teamId/tasks with malformed body returns 400 with validation errors
// Test: POST /v1/external-tasks/:sourceId validates sourceId exists and is active
// Test: POST /v1/mcp accepts MCP task tool invocations and normalizes into inbox
```

### tRPC Router Tests

**File:** `apps/web/server/routers/__tests__/automationHandoff.test.ts`

```ts
/**
 * Tests for automationHandoff tRPC router.
 */

// Test: automationHandoff.approve transitions status and triggers execution
// Test: automationHandoff.approve requires authenticated user with correct tenant
// Test: automationHandoff.reject sets status to rejected
// Test: automationHandoff.listByRun returns paginated results for given runId
// Test: automationHandoff.create validates destinationType is a known enum value
```

**File:** `apps/web/server/routers/__tests__/externalIntake.test.ts`

```ts
/**
 * Tests for externalIntake tRPC router.
 */

// Test: externalSource.create requires admin role
// Test: externalSource.rotateSecret returns new secret (not the encrypted value)
// Test: externalTaskInbox.list filters by tenantId and supports cursor pagination
// Test: externalTaskInbox.approve calls materializeTask if auto-materialize policy applies
// Test: externalTaskInbox.reject sets status and records rejectedByUserId
// Test: externalTaskInbox.materialize calls intake service and returns materialized IDs
```

---

## Schema Implementation

### File: `apps/web/drizzle/schema.ts`

Add the following enums and tables. All tables follow the additive-first principle (no modifications to existing tables).

#### New Enums

```ts
export const automationHandoffStatusEnum = pgEnum("automation_handoff_status", [
  "pending", "approved", "rejected", "executing", "completed", "failed",
]);

export const automationApprovalStateEnum = pgEnum("automation_approval_state", [
  "not_required", "pending", "approved", "rejected",
]);

export const automationDestinationTypeEnum = pgEnum("automation_destination_type", [
  "workflow", "presentation", "video_edit", "browser_session", "agency_job", "scheduled_job",
]);

export const externalSourceTypeEnum = pgEnum("external_source_type", [
  "api_client", "webhook_partner", "mcp_client", "external_agent_platform",
]);

export const externalTrustTierEnum = pgEnum("external_trust_tier", [
  "untrusted", "verified", "trusted_internal",
]);

export const externalTaskStatusEnum = pgEnum("external_task_status", [
  "received", "awaiting_review", "approved", "rejected", "materialized", "failed",
]);
```

#### `automation_handoffs` Table

Fields as defined in the plan:
- `id` (uuid PK, default `gen_random_uuid()`)
- `roomId` (uuid FK `team_rooms`)
- `runId` (uuid FK `team_runs`)
- `assistantId` (uuid FK `assistant_profiles`)
- `destinationType` (automationDestinationTypeEnum, not null)
- `destinationId` (text, nullable)
- `intent` (text, not null)
- `requestPayloadJson` (jsonb)
- `resultPayloadJson` (jsonb, nullable)
- `status` (automationHandoffStatusEnum, default `"pending"`)
- `approvalState` (automationApprovalStateEnum, default `"pending"`)
- `createdAt`, `updatedAt` (timestamps)

Indexes: `(runId, createdAt)`, `(assistantId)`.

#### `external_task_sources` Table

Fields:
- `id` (uuid PK)
- `tenantId` (uuid FK `tenants`, not null)
- `ownerUserId` (uuid FK `users`, not null)
- `name` (text, not null)
- `sourceType` (externalSourceTypeEnum, not null)
- `authMode` (text, not null) -- e.g., "bearer_token", "hmac_signature", "mcp_session"
- `authConfigJson` (text, not null) -- encrypted via `encrypt()` from `crypto.ts`
- `defaultTeamId` (uuid FK `assistant_teams`, nullable)
- `defaultRoomMode` (text, nullable)
- `defaultAutonomyLevel` (text, nullable)
- `trustTier` (externalTrustTierEnum, default `"untrusted"`)
- `isActive` (boolean, default `true`)
- `createdAt`, `updatedAt` (timestamps)

Indexes: `(tenantId, isActive)`.

**Critical**: `authConfigJson` stores encrypted credentials. Use `encrypt()` from `apps/web/server/services/crypto.ts` when writing, `decrypt()` when reading for auth verification. Never log or return decrypted values in API responses.

#### `external_task_inbox` Table

Fields:
- `id` (uuid PK)
- `tenantId` (uuid FK `tenants`, not null)
- `sourceId` (uuid FK `external_task_sources`, not null)
- `receivedAt` (timestamp, default `now()`)
- `status` (externalTaskStatusEnum, default `"received"`)
- `submittedByLabel` (text, nullable)
- `externalTaskId` (text, nullable)
- `targetTeamId` (uuid FK `assistant_teams`, nullable)
- `targetRoomId` (uuid FK `team_rooms`, nullable)
- `suggestedAssistantId` (uuid FK `assistant_profiles`, nullable)
- `intent` (text, not null)
- `objective` (text, not null)
- `payloadJson` (jsonb, nullable)
- `attachmentsJson` (jsonb, nullable)
- `routingDecisionJson` (jsonb, nullable)
- `approvalRequirement` (text, nullable) -- e.g., "none", "review_before_run", "review_before_side_effects"
- `approvedByUserId` (uuid, nullable)
- `approvedAt` (timestamp, nullable)
- `rejectedByUserId` (uuid, nullable)
- `rejectedAt` (timestamp, nullable)
- `materializedRunId` (uuid, nullable)
- `materializedRoomId` (uuid, nullable)
- `createdAt`, `updatedAt` (timestamps)

Indexes: `(tenantId, status)`, `(sourceId, externalTaskId)`.

#### `external_task_bindings` Table

Fields:
- `id` (uuid PK)
- `tenantId` (uuid FK `tenants`, not null)
- `sourceId` (uuid FK `external_task_sources`, not null)
- `externalThreadId` (text, nullable)
- `externalTaskId` (text, nullable)
- `teamId` (uuid FK `assistant_teams`, nullable)
- `roomId` (uuid FK `team_rooms`, nullable)
- `runId` (uuid FK `team_runs`, nullable)
- `syncMode` (text, nullable) -- e.g., "one_way_in", "bidirectional", "one_way_out"
- `metadataJson` (jsonb, nullable)
- `createdAt`, `updatedAt` (timestamps)

Indexes: `(sourceId, externalThreadId)`, `(roomId)`.

### Migration

After adding tables to `drizzle/schema.ts`, immediately run:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
```

This generates a migration SQL file in `apps/web/drizzle/` and applies it.

---

## Service Layer

### Automation Handoff Service

**File:** `apps/web/server/services/automationHandoffService.ts`

This service manages the lifecycle of cross-surface actions initiated by team agents.

#### Key Functions

- `createHandoff(input: CreateHandoffInput): Promise<AutomationHandoff>` -- Inserts a new `automation_handoffs` record. Evaluates whether approval is required based on the destination type and team policy. Sets `approvalState` to `"not_required"` for low-risk destinations or `"pending"` for side-effecting ones. Emits `"approval_required"` event via monitoring service when approval is needed.

- `approveHandoff(handoffId: string, userId: string): Promise<void>` -- Validates that `approvalState` is `"pending"`. Transitions to `approvalState="approved"`, `status="executing"`. Emits `"approval_resolved"` event. Triggers the actual execution of the destination action (e.g., create presentation via existing services).

- `rejectHandoff(handoffId: string, userId: string): Promise<void>` -- Validates that `approvalState` is `"pending"`. Transitions to `approvalState="rejected"`, `status="rejected"`.

- `completeHandoff(handoffId: string, resultPayload: unknown): Promise<void>` -- Called by the execution layer when the destination action completes. Transitions `status` from `"executing"` to `"completed"`. Stores result in `resultPayloadJson`.

- `failHandoff(handoffId: string, error: string): Promise<void>` -- Called when the destination action fails. Transitions `status` to `"failed"`.

- `listByRun(runId: string, cursor?: string, limit?: number): Promise<PaginatedResult<AutomationHandoff>>` -- Returns handoffs for a given run, ordered by `createdAt` desc.

- `getHandoff(id: string): Promise<AutomationHandoff | null>` -- Returns a single handoff by id.

#### Destination Execution

When a handoff is approved (or auto-approved), the service dispatches to the appropriate existing SmartSpecPro subsystem:

| Destination Type | Dispatch Target |
|---|---|
| `workflow` | Existing workflow engine |
| `presentation` | `aiPresentationService.ts` |
| `video_edit` | Media generation queue |
| `browser_session` | Browser session service |
| `agency_job` | `agencyBridge.ts` |
| `scheduled_job` | `scheduler.ts` |

Each dispatch is wrapped in try/catch. On success, call `completeHandoff`. On failure, call `failHandoff`.

#### State Machine

```
         pending
        /       \
   approved    rejected
      |
   executing
    /      \
completed  failed
```

For `approvalState`:
```
not_required  (terminal, no further transitions)
pending -> approved | rejected
```

### External Intake Service

**File:** `apps/web/server/services/externalIntakeService.ts`

This service implements the full intake pipeline for external task submissions.

#### Key Functions

- `registerSource(input: RegisterSourceInput): Promise<ExternalTaskSource>` -- Creates an `external_task_sources` record. Generates an auth token/secret, encrypts it with `encrypt()` from `crypto.ts`, stores in `authConfigJson`. Returns the source record plus the plaintext token (only returned once at creation time).

- `rotateSecret(sourceId: string): Promise<{ newSecret: string }>` -- Generates a new auth secret, encrypts and updates `authConfigJson`. Returns the new plaintext secret (only once).

- `authenticateSource(sourceId: string, credential: string): Promise<ExternalTaskSource>` -- Decrypts `authConfigJson`, validates the provided credential against stored secret. Returns the source if valid. Throws 403 if invalid.

- `submitTask(sourceId: string, submission: ExternalSubmission): Promise<ExternalTaskInbox>` -- The main intake pipeline entry point:
  1. Authenticate source (already done by Express middleware)
  2. Validate payload shape with Zod
  3. Create `external_task_inbox` record with `status="received"`
  4. Evaluate trust tier policy to determine approval requirement
  5. Set status based on policy: `"awaiting_review"` or (for trusted sources with auto-materialize) `"materialized"`
  6. If auto-materializing, call `materializeTask` immediately
  7. Emit `"external_task_received"` event

- `approveInboxTask(taskId: string, userId: string): Promise<void>` -- Transitions status from `"awaiting_review"` to `"approved"`. Sets `approvedByUserId` and `approvedAt`.

- `rejectInboxTask(taskId: string, userId: string, reason?: string): Promise<void>` -- Transitions status to `"rejected"`. Sets `rejectedByUserId` and `rejectedAt`.

- `materializeTask(taskId: string): Promise<MaterializationResult>` -- Core materialization logic:
  1. Read the inbox task
  2. Determine materialization mode based on source trust tier, team policy, and requested mode
  3. Execute the appropriate mode (see below)
  4. Create `external_task_bindings` record
  5. Update inbox task with `materializedRunId`/`materializedRoomId`
  6. Set status to `"materialized"`
  7. Emit `"external_task_materialized"` event

- `listInboxTasks(tenantId: string, filters: InboxFilters): Promise<PaginatedResult<ExternalTaskInbox>>` -- Returns paginated inbox tasks filtered by tenant, status, source, etc.

- `getInboxTask(taskId: string): Promise<ExternalTaskInboxWithSource>` -- Returns full task record with joined source information.

#### Materialization Modes

| Mode | Behavior |
|---|---|
| `create_room_and_run` | Create a new `team_room` with the objective, add team participants, then start a `team_run`. Used for fully autonomous processing. |
| `create_room_and_wait` | Create a new `team_room` with the objective but do not start a run. The orchestrator user decides when to start. |
| `attach_to_existing_room` | Add the task context as a message in an existing room (specified by `targetRoomId`). Optionally start a new run. |
| `append_to_existing_run_context` | Inject the task payload as context into an active run (via inter-agent message with channel `system_context`). |

Mode selection logic:
1. If source `trustTier` is `"untrusted"` -> always `create_room_and_wait`
2. If source `trustTier` is `"verified"` and team policy allows auto-run -> `create_room_and_run`
3. If source `trustTier` is `"trusted_internal"` -> `create_room_and_run`
4. If `targetRoomId` is provided -> `attach_to_existing_room`
5. Team-level policy overrides always take precedence

### Trust Tier Policy

**File:** `apps/web/server/services/trustTierPolicy.ts`

A small, pure-function module that evaluates what approval requirements apply given a source trust tier, team policy, and submission request.

```ts
/**
 * Determines the approval requirement for an external task submission.
 */
export function evaluateIntakePolicy(
  trustTier: "untrusted" | "verified" | "trusted_internal",
  teamPolicy: TeamIntakePolicy | null,
  submissionPreference: string | null,
): IntakePolicyDecision;

/**
 * Determines the materialization mode for an approved or auto-approved task.
 */
export function determineMaterializationMode(
  trustTier: "untrusted" | "verified" | "trusted_internal",
  teamPolicy: TeamIntakePolicy | null,
  targetRoomId: string | null,
): MaterializationMode;
```

`IntakePolicyDecision` shape:
```ts
type IntakePolicyDecision = {
  approvalRequirement: "none" | "review_before_run" | "review_before_side_effects";
  autoMaterialize: boolean;
  materializationMode: MaterializationMode;
};
```

---

## tRPC Routers

### Automation Handoff Router

**File:** `apps/web/server/routers/automationHandoff.ts`

```ts
/**
 * tRPC router for automation handoffs.
 * Requires authenticated user. Operations scoped to user's tenant.
 */

// automationHandoff.create
//   Input: { roomId, runId, assistantId, destinationType, intent, requestPayloadJson }
//   Calls automationHandoffService.createHandoff
//   Returns: handoff record

// automationHandoff.get
//   Input: { id }
//   Returns: handoff record or null

// automationHandoff.listByRun
//   Input: { runId, cursor?, limit? }
//   Returns: paginated handoff list

// automationHandoff.approve
//   Input: { id }
//   Validates caller is the orchestrator user for the run's room
//   Calls automationHandoffService.approveHandoff
//   Returns: { success: true }

// automationHandoff.reject
//   Input: { id }
//   Validates caller is the orchestrator user
//   Calls automationHandoffService.rejectHandoff
//   Returns: { success: true }
```

### External Intake Router

**File:** `apps/web/server/routers/externalIntake.ts`

```ts
/**
 * tRPC router for external task source management and inbox operations.
 * Source management requires admin role.
 * Inbox operations require authenticated user.
 */

// externalSource.list
//   Input: { cursor?, limit? }
//   Returns: paginated source list (authConfigJson excluded from response)

// externalSource.create
//   Input: { name, sourceType, authMode, defaultTeamId?, trustTier? }
//   Requires: admin role
//   Returns: source record + plaintext secret (returned only once)

// externalSource.update
//   Input: { id, name?, defaultTeamId?, trustTier?, isActive? }
//   Requires: admin role
//   Returns: updated source record

// externalSource.rotateSecret
//   Input: { id }
//   Requires: admin role
//   Returns: { newSecret: string }

// externalTaskInbox.list
//   Input: { status?, sourceId?, cursor?, limit? }
//   Returns: paginated inbox task list

// externalTaskInbox.get
//   Input: { id }
//   Returns: inbox task with joined source info

// externalTaskInbox.approve
//   Input: { id }
//   Calls externalIntakeService.approveInboxTask
//   Returns: { success: true }

// externalTaskInbox.reject
//   Input: { id, reason? }
//   Calls externalIntakeService.rejectInboxTask
//   Returns: { success: true }

// externalTaskInbox.materialize
//   Input: { id }
//   Calls externalIntakeService.materializeTask
//   Returns: { materializedRoomId?, materializedRunId? }
```

---

## Express REST Endpoints (External-Facing)

**File:** `apps/web/server/_core/externalIntakeRoutes.ts`

These Express routes handle inbound submissions from external systems. They are mounted under `/v1/` and use source-level authentication (bearer token or HMAC), not user JWT.

### Route Definitions

```ts
/**
 * External task submission endpoints.
 * Authentication: bearer token matched against external_task_sources.authConfigJson
 * Rate limiting: per-source, configurable (default 100 req/min)
 */

// POST /v1/teams/:teamId/tasks
//   Authenticates source via Authorization header
//   Validates body with Zod (externalSubmissionSchema)
//   Calls externalIntakeService.submitTask
//   Returns: 201 { inboxTaskId, status, teamId, policyDecision }

// POST /v1/rooms/:roomId/tasks
//   Same as above but targets an existing room
//   Sets targetRoomId from path param

// POST /v1/external-tasks/:sourceId
//   Generic endpoint; source determined by path param
//   Same pipeline

// POST /v1/mcp
//   Accepts MCP tool invocation format
//   Supports tools: team_submit_task, team_append_context, team_list_rooms, team_get_summary, team_request_review
//   Normalizes into intake pipeline
```

### Authentication Middleware

**File:** `apps/web/server/middleware/externalSourceAuth.ts`

```ts
/**
 * Express middleware that authenticates external sources.
 * Reads Authorization header, looks up source, decrypts authConfigJson,
 * validates credential, attaches source to req.
 *
 * CRITICAL: Never log the decrypted credential. Log only sourceId and authMode.
 */
export function externalSourceAuth(): RequestHandler;
```

### Public REST URL Paths (from spec §17.10)

| Method | Path | Description |
|---|---|---|
| POST | `/v1/teams/:teamId/tasks` | Submit task to a specific team |
| POST | `/v1/rooms/:roomId/tasks` | Submit task to a specific room |
| POST | `/v1/external-tasks/:sourceId` | Submit via registered source |
| POST | `/v1/mcp` | MCP tool invocation endpoint |

### MCP Task Tools (from spec §17.11)

The `/v1/mcp` endpoint exposes these task-oriented tools:

| Tool Name | Description | Maps To |
|---|---|---|
| `team_submit_task` | Submit a new task to a team | `submitTask` pipeline |
| `team_append_context` | Add context to existing room/run | `materializeTask` with append mode |
| `team_list_rooms` | List rooms accessible to this source | Read-only query on team_rooms |
| `team_get_summary` | Get latest run summary for a room | Read-only query on summaries |
| `team_request_review` | Request human review of pending task | Sets approvalRequirement to review_before_run |

The MCP endpoint normalizes tool invocations into the same intake pipeline as REST submissions, ensuring consistent trust tier evaluation and audit logging.

---

## Event Types

This section introduces the following event types (emitted via the monitoring service from section 07):

| Event Type | Category | When Emitted |
|---|---|---|
| `external_task_received` | external | A new task arrives via any intake channel |
| `external_task_routed` | external | The intake pipeline determines target team/room |
| `external_task_materialized` | external | A room/run is created from an inbox task |
| `external_task_rejected` | external | An inbox task is rejected by the orchestrator |
| `human_review_required` | external | A task requires human review before proceeding |
| `human_review_completed` | external | A human review decision has been made |
| `handoff_requested` | handoff | A team agent initiates a cross-surface handoff |
| `approval_required` | approval | A handoff requires orchestrator approval |
| `approval_resolved` | approval | A handoff approval decision has been made |

---

## Security Considerations

1. **Credential storage**: All source authentication credentials are encrypted with AES-256-GCM via `encrypt()` from `apps/web/server/services/crypto.ts`. The `authConfigJson` column in `external_task_sources` stores ciphertext only.

2. **Secret rotation**: The `rotateSecret` operation generates a new random token (32 bytes hex), encrypts it, and updates the stored config. The old secret is immediately invalidated.

3. **Never expose secrets**: API responses for source management must never include `authConfigJson`. Return `configured: true` or similar flags instead. The plaintext secret is returned exactly once at creation time and once at rotation time.

4. **Rate limiting**: External submission endpoints must be rate-limited per source (default 100 requests/minute) to prevent abuse.

5. **Trust tier enforcement**: The trust tier policy is the primary security control. Untrusted sources can never auto-materialize. All submissions from untrusted sources require human review.

6. **Tenant isolation**: All queries filter by `tenantId`. A source registered under tenant A cannot submit tasks to teams in tenant B.

---

## File Summary

| File Path | Action |
|---|---|
| `apps/web/drizzle/schema.ts` | Add enums + 4 tables |
| `apps/web/server/services/automationHandoffService.ts` | Create new |
| `apps/web/server/services/externalIntakeService.ts` | Create new |
| `apps/web/server/services/trustTierPolicy.ts` | Create new |
| `apps/web/server/routers/automationHandoff.ts` | Create new |
| `apps/web/server/routers/externalIntake.ts` | Create new |
| `apps/web/server/_core/externalIntakeRoutes.ts` | Create new |
| `apps/web/server/middleware/externalSourceAuth.ts` | Create new |
| `apps/web/server/services/__tests__/automationHandoffSchema.test.ts` | Create new |
| `apps/web/server/services/__tests__/externalTaskInboxSchema.test.ts` | Create new |
| `apps/web/server/services/__tests__/automationHandoffService.test.ts` | Create new |
| `apps/web/server/services/__tests__/externalIntakeService.test.ts` | Create new |
| `apps/web/server/services/__tests__/trustTierPolicy.test.ts` | Create new |
| `apps/web/server/services/__tests__/externalSubmissionEndpoint.test.ts` | Create new |
| `apps/web/server/routers/__tests__/automationHandoff.test.ts` | Create new |
| `apps/web/server/routers/__tests__/externalIntake.test.ts` | Create new |

---

## Implementation Order

1. Add enums and tables to `apps/web/drizzle/schema.ts`, run migration
2. Implement `trustTierPolicy.ts` (pure functions, no dependencies)
3. Implement `automationHandoffService.ts`
4. Implement `externalIntakeService.ts` (depends on trust tier policy)
5. Implement `externalSourceAuth.ts` middleware
6. Implement `automationHandoff.ts` tRPC router
7. Implement `externalIntake.ts` tRPC router
8. Implement `externalIntakeRoutes.ts` Express routes
9. Register new routers in the main tRPC app router and mount Express routes
10. Run all tests