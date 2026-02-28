I have all the context I need. Now I will generate the section content.

# Section 10: Admin UI and Observability

## Overview

This section implements the admin-facing observability layer for the OpenSandbox integration. It includes a sandbox job explorer page, sandbox profile and tenant policy management panels, cost analytics extensions, data retention tasks, monitoring metrics, and reconciliation workers that detect orphaned sandboxes and stuck jobs.

**What this section builds:**
- A new admin page (`/admin/sandbox`) for exploring sandbox jobs with filters, detail views, and cancel/retry actions
- A sandbox profile management panel (CRUD for runtime profiles)
- A tenant sandbox policy management panel (per-tenant limits)
- Cost analytics extensions on the existing Usage Analytics page
- Celery beat tasks for data retention (cleanup old jobs and artifacts)
- Monitoring metrics emitted via structured JSONL audit events
- Reconciliation workers for orphan sandbox cleanup and stuck job detection

**Dependencies:**
- **Section 08 (Router Modifications)** must be completed -- the admin page consumes the tRPC `sandbox.listJobs`, `sandbox.getJobStatus`, `sandbox.cancelJob`, and `sandbox.getProfiles` procedures defined in section 05 and wired in section 08
- **Section 05 (Node.js Router and Services)** must be completed -- provides the tRPC sandbox router that the admin UI calls
- **Section 04 (Python Services)** must be completed -- provides the Celery task infrastructure and Python services for reconciliation workers
- **Section 02 (Database Schema)** must be completed -- the `sandbox_jobs`, `sandbox_profiles`, `sandbox_artifacts`, and `tenant_sandbox_policies` tables must exist

**Blocks:**
- **Section 12 (Production Hardening)** depends on the monitoring and reconciliation infrastructure from this section

---

## Files to Create

| File Path | Purpose |
|-----------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSandbox.tsx` | Sandbox job explorer admin page |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/SandboxProfilePanel.tsx` | Profile management CRUD panel |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/TenantSandboxPolicyPanel.tsx` | Tenant policy management panel |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/SandboxCostAnalytics.tsx` | Cost analytics card/table component |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/sandbox_maintenance_tasks.py` | Celery tasks for retention, orphan cleanup, stuck job detection |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_metrics.py` | Metric emission helpers for monitoring |

## Files to Modify

| File Path | Change |
|-----------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` | Add lazy import and route for `AdminSandbox` at `/admin/sandbox` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` | Add admin sandbox procedures (listJobs with admin filters, manageProfiles, managePolicies, getCostAnalytics) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | Register sandbox maintenance tasks in beat schedule and queue routing |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/__init__.py` | Export new sandbox maintenance tasks |

## Test Files to Create

| File Path | Purpose |
|-----------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/AdminSandbox.test.tsx` | Admin sandbox page rendering + interaction tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/adminProcedures.test.ts` | Admin tRPC procedure tests for profile/policy CRUD and cost analytics |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_sandbox_maintenance_tasks.py` | Celery task tests for retention, orphan cleanup, stuck detection |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_sandbox_metrics.py` | Metric emission unit tests |

---

## Tests (Write These First)

### 10.1 Admin Sandbox Page Tests (React/Vitest)

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/AdminSandbox.test.tsx`

These tests verify that the admin sandbox explorer page renders correctly with mock data and that user interactions (cancel, filter, navigate to detail) trigger the correct tRPC calls. Follow the existing pattern from `AdminFunnelDashboard.test.tsx`.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Mock AuthContext -- admin user
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "admin", email: "admin@test.com" },
    isLoading: false,
  }),
}));

// Mock tRPC client
vi.mock("@/lib/trpc", () => ({
  trpc: {
    sandbox: {
      listJobs: { useQuery: vi.fn() },
      getJobStatus: { useQuery: vi.fn() },
      cancelJob: { useMutation: vi.fn() },
      getProfiles: { useQuery: vi.fn() },
    },
  },
}));

import AdminSandbox from "../AdminSandbox";
import { trpc } from "@/lib/trpc";

function createQueryMock<T>(data: T | undefined, isLoading: boolean) {
  return {
    data,
    isLoading,
    error: null,
    isError: false,
    isSuccess: !isLoading && data !== undefined,
    refetch: vi.fn(),
    trpc: {} as any,
  } as any;
}

