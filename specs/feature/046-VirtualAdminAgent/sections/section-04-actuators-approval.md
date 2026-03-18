Now I have all the context I need. Let me generate the section content.

# Section 04: Actuators and Approval Flow

## Overview

This section implements the actuator system -- the "hands" of the System Guardian that carry out remediation actions. There are two categories of actuators:

- **Auto-fix actions** (7 types): Low-risk, automated responses that execute immediately when a rule fires and the tenant has auto-fix enabled.
- **Approval-required actions** (5 types): Higher-risk actions that create a pending approval record, notify admins, and wait for an explicit approve/reject decision before executing.

The approval gate uses optimistic locking (`UPDATE ... WHERE status = 'pending'`) for concurrent-safety, and a TTL-based expiration system (4h for critical, 24h for others).

## Dependencies

- **section-01-schema-system-user**: Provides the `virtual_admin_approvals` table, `approvalStatusEnum`, and the system user identity.
- **section-03-rule-engine**: Provides the `ActionPlan` type and the rule engine that triggers actuators after incident creation.

This section does NOT depend on section-05 (notifications) -- notification dispatch is handled separately. However, actuators do emit SSE events via Redis pub/sub when approvals are created or decided.

## File Paths

| File | Purpose |
|------|---------|
| `apps/web/server/services/virtualAdmin/types.ts` | Shared types (ActionPlan, ActuatorResult, ApprovalRecord) -- extends types from section-01 |
| `apps/web/server/services/virtualAdmin/actuatorRegistry.ts` | Core actuator registry, approval gate, action dispatcher |
| `apps/web/server/services/virtualAdmin/actuators/notifyActions.ts` | notify_admin, notify_user, notify_slack action implementations |
| `apps/web/server/services/virtualAdmin/actuators/autoFixActions.ts` | retry_failed_job, cleanup_temp_files, clear_stale_cache, failover_provider |
| `apps/web/server/services/virtualAdmin/actuators/approvalActions.ts` | pause_queue, restart_celery_worker, disable_provider, kill_stuck_task, emergency_maintenance |
| `apps/web/server/services/virtualAdmin/__tests__/actuatorRegistry.test.ts` | Tests for this section |
| `apps/web/server/routers/virtualAdmin.ts` | **CREATE** — tRPC router with all guardian endpoints (incidents, approvals, sensors, dashboard, settings, guardian control) |
| `apps/web/server/routers/__tests__/virtualAdmin.test.ts` | Tests for tRPC router |

### virtualAdmin tRPC Router — Full Endpoint Definitions

This section is responsible for **creating** `apps/web/server/routers/virtualAdmin.ts` with the complete set of guardian tRPC endpoints. Sections 06 (chat) later MODIFIES this file to add chat-specific endpoints.

**Endpoints to define:**

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `listIncidents` | query | adminProcedure | List incidents with filters: status, severity, sensorId, limit, offset |
| `getIncident` | query | adminProcedure | Get single incident with related approvals |
| `acknowledgeIncident` | mutation | adminProcedure | Set incident status = acknowledged |
| `resolveIncident` | mutation | adminProcedure | Set incident status = resolved with optional comment |
| `listPendingApprovals` | query | adminProcedure | Get pending approvals with incident context |
| `decideApproval` | mutation | adminProcedure | Approve/reject with optimistic locking (first writer wins) |
| `getSensorStatus` | query | adminProcedure | Get all sensor readings with health status |
| `updateSensorConfig` | mutation | adminProcedure | Update sensor enabled/interval/thresholds per tenant |
| `getDashboardStats` | query | adminProcedure | Counts by severity, recent incidents, sensor health % |
| `toggleGuardian` | mutation | adminProcedure | Enable/disable the entire guardian for this tenant |
| `getSettings` | query | adminProcedure | Get all VIRTUAL_ADMIN_* feature flag values for tenant |
| `updateSettings` | mutation | adminProcedure | Update VIRTUAL_ADMIN_* settings per tenant |

**Register the router** in `apps/web/server/routers.ts`:
```typescript
import { virtualAdminRouter } from "./routers/virtualAdmin";
// in appRouter:
virtualAdmin: virtualAdminRouter,
```

Each endpoint must scope queries by `ctx.tenantId` (admin) or allow cross-tenant for `domain_admin`. Use the existing `system_settings` table for getSettings/updateSettings (category: `"virtual_admin"`).

---

