# Funnel Dashboard Feature - Usage Guide

**Feature**: Funnel Analytics Dashboard
**Status**: Ready for Phased Rollout (Internal Phase)
**Last Updated**: 2026-02-17

---

## Overview

The Funnel Dashboard provides analytics and insights into user journey through acquisition, activation, usage, and revenue stages. It tracks milestone events, aggregates metrics, and provides exports for analysis.

**Key Capabilities**:
- Track user progression through funnel stages
- Aggregate event counts and unique user counts
- Time-series analysis with day/week/month buckets
- Export analytics data (CSV/JSON)
- Role-based access control (RBAC)
- Privacy-preserving export defaults

---

## Architecture

### Components

1. **Data Layer**:
   - `funnel_events` table: Stores milestone events with tenant/domain scope
   - Indexes on `tenantId`, `eventTime`, `eventName` for performance
   - Properties stored as JSONB for flexible event metadata

2. **Service Layer**:
   - **Tracker Service**: Deduplicates and routes events to analytics sidechannel
   - **Milestone Instrumentation**: Emits events at key user actions
   - **Backfill Jobs**: Reconciles historical data with current state

3. **API Layer**:
   - **funnelAnalytics Router**: tRPC endpoints for queries and exports
   - **Rate Limiting**: 10/min exports, 20/min queries
   - **Caching**: 5-minute TTL with Redis

4. **Security Layer**:
   - **RBAC**: Admin and domain_admin roles required
   - **Tenant Isolation**: Strict scope filtering prevents cross-tenant exposure
   - **Property Sanitization**: Removes PII from responses (email, phone, IP)
   - **Audit Logging**: All operations logged for compliance

5. **Rollout Layer**:
   - **Feature Flags**: Phase-based enablement (Internal → Domain Admin → GA)
   - **SLO Gates**: Automated checks for latency, error rate, drift
   - **Rollback**: One-command rollback with audit trail

---

## Getting Started

### For Administrators

**Access Requirements**:
- Role: `admin` or `domain_admin`
- Feature Flag: `FUNNEL_DASHBOARD_ENABLED=true`
- Rollout Phase: Internal (admin only) or Domain Admin (admin + domain_admin)

**Accessing the Dashboard**:
1. Log in as admin or domain_admin
2. Navigate to Admin section
3. Click "Funnel Analytics" tab
4. Select date range and stage filter
5. View aggregates, time series, or raw events

**Exporting Data**:
1. Navigate to Export tab
2. Select date range, stage, and format (CSV or JSON)
3. Click Export
4. Download file (automatically truncated at 5000 rows)

**Privacy Note**: Raw events exclude PII by default. To include userId in exports, set `includeUserData=true` flag (elevated access).

---

## API Reference

### Endpoints

All endpoints require `admin` or `domain_admin` role and are under `funnelAnalytics.*` namespace.

#### 1. Summary
**Purpose**: Get aggregate event counts and unique user counts

**Input**:
```typescript
{
  from: Date;           // Start date
  to: Date;             // End date (max 90 days range)
  bucket?: "day" | "week" | "month";  // Default: "day"
  stage?: "acquisition" | "activation" | "usage" | "revenue";
  bypassCache?: boolean;  // Default: false
}
```

**Output**:
```typescript
{
  stages: Array<{
    eventName: string;
    total: number;
    uniqueUsers: number;
  }>;
  rangeClamped: boolean;  // True if range > 90 days
  cached: boolean;        // True if served from cache
}
```

**Example**:
```typescript
const result = await trpc.funnelAnalytics.summary.query({
  from: new Date('2026-01-01'),
  to: new Date('2026-01-31'),
  stage: 'acquisition',
});
```

#### 2. Time Series
**Purpose**: Get bucketed event counts over time

**Input**: Same as Summary

**Output**:
```typescript
{
  series: Array<{
    bucket: string;       // ISO date string
    eventName: string;
    total: number;
  }>;
  rangeClamped: boolean;
  cached: boolean;
}
```

#### 3. Raw Events
**Purpose**: Get individual user events (paginated)

**Input**:
```typescript
{
  from: Date;
  to: Date;
  eventName?: string;
  limit?: number;        // Max 500, default 100
  offset?: number;       // Default 0
  includeUserData?: boolean;  // Default false (elevated access)
}
```

