Now I have all the context I need. Let me extract the content for section-19-load-testing.

# Section 19: Load Testing

## Overview

This section implements load testing to validate that the SmartSpecPro MVP deployment on Google Cloud Run can handle the target scale of 100-1,000 users with 50-500 jobs/day at launch. Load testing identifies bottlenecks before production launch and validates that Cloud Run autoscaling, Cloud Tasks queue management, and database connection pooling work correctly under burst and sustained load.

## Dependencies

This section requires all previous sections (1-18) to be complete:
- GCP infrastructure provisioned (section 1)
- Docker images built and deployed to Cloud Run (sections 2, 17)
- Database configured with connection pooling (section 3)
- Cloud Tasks and Cloud Scheduler operational (sections 4-6)
- Media and video pipelines functional (sections 7-8, 11)
- R2 storage configured (section 9)
- Redis split architecture deployed (section 10)
- Observability instrumented (sections 13-16)
- Auth hardened (section 18)

## Test Infrastructure Setup

### Tool Selection

Use **k6** for load testing. Install locally or run in a GCP Compute Engine VM for more realistic network conditions.

```bash
# Install k6 (local)
brew install k6  # macOS
# or
sudo apt-get install k6  # Debian/Ubuntu

# Or use Docker
docker pull grafana/k6
```

### Test Environment

Run load tests against the **staging environment** first. Only after staging tests pass should production receive limited testing.

### Cloud Monitoring Access

Ensure the test operator has permissions to query Cloud Monitoring APIs for metric collection during test runs:

```bash
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="user:YOUR_EMAIL" \
  --role="roles/monitoring.viewer"
```

## Test Scenarios

### Scenario 1: API Load (100 Concurrent Users)

**Objective:** Validate API responsiveness under typical user load.

**Test script stub:** `load-tests/scenario-1-api-load.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    api_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    http_req_failed: ['rate<0.01'],   // <1% errors
  },
};

// Test data: create test users beforehand
const users = JSON.parse(open('./test-users.json'));

export default function () {
  // Login
  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
    email: users[__VU % users.length].email,
    password: 'test-password',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login succeeded': (r) => r.status === 200,
  });

  errorRate.add(loginRes.status !== 200);

  const sessionCookie = loginRes.cookies['SMARTSPEC_SESSIONID'];

  // Browse dashboard
  const dashRes = http.get(`${__ENV.BASE_URL}/api/trpc/dashboard.getStats`, {
    headers: { Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}` },
  });

  check(dashRes, {
    'dashboard loaded': (r) => r.status === 200,
  });

  // Submit job
  const jobRes = http.post(`${__ENV.BASE_URL}/api/trpc/jobs.create`, JSON.stringify({
    type: 'image',
    prompt: 'A test image',
    model: 'kie-ai/default',
  }), {
    headers: { 
      'Content-Type': 'application/json',
      Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}`,
    },
  });

  check(jobRes, {
    'job submitted': (r) => r.status === 200,
  });

  const jobId = JSON.parse(jobRes.body).result.data.id;

  // Poll for status (3 times)
  for (let i = 0; i < 3; i++) {
    sleep(2);
    const statusRes = http.get(`${__ENV.BASE_URL}/api/trpc/jobs.get?input=${jobId}`, {
      headers: { Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}` },
    });

    check(statusRes, {
      'status check succeeded': (r) => r.status === 200,
    });
  }

  sleep(1); // Think time between iterations
}
```

**Target metrics:**
- p95 latency < 500ms for API calls
- 0% 5xx errors
- All 100 VUs complete their iterations without timeout

### Scenario 2: Job Burst (500 Concurrent Generates)

**Objective:** Validate Cloud Tasks queue backpressure and Cloud Run autoscaling under burst load.

**Test script stub:** `load-tests/scenario-2-job-burst.js`

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    job_burst: {
      executor: 'shared-iterations',
      vus: 50,
      iterations: 500, // 500 total job submissions
      maxDuration: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // Burst tolerance
    http_req_failed: ['rate<0.01'],
  },
};

const users = JSON.parse(open('./test-users.json'));

export default function () {
  const user = users[__VU % users.length];

  // Login (cached session would be better, but simplified here)
  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
    email: user.email,
    password: 'test-password',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const sessionCookie = loginRes.cookies['SMARTSPEC_SESSIONID'];

  // Submit image generation job
  const jobRes = http.post(`${__ENV.BASE_URL}/api/trpc/jobs.create`, JSON.stringify({
    type: 'image',
    prompt: `Burst test image ${__ITER}`,
    model: 'kie-ai/default',
  }), {
    headers: { 
      'Content-Type': 'application/json',
      Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}`,
    },
  });

  check(jobRes, {
    'job queued': (r) => r.status === 200,
    'job has id': (r) => JSON.parse(r.body).result?.data?.id !== undefined,
  });
}
```

**Target metrics:**
- All 500 jobs queued within 30 seconds
- No lost jobs (verify in Cloud Tasks queue metrics)
- Cloud Run scales up instances (monitor via Cloud Monitoring)
- Cloud Tasks `media-jobs` queue respects rate limits (max 5/s dispatch)

**Post-test validation:**

```bash
# Query Cloud Tasks queue depth during test
gcloud tasks queues describe media-jobs \
  --location=$GCP_REGION \
  --format="value(stats.tasksCount)"

