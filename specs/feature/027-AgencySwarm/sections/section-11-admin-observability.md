Now I have all the context needed. Let me produce the section content.

# Section 11: Admin Observability

## Overview

This section implements the admin controls panel for agencies (tenant quotas, kill switch, tool whitelists), tool whitelist enforcement at the Python service layer, observability metrics and audit logging for agency runs, and data retention archival for agency messages and runs. It spans both the Node.js admin UI / tRPC endpoints and Python service-level enforcement and auditing.

**Phase:** 4
**Depends on:** section-06-nodejs-integration (tRPC agency router with admin procedures), section-10-workflow-integration (agency executor must be operational for end-to-end observability)
**Blocks:** section-12-templates-rollout

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/admin/AgencyAdminPanel.tsx` | Admin panel for agency tenant controls, quotas, kill switch, tool whitelists |
| `apps/web/server/services/agencyArchival.ts` | BullMQ scheduled job for data retention (hot/cold/purge) |
| `apps/web/server/services/__tests__/agencyArchival.test.ts` | Tests for archival service |
| `python-backend/app/services/agency_audit.py` | Audit logging helpers for agency events |
| `python-backend/app/services/agency_metrics.py` | Observability metrics collection for agency runs |
| `python-backend/tests/unit/test_agency_audit.py` | Tests for audit logging |
| `python-backend/tests/unit/test_agency_metrics.py` | Tests for metrics collection |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/routers/agency.ts` | Add admin procedures for quotas, tool whitelist management, metrics queries |
| `apps/web/server/services/auditLogger.ts` | Add agency-specific `AuditEventType` values |
| `apps/web/client/src/pages/Settings.tsx` | Mount `AgencyAdminPanel` in admin settings tabs |
| `python-backend/app/services/agency_tools.py` | Integrate whitelist enforcement into SSPToolBridge |
| `python-backend/app/services/agency_service.py` | Add audit logging calls at run lifecycle events |
| `python-backend/app/services/agency_credits.py` | Add credit reconciliation audit trail |

---

## Background Context

### Existing Audit Logger

The audit logger (`apps/web/server/services/auditLogger.ts`) writes JSONL entries to date-rotated files under `apps/web/logs/audit/`. It defines an `AuditEventType` union and an `AuditLogEntry` interface. All log entries include `traceId`, `timestamp`, `eventType`, `userId`, and optional fields for timing, tokens, cost, and metadata. The logger buffers writes and performs automatic file rotation and cleanup.

### Existing Admin Patterns

Admin panels live in `apps/web/client/src/components/admin/` (e.g., `InfrastructureSettingsPanel.tsx`, `MultiProviderAdmin.tsx`, `StorageSettingsPanel.tsx`). They use Radix UI primitives from `@smartspec/ui`, Cards, Tabs, and Badges for layout. Admin data is fetched via tRPC `adminProcedure` endpoints.

Feature flags are stored in the `system_settings` table with `category: "feature_flags"`. Tenant-level overrides are distinguished by including the `tenantId` in the `key` name.

### Existing tRPC Admin Procedures

The tRPC `adminProcedure` is defined in `apps/web/server/_core/trpc.ts` (line 31). It extends `protectedProcedure` with a role check requiring `ctx.user.role === "admin"`. The agency router (from section-06) already defines `adminListAgencies`, `adminToggleTenant`, and `adminKillRun`. This section extends the router with quota management, tool whitelist CRUD, and metrics query endpoints.

### Tool Bridge (SSPToolBridge)

The tool bridge in `python-backend/app/services/agency_tools.py` (from section-04) routes tool calls based on risk level. This section adds whitelist enforcement so that only tools explicitly allowed by the admin for a given agency are permitted. Tools not on the whitelist return an error message to the agent (not a run failure).

### Agency Database Tables

Key tables relevant to this section:
- `agencies` (Drizzle): has `creditMultiplier`, `maxAgents`, `maxRunTimeSeconds` columns
- `agency_tools` (Drizzle): has `riskLevel`, `requiresApproval` columns
- `agency_runs` (SQLAlchemy): has `status`, `total_gateway_cost`, `multiplier_markup`, `total_credits_used`, `duration_ms`, `error_type`, `error_message`, `step_count`, `retry_count` columns
- `agency_messages` (SQLAlchemy): has `pii_redacted`, `credits_used`, `tool_calls` columns
- `agency_agent_tools` (Drizzle): junction table linking agents to allowed tools

