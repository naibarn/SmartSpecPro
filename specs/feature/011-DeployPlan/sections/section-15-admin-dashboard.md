Now I have all the context. Let me extract the relevant information for section 15 (Admin Ops Dashboard) from both the implementation plan and TDD plan.

# Section 15: Admin Ops Dashboard

## Overview

This section implements an in-app admin dashboard at `/admin` with 6 health monitoring panels and automated email alerting. The dashboard provides real-time visibility into system health, performance metrics, and security events. Email alerts notify administrators when critical thresholds are breached.

## Dependencies

This section requires:
- **Section 4 (Cloud Tasks):** Admin dashboard queries Cloud Tasks queue metrics and task execution history.
- **Section 9 (R2 Storage):** Storage panel queries R2 API for usage statistics by prefix.
- **Section 10 (Redis Rate Limiting):** Security panel queries Upstash Redis for rate limit hit counts and abuse detection metrics.

The dashboard also integrates with existing database tables (`users`, `jobs`, `job_events`, `cloud_task_events`) and optionally with Cloud Monitoring API for infrastructure metrics.

## Background Context

The existing codebase has an admin UI foundation in `apps/web/client/src/pages/AdminSettings.tsx` and admin tRPC procedures using `adminProcedure` (role-based access control). This section extends the admin functionality with operational health monitoring.

The dashboard architecture follows the existing patterns:
- React components with TanStack Query for data fetching
- tRPC endpoints with Zod validation
- Role-based access (`role === 'admin' || role === 'domain_admin'`)
- PostgreSQL aggregation queries for metrics
- Redis for caching expensive computations

## Tests First

Based on `claude-plan-tdd.md`, implement these test stubs before writing the implementation:

### Access Control Tests (Vitest)

Create `apps/web/server/routers/__tests__/admin.dashboard.test.ts`:

```typescript
describe('Admin Dashboard Access Control', () => {
  it('returns 403 for non-admin user', async () => {
    // Test: admin.trafficStats endpoint rejects user with role='user'
  });

  it('returns 200 for admin user', async () => {
    // Test: admin.trafficStats endpoint accepts user with role='admin'
  });

  it('returns 200 for domain_admin user', async () => {
    // Test: admin.trafficStats endpoint accepts user with role='domain_admin'
  });
});
```

### Panel Endpoint Tests (Vitest)

Add to the same test file:

```typescript
describe('Admin Dashboard Panel Endpoints', () => {
  describe('admin.trafficStats', () => {
    it('returns daily user counts for past 7 days', async () => {
      // Test: Query returns array with 7 entries, each with date + user_count
    });

    it('includes login success/failure counts', async () => {
      // Test: Response includes successful_logins and failed_logins counts
    });
  });

  describe('admin.jobsHealth', () => {
    it('returns correct job counts by status', async () => {
      // Test: Response includes counts for queued, submitted, processing, done, failed, timeout
    });

    it('calculates average queue wait time', async () => {
      // Test: avg_queue_wait_ms is calculated from job_events timestamps
    });
  });

  describe('admin.kieAiHealth', () => {
    it('returns callback received rate and polling volume', async () => {
      // Test: Response includes webhook_count, poll_count, callback_rate_percent
    });

    it('includes external API error rate', async () => {
      // Test: Response includes kie_api_error_rate from job_events
    });
  });

  describe('admin.storageStats', () => {
    it('returns R2 usage by prefix with caching', async () => {
      // Test: Response includes usage for temp/, renders/, gallery/ prefixes
      // Test: Second call within 5 minutes returns cached data
    });

    it('includes object count growth over time', async () => {
      // Test: Response includes object_count_change_7d and object_count_change_30d
    });
  });

  describe('admin.securityStats', () => {
    it('returns rate limit hit counts', async () => {
      // Test: Response includes rate_limit_hits by endpoint
    });

    it('includes top IP hashes by request volume', async () => {
      // Test: Response includes top_ips array with hashed IP and request count
    });
  });
});
```

### Email Alerting Tests (Python pytest)

Create `python-backend/tests/api/test_admin_alerts.py`:

```python
@pytest.mark.unit
async def test_alert_fires_when_5xx_rate_exceeds_threshold():
    """Alert fires when 5xx rate exceeds 5% threshold."""
    # Test: Query Cloud Monitoring or logs for 5xx rate
    # Test: When rate > 5%, alert email is sent to admins
    pass

@pytest.mark.unit
async def test_alert_deduplication():
    """Alert is deduplicated (not re-sent within 1 hour)."""
    # Test: First breach sends email
    # Test: Second breach within 1 hour does not send email
    # Test: Redis key with 1-hour TTL controls dedup
    pass

@pytest.mark.integration
async def test_alert_email_sent_to_all_admins():
    """Alert email is sent to all admin users."""
    # Test: Query users table for role='admin' or role='domain_admin'
    # Test: SMTP send is called once per admin email
    pass
```

