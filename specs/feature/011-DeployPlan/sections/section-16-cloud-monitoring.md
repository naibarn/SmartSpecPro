Now I'll generate the complete section content for section-16-cloud-monitoring.

---

# Section 16: Cloud Monitoring

## Overview

This section implements Google Cloud Monitoring dashboards and alert policies for infrastructure-level observability of the SmartSpecPro Cloud Run deployment. Cloud Monitoring provides metrics for Cloud Run services, Cloud Run Jobs, and Cloud Tasks queues, enabling real-time visibility into system health, performance bottlenecks, and anomalies.

## Dependencies

**Must Complete Before Starting:**
- Section 2 (Docker Images) — Cloud Run services must be deployed to generate metrics
- Section 4 (Cloud Tasks Migration) — Cloud Tasks queues must exist to monitor queue metrics

**Works in Parallel With:**
- Section 13 (Sentry) — Application-level error tracking
- Section 14 (PostHog) — Product analytics
- Section 15 (Admin Dashboard) — Business-level health monitoring

## Background Context

Cloud Monitoring (formerly Stackdriver) collects metrics automatically from GCP services. Unlike Sentry (application errors) or PostHog (user events), Cloud Monitoring focuses on infrastructure metrics: request rates, latencies, CPU/memory utilization, instance scaling, and queue backlogs.

The implementation configures two dashboards (Services and Jobs) and five alert policies that send email notifications to admin users when critical thresholds are breached.

## Test Specifications

### Infrastructure Validation Tests

Since Cloud Monitoring is infrastructure configuration, most validation is done via integration checks rather than unit tests.

**Dashboard Existence Check** (`scripts/validate-cloud-monitoring.sh`):
```bash
#!/bin/bash
# Validates Cloud Monitoring dashboards and alerts exist

gcloud monitoring dashboards list --filter="displayName:SmartSpec Services" --format="value(name)"
gcloud monitoring dashboards list --filter="displayName:SmartSpec Jobs" --format="value(name)"
gcloud alpha monitoring policies list --filter="displayName~'SmartSpec'" --format="table(displayName, enabled)"
```

Expected output: Two dashboard names and five enabled alert policies.

**Alert Notification Channel Check**:
```bash
gcloud alpha monitoring channels list --filter="type:email" --format="table(displayName, labels.email_address)"
```

Expected output: At least one email notification channel for admin alerts.

### Structured Logging Tests

**Node.js Structured Logging** (`apps/web/server/middleware/__tests__/structuredLogging.test.ts`):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createStructuredLogger } from '../structuredLogging';

describe('Structured Logging Middleware', () => {
  it('outputs valid JSON with required fields', () => {
    const logOutput: string[] = [];
    const mockLog = vi.fn((msg: string) => logOutput.push(msg));
    console.log = mockLog;

    const logger = createStructuredLogger();
    logger.info('Test message', { request_id: 'test-123', user_id: 'user-456' });

    expect(logOutput).toHaveLength(1);
    const parsed = JSON.parse(logOutput[0]);
    expect(parsed).toMatchObject({
      severity: 'INFO',
      message: 'Test message',
      request_id: 'test-123',
      user_id: 'user-456',
      release: expect.any(String),
      environment: expect.any(String),
    });
  });

  it('includes HTTP request metadata', () => {
    const logger = createStructuredLogger();
    const logOutput: string[] = [];
    console.log = vi.fn((msg: string) => logOutput.push(msg));

    logger.httpRequest({
      route: '/api/jobs',
      method: 'POST',
      status: 201,
      latency_ms: 125,
      request_id: 'req-789',
    });

    const parsed = JSON.parse(logOutput[0]);
    expect(parsed).toMatchObject({
      severity: 'INFO',
      route: '/api/jobs',
      method: 'POST',
      status: 201,
      latency_ms: 125,
      request_id: 'req-789',
    });
  });
});
```

**Python Structured Logging** (`python-backend/tests/unit/test_structured_logging.py`):

```python
import json
import pytest
from app.core.logging import get_structured_logger

