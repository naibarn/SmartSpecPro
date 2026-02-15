# SLA Targets & Measurement

## Overview

This document defines Service Level Agreements (SLAs) for SmartSpecPro production. These targets guide infrastructure design, monitoring, and incident response priorities.

**SLA vs SLO vs SLI:**
- **SLA (Service Level Agreement):** Contractual commitment to customers
- **SLO (Service Level Objective):** Internal target (usually stricter than SLA)
- **SLI (Service Level Indicator):** Actual measured metric

We use SLOs internally and publish SLAs externally (on status page).

---

## 1. Availability

### SLA: 99.5% Uptime (Monthly)

**Calculation:**
- Total minutes per month: ~43,800 (30 days)
- Allowed downtime: ~219 minutes (3.65 hours)
- Measured as: (Minutes without errors / Total minutes) × 100

**SLI Measurement:**

```sql
-- Query Cloud Monitoring API for uptime percentage
-- Metric: run.googleapis.com/request_count (filtered by status >= 500)

SELECT
  (1 - (COUNT(CASE WHEN status >= 500 THEN 1 END) / COUNT(*))) * 100 AS uptime_percent
FROM cloud_run_requests
WHERE timestamp >= NOW() - INTERVAL '30 days';
```

**Cloud Monitoring Query:**

```bash
# Get error rate for last 30 days
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count"
    AND metric.labels.response_code_class="5xx"
    AND resource.labels.service_name=("node-api" OR "python-orchestrator")' \
  --project=smartspecpro-mvp \
  --format=json \
  --start-time="$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Calculate uptime from this data
```

**What Counts as Downtime:**
- HTTP 5xx responses > 50% of requests for 1 minute
- Service unavailable (no successful requests)
- Database unreachable
- Critical feature completely broken (login, job submission)

**What Does NOT Count as Downtime:**
- Scheduled maintenance (announced 7 days in advance)
- Individual user issues (bad API key, rate limiting)
- Non-critical feature outages (analytics dashboard)
- 4xx errors (client errors)

**Breach Response:**
- If uptime < 99.5% projected at mid-month: Escalate to leadership, investigate root causes
- If uptime < 99% at end of month: Initiate architecture review, consider SLA credits

---

## 2. Latency

### SLA: API Response Time

| Percentile | Target | Critical Threshold |
|------------|--------|-------------------|
| p50 (median) | < 200ms | < 500ms |
| p95 | < 500ms | < 1000ms |
| p99 | < 2000ms | < 5000ms |

**Measurement Scope:**
- tRPC API endpoints (`/api/trpc/*`)
- REST endpoints (`/api/*`)
- Excludes: Media upload/download (separate SLA), static assets

**SLI Measurement:**

```bash
# Cloud Monitoring query for latency percentiles
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies"
    AND resource.labels.service_name="node-api"' \
  --project=smartspecpro-mvp \
  --format=json \
  --start-time="$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_DELTA","crossSeriesReducer":"REDUCE_PERCENTILE_95"}'

# Output will show p95 latency over last hour
```

**Custom Monitoring (Application-Level):**

```typescript
// apps/web/server/middleware/metrics.ts
import { performance } from 'perf_hooks';

export function latencyMetrics(req, res, next) {
  const start = performance.now();

  res.on('finish', () => {
    const duration = performance.now() - start;
    const path = req.path.replace(/\/\d+/g, '/:id'); // Normalize paths

    // Log to PostHog or custom metrics backend
    posthog.capture('api_latency', {
      distinct_id: 'system',
      properties: {
        path,
        method: req.method,
        status: res.statusCode,
        duration_ms: duration,
        p95_breached: duration > 500,
        p99_breached: duration > 2000,
      }
    });
  });

  next();
}
```

**Breach Response:**
- If p95 > 1000ms for 10 minutes: P3 incident, investigate slow queries/external APIs
- If p95 > 2000ms for 5 minutes: P2 incident, consider scaling up resources
- If p99 > 5000ms for 10 minutes: P2 incident, check for timeout configuration issues

### SLA: Media Job Submission

| Operation | Target | Critical Threshold |
|-----------|--------|-------------------|
| Job submission (create task) | < 1000ms | < 3000ms |
| Job status check | < 200ms | < 500ms |