describe("AdminSandbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders job explorer table with mock data", async () => {
    /** Set up mock listJobs returning 2 jobs, verify table rows render. */
  });

  it("shows job detail view with status timeline when a row is clicked", async () => {
    /** Click a job row, verify detail panel shows status, stdout/stderr, cost. */
  });

  it("cancel button calls cancelJob mutation", async () => {
    /** Render a job with status 'executing', click cancel, verify mutation called. */
  });

  it("filters by status update the query parameters", async () => {
    /** Select a status filter, verify listJobs.useQuery re-invoked with new params. */
  });

  it("filters by tenant when admin selects a tenant", async () => {
    /** Select tenant from dropdown, verify tenantId filter applied. */
  });

  it("displays cost analytics summary cards", async () => {
    /** Verify StatsCards render with total cost, job count, avg duration, failure rate. */
  });
});
```

### 10.2 Admin tRPC Procedure Tests (Profile/Policy CRUD, Cost Analytics)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/adminProcedures.test.ts`

These tests verify that admin-only sandbox profile CRUD, tenant policy management, and cost analytics aggregation procedures enforce RBAC and return correct data shapes.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("sandbox admin procedures", () => {
  describe("manageProfiles", () => {
    it("creates a new sandbox profile with valid input", async () => {
      /** Verify INSERT into sandbox_profiles table, returned profile has id. */
    });

    it("updates an existing sandbox profile", async () => {
      /** Verify UPDATE sets new CPU/memory/timeout values. */
    });

    it("deactivates a profile (soft delete via isActive flag)", async () => {
      /** Verify isActive set to false, profile still in DB. */
    });

    it("rejects non-admin users", async () => {
      /** Verify TRPCError FORBIDDEN for non-admin callers. */
    });
  });

  describe("manageTenantPolicies", () => {
    it("creates tenant sandbox policy with defaults", async () => {
      /** Verify INSERT into tenant_sandbox_policies. */
    });

    it("updates maxConcurrentSandboxes for a tenant", async () => {
      /** Verify UPDATE, new value persisted. */
    });

    it("returns existing policy for tenant", async () => {
      /** Verify GET returns all fields including egressRulesJson. */
    });

    it("enforces admin-only access", async () => {
      /** Non-admin should receive FORBIDDEN. */
    });
  });

  describe("getCostAnalytics", () => {
    it("aggregates sandbox cost by tenant over time range", async () => {
      /** Verify SUM(cost_actual) grouped by tenant_id. */
    });

    it("aggregates sandbox cost by feature type", async () => {
      /** Verify SUM(cost_actual) grouped by feature_type. */
    });

    it("returns cost breakdown by resource type (CPU, memory, storage)", async () => {
      /** Verify structured breakdown returned. */
    });

    it("filters by date range (7d, 30d, 90d)", async () => {
      /** Verify WHERE created_at filter applied. */
    });
  });
});
```

### 10.3 Sandbox Maintenance Tasks Tests (Python/pytest)

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_sandbox_maintenance_tasks.py`

These tests verify the three Celery maintenance tasks: data retention cleanup, orphan sandbox cleanup, and stuck job detection. They follow the existing pattern from `test_periodic_handlers.py`.