## Implementation Details

### 1. Frontend Components

**File:** `apps/web/client/src/pages/Admin/AdminDashboard.tsx`

Create a new admin dashboard page with tab-based navigation for 6 panels. Use Radix UI Tabs component (already in the codebase).

```typescript
// Stub signature only — implementation details left to developer
export function AdminDashboard() {
  // Tab state: traffic | api | jobs | kie | storage | security
  // Each tab renders a dedicated panel component
  // Auto-refresh every 30 seconds via TanStack Query refetchInterval
}
```

**Panel Components:**

Create separate components for each panel:
- `apps/web/client/src/pages/Admin/panels/TrafficPanel.tsx`
- `apps/web/client/src/pages/Admin/panels/ApiHealthPanel.tsx`
- `apps/web/client/src/pages/Admin/panels/JobsHealthPanel.tsx`
- `apps/web/client/src/pages/Admin/panels/KieAiHealthPanel.tsx`
- `apps/web/client/src/pages/Admin/panels/StoragePanel.tsx`
- `apps/web/client/src/pages/Admin/panels/SecurityPanel.tsx`

Each panel:
- Fetches data from a dedicated tRPC endpoint
- Displays metrics in card layout with charts (use Recharts or existing charting library)
- Shows loading state and error states
- Highlights critical values in red when thresholds are breached

**Route Guard:**

Add a route guard that redirects non-admin users to the main dashboard:

```typescript
// In routing logic (apps/web/client/src/App.tsx or equivalent)
<Route path="/admin/*">
  {user?.role === 'admin' || user?.role === 'domain_admin' ? (
    <AdminDashboard />
  ) : (
    <Redirect to="/dashboard" />
  )}
</Route>
```

### 2. Backend tRPC Endpoints

**File:** `apps/web/server/routers/admin.ts` (or create `adminDashboard.ts`)

Add six new admin procedures. All use `adminProcedure` base (existing in codebase).

#### Traffic & Auth Panel

```typescript
trafficStats: adminProcedure
  .input(z.object({
    days: z.number().min(1).max(30).default(7)
  }))
  .query(async ({ ctx, input }) => {
    // Query PostgreSQL:
    // 1. Daily unique users (COUNT DISTINCT userId from sessions or jobs)
    // 2. Login success/failure counts (from job_events or auth logs)
    // 3. Session counts per day
    // Return: Array of {date, unique_users, successful_logins, failed_logins, sessions}
  });
```

**Data Sources:**
- `users.lastLogin` column — daily unique users
- `job_events` table filtered by `event_type IN ('login_success', 'login_failed')` — auth metrics
- Optional: PostHog API for more detailed analytics

#### API Health Panel

```typescript
apiHealth: adminProcedure
  .input(z.object({
    hours: z.number().min(1).max(24).default(24)
  }))
  .query(async ({ ctx, input }) => {
    // Query Cloud Monitoring API or structured logs:
    // 1. p95/p99 latency by endpoint
    // 2. Error rate (5xx vs total requests) by endpoint
    // 3. Top failing endpoints
    // Return: {p95_latency_ms, p99_latency_ms, error_rate_percent, top_errors}
  });
```

**Data Sources:**
- Cloud Monitoring API (`monitoring.googleapis.com/v3/projects/{project}/timeSeries`)
- Or aggregate from structured logs in `apps/web/logs/` (if Cloud Monitoring not available yet)

#### Jobs Health Panel

```typescript
jobsHealth: adminProcedure
  .query(async ({ ctx }) => {
    // Query PostgreSQL:
    // 1. Count jobs by status (queued, submitted, processing, done, failed, timeout)
    // 2. Calculate avg queue wait time: avg(job_events.created_at[status=processing] - jobs.created_at)
    // 3. Retry counts from cloud_task_events table
    // Return: {counts_by_status, avg_queue_wait_ms, retry_count}
  });
```

**Data Sources:**
- `jobs` table (or `media_tasks` depending on schema)
- `cloud_task_events` table (created in Section 4)
- `job_events` table for state transitions

#### Kie AI Health Panel

```typescript
kieAiHealth: adminProcedure
  .input(z.object({
    hours: z.number().min(1).max(24).default(24)
  }))
  .query(async ({ ctx, input }) => {
    // Query job_events table:
    // 1. Count webhook_received events
    // 2. Count poll_completed events
    // 3. Calculate callback rate: webhook_count / (webhook_count + poll_count)
    // 4. Error rate: poll_failed / total_polls
    // Return: {webhook_count, poll_count, callback_rate_percent, error_rate_percent}
  });
```