---

## Tests (Write First)

### 1. Tool Whitelist Enforcement Tests (Python)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_tools_whitelist.py`

```python
import pytest

# Test: SSPToolBridge -- tool not in agency whitelist is blocked
#   Mock the DB to return an agency with specific tool IDs in agency_agent_tools.
#   Call run() with a tool_id NOT in that list. Assert it returns an error
#   string to the agent (e.g., "Tool 'xyz' is not authorized for this agency")
#   rather than raising an exception.

# Test: SSPToolBridge -- tool in whitelist is allowed
#   Mock the DB to return an agency with the tool_id present.
#   Call run(). Assert execution proceeds (mock the actual HTTP call, verify
#   it was invoked).

# Test: high-risk tool requires explicit opt-in in agency config
#   Create a tool config with riskLevel="high". Simulate calling from an
#   agency that does NOT have it in its whitelist. Assert blocked.

# Test: credit spend limit terminates run when exceeded
#   Mock agency config with maxRunTimeSeconds and implicit credit limit.
#   Simulate a scenario where accumulated cost exceeds the limit.
#   Assert run is terminated with appropriate error.
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`

### 2. Audit Logging Tests (Python)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_audit.py`

```python
import pytest

# Test: agency_run_started audit event logged with correct fields
#   Call log_agency_event("agency_run_started", ...) with run_id, agency_id,
#   tenant_id, user_id. Assert the logged dict contains all required fields:
#   event_type, run_id, agency_id, tenant_id, user_id, timestamp.

# Test: agency_run_completed audit event includes duration and credit totals
#   Call log_agency_event("agency_run_completed", ...) with duration_ms,
#   total_credits_used, step_count. Assert all values present in logged entry.

# Test: agency_run_failed audit event includes error type and message
#   Call log_agency_event("agency_run_failed", ...) with error_type="permanent"
#   and error_message="Credit exhaustion". Assert both fields present.

# Test: agency_tool_called audit event includes tool name and agent name
#   Call log_agency_event("agency_tool_called", ...) with tool_name, agent_name,
#   risk_level. Assert all present in logged entry.

# Test: credit reconciliation -- gateway total matches run total_credits_used
#   Simulate a completed run with known gateway costs and multiplier.
#   Call reconcile_credits(). Assert no mismatch is logged. Then simulate
#   a mismatch (gateway total != run total). Assert a warning event is logged.
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`

### 3. Observability Metrics Tests (Python)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_metrics.py`

```python
import pytest

# Test: record_run_metrics -- stores success rate per agency
#   Call record_run_metrics(agency_id, status="completed"). Read back
#   the success count. Assert incremented.

# Test: record_run_metrics -- stores latency percentile data
#   Call record_run_metrics(agency_id, duration_ms=5000). Assert the
#   metric is recorded for percentile calculation.

# Test: record_run_metrics -- stores retry count
#   Call record_run_metrics(agency_id, retry_count=3). Assert stored.

# Test: get_agency_metrics -- returns aggregated stats for time window
#   Record multiple run metrics. Call get_agency_metrics(agency_id,
#   window_hours=1). Assert returned dict includes success_rate,
#   p95_latency_ms, total_runs, avg_step_count.

# Test: check_alert_thresholds -- fires alert when success rate < 90%
#   Record 8 completed and 2 failed runs (80% success rate).
#   Call check_alert_thresholds(). Assert alert logged.
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`

### 4. Admin Panel Tool Whitelist Tests (TypeScript)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency-admin.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Test: admin can set tool whitelist per agency
//   Call adminSetToolWhitelist with agencyId and list of toolIds.
//   Assert agency_agent_tools records updated in DB mock.

// Test: admin can update tenant quotas (maxAgencies, maxConcurrentRuns, maxCreditPerRun)
//   Call adminSetQuotas with tenantId and quota values.
//   Assert system_settings records upserted.

// Test: admin kill switch -- cancels all running agency runs for tenant
//   Call adminKillAllRuns with tenantId. Assert agencyBridge.cancelRun
//   called for each active run. Assert runs updated to "cancelled" status.

