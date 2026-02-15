diff --git a/.github/workflows/load-test.yml b/.github/workflows/load-test.yml
new file mode 100644
index 0000000..8aa937e
--- /dev/null
+++ b/.github/workflows/load-test.yml
@@ -0,0 +1,81 @@
+name: Load Test
+
+on:
+  workflow_dispatch:
+    inputs:
+      environment:
+        description: 'Environment to test'
+        required: true
+        default: 'staging'
+        type: choice
+        options:
+          - staging
+          - production
+      scenario:
+        description: 'Which scenario to run'
+        required: true
+        default: 'all'
+        type: choice
+        options:
+          - all
+          - scenario-1
+          - scenario-2
+          - scenario-3
+
+jobs:
+  load-test:
+    runs-on: ubuntu-latest
+    env:
+      BASE_URL: ${{ github.event.inputs.environment == 'staging' && 'https://app-staging.smartaihub.app' || 'https://smartaihub.app' }}
+    steps:
+      - uses: actions/checkout@v4
+
+      - name: Install k6
+        run: |
+          sudo gpg -k
+          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
+          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
+          sudo apt-get update
+          sudo apt-get install k6
+
+      - name: Setup test users
+        run: |
+          cd load-tests
+          chmod +x setup-test-users.sh
+          ./setup-test-users.sh
+
+      - name: Run Scenario 1 - API Load
+        if: ${{ github.event.inputs.scenario == 'all' || github.event.inputs.scenario == 'scenario-1' }}
+        run: |
+          cd load-tests
+          k6 run --env BASE_URL="$BASE_URL" scenario-1-api-load.js
+
+      - name: Run Scenario 2 - Job Burst
+        if: ${{ github.event.inputs.scenario == 'all' || github.event.inputs.scenario == 'scenario-2' }}
+        run: |
+          cd load-tests
+          k6 run --env BASE_URL="$BASE_URL" scenario-2-job-burst.js
+
+      - name: Run Scenario 3 - Sustained Load
+        if: ${{ github.event.inputs.scenario == 'scenario-3' }}
+        run: |
+          cd load-tests
+          k6 run --env BASE_URL="$BASE_URL" scenario-3-sustained-load.js
+
+      - name: Cleanup test users
+        if: always()
+        env:
+          NEON_STAGING_DB_URL: ${{ secrets.NEON_STAGING_DB_URL }}
+        run: |
+          cd load-tests
+          chmod +x cleanup-test-users.sh
+          ./cleanup-test-users.sh
+
+      - name: Upload k6 results
+        if: always()
+        uses: actions/upload-artifact@v4
+        with:
+          name: load-test-results-${{ github.run_id }}
+          path: |
+            load-tests/metrics-*.json
+          retention-days: 30
diff --git a/.gitignore b/.gitignore
index 555fbdb..519116f 100644
--- a/.gitignore
+++ b/.gitignore
@@ -177,3 +177,10 @@ apps/web/tmp-workspace-*/
 # ============================================================================
 apps/tauri-shell/binaries/ffmpeg-*
 apps/tauri-shell/binaries/ffprobe-*
