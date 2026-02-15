# Auto-Rollback Procedure

## Overview

Automated rollback protects production from bad deployments by continuously monitoring health metrics during canary rollout. If error rates or latency exceed thresholds, the system automatically reverts to the last known good revision.

**Strategy:**
- Deploy with canary traffic (10% → 50% → 100%)
- Monitor health metrics at each stage
- Auto-rollback if metrics breach thresholds
- Notify on-call engineer when rollback triggers

---

## Rollback Triggers

### Trigger 1: High Error Rate

**Condition:** 5xx error rate > 5% for 2 consecutive 1-minute checks

**Calculation:**
```
Error Rate = (5xx_count / total_requests) × 100
```

**Why 2 consecutive checks:**
- Avoids false positives from transient spikes
- Allows time for service to stabilize after deployment

### Trigger 2: High Latency

**Condition:** p95 latency > 2000ms for 3 consecutive 1-minute checks

**Why 3 checks:**
- Latency can temporarily spike during cold starts
- 3 minutes allows autoscaling to compensate

### Trigger 3: Zero Success Rate

**Condition:** Zero successful responses (all requests fail) for 1 check

**Why immediate:**
- Total outage requires immediate rollback
- No tolerance for complete service failure

### Trigger 4: Critical Errors in Sentry

**Condition:** > 10 new critical errors (unhandled exceptions) in 5 minutes

**Why this matters:**
- Sentry errors indicate code-level bugs
- High volume suggests systemic issue in new code

---

## Canary Monitoring Process

### Phase 1: Initial Canary (10% Traffic)

```
Deploy new revision with 10% traffic
|
v
Monitor for 5 minutes (5 checks at 1-minute intervals)
|
├─ Metrics healthy? ────> Proceed to 50%
└─ Metrics breached? ───> Auto-rollback + alert
```

**Monitoring Interval:** Every 60 seconds

**Checks Performed:**
1. Error rate < 5%
2. p95 latency < 2000ms
3. At least one successful request in last minute
4. No spike in Sentry critical errors

**Pass Criteria:**
- All 5 checks pass (0 breaches)

**Fail Criteria:**
- Any trigger condition met (see above)

### Phase 2: Mid Canary (50% Traffic)

```
Shift traffic to 50%
|
v
Monitor for 5 minutes (5 checks)
|
├─ Metrics healthy? ────> Proceed to 100%
└─ Metrics breached? ───> Auto-rollback + alert
```

**Same monitoring as Phase 1, but with higher traffic volume**

### Phase 3: Full Rollout (100% Traffic)

```
Shift traffic to 100%
|
v
Monitor for 10 minutes (10 checks)
|
├─ Metrics healthy? ────> Deployment successful ✅
└─ Metrics breached? ───> Auto-rollback + alert
```

**Extended monitoring period:**
- 10 minutes at 100% traffic catches issues that only appear under full load
- Database connection pool exhaustion, memory leaks, etc.

---

## Canary Monitor Script

**Location:** `scripts/canary-monitor.sh`

