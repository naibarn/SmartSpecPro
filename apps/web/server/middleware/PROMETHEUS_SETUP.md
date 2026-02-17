# Prometheus Metrics Setup for Funnel Analytics

This guide shows how to integrate Prometheus metrics collection into the Funnel Analytics endpoints.

## 1. Install prom-client dependency

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm add prom-client
```

## 2. Add metrics middleware to funnelAnalytics router

Edit `/home/dev/projects/SmartSpecPro/apps/web/server/routers/funnelAnalytics.ts`:

### Add import at the top:

```typescript
import { createPrometheusMiddleware } from "../middleware/prometheusMetrics";
```

### Create middleware instance after imports:

```typescript
// ── Prometheus Metrics Middleware ──
const metricsMiddleware = createPrometheusMiddleware();
```

### Apply middleware to each endpoint:

**Before:**
```typescript
export const funnelAnalyticsRouter = router({
  summary: domainAdminProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      // ...
    }),
```

**After:**
```typescript
export const funnelAnalyticsRouter = router({
  summary: domainAdminProcedure
    .use(metricsMiddleware)
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      // ...
    }),
```

Apply `.use(metricsMiddleware)` to all 5 endpoints:
- `summary`
- `timeSeries`
- `rawEvents`
- `export`
- `invalidateCache`

## 3. Expose /metrics endpoint in Express

Edit `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`:

### Add import:

```typescript
import { metricsHandler } from "../middleware/prometheusMetrics";
```

### Add endpoint AFTER health checks (around line 165):

```typescript
// ============================================================================
// PROMETHEUS METRICS ENDPOINT (before auth middleware)
// ============================================================================

/**
 * GET /metrics - Prometheus metrics endpoint
 * Exposes metrics in Prometheus text format for scraping
 * Includes funnel analytics request metrics + default Node.js metrics
 */
app.get("/metrics", metricsHandler);
```

## 4. Verify installation

### Start the dev server:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm dev
```

### Check metrics endpoint:

```bash
curl http://localhost:3000/metrics
```

You should see Prometheus metrics output including:
- `funnel_analytics_request_duration_seconds`
- `funnel_analytics_requests_total`
- `funnel_analytics_errors_total`
- `funnel_analytics_cache_hits_total`
- `funnel_analytics_cache_misses_total`
- `smartspec_process_cpu_*` (default metrics)
- `smartspec_nodejs_heap_*` (default metrics)

### Trigger some metrics by making requests:

```bash
# Make a funnel analytics request (requires authentication)
curl -X POST http://localhost:3000/api/trpc/funnelAnalytics.summary \
  -H "Content-Type: application/json" \
  -H "Cookie: smartspec-session=..." \
  -d '{"from":"2026-02-01","to":"2026-02-17"}'

# Check metrics again to see incremented counters
curl http://localhost:3000/metrics | grep funnel_analytics
```

## 5. Grafana Dashboard Setup

### Add Prometheus data source in Grafana:

1. Go to Configuration → Data Sources
2. Add Prometheus data source
3. URL: `http://localhost:9090` (or your Prometheus server URL)

### Import dashboard or create panels with these queries:

#### Request Latency (p95, p99):

```promql
# p95 latency by endpoint
histogram_quantile(0.95, sum(rate(funnel_analytics_request_duration_seconds_bucket[5m])) by (le, endpoint))

# p99 latency by endpoint
histogram_quantile(0.99, sum(rate(funnel_analytics_request_duration_seconds_bucket[5m])) by (le, endpoint))
```

#### Request Rate:

```promql
# Requests per second by endpoint
rate(funnel_analytics_requests_total[5m])

# Requests per second by status code
sum(rate(funnel_analytics_requests_total[5m])) by (status_code)
```

#### Error Rate:

```promql
# Error rate (errors per second)
rate(funnel_analytics_errors_total[5m])

# Error rate percentage (errors / total requests)
sum(rate(funnel_analytics_errors_total[5m])) / sum(rate(funnel_analytics_requests_total[5m])) * 100
```

#### Cache Hit Rate:

