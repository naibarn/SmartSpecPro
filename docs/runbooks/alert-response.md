# Alert Response Runbooks

## Overview

This document provides step-by-step response procedures for each Cloud Monitoring alert configured in SmartSpecPro. Follow these runbooks when alerts fire.

**General Alert Response Flow:**
1. Acknowledge alert (stops repeat notifications)
2. Execute runbook steps below
3. Document findings in incident channel
4. Escalate if unable to resolve within response time (see incident-response-plan.md)

---

## Alert: High 5xx Error Rate

**Alert Condition:** 5xx error rate > 5% for 5 consecutive minutes

**Severity:** P2 (High) - may escalate to P1 if > 50% error rate or total outage

**Response Time:** < 1 hour

### Step 1: Check Sentry for New Errors

```bash
# Open Sentry issues filtered by last 30 minutes
open "https://sentry.io/organizations/smartspecpro/issues/?query=is:unresolved+firstSeen:-30m&statsPeriod=30m"

# Look for:
# - New error types that didn't exist before
# - Spike in existing error frequency
# - Common stack trace patterns
```

**Key questions:**
- Is this a NEW error type or an existing error spiking?
- What endpoint(s) are failing? (check error.url in Sentry)
- Is the error in Node.js or Python backend?

### Step 2: Check Cloud Run Logs

```bash
# Node.js service logs (last 30 minutes, errors only)
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=node-api \
  AND severity>=ERROR \
  AND timestamp>\"$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=50 \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | "\(.timestamp) \(.jsonPayload.message // .textPayload)"'

# Python service logs
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=python-orchestrator \
  AND severity>=ERROR \
  AND timestamp>\"$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=50 \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | "\(.timestamp) \(.jsonPayload.message // .textPayload)"'
```

**Look for:**
- Database connection errors ("too many clients", "connection refused")
- External API timeouts (Kie.ai, Cloudflare R2, Neon)
- Memory/CPU limits ("OOMKilled", "Throttled")
- Uncaught exceptions

### Step 3: Check Recent Deployments

```bash
# List recent revisions for both services
gcloud run revisions list --service=node-api --region=asia-southeast1 --project=smartspecpro-mvp \
  --format="table(metadata.name,status.conditions[0].status,metadata.creationTimestamp)" \
  --limit=5

gcloud run revisions list --service=python-orchestrator --region=asia-southeast1 --project=smartspecpro-mvp \
  --format="table(metadata.name,status.conditions[0].status,metadata.creationTimestamp)" \
  --limit=5
```

**Compare:**
- When did errors start? (check alert timestamp)
- When was the last deployment? (check creationTimestamp)
- **If deployment within 1-2 hours of error spike:** High confidence rollback will fix

### Step 4: Decision Tree

```
Was there a recent deployment (< 2 hours before errors started)?
├─ YES → Errors in Sentry point to new code?
│   ├─ YES → Execute rollback (Step 5a)
│   └─ NO → Check external dependencies (Step 5b)
└─ NO → Check external dependencies (Step 5b)
```

### Step 5a: Rollback to Previous Revision

**See:** `docs/incident-response-plan.md` Phase 3a for detailed rollback procedure

```bash
# Quick rollback
HEALTHY_REVISION="node-api-00042-abc"  # Replace with revision before deployment
gcloud run services update-traffic node-api \
  --to-revisions=$HEALTHY_REVISION=100 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# Monitor error rate for 2-5 minutes
# If errors drop: rollback successful, investigate new code offline
# If errors persist: rollback didn't help, continue to Step 5b
```

### Step 5b: Check External Dependencies

```bash
# Check Neon database status
# Visit: https://neon.tech/docs/introduction/status (or your Neon dashboard)

# Test database connectivity
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
psql "$DATABASE_URL" -c "SELECT 1;" --quiet

# Check Upstash Redis
UPSTASH_REDIS_URL=$(gcloud secrets versions access latest --secret=UPSTASH_REDIS_URL --project=smartspecpro-mvp)
redis-cli -u "$UPSTASH_REDIS_URL" PING
# Should return: PONG

# Check Cloudflare R2 (via test upload)
# (Implement a simple curl test to R2 presigned URL if needed)
```