**Measurement:**

```bash
# Check Cloud Tasks API latency
gcloud logging read "resource.type=cloud_tasks_queue \
  AND jsonPayload.method=\"CreateTask\" \
  AND timestamp>\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | .jsonPayload.latency_ms' | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "ms"}'
```

---

## 3. Error Rate

### SLA: < 1% Error Rate (5xx Errors)

**Calculation:**
- Measured over 1-hour rolling window
- Excludes 4xx errors (client errors)
- Includes only 5xx errors (server errors)

**Formula:**
```
Error Rate = (Count of 5xx responses / Total responses) × 100
```

**SLI Measurement:**

```bash
# Error rate for last 1 hour
gcloud logging read "resource.type=cloud_run_revision \
  AND httpRequest.status>=500 \
  AND timestamp>\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --project=smartspecpro-mvp \
  --limit=1000 | wc -l

# Total requests last 1 hour
gcloud logging read "resource.type=cloud_run_revision \
  AND httpRequest.status>0 \
  AND timestamp>\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --project=smartspecpro-mvp \
  --limit=10000 | wc -l

# Calculate: (5xx_count / total_count) * 100
```

**Automated Alerting:**

Cloud Monitoring alert policy triggers when error rate > 5% for 5 consecutive minutes (see alert-response.md).

**Breach Response:**
- Error rate 1-5%: Investigate, track in postmortem
- Error rate 5-20%: P3 incident, identify root cause within 4 hours
- Error rate > 20%: P2 incident, rollback or fix within 1 hour

---

## 4. Recovery Targets

### RTO (Recovery Time Objective): 30 Minutes

**Definition:** Maximum acceptable time to restore service after total outage

**Breakdown:**
- Detection: 5 minutes (via monitoring alerts)
- Triage: 5 minutes (identify cause)
- Mitigation: 20 minutes (rollback or restore from backup)

**Scenarios:**

| Scenario | RTO Target | How to Achieve |
|----------|-----------|----------------|
| Bad deployment | 2 minutes | Cloud Run traffic shift to previous revision |
| Database failure | 15 minutes | Neon PITR restore to 1 hour ago |
| Redis failure | 5 minutes | Upstash automatic failover (built-in) |
| Region outage | 60 minutes | Multi-region failover (not yet implemented) |
| R2 storage failure | 10 minutes | Cloudflare automatic failover (built-in) |

**How to Test RTO:**

```bash
# Simulate outage in staging
# 1. Intentionally break service (bad config)
gcloud run services update node-api \
  --update-env-vars=FORCE_ERROR=true \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# 2. Start timer
START_TIME=$(date +%s)

# 3. Follow incident response playbook
# (Detection via monitoring, triage, rollback)

# 4. Service restored
END_TIME=$(date +%s)
RECOVERY_TIME=$((END_TIME - START_TIME))
echo "RTO Test Result: $RECOVERY_TIME seconds"

# Expected: < 1800 seconds (30 minutes)
```

**Breach Response:**
- If RTO > 30 minutes: Incident postmortem must identify bottlenecks
- If RTO > 60 minutes: Architecture review required, consider hot standbys

### RPO (Recovery Point Objective): 1 Hour

**Definition:** Maximum acceptable data loss in case of disaster

**How Achieved:**
- Neon PostgreSQL: Point-in-time recovery with 1-second granularity (can restore to any point in last 7 days)
- Upstash Redis: Automatic hourly snapshots
- Cloudflare R2: Versioning enabled (can restore deleted objects)

**Actual RPO (Better than Target):**
- Database: < 1 minute (Neon PITR)
- Redis: < 1 hour (latest snapshot)
- Object storage: 0 (versioning)

**What This Means:**
- In worst case (database disaster), we lose max 1 hour of user data
- For most incidents, data loss is zero (rollback, not restore)

**How to Test RPO:**