def test_structured_log_output(caplog):
    """Structured logger outputs valid JSON with required fields."""
    logger = get_structured_logger(__name__)
    
    with caplog.at_level("INFO"):
        logger.info("Test message", extra={
            "request_id": "test-123",
            "job_id": "job-456",
        })
    
    assert len(caplog.records) == 1
    log_dict = json.loads(caplog.records[0].getMessage())
    
    assert log_dict["severity"] == "INFO"
    assert log_dict["message"] == "Test message"
    assert log_dict["request_id"] == "test-123"
    assert log_dict["job_id"] == "job-456"
    assert "release" in log_dict
    assert "environment" in log_dict

def test_http_request_logging(caplog):
    """HTTP requests include route, method, status, latency."""
    logger = get_structured_logger(__name__)
    
    with caplog.at_level("INFO"):
        logger.info("HTTP request", extra={
            "route": "/tasks/process-media",
            "method": "POST",
            "status": 200,
            "latency_ms": 250,
            "request_id": "req-789",
        })
    
    log_dict = json.loads(caplog.records[0].getMessage())
    assert log_dict["route"] == "/tasks/process-media"
    assert log_dict["method"] == "POST"
    assert log_dict["status"] == 200
    assert log_dict["latency_ms"] == 250
```

## Implementation Details

### 1. Cloud Monitoring Dashboards

Create two dashboards using `gcloud` commands or the Cloud Console.

#### Services Dashboard

Displays metrics for Cloud Run services (node-api and python-orchestrator).

**Metrics to Include:**

1. **Request Count by Service and Status**
   - Metric: `run.googleapis.com/request_count`
   - Group by: `service_name`, `response_code_class`
   - Chart type: Stacked area
   - Time range: Last 6 hours

2. **Request Latency (p95, p99)**
   - Metric: `run.googleapis.com/request_latencies`
   - Aggregation: 95th and 99th percentile
   - Group by: `service_name`
   - Chart type: Line chart
   - Time range: Last 6 hours

3. **Instance Count**
   - Metric: `run.googleapis.com/container/instance_count`
   - Group by: `service_name`
   - Chart type: Line chart
   - Time range: Last 6 hours

4. **CPU Utilization**
   - Metric: `run.googleapis.com/container/cpu/utilizations`
   - Aggregation: Mean
   - Group by: `service_name`
   - Chart type: Line chart
   - Time range: Last 6 hours

5. **Memory Utilization**
   - Metric: `run.googleapis.com/container/memory/utilizations`
   - Aggregation: Mean
   - Group by: `service_name`
   - Chart type: Line chart
   - Time range: Last 6 hours

6. **Cloud Tasks Queue Depth**
   - Metric: `cloudtasks.googleapis.com/queue/depth`
   - Group by: `queue_name`
   - Chart type: Line chart
   - Time range: Last 6 hours

7. **Cloud Tasks Dispatch Rate**
   - Metric: `cloudtasks.googleapis.com/queue/task_attempt_count`
   - Aggregation: Rate (per minute)
   - Group by: `queue_name`, `response_code`
   - Chart type: Stacked area
   - Time range: Last 6 hours

**Dashboard Creation Command:**

```bash
gcloud monitoring dashboards create --config-from-file=cloud-monitoring/services-dashboard.json
```

**Dashboard JSON Template** (`cloud-monitoring/services-dashboard.json`):

```json
{
  "displayName": "SmartSpec Services",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Count by Status",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.service_name", "metric.response_code_class"]
                  }
                }
              }
            }],
            "chartOptions": {
              "mode": "COLOR"
            }
          }
        }
      }
    ]
  }
}
```

#### Jobs Dashboard

Displays metrics for Cloud Run Jobs (video-job-runner short and long variants).

**Metrics to Include:**

1. **Job Execution Count by Status**
   - Metric: `run.googleapis.com/job/completed_execution_count`
   - Group by: `job_name`, `result` (succeeded/failed)
   - Chart type: Stacked bar
   - Time range: Last 24 hours

2. **Job Execution Duration**
   - Metric: `run.googleapis.com/job/execution_time`
   - Aggregation: 50th, 95th, 99th percentile
   - Group by: `job_name`
   - Chart type: Line chart
   - Time range: Last 24 hours

3. **Job Memory Peak Utilization**
   - Metric: `run.googleapis.com/container/memory/utilizations`
   - Aggregation: Max
   - Filter: `resource.type="cloud_run_job"`
   - Group by: `job_name`
   - Chart type: Line chart
   - Time range: Last 24 hours

4. **Cloud Tasks DLQ Count** (log-based metric, see below)
   - Metric: `logging.googleapis.com/user/cloud_tasks_dlq_count`
   - Group by: `queue_name`
   - Chart type: Line chart
   - Time range: Last 24 hours

**Dashboard Creation Command:**

```bash
gcloud monitoring dashboards create --config-from-file=cloud-monitoring/jobs-dashboard.json
```

### 2. Alert Policies

Create five alert policies with email notification to admin users.

#### Alert 1: High 5xx Rate

**Condition:** Cloud Run 5xx responses > 5% over 5 minutes

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="SmartSpec High 5xx Rate" \
  --condition-display-name="5xx rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s \
  --condition-filter='metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" AND metric.response_code_class="5xx"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE","crossSeriesReducer":"REDUCE_SUM","groupByFields":["resource.service_name"]}' \
  --condition-comparison=COMPARISON_GT
```