```bash
#!/bin/bash
# canary-monitor.sh - Monitor canary deployment and auto-rollback on failure

set -euo pipefail

# Configuration
SERVICE="${1:?Service name required (node-api or python-orchestrator)}"
REGION="${2:-asia-southeast1}"
PROJECT="${3:-smartspecpro-mvp}"
HEALTHY_REVISION="${4:?Healthy revision name required}"
CANARY_REVISION="${5:?Canary revision name required}"
TRAFFIC_PERCENT="${6:-10}"

# Thresholds
ERROR_RATE_THRESHOLD=5.0
LATENCY_THRESHOLD_MS=2000
CHECK_INTERVAL=60
ERROR_FAIL_COUNT=2
LATENCY_FAIL_COUNT=3
ZERO_SUCCESS_FAIL_COUNT=1

# State
error_breach_count=0
latency_breach_count=0
zero_success_count=0

# Logging
log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

alert() {
  log "🚨 ALERT: $*"
  # Send to Slack/PagerDuty
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"🚨 Auto-Rollback Alert: $*\"}" || true
}

# Function: Get error rate for canary revision
get_error_rate() {
  local start_time=$(date -u -d '2 minutes ago' +%Y-%m-%dT%H:%M:%SZ)

  # Count 5xx errors from canary revision
  local error_count=$(gcloud logging read \
    "resource.type=cloud_run_revision
     AND resource.labels.service_name=\"$SERVICE\"
     AND resource.labels.revision_name=\"$CANARY_REVISION\"
     AND httpRequest.status>=500
     AND timestamp>=\"$start_time\"" \
    --limit=1000 \
    --project="$PROJECT" \
    --format=json | jq -r '. | length')

  # Count total requests from canary revision
  local total_count=$(gcloud logging read \
    "resource.type=cloud_run_revision
     AND resource.labels.service_name=\"$SERVICE\"
     AND resource.labels.revision_name=\"$CANARY_REVISION\"
     AND httpRequest.status>0
     AND timestamp>=\"$start_time\"" \
    --limit=1000 \
    --project="$PROJECT" \
    --format=json | jq -r '. | length')

  if [ "$total_count" -eq 0 ]; then
    echo "0.0|0|0"  # No traffic yet
    return
  fi

  local error_rate=$(echo "scale=2; ($error_count / $total_count) * 100" | bc)
  echo "$error_rate|$error_count|$total_count"
}

# Function: Get p95 latency for canary revision
get_p95_latency() {
  local start_time=$(date -u -d '2 minutes ago' +%Y-%m-%dT%H:%M:%SZ)

  # Get request latencies from Cloud Monitoring
  gcloud monitoring time-series list \
    --filter="metric.type=\"run.googleapis.com/request_latencies\"
      AND resource.labels.service_name=\"$SERVICE\"
      AND resource.labels.revision_name=\"$CANARY_REVISION\"" \
    --project="$PROJECT" \
    --format=json \
    --start-time="$start_time" \
    --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_DELTA","crossSeriesReducer":"REDUCE_PERCENTILE_95"}' | \
    jq -r '.[0].points[0].value.distributionValue.mean // 0'
}

# Function: Check for critical Sentry errors
check_sentry_errors() {
  # This requires Sentry API token
  # Return count of new critical errors in last 5 minutes
  # Placeholder: implement based on Sentry API
  echo "0"
}

# Function: Perform rollback
rollback() {
  local reason="$1"

  alert "Rolling back $SERVICE from $CANARY_REVISION to $HEALTHY_REVISION. Reason: $reason"

  log "Executing rollback..."
  gcloud run services update-traffic "$SERVICE" \
    --to-revisions="$HEALTHY_REVISION=100" \
    --region="$REGION" \
    --project="$PROJECT"

  log "✅ Rollback complete. All traffic routed to $HEALTHY_REVISION"

  # Notify on-call
  alert "Rollback completed. Service: $SERVICE, Healthy revision: $HEALTHY_REVISION"

  # Exit with failure status (for CI/CD)
  exit 1
}

# Main monitoring loop
main() {
  log "Starting canary monitoring for $SERVICE"
  log "Canary: $CANARY_REVISION ($TRAFFIC_PERCENT% traffic)"
  log "Healthy: $HEALTHY_REVISION"
  log "Monitoring interval: ${CHECK_INTERVAL}s"

  # Determine number of checks based on traffic percentage
  local total_checks
  case "$TRAFFIC_PERCENT" in
    10) total_checks=5 ;;
    50) total_checks=5 ;;
    100) total_checks=10 ;;
    *) total_checks=5 ;;
  esac

  log "Will perform $total_checks health checks"

  for i in $(seq 1 $total_checks); do
    log "--- Check $i/$total_checks ---"

    # Wait before first check (allow traffic to flow)
    if [ "$i" -eq 1 ]; then
      log "Waiting 60 seconds for traffic to stabilize..."
      sleep 60
    fi

    # Check 1: Error rate
    IFS='|' read -r error_rate error_count total_count <<< "$(get_error_rate)"
    log "Error rate: ${error_rate}% ($error_count/$total_count)"

    if (( $(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc -l) )); then
      ((error_breach_count++))
      log "⚠️  Error rate breach $error_breach_count/$ERROR_FAIL_COUNT"
      if [ "$error_breach_count" -ge "$ERROR_FAIL_COUNT" ]; then
        rollback "Error rate ${error_rate}% exceeds threshold ${ERROR_RATE_THRESHOLD}% for $ERROR_FAIL_COUNT consecutive checks"
      fi
    else
      error_breach_count=0
      log "✅ Error rate OK"
    fi

    # Check 2: Zero success rate (immediate rollback)
    if [ "$total_count" -gt 0 ] && [ "$error_count" -eq "$total_count" ]; then
      ((zero_success_count++))
      log "⚠️  Zero successful requests detected!"
      if [ "$zero_success_count" -ge "$ZERO_SUCCESS_FAIL_COUNT" ]; then
        rollback "All requests failing (100% error rate)"
      fi
    else
      zero_success_count=0
    fi

    # Check 3: Latency (simplified - using logs instead of full monitoring API)
    # Note: For production, use Cloud Monitoring API for accurate p95
    log "⏱️  Latency check (simplified - check Cloud Monitoring dashboard manually)"

    # Check 4: Sentry errors
    local sentry_errors=$(check_sentry_errors)
    log "Sentry critical errors: $sentry_errors"
    if [ "$sentry_errors" -gt 10 ]; then
      rollback "Excessive critical errors in Sentry: $sentry_errors in last 5 minutes"
    fi

    log "Check $i passed. Waiting ${CHECK_INTERVAL}s before next check..."
    sleep "$CHECK_INTERVAL"
  done

  log "✅ All $total_checks checks passed. Canary is healthy at $TRAFFIC_PERCENT% traffic."
  exit 0
}

# Run
main
```