**Output**:
```typescript
{
  events: Array<{
    id: string;
    eventName: string;
    eventTime: string;    // ISO datetime
    userId?: string;      // Only if includeUserData=true
    domain: string | null;
    properties: Record<string, unknown>;  // Sanitized
  }>;
  total: number;
}
```

**Rate Limit**: 20 requests/minute

#### 4. Export
**Purpose**: Export analytics data for offline analysis

**Input**:
```typescript
{
  from: Date;
  to: Date;
  bucket?: "day" | "week" | "month";
  stage?: "acquisition" | "activation" | "usage" | "revenue";
  format?: "csv" | "json";  // Default: "csv"
}
```

**Output**:
```typescript
{
  data: string;          // CSV or JSON string
  mimeType: string;      // "text/csv" or "application/json"
  filename: string;      // Auto-generated with date
}
```

**Rate Limit**: 10 requests/minute
**Row Limit**: 5000 rows (truncated if exceeded)

#### 5. Invalidate Cache
**Purpose**: Clear cached analytics data for tenant

**Input**: None (uses context tenantId)

**Output**:
```typescript
{
  cleared: number;       // Number of cache keys deleted
}
```

---

## Milestone Events

The funnel tracks these key milestones:

### Acquisition Stage
- `signup_completed`: User completed registration
- `email_verified`: User verified email address

### Activation Stage
- `first_conversation`: User initiated first chat
- `first_llm_request`: User sent first LLM request

### Usage Stage
- `first_media_generation`: User generated first media (image/video)

### Revenue Stage
- `purchase_completed`: User completed one-time purchase
- `subscription_started`: User started subscription

**Adding New Milestones**:
1. Define event in `STAGE_PRESETS` (funnelAnalytics.ts)
2. Add instrumentation at appropriate code location
3. Test deduplication (events within 5 minutes are deduped)

---

## Operational Procedures

### Monitoring

**Key Metrics**:
- p95 Latency: Target <2s (canary <3s)
- Error Rate: Target <1% (canary <5%)
- Reconciliation Drift: Target <5% (canary <10%)
- Cache Hit Rate: Target >70% (canary >60%)

**Dashboards**:
- Application metrics: Latency, error rate, throughput
- Database: Query performance, connection pool
- Cache: Hit rate, memory usage, eviction rate
- Backfill: Job success rate, reconciliation drift

### Rollout Phases

**Phase 1: Internal (Canary)**
- Access: Admin role only
- Duration: Minimum 3 days
- Feature Flag: `FUNNEL_DASHBOARD_ENABLED=true`, `FUNNEL_DASHBOARD_DOMAIN_ADMIN=false`

**Phase 2: Domain Admin**
- Access: Admin + domain_admin roles
- Duration: Minimum 7 days
- Feature Flag: `FUNNEL_DASHBOARD_ENABLED=true`, `FUNNEL_DASHBOARD_DOMAIN_ADMIN=true`

**Phase 3: General Availability**
- Access: All authenticated users
- Duration: Ongoing
- Feature Flag: Full GA configuration

**Advancing Phases**:
1. Verify all SLO gates pass for required duration
2. Complete phase-specific checklist (see runbook)
3. Get approval from Engineering Manager
4. Update feature flags via Redis
5. Monitor for 2 hours post-change

**Rollback**:
```bash
# Immediate rollback (cross-tenant exposure or SLO breach)
redis-cli SET feature-flag:FUNNEL_DASHBOARD_ENABLED "false"

# Partial rollback (keep internal, disable domain_admin)
redis-cli SET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN "false"
```

See `docs/runbooks/funnel-dashboard-rollout.md` for detailed procedures.

### Troubleshooting

**Issue: High Latency**
1. Check cache hit rate (target >70%)
2. Review database slow query log
3. Verify indexes exist on funnel_events
4. Consider increasing cache TTL (5 min → 15 min)

**Issue: Cross-Tenant Data Exposure**
1. IMMEDIATE: Disable feature flag
2. Halt all backfill jobs
3. Review audit logs for affected tenants
4. Investigate scope filter logic
5. Do NOT re-enable until root cause fixed