**If external dependency down:**
- Check provider status page
- Implement circuit breaker / graceful degradation
- Update status page for users

### Step 5c: Check Resource Limits

```bash
# Check current instance count and memory usage
gcloud run services describe node-api --region=asia-southeast1 --project=smartspecpro-mvp \
  --format="value(spec.template.spec.containers[0].resources.limits.memory, \
    metadata.annotations['autoscaling.knative.dev/maxScale'])"

# Check for OOMKilled or throttling in logs
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=node-api \
  AND (textPayload=~\"OOMKilled\" OR textPayload=~\"Throttled\") \
  AND timestamp>\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=10 \
  --project=smartspecpro-mvp
```

**If resource exhaustion detected:**
```bash
# Increase memory (emergency)
gcloud run services update node-api \
  --memory=2Gi \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# Increase max instances
gcloud run services update node-api \
  --max-instances=20 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp
```

### Step 6: Verify Recovery

```bash
# Error rate should drop below 1% within 5 minutes of fix
gcloud logging read "resource.type=cloud_run_revision \
  AND httpRequest.status>=500 \
  AND timestamp>\"$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=100 \
  --project=smartspecpro-mvp | wc -l

# Check Sentry for new errors stopping
# Check Cloud Monitoring dashboard for error rate trend
```

---

## Alert: Job Failure Rate High

**Alert Condition:** Job failure rate > 20% for 10 consecutive minutes

**Severity:** P2 (High)

**Response Time:** < 1 hour

### Step 1: Identify Failing Queue

```bash
# Check all queue stats
for QUEUE in media-transcode media-render media-upload llm-request skill-execution cloud-run-tasks; do
  echo "=== $QUEUE ==="
  gcloud tasks queues describe $QUEUE \
    --location=asia-southeast1 \
    --project=smartspecpro-mvp \
    --format="table(name, stats.executedLastMinute, stats.tasksRejected)"
done

# Check dead letter tasks in database
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
psql "$DATABASE_URL" -c "
  SELECT queue_name, COUNT(*) as dead_count, MAX(created_at) as latest_failure
  FROM cloud_task_events
  WHERE status = 'dead_letter'
    AND created_at > NOW() - INTERVAL '1 hour'
  GROUP BY queue_name
  ORDER BY dead_count DESC;
"
```

### Step 2: Check Handler Logs

```bash
# Python orchestrator logs for job failures
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=python-orchestrator \
  AND (severity>=ERROR OR jsonPayload.event_type=\"job_failed\") \
  AND timestamp>\"$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=50 \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | "\(.timestamp) \(.jsonPayload.message // .textPayload)"'

# Look for common error patterns:
# - "External API timeout" → External service (Kie.ai, fal.ai) down
# - "Database error" → DB connection issues
# - "Invalid input" → Validation errors (bad data in queue)
```

### Step 3: Check External API Health

```bash
# Test Kie.ai API
KIE_API_KEY=$(gcloud secrets versions access latest --secret=KIE_API_KEY --project=smartspecpro-mvp)
curl -X GET "https://api.kie.ai/v1/health" \
  -H "Authorization: Bearer $KIE_API_KEY" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: HTTP 200

# Check Kie.ai status page (if available)
# Check fal.ai status page (if available)
```

**If external API down:**
- Pause affected queue to prevent further failures
- Wait for provider recovery
- Resume queue when provider is back

### Step 4: Decision - Pause Queue or Rollback Handler

```
Are ALL jobs failing or just specific job types?
├─ ALL jobs failing → Handler bug or external dependency down
│   ├─ Recent deployment? → Rollback python-orchestrator
│   └─ External API down? → Pause queue until recovery
└─ Specific job type failing → Input validation issue or specific handler bug
    └─ Investigate specific handler code, add validation
```

**Pause queue (temporary mitigation):**
```bash
gcloud tasks queues pause media-transcode \
  --location=asia-southeast1 \
  --project=smartspecpro-mvp

# Resume after fix deployed
gcloud tasks queues resume media-transcode \
  --location=asia-southeast1 \
  --project=smartspecpro-mvp
```