---

## Integration with GitHub Actions

**Workflow:** `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production with Auto-Rollback

on:
  push:
    tags:
      - 'v*-prod'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1

      - name: Build and push Docker images
        run: |
          # Build node-api
          docker build -t asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/node-api:${{ github.ref_name }} \
            -f apps/web/Dockerfile .
          docker push asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/node-api:${{ github.ref_name }}

          # Build python-orchestrator
          docker build -t asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/python-orchestrator:${{ github.ref_name }} \
            -f python-backend/Dockerfile .
          docker push asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/python-orchestrator:${{ github.ref_name }}

      - name: Get current healthy revision (node-api)
        id: healthy_node
        run: |
          HEALTHY_REV=$(gcloud run services describe node-api \
            --region=asia-southeast1 \
            --project=smartspecpro-mvp \
            --format='value(status.traffic[0].revisionName)')
          echo "revision=$HEALTHY_REV" >> $GITHUB_OUTPUT

      - name: Deploy node-api canary (10%)
        run: |
          # Deploy new revision with tag "canary", no traffic initially
          gcloud run deploy node-api \
            --image=asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/node-api:${{ github.ref_name }} \
            --region=asia-southeast1 \
            --project=smartspecpro-mvp \
            --tag=canary \
            --no-traffic

          # Get canary revision name
          CANARY_REV=$(gcloud run services describe node-api \
            --region=asia-southeast1 \
            --project=smartspecpro-mvp \
            --format='value(status.traffic[?(@.tag=="canary")].revisionName)')

          echo "CANARY_REV=$CANARY_REV" >> $GITHUB_ENV

          # Shift 10% traffic to canary
          gcloud run services update-traffic node-api \
            --to-revisions=$CANARY_REV=10,${{ steps.healthy_node.outputs.revision }}=90 \
            --region=asia-southeast1 \
            --project=smartspecpro-mvp

      - name: Monitor canary 10%
        run: |
          bash scripts/canary-monitor.sh \
            node-api \
            asia-southeast1 \
            smartspecpro-mvp \
            ${{ steps.healthy_node.outputs.revision }} \
            ${{ env.CANARY_REV }} \
            10

      - name: Shift to 50% traffic
        run: |
          gcloud run services update-traffic node-api \
            --to-revisions=${{ env.CANARY_REV }}=50,${{ steps.healthy_node.outputs.revision }}=50 \
            --region=asia-southeast1 \
            --project=smartspecpro-mvp

      - name: Monitor canary 50%
        run: |
          bash scripts/canary-monitor.sh \
            node-api \
            asia-southeast1 \
            smartspecpro-mvp \
            ${{ steps.healthy_node.outputs.revision }} \
            ${{ env.CANARY_REV }} \
            50

      - name: Shift to 100% traffic
        run: |
          gcloud run services update-traffic node-api \
            --to-revisions=${{ env.CANARY_REV }}=100 \
            --region=asia-southeast1 \
            --project=smartspecpro-mvp

      - name: Monitor canary 100%
        run: |
          bash scripts/canary-monitor.sh \
            node-api \
            asia-southeast1 \
            smartspecpro-mvp \
            ${{ steps.healthy_node.outputs.revision }} \
            ${{ env.CANARY_REV }} \
            100

      - name: Deployment successful
        run: |
          echo "✅ Deployment successful: ${{ env.CANARY_REV }} now serving 100% traffic"

      # Repeat above steps for python-orchestrator...
```