```python
"""Tests for sandbox maintenance Celery tasks."""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch, MagicMock

pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


class TestCleanupExpiredSandboxJobs:
    """Data retention: delete sandbox_jobs older than 30 days."""

    async def test_deletes_completed_jobs_older_than_30_days(self):
        """Jobs with status completed/failed and finished_at > 30 days ago are deleted."""

    async def test_preserves_jobs_newer_than_30_days(self):
        """Jobs within the 30-day window are not touched."""

    async def test_deletes_associated_artifact_records(self):
        """sandbox_artifacts rows for deleted jobs are cascade-deleted."""

    async def test_deletes_debug_artifacts_older_than_3_days(self):
        """Artifact S3 objects with type 'debug' and age > 3 days are removed."""

    async def test_deletes_primary_artifacts_older_than_7_days(self):
        """Artifact S3 objects with type 'primary' and age > 7 days are removed."""

    async def test_logs_deletion_counts(self):
        """Structured log emitted with deleted job count and artifact count."""


class TestOrphanSandboxCleanup:
    """Detect sandboxes on OpenSandbox that have no active sandbox_jobs record."""

    async def test_destroys_sandbox_without_active_job(self):
        """Sandbox IDs from OpenSandbox API not in active jobs are destroyed."""

    async def test_preserves_sandbox_with_active_job(self):
        """Sandboxes with a matching non-terminal job are left alone."""

    async def test_handles_opensandbox_api_failure_gracefully(self):
        """If OpenSandbox API is unreachable, task logs warning and exits."""

    async def test_skips_when_opensandbox_disabled(self):
        """When OPENSANDBOX_ENABLED=false, task is a no-op."""


class TestStuckJobDetection:
    """Jobs in non-terminal status past their timeout should be marked failed."""

    async def test_marks_executing_job_as_timed_out(self):
        """Job with status 'executing' past timeout gets status='timed_out'."""

    async def test_marks_provisioning_job_as_failed(self):
        """Job stuck in 'provisioning' past 2x create timeout gets status='failed'."""

    async def test_collects_partial_outputs_before_marking_timed_out(self):
        """If sandbox is reachable, partial outputs are collected before timeout."""

    async def test_destroys_sandbox_for_stuck_job(self):
        """Sandbox associated with a stuck job is destroyed after marking failed."""

    async def test_preserves_recently_started_jobs(self):
        """Jobs within their timeout window are not affected."""
```

### 10.4 Sandbox Metrics Tests (Python/pytest)

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_sandbox_metrics.py`

```python
"""Tests for sandbox metric emission helpers."""
import pytest
from unittest.mock import patch, MagicMock

pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


class TestSandboxMetrics:
    """Verify structured metrics are emitted to JSONL audit log."""

    def test_emit_job_counter_increments_by_status(self):
        """sandbox_jobs_total counter emitted with status and feature_type labels."""

    def test_emit_creation_duration_histogram(self):
        """sandbox_creation_duration_seconds emitted with value in seconds."""

    def test_emit_execution_duration_histogram(self):
        """sandbox_execution_duration_seconds emitted with profile label."""

    def test_emit_concurrent_active_gauge(self):
        """sandbox_concurrent_active emitted as current count of non-terminal jobs."""

    def test_emit_artifact_size_histogram(self):
        """sandbox_artifacts_size_bytes emitted for each artifact on collection."""

    def test_emit_circuit_breaker_state(self):
        """sandbox_circuit_breaker_state emitted as 0/1/2 for closed/open/half-open."""

    def test_emit_hetzner_health_gauge(self):
        """sandbox_hetzner_health emitted as 1 (healthy) or 0 (unhealthy)."""
```

---

## Implementation Details

### 10.1 Admin Sandbox Job Explorer Page

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSandbox.tsx`

This is a new admin page at route `/admin/sandbox`. It follows the pattern established by `AdminQueueDashboard.tsx` and `UsageAnalytics.tsx`:

**Page structure:**
1. **Header** with back navigation arrow (link to `/admin/settings`), title "Sandbox Jobs", and a refresh button with auto-refresh toggle (5s interval using `refetchInterval` on TanStack Query)
2. **Stats cards row** (using the existing `StatsCards` component from `@/components/analytics/StatsCards`) showing:
   - Total sandbox jobs (counter)
   - Active sandboxes right now (gauge)
   - Total cost this period (formatted USD)
   - Failure rate percentage
3. **Filter bar** with:
   - Status dropdown: all, queued, executing, completed, failed, timed_out, canceled
   - Feature type dropdown: all, chat, skill, workflow, library, media, presentation, connector
   - Tenant dropdown (admin-only, loads from `trpc.sandbox.listJobs` or a dedicated tenant list endpoint)
   - Date range selector (reuse `DateRangeSelector` from `@/components/analytics/DateRangeSelector`)
4. **Job table** with columns: ID (truncated UUID), Tenant, Feature, Status (colored Badge), Profile, Duration, Cost, Created At
   - Row click opens a detail drawer/panel
   - Each status mapped to a colored `Badge` using the status projection from section 05