## Tests (Write First)

Create `apps/web/server/services/virtualAdmin/__tests__/actuatorRegistry.test.ts` with the following test structure. All database calls, Redis interactions, and HTTP requests should be mocked.

```typescript
// actuatorRegistry.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("ActuatorRegistry", () => {
  // ── Auto-fix Actions ──────────────────────────────────

  describe("auto-fix actions", () => {
    it("retry_failed_job calls job.retry() on the correct queue and job ID");
    it("cleanup_temp_files deletes only files older than retention period");
    it("cleanup_temp_files does not delete recent files");
    it("clear_stale_cache scans and deletes expired Redis keys matching pattern");
    it("failover_provider updates provider registry to skip failed provider and switches to backup");
    it("auto-fix logs the action result back to the incident record");
    it("auto-fix is skipped when tenant has VIRTUAL_ADMIN_AUTO_FIX disabled");
  });

  // ── Approval Gate ─────────────────────────────────────

  describe("approval gate", () => {
    it("creates approval record with status 'pending' and correct expiresAt based on severity");
    // critical severity -> 4h TTL; warning/error -> 24h TTL
    it("sets expiresAt to 4 hours for critical severity incidents");
    it("sets expiresAt to 24 hours for non-critical severity incidents");
    it("publishes guardian:approvals SSE event via Redis pub/sub on creation");
  });

  // ── Approval Status Transitions ───────────────────────

  describe("approval decisions", () => {
    it("transitions pending -> approved -> executes action and logs result");
    it("transitions pending -> rejected -> logs rejection reason, does not execute");
    it("concurrent approval: second admin gets CONFLICT error (0 rows updated)");
    it("cannot approve an already-expired approval");
    it("cannot reject an already-approved approval");
  });

  // ── Approval Expiration ───────────────────────────────

  describe("approval expiration", () => {
    it("expired critical approval re-alerts all admins");
    it("expired non-critical approval is archived (status set to expired)");
  });

  // ── Execution Failure ─────────────────────────────────

  describe("action execution failure", () => {
    it("marks approval status as execution_failed when action throws");
    it("logs the error message to the incident actionResult field");
  });
});
```

**Test patterns to follow**: Use `vi.mock()` for database queries (`drizzle`), Redis client, and HTTP calls. Create helper factories for mock incidents and approvals to reduce boilerplate. The existing test pattern in `apps/web/server/services/__tests__/webhookDeliveryService.test.ts` is a good reference for mocking services.

---

## Implementation Details

### 1. Types (additions to `types.ts`)

Extend the shared types file created in section-01 with actuator-specific types:

- **`ActionType`** -- union of all 12 action type strings: `"retry_failed_job" | "cleanup_temp_files" | "clear_stale_cache" | "failover_provider" | "notify_admin" | "notify_user" | "notify_slack" | "pause_queue" | "restart_celery_worker" | "disable_provider" | "kill_stuck_task" | "emergency_maintenance"`

- **`ActuatorResult`** -- `{ success: boolean; message: string; data?: Record<string, unknown> }`

- **`ActuatorFn`** -- `(params: Record<string, unknown>, incident: Incident) => Promise<ActuatorResult>`

- **`APPROVAL_REQUIRED_ACTIONS`** -- constant Set containing the 5 approval-required action type strings.

- **`APPROVAL_TTL`** -- `{ critical: 4 * 60 * 60 * 1000, default: 24 * 60 * 60 * 1000 }` (in milliseconds).

### 2. Actuator Registry (`actuatorRegistry.ts`)

This is the core orchestrator. It provides:

**`registerActuator(actionType: string, fn: ActuatorFn)`** -- Registers an action implementation. Called at module load time by each actuator file.

**`executeAction(actionType: string, params: Record<string, unknown>, incident: Incident, tenantId: string)`** -- Main entry point called by the rule engine (section-03). Logic:

1. Look up the actuator function from the registry map.
2. If `actionType` is in `APPROVAL_REQUIRED_ACTIONS`:
   - Insert a row into `virtual_admin_approvals` with `status: "pending"`, `expiresAt` calculated from incident severity, and `actionParamsJson` containing the params.
   - Publish `guardian:approvals` event to Redis pub/sub channel `guardian:events`.
   - Return early with result `{ success: true, message: "Approval requested" }`.