# Query Cloud Run instance count
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=node-api \
  AND jsonPayload.message=~'Instance count'" \
  --limit=50 \
  --format=json
```

### Scenario 3: Sustained Load (1000 Jobs Over 1 Hour)

**Objective:** Validate system stability under prolonged load. Detect memory leaks, connection pool exhaustion, and queue buildup.

**Test script stub:** `load-tests/scenario-3-sustained-load.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 17, // ~1000 jobs/hour (17/minute)
      timeUnit: '1m',
      duration: '60m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'], // Allow up to 5% transient failures
  },
};

const users = JSON.parse(open('./test-users.json'));

export default function () {
  const user = users[Math.floor(Math.random() * users.length)];

  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
    email: user.email,
    password: 'test-password',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const sessionCookie = loginRes.cookies['SMARTSPEC_SESSIONID'];

  // Mix of job types
  const jobType = Math.random() > 0.7 ? 'video' : 'image';

  const jobRes = http.post(`${__ENV.BASE_URL}/api/trpc/jobs.create`, JSON.stringify({
    type: jobType,
    prompt: `Sustained test ${jobType} ${Date.now()}`,
    model: 'kie-ai/default',
  }), {
    headers: { 
      'Content-Type': 'application/json',
      Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}`,
    },
  });

  check(jobRes, {
    'job submitted': (r) => r.status === 200,
  });

  sleep(Math.random() * 5); // Realistic user delay
}
```

**Target metrics:**
- Queue depth stays bounded (< 100 pending tasks at any time)
- Media jobs complete within 10 minutes of submission
- No memory leaks (Cloud Run memory utilization stable over 60 minutes)
- No connection pool exhaustion (monitor Neon Postgres connections)

**Monitoring during test:**

```bash
# Watch queue depth in real-time
watch -n 10 'gcloud tasks queues describe media-jobs --location=$GCP_REGION --format="value(stats.tasksCount)"'

# Monitor Cloud Run memory
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/memory/utilization" AND resource.label.service_name="node-api"' \
  --interval-start-time="$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')" \
  --interval-end-time="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
```

## Test Data Preparation

Before running tests, create test users and authenticate:

**Script stub:** `load-tests/setup-test-users.sh`

```bash
#!/bin/bash
set -e

BASE_URL="${BASE_URL:-https://app-staging.smartaihub.app}"
USER_COUNT=100

echo "Creating $USER_COUNT test users..."

for i in $(seq 1 $USER_COUNT); do
  EMAIL="loadtest-user-$i@example.com"
  PASSWORD="LoadTest123!"

  # Create user via signup endpoint
  curl -s -X POST "$BASE_URL/api/auth/signup" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Load Test User $i\"}" \
    > /dev/null

  echo "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >> test-users.jsonl
done

# Convert JSONL to JSON array
jq -s '.' test-users.jsonl > test-users.json
rm test-users.jsonl

echo "Test users created and saved to test-users.json"
```

**Cleanup script:** `load-tests/cleanup-test-users.sh`

```bash
#!/bin/bash
set -e

# Delete test users from database after load test
psql "$NEON_STAGING_DB_URL" <<EOF
DELETE FROM sessions WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
);
DELETE FROM jobs WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
);
DELETE FROM users WHERE email LIKE 'loadtest-user-%@example.com';
EOF

echo "Test users cleaned up"
```

## Metrics Collection

### Cloud Monitoring Queries

Create a script to collect metrics during and after load tests.

**Script stub:** `load-tests/collect-metrics.sh`

```bash
#!/bin/bash
set -e

PROJECT_ID="${GCP_PROJECT_ID}"
SERVICE_NAME="node-api"
START_TIME="$1"  # ISO 8601 format
END_TIME="$2"

echo "Collecting metrics for $SERVICE_NAME from $START_TIME to $END_TIME..."

# Cloud Run instance count
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-instance-count.json

# Cloud Run request latency (p95)
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/request_latencies\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_PERCENTILE_95"}' \
  --format=json > metrics-latency-p95.json

# Cloud Run CPU utilization
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/cpu/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-cpu-utilization.json

# Cloud Run memory utilization
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/memory/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-memory-utilization.json

# Cloud Tasks queue depth
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"cloudtasks.googleapis.com/queue/depth\" AND resource.label.queue_id=\"media-jobs\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-queue-depth.json

echo "Metrics collected. Files written to metrics-*.json"
```

### Neon Postgres Connection Pool Monitoring

Query Neon's metrics API or use `pg_stat_activity` during the test:

```sql
-- Run this query periodically during load test
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active_connections,
  count(*) FILTER (WHERE state = 'idle') as idle_connections,
  count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname = 'smartspecpro_staging';
```

**Script stub:** `load-tests/monitor-db-connections.sh`

```bash
#!/bin/bash

while true; do
  psql "$NEON_STAGING_DB_URL" -c "
    SELECT 
      now() as timestamp,
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle
    FROM pg_stat_activity
    WHERE datname = current_database();
  "
  sleep 10
done
```

### R2 Upload/Download Latency

k6 scripts already capture HTTP request durations. For R2-specific latency, check Cloud Run logs for R2 API calls:

```bash
gcloud logging read "resource.type=cloud_run_revision \
  AND jsonPayload.message=~'R2 upload' \
  AND jsonPayload.latency_ms>0" \
  --limit=1000 \
  --format="value(jsonPayload.latency_ms)" \
  | awk '{sum+=$1; count++} END {print "Avg R2 upload latency:", sum/count, "ms"}'
```

## Success Criteria

| Scenario | Metric | Target | Actual | Pass/Fail |
|----------|--------|--------|--------|-----------|
| API Load | p95 latency | < 500ms | [TBD] | [ ] |
| API Load | 5xx error rate | 0% | [TBD] | [ ] |
| Job Burst | Jobs queued | 500 in <30s | [TBD] | [ ] |
| Job Burst | Lost jobs | 0 | [TBD] | [ ] |
| Sustained | Queue depth | < 100 peak | [TBD] | [ ] |
| Sustained | Job completion | < 10 min p95 | [TBD] | [ ] |
| Sustained | Memory leak | Stable over 60min | [TBD] | [ ] |
| Sustained | DB connections | < 80% of limit | [TBD] | [ ] |

## Bottleneck Remediation

If load tests reveal bottlenecks, adjust the following:

### High API Latency

**Symptoms:** p95 > 500ms during API load test.

**Remediation:**
1. Increase Cloud Run max instances (currently capped at 5 for node-api):
   ```bash
   gcloud run services update node-api \
     --max-instances=10 \
     --region=$GCP_REGION
   ```
2. Optimize database queries (add indexes, use query caching).
3. Enable Cloud CDN for static assets (if frontend latency is high).

### Queue Backlog Buildup

**Symptoms:** Cloud Tasks queue depth > 100 during sustained load.

**Remediation:**
1. Increase queue concurrency limit:
   ```bash
   gcloud tasks queues update media-jobs \
     --max-concurrent-dispatches=20 \
     --location=$GCP_REGION
   ```
2. Increase Python orchestrator max instances:
   ```bash
   gcloud run services update python-orchestrator \
     --max-instances=5 \
     --region=$GCP_REGION
   ```
3. Profile media-job handler for slow operations (thumbnail generation, R2 upload).

### Database Connection Pool Exhaustion

**Symptoms:** `too many connections` errors, connection pool utilization > 80%.

**Remediation:**
1. Increase per-service pool size (currently 5 per instance):
   ```typescript
   // apps/web/server/db/index.ts
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 10, // Increase from 5
   });
   ```
2. Upgrade Neon plan for higher connection limit (current: 100 on Launch plan).
3. Optimize long-running transactions (reduce hold time).

### Memory Leaks

**Symptoms:** Cloud Run memory utilization climbs steadily over sustained test.

**Remediation:**
1. Profile Node.js service with `--inspect` and Chrome DevTools heap snapshots.
2. Check for unreleased Redis subscriptions (common in SSE endpoints).
3. Ensure PostHog and Sentry flush events and release buffers on shutdown.
4. Increase memory allocation if usage is high but stable:
   ```bash
   gcloud run services update node-api \
     --memory=1Gi \
     --region=$GCP_REGION
   ```

### High 5xx Error Rate

**Symptoms:** > 1% requests fail with 5xx during any scenario.

**Remediation:**
1. Check Sentry for error details (which endpoint, which error type).
2. Common causes: timeout on external API (Kie AI), database connection timeout, Redis connection failure.
3. Add retry logic with exponential backoff for transient failures.
4. Increase request timeout for endpoints with external dependencies:
   ```typescript
   // apps/web/server/index.ts
   app.use('/api/jobs', timeout('30s')); // Increase from default
   ```

## Test Execution Workflow

1. **Setup:**
   ```bash
   cd load-tests
   ./setup-test-users.sh
   ```

2. **Run Scenario 1 (API Load):**
   ```bash
   START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   k6 run --env BASE_URL=https://app-staging.smartaihub.app scenario-1-api-load.js
   END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   ./collect-metrics.sh "$START_TIME" "$END_TIME"
   ```

3. **Analyze results:** Review k6 summary and collected Cloud Monitoring metrics.

4. **Run Scenario 2 (Job Burst):**
   ```bash
   START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   k6 run --env BASE_URL=https://app-staging.smartaihub.app scenario-2-job-burst.js
   END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   ./collect-metrics.sh "$START_TIME" "$END_TIME"
   ```

5. **Run Scenario 3 (Sustained Load):**
   ```bash
   # Start DB connection monitor in separate terminal
   ./monitor-db-connections.sh &
   MONITOR_PID=$!

   START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   k6 run --env BASE_URL=https://app-staging.smartaihub.app scenario-3-sustained-load.js
   END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

   kill $MONITOR_PID
   ./collect-metrics.sh "$START_TIME" "$END_TIME"
   ```

6. **Cleanup:**
   ```bash
   ./cleanup-test-users.sh
   ```

7. **Document results:** Fill in the success criteria table with actual values. If any target is missed, apply remediation and re-test.

## Files Created

| File Path | Purpose |
|-----------|---------|
| `load-tests/scenario-1-api-load.js` | k6 script for API load test (100 VUs, 5min) |
| `load-tests/scenario-2-job-burst.js` | k6 script for job burst test (500 jobs) |
| `load-tests/scenario-3-sustained-load.js` | k6 script for sustained load test (1000 jobs/hr) |
| `load-tests/setup-test-users.sh` | Create test user accounts via tRPC register |
| `load-tests/cleanup-test-users.sh` | Remove test users with full FK cleanup |
| `load-tests/collect-metrics.sh` | Query Cloud Monitoring metrics |
| `load-tests/monitor-db-connections.sh` | Monitor Postgres connections in real-time |
| `load-tests/smoke-test.sh` | Validate test scripts work (1 VU, 1 iteration) |
| `load-tests/REPORT.md` | Test results report template |
| `load-tests/README.md` | Documentation for running load tests |
| `load-tests/test-users.json` | Generated test user credentials (gitignored) |
| `.github/workflows/load-test.yml` | GitHub Actions workflow for on-demand load testing |
| `.gitignore` | Updated with load-tests/test-users.json and metrics patterns |

## Implementation Deviations from Plan

1. **API endpoints corrected**: Plan used REST-style paths (`/api/auth/login`). Actual app uses tRPC at `/trpc/login`, `/trpc/register`, `/trpc/mediaJobs.submitJob`. All scripts updated.
2. **Cookie name corrected**: Plan used `SMARTSPEC_SESSIONID`. Actual cookie is `app_session_id` (from `shared/const.ts`).
3. **CSRF Origin header added**: Server requires Origin header on all POST requests to `/trpc`. Added to all k6 scripts.
4. **tRPC wire format**: Body format uses `{"json": {...}}` per tRPC v11 convention.
5. **Pre-auth strategy**: Instead of logging in per iteration (wastes rate limit budget), k6 `setup()` pre-authenticates all users and shares session cookies across VUs.
6. **Comprehensive FK cleanup**: Cleanup script handles `credit_transactions`, `provider_usage_log`, `workflow_executions` (no cascade), and SET NULL on `api_audit_events`, `registration_events` (nullable FK). Tables with ON DELETE CASCADE auto-clean.
7. **Dashboard endpoint**: `dashboard.getStats` doesn't exist. Replaced with `me` query (publicProcedure).
8. **GHA smoke test**: Added smoke-test step before full load tests.
9. **GHA scenario 3**: Now included in 'all' runs with 75-min timeout.

## Post-Test Analysis

After all scenarios pass, create a load test report document:

**Report stub:** `load-tests/REPORT.md`

```markdown
# SmartSpecPro Load Test Report

**Date:** [Test execution date]
**Environment:** Staging
**Tool:** k6 v0.48.0

## Summary

All three scenarios passed success criteria. System is ready for production launch at target scale.

## Scenario 1: API Load (100 Concurrent Users)

- Duration: 5 minutes
- Total requests: [TBD]
- p95 latency: [TBD] ms (target: <500ms)
- Error rate: [TBD]% (target: 0%)
- Cloud Run instance count peak: [TBD]

## Scenario 2: Job Burst (500 Concurrent Generates)

- Duration: [TBD] seconds
- Jobs queued: 500
- Lost jobs: 0
- Queue depth peak: [TBD]
- Cloud Run instance count peak: [TBD]

## Scenario 3: Sustained Load (1000 Jobs / Hour)

- Duration: 60 minutes
- Total jobs submitted: ~1000
- Queue depth average: [TBD], peak: [TBD]
- Job completion time p95: [TBD] minutes
- Memory utilization trend: Stable (no leak detected)
- DB connections peak: [TBD] / 100 (limit)

## Bottlenecks Identified

[List any issues found and remediation applied]

## Recommendations

[Any configuration changes or optimizations for production]

## Appendix: Metrics

[Attach or link to metrics-*.json files]
```

## Testing the Tests

Before running full load tests, validate the test scripts work:

**Smoke test:** `load-tests/smoke-test.sh`

```bash
#!/bin/bash
set -e

echo "Running smoke test (1 VU, 1 iteration)..."

k6 run --vus 1 --iterations 1 \
  --env BASE_URL="${BASE_URL:-https://app-staging.smartaihub.app}" \
  scenario-1-api-load.js

echo "Smoke test passed. Full load tests are ready to run."
```

## Integration with CI/CD

Optionally, add a load test stage to the CI/CD pipeline that runs on-demand (not on every commit):

**GitHub Actions workflow stub:** `.github/workflows/load-test.yml`

```yaml
name: Load Test

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to test'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Setup test users
        env:
          BASE_URL: ${{ github.event.inputs.environment == 'staging' && 'https://app-staging.smartaihub.app' || 'https://app.smartaihub.app' }}
        run: |
          cd load-tests
          ./setup-test-users.sh

      - name: Run load tests
        env:
          BASE_URL: ${{ github.event.inputs.environment == 'staging' && 'https://app-staging.smartaihub.app' || 'https://app.smartaihub.app' }}
        run: |
          cd load-tests
          k6 run --env BASE_URL="$BASE_URL" scenario-1-api-load.js
          k6 run --env BASE_URL="$BASE_URL" scenario-2-job-burst.js

      - name: Cleanup
        if: always()
        env:
          NEON_STAGING_DB_URL: ${{ secrets.NEON_STAGING_DB_URL }}
        run: |
          cd load-tests
          ./cleanup-test-users.sh

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: load-tests/metrics-*.json
```

## Next Steps

After load testing passes:
1. Document results in `load-tests/REPORT.md`
2. Apply any necessary configuration adjustments (instance limits, queue concurrency, connection pools)
3. Proceed to **section-20-prod-hardening** for final launch preparation