**Data Sources:**
- `job_events` table filtered by `event_type IN ('webhook_received', 'poll_completed', 'poll_failed')`

#### Storage Panel

```typescript
storageStats: adminProcedure
  .query(async ({ ctx }) => {
    // Check Redis cache first (key: admin:storage-stats, TTL: 5 minutes)
    // If miss, query R2 S3 API:
    // 1. ListObjectsV2 with prefix 'temp/' → count + total size
    // 2. ListObjectsV2 with prefix 'renders/' → count + total size
    // 3. ListObjectsV2 with prefix 'gallery/' → count + total size
    // 4. Cache result in Redis
    // Return: {temp_gb, renders_gb, gallery_gb, temp_count, renders_count, gallery_count}
  });
```

**Data Sources:**
- R2 S3 API via `@aws-sdk/client-s3` (existing in `apps/web/server/storage.ts`)
- Redis cache to avoid hitting R2 API on every dashboard load

#### Security Panel

```typescript
securityStats: adminProcedure
  .query(async ({ ctx }) => {
    // Query Upstash Redis:
    // 1. Scan for ratelimit:* keys → count hits
    // 2. Aggregate by endpoint
    // 3. Hash IPs and count requests per IP (from logs or Redis tracking)
    // Return: {rate_limit_hits_by_endpoint, top_ips}
  });
```

**Data Sources:**
- Upstash Redis (rate limit counters from Section 10)
- Structured logs for IP-based request tracking

### 3. Email Alerting

**File:** `python-backend/app/api/internal/admin_alerts.py`

Create a new endpoint for Cloud Scheduler to call every 5 minutes:

```python
@router.post("/admin-alerts/check")
async def check_admin_alerts(request: Request):
    """
    Cloud Scheduler endpoint to check alert thresholds and send emails.
    
    Validates OIDC token from Cloud Scheduler service account.
    Queries same data sources as dashboard panels.
    Fires alerts when thresholds breached.
    """
    # Validate OIDC token (reuse middleware from Section 4)
    
    # Check thresholds:
    # 1. Auth failure rate > 20%
    # 2. 5xx rate > 5% over 5 minutes
    # 3. Job failure rate > 10%
    # 4. Cloud Tasks queue backlog > 100
    # 5. Kie AI callback miss rate > 50% over 30 minutes
    
    # For each breached threshold:
    #   - Check Redis dedup key: alert:{metric}:sent
    #   - If not exists: send email, set key with 1-hour TTL
    #   - If exists: skip (deduplicated)
    
    # Send email via SMTP (from system_settings table)
    # Recipients: all users with role='admin' or 'domain_admin'
    
    return {"alerts_sent": count}
```

**Alert Email Template:**

Subject: `[SmartSpecPro Alert] {metric} threshold breached`

Body:
```
Alert: {metric_name}
Current Value: {current_value}
Threshold: {threshold_value}
Time: {timestamp}

Dashboard: https://app.smartaihub.app/admin

This alert will not repeat for 1 hour unless the issue persists.
```

**Cloud Scheduler Job:**

Add to Section 5's scheduler table:

| Scheduler Job | Cron Expression | Target Queue | Handler Path |
|--------------|----------------|--------------|-------------|
| admin-alerts-check | `*/5 * * * *` | periodic-tasks | /admin-alerts/check |

### 4. Database Queries

All dashboard queries must be optimized with indexes. Add these indexes if not already present:

```sql
-- For traffic stats (daily user counts)
CREATE INDEX idx_users_last_login ON users(last_login);

-- For job health (status aggregation)
CREATE INDEX idx_jobs_status_created ON jobs(status, created_at);

-- For Kie AI health (event type filtering)
CREATE INDEX idx_job_events_type_created ON job_events(event_type, created_at);

-- For Cloud Tasks tracking
CREATE INDEX idx_cloud_task_events_status ON cloud_task_events(status, created_at);
```

### 5. Configuration

**Environment Variables:**

No new environment variables required. Uses existing:
- `DATABASE_URL` (PostgreSQL)
- `REDIS_UPSTASH_URL` (rate limit counters, cache)
- `R2_ACCESS_KEY`, `R2_SECRET_KEY` (storage stats)
- SMTP configuration from `system_settings` table (alerting)

**Feature Flags:**

No feature flags required. Dashboard is always available to admins.

## File Paths Summary (Actual Implementation)

### Files Created