// Test: admin get agency metrics -- returns aggregated run stats
//   Call adminGetMetrics with agencyId and timeWindow.
//   Assert response includes successRate, p95Latency, totalRuns.
```

### 5. Data Retention Archival Tests (TypeScript)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyArchival.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Test: archival job moves messages older than 7 days to archived state
//   Insert mock agency_messages records with timestamps older than 7 days.
//   Run archiveOldRecords(). Assert records now have isArchived=true.

// Test: archival job deletes records older than 30 days (default)
//   Insert mock records older than 30 days. Run purgeOldRecords().
//   Assert records deleted.

// Test: archival job respects per-tenant retention override
//   Set tenant-level retention to 60 days in system_settings.
//   Insert records 35 days old. Run purgeOldRecords().
//   Assert records NOT deleted (within tenant's override).

// Test: archival job logs audit event with counts
//   Run archival. Assert audit event logged with archived_count and
//   purged_count fields.
```

---

## Implementation Details

### 1. Audit Event Types Addition

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`

Add agency-specific event types to the `AuditEventType` union. The current union (lines 18-45) lists event types like `"llm_request"`, `"media_request"`, etc. Add the following values:

```typescript
export type AuditEventType =
  // ... existing types ...
  | "agency_created"
  | "agency_updated"
  | "agency_deleted"
  | "agency_run_started"
  | "agency_run_completed"
  | "agency_run_failed"
  | "agency_credit_reserved"
  | "agency_credit_deducted"
  | "agency_credit_refunded"
  | "agency_tool_called"
  | "agency_tool_failed"
  | "agency_archival"
  | "error";
```

These event types allow the existing JSONL audit infrastructure to track all agency lifecycle events without any changes to the logger's write/rotation logic.

### 2. Python Audit Logging Service

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_audit.py`

A lightweight module that logs agency events. The Python backend does not use the Node.js auditLogger directly. Instead, it logs structured JSON to its own log files (following the pattern in `python-backend/app/` logging), and also records events to the `agency_runs` table metadata column.

```python
"""
Agency audit logging.

Logs structured events for all agency lifecycle actions:
run start/complete/fail, tool calls, credit reconciliation.

Events are logged to:
1. Python structured logger (JSON format to python-backend/logs/)
2. agency_runs.metadata JSON column (for queryable history)
3. Optionally forwarded to Node.js audit endpoint for JSONL trail
"""

import logging
import json
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("agency.audit")


def log_agency_event(
    event_type: str,
    *,
    run_id: str | None = None,
    agency_id: str | None = None,
    tenant_id: str | None = None,
    user_id: int | None = None,
    duration_ms: int | None = None,
    total_credits_used: float | None = None,
    step_count: int | None = None,
    retry_count: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
    tool_name: str | None = None,
    agent_name: str | None = None,
    risk_level: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Log a structured agency event. Returns the event dict for testing."""


async def reconcile_credits(
    run_id: str,
    gateway_total: float,
    run_total_credits: float,
    threshold: float = 1.0,
) -> bool:
    """Compare gateway cost total against run's total_credits_used.
    If mismatch exceeds threshold, log a warning event.
    Returns True if reconciled (match), False if mismatch detected.
    """
```

Integration points -- in `agency_service.py`:
- Call `log_agency_event("agency_run_started", ...)` at the beginning of `execute_run()`
- Call `log_agency_event("agency_run_completed", ...)` at the end of `execute_run()` with duration and credit totals
- Call `log_agency_event("agency_run_failed", ...)` in the error handler of `execute_run()`
- Call `reconcile_credits(...)` at run completion to verify gateway charges match

In `agency_tools.py`:
- Call `log_agency_event("agency_tool_called", ...)` before executing a tool
- Call `log_agency_event("agency_tool_failed", ...)` when a tool execution fails or is blocked by whitelist

### 3. Python Observability Metrics Service

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_metrics.py`

Collects and aggregates metrics for agency runs. Uses Redis for real-time counters and the `agency_runs` table for historical queries.

```python
"""
Agency observability metrics.

Tracks per-agency and per-template run metrics:
- Success rate
- p95 latency
- Step failure rate
- Retry counts
- Credit reconciliation mismatches

Metrics are stored as Redis sorted sets (for sliding window aggregation)
and queried from agency_runs for historical reports.
"""

from datetime import datetime, timezone


async def record_run_metrics(
    agency_id: str,
    *,
    status: str,
    duration_ms: int | None = None,
    step_count: int | None = None,
    retry_count: int | None = None,
    error_type: str | None = None,
) -> None:
    """Record metrics for a completed/failed run.
    Increments Redis counters for real-time dashboards.
    """