**Rollback handler (if recent deployment):**
```bash
# Rollback python-orchestrator
HEALTHY_REVISION="python-orchestrator-00031-xyz"
gcloud run services update-traffic python-orchestrator \
  --to-revisions=$HEALTHY_REVISION=100 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp
```

### Step 5: Retry Failed Tasks (After Fix)

```bash
# Get failed task IDs from dead letter log
psql "$DATABASE_URL" -c "
  SELECT id, task_id, queue_name, payload
  FROM cloud_task_events
  WHERE status = 'dead_letter'
    AND created_at > NOW() - INTERVAL '2 hours'
  ORDER BY created_at DESC
  LIMIT 100;
" --csv > /tmp/failed_tasks.csv

# Manual retry script (implement based on your task structure)
# Or mark tasks for retry in database and have handler pick them up
```

---

## Alert: Queue Backlog High

**Alert Condition:** Queue depth > 100 tasks for 10 consecutive minutes

**Severity:** P3 (Medium) - may escalate to P2 if backlog > 1000 or growing rapidly

**Response Time:** < 4 hours

### Step 1: Identify Affected Queue

```bash
# Check queue depths
for QUEUE in media-transcode media-render media-upload llm-request skill-execution cloud-run-tasks; do
  gcloud tasks queues describe $QUEUE \
    --location=asia-southeast1 \
    --project=smartspecpro-mvp \
    --format="value(name, stats.approximateArrivalRate, stats.executedLastMinute)" | \
    awk -v queue=$QUEUE '{printf "%s: arrival=%s/min, executed=%s/min\n", queue, $1, $2}'
done

# If executedLastMinute << approximateArrivalRate → backlog is growing
```

### Step 2: Check Consumer Health

```bash
# Check if python-orchestrator is processing tasks
gcloud run services describe python-orchestrator \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --format="value(status.conditions[0].status, status.traffic[0].percent)"

# Should show: True, 100 (service is ready and receiving traffic)

# Check instance count (is autoscaling working?)
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=python-orchestrator \
  AND timestamp>\"$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=1 \
  --project=smartspecpro-mvp \
  --format="value(resource.labels.revision_name)"
```

### Step 3: Check for Slow Tasks

```bash
# Check task execution times
psql "$DATABASE_URL" -c "
  SELECT queue_name, AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_sec
  FROM cloud_task_events
  WHERE status = 'completed'
    AND completed_at > NOW() - INTERVAL '1 hour'
  GROUP BY queue_name;
"

# If avg_duration_sec is abnormally high (> 60s for media jobs):
# - External API slow (Kie.ai, fal.ai)
# - Database slow queries
# - Handler inefficiency
```

### Step 4: Mitigation - Scale Up Consumers

```bash
# Increase max instances for python-orchestrator
gcloud run services update python-orchestrator \
  --max-instances=15 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# Increase concurrency per instance (if handler is I/O bound)
gcloud run services update python-orchestrator \
  --concurrency=10 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp
```

### Step 5: Temporary - Pause Intake (If Overwhelming)

```bash
# If backlog > 1000 and growing, temporarily pause new task creation
# This requires code change to disable job submission endpoint
# Or set a feature flag in database

psql "$DATABASE_URL" -c "
  UPDATE system_settings
  SET value = 'true'
  WHERE category = 'feature_flags' AND key = 'pause_job_submission';
"

# Resume after backlog clears
psql "$DATABASE_URL" -c "
  UPDATE system_settings
  SET value = 'false'
  WHERE category = 'feature_flags' AND key = 'pause_job_submission';
"
```

---

## Alert: Auth Failure Spike

**Alert Condition:** Authentication failure rate > 50/minute for 5 consecutive minutes

**Severity:** P2 (High) - potential brute force attack or auth system failure

**Response Time:** < 1 hour

### Step 1: Check for Brute Force Attempts