5. **Detail panel** (shown when a job is selected):
   - Status timeline showing all state transitions with timestamps
   - Input/output manifest JSON (collapsible)
   - stdout/stderr excerpts (monospace, scrollable)
   - Cost breakdown (estimated vs actual)
   - Cancel button (visible when job is in non-terminal state, calls `trpc.sandbox.cancelJob`)
   - Retry button (visible when job is in failed/timed_out state)
   - Link to sandbox artifacts (signed URL via `trpc.sandbox.getJobStatus`)

**Auth guard**: The page component checks `user.role === 'admin'` at the top. If not admin, redirect to `/dashboard`. Follow the pattern in `AdminQueueDashboard.tsx` which checks `useAuth()`.

**tRPC calls used**:
- `trpc.sandbox.listJobs.useQuery({ tenantId, status, featureType, days, limit, offset })` for the table
- `trpc.sandbox.getJobStatus.useQuery({ jobId })` for the detail panel
- `trpc.sandbox.cancelJob.useMutation()` for the cancel action
- `trpc.sandbox.getProfiles.useQuery()` for profile names in filters

### 10.2 Sandbox Profile Management Panel

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/SandboxProfilePanel.tsx`

A tabbed panel component (using Radix `Tabs` from `@/components/ui/tabs`) embedded in the Admin Sandbox page or in Admin Settings. It provides CRUD for sandbox profiles.

**UI elements:**
- Profile list with cards showing: slug, name, execution mode, CPU/memory/timeout, active status
- "Add Profile" button opens a dialog with form fields for all profile columns
- Edit button on each card opens the same dialog pre-filled
- Deactivate toggle (sets `isActive` to false, not a hard delete)

**Form fields** (mapped to `sandbox_profiles` table columns):
- `slug` (text, required, unique, kebab-case validation)
- `name` (text, required)
- `description` (textarea)
- `executionMode` (select: code, command, browser, file, media)
- `baseImage` (text, Docker image URI)
- `cpuLimit` (text, e.g., "1000m", "2000m")
- `memoryLimitMb` (number input)
- `ephemeralDiskMb` (number input)
- `timeoutSeconds` (number input)
- `networkDefaultAction` (select: deny, allow)
- `allowBrowser`, `allowCommand`, `allowCodeInterpreter`, `allowFileUpload` (checkbox toggles)
- `maxInputMb`, `maxOutputMb` (number inputs)

**tRPC procedures** (added to the sandbox router in `routers.ts`):
- `sandbox.admin.createProfile` -- admin-only, inserts new row
- `sandbox.admin.updateProfile` -- admin-only, updates by id
- `sandbox.admin.deactivateProfile` -- admin-only, sets isActive=false

### 10.3 Tenant Sandbox Policy Management Panel

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/TenantSandboxPolicyPanel.tsx`

A panel for managing per-tenant sandbox policies, accessible from the Admin Sandbox page or from the tenant detail view.

**UI elements:**
- Tenant selector dropdown at the top
- Once a tenant is selected, form fields for the policy:
  - `maxConcurrentSandboxes` (number, default 5)
  - `maxDailyRuntimeSeconds` (number, default 36000 = 10 hours)
  - `maxSingleJobSeconds` (number, default 1800 = 30 min)
  - `defaultNetworkAction` (select: deny, allow)
  - `defaultProfileId` (select from available profiles)
  - `egressRulesJson` (JSON editor or textarea for egress allowlist array)
  - `allowedImagesJson` (JSON editor or textarea for allowed Docker image list)
- Save button persists changes via tRPC

**tRPC procedures:**
- `sandbox.admin.getTenantPolicy` -- admin-only, returns policy for tenant
- `sandbox.admin.upsertTenantPolicy` -- admin-only, creates or updates tenant policy

### 10.4 Cost Analytics Extension

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/SandboxCostAnalytics.tsx`

A component that extends the existing usage analytics with sandbox-specific cost data. Can be embedded in the Admin Sandbox page as a tab or section.

**Data source**: Aggregate queries against `sandbox_jobs` table.

**Metrics displayed:**
- Total sandbox cost per time period (7d, 30d, 90d) using `DateRangeSelector`
- Cost per tenant (table, sorted by highest cost)
- Cost per feature type (bar chart or table breakdown: chat, skill, workflow, media, etc.)
- Cost per sandbox profile (table showing which profiles consume the most)
- Average cost per job
- Cost trend (optional: simple table showing daily totals)

**tRPC procedure:**
- `sandbox.admin.getCostAnalytics` -- admin-only, accepts `{ days: number }`, returns aggregated cost breakdown

The backend query uses SQL aggregation:

```sql
SELECT
  tenant_id,
  feature_type,
  sandbox_profile_id,
  COUNT(*) as job_count,
  SUM(cost_actual) as total_cost,
  AVG(cost_actual) as avg_cost,
  SUM(EXTRACT(EPOCH FROM (finished_at - started_at))) as total_runtime_seconds