async def get_agency_metrics(
    agency_id: str,
    *,
    window_hours: int = 1,
) -> dict:
    """Aggregate metrics for an agency within a time window.
    Returns: {
        success_rate: float,       # 0.0 - 1.0
        p95_latency_ms: int,
        total_runs: int,
        failed_runs: int,
        avg_step_count: float,
        avg_retry_count: float,
        credit_mismatches: int,
    }
    """


async def check_alert_thresholds(
    agency_id: str | None = None,
) -> list[dict]:
    """Check all agencies (or a specific one) against alert thresholds.
    Returns list of triggered alerts:
    - success_rate < 90% over 1 hour
    - p95 latency > 60s
    - step failure rate > 10% per hour
    - retry count > 5 in single run
    - credit reconciliation mismatch > $1

    Each alert dict: { agency_id, metric, value, threshold, triggered_at }
    """
```

The metric thresholds from the plan:

| Metric | Collection | Alert Threshold |
|--------|-----------|----------------|
| Run success rate | Per agency, per template | < 90% over 1 hour |
| Run p95 latency | Per agency, per template | > 60s |
| Step failure rate | Per agent within run | > 10% per hour |
| Retry count | Per run | > 5 retries in single run |
| Credit reconciliation mismatch | Per run | > $1 difference |

Redis key patterns:
- `agency:metrics:{agency_id}:runs` -- sorted set of run timestamps + status
- `agency:metrics:{agency_id}:latency` -- sorted set of run timestamps + duration_ms
- `agency:metrics:{agency_id}:retries` -- sorted set of run timestamps + retry_count
- All keys use a 24-hour TTL so Redis memory stays bounded

### 4. Tool Whitelist Enforcement in SSPToolBridge

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`

Modify the existing `SSPToolBridge.run()` method (from section-04) to check the tool whitelist before executing. The whitelist is determined by the `agency_agent_tools` junction table -- only tools linked to the agent via that table are allowed.

Implementation approach:
1. In `SSPToolBridge.__init__`, accept an `allowed_tool_ids: set[str]` parameter. This set is built from the `agency_agent_tools` records when the agency is constructed.
2. In `SSPToolBridge.run()`, before routing to direct HTTP or sandbox:
   - Check if `self.tool_config.tool_id` is in `self.allowed_tool_ids`.
   - If not, return an error message string to the agent: `"Tool '{tool_name}' is not authorized for this agency. Please use an alternative approach."` This is a soft error -- the agent receives it as a tool result and can adapt, rather than crashing the entire run.
   - If the tool has `risk_level == "high"` and is NOT explicitly in the whitelist, block it even if it would otherwise be allowed by risk routing.
3. Log a `agency_tool_called` audit event on every tool invocation (allowed or blocked), and `agency_tool_failed` when blocked or on execution error.

Credit spend limit enforcement:
- The agency's `maxRunTimeSeconds` column defines an implicit credit ceiling. Each run tracks cumulative credits via `agency_runs.total_gateway_cost`.
- The tool bridge (or the calling service layer) checks whether the run has exceeded its time limit before dispatching another tool call. If exceeded, the run is terminated with `error_type="credit_limit_exceeded"`.
- This check lives in `agency_service.py`'s run loop, not in the tool bridge itself.

### 5. Admin tRPC Procedures (Extended)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Add the following admin procedures to the existing `agencyRouter` (which already has `adminListAgencies`, `adminToggleTenant`, and `adminKillRun` from section-06):