```bash
# Check login failure logs
gcloud logging read "resource.type=cloud_run_revision \
  AND jsonPayload.event_type=\"auth_failure\" \
  AND timestamp>\"$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=100 \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | "\(.jsonPayload.ip_address) \(.jsonPayload.username)"' | \
  sort | uniq -c | sort -rn | head -20

# Look for:
# - Many attempts from single IP (brute force)
# - Many attempts on single username (targeted attack)
# - Distributed attempts (credential stuffing)
```

### Step 2: Verify Rate Limiting is Active

```bash
# Test rate limiting on login endpoint
curl -X POST https://smartaihub.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}' \
  -w "\nHTTP Status: %{http_code}\n"

# After 5 rapid attempts, should return HTTP 429 (Too Many Requests)

# Check Upstash Redis for rate limit keys
UPSTASH_REDIS_URL=$(gcloud secrets versions access latest --secret=UPSTASH_REDIS_URL --project=smartspecpro-mvp)
redis-cli -u "$UPSTASH_REDIS_URL" KEYS "rate_limit:login:*" | head -20
```

**If rate limiting NOT active:**
- Emergency: Deploy rate limiting fix immediately
- Temporary: Block offending IPs at Cloud Armor level

### Step 3: Check for Legitimate Auth System Failure

```bash
# Check if ALL login attempts are failing (system issue)
gcloud logging read "resource.type=cloud_run_revision \
  AND jsonPayload.event_type=\"auth_success\" \
  AND timestamp>\"$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=10 \
  --project=smartspecpro-mvp

# If zero successful logins → auth system broken
```

**If auth system broken:**
- Check JWT_SECRET in Secret Manager (not rotated by mistake?)
- Check database connectivity (users table accessible?)
- Check Sentry for auth-related errors

### Step 4: Block Attacking IPs (If Brute Force)

```bash
# Create Cloud Armor security policy (if not exists)
gcloud compute security-policies create smartspec-ddos-protection \
  --project=smartspecpro-mvp

# Add deny rule for specific IP
gcloud compute security-policies rules create 1000 \
  --security-policy=smartspec-ddos-protection \
  --expression="origin.ip == '1.2.3.4'" \
  --action=deny-403 \
  --project=smartspecpro-mvp

# Attach policy to load balancer (if using GCLB)
# Note: Cloud Run doesn't support Cloud Armor directly, may need to add GCLB in front
```

**Workaround without Cloud Armor:**
- Update rate limiting to be more aggressive (3 attempts instead of 5)
- Add CAPTCHA to login form
- Temporarily require 2FA for all logins

---

## Alert: Database Connection Pool Exhaustion

**Alert Condition:** Active database connections > 80% of max pool size

**Severity:** P2 (High)

**Response Time:** < 1 hour

### Step 1: Check Current Connection Count

```bash
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)

# Check active connections
psql "$DATABASE_URL" -c "
  SELECT count(*), state, wait_event_type
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state, wait_event_type
  ORDER BY count DESC;
"

# Check max connections limit
psql "$DATABASE_URL" -c "SHOW max_connections;"
```

### Step 2: Identify Connection Leaks

```bash
# Check idle connections (potential leaks)
psql "$DATABASE_URL" -c "
  SELECT pid, usename, application_name, state, state_change, query
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND state = 'idle'
    AND state_change < NOW() - INTERVAL '10 minutes'
  ORDER BY state_change;
"

# Long-running queries holding connections
psql "$DATABASE_URL" -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '1 minute'
  ORDER BY duration DESC;
"
```

### Step 3: Emergency - Kill Idle Connections

**WARNING: Only kill idle connections from application users, NOT system connections**

```bash
# Kill idle connections older than 10 minutes
psql "$DATABASE_URL" -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND state = 'idle'
    AND state_change < NOW() - INTERVAL '10 minutes'
    AND usename != 'postgres'  -- Don't kill system connections
    AND application_name LIKE 'node-api%';  -- Only kill app connections
"
```

### Step 4: Check Application Pool Configuration

```typescript
// apps/web/server/db/index.ts
// Verify pool settings:
// - max: Should be < (Neon max_connections / number of service instances)
// - idleTimeoutMillis: Should be set (e.g., 30000)
// - connectionTimeoutMillis: Should be set (e.g., 5000)
```