#### Alert 2: High Latency

**Condition:** Cloud Run p95 latency > 2000ms over 5 minutes

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="SmartSpec High Latency" \
  --condition-display-name="p95 latency > 2000ms" \
  --condition-threshold-value=2000 \
  --condition-threshold-duration=300s \
  --condition-filter='metric.type="run.googleapis.com/request_latencies" AND resource.type="cloud_run_revision"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_DELTA","crossSeriesReducer":"REDUCE_PERCENTILE_95","groupByFields":["resource.service_name"]}' \
  --condition-comparison=COMPARISON_GT
```

#### Alert 3: Job Failures

**Condition:** Cloud Run Job failure rate > 20% over 10 minutes

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="SmartSpec Job Failures" \
  --condition-display-name="Job failure rate > 20%" \
  --condition-threshold-value=0.20 \
  --condition-threshold-duration=600s \
  --condition-filter='metric.type="run.googleapis.com/job/completed_execution_count" AND resource.type="cloud_run_job" AND metric.result="failed"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_RATE","crossSeriesReducer":"REDUCE_SUM","groupByFields":["resource.job_name"]}' \
  --condition-comparison=COMPARISON_GT
```

#### Alert 4: Queue Backlog

**Condition:** Cloud Tasks queue depth > 100 over 10 minutes

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="SmartSpec Queue Backlog" \
  --condition-display-name="Queue depth > 100" \
  --condition-threshold-value=100 \
  --condition-threshold-duration=600s \
  --condition-filter='metric.type="cloudtasks.googleapis.com/queue/depth"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_MEAN","crossSeriesReducer":"REDUCE_SUM","groupByFields":["resource.queue_id"]}' \
  --condition-comparison=COMPARISON_GT
```

#### Alert 5: Instance Limit

**Condition:** Cloud Run instances > 80% of max over 5 minutes

**Max instances configured in Cloud Run service:** 5 for node-api, 3 for python-orchestrator. Alert threshold: 4 for node-api, 2.4 (round to 3) for python-orchestrator.

```bash
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="SmartSpec Instance Limit (Node API)" \
  --condition-display-name="Instances > 4" \
  --condition-threshold-value=4 \
  --condition-threshold-duration=300s \
  --condition-filter='metric.type="run.googleapis.com/container/instance_count" AND resource.service_name="node-api"' \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_MEAN"}' \
  --condition-comparison=COMPARISON_GT