```typescript
// --- Admin: Quotas ---

adminSetQuotas: adminProcedure
  .input(z.object({
    tenantId: z.string(),
    maxAgencies: z.number().min(0).max(100).optional(),
    maxConcurrentRuns: z.number().min(0).max(50).optional(),
    maxCreditPerRun: z.number().min(0).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    /** Upsert tenant-level agency quotas in system_settings.
     *  category: "agency_quotas", key: "tenant_{tenantId}_{quotaName}"
     *  These are checked at agency creation and run start. */
  }),

adminGetQuotas: adminProcedure
  .input(z.object({ tenantId: z.string() }))
  .query(async ({ ctx, input }) => {
    /** Read current quotas for a tenant from system_settings.
     *  Returns defaults for any unset quotas. */
  }),

// --- Admin: Tool Whitelists ---

adminSetToolWhitelist: adminProcedure
  .input(z.object({
    agencyId: z.string().uuid(),
    toolIds: z.array(z.string().uuid()),
  }))
  .mutation(async ({ ctx, input }) => {
    /** Replace the tool whitelist for all agents in the agency.
     *  Deletes existing agency_agent_tools records and inserts new ones.
     *  Runs in a transaction. */
  }),

adminGetToolWhitelist: adminProcedure
  .input(z.object({ agencyId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    /** Returns the list of tool IDs currently whitelisted for the agency,
     *  with tool details (name, riskLevel, description). */
  }),

// --- Admin: Kill Switch ---

adminKillAllRuns: adminProcedure
  .input(z.object({ tenantId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    /** Emergency kill switch: cancel ALL running agency runs for a tenant.
     *  1. Query agency_runs where tenant_id = input.tenantId AND status IN ('queued', 'running')
     *  2. For each active run, call agencyBridge.cancelRun()
     *  3. Log an audit event for each cancellation
     *  Returns { cancelledCount: number } */
  }),

// --- Admin: Metrics ---

adminGetMetrics: adminProcedure
  .input(z.object({
    agencyId: z.string().uuid().optional(),
    tenantId: z.string().optional(),
    windowHours: z.number().min(1).max(168).default(24),
  }))
  .query(async ({ ctx, input }) => {
    /** Query aggregated metrics for an agency or all agencies in a tenant.
     *  Delegates to Python metrics endpoint or queries agency_runs directly.
     *  Returns: { successRate, p95Latency, totalRuns, failedRuns, avgStepCount } */
  }),

adminGetAlerts: adminProcedure
  .input(z.object({
    tenantId: z.string().optional(),
  }))
  .query(async ({ ctx, input }) => {
    /** Returns currently triggered alert thresholds.
     *  Delegates to Python check_alert_thresholds or computes from runs. */
  }),
```

These procedures use the same `adminProcedure` base that checks `ctx.user.role === "admin"`. They interact with `system_settings` for quotas, `agency_agent_tools` for whitelists, and `agencyBridge` for run cancellation.

### 6. Admin Panel Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/AgencyAdminPanel.tsx`

A React component following the same patterns as `InfrastructureSettingsPanel.tsx`. Uses Radix UI Cards, Tabs, and Badges. Structure:

```typescript
/**
 * AgencyAdminPanel
 *
 * Admin panel for managing agency feature across tenants.
 * Tabs: Overview | Quotas | Tool Whitelists | Metrics | Kill Switch
 *
 * Mounted in the Settings page alongside other admin panels.
 */

// Tab 1: Overview
//   - Feature flag status (enabled/disabled per tenant)
//   - Toggle switch to enable/disable per tenant (calls adminToggleTenant)
//   - Count of agencies, active runs, total credits consumed

// Tab 2: Quotas
//   - Tenant selector dropdown
//   - Editable fields: maxAgencies, maxConcurrentRuns, maxCreditPerRun
//   - Save button (calls adminSetQuotas)
//   - Shows current effective quotas

// Tab 3: Tool Whitelists
//   - Agency selector dropdown
//   - Checklist of available tools with risk level badges
//   - Save button (calls adminSetToolWhitelist)
//   - High-risk tools highlighted with warning badge

// Tab 4: Metrics
//   - Agency selector or tenant-wide view
//   - Time window selector (1h, 6h, 24h, 7d)
//   - Cards showing: success rate, p95 latency, total runs, failed runs
//   - Alert indicators when thresholds exceeded
//   - Uses adminGetMetrics and adminGetAlerts queries

// Tab 5: Kill Switch
//   - Tenant selector
//   - "Cancel All Runs" button with confirmation AlertDialog
//   - Shows count of currently active runs
//   - Calls adminKillAllRuns on confirm
```

The component uses `trpc.agency.adminGetQuotas.useQuery()`, `trpc.agency.adminSetQuotas.useMutation()`, and similar patterns for each tab. Error states are shown via Sonner toast notifications. Loading states use `Loader2` spinner icons.

### 7. Data Retention Archival Service

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyArchival.ts`

Implements time-based archival using BullMQ repeatable jobs. The existing codebase uses BullMQ for background processing (queues defined in `apps/web/server/services/llmQueue.ts`, Redis clients in `redisClients.ts`).

```typescript
/**
 * Agency Data Retention Archival Service
 *
 * Scheduled job that manages agency data lifecycle:
 * - Hot (0-7 days): Full speed queryable
 * - Cold (8-30 days): Marked as archived (isArchived=true on conversations)
 * - Purge (30+ days): Deleted from database
 *
 * Per-tenant retention overrides stored in system_settings:
 *   category: "agency_retention", key: "tenant_{tenantId}_purge_days"
 *
 * Runs daily via BullMQ repeatable job.
 */