FROM sandbox_jobs
WHERE created_at > NOW() - INTERVAL '? days'
  AND status IN ('completed', 'failed', 'timed_out')
GROUP BY tenant_id, feature_type, sandbox_profile_id
```

### 10.5 Route Registration

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`

Add the lazy import and route:

```typescript
const AdminSandbox = lazy(() => import("./pages/AdminSandbox"));
```

And in the `Router` function's `<Switch>` block, after the existing admin routes:

```tsx
<Route path="/admin/sandbox" component={AdminSandbox} />
```

### 10.6 Admin tRPC Procedures in routers.ts

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`

The sandbox router (created in section 05 at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/sandbox.ts`) needs additional admin-only procedures. These should be added as a nested `admin` sub-router within the sandbox router:

```typescript
// Inside the sandbox router definition
admin: router({
  createProfile: adminProcedure
    .input(sandboxProfileCreateSchema)
    .mutation(async ({ input, ctx }) => {
      /** INSERT into sandbox_profiles, return created profile. */
    }),

  updateProfile: adminProcedure
    .input(sandboxProfileUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      /** UPDATE sandbox_profiles WHERE id = input.id. */
    }),

  deactivateProfile: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      /** SET is_active = false WHERE id = input.id. */
    }),

  getTenantPolicy: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input, ctx }) => {
      /** SELECT * FROM tenant_sandbox_policies WHERE tenant_id = input.tenantId. */
    }),

  upsertTenantPolicy: adminProcedure
    .input(tenantSandboxPolicySchema)
    .mutation(async ({ input, ctx }) => {
      /** INSERT ... ON CONFLICT(tenant_id) DO UPDATE. */
    }),

  getCostAnalytics: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(7) }))
    .query(async ({ input, ctx }) => {
      /** Aggregate query on sandbox_jobs grouped by tenant, feature, profile. */
    }),
}),
```

The `adminProcedure` is the existing admin-guarded procedure middleware that checks `ctx.user.role === 'admin'` and throws `TRPCError({ code: 'FORBIDDEN' })` for non-admins. Use the same pattern as other admin routers in the project.

### 10.7 Data Retention Celery Tasks

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/sandbox_maintenance_tasks.py`

Three Celery beat tasks following the pattern of `cleanup_expired_tasks` in `media_tasks.py`:

**Task 1: `cleanup_expired_sandbox_jobs`**
- Schedule: Daily at 4:00 AM UTC (offset from existing 3:00 AM media cleanup)
- Logic:
  1. Find `sandbox_jobs` with terminal status (`completed`, `failed`, `timed_out`, `canceled`) and `finished_at` older than 30 days
  2. For each job, find associated `sandbox_artifacts` rows
  3. Delete S3/R2 objects for artifacts (using `boto3` client, same pattern as existing media cleanup)
  4. Delete `sandbox_artifacts` rows (cascade should handle this if FK is set, otherwise delete explicitly)
  5. Delete `sandbox_jobs` rows
  6. Log structured event with counts: `{ event: "sandbox_cleanup_completed", deleted_jobs: N, deleted_artifacts: M }`
- Additionally, delete debug artifacts (`artifact_type = 'debug'`) older than 3 days and primary artifacts older than 7 days (S3 objects only; DB records cleaned when parent job is deleted at 30 days)

**Task 2: `cleanup_orphan_sandboxes`**
- Schedule: Every 10 minutes
- Logic:
  1. If `OPENSANDBOX_ENABLED` is false, return immediately (no-op)
  2. Call OpenSandbox API to list all active sandboxes
  3. For each sandbox, check if its `opensandbox_id` exists in `sandbox_jobs` with a non-terminal status
  4. If no matching active job found and sandbox age > 15 minutes (grace period for startup race), destroy it
  5. Log structured event: `{ event: "orphan_sandbox_cleanup", destroyed_count: N }`
- Error handling: If OpenSandbox API is unreachable, log warning and return (do not raise, do not retry)

**Task 3: `detect_stuck_sandbox_jobs`**
- Schedule: Every 5 minutes
- Logic:
  1. Find `sandbox_jobs` in non-terminal status where:
     - For `provisioning`/`staging_inputs`: `created_at` older than 2x the profile's `create_timeout` (default: 240s)
     - For `executing`: `started_at` older than the profile's `timeout_seconds` + 60s buffer
     - For `collecting_outputs`/`persisting`: `started_at` older than `timeout_seconds` + 300s (5 min buffer for large outputs)
  2. For each stuck job:
     a. Attempt to collect partial outputs (if sandbox is reachable)
     b. Set `status = 'timed_out'` (for executing) or `status = 'failed'` with `status_reason = 'stuck_detected'`
     c. Attempt to destroy the associated sandbox
     d. Emit audit event: `{ event: "stuck_job_detected", job_id, previous_status, duration_seconds }`
  3. Log summary: `{ event: "stuck_job_sweep", detected_count: N, resolved_count: M }`

### 10.8 Celery Beat Schedule Registration

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`