```

Repeat for `python-orchestrator` with threshold 3.

#### Notification Channel Setup

Create an email notification channel:

```bash
gcloud alpha monitoring channels create \
  --display-name="Admin Email Alerts" \
  --type=email \
  --channel-labels=email_address=admin@smartaihub.app
```

Capture the `CHANNEL_ID` from the output and use it in the alert policy commands above.

### 3. Structured Logging Implementation

Both Node.js and Python services must output JSON-formatted logs.

#### Node.js Structured Logger

**File:** `apps/web/server/middleware/structuredLogging.ts`

```typescript
interface LogContext {
  request_id?: string;
  user_id?: string;
  job_id?: string;
  route?: string;
  method?: string;
  status?: number;
  latency_ms?: number;
  [key: string]: unknown;
}

interface StructuredLog {
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  request_id?: string;
  user_id?: string;
  job_id?: string;
  route?: string;
  method?: string;
  status?: number;
  latency_ms?: number;
  release?: string;
  environment?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export function createStructuredLogger() {
  const release = process.env.RELEASE || process.env.COMMIT_SHA || 'dev';
  const environment = process.env.ENVIRONMENT || 'development';

  function log(severity: StructuredLog['severity'], message: string, context?: LogContext) {
    const logEntry: StructuredLog = {
      severity,
      message,
      release,
      environment,
      timestamp: new Date().toISOString(),
      ...context,
    };

    // Cloud Logging reads stdout/stderr
    console.log(JSON.stringify(logEntry));
  }

  return {
    debug: (msg: string, ctx?: LogContext) => log('DEBUG', msg, ctx),
    info: (msg: string, ctx?: LogContext) => log('INFO', msg, ctx),
    warn: (msg: string, ctx?: LogContext) => log('WARNING', msg, ctx),
    error: (msg: string, ctx?: LogContext) => log('ERROR', msg, ctx),
    critical: (msg: string, ctx?: LogContext) => log('CRITICAL', msg, ctx),
    httpRequest: (ctx: LogContext & { route: string; method: string; status: number; latency_ms: number }) => {
      log('INFO', `${ctx.method} ${ctx.route} ${ctx.status}`, ctx);
    },
  };
}

// Singleton instance
export const logger = createStructuredLogger();
```

**Middleware Integration** (`apps/web/server/index.ts`):

```typescript
import { logger } from './middleware/structuredLogging';

app.use((req, res, next) => {
  const startTime = Date.now();
  const request_id = req.headers['x-request-id'] as string || generateRequestId();
  req.requestId = request_id;

  res.on('finish', () => {
    const latency_ms = Date.now() - startTime;
    logger.httpRequest({
      route: req.route?.path || req.path,
      method: req.method,
      status: res.statusCode,
      latency_ms,
      request_id,
      user_id: req.user?.id,
    });
  });

  next();
});
```

#### Python Structured Logger

**File:** `python-backend/app/core/logging.py`

```python
import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

class StructuredFormatter(logging.Formatter):
    """JSON formatter for Cloud Logging."""
    
    def __init__(self):
        super().__init__()
        self.release = os.getenv("RELEASE", os.getenv("COMMIT_SHA", "dev"))
        self.environment = os.getenv("ENVIRONMENT", "development")
    