```bash
# Test Neon PITR
# 1. Note current timestamp
RESTORE_POINT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 2. Make a test change in staging DB
psql "$STAGING_DATABASE_URL" -c "INSERT INTO test_table (data) VALUES ('test-restore');"

# 3. Restore to point before change (via Neon console)
# - Go to Neon console > Branches > Create branch from specific point in time
# - Select timestamp: $RESTORE_POINT
# - Verify test row does NOT exist in restored branch

# 4. Document actual restore time
# Expected: < 15 minutes from initiation to restored DB accessible
```

---

## 5. Job Processing SLA

### Target: Media Jobs Completed Within 5 Minutes (p95)

**Measurement:**

```sql
-- Query database for job completion times
SELECT
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))) AS p95_seconds
FROM media_jobs
WHERE status = 'completed'
  AND created_at >= NOW() - INTERVAL '24 hours';
```

**Target Breakdown:**

| Job Type | p95 Target | p99 Target |
|----------|-----------|-----------|
| Image generation | < 60 seconds | < 120 seconds |
| Video transcoding | < 300 seconds | < 600 seconds |
| LLM request | < 30 seconds | < 60 seconds |
| Skill execution | < 120 seconds | < 300 seconds |

**What Counts:**
- Time from job submission to completion (end-to-end)
- Includes queue wait time + processing time

**What Does NOT Count:**
- Jobs that fail validation (rejected immediately)
- Jobs in paused queues (during maintenance)

**Breach Response:**
- If p95 > 5 minutes for 1 hour: P3 incident, check queue backlog
- If p95 > 10 minutes for 30 minutes: P2 incident, scale up workers
- If individual job > 30 minutes: Timeout and retry

---

## How to Measure SLAs

### Daily SLA Dashboard (Cloud Monitoring)

Create a custom dashboard with these widgets:

1. **Uptime Percentage (Last 24h)**
   - Metric: `run.googleapis.com/request_count`
   - Filter: `response_code_class != "5xx"`
   - Aggregation: Success rate

2. **Latency Percentiles (Last 1h)**
   - Metric: `run.googleapis.com/request_latencies`
   - Chart: Line chart with p50, p95, p99
   - Alert threshold lines at 500ms, 2000ms

3. **Error Rate (Last 1h)**
   - Metric: `run.googleapis.com/request_count`
   - Filter: `response_code_class = "5xx"`
   - Aggregation: Rate per minute

4. **Job Processing Time (Last 24h)**
   - Custom metric from database query
   - Chart: Histogram of job durations

**Create Dashboard:**

```bash
# Export dashboard JSON config
# (Create manually in Cloud Console first, then export)
gcloud monitoring dashboards list --project=smartspecpro-mvp

# Import to another project
gcloud monitoring dashboards create --config-from-file=dashboard.json --project=smartspecpro-mvp
```

### Weekly SLA Report (Automated)

Create a Cloud Function that runs every Monday:

```typescript
// cloud-functions/weekly-sla-report/index.ts
import { Monitoring } from '@google-cloud/monitoring';

export async function weeklySlaReport() {
  const client = new Monitoring.MetricServiceClient();
  const projectId = 'smartspecpro-mvp';

  // Calculate metrics for last 7 days
  const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const endTime = new Date();

  // Query uptime
  const uptime = await calculateUptime(client, projectId, startTime, endTime);

  // Query latency
  const latency = await calculateLatency(client, projectId, startTime, endTime);

  // Query error rate
  const errorRate = await calculateErrorRate(client, projectId, startTime, endTime);

  // Send email report
  await sendEmailReport({
    uptime,
    latency,
    errorRate,
    period: '2024-W01',
    breaches: identifyBreaches(uptime, latency, errorRate),
  });
}
```

**Schedule via Cloud Scheduler:**

```bash
gcloud scheduler jobs create http weekly-sla-report \
  --schedule="0 9 * * MON" \
  --uri="https://asia-southeast1-smartspecpro-mvp.cloudfunctions.net/weeklySlaReport" \
  --http-method=POST \
  --location=asia-southeast1 \
  --project=smartspecpro-mvp
```

---

## What to Do When SLA is Breached

### 1. Immediate Actions (During Breach)

```bash
# Create incident
# (See incident-response-plan.md)

# Classify severity based on breach magnitude
# - Uptime < 99%: P1
# - Uptime 99-99.5%: P2
# - Latency p95 > 2000ms: P2
# - Error rate > 5%: P2
```