Add the three new tasks to the existing `celery_app.conf.beat_schedule`:

```python
# In the beat_schedule dict, add:
"cleanup-expired-sandbox-jobs": {
    "task": "app.tasks.sandbox_maintenance_tasks.cleanup_expired_sandbox_jobs",
    "schedule": crontab(hour=4, minute=0),  # Daily at 4:00 AM UTC
},
"cleanup-orphan-sandboxes": {
    "task": "app.tasks.sandbox_maintenance_tasks.cleanup_orphan_sandboxes",
    "schedule": crontab(minute="*/10"),  # Every 10 minutes
},
"detect-stuck-sandbox-jobs": {
    "task": "app.tasks.sandbox_maintenance_tasks.detect_stuck_sandbox_jobs",
    "schedule": crontab(minute="*/5"),  # Every 5 minutes
},
```

Also add queue routing for sandbox maintenance tasks:

```python
# In task_routes dict, add:
"app.tasks.sandbox_maintenance_tasks.cleanup_expired_sandbox_jobs": {"queue": "celery"},
"app.tasks.sandbox_maintenance_tasks.cleanup_orphan_sandboxes": {"queue": "celery-sandbox"},
"app.tasks.sandbox_maintenance_tasks.detect_stuck_sandbox_jobs": {"queue": "celery-sandbox"},
```

The orphan cleanup and stuck detection tasks route to `celery-sandbox` because they may call the OpenSandbox API (to list/destroy sandboxes). The retention cleanup is lightweight DB work and goes to the default `celery` queue.

### 10.9 Task Registration in `__init__.py`

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/__init__.py`

Add imports for the new tasks so Celery autodiscovers them:

```python
from app.tasks.sandbox_maintenance_tasks import (
    cleanup_expired_sandbox_jobs,
    cleanup_orphan_sandboxes,
    detect_stuck_sandbox_jobs,
)
```

And add to the `__all__` list.

### 10.10 Monitoring Metrics Service

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/sandbox_metrics.py`

A helper module that emits structured metric events to the JSONL audit log. SmartSpecPro does not use Prometheus directly; instead, it writes structured events to JSONL files and the `provider_usage_log` table, which are queried by admin dashboards.

**Key metrics (emitted as structured JSONL events):**

| Metric Name | Type | Labels | Emission Point |
|-------------|------|--------|----------------|
| `sandbox_jobs_total` | Counter | `status`, `feature_type` | On job state transition to terminal |
| `sandbox_creation_duration_seconds` | Histogram | `profile_slug` | On sandbox provision complete |
| `sandbox_execution_duration_seconds` | Histogram | `profile_slug`, `feature_type` | On job completion |
| `sandbox_concurrent_active` | Gauge | none | Periodically from stuck job detector |
| `sandbox_artifacts_size_bytes` | Histogram | `artifact_type` | On artifact collection |
| `sandbox_circuit_breaker_state` | Gauge | none | On state transition in circuit breaker |
| `sandbox_hetzner_health` | Gauge | none | From health check task |

