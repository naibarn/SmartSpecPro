# Load Testing Guide - Silence Detection Feature

## Overview

This guide provides instructions and scripts for load testing the silence detection feature with 10+ concurrent users.

## Test Environment

### Prerequisites

**Infrastructure:**
- [ ] Staging environment with production-like specs
- [ ] 2+ Celery workers running
- [ ] FFmpeg installed on all workers
- [ ] PostgreSQL database
- [ ] Redis for Celery backend
- [ ] Load balancer (if applicable)

**Test Tools:**
- [ ] Locust (Python load testing framework)
- [ ] Or K6 (JavaScript load testing tool)
- [ ] Monitoring tools (Grafana, Prometheus)

**Test Data:**
- [ ] 5-10 sample videos (variety of sizes)
- [ ] Test user accounts (10-20 users)
- [ ] API authentication tokens

## Load Test Scenarios

### Scenario 1: Steady Load (10 users, 1 hour)

**Objective**: Verify system handles normal load for extended period

**Parameters:**
- **Users**: 10 concurrent
- **Duration**: 1 hour
- **Request pattern**: Each user submits 1 export every 5 minutes
- **Expected requests**: 120 exports total

**Success Criteria:**
- All exports complete successfully (95%+ success rate)
- Average processing time <60 seconds
- P95 processing time <120 seconds
- No memory leaks
- No worker crashes

### Scenario 2: Peak Load (50 users, 15 minutes)

**Objective**: Test system under peak traffic

**Parameters:**
- **Users**: 50 concurrent
- **Duration**: 15 minutes
- **Request pattern**: Burst of exports at start, then steady
- **Expected requests**: 150-200 exports

**Success Criteria:**
- Success rate >90%
- Queue doesn't overflow
- Some requests may wait but none timeout
- System recovers after peak

### Scenario 3: Stress Test (100 users, 10 minutes)

**Objective**: Find breaking point

**Parameters:**
- **Users**: 100 concurrent
- **Duration**: 10 minutes
- **Request pattern**: Maximum load
- **Expected requests**: 200-300 exports

**Success Criteria:**
- System doesn't crash
- Graceful degradation (slow but not failing)
- Error messages are meaningful
- System recovers after test

## Load Test Scripts

### Option 1: Locust (Python)

**Install Locust:**
```bash
pip install locust
```

**Create `locustfile.py`:**
```python
"""
Load test for silence detection feature.

Run with:
  locust -f locustfile.py --host=https://staging.smartaihub.app
"""

import random
import time
from locust import HttpUser, task, between, events

# Test videos (upload these to staging first)
TEST_VIDEOS = [
    {"uri": "https://staging.smartaihub.app/uploads/test-video-1.mp4", "duration_sec": 600},
    {"uri": "https://staging.smartaihub.app/uploads/test-video-2.mp4", "duration_sec": 1800},
    {"uri": "https://staging.smartaihub.app/uploads/test-video-3.mp4", "duration_sec": 300},
]

# Sample segments (realistic patterns)
SEGMENT_PATTERNS = [
    # Light editing (10 segments)
    [{"startMs": i * 60000, "endMs": i * 60000 + 3000} for i in range(10)],
    # Medium editing (50 segments)
    [{"startMs": i * 10000, "endMs": i * 10000 + 1000} for i in range(50)],
    # Heavy editing (100 segments)
    [{"startMs": i * 5000, "endMs": i * 5000 + 500} for i in range(100)],
]


class SilenceDetectionUser(HttpUser):
    """Simulates a user performing silence detection and export."""

    # Wait 5-15 seconds between tasks
    wait_time = between(5, 15)

    def on_start(self):
        """Login and get auth token."""
        # Adjust this based on your auth mechanism
        response = self.client.post("/api/auth/login", json={
            "username": f"loadtest_{random.randint(1, 20)}@example.com",
            "password": "LoadTest123!"
        })

        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            print(f"Login failed: {response.status_code}")
            self.environment.runner.quit()

    @task(3)
    def export_with_silence_removal(self):
        """Submit a dead_air_cut job and wait for completion."""
        # Pick random video and segment pattern
        video = random.choice(TEST_VIDEOS)
        segments = random.choice(SEGMENT_PATTERNS)

        # Adjust segment times to fit video duration
        max_time_ms = video["duration_sec"] * 1000
        segments = [
            {"startMs": min(seg["startMs"], max_time_ms - 1000),
             "endMs": min(seg["endMs"], max_time_ms)}
            for seg in segments
        ]

        # Submit job
        job_spec = {
            "specVersion": "0.1",
            "jobId": f"load-test-{int(time.time() * 1000)}",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": video["uri"]}]
            },
            "params": {
                "segments": segments,
                "mode": "remove",
                "softeningBufferMs": random.choice([0, 100, 200]),
                "crossfade": random.choice([True, False])
            },
            "output": {"mode": "file", "target": "output.mp4"}
        }

        start_time = time.time()

        with self.client.post(
            "/api/v1/media/jobs",
            json=job_spec,
            headers=self.headers,
            catch_response=True,
            name="Submit dead_air_cut job"
        ) as response:
            if response.status_code != 200:
                response.failure(f"Job submission failed: {response.status_code}")
                return

            job_id = response.json().get("jobId")

        # Poll for completion (max 5 minutes)
        timeout = 300  # 5 minutes
        poll_interval = 2  # 2 seconds
        elapsed = 0

        while elapsed < timeout:
            time.sleep(poll_interval)
            elapsed += poll_interval

            with self.client.get(
                f"/api/v1/media/jobs/{job_id}",
                headers=self.headers,
                catch_response=True,
                name="Poll job status"
            ) as status_response:
                if status_response.status_code != 200:
                    status_response.failure("Status check failed")
                    return

                status = status_response.json().get("status")

                if status == "completed":
                    total_time = time.time() - start_time
                    status_response.success()
                    print(f"Job {job_id} completed in {total_time:.2f}s")
                    return
                elif status == "failed":
                    error = status_response.json().get("error", "Unknown error")
                    status_response.failure(f"Job failed: {error}")
                    return

        # Timeout
        response.failure(f"Job {job_id} timed out after {timeout}s")

    @task(1)
    def health_check(self):
        """Simple health check to keep baseline requests."""
        self.client.get("/api/health", name="Health check")


# Custom metrics
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("=== Load Test Starting ===")
    print(f"Target: {environment.host}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    print("=== Load Test Complete ===")
    print(f"Total requests: {environment.stats.total.num_requests}")
    print(f"Failures: {environment.stats.total.num_failures}")
    print(f"Success rate: {environment.stats.total.success_rate:.2f}%")
```

