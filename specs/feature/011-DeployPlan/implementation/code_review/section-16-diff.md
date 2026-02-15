diff --git a/apps/web/server/middleware/__tests__/structuredLogging.test.ts b/apps/web/server/middleware/__tests__/structuredLogging.test.ts
new file mode 100644
index 0000000..e8afcfb
--- /dev/null
+++ b/apps/web/server/middleware/__tests__/structuredLogging.test.ts
@@ -0,0 +1,79 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
+import { createStructuredLogger } from '../structuredLogging';
+
+describe('Structured Logging Middleware', () => {
+  let originalLog: typeof console.log;
+  let logOutput: string[];
+
+  beforeEach(() => {
+    logOutput = [];
+    originalLog = console.log;
+    console.log = vi.fn((msg: string) => logOutput.push(msg));
+  });
+
+  afterEach(() => {
+    console.log = originalLog;
+  });
+
+  it('outputs valid JSON with required fields', () => {
+    const logger = createStructuredLogger();
+    logger.info('Test message', { request_id: 'test-123', user_id: 'user-456' });
+
+    expect(logOutput).toHaveLength(1);
+    const parsed = JSON.parse(logOutput[0]);
+    expect(parsed).toMatchObject({
+      severity: 'INFO',
+      message: 'Test message',
+      request_id: 'test-123',
+      user_id: 'user-456',
+      release: expect.any(String),
+      environment: expect.any(String),
+    });
+  });
+
+  it('includes HTTP request metadata', () => {
+    const logger = createStructuredLogger();
+    logger.httpRequest({
+      route: '/api/jobs',
+      method: 'POST',
+      status: 201,
+      latency_ms: 125,
+      request_id: 'req-789',
+    });
+
+    const parsed = JSON.parse(logOutput[0]);
+    expect(parsed).toMatchObject({
+      severity: 'INFO',
+      route: '/api/jobs',
+      method: 'POST',
+      status: 201,
+      latency_ms: 125,
+      request_id: 'req-789',
+    });
+  });
+
+  it('includes timestamp in ISO format', () => {
+    const logger = createStructuredLogger();
+    logger.info('Timestamp test');
+
+    const parsed = JSON.parse(logOutput[0]);
+    expect(parsed.timestamp).toBeDefined();
+    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
+  });
+
+  it('supports all severity levels', () => {
+    const logger = createStructuredLogger();
+    logger.debug('Debug msg');
+    logger.info('Info msg');
+    logger.warn('Warn msg');
+    logger.error('Error msg');
+    logger.critical('Critical msg');
+
+    expect(logOutput).toHaveLength(5);
+    expect(JSON.parse(logOutput[0]).severity).toBe('DEBUG');
+    expect(JSON.parse(logOutput[1]).severity).toBe('INFO');
+    expect(JSON.parse(logOutput[2]).severity).toBe('WARNING');
+    expect(JSON.parse(logOutput[3]).severity).toBe('ERROR');
+    expect(JSON.parse(logOutput[4]).severity).toBe('CRITICAL');
+  });
+});
diff --git a/apps/web/server/middleware/structuredLogging.ts b/apps/web/server/middleware/structuredLogging.ts
new file mode 100644
index 0000000..09f088c
--- /dev/null
+++ b/apps/web/server/middleware/structuredLogging.ts
@@ -0,0 +1,57 @@
+/**
+ * Structured Logging Middleware
+ *
+ * Outputs JSON-formatted logs compatible with Google Cloud Logging.
+ * Each log entry includes severity, message, release, and environment.
+ */
+
+interface LogContext {
+  request_id?: string;
+  user_id?: string;
+  job_id?: string;
+  route?: string;
+  method?: string;
+  status?: number;
+  latency_ms?: number;
+  [key: string]: unknown;
+}
+
+interface StructuredLog {
+  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
+  message: string;
+  release: string;
+  environment: string;
+  timestamp: string;
+  [key: string]: unknown;
+}
+
+export function createStructuredLogger() {
+  const release = process.env.RELEASE || process.env.COMMIT_SHA || 'dev';
+  const environment = process.env.ENVIRONMENT || 'development';
+
+  function log(severity: StructuredLog['severity'], message: string, context?: LogContext) {
+    const logEntry: StructuredLog = {
+      severity,
+      message,
+      release,
+      environment,
+      timestamp: new Date().toISOString(),
+      ...context,
+    };
+
+    console.log(JSON.stringify(logEntry));
+  }
+
+  return {
+    debug: (msg: string, ctx?: LogContext) => log('DEBUG', msg, ctx),
+    info: (msg: string, ctx?: LogContext) => log('INFO', msg, ctx),
+    warn: (msg: string, ctx?: LogContext) => log('WARNING', msg, ctx),
+    error: (msg: string, ctx?: LogContext) => log('ERROR', msg, ctx),
+    critical: (msg: string, ctx?: LogContext) => log('CRITICAL', msg, ctx),
+    httpRequest: (ctx: LogContext & { route: string; method: string; status: number; latency_ms: number }) => {
+      log('INFO', `${ctx.method} ${ctx.route} ${ctx.status}`, ctx);
+    },
+  };
+}
+
+export const logger = createStructuredLogger();
diff --git a/cloud-monitoring/jobs-dashboard.json b/cloud-monitoring/jobs-dashboard.json
new file mode 100644
index 0000000..db8631d
--- /dev/null
+++ b/cloud-monitoring/jobs-dashboard.json
@@ -0,0 +1,122 @@
+{
+  "displayName": "SmartSpec Jobs",
+  "mosaicLayout": {
+    "columns": 12,
+    "tiles": [
+      {
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Job Execution Count by Status",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"run.googleapis.com/job/completed_execution_count\" resource.type=\"cloud_run_job\"",
+                  "aggregation": {
+                    "alignmentPeriod": "300s",
+                    "perSeriesAligner": "ALIGN_SUM",
+                    "crossSeriesReducer": "REDUCE_SUM",
+                    "groupByFields": ["resource.job_name", "metric.result"]
+                  }
+                }
+              },
+              "plotType": "STACKED_BAR"
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "xPos": 6,
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Job Execution Duration (p50, p95, p99)",
+          "xyChart": {
+            "dataSets": [
+              {
+                "timeSeriesQuery": {
+                  "timeSeriesFilter": {
+                    "filter": "metric.type=\"run.googleapis.com/job/execution_time\" resource.type=\"cloud_run_job\"",
+                    "aggregation": {
+                      "alignmentPeriod": "300s",
+                      "perSeriesAligner": "ALIGN_DELTA",
+                      "crossSeriesReducer": "REDUCE_PERCENTILE_50",
+                      "groupByFields": ["resource.job_name"]
+                    }
+                  }
+                },
+                "plotType": "LINE"
+              },
+              {
+                "timeSeriesQuery": {
+                  "timeSeriesFilter": {
+                    "filter": "metric.type=\"run.googleapis.com/job/execution_time\" resource.type=\"cloud_run_job\"",
+                    "aggregation": {
+                      "alignmentPeriod": "300s",
+                      "perSeriesAligner": "ALIGN_DELTA",
+                      "crossSeriesReducer": "REDUCE_PERCENTILE_95",
+                      "groupByFields": ["resource.job_name"]
+                    }
+                  }
+                },
+                "plotType": "LINE"
+              }
+            ],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "yPos": 4,
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Job Memory Peak Utilization",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"run.googleapis.com/container/memory/utilizations\" resource.type=\"cloud_run_job\"",
+                  "aggregation": {
+                    "alignmentPeriod": "300s",
+                    "perSeriesAligner": "ALIGN_MAX",
+                    "crossSeriesReducer": "REDUCE_MAX",
+                    "groupByFields": ["resource.job_name"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "xPos": 6,
+        "yPos": 4,
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Cloud Tasks DLQ Count",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"logging.googleapis.com/user/cloud_tasks_dlq_count\"",
+                  "aggregation": {
+                    "alignmentPeriod": "300s",
+                    "perSeriesAligner": "ALIGN_SUM",
+                    "crossSeriesReducer": "REDUCE_SUM",
+                    "groupByFields": ["metric.queue_name"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      }
+    ]
+  }
+}
diff --git a/cloud-monitoring/services-dashboard.json b/cloud-monitoring/services-dashboard.json
new file mode 100644
index 0000000..7a44509
--- /dev/null
+++ b/cloud-monitoring/services-dashboard.json
@@ -0,0 +1,195 @@
+{
+  "displayName": "SmartSpec Services",
+  "mosaicLayout": {
+    "columns": 12,
+    "tiles": [
+      {
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Request Count by Status",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\"",
+                  "aggregation": {
+                    "alignmentPeriod": "60s",
+                    "perSeriesAligner": "ALIGN_RATE",
+                    "crossSeriesReducer": "REDUCE_SUM",
+                    "groupByFields": ["resource.service_name", "metric.response_code_class"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "xPos": 6,
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Request Latency (p95, p99)",
+          "xyChart": {
+            "dataSets": [
+              {
+                "timeSeriesQuery": {
+                  "timeSeriesFilter": {
+                    "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\"",
+                    "aggregation": {
+                      "alignmentPeriod": "60s",
+                      "perSeriesAligner": "ALIGN_DELTA",
+                      "crossSeriesReducer": "REDUCE_PERCENTILE_95",
+                      "groupByFields": ["resource.service_name"]
+                    }
+                  }
+                },
+                "plotType": "LINE"
+              },
+              {
+                "timeSeriesQuery": {
+                  "timeSeriesFilter": {
+                    "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\"",
+                    "aggregation": {
+                      "alignmentPeriod": "60s",
+                      "perSeriesAligner": "ALIGN_DELTA",
+                      "crossSeriesReducer": "REDUCE_PERCENTILE_99",
+                      "groupByFields": ["resource.service_name"]
+                    }
+                  }
+                },
+                "plotType": "LINE"
+              }
+            ],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "yPos": 4,
+        "width": 4,
+        "height": 4,
+        "widget": {
+          "title": "Instance Count",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\"",
+                  "aggregation": {
+                    "alignmentPeriod": "60s",
+                    "perSeriesAligner": "ALIGN_MEAN",
+                    "crossSeriesReducer": "REDUCE_SUM",
+                    "groupByFields": ["resource.service_name"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "xPos": 4,
+        "yPos": 4,
+        "width": 4,
+        "height": 4,
+        "widget": {
+          "title": "CPU Utilization",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"run.googleapis.com/container/cpu/utilizations\" resource.type=\"cloud_run_revision\"",
+                  "aggregation": {
+                    "alignmentPeriod": "60s",
+                    "perSeriesAligner": "ALIGN_MEAN",
+                    "crossSeriesReducer": "REDUCE_MEAN",
+                    "groupByFields": ["resource.service_name"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "xPos": 8,
+        "yPos": 4,
+        "width": 4,
+        "height": 4,
+        "widget": {
+          "title": "Memory Utilization",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"run.googleapis.com/container/memory/utilizations\" resource.type=\"cloud_run_revision\"",
+                  "aggregation": {
+                    "alignmentPeriod": "60s",
+                    "perSeriesAligner": "ALIGN_MEAN",
+                    "crossSeriesReducer": "REDUCE_MEAN",
+                    "groupByFields": ["resource.service_name"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "yPos": 8,
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Cloud Tasks Queue Depth",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"cloudtasks.googleapis.com/queue/depth\"",
+                  "aggregation": {
+                    "alignmentPeriod": "60s",
+                    "perSeriesAligner": "ALIGN_MEAN",
+                    "crossSeriesReducer": "REDUCE_SUM",
+                    "groupByFields": ["resource.queue_id"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      },
+      {
+        "xPos": 6,
+        "yPos": 8,
+        "width": 6,
+        "height": 4,
+        "widget": {
+          "title": "Cloud Tasks Dispatch Rate",
+          "xyChart": {
+            "dataSets": [{
+              "timeSeriesQuery": {
+                "timeSeriesFilter": {
+                  "filter": "metric.type=\"cloudtasks.googleapis.com/queue/task_attempt_count\"",
+                  "aggregation": {
+                    "alignmentPeriod": "60s",
+                    "perSeriesAligner": "ALIGN_RATE",
+                    "crossSeriesReducer": "REDUCE_SUM",
+                    "groupByFields": ["resource.queue_id", "metric.response_code"]
+                  }
+                }
+              }
+            }],
+            "chartOptions": { "mode": "COLOR" }
+          }
+        }
+      }
+    ]
+  }
+}
diff --git a/python-backend/app/core/logging.py b/python-backend/app/core/logging.py
index 8a19002..cf74bc5 100644
--- a/python-backend/app/core/logging.py
+++ b/python-backend/app/core/logging.py
@@ -51,3 +51,12 @@ def setup_logging() -> None:
 def get_logger(name: str = __name__) -> Any:
     """Get a logger instance"""
     return structlog.get_logger(name)
+
+
+def get_structured_logger(name: str = __name__) -> Any:
+    """Get a structured logger instance (alias for get_logger).
+
+    Returns a structlog logger that outputs JSON in production,
+    compatible with Google Cloud Logging severity levels.
+    """
+    return structlog.get_logger(name)
diff --git a/python-backend/tests/unit/test_structured_logging.py b/python-backend/tests/unit/test_structured_logging.py
new file mode 100644
index 0000000..032f3f2
--- /dev/null
+++ b/python-backend/tests/unit/test_structured_logging.py
@@ -0,0 +1,53 @@
+"""
+Tests for structured logging configuration.
+
+Verifies that loggers produce structured output compatible with Cloud Logging.
+"""
+
+import pytest
+from app.core.logging import get_logger, get_structured_logger
+
+
+@pytest.mark.unit
+class TestStructuredLogging:
+    def test_get_logger_returns_bound_logger(self):
+        """get_logger returns a structlog bound logger."""
+        logger = get_logger("test")
+        assert logger is not None
+        assert hasattr(logger, "info")
+        assert hasattr(logger, "error")
+        assert hasattr(logger, "warning")
+
+    def test_get_structured_logger_returns_bound_logger(self):
+        """get_structured_logger returns a structlog bound logger."""
+        logger = get_structured_logger("test")
+        assert logger is not None
+        assert hasattr(logger, "info")
+        assert hasattr(logger, "error")
+
+    def test_get_structured_logger_is_alias(self):
+        """get_structured_logger is an alias for get_logger."""
+        logger1 = get_logger("alias_test")
+        logger2 = get_structured_logger("alias_test")
+        # Both should return structlog BoundLogger instances
+        assert type(logger1).__name__ == type(logger2).__name__
+
+    def test_logger_can_bind_context(self):
+        """Logger supports binding context variables."""
+        logger = get_structured_logger("context_test")
+        bound = logger.bind(request_id="test-123", job_id="job-456")
+        assert bound is not None
+        assert hasattr(bound, "info")
+
+    def test_logger_supports_extra_kwargs(self):
+        """Logger can accept extra keyword arguments."""
+        logger = get_structured_logger("extra_test")
+        # Should not raise
+        logger.info(
+            "Test message",
+            request_id="test-123",
+            route="/api/test",
+            method="GET",
+            status=200,
+            latency_ms=42,
+        )
diff --git a/scripts/validate-cloud-monitoring.sh b/scripts/validate-cloud-monitoring.sh
new file mode 100755
index 0000000..3b7be16
--- /dev/null
+++ b/scripts/validate-cloud-monitoring.sh
@@ -0,0 +1,40 @@
+#!/bin/bash
+# Validates Cloud Monitoring dashboards and alerts exist
+# Usage: ./scripts/validate-cloud-monitoring.sh
+
+set -euo pipefail
+
+echo "=== Cloud Monitoring Validation ==="
+echo ""
+
+# Check dashboards
+echo "--- Dashboards ---"
+SERVICES_DASH=$(gcloud monitoring dashboards list --filter="displayName:SmartSpec Services" --format="value(name)" 2>/dev/null || echo "")
+JOBS_DASH=$(gcloud monitoring dashboards list --filter="displayName:SmartSpec Jobs" --format="value(name)" 2>/dev/null || echo "")
+
+if [ -n "$SERVICES_DASH" ]; then
+  echo "OK: SmartSpec Services dashboard found"
+else
+  echo "MISSING: SmartSpec Services dashboard"
+fi
+
+if [ -n "$JOBS_DASH" ]; then
+  echo "OK: SmartSpec Jobs dashboard found"
+else
+  echo "MISSING: SmartSpec Jobs dashboard"
+fi
+
+echo ""
+
+# Check alert policies
+echo "--- Alert Policies ---"
+gcloud alpha monitoring policies list --filter="displayName~'SmartSpec'" --format="table(displayName, enabled)" 2>/dev/null || echo "No alert policies found (or gcloud alpha not available)"
+
+echo ""
+
+# Check notification channels
+echo "--- Notification Channels ---"
+gcloud alpha monitoring channels list --filter="type:email" --format="table(displayName, labels.email_address)" 2>/dev/null || echo "No email channels found (or gcloud alpha not available)"
+
+echo ""
+echo "=== Validation Complete ==="