+
+# ============================================================================
+# Load testing (generated data, not committed)
+# ============================================================================
+load-tests/test-users.json
+load-tests/test-users.jsonl
+load-tests/metrics-*.json
diff --git a/load-tests/README.md b/load-tests/README.md
new file mode 100644
index 0000000..8720ecd
--- /dev/null
+++ b/load-tests/README.md
@@ -0,0 +1,95 @@
+# SmartSpecPro Load Tests
+
+Load testing suite using [k6](https://k6.io/) to validate SmartSpecPro can handle target scale (100-1,000 users, 50-500 jobs/day).
+
+## Prerequisites
+
+- k6 installed (`brew install k6` / `sudo apt-get install k6` / Docker)
+- Access to staging environment
+- `jq` for test user setup
+- `gcloud` CLI configured for metrics collection
+- Database access for cleanup script
+
+## Test Scenarios
+
+| Scenario | File | VUs | Duration | Target |
+|----------|------|-----|----------|--------|
+| API Load | `scenario-1-api-load.js` | 100 | 5 min | p95 < 500ms, <1% errors |
+| Job Burst | `scenario-2-job-burst.js` | 50 | 2 min | 500 jobs queued, 0 lost |
+| Sustained | `scenario-3-sustained-load.js` | 20-50 | 60 min | Stable memory, <100 queue depth |
+
+## Quick Start
+
+### 1. Setup test users
+
+```bash
+export BASE_URL=https://app-staging.smartaihub.app
+./setup-test-users.sh
+```
+
+### 2. Run smoke test
+
+```bash
+./smoke-test.sh
+```
+
+### 3. Run scenarios
+
+```bash
+# Scenario 1: API Load
+START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
+k6 run --env BASE_URL="$BASE_URL" scenario-1-api-load.js
+END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
+./collect-metrics.sh "$START_TIME" "$END_TIME"
+
+# Scenario 2: Job Burst
+START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
+k6 run --env BASE_URL="$BASE_URL" scenario-2-job-burst.js
+END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
+./collect-metrics.sh "$START_TIME" "$END_TIME"
+
+# Scenario 3: Sustained Load (with DB monitoring)
+./monitor-db-connections.sh &
+MONITOR_PID=$!
+START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
+k6 run --env BASE_URL="$BASE_URL" scenario-3-sustained-load.js
+END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
+kill $MONITOR_PID
+./collect-metrics.sh "$START_TIME" "$END_TIME"
+```
+
+### 4. Cleanup
+
+```bash
+export NEON_STAGING_DB_URL=<your-staging-db-url>
+./cleanup-test-users.sh
+```
+
+### 5. Document results
+
+Fill in `REPORT.md` with actual metrics from test runs.
+
+## Files
+
+| File | Purpose |
+|------|---------|
+| `scenario-1-api-load.js` | k6: API load test (100 concurrent users) |
+| `scenario-2-job-burst.js` | k6: Burst job submission (500 jobs) |
+| `scenario-3-sustained-load.js` | k6: Sustained load (1000 jobs/hour) |
+| `setup-test-users.sh` | Create test user accounts |
+| `cleanup-test-users.sh` | Remove test users from database |
+| `collect-metrics.sh` | Collect Cloud Monitoring metrics |
+| `monitor-db-connections.sh` | Real-time Postgres connection monitor |
+| `smoke-test.sh` | Validate test scripts work (1 VU) |
+| `REPORT.md` | Test results report template |
+| `test-users.json` | Generated test credentials (gitignored) |
+
+## CI/CD
+
+Load tests can be triggered manually via GitHub Actions:
+
+```bash
+gh workflow run load-test.yml -f environment=staging
+```
+
+See `.github/workflows/load-test.yml`.
diff --git a/load-tests/REPORT.md b/load-tests/REPORT.md
new file mode 100644
index 0000000..3312436
--- /dev/null
+++ b/load-tests/REPORT.md
@@ -0,0 +1,59 @@
+# SmartSpecPro Load Test Report
+
+**Date:** [Test execution date]
+**Environment:** Staging
+**Tool:** k6
+
+## Summary
+
+[Overall summary of test results]
+
+## Scenario 1: API Load (100 Concurrent Users)
+
+- Duration: 5 minutes
+- Total requests: [TBD]
+- p95 latency: [TBD] ms (target: <500ms)
+- Error rate: [TBD]% (target: <1%)
+- Cloud Run instance count peak: [TBD]
+
+## Scenario 2: Job Burst (500 Concurrent Generates)
+
+- Duration: [TBD] seconds
+- Jobs queued: [TBD] / 500
+- Lost jobs: [TBD]
+- Queue depth peak: [TBD]
+- Cloud Run instance count peak: [TBD]
+
+## Scenario 3: Sustained Load (1000 Jobs / Hour)
+
+- Duration: 60 minutes
+- Total jobs submitted: [TBD]
+- Queue depth average: [TBD], peak: [TBD]
+- Job completion time p95: [TBD] minutes
+- Memory utilization trend: [TBD]
+- DB connections peak: [TBD] / 100 (limit)
+
+## Success Criteria
+
+| Scenario | Metric | Target | Actual | Pass/Fail |
+|----------|--------|--------|--------|-----------|
+| API Load | p95 latency | < 500ms | [TBD] | [ ] |
+| API Load | 5xx error rate | 0% | [TBD] | [ ] |
+| Job Burst | Jobs queued | 500 in <30s | [TBD] | [ ] |
+| Job Burst | Lost jobs | 0 | [TBD] | [ ] |
+| Sustained | Queue depth | < 100 peak | [TBD] | [ ] |
+| Sustained | Job completion | < 10 min p95 | [TBD] | [ ] |
+| Sustained | Memory leak | Stable over 60min | [TBD] | [ ] |
+| Sustained | DB connections | < 80% of limit | [TBD] | [ ] |
+
+## Bottlenecks Identified
+
+[List any issues found and remediation applied]
+
+## Recommendations
+
+[Any configuration changes or optimizations for production]
+
+## Appendix: Metrics
+
+[Attach or link to metrics-*.json files]
diff --git a/load-tests/cleanup-test-users.sh b/load-tests/cleanup-test-users.sh
new file mode 100755
index 0000000..d02128e
--- /dev/null
+++ b/load-tests/cleanup-test-users.sh
@@ -0,0 +1,47 @@
+#!/bin/bash
+set -e
+
+DB_URL="${NEON_STAGING_DB_URL:-$DATABASE_URL}"
+
+if [ -z "$DB_URL" ]; then
+  echo "Error: Set NEON_STAGING_DB_URL or DATABASE_URL environment variable"
+  exit 1
+fi
+
+echo "Cleaning up load test users..."
+
+# Count users to be deleted
+USER_COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM users WHERE email LIKE 'loadtest-user-%@example.com';")
+echo "Found $USER_COUNT load test users to clean up"
+
+if [ "$USER_COUNT" -eq 0 ]; then
+  echo "No test users to clean up"
+  exit 0
+fi
+
+# Delete in dependency order to respect foreign keys
+psql "$DB_URL" <<'EOF'
+BEGIN;
+
+-- Delete sessions first
+DELETE FROM sessions WHERE "userId" IN (
+  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
+);
+
+-- Delete jobs and related data
+DELETE FROM jobs WHERE "userId" IN (
+  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
+);
+
+-- Delete credit transactions
+DELETE FROM credit_transactions WHERE "userId" IN (
+  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
+);
+
+-- Delete the users themselves
+DELETE FROM users WHERE email LIKE 'loadtest-user-%@example.com';
+
+COMMIT;
+EOF
+
+echo "Test users cleaned up successfully"
diff --git a/load-tests/collect-metrics.sh b/load-tests/collect-metrics.sh
new file mode 100755
index 0000000..4092437
--- /dev/null
+++ b/load-tests/collect-metrics.sh
@@ -0,0 +1,70 @@
+#!/bin/bash
+set -e
+
+PROJECT_ID="${GCP_PROJECT_ID}"
+SERVICE_NAME="${SERVICE_NAME:-node-api}"
+START_TIME="$1"  # ISO 8601 format
+END_TIME="$2"
+
+if [ -z "$PROJECT_ID" ]; then
+  echo "Error: Set GCP_PROJECT_ID environment variable"
+  exit 1
+fi
+
+if [ -z "$START_TIME" ] || [ -z "$END_TIME" ]; then
+  echo "Usage: $0 <start-time> <end-time>"
+  echo "  Times in ISO 8601 format: 2026-02-15T10:00:00Z"
+  exit 1
+fi
+
+echo "Collecting metrics for $SERVICE_NAME from $START_TIME to $END_TIME..."
+
+# Cloud Run instance count
+echo "  Fetching instance count..."
+gcloud monitoring time-series list \
+  --project="$PROJECT_ID" \
+  --filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
+  --interval-start-time="$START_TIME" \
+  --interval-end-time="$END_TIME" \
+  --format=json > metrics-instance-count.json
+
+# Cloud Run request latency (p95)
+echo "  Fetching request latency (p95)..."
+gcloud monitoring time-series list \
+  --project="$PROJECT_ID" \
+  --filter="metric.type=\"run.googleapis.com/request_latencies\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
+  --interval-start-time="$START_TIME" \
+  --interval-end-time="$END_TIME" \
+  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_PERCENTILE_95"}' \
+  --format=json > metrics-latency-p95.json
+
+# Cloud Run CPU utilization
+echo "  Fetching CPU utilization..."
+gcloud monitoring time-series list \
+  --project="$PROJECT_ID" \
+  --filter="metric.type=\"run.googleapis.com/container/cpu/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
+  --interval-start-time="$START_TIME" \
+  --interval-end-time="$END_TIME" \
+  --format=json > metrics-cpu-utilization.json
+
+# Cloud Run memory utilization
+echo "  Fetching memory utilization..."
+gcloud monitoring time-series list \
+  --project="$PROJECT_ID" \
+  --filter="metric.type=\"run.googleapis.com/container/memory/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
+  --interval-start-time="$START_TIME" \
+  --interval-end-time="$END_TIME" \
+  --format=json > metrics-memory-utilization.json
+
+# Cloud Tasks queue depth
+echo "  Fetching queue depth..."
+gcloud monitoring time-series list \
+  --project="$PROJECT_ID" \
+  --filter="metric.type=\"cloudtasks.googleapis.com/queue/depth\" AND resource.label.queue_id=\"media-jobs\"" \
+  --interval-start-time="$START_TIME" \
+  --interval-end-time="$END_TIME" \
+  --format=json > metrics-queue-depth.json
+
+echo ""
+echo "Metrics collected successfully:"
+ls -lh metrics-*.json
diff --git a/load-tests/monitor-db-connections.sh b/load-tests/monitor-db-connections.sh
new file mode 100755
index 0000000..823db5f
--- /dev/null
+++ b/load-tests/monitor-db-connections.sh
@@ -0,0 +1,25 @@
+#!/bin/bash
+
+DB_URL="${NEON_STAGING_DB_URL:-$DATABASE_URL}"
+
+if [ -z "$DB_URL" ]; then
+  echo "Error: Set NEON_STAGING_DB_URL or DATABASE_URL environment variable"
+  exit 1
+fi
+
+echo "Monitoring database connections (Ctrl+C to stop)..."
+echo ""
+
+while true; do
+  psql "$DB_URL" -c "
+    SELECT
+      now() as timestamp,
+      count(*) as total_connections,
+      count(*) FILTER (WHERE state = 'active') as active,
+      count(*) FILTER (WHERE state = 'idle') as idle,
+      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
+    FROM pg_stat_activity
+    WHERE datname = current_database();
+  "
+  sleep 10
+done
diff --git a/load-tests/scenario-1-api-load.js b/load-tests/scenario-1-api-load.js
new file mode 100644
index 0000000..40e95d4
--- /dev/null
+++ b/load-tests/scenario-1-api-load.js
@@ -0,0 +1,118 @@
+import http from 'k6/http';
+import { check, sleep } from 'k6';
+import { Rate } from 'k6/metrics';
+
+// Custom metrics
+const errorRate = new Rate('errors');
+
+export const options = {
+  scenarios: {
+    api_load: {
+      executor: 'constant-vus',
+      vus: 100,
+      duration: '5m',
+    },
+  },
+  thresholds: {
+    http_req_duration: ['p(95)<500'], // 95% under 500ms
+    http_req_failed: ['rate<0.01'],   // <1% errors
+  },
+};
+
+// Test data: create test users beforehand via setup-test-users.sh
+const users = JSON.parse(open('./test-users.json'));
+
+export default function () {
+  const user = users[__VU % users.length];
+
+  // Login
+  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
+    email: user.email,
+    password: user.password,
+  }), {
+    headers: { 'Content-Type': 'application/json' },
+  });
+
+  check(loginRes, {
+    'login succeeded': (r) => r.status === 200,
+  });
+
+  errorRate.add(loginRes.status !== 200);
+
+  if (loginRes.status !== 200) {
+    sleep(1);
+    return; // Skip iteration if login failed
+  }
+
+  const cookies = loginRes.cookies;
+  const sessionCookie = cookies['SMARTSPEC_SESSIONID']
+    ? cookies['SMARTSPEC_SESSIONID'][0].value
+    : null;
+
+  if (!sessionCookie) {
+    sleep(1);
+    return;
+  }
+
+  const authHeaders = {
+    Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}`,
+  };
+
+  // Browse dashboard
+  const dashRes = http.get(`${__ENV.BASE_URL}/api/trpc/dashboard.getStats`, {
+    headers: authHeaders,
+  });
+
+  check(dashRes, {
+    'dashboard loaded': (r) => r.status === 200,
+  });
+
+  errorRate.add(dashRes.status !== 200);
+
+  // Submit job
+  const jobRes = http.post(`${__ENV.BASE_URL}/api/trpc/jobs.create`, JSON.stringify({
+    type: 'image',
+    prompt: 'A test image for load testing',
+    model: 'kie-ai/default',
+  }), {
+    headers: {
+      'Content-Type': 'application/json',
+      ...authHeaders,
+    },
+  });
+
+  check(jobRes, {
+    'job submitted': (r) => r.status === 200,
+  });
+
+  errorRate.add(jobRes.status !== 200);
+
+  if (jobRes.status === 200) {
+    let body;
+    try {
+      body = JSON.parse(jobRes.body);
+    } catch (_) {
+      sleep(1);
+      return;
+    }
+
+    const jobId = body.result?.data?.id;
+
+    if (jobId) {
+      // Poll for status (3 times)
+      for (let i = 0; i < 3; i++) {
+        sleep(2);
+        const statusRes = http.get(
+          `${__ENV.BASE_URL}/api/trpc/jobs.get?input=${encodeURIComponent(JSON.stringify({ id: jobId }))}`,
+          { headers: authHeaders }
+        );
+
+        check(statusRes, {
+          'status check succeeded': (r) => r.status === 200,
+        });
+      }
+    }
+  }
+
+  sleep(1); // Think time between iterations
+}
diff --git a/load-tests/scenario-2-job-burst.js b/load-tests/scenario-2-job-burst.js
new file mode 100644
index 0000000..d0d42d7
--- /dev/null
+++ b/load-tests/scenario-2-job-burst.js
@@ -0,0 +1,79 @@
+import http from 'k6/http';
+import { check } from 'k6';
+import { Rate, Counter } from 'k6/metrics';
+
+const errorRate = new Rate('errors');
+const jobsQueued = new Counter('jobs_queued');
+
+export const options = {
+  scenarios: {
+    job_burst: {
+      executor: 'shared-iterations',
+      vus: 50,
+      iterations: 500, // 500 total job submissions
+      maxDuration: '2m',
+    },
+  },
+  thresholds: {
+    http_req_duration: ['p(95)<2000'], // Burst tolerance: 2s
+    http_req_failed: ['rate<0.01'],
+  },
+};
+
+const users = JSON.parse(open('./test-users.json'));
+
+export default function () {
+  const user = users[__VU % users.length];
+
+  // Login
+  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
+    email: user.email,
+    password: user.password,
+  }), {
+    headers: { 'Content-Type': 'application/json' },
+  });
+
+  if (loginRes.status !== 200) {
+    errorRate.add(true);
+    return;
+  }
+
+  const cookies = loginRes.cookies;
+  const sessionCookie = cookies['SMARTSPEC_SESSIONID']
+    ? cookies['SMARTSPEC_SESSIONID'][0].value
+    : null;
+
+  if (!sessionCookie) {
+    errorRate.add(true);
+    return;
+  }
+
+  // Submit image generation job
+  const jobRes = http.post(`${__ENV.BASE_URL}/api/trpc/jobs.create`, JSON.stringify({
+    type: 'image',
+    prompt: `Burst test image ${__ITER}`,
+    model: 'kie-ai/default',
+  }), {
+    headers: {
+      'Content-Type': 'application/json',
+      Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}`,
+    },
+  });
+
+  const success = check(jobRes, {
+    'job queued': (r) => r.status === 200,
+    'job has id': (r) => {
+      try {
+        return JSON.parse(r.body).result?.data?.id !== undefined;
+      } catch (_) {
+        return false;
+      }
+    },
+  });
+
+  if (success) {
+    jobsQueued.add(1);
+  }
+
+  errorRate.add(!success);
+}
diff --git a/load-tests/scenario-3-sustained-load.js b/load-tests/scenario-3-sustained-load.js
new file mode 100644
index 0000000..0909f19
--- /dev/null
+++ b/load-tests/scenario-3-sustained-load.js
@@ -0,0 +1,86 @@
+import http from 'k6/http';
+import { check, sleep } from 'k6';
+import { Rate, Counter, Trend } from 'k6/metrics';
+
+const errorRate = new Rate('errors');
+const jobsSubmitted = new Counter('jobs_submitted');
+const jobSubmitDuration = new Trend('job_submit_duration');
+
+export const options = {
+  scenarios: {
+    sustained_load: {
+      executor: 'constant-arrival-rate',
+      rate: 17, // ~1000 jobs/hour (17/minute)
+      timeUnit: '1m',
+      duration: '60m',
+      preAllocatedVUs: 20,
+      maxVUs: 50,
+    },
+  },
+  thresholds: {
+    http_req_duration: ['p(95)<1000'],
+    http_req_failed: ['rate<0.05'], // Allow up to 5% transient failures
+    job_submit_duration: ['p(95)<2000'],
+  },
+};
+
+const users = JSON.parse(open('./test-users.json'));
+
+export default function () {
+  const user = users[Math.floor(Math.random() * users.length)];
+
+  // Login
+  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
+    email: user.email,
+    password: user.password,
+  }), {
+    headers: { 'Content-Type': 'application/json' },
+  });
+
+  if (loginRes.status !== 200) {
+    errorRate.add(true);
+    sleep(Math.random() * 5);
+    return;
+  }
+
+  const cookies = loginRes.cookies;
+  const sessionCookie = cookies['SMARTSPEC_SESSIONID']
+    ? cookies['SMARTSPEC_SESSIONID'][0].value
+    : null;
+
+  if (!sessionCookie) {
+    errorRate.add(true);
+    sleep(Math.random() * 5);
+    return;
+  }
+
+  // Mix of job types: 70% image, 30% video
+  const jobType = Math.random() > 0.7 ? 'video' : 'image';
+
+  const startTime = Date.now();
+
+  const jobRes = http.post(`${__ENV.BASE_URL}/api/trpc/jobs.create`, JSON.stringify({
+    type: jobType,
+    prompt: `Sustained test ${jobType} ${Date.now()}`,
+    model: 'kie-ai/default',
+  }), {
+    headers: {
+      'Content-Type': 'application/json',
+      Cookie: `SMARTSPEC_SESSIONID=${sessionCookie}`,
+    },
+  });
+
+  jobSubmitDuration.add(Date.now() - startTime);
+
+  const success = check(jobRes, {
+    'job submitted': (r) => r.status === 200,
+  });
+
+  if (success) {
+    jobsSubmitted.add(1);
+  }
+
+  errorRate.add(!success);
+
+  sleep(Math.random() * 5); // Realistic user delay
+}
diff --git a/load-tests/setup-test-users.sh b/load-tests/setup-test-users.sh
new file mode 100755
index 0000000..93cc283
--- /dev/null
+++ b/load-tests/setup-test-users.sh
@@ -0,0 +1,61 @@
+#!/bin/bash
+set -e
+
+BASE_URL="${BASE_URL:-https://app-staging.smartaihub.app}"
+USER_COUNT="${USER_COUNT:-100}"
+OUTPUT_FILE="test-users.json"
+
+echo "Creating $USER_COUNT test users against $BASE_URL..."
+
+# Create temp file for JSONL
+TEMP_JSONL=$(mktemp)
+trap 'rm -f "$TEMP_JSONL"' EXIT
+
+CREATED=0
+FAILED=0
+
+for i in $(seq 1 "$USER_COUNT"); do
+  EMAIL="loadtest-user-$i@example.com"
+  PASSWORD="LoadTest123!"
+
+  # Create user via signup endpoint
+  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
+    -X POST "$BASE_URL/api/auth/signup" \
+    -H "Content-Type: application/json" \
+    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Load Test User $i\"}")
+
+  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "409" ]; then
+    # 409 = user already exists, still usable
+    echo "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >> "$TEMP_JSONL"
+    CREATED=$((CREATED + 1))
+  else
+    echo "Warning: Failed to create user $EMAIL (HTTP $HTTP_CODE)"
+    FAILED=$((FAILED + 1))
+  fi
+
+  # Progress indicator every 10 users
+  if [ $((i % 10)) -eq 0 ]; then
+    echo "  Progress: $i/$USER_COUNT users processed"
+  fi
+done
+
+# Convert JSONL to JSON array
+if command -v jq &> /dev/null; then
+  jq -s '.' "$TEMP_JSONL" > "$OUTPUT_FILE"
+else
+  # Fallback without jq
+  echo "[" > "$OUTPUT_FILE"
+  head -n -1 "$TEMP_JSONL" | while IFS= read -r line; do
+    echo "  $line," >> "$OUTPUT_FILE"
+  done
+  tail -n 1 "$TEMP_JSONL" | while IFS= read -r line; do
+    echo "  $line" >> "$OUTPUT_FILE"
+  done
+  echo "]" >> "$OUTPUT_FILE"
+fi
+
+echo ""
+echo "Test user setup complete:"
+echo "  Created/found: $CREATED"
+echo "  Failed: $FAILED"
+echo "  Output: $OUTPUT_FILE"
diff --git a/load-tests/smoke-test.sh b/load-tests/smoke-test.sh
new file mode 100755
index 0000000..f17f742
--- /dev/null
+++ b/load-tests/smoke-test.sh
@@ -0,0 +1,13 @@
+#!/bin/bash
+set -e
+
+BASE_URL="${BASE_URL:-https://app-staging.smartaihub.app}"
+
+echo "Running smoke test (1 VU, 1 iteration) against $BASE_URL..."
+
+k6 run --vus 1 --iterations 1 \
+  --env BASE_URL="$BASE_URL" \
+  scenario-1-api-load.js
+
+echo ""
+echo "Smoke test passed. Full load tests are ready to run."
