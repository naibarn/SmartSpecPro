Good -- the virtualAdmin directory and tables don't exist yet (this is a greenfield section). I have all the context I need.

# Section 03: Rule Engine

## Overview

This section implements the deterministic rule engine that evaluates sensor readings, manages cooldowns, creates/updates incidents in the database, and triggers action plans (auto-fix, notifications, approval requests). The rule engine is the core decision-making layer of the System Guardian.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/ruleEngine.ts`

**Test file to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/__tests__/ruleEngine.test.ts`

## Dependencies

- **section-01-schema-system-user** must be complete: the `virtual_admin_incidents` table, `virtual_admin_approvals` table, `incidentSeverityEnum`, `incidentStatusEnum`, and the Drizzle schema definitions must exist.
- **section-02-sensor-framework** must be complete: the `SensorReading` interface and sensor registry must be available so the rule engine can consume readings.
- **Types from `types.ts`**: `SensorReading`, `IncidentRule`, `ActionPlan` (defined in section-01).

## Tests (Write FIRST)

Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/__tests__/ruleEngine.test.ts`.

```typescript
// ruleEngine.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("RuleEngine", () => {
  // Core evaluation
  it("creates incident when rule condition matches");
  it("does not create incident when condition does not match");
  it("respects cooldown period (no duplicate within cooldown)");
  it("updates existing open incident instead of creating duplicate");

  // Severity mapping
  it("maps queue_depth_high to warning severity");
  it("maps celery_worker_down to critical severity");
  it("maps credit_low to warning with correct tenant scope");

  // Action plan execution
  it("triggers auto-fix when tenant has auto-fix enabled");
  it("skips auto-fix when tenant has auto-fix disabled");
  it("creates approval record for medium/high risk actions");
  it("sends notification via configured channels");

  // Edge cases
  it("handles multiple rules matching same sensor reading");
  it("handles sensor reading with status 'unknown' (skips rule eval)");
  it("logs incident creation to audit logger");
});
```

### Test Strategy Details

Each test should follow the mock-DB pattern used elsewhere in the codebase. The key mocking targets are:

1. **Database layer**: Mock the Drizzle `db` object to intercept `INSERT INTO virtual_admin_incidents` and `SELECT ... WHERE` queries. Use `vi.fn()` to capture calls and return controlled results.
2. **System settings lookup**: Mock the function that checks `VIRTUAL_ADMIN_AUTO_FIX` per-tenant to return `true` or `false` as needed per test.
3. **Notifier**: Mock the notification dispatcher (from section-05) so tests verify it was called with expected severity and channels without actually sending notifications.
4. **Actuator registry**: Mock auto-fix execution (from section-04) to verify it is called or skipped based on tenant config.
5. **Clock/Date**: Use `vi.useFakeTimers()` for cooldown tests. Advance time past cooldown to verify a second incident is created, or keep within cooldown to verify deduplication.

### Key Test Scenarios Explained

**Cooldown test**: Create a rule with `cooldownMs: 300_000` (5 minutes). Process a matching reading -- expect incident created. Process an identical reading 1 minute later -- expect NO new incident (cooldown active). Advance clock past 5 minutes, process again -- expect new incident created.

**Duplicate prevention test**: Insert an existing open incident with `sensorId: "queue_health"` and `ruleId: "queue_depth_high"` and `status: "open"`. Process a matching reading. Verify that `UPDATE` was called on the existing incident (updating `metricsJson` and `updatedAt`) rather than `INSERT` creating a new row.

**Multiple rules matching**: Register two rules for the same sensorId with different conditions and severities. Process a reading that matches both. Verify two separate incidents are created (one per rule).

**Unknown status skip**: Create a `SensorReading` with `status: "unknown"`. Verify that no rules are evaluated and no incidents are created -- the engine should silently skip unknown readings.

**Tenant auto-fix toggle**: Mock `getSystemSetting("VIRTUAL_ADMIN_AUTO_FIX", tenantId)` to return `true` for tenant A and `false` for tenant B. Process the same critical reading for both. Verify auto-fix actuator is called only for tenant A.

## Implementation Details

### Type Definitions

The following types should already exist in `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/types.ts` (from section-01). They are reproduced here for reference -- do NOT re-declare them.

```typescript
interface IncidentRule {
  id: string;
  sensorId: string;
  condition: (reading: SensorReading) => boolean;
  severity: "info" | "warning" | "error" | "critical";
  actionPlan: ActionPlan;
  cooldownMs: number;
}