3. If auto-fix:
   - Check tenant setting `VIRTUAL_ADMIN_AUTO_FIX`. If disabled, log and return without executing.
   - Call the actuator function.
   - Update the incident record with `actionTaken` and `actionResult`.
   - Return the actuator result.

**`decideApproval(approvalId: number, decision: "approved" | "rejected", decidedBy: number, comment?: string)`** -- Called by the tRPC router when an admin approves or rejects. Logic:

1. Execute `UPDATE virtual_admin_approvals SET status = $decision, decidedBy = $decidedBy, decidedAt = NOW(), decisionComment = $comment WHERE id = $approvalId AND status = 'pending'`.
2. Check affected row count. If 0, throw a `TRPCError` with code `CONFLICT` and message "Approval already decided or expired".
3. If `decision === "approved"`:
   - Load the approval record to get `actionType` and `actionParamsJson`.
   - Load the linked incident.
   - Execute the actuator function.
   - If execution succeeds: update incident `actionTaken`, `actionResult`, mark resolved.
   - If execution fails: update approval status to `"execution_failed"`, log error to incident `actionResult`.
4. Publish `guardian:approvals:decided` event via Redis pub/sub.

**`expireStaleApprovals()`** -- Called by the scheduler/watchdog (section-10). Logic:

1. Query `SELECT * FROM virtual_admin_approvals WHERE status = 'pending' AND expiresAt < NOW()`.
2. For each expired approval:
   - Load the linked incident to check severity.
   - If incident severity is `"critical"`: re-alert all tenant admins (publish a new SSE event, create a new notification). Do NOT archive -- keep as pending so it stays visible.
   - Otherwise: update status to `"expired"`.

### 3. Auto-Fix Actuator Implementations (`actuators/autoFixActions.ts`)

Each function is registered with `registerActuator()` on import.

**`retry_failed_job`**: Accepts `{ queueName: string, jobId: string }`. Uses the Redis client to look up the BullMQ job and call `job.retry()`. If the job does not exist, returns `{ success: false, message: "Job not found" }`. For Celery tasks, makes an HTTP POST to the Python backend's internal endpoint `POST /api/internal/virtual-admin/retry-task` with the task ID.

**`cleanup_temp_files`**: Accepts `{ directory?: string, maxAgeMs?: number }`. Defaults to the `media_storage/` directory under the python-backend root and a 12-day retention. Uses `fs.readdir` + `fs.stat` to find files older than the threshold, then `fs.unlink` to remove them. Returns count of deleted files.

**`clear_stale_cache`**: Accepts `{ pattern: string }`. Uses Redis `SCAN` with the pattern (e.g., `cache:*`), checks TTL of each key, and deletes keys with TTL <= 0 or TTL = -1 (no expiry set but stale by convention). Returns count of deleted keys.

**`failover_provider`**: Accepts `{ providerId: number }`. Reads the provider from `llmProviders` table. Sets `healthStatus` to `"unhealthy"` and `isEnabled` to `false`. Looks up a fallback provider from the same provider type or the next in sort order that is enabled and healthy, and logs which provider traffic was routed to. The existing `llmProviders` schema (at `apps/web/drizzle/schema.ts` line 574) has `isEnabled`, `healthStatus`, `providerType`, and `sortOrder` fields that support this.

### 4. Notification Actuator Implementations (`actuators/notifyActions.ts`)

**`notify_admin`**: Accepts `{ tenantId: string, message: string, severity: string }`. Calls the existing `createNotification()` function (used by scheduler, agency, skills routers) to create an in-app notification for all admin users of the tenant.

**`notify_user`**: Accepts `{ userId: number, message: string }`. Creates a notification for a specific user.

**`notify_slack`**: Accepts `{ webhookUrl?: string, message: string }`. Posts to the configured Slack webhook URL (from `VIRTUAL_ADMIN_SLACK_WEBHOOK` env var or the passed param). Uses a simple `fetch()` POST with the Slack Block Kit payload.

### 5. Approval-Required Actuator Implementations (`actuators/approvalActions.ts`)

These functions are the actual execution logic that runs AFTER an admin approves.

**`pause_queue`**: Accepts `{ queueName: string }`. Creates a BullMQ `Queue` instance for the named queue and calls `queue.pause()`. This is a reversible operation -- the queue can be resumed later.

**`restart_celery_worker`**: Accepts `{ workerName?: string }`. Makes an HTTP POST to `http://localhost:8000/api/internal/virtual-admin/restart-worker` with the worker name. The Python backend endpoint (to be created separately or as a stub) handles the actual Celery worker restart via `celery.control.broadcast('shutdown', destination=[workerName])`.