**Issue: Reconciliation Drift High**
1. Halt backfill jobs
2. Run reconciliation report for affected tenants
3. Check for duplicate events (idempotency issue?)
4. Check for missing events (instrumentation gap?)
5. Re-run backfill after fix

**Issue: Export Abuse**
1. Review audit logs (`funnel_export` and `funnel_raw_events_query`)
2. Identify abusive users (>100 exports/day)
3. Contact users if suspicious
4. Temporarily increase rate limits if legitimate
5. Disable rawEvents endpoint if malicious

---

## Development

### Running Tests

```bash
# All funnel tests
npm --workspace @smartspec/web test -- funnelAnalytics

# Security/RBAC tests
npm --workspace @smartspec/web test -- funnelAnalytics.rbac.test.ts

# Rollout tests
npm --workspace @smartspec/web test -- funnelRollout.test.ts
```

**Expected**: 50 tests passing (23 + 11 + 16)

### Adding New Analytics Endpoint

1. Define input schema with Zod
2. Add procedure to funnelAnalyticsRouter
3. Use `rateLimitedDomainAdminProcedure` if sensitive
4. Call `resolveScope(ctx)` to get tenant filter
5. Apply `scopeConditions(scope)` to queries
6. Sanitize properties with `sanitizeEventProperties()`
7. Add audit logging with `auditLogger.log()`
8. Write tests (unit + RBAC integration)

### Database Migrations

**Applying Migrations**:
```bash
cd apps/web
pnpm db:push  # Generates and applies migration
```

**Rollback** (if needed):
```bash
# Restore from backup
psql $DATABASE_URL < .db-backups/funnel_events_TIMESTAMP.sql
```

**Safety**: Always backup before migration (see `CLAUDE.md` Database Safety Protocol)

---

## Security

### Threat Model

**Protected Against**:
- ✅ Cross-tenant data exposure (scope filtering)
- ✅ Unauthorized access (RBAC)
- ✅ PII leakage (property sanitization)
- ✅ Data exfiltration (rate limiting, row limits)
- ✅ Injection attacks (parameterized queries, Zod validation)

**Residual Risks**:
- ⚠️ Inference attacks (aggregate data may reveal patterns)
- ⚠️ Timing attacks (response time may leak info)
- ⚠️ Cache poisoning (Redis compromise)

### Compliance

**GDPR**:
- ✅ Data minimization (property sanitization)
- ✅ Right to erasure (can delete user events)
- ✅ Audit trail (all operations logged)
- ✅ Explicit consent (per-user data requires flag)

**PCI DSS**: Financial data (SSN, creditCard, CVV) excluded from properties

**Audit Logs**: Retained for 90 days, stored in `apps/web/logs/audit/`

---

## References

**Implementation Documentation**:
- Plan: `specs/feature/014-Core-Funnel-Dashboard/implementation-plan.md`
- Sections: `specs/feature/014-Core-Funnel-Dashboard/sections/`
- Code Reviews: `specs/feature/014-Core-Funnel-Dashboard/implementation/code_review/`

**Operational Runbooks**:
- Rollout: `docs/runbooks/funnel-dashboard-rollout.md`
- Ownership: `docs/runbooks/funnel-dashboard-ownership.md`

**Verification**:
- Checklist: `docs/verification/funnel-dashboard-release-checklist.md`
- Report: `docs/verification/funnel-dashboard-release-report.md`

**Code**:
- Router: `apps/web/server/routers/funnelAnalytics.ts`
- Rollout: `apps/web/server/services/funnelRollout.ts`
- Tests: `apps/web/server/routers/funnelAnalytics.test.ts`
- RBAC Tests: `apps/web/server/routers/funnelAnalytics.rbac.test.ts`
- Rollout Tests: `apps/web/server/services/funnelRollout.test.ts`

---

## Support

**On-Call**: See `docs/runbooks/funnel-dashboard-ownership.md` for alert response procedures

**Escalation**:
- Critical (cross-tenant exposure): Security Lead → Engineering Manager → VP Engineering
- High (SLO breach): On-Call Engineer → Backend Team Lead → Engineering Manager
- Medium (reconciliation drift): Data Engineer → Backend Team Lead

**Documentation Issues**: Contact Product Manager
**Code Issues**: Contact Backend Team Lead