**Implementation approach:**

```python
"""Sandbox metric emission helpers."""
import structlog
from datetime import datetime

logger = structlog.get_logger()


def emit_metric(metric_name: str, value: float, labels: dict | None = None):
    """Emit a structured metric event to the JSONL audit log.

    This writes a structured log entry that can be queried by the admin
    cost analytics dashboard. The format matches the existing audit event
    pattern used throughout SmartSpecPro.
    """
    # Use structlog to emit, matching existing audit pattern


def emit_job_completed(job_id: str, status: str, feature_type: str,
                       duration_seconds: float, cost_actual: float,
                       profile_slug: str):
    """Emit all metrics for a completed sandbox job."""
    # Emits sandbox_jobs_total, sandbox_execution_duration_seconds, etc.


def emit_sandbox_created(sandbox_id: str, profile_slug: str,
                         creation_seconds: float):
    """Emit creation duration metric."""


def emit_concurrent_gauge(active_count: int):
    """Emit current count of active sandboxes."""


def emit_circuit_breaker_state(state: str):
    """Emit circuit breaker state (closed=0, open=1, half_open=2)."""
```

The metric emission functions are called from:
- `sandbox_job_worker.py` (section 04) -- on job completion and sandbox creation
- `sandbox_maintenance_tasks.py` (this section) -- on stuck job sweep for concurrent gauge
- `client.py` (section 03) -- on circuit breaker state changes

### 10.11 Hetzner Health Monitor

The Hetzner health check is implemented as part of the `cleanup_orphan_sandboxes` task (piggybacking on the same schedule) or as a separate lightweight task. It calls `GET https://sandbox.smartaihub.app/health` and emits the `sandbox_hetzner_health` gauge.

If the health check fails for 3 consecutive checks (30 minutes at 10-min interval), emit a high-priority alert event to the JSONL log with `severity: "critical"` so the admin dashboard can surface it.

---

## Data Retention Summary

Aligning with the existing project patterns (7-day media, 12-day Celery):

| Data Type | Retention | Mechanism |
|-----------|-----------|-----------|
| `sandbox_jobs` rows | 30 days after `finished_at` | `cleanup_expired_sandbox_jobs` Celery beat task |
| `sandbox_artifacts` DB rows | 30 days (with parent job) | CASCADE delete or explicit delete in cleanup task |
| S3/R2 primary output objects | 7 days | S3 lifecycle rule + cleanup task fallback |
| S3/R2 debug artifacts | 3 days | S3 lifecycle rule + cleanup task fallback |
| S3/R2 log artifacts | 7 days | S3 lifecycle rule + cleanup task fallback |
| JSONL audit events | Existing retention (per project policy) | Existing log rotation |

The cleanup task acts as a safety net. The primary retention mechanism for S3 objects should be S3 lifecycle rules configured at the bucket level (`smartspec-sandbox-artifacts` bucket). The Celery task handles DB cleanup and catches any S3 objects that lifecycle rules missed.

---

## Key Design Decisions

1. **Admin page vs. embedded panel**: The sandbox job explorer is a standalone page (`/admin/sandbox`) rather than a tab in the existing settings page, because it has substantial table/filter/detail UI that would be too crowded as a settings panel tab. Profile and policy management are panels within this page (tab-based).

2. **Polling-based detail view**: The job detail panel uses `trpc.sandbox.getJobStatus` with `refetchInterval: 2000` when the job is in a non-terminal state, matching the pattern established in section 05 for client-side polling.

3. **Cost analytics aggregation**: Cost queries run server-side via Drizzle ORM aggregation queries rather than fetching all jobs and computing client-side. This is necessary because the `sandbox_jobs` table can grow to thousands of rows.

4. **Reconciliation workers run on `celery-sandbox` queue**: Orphan cleanup and stuck job detection need access to the OpenSandbox API, so they run on the sandbox worker that has the appropriate network connectivity and dependencies.

5. **Metric emission via structlog, not Prometheus**: SmartSpecPro does not have a Prometheus server. Metrics are emitted as structured JSONL audit events and queried via the admin dashboard SQL aggregations. This matches the existing observability pattern.