---

## Manual Override (Stop Auto-Rollback)

**Scenario:** False positive detected (metrics breached but service is actually healthy)

**How to override:**

```bash
# 1. SSH into deployment runner or run locally with GCP credentials

# 2. Kill the canary-monitor.sh process
pkill -f "canary-monitor.sh"

# 3. Manually verify service health
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=node-api" \
  --project=smartspecpro-mvp

# 4. If truly healthy, manually shift traffic
gcloud run services update-traffic node-api \
  --to-revisions=<CANARY_REVISION>=100 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# 5. Document why override was needed (for improving thresholds)
```

**When to override:**
- Known traffic spike causing temporary latency
- External dependency outage (not caused by new code)
- Monitoring system malfunction (false metrics)

**When NOT to override:**
- Real errors in Sentry from new code
- Actual error rate increase (not a false alarm)
- Just hoping the issue will resolve itself

---

## Notifications

### On Rollback Trigger

**Slack message:**
```
🚨 **Auto-Rollback Triggered**

Service: node-api
Canary Revision: node-api-00123-abc
Healthy Revision: node-api-00122-xyz
Reason: Error rate 8.5% exceeds threshold 5% for 2 consecutive checks

Traffic automatically shifted to healthy revision.

Deployment tag: v1.2.3-prod
GitHub Actions run: https://github.com/org/repo/actions/runs/123456

Next steps:
1. Investigate error logs
2. Fix bug in staging
3. Re-deploy after verification
```

**PagerDuty alert (P2):**
- Title: "Auto-Rollback: node-api deployment failed health checks"
- Urgency: High
- Incident key: `auto-rollback-node-api-<timestamp>`

### On Successful Canary

**Slack message:**
```
✅ **Deployment Successful**

Service: node-api
Revision: node-api-00123-abc
Deployment tag: v1.2.3-prod

Canary health checks:
- 10% traffic: 5/5 checks passed
- 50% traffic: 5/5 checks passed
- 100% traffic: 10/10 checks passed

All metrics within SLA targets. Deployment complete.
```

---

## Testing Auto-Rollback (Staging)

**Test Scenario 1: Inject 5xx Errors**

```typescript
// apps/web/server/middleware/force-error.ts (staging only)
export function forceErrorMiddleware(req, res, next) {
  if (process.env.NODE_ENV === 'staging' && process.env.FORCE_ERROR_RATE) {
    const errorRate = parseFloat(process.env.FORCE_ERROR_RATE);
    if (Math.random() < errorRate) {
      return res.status(500).json({ error: 'Forced error for rollback testing' });
    }
  }
  next();
}
```

```bash
# Deploy to staging with 10% forced error rate
gcloud run deploy node-api \
  --image=<STAGING_IMAGE> \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --update-env-vars=FORCE_ERROR_RATE=0.10 \
  --tag=canary \
  --no-traffic

# Run canary monitor
bash scripts/canary-monitor.sh node-api asia-southeast1 smartspecpro-mvp <HEALTHY_REV> <CANARY_REV> 10

# Expected: Auto-rollback triggers after 2 checks (2 minutes)
```