### 2. Post-Breach Review (Within 72 Hours)

**Required for ANY SLA breach:**

1. **Root Cause Analysis**
   - What caused the breach?
   - What was the timeline?
   - What metrics/alerts failed to catch it early?

2. **Prevention Plan**
   - What can we do to prevent this specific scenario?
   - Do we need more monitoring?
   - Do we need architecture changes?

3. **SLA Impact Assessment**
   - How much of monthly SLA budget was consumed?
   - Are we at risk of breaching monthly SLA?
   - Do customers need to be notified?

### 3. Monthly SLA Review Meeting

**Agenda (First Monday of Each Month):**

1. Review last month's SLA metrics
2. Identify trends (improving/degrading)
3. Review all incidents that contributed to downtime
4. Action items to improve SLAs next month

**Template:**

```markdown
# SLA Review: January 2026

## Summary
- Uptime: 99.87% ✅ (Target: 99.5%)
- Latency p95: 420ms ✅ (Target: <500ms)
- Error Rate: 0.3% ✅ (Target: <1%)
- RTO: 8 minutes ✅ (Target: <30 min)

## Breaches: 1

### INC-20260115-001 (P2)
- Cause: Database connection pool exhausted
- Downtime: 23 minutes
- Impact: 0.05% of monthly SLA budget
- Action Items:
  - [x] Increase pool size
  - [ ] Add connection leak detection
  - [ ] Improve monitoring for pool exhaustion

## Trends
- Uptime improving (99.65% → 99.87%)
- Latency degrading slightly (380ms → 420ms p95)
  - Action: Profile slow endpoints

## Next Month Goals
- Maintain uptime > 99.7%
- Reduce p95 latency to <400ms
- Zero P1 incidents
```

---

## Public Status Page

**Publish simplified SLAs on status page:**

```
SmartSpecPro Status
-------------------
Current Status: All Systems Operational ✅

Uptime (Last 30 Days): 99.87%
API Latency (p95): 420ms

Component Status:
- Web Application: Operational ✅
- API: Operational ✅
- Media Processing: Operational ✅
- Database: Operational ✅

Recent Incidents:
- None
```

**Update status page during incidents:**
- P1: Update within 15 minutes
- P2: Update within 1 hour
- P3: Update within 4 hours (if customer-facing)

---

## SLA Commitment to Customers

**Published SLA (External):**

> SmartSpecPro commits to 99.5% monthly uptime for all paid plans. In the event of SLA breach, affected customers will receive service credits as follows:
>
> - 99.0% - 99.5% uptime: 10% credit
> - 95.0% - 99.0% uptime: 25% credit
> - < 95.0% uptime: 50% credit
>
> Credits are automatically applied to the next billing cycle. Scheduled maintenance windows (announced 7 days in advance) are excluded from SLA calculations.

**How to Calculate Customer Credits:**

```sql
-- Identify affected customers during downtime window
SELECT user_id, subscription_plan, monthly_cost
FROM subscriptions
WHERE status = 'active'
  AND created_at < '2026-01-15 10:00:00'  -- Incident start time
  AND (cancelled_at IS NULL OR cancelled_at > '2026-01-15 10:23:00');  -- Incident end time

-- Calculate credit amount based on uptime %
-- If uptime = 99.3%, credit = 10% of monthly_cost
```

---

## Appendix: Quick Reference

| Metric | Target | Alert Threshold | P1 Threshold |
|--------|--------|----------------|--------------|
| Uptime | 99.5% | < 99.5% (projected) | < 99% actual |
| Latency p95 | < 500ms | > 1000ms | > 2000ms |
| Error Rate | < 1% | > 5% | > 50% |
| RTO | < 30 min | N/A | > 60 min |
| RPO | < 1 hour | N/A | > 4 hours |
| Job Processing p95 | < 5 min | > 10 min | > 30 min |

**SLA Budget (Monthly):**
- Total minutes: 43,800
- Downtime budget: 219 minutes (3.65 hours)
- **Burn rate alert:** If >50% of budget consumed by mid-month

**Contact:** For SLA questions, contact infrastructure team or refer to incident-response-plan.md