    def format(self, record: logging.LogRecord) -> str:
        log_dict: Dict[str, Any] = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.utcnow().isoformat(),
            "release": self.release,
            "environment": self.environment,
        }
        
        # Add extra context from record
        if hasattr(record, "request_id"):
            log_dict["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_dict["user_id"] = record.user_id
        if hasattr(record, "job_id"):
            log_dict["job_id"] = record.job_id
        if hasattr(record, "route"):
            log_dict["route"] = record.route
        if hasattr(record, "method"):
            log_dict["method"] = record.method
        if hasattr(record, "status"):
            log_dict["status"] = record.status
        if hasattr(record, "latency_ms"):
            log_dict["latency_ms"] = record.latency_ms
        
        # Exception info
        if record.exc_info:
            log_dict["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_dict)

def get_structured_logger(name: str) -> logging.Logger:
    """Get a logger configured for structured logging."""
    logger = logging.getLogger(name)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(StructuredFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    
    return logger
```

**FastAPI Middleware** (`python-backend/app/main.py`):

```python
from app.core.logging import get_structured_logger
from starlette.middleware.base import BaseHTTPMiddleware
import time
import uuid

logger = get_structured_logger(__name__)

class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        request.state.request_id = request_id
        
        start_time = time.time()
        response = await call_next(request)
        latency_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"{request.method} {request.url.path} {response.status_code}",
            extra={
                "route": request.url.path,
                "method": request.method,
                "status": response.status_code,
                "latency_ms": latency_ms,
                "request_id": request_id,
            }
        )
        
        return response

app.add_middleware(StructuredLoggingMiddleware)
```

### 4. Log-Based Metrics (Optional)

For Cloud Tasks DLQ tracking, create a log-based metric from Cloud Logging console:

**Metric Name:** `cloud_tasks_dlq_count`

**Filter:**
```
resource.type="cloud_run_revision"
jsonPayload.message="Dead letter task"
jsonPayload.queue_name!=""
```

**Metric Type:** Counter

**Labels:** Extract `queue_name` from `jsonPayload.queue_name`

This metric counts the number of dead letter events logged by the Python task handlers (see Section 4 for DLQ implementation).

### 5. Environment Variable Configuration

Both services need these environment variables for logging context:

```bash
# Set in Cloud Run service deployment
ENVIRONMENT=production  # or staging
RELEASE=${COMMIT_SHA}   # Injected by CI/CD
```

## File Changes Summary (Actual Implementation)

### Files Created
- `cloud-monitoring/services-dashboard.json` — Services dashboard config (7 widgets)
- `cloud-monitoring/jobs-dashboard.json` — Jobs dashboard config (4 widgets, p50/p95/p99)
- `scripts/validate-cloud-monitoring.sh` — Dashboard/alert validation with exit codes
- `apps/web/server/middleware/structuredLogging.ts` — Node.js structured logger
- `apps/web/server/middleware/__tests__/structuredLogging.test.ts` — Logger tests (4 tests)
- `python-backend/tests/unit/test_structured_logging.py` — Python logger tests (5 tests)

### Files Modified
- `python-backend/app/core/logging.py` — Added `get_structured_logger()` alias

### Deviations from Plan
- **Python StructuredFormatter**: Not implemented as separate class; existing structlog JSONRenderer already provides Cloud Logging-compatible JSON output in production
- **Python HTTP middleware**: Not added; existing structlog middleware handles request logging
- **Node.js middleware integration** (server/index.ts): Not modified; structured logger available for opt-in use
- **CI/CD env vars** (deploy.yml): Deferred to Section 17 (CI/CD)
- **Alert policy creation**: gcloud commands documented in plan, executed during deployment

## Verification Steps

1. Deploy both Cloud Run services with structured logging middleware
2. Create dashboards via `gcloud` or Cloud Console
3. Create alert policies and notification channel
4. Trigger test traffic to services
5. Verify JSON logs appear in Cloud Logging console
6. Verify dashboards display metrics with ~2-minute lag
7. Trigger an alert condition (e.g., force 5xx errors) and verify email delivery
8. Run `scripts/validate-cloud-monitoring.sh` to check all resources exist

## Rollback Plan

If Cloud Monitoring dashboards or alerts are misconfigured:
- **Dashboards:** Delete via `gcloud monitoring dashboards delete DASHBOARD_ID` and recreate
- **Alerts:** Disable via `gcloud alpha monitoring policies update POLICY_ID --no-enabled`
- **Logging:** Structured logging is backward-compatible (Cloud Logging accepts plain text). Revert middleware changes if JSON parsing breaks.

## Next Steps

After completing this section:
- Section 15 (Admin Dashboard) can query Cloud Monitoring API for API health metrics
- Section 17 (CI/CD) will set `RELEASE` env var from commit SHA
- Section 19 (Load Testing) will use these dashboards to monitor load test impact