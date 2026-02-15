# SmartSpecPro Load Tests

Load testing suite using [k6](https://k6.io/) to validate SmartSpecPro can handle target scale (100-1,000 users, 50-500 jobs/day).

## Prerequisites

- k6 installed (`brew install k6` / `sudo apt-get install k6` / Docker)
- Access to staging environment
- `jq` for test user setup
- `gcloud` CLI configured for metrics collection
- Database access for cleanup script

## Test Scenarios

| Scenario | File | VUs | Duration | Target |
|----------|------|-----|----------|--------|
| API Load | `scenario-1-api-load.js` | 100 | 5 min | p95 < 500ms, <1% errors |
| Job Burst | `scenario-2-job-burst.js` | 50 | 2 min | 500 jobs queued, 0 lost |
| Sustained | `scenario-3-sustained-load.js` | 20-50 | 60 min | Stable memory, <100 queue depth |

## Quick Start

### 1. Setup test users

```bash
export BASE_URL=https://app-staging.smartaihub.app
./setup-test-users.sh
```

### 2. Run smoke test

```bash
./smoke-test.sh
```

### 3. Run scenarios

```bash
# Scenario 1: API Load
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
k6 run --env BASE_URL="$BASE_URL" scenario-1-api-load.js
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
./collect-metrics.sh "$START_TIME" "$END_TIME"

# Scenario 2: Job Burst
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
k6 run --env BASE_URL="$BASE_URL" scenario-2-job-burst.js
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
./collect-metrics.sh "$START_TIME" "$END_TIME"

# Scenario 3: Sustained Load (with DB monitoring)
./monitor-db-connections.sh &
MONITOR_PID=$!
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
k6 run --env BASE_URL="$BASE_URL" scenario-3-sustained-load.js
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
kill $MONITOR_PID
./collect-metrics.sh "$START_TIME" "$END_TIME"
```

### 4. Cleanup

```bash
export NEON_STAGING_DB_URL=<your-staging-db-url>
./cleanup-test-users.sh
```

### 5. Document results

Fill in `REPORT.md` with actual metrics from test runs.

## Files

| File | Purpose |
|------|---------|
| `scenario-1-api-load.js` | k6: API load test (100 concurrent users) |
| `scenario-2-job-burst.js` | k6: Burst job submission (500 jobs) |
| `scenario-3-sustained-load.js` | k6: Sustained load (1000 jobs/hour) |
| `setup-test-users.sh` | Create test user accounts |
| `cleanup-test-users.sh` | Remove test users from database |
| `collect-metrics.sh` | Collect Cloud Monitoring metrics |
| `monitor-db-connections.sh` | Real-time Postgres connection monitor |
| `smoke-test.sh` | Validate test scripts work (1 VU) |
| `REPORT.md` | Test results report template |
| `test-users.json` | Generated test credentials (gitignored) |

## CI/CD

Load tests can be triggered manually via GitHub Actions:

```bash
gh workflow run load-test.yml -f environment=staging
```

See `.github/workflows/load-test.yml`.