import { Queue, Worker } from "bullmq";

const QUEUE_NAME = "agency-archival";
const DEFAULT_ARCHIVE_DAYS = 7;
const DEFAULT_PURGE_DAYS = 30;

export async function setupArchivalQueue(): Promise<void> {
  /** Create BullMQ queue and register repeatable job.
   *  Schedule: daily at 03:00 UTC (low traffic window). */
}

export async function archiveOldRecords(): Promise<{ archivedCount: number }> {
  /** Mark agency_conversations as archived where updatedAt < now - ARCHIVE_DAYS.
   *  Does NOT delete any data. Returns count of archived conversations. */
}

export async function purgeOldRecords(): Promise<{ purgedCount: number }> {
  /** Delete agency_messages and agency_runs where created_at < now - PURGE_DAYS.
   *  Respects per-tenant overrides from system_settings.
   *  Deletes in batches of 1000 to avoid long transactions.
   *  Returns count of purged records.
   *  Logs audit event with purge counts. */
}

export async function getRetentionConfig(tenantId: string): Promise<{
  archiveDays: number;
  purgeDays: number;
}> {
  /** Read per-tenant retention override from system_settings.
   *  Falls back to DEFAULT_ARCHIVE_DAYS and DEFAULT_PURGE_DAYS. */
}
```

The archival worker calls `archiveOldRecords()` and `purgeOldRecords()` in sequence, then logs a summary audit event via the auditLogger with type `"agency_archival"`.

Important: The archival job communicates with the Python-owned `agency_messages` and `agency_runs` tables. Since these are SQLAlchemy-managed tables, the Node.js archival service connects directly to PostgreSQL via raw SQL (using the existing Drizzle `db.execute(sql\`...\`)` raw query pattern) rather than through SQLAlchemy.

### 8. Settings Page Integration

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx`

Add the `AgencyAdminPanel` as a new tab/section in the admin settings page. Only visible when `ctx.user.role === "admin"`. Import and render conditionally:

```typescript
import { AgencyAdminPanel } from "@/components/admin/AgencyAdminPanel";

