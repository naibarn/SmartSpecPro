# Funnel Dashboard Rollout and Rollback Runbook

**Feature**: Funnel Analytics Dashboard
**Owner**: Engineering Team
**Last Updated**: 2026-02-16
**Version**: 1.0

## Table of Contents
1. [Rollout Phases](#rollout-phases)
2. [SLO Gates and Thresholds](#slo-gates-and-thresholds)
3. [Phase Advancement Procedure](#phase-advancement-procedure)
4. [Rollback Triggers and Actions](#rollback-triggers-and-actions)
5. [Post-Rollback Verification](#post-rollback-verification)
6. [Operational Ownership](#operational-ownership)

---

## Rollout Phases

### Phase 0: Disabled (Pre-Rollout)
**Status**: Feature completely disabled
**Flag**: `FUNNEL_DASHBOARD_ENABLED=false`
**Access**: No one
**Exit Criteria**: Code deployed, tests passing, runbook reviewed

### Phase 1: Internal (Canary)
**Status**: Available to internal admins only
**Flag**: `FUNNEL_DASHBOARD_ENABLED=true`, `FUNNEL_DASHBOARD_DOMAIN_ADMIN=false`
**Access**: Users with `role=admin`
**Duration**: Minimum 3 days
**Exit Criteria**:
- All SLO gates pass with canary thresholds for 48 consecutive hours
- Canary validation checklist completed (see below)
- Zero cross-tenant exposure incidents
- Manual smoke testing complete

### Phase 2: Domain Admin
**Status**: Available to domain administrators
**Flag**: `FUNNEL_DASHBOARD_ENABLED=true`, `FUNNEL_DASHBOARD_DOMAIN_ADMIN=true`
**Access**: Users with `role=admin` or `role=domain_admin`
**Duration**: Minimum 7 days
**Exit Criteria**:
- All SLO gates pass with production thresholds for 72 consecutive hours
- Fallback anomaly review completed
- Export abuse patterns reviewed (no incidents)
- Customer success team trained

### Phase 3: General Availability
**Status**: Available to all authenticated users
**Flag**: Full GA configuration
**Access**: All authenticated users (based on subscription tier)
**Exit Criteria**: Business decision with Product team approval

---

## SLO Gates and Thresholds

### Canary Thresholds (Phase 1: Internal)
| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| **p95 Latency** | ≤ 3000ms | More lenient for early testing; complex aggregations allowed |
| **Error Rate** | ≤ 5% | Allows for debugging and iteration |
| **Reconciliation Drift** | ≤ 10% | Accounts for backfill timing variations |
| **Cache Hit Rate** | ≥ 60% | Acceptable during cache warmup period |

### Production Thresholds (Phase 2+)
| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| **p95 Latency** | ≤ 2000ms | Maintains good user experience for analytics |
| **Error Rate** | ≤ 1% | Standard production reliability target |
| **Reconciliation Drift** | ≤ 5% | Ensures data accuracy for business decisions |
| **Cache Hit Rate** | ≥ 70% | Prevents database load spikes |

---

## Phase Advancement Procedure

### Prerequisites
Before advancing to ANY phase, verify:
1. ✅ Previous phase exit criteria met
2. ✅ On-call engineer assigned and available
3. ✅ Rollback runbook reviewed by team
4. ✅ Monitoring dashboards configured
5. ✅ Alert rules tested and verified

### Steps to Advance Phase

**Step 1: Collect Metrics**
```bash
# Query production metrics for the past 72 hours
# Example: Check Prometheus/Grafana dashboard
- p95 latency for funnelAnalytics endpoints
- Error rate from application logs
- Reconciliation job success rate
- Redis cache hit rate
```

**Step 2: Evaluate Gates**
```typescript
// Run gate evaluation (programmatically or manual calculation)
import { evaluateRolloutGate } from './server/services/funnelRollout';

const metrics = {
  p95LatencyMs: 1850,          // From monitoring
  errorRate: 0.008,             // From logs
  reconciliationDriftPercent: 3.2, // From backfill jobs
  cacheHitRate: 0.78,           // From Redis
};

const result = evaluateRolloutGate('domain_admin', metrics);
console.log('Gate passed:', result.passed);
console.log('Failed checks:', result.failedChecks);
```

**Step 3: Complete Phase-Specific Checklist**

#### Internal → Domain Admin Checklist
- [ ] Canary validation checklist 100% complete (see section below)
- [ ] Zero cross-tenant exposure incidents in past 72 hours
- [ ] All audit logs reviewed for anomalies
- [ ] Export endpoint usage reviewed (no abuse patterns)
- [ ] Manual regression testing on 5+ real tenant accounts
- [ ] Performance profiling completed (no N+1 queries)

#### Domain Admin → General Availability Checklist
- [ ] Fallback anomaly review document signed off
- [ ] Customer success team trained on feature
- [ ] Documentation published (user guide + API docs)
- [ ] Pricing/subscription tier logic implemented (if applicable)
- [ ] Rate limiting verified under load test
- [ ] Export limits tested (5000 row truncation works)
- [ ] Privacy audit completed (GDPR compliance verified)

**Step 4: Enable Feature Flag**
```bash
# Use Redis CLI or admin panel to set feature flags
redis-cli SET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN "true"

# Verify flag is set
redis-cli GET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN
# Expected: "true"
```

**Step 5: Monitor for 2 Hours**
After flag change, actively monitor for 2 hours:
- Dashboard latency (p50, p95, p99)
- Error logs (filter by funnelAnalytics)
- Audit logs (scope fallback, export operations)
- Cache hit rate (should remain stable)
- Database query performance (check slow query log)

**Step 6: Announce to Team**
Post in #engineering Slack channel:
```
🚀 Funnel Dashboard: Advanced to [PHASE NAME]
- Enabled for: [USER ROLES]
- Metrics: [GATE STATUS]
- On-call: [ENGINEER NAME]
- Rollback contact: [MANAGER NAME]
```

---

## Rollback Triggers and Actions

### Immediate Rollback (Priority: IMMEDIATE)

#### Trigger 1: Cross-Tenant Data Exposure
**Condition**: Any incident where a domain_admin user sees data from another tenant
**Detection**: User report, security audit, or audit log review
**Actions**:
1. **IMMEDIATE**: Disable feature flag
   ```bash
   redis-cli SET feature-flag:FUNNEL_DASHBOARD_ENABLED "false"
   ```
2. **IMMEDIATE**: Halt all funnel backfill jobs
   ```bash
   # Stop Celery workers or pause job queue
   celery -A app.core.celery_app control shutdown
   ```
3. **IMMEDIATE**: Notify security team and on-call manager
4. **Within 15 min**: Review audit logs for affected tenants
5. **Within 30 min**: Draft incident report
6. **Within 24 hours**: Root cause analysis and remediation plan

#### Trigger 2: SLO Breach (3+ Gates Failing)
**Condition**: p95 latency >5s OR error rate >5% OR reconciliation drift >20%
**Detection**: Automated alert from monitoring
**Actions**:
1. **IMMEDIATE**: Rollback to previous phase
   ```bash
   redis-cli SET feature-flag:FUNNEL_DASHBOARD_DOMAIN_ADMIN "false"
   ```
2. Keep internal phase enabled for debugging
3. Notify on-call engineer
4. Collect diagnostic data (query plans, slow logs, traces)
5. Investigate root cause before re-enabling

### High Priority Rollback

#### Trigger 3: Reconciliation Divergence Trend
**Condition**: Drift increasing >2% per hour for 3+ consecutive hours
**Detection**: Automated monitoring of reconciliation job results
**Actions**:
1. Halt all backfill jobs
2. Disable cache writes (force read-through)
3. Investigate data integrity (compare funnel_events vs source data)
4. Do NOT disable frontend (existing data is still valid)
5. Resume backfill only after root cause identified

#### Trigger 4: Export Abuse Pattern
**Condition**: Rate limit exceeded by >10 users in 1 hour OR single user >100 exports/day
**Detection**: Rate limiter alerts, audit log analysis
**Actions**:
1. Review audit logs for affected users/tenants
2. Temporarily increase rate limits if legitimate usage
3. Contact users if abuse suspected
4. If malicious: Disable rawEvents endpoint temporarily
   ```typescript
   // Comment out rawEvents procedure or add feature flag gate
   ```

### Medium Priority Rollback

#### Trigger 5: Cache Stampede
**Condition**: Cache hit rate drops below 30% for >10 minutes
**Detection**: Redis monitoring alert
**Actions**:
1. Increase cache TTL from 5 min to 15 min
2. Investigate cache invalidation pattern (check logs)
3. Add cache warmup job if needed
4. Monitor for recovery (should resolve within 30 min)

---

## Post-Rollback Verification

After ANY rollback, complete this checklist before re-enabling:

### Immediate Verification (Within 1 Hour)
- [ ] Feature flag confirmed disabled in Redis
- [ ] All backfill jobs confirmed halted (check Celery queue)
- [ ] No new errors in application logs
- [ ] User-facing routes return expected error or "feature unavailable" message
- [ ] Audit logs capture rollback event with timestamp and trigger

### Auth & Credit Smoke Checks (Within 2 Hours)
- [ ] User can still log in (auth not affected)
- [ ] Credit balance queries work (LLM requests unaffected)
- [ ] Chat interface loads and responds (core functionality intact)
- [ ] Other admin features accessible (library, media, settings)

### Scope Safety Verification (Within 4 Hours)
- [ ] Test with 3 different tenant accounts (different domains)
- [ ] Verify no cross-tenant data visible in ANY endpoint
- [ ] Check audit logs for any scope fallback anomalies
- [ ] Review export audit logs for last 24 hours (no leaks)

### Data Integrity Check (Within 24 Hours)
- [ ] Run reconciliation report on sample of tenants (10+)
- [ ] Compare funnel_events count vs source data
- [ ] Verify no duplicate events (idempotency check)
- [ ] Spot-check event properties (sanitization still working)

### Root Cause Analysis (Within 3 Days)
- [ ] Incident report drafted
- [ ] Root cause identified and documented
- [ ] Fix implemented and tested in staging
- [ ] Regression test added to prevent recurrence
- [ ] Runbook updated with lessons learned

---

## Operational Ownership

See [funnel-dashboard-ownership.md](./funnel-dashboard-ownership.md) for detailed ownership matrix.

### Quick Reference

| Alert Class | Primary Owner | Secondary | Response Window |
|-------------|---------------|-----------|-----------------|
| Cross-tenant exposure | Security Lead | Engineering Manager | 15 minutes |
| SLO breach | On-call Engineer | Backend Team Lead | 30 minutes |
| Reconciliation divergence | Data Engineer | Backend Team Lead | 1 hour |
| Export abuse | Security Lead | On-call Engineer | 2 hours |
| Cache issues | Infrastructure Engineer | Backend Team Lead | 4 hours |

---

## Canary Validation Checklist

**Complete this checklist before advancing from Internal to Domain Admin phase.**

### Functional Testing
- [ ] Summary endpoint returns correct aggregates (tested with 3+ event types)
- [ ] Time series endpoint returns data for all bucket types (day/week/month)
- [ ] rawEvents endpoint returns per-user data when `includeUserData=true`
- [ ] rawEvents endpoint excludes userId when `includeUserData=false`
- [ ] Export endpoint generates valid CSV format
- [ ] Export endpoint generates valid JSON format
- [ ] Export limit truncates at 5000 rows (tested with large dataset)
- [ ] Cache invalidation works (verified fresh data after backfill)

### Security Testing
- [ ] Unauthorized role (user) cannot access any funnel endpoint (403 error)
- [ ] Domain admin cannot see data from other tenants
- [ ] Admin can see tenant-wide data (all domains)
- [ ] Property sanitization removes all PII fields (email, phone, IP)
- [ ] Rate limiting blocks requests after threshold (tested manually)
- [ ] Audit logs capture all export operations

### Performance Testing
- [ ] p95 latency <3000ms for summary endpoint (canary threshold)
- [ ] p95 latency <3000ms for timeSeries endpoint
- [ ] p95 latency <3000ms for rawEvents endpoint
- [ ] Export of 5000 rows completes in <10 seconds
- [ ] No N+1 query issues (verified with query logging)
- [ ] Cache hit rate >60% after warmup period

### Data Quality Testing
- [ ] Reconciliation drift <10% (canary threshold)
- [ ] No duplicate events in funnel_events table
- [ ] Event timestamps match source data (within 1 minute)
- [ ] Backfill job handles partial failures gracefully
- [ ] Idempotency: Re-running instrumentation does not create duplicates

### Observability Testing
- [ ] Scope fallback events appear in audit logs
- [ ] Export events appear in audit logs with correct metadata
- [ ] rawEvents queries appear in audit logs with elevated flag
- [ ] Rollout gate evaluation logged for each metrics check
- [ ] Error logs include traceId for correlation

**Sign-off**: _________________________  Date: __________
**Role**: Engineering Lead

---

## Fallback Anomaly Review Template

**Complete before advancing from Domain Admin to General Availability.**

### Audit Log Analysis (Past 7 Days)
- [ ] Reviewed all scope fallback events (count: _____)
- [ ] Verified fallbacks were legitimate (ctxTenantId null scenarios)
- [ ] No unexpected fallback patterns detected
- [ ] Export operations reviewed (count: _____)
- [ ] No single user exceeded 50 exports/day
- [ ] No tenant exceeded 500 exports/week

### Error Pattern Analysis
- [ ] Reviewed all funnelAnalytics errors (count: _____)
- [ ] Categorized errors (auth: ___, scope: ___, query: ___, other: ___)
- [ ] All errors have known root causes (list exceptions below)
- [ ] No recurring error pattern (same error >10 times/day)

### Performance Anomalies
- [ ] Identified slowest 10 queries (p99 latency: _____ms)
- [ ] Verified slow queries are due to data volume (not bugs)
- [ ] No memory leaks detected (heap size stable)
- [ ] No cache thrashing (hit rate stable >70%)

### Security Findings
- [ ] No cross-tenant exposure incidents
- [ ] No unauthorized access attempts detected
- [ ] No property sanitization bypass attempts
- [ ] No rate limit bypass attempts

### Exceptions and Follow-ups
_List any anomalies that require follow-up before GA:_

1. ___________________________________________
2. ___________________________________________
3. ___________________________________________

**Sign-off**: _________________________  Date: __________
**Role**: Engineering Manager