1. `apps/web/client/src/pages/Admin/AdminOpsDashboard.tsx` — Main dashboard page (plan: AdminDashboard.tsx)
2. `apps/web/client/src/pages/Admin/panels/TrafficPanel.tsx` — Traffic & Auth panel
3. `apps/web/client/src/pages/Admin/panels/ApiHealthPanel.tsx` — API Health panel
4. `apps/web/client/src/pages/Admin/panels/JobsHealthPanel.tsx` — Jobs Health panel
5. `apps/web/client/src/pages/Admin/panels/KieAiHealthPanel.tsx` — Kie AI Health panel
6. `apps/web/client/src/pages/Admin/panels/StoragePanel.tsx` — Storage panel
7. `apps/web/client/src/pages/Admin/panels/SecurityPanel.tsx` — Security panel
8. `apps/web/server/routers/adminOps.ts` — tRPC router with 6 admin procedures
9. `python-backend/app/api/admin_alerts.py` — Alert checking endpoint (plan: internal/admin_alerts.py)
10. `apps/web/server/routers/__tests__/adminOps.test.ts` — Router structure tests
11. `python-backend/tests/api/test_admin_alerts.py` — Alert dedup/threshold tests

### Files Modified

1. `apps/web/server/routers.ts` — Import and register `adminOpsRouter`
2. `apps/web/client/src/App.tsx` — Add `/admin/ops` route (plan: `/admin`)
3. `python-backend/app/main.py` — Import and register `admin_alerts` router

### Deviations from Plan

- **Route**: `/admin/ops` instead of `/admin` (avoids conflict with existing admin routes)
- **File naming**: `AdminOpsDashboard.tsx` instead of `AdminDashboard.tsx` (clearer purpose)
- **Router**: Separate `adminOps.ts` instead of modifying existing `admin.ts` (cleaner separation)
- **Auth**: Uses `domainAdminProcedure` (admin + domain_admin) instead of `adminProcedure` (admin only)
- **Alert auth**: Uses `X-Proxy-Token` header instead of OIDC (matches existing internal endpoint pattern)
- **Error rate**: Counts 5xx only (not 4xx) per plan specification
- **Indexes**: Not added (tables already have adequate indexes from earlier sections)
- **Login counts**: Not implemented (no auth event log table exists in current schema)

## Implementation Approach

### Phase 1: Backend Foundation (2-3 hours)

1. Create test stubs for all 6 tRPC endpoints
2. Implement tRPC procedures with database queries
3. Add Redis caching for storage stats
4. Run tests to validate data sources

### Phase 2: Frontend UI (3-4 hours)

1. Create dashboard page with tab layout
2. Build 6 panel components with mock data first
3. Wire up TanStack Query hooks to tRPC endpoints
4. Add charts and threshold highlighting
5. Test access control (admin vs non-admin)

### Phase 3: Email Alerting (2-3 hours)

1. Create Python alert checking endpoint
2. Implement threshold checks and deduplication
3. Add SMTP email sending (reuse existing SMTP service)
4. Create Cloud Scheduler job to call endpoint every 5 minutes
5. Test alert firing and deduplication

### Phase 4: Polish (1-2 hours)

1. Add database indexes for query performance
2. Optimize slow queries
3. Add loading skeletons and error states
4. Document threshold values and alert conditions

## Critical Considerations

1. **Performance:** Storage stats queries against R2 can be slow. Always cache results for 5 minutes in Redis.

2. **Deduplication:** Alert deduplication is critical to prevent email spam. Always check Redis dedup key before sending.

3. **OIDC Validation:** The alert endpoint must validate Cloud Scheduler's OIDC token (see Section 4 for pattern).

4. **Data Freshness:** Dashboard auto-refreshes every 30 seconds, but avoid overwhelming the database. Use stale-while-revalidate pattern in TanStack Query.

5. **Multi-Tenancy:** If implementing multi-tenant isolation in the future, add `tenantId` filtering to all queries.

6. **Cloud Monitoring Integration:** If Cloud Monitoring API is not available, fall back to structured log aggregation from `apps/web/logs/audit/` (see CLAUDE.md LLM Debugging Protocol).

## Validation Checklist

After implementation, verify:

- [ ] All 6 panels display data without errors
- [ ] Non-admin users cannot access `/admin` routes
- [ ] Storage stats are cached in Redis (check with Redis CLI)
- [ ] Alert email fires when threshold breached (test by forcing high error rate)
- [ ] Alert deduplication works (second breach within 1 hour does not send email)
- [ ] All database queries use indexes (check EXPLAIN ANALYZE)
- [ ] Dashboard auto-refreshes every 30 seconds
- [ ] All tests pass (`pnpm test` for Node.js, `pytest` for Python)

## Next Steps

After completing this section:
- **Section 16 (Cloud Monitoring):** Extend infrastructure monitoring with Cloud Monitoring dashboards that complement the in-app admin dashboard.
- **Section 19 (Load Testing):** Use the admin dashboard to observe system behavior under load testing scenarios.