interface ActionPlan {
  autoFix?: { type: string; params: Record<string, unknown> };
  notify: { channels: ("in_app" | "email" | "slack" | "telegram")[] };
  requiresApproval?: boolean;
}
```

### Rule Registry (18 Rules)

The rule engine should define a static array of `IncidentRule` objects. Each rule links a sensor condition to a severity level and action plan. The rules are grouped by sensor:

**Queue Health Rules (2)**
- `queue_depth_high`: Triggers when `reading.status === "degraded"`. Severity: warning. Action: notify in-app. Cooldown: 10 minutes.
- `queue_depth_critical`: Triggers when `reading.status === "critical"`. Severity: critical. Action: auto-fix `retry_failed_job`, notify all channels, requires approval for `pause_queue`. Cooldown: 5 minutes.

**Celery Health Rules (2)**
- `celery_worker_slow`: Triggers on degraded status. Severity: warning. Action: notify in-app + email. Cooldown: 15 minutes.
- `celery_worker_down`: Triggers on critical status. Severity: critical. Action: requires approval for `restart_celery_worker`, notify all channels. Cooldown: 5 minutes.

**Error Spike Rules (2)**
- `error_spike_moderate`: Triggers on degraded. Severity: warning. Action: notify in-app + email. Cooldown: 10 minutes.
- `error_spike_severe`: Triggers on critical. Severity: error. Action: notify in-app + email + slack. Cooldown: 5 minutes.

**LLM Provider Rules (2)**
- `llm_provider_degraded`: Triggers on degraded. Severity: warning. Action: auto-fix `failover_provider`, notify in-app. Cooldown: 10 minutes.
- `llm_provider_down`: Triggers on critical. Severity: critical. Action: auto-fix `failover_provider`, requires approval for `disable_provider`, notify all channels. Cooldown: 5 minutes.

**Credit Balance Rules (2)**
- `credit_low`: Triggers when reading metrics show balance below soft limit. Severity: warning. Action: notify in-app + email. Cooldown: 60 minutes.
- `credit_exhausted`: Triggers when balance below hard limit. Severity: critical. Action: notify all channels. Cooldown: 30 minutes.

**Disk Storage Rules (2)**
- `disk_space_low`: Triggers on degraded. Severity: warning. Action: auto-fix `cleanup_temp_files`, notify in-app. Cooldown: 30 minutes.
- `disk_space_critical`: Triggers on critical. Severity: critical. Action: auto-fix `cleanup_temp_files`, requires approval for `emergency_maintenance`, notify all channels. Cooldown: 10 minutes.

**Database Health Rules (1)**
- `db_connection_issues`: Triggers on degraded or critical. Severity: error. Action: notify in-app + email + slack. Cooldown: 5 minutes.

**Certificate Expiry Rules (1)**
- `cert_expiring_soon`: Triggers on degraded. Severity: warning. Action: notify in-app + email. Cooldown: 24 hours.

**API Latency Rules (1)**
- `api_latency_high`: Triggers on degraded or critical. Severity: warning (degraded) or error (critical). Action: notify in-app + email. Cooldown: 15 minutes.

**Media Pipeline Rules (2)**
- `media_pipeline_slow`: Triggers on degraded. Severity: warning. Action: notify in-app. Cooldown: 15 minutes.
- `media_pipeline_stuck`: Triggers on critical. Severity: error. Action: auto-fix `retry_failed_job`, requires approval for `kill_stuck_task`, notify in-app + email + slack. Cooldown: 5 minutes.

**Team Escalation Rules (1)**
- `team_escalation_needed`: Triggers on critical. Severity: critical. Action: notify all channels. Cooldown: 30 minutes.

### Evaluation Flow

The main exported function is `evaluateReading(reading: SensorReading): Promise<void>`. Its logic:

1. **Skip unknown readings**: If `reading.status === "unknown"`, return immediately. Unknown means the sensor could not reach its data source -- no rules should fire on unreliable data.

2. **Find matching rules**: Filter the rules array where `rule.sensorId === reading.sensorId`.

3. **For each matching rule**, evaluate in sequence:

   a. **Evaluate condition**: Call `rule.condition(reading)`. If false, skip to next rule.

   b. **Check cooldown**: Query an in-memory `Map<string, number>` keyed by `ruleId` (or `ruleId:tenantId` for per-tenant rules). The value is the timestamp of the last incident creation. If `Date.now() - lastFired < rule.cooldownMs`, skip this rule. This avoids a DB query on every evaluation -- the cooldown map is populated on incident creation and can be pre-loaded from DB on startup.

   c. **Check for existing open incident**: Query the database:
   ```sql
   SELECT id, metricsJson, updatedAt
   FROM virtual_admin_incidents
   WHERE sensorId = ? AND ruleId = ? AND status = 'open'
   AND tenantId = ? -- if reading.tenantId is set
   LIMIT 1
   ```
   If found, UPDATE the existing row's `metricsJson` with the latest reading metrics and bump `updatedAt`. Do NOT create a new incident. Log a debug message indicating the existing incident was refreshed.

   d. **Create new incident**: If no open duplicate exists, INSERT into `virtual_admin_incidents` with fields from the reading and rule. Set `status: "open"`. Update the cooldown map.

   e. **Execute action plan**: Call `executeActionPlan(rule.actionPlan, incident, reading.tenantId)`.

4. **Action plan execution** (`executeActionPlan`):

   - **Notifications**: Always dispatch notifications per `actionPlan.notify.channels`. Call the notifier (from section-05) with the incident details and channel list. This runs even if auto-fix or approval is also triggered.

   - **Auto-fix**: If `actionPlan.autoFix` is defined, check the tenant setting `VIRTUAL_ADMIN_AUTO_FIX`. Query `system_settings` table: `SELECT value FROM system_settings WHERE key = 'VIRTUAL_ADMIN_AUTO_FIX' AND tenantId = ?`. If the value is `"true"`, call the actuator registry (from section-04) with the `autoFix.type` and `autoFix.params`. Log the result on the incident's `actionTaken` and `actionResult` fields. If the tenant setting is missing or `"false"`, skip auto-fix.

   - **Approval**: If `actionPlan.requiresApproval` is true, INSERT into `virtual_admin_approvals` with `status: "pending"` and `expiresAt` calculated from severity (critical = 4 hours, all others = 24 hours). Notify admins that an approval is needed.

### Cooldown Management

The cooldown mechanism uses an in-memory `Map<string, number>` for performance. The key is `${ruleId}` for system-wide rules or `${ruleId}:${tenantId}` for per-tenant rules. The value is `Date.now()` at the time the incident was created.

On server startup, the cooldown map should be pre-populated by querying recent incidents:

```sql
SELECT ruleId, tenantId, MAX(createdAt) as lastCreated
FROM virtual_admin_incidents
WHERE createdAt > NOW() - INTERVAL '24 hours'
GROUP BY ruleId, tenantId
```

This ensures cooldowns survive server restarts without creating duplicate incidents during the gap.

### Audit Logging

Every incident creation should emit an audit event with type `guardian_incident_created` using the existing audit logger. Include `incidentId`, `ruleId`, `sensorId`, `severity`, and `tenantId` in the event payload.

### Exported API

The module should export:

- `evaluateReading(reading: SensorReading): Promise<void>` -- main entry point called by the sensor scheduler after each sensor poll.
- `getRules(): IncidentRule[]` -- returns the full rule list (useful for admin dashboard display and testing).
- `initCooldownMap(): Promise<void>` -- pre-loads cooldown state from DB. Called once at Guardian startup.
- `_resetCooldownMap(): void` -- test-only helper to clear cooldown state between test runs. Prefix with underscore to signal internal use.

### Error Handling

The rule engine must never crash the sensor loop. Wrap the entire `evaluateReading` function body in a try/catch. On error, log to the audit logger with event type `guardian_action_failed` and continue. Individual rule evaluation failures should be caught per-rule so one broken rule does not prevent others from executing.

### Dependencies on Other Sections

- **section-04 (Actuators)**: The `executeActionPlan` function calls actuator functions for auto-fix and creates approval records. Until section-04 is implemented, stub these calls -- the rule engine should define the interface it expects and call it, but the actual actuator implementations come from section-04.
- **section-05 (Notifications)**: Similarly, notification dispatch is called but the actual multi-channel dispatcher comes from section-05. Stub the notifier call.
- Both stubs should be injectable (function parameters or imported from a module that can be mocked) to keep the rule engine testable in isolation.

### File Paths Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/services/virtualAdmin/__tests__/ruleEngine.test.ts` | CREATE | Test file with all rule engine tests |
| `apps/web/server/services/virtualAdmin/ruleEngine.ts` | CREATE | Rule engine: 18 rules, evaluation flow, cooldown, incident CRUD |

### Run Tests

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/virtualAdmin/__tests__/ruleEngine.test.ts
```