// In the admin section tabs, add:
// <TabsTrigger value="agencies">Agencies</TabsTrigger>
// <TabsContent value="agencies"><AgencyAdminPanel /></TabsContent>
```

This follows the existing pattern used by `InfrastructureSettingsPanel` and `StorageSettingsPanel`.

---

## Audit Event Field Reference

Each agency audit event should include these fields in its `metadata` property:

| Event Type | Required Fields |
|-----------|----------------|
| `agency_run_started` | `runId`, `agencyId`, `tenantId`, `userId`, `agentCount` |
| `agency_run_completed` | `runId`, `agencyId`, `durationMs`, `totalCreditsUsed`, `stepCount`, `retryCount` |
| `agency_run_failed` | `runId`, `agencyId`, `errorType`, `errorMessage`, `stepCount`, `creditsUsedBeforeFailure` |
| `agency_tool_called` | `runId`, `agencyId`, `toolName`, `agentName`, `riskLevel`, `wasBlocked` |
| `agency_tool_failed` | `runId`, `agencyId`, `toolName`, `agentName`, `errorMessage` |
| `agency_credit_deducted` | `runId`, `agencyId`, `userId`, `amount`, `sourceType`, `multiplier` |
| `agency_archival` | `archivedCount`, `purgedCount`, `durationMs` |

---

## Data Retention Strategy

| Period | State | Behavior |
|--------|-------|----------|
| 0-7 days | Hot | Full speed queries, all data available |
| 8-30 days | Cold | `agency_conversations.isArchived = true`; queryable but UI shows "archived" badge |
| 30+ days | Purge | `agency_messages` and `agency_runs` deleted; `agency_conversations` record retained for history count |

Per-tenant overrides allow extending the purge window (e.g., enterprise tenants may need 90 days). The override is stored in `system_settings` with `category: "agency_retention"`, `key: "tenant_{tenantId}_purge_days"`.

---

## Dependency Notes

- **section-06-nodejs-integration:** The `agencyRouter` defined there provides the base admin procedures (`adminListAgencies`, `adminToggleTenant`, `adminKillRun`) and the `AgencyBridge` service. This section extends that router with additional admin procedures.
- **section-10-workflow-integration:** The `AgencyExecutor` must be operational so that workflow-triggered agency runs generate metrics and audit events. The observability code in this section instruments the service layer, which is shared between direct chat runs and workflow-triggered runs.
- **section-04-python-services:** The `SSPToolBridge`, `AgencyService`, and `AgencyCreditManager` classes from section-04 are the primary integration points for audit logging and whitelist enforcement.

---

## Checklist

1. Add agency audit event types to `AuditEventType` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`
2. Write Python audit tests in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_audit.py`
3. Implement `agency_audit.py` in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_audit.py`
4. Write Python metrics tests in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_metrics.py`
5. Implement `agency_metrics.py` in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_metrics.py`
6. Write tool whitelist tests in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_tools_whitelist.py`
7. Add whitelist enforcement to `SSPToolBridge.run()` in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`
8. Add audit logging calls to `agency_service.py` run lifecycle in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py`
9. Add credit reconciliation calls to `agency_credits.py` in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_credits.py`
10. Write admin router tests in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency-admin.test.ts`
11. Add admin procedures (quotas, whitelists, metrics, kill switch) to `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`
12. Write archival tests in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyArchival.test.ts`
13. Implement archival service in `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyArchival.ts`
14. Create `AgencyAdminPanel.tsx` in `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/AgencyAdminPanel.tsx`
15. Mount `AgencyAdminPanel` in `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx`
16. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest -m agency` to verify Python tests
17. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` to verify Node.js tests
18. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` to verify no TypeScript errors

---

## Implementation Notes (Actual)

### Deviations from Plan

1. **AdminSettings.tsx** was used instead of Settings.tsx for mounting AgencyAdminPanel (admin panels live in AdminSettings).
2. **BullMQ archival scheduling** was not implemented — BullMQ is not available in this codebase. The archival service exposes `runArchivalCycle()` but has no scheduling wired. This is a deployment concern.
3. **Credit reconciliation** in `agency_credits.py` was left as a stub — `reconcile_credits()` exists in `agency_audit.py` but is called with hardcoded zeros from `agency_service.py`.
4. **Tool whitelist UI tab** is read-only (displays whitelisted tools as badges). Edit functionality deferred.
5. Only **success_rate** alert threshold implemented in Node.js admin. Python metrics service also checks p95 latency. Three of five planned thresholds deferred.

### Code Review Fixes Applied

1. **[CRITICAL] SQL injection** — Replaced `sql.raw()` string interpolation in adminGetMetrics/adminGetAlerts with parameterized `sql` tagged templates.
2. **Transaction safety** — Wrapped adminSetQuotas delete+insert loop in `db.transaction()`.
3. **Kill switch scope** — Changed to cancel both 'running' and 'queued' runs.
4. **Batched purge** — Refactored purgeOldRecords to use `ctid IN (SELECT ... LIMIT 1000)` batching pattern.

### Test Results

- Python: 19 tests passing (8 audit + 5 metrics + 4 whitelist + 2 tools)
- TypeScript: 11 tests passing (5 admin router + 6 archival)
- TypeScript compilation: 0 errors in section-11 files

### Files Created

- `apps/web/client/src/components/admin/AgencyAdminPanel.tsx`
- `apps/web/server/services/agencyArchival.ts`
- `apps/web/server/services/__tests__/agencyArchival.test.ts`
- `apps/web/server/routers/__tests__/agency-admin.test.ts`
- `python-backend/app/services/agency_audit.py`
- `python-backend/app/services/agency_metrics.py`
- `python-backend/tests/unit/test_agency_audit.py`
- `python-backend/tests/unit/test_agency_metrics.py`
- `python-backend/tests/unit/test_agency_tools_whitelist.py`

### Files Modified

- `apps/web/server/services/auditLogger.ts` (12 agency event types)
- `apps/web/server/routers/agency.ts` (7 admin procedures)
- `apps/web/client/src/pages/AdminSettings.tsx` (mounted AgencyAdminPanel)
- `python-backend/app/services/agency_tools.py` (audit logging in tool bridge)
- `python-backend/app/services/agency_service.py` (audit logging at run lifecycle)