**Temporary fix: Reduce pool size**
```bash
# Redeploy with smaller pool size
# Edit apps/web/server/db/index.ts:
# max: 5 (instead of 10)
# Then deploy
```

### Step 5: Long-term Fix

- Implement connection pooling with PgBouncer (if not already)
- Add connection leak detection in application code
- Set aggressive idle timeout in application pool config
- Monitor connection count in Cloud Monitoring

---

## Alert: High Memory / CPU Throttling

**Alert Condition:** Cloud Run instance CPU throttling > 50% for 10 minutes OR memory usage > 90%

**Severity:** P3 (Medium) - may escalate to P2 if causing user-facing errors

**Response Time:** < 4 hours

### Step 1: Identify Throttled Service

```bash
# Check CPU throttling metric
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/cpu/throttled_time_count" AND resource.labels.service_name=("node-api" OR "python-orchestrator")' \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | "\(.resource.labels.service_name): \(.points[0].value.int64Value)"'

# Check memory usage
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/memory/utilizations" AND resource.labels.service_name=("node-api" OR "python-orchestrator")' \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | "\(.resource.labels.service_name): \(.points[0].value.doubleValue)"'
```

### Step 2: Check for Memory Leaks

```bash
# Check for OOMKilled events
gcloud logging read "resource.type=cloud_run_revision \
  AND (jsonPayload.message=~\"OOMKilled\" OR textPayload=~\"OOMKilled\") \
  AND timestamp>\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=20 \
  --project=smartspecpro-mvp

# Check application logs for memory warnings
# (Node.js heap usage, Python memory profiling if enabled)
```

### Step 3: Identify Heavy Operations

```bash
# Check for large file processing
gcloud logging read "resource.type=cloud_run_revision \
  AND jsonPayload.event_type=\"media_processing\" \
  AND timestamp>\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=50 \
  --project=smartspecpro-mvp \
  --format=json | jq -r '.[] | "\(.timestamp) \(.jsonPayload.file_size_mb)"' | \
  sort -k2 -rn | head -10

# Large files (> 50MB) may cause memory spikes
```

### Step 4: Emergency - Increase Memory/CPU Allocation

```bash
# Increase memory for node-api
gcloud run services update node-api \
  --memory=2Gi \
  --cpu=2 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# Increase memory for python-orchestrator
gcloud run services update python-orchestrator \
  --memory=4Gi \
  --cpu=2 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp
```

**Note:** This is a temporary mitigation. Investigate and fix memory leaks in code.

### Step 5: Long-term Fix

- Profile application memory usage (Node.js heap dumps, Python memory_profiler)
- Identify and fix memory leaks
- Optimize heavy operations (stream large files instead of loading in memory)
- Add memory usage monitoring to catch leaks earlier

---

## General Troubleshooting Commands

```bash
# Service health check
gcloud run services describe <SERVICE_NAME> \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --format="value(status.conditions[0].status, status.url)"

# Recent deployments
gcloud run revisions list --service=<SERVICE_NAME> \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --limit=10

# Tail logs in real-time
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=<SERVICE_NAME>" \
  --project=smartspecpro-mvp

# Check secret values (CAREFUL - don't log these)
gcloud secrets versions access latest --secret=<SECRET_NAME> --project=smartspecpro-mvp

# Test database connectivity
psql "$DATABASE_URL" -c "SELECT version();"

# Test Redis connectivity
redis-cli -u "$UPSTASH_REDIS_URL" PING
```

## Escalation Checklist

**Escalate to P1 if:**
- Alert persists for > 30 minutes after following runbook
- Error rate exceeds 50%
- Complete service outage
- Data integrity issue discovered

**Escalate to Incident Commander if:**
- Unable to identify root cause within 30 minutes
- Fix requires coordinated multi-service deployment
- Customer impact is severe (> 50% users affected)

**Document in incident channel:**
- Which runbook steps were executed
- What was discovered at each step
- Why escalation is needed