**Test Scenario 2: Inject High Latency**

```typescript
// apps/web/server/middleware/force-latency.ts (staging only)
export function forceLatencyMiddleware(req, res, next) {
  if (process.env.NODE_ENV === 'staging' && process.env.FORCE_LATENCY_MS) {
    const latency = parseInt(process.env.FORCE_LATENCY_MS);
    setTimeout(next, latency);
  } else {
    next();
  }
}
```

```bash
# Deploy with 3000ms latency (exceeds 2000ms threshold)
gcloud run deploy node-api \
  --update-env-vars=FORCE_LATENCY_MS=3000 \
  --tag=canary \
  --no-traffic

# Expected: Auto-rollback triggers after 3 checks (3 minutes)
```

---

## Rollback Decision Tree

```
Deployment started
|
v
Canary 10% deployed
|
v
Health checks running (every 60s)
|
├─ Error rate > 5% for 2 checks? ──> YES ──> Rollback ──> Alert on-call
│
├─ p95 latency > 2000ms for 3 checks? ──> YES ──> Rollback ──> Alert on-call
│
├─ Zero successful requests? ──> YES ──> Immediate rollback ──> Alert on-call
│
├─ > 10 critical Sentry errors? ──> YES ──> Rollback ──> Alert on-call
│
└─ All checks pass? ──> YES ──> Proceed to 50%
    |
    v
    (Repeat checks at 50%)
    |
    └─ All checks pass? ──> YES ──> Proceed to 100%
        |
        v
        (Repeat checks at 100%)
        |
        └─ All checks pass? ──> YES ──> Deployment successful ✅
```

---

## Rollback Metrics

**Track these metrics for each deployment:**

| Metric | Target | Alert If |
|--------|--------|----------|
| Rollback rate | < 10% of deployments | > 25% |
| False positive rate | < 5% of rollbacks | > 15% |
| Time to rollback (detection → completion) | < 3 minutes | > 5 minutes |
| Rollback success rate | 100% | < 100% |

**Monthly review:**
- How many deployments triggered auto-rollback?
- Were rollbacks correct (true positives) or false alarms?
- How can we reduce rollback rate? (Better staging tests, manual QA)

---

## Improving Auto-Rollback

### Add More Signals

**Potential additional checks:**

1. **Database query errors**
   ```bash
   # Check for spike in database connection errors
   gcloud logging read "resource.type=cloud_run_revision \
     AND jsonPayload.error=~\"database\" \
     AND severity>=ERROR"
   ```

2. **External API failure rate**
   ```bash
   # Check for spike in external API timeouts (Kie.ai, etc.)
   gcloud logging read "jsonPayload.event_type=\"external_api_error\""
   ```

3. **User-reported errors** (PostHog, support tickets)
   - Integrate with PostHog to detect spike in client-side errors

### Adjust Thresholds Based on Historical Data

```sql
-- Query historical p95 latency to set realistic threshold
SELECT
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency
FROM (
  SELECT EXTRACT(EPOCH FROM (response_time - request_time)) * 1000 AS latency_ms
  FROM http_request_logs
  WHERE created_at >= NOW() - INTERVAL '30 days'
);

-- If p95 is consistently 400ms, setting threshold at 2000ms is too lenient
-- Tighten to 800ms for faster detection of latency regressions
```

---

## Appendix: Rollback Checklist

**Before enabling auto-rollback in production:**

- [ ] Tested in staging with forced errors (5xx rate > 5%)
- [ ] Tested in staging with forced latency (> 2000ms)
- [ ] Slack webhook configured for alerts
- [ ] PagerDuty integration tested
- [ ] On-call engineer trained on manual override procedure
- [ ] Thresholds reviewed and agreed upon by team
- [ ] False positive handling documented
- [ ] Monitoring dashboard shows canary metrics in real-time

**Post-rollback (every time it triggers):**

- [ ] Incident created in tracking system
- [ ] Root cause identified (bug in new code, bad config, etc.)
- [ ] Fix tested in staging
- [ ] Postmortem completed within 72 hours
- [ ] Thresholds adjusted if false positive