**`disable_provider`**: Accepts `{ providerId: number }`. Updates `llmProviders` table: sets `isEnabled = false`. This is distinct from `failover_provider` because it does NOT auto-select a replacement -- it simply disables. The admin decides to re-enable manually.

**`kill_stuck_task`**: Accepts `{ taskId: string }`. Makes an HTTP POST to `http://localhost:8000/api/internal/virtual-admin/revoke-task` with `{ task_id: taskId, terminate: true }`. The Python endpoint calls `celery_app.control.revoke(task_id, terminate=True)`.

**`emergency_maintenance`**: Accepts `{ reason: string }`. Sets system setting `maintenance_mode` to `true` in the `system_settings` table (using the existing system settings service pattern at `apps/web/server/routers/systemSettings.ts`). This should be a single DB update. When maintenance mode is active, the frontend shows a maintenance banner and non-admin API calls are rejected.

### 6. Concurrent Approval Protection

The critical design decision for the approval gate is the use of **optimistic locking** via the WHERE clause:

```sql
UPDATE virtual_admin_approvals
SET status = $1, "decidedBy" = $2, "decidedAt" = NOW(), "decisionComment" = $3
WHERE id = $4 AND status = 'pending'
```

If two admins click "Approve" simultaneously, only the first UPDATE succeeds (returns 1 row affected). The second returns 0 rows affected, and the code throws a CONFLICT error. This approach avoids explicit locks or transactions for this specific race condition.

In Drizzle ORM, this translates to:

```typescript
const result = await db
  .update(virtualAdminApprovals)
  .set({ status: decision, decidedBy, decidedAt: new Date(), decisionComment: comment })
  .where(and(eq(virtualAdminApprovals.id, approvalId), eq(virtualAdminApprovals.status, "pending")));
```

Check `result.rowCount` (or equivalent Drizzle return) to detect the race condition.

### 7. Integration with Rule Engine (section-03)

The rule engine calls `executeAction()` from this section after creating an incident. The `ActionPlan` type from the rule includes:

- `autoFix?: { type: string; params: Record<string, unknown> }` -- triggers auto-fix actuators
- `requiresApproval?: boolean` -- triggers the approval gate

The rule engine should call `executeAction(actionPlan.autoFix.type, actionPlan.autoFix.params, incident, tenantId)` and the actuator registry handles the routing logic (auto-fix vs. approval gate).

### 8. Redis Pub/Sub Events

When an approval is created or decided, publish to Redis channel `guardian:events`:

```typescript
{
  type: "approval_created" | "approval_decided",
  approvalId: number,
  incidentId: number,
  actionType: string,
  status: string,
  timestamp: string
}
```

This is consumed by the SSE endpoint (section-05) to push real-time updates to the admin dashboard.

---

## Security Considerations

- **Whitelisted actions only**: The actuator registry only executes functions that are explicitly registered. There is no dynamic code execution or shell command support.
- **Tenant isolation**: Auto-fix actions are gated by per-tenant `VIRTUAL_ADMIN_AUTO_FIX` setting. An actuator cannot operate on a tenant that has not opted in.
- **Approval RBAC**: Only users with `admin` or `domain_admin` role can call `decideApproval`. The tRPC router should use `adminProcedure`.
- **Audit trail**: Every action execution (success or failure) must be logged to the audit logger with event type `guardian_action_executed` or `guardian_action_failed`.
- **No secrets in params**: Action params must never contain API keys or credentials. The `failover_provider` and `disable_provider` actuators reference providers by ID, not by key.

---

## Edge Cases

1. **Action execution throws after approval**: Mark the approval as `execution_failed` and log the full error. Do NOT revert the approval decision -- the admin decided to approve, the execution simply failed. The admin can retry via the dashboard or chat.
2. **Approval for an already-resolved incident**: Allow it -- the incident may have been resolved by another mechanism, but the approval is still a valid admin decision to record.
3. **Multiple approvals for the same incident**: Possible if the rule fires multiple times before resolution. Each approval is independent and must be decided separately.
4. **Server restart mid-execution**: On startup, query for approvals with status `"approved"` but no `actionResult` on the linked incident. These represent interrupted executions that may need manual review. Log them as warnings but do NOT auto-retry (to avoid double-execution).