**Run Load Test:**

```bash
# Scenario 1: Steady Load (10 users, 1 hour)
locust -f locustfile.py --host=https://staging.smartaihub.app \
  --users 10 --spawn-rate 1 --run-time 1h --headless

# Scenario 2: Peak Load (50 users, 15 minutes)
locust -f locustfile.py --host=https://staging.smartaihub.app \
  --users 50 --spawn-rate 5 --run-time 15m --headless

# Scenario 3: Stress Test (100 users, 10 minutes)
locust -f locustfile.py --host=https://staging.smartaihub.app \
  --users 100 --spawn-rate 10 --run-time 10m --headless

# With Web UI (recommended for monitoring)
locust -f locustfile.py --host=https://staging.smartaihub.app
# Then open http://localhost:8089
```

### Option 2: K6 (JavaScript)

**Install K6:**
```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Create `load-test.js`:**
```javascript
/**
 * K6 load test for silence detection.
 *
 * Run with:
 *   k6 run load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  // Scenario 1: Steady load
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '10m', target: 10 },  // Stay at 10 users
    { duration: '2m', target: 0 },    // Ramp down
  ],

  thresholds: {
    http_req_duration: ['p(95)<120000'],  // 95% of requests <120s
    http_req_failed: ['rate<0.1'],        // <10% errors
    errors: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.smartaihub.app';

const TEST_VIDEOS = [
  { uri: `${BASE_URL}/uploads/test-video-1.mp4`, duration: 600 },
  { uri: `${BASE_URL}/uploads/test-video-2.mp4`, duration: 1800 },
];

export function setup() {
  // Login and get token (adjust for your auth)
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    username: 'loadtest@example.com',
    password: 'LoadTest123!',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  return { token: loginRes.json('token') };
}

export default function(data) {
  const headers = {
    'Authorization': `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // Pick random video
  const video = TEST_VIDEOS[Math.floor(Math.random() * TEST_VIDEOS.length)];

  // Generate segments
  const segmentCount = Math.floor(Math.random() * 50) + 10;  // 10-60 segments
  const segments = [];
  for (let i = 0; i < segmentCount; i++) {
    const start = i * 10000;
    segments.push({ startMs: start, endMs: start + 1000 });
  }

  // Submit job
  const jobSpec = {
    specVersion: '0.1',
    jobId: `load-${Date.now()}-${__VU}`,
    jobType: 'dead_air_cut',
    inputs: {
      assets: [{ assetId: 'test', kind: 'video', uri: video.uri }],
    },
    params: {
      segments,
      mode: 'remove',
      softeningBufferMs: 200,
      crossfade: true,
    },
    output: { mode: 'file', target: 'output.mp4' },
  };

  const submitRes = http.post(
    `${BASE_URL}/api/v1/media/jobs`,
    JSON.stringify(jobSpec),
    { headers }
  );

  check(submitRes, {
    'job submitted': (r) => r.status === 200,
  }) || errorRate.add(1);

  if (submitRes.status !== 200) {
    console.error(`Job submission failed: ${submitRes.status}`);
    return;
  }

  const jobId = submitRes.json('jobId');

  // Poll for completion
  const maxPolls = 150;  // 5 minutes (2s * 150)
  for (let i = 0; i < maxPolls; i++) {
    sleep(2);

    const statusRes = http.get(`${BASE_URL}/api/v1/media/jobs/${jobId}`, { headers });

    if (statusRes.status !== 200) {
      errorRate.add(1);
      break;
    }

    const status = statusRes.json('status');

    if (status === 'completed') {
      check(statusRes, {
        'job completed': () => true,
      });
      return;
    } else if (status === 'failed') {
      console.error(`Job ${jobId} failed`);
      errorRate.add(1);
      return;
    }
  }

  // Timeout
  console.error(`Job ${jobId} timed out`);
  errorRate.add(1);
}
```

**Run with K6:**
```bash
# Steady load
k6 run load-test.js

# Peak load (50 users)
k6 run --stage 2m:50 --stage 10m:50 --stage 2m:0 load-test.js

# Stress test (100 users)
k6 run --stage 2m:100 --stage 5m:100 --stage 2m:0 load-test.js
```

## Monitoring During Load Test

### Key Metrics to Track

#### System Metrics

| Metric | Tool | Alert Threshold |
|--------|------|-----------------|
| CPU usage | htop, Grafana | >80% for >5 min |
| Memory usage | free -m | >90% |
| Disk I/O | iostat | Wait >100ms |
| Network | iftop | Bandwidth saturated |

#### Application Metrics

| Metric | Source | Target | Alert |
|--------|--------|--------|-------|
| Request success rate | Locust/K6 | >95% | <90% |
| Avg response time | Locust/K6 | <60s | >120s |
| P95 response time | Locust/K6 | <120s | >180s |
| Queue depth | Celery | <10 | >50 |
| Active workers | Celery | 2+ | <2 |
| Failed jobs | Database | <5% | >10% |

#### Database Metrics

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Long-running queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '30 seconds';

-- Locks
SELECT * FROM pg_locks WHERE NOT granted;
```

### Monitoring Commands

**Real-time CPU/Memory:**
```bash
# htop with sorting
htop -s PERCENT_CPU

# Watch Celery workers
watch -n 2 'celery -A app.core.celery_app inspect active'

# Watch queue depth
watch -n 2 'redis-cli llen celery'
```

**FFmpeg Processes:**
```bash
# Count running FFmpeg processes
watch -n 5 'ps aux | grep ffmpeg | wc -l'

# FFmpeg resource usage
ps aux | grep ffmpeg | awk '{sum+=$3} END {print "Total CPU:", sum"%"}'
```

## Load Test Results Template

### Test Run Report

**Test Date**: ___________
**Scenario**: Steady / Peak / Stress
**Duration**: ___________
**Peak Users**: ___________

#### Summary

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Total requests | - | _____ | - |
| Success rate | >95% | _____% | _____ |
| Avg response time | <60s | _____s | _____ |
| P95 response time | <120s | _____s | _____ |
| Max response time | <300s | _____s | _____ |
| Errors | <5% | _____% | _____ |

#### System Performance

| Resource | Peak Usage | Notes |
|----------|-----------|-------|
| CPU | _____% | __________ |
| Memory | _____% | __________ |
| Disk I/O | _____ MB/s | __________ |
| Network | _____ Mbps | __________ |

#### Issues Found

1. **Issue**: _____________________
   - **Severity**: HIGH / MEDIUM / LOW
   - **Frequency**: _____ times
   - **Resolution**: _____________________

2. **Issue**: _____________________
   - **Severity**: HIGH / MEDIUM / LOW
   - **Frequency**: _____ times
   - **Resolution**: _____________________

#### Recommendations

- _____________________________________
- _____________________________________
- _____________________________________

## Post-Test Analysis

### Performance Bottlenecks

**Identify bottlenecks by:**
1. Slowest requests (top 10)
2. Failed requests (causes)
3. Resource saturation points
4. Queue backlog patterns

**Common Bottlenecks:**
- **CPU-bound**: FFmpeg processing (expected)
- **I/O-bound**: Video file reads/writes
- **Memory-bound**: Large video files
- **Network-bound**: Slow asset downloads
- **Database-bound**: Job status queries

### Optimization Recommendations

**Based on bottleneck:**

| Bottleneck | Optimization |
|------------|--------------|
| CPU | Add more workers, use hardware encoding |
| I/O | Use faster storage (SSD/NVMe) |
| Memory | Limit concurrent jobs per worker |
| Network | CDN for assets, local caching |
| Database | Connection pooling, index optimization |

## Load Test Sign-Off

**Load Test Completed**: ✅ / ❌

**Results:**
- [ ] Steady load (10 users) - PASS / FAIL
- [ ] Peak load (50 users) - PASS / FAIL
- [ ] Stress test (100 users) - PASS / FAIL

**Performance Grade**: A / B / C / D / F

**Production Ready**: YES / NO / WITH CONDITIONS

**Conditions:**
- _____________________________________
- _____________________________________

**Signed**: _______________ **Date**: ___________