```promql
# Cache hit rate percentage
sum(rate(funnel_analytics_cache_hits_total[5m])) /
(sum(rate(funnel_analytics_cache_hits_total[5m])) + sum(rate(funnel_analytics_cache_misses_total[5m]))) * 100

# Cache hits per second by endpoint
rate(funnel_analytics_cache_hits_total[5m])
```

### Recommended dashboard panels:

1. **Request Latency (Graph)**: p50, p95, p99 over time by endpoint
2. **Request Rate (Graph)**: Requests/sec over time by endpoint
3. **Error Rate (Graph)**: Error rate % over time
4. **Cache Hit Rate (Gauge)**: Current cache hit % (last 5m)
5. **Status Code Distribution (Pie)**: Breakdown of status codes
6. **Top Errors (Table)**: Most frequent error codes with counts

## 6. Alerting Rules (optional)

### High latency alert:

```yaml
- alert: FunnelAnalyticsHighLatency
  expr: histogram_quantile(0.95, sum(rate(funnel_analytics_request_duration_seconds_bucket[5m])) by (le, endpoint)) > 5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Funnel analytics p95 latency above 5s"
    description: "{{ $labels.endpoint }} p95 latency is {{ $value }}s"
```

### High error rate alert:

```yaml
- alert: FunnelAnalyticsHighErrorRate
  expr: sum(rate(funnel_analytics_errors_total[5m])) / sum(rate(funnel_analytics_requests_total[5m])) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Funnel analytics error rate above 5%"
    description: "Error rate is {{ $value | humanizePercentage }}"
```

### Low cache hit rate alert:

```yaml
- alert: FunnelAnalyticsLowCacheHitRate
  expr: sum(rate(funnel_analytics_cache_hits_total[5m])) / (sum(rate(funnel_analytics_cache_hits_total[5m])) + sum(rate(funnel_analytics_cache_misses_total[5m]))) < 0.5
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Funnel analytics cache hit rate below 50%"
    description: "Cache hit rate is {{ $value | humanizePercentage }}"
```

## 7. Prometheus scrape configuration

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'smartspec-web'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

## Architecture Notes

### Metrics Collection Flow:

```
User Request
    ↓
Express Server
    ↓
tRPC Router (funnelAnalytics)
    ↓
metricsMiddleware (start timer, track request)
    ↓
Procedure Handler (business logic)
    ↓
metricsMiddleware (record duration, update counters)
    ↓
Response to User

Prometheus scrapes /metrics endpoint every 15s
```

### Metric Labels:

- **endpoint**: Name of the funnel analytics endpoint (summary, timeSeries, etc.)
- **status_code**: HTTP-like status code (200, 400, 401, 403, 500, etc.)
- **cached**: Whether the response was served from cache (true/false)
- **error_code**: tRPC error code (UNAUTHORIZED, FORBIDDEN, etc.)

### Cache Detection:

The middleware automatically detects cached responses by checking if the result object has a `cached` boolean property. The existing funnelAnalytics endpoints already return `{ ..., cached: true/false }`, so no code changes are needed.

### Performance Impact:

Prometheus metrics collection has minimal overhead:
- Counter increment: ~1-2μs
- Histogram observation: ~5-10μs
- Total per-request overhead: <20μs

This is negligible compared to typical request processing time (50-500ms for analytics queries).

## Troubleshooting

### Metrics not appearing:

1. Check prom-client is installed: `pnpm list prom-client`
2. Verify /metrics endpoint returns data: `curl localhost:3000/metrics`
3. Check Express server logs for errors
4. Ensure middleware is applied to all endpoints

### Cache metrics always 0:

1. Verify Redis is running: `docker ps | grep redis`
2. Check if cache is enabled (not in bypassCache mode)
3. Make multiple identical requests to trigger cache hits
4. Check audit logs to confirm cache behavior: `grep '"cached":true' apps/web/logs/audit/audit-*.jsonl`

### Metrics endpoint returns 404:

1. Check that metricsHandler is imported in index.ts
2. Verify `app.get("/metrics", metricsHandler)` is added
3. Restart the dev server: `pnpm dev`
