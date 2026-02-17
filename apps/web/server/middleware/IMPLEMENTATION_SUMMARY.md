# Prometheus Metrics Implementation Summary

## Overview

Complete Prometheus metrics collection middleware for Funnel Analytics endpoints. This implementation provides automated metrics collection with minimal performance overhead (<20μs per request).

## Files Created

| File | Purpose |
|------|---------|
| `prometheusMetrics.ts` | Core metrics middleware and Express handler |
| `PROMETHEUS_SETUP.md` | Complete setup guide with Grafana queries |
| `FUNNEL_ANALYTICS_METRICS_PATCH.md` | Exact code changes for funnelAnalytics router |
| `INDEX_METRICS_PATCH.md` | Exact code changes for server entry point |
| `grafana-dashboard-funnel-analytics.json` | Pre-built Grafana dashboard (import-ready) |
| `IMPLEMENTATION_SUMMARY.md` | This file |

## Quick Start

### 1. Install dependency

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm add prom-client
```

### 2. Apply code changes

**File: server/routers/funnelAnalytics.ts**

Add at the top (after imports):
```typescript
import { createPrometheusMiddleware } from "../middleware/prometheusMetrics";

const metricsMiddleware = createPrometheusMiddleware();
```

Apply `.use(metricsMiddleware)` to all 5 endpoints:
```typescript
export const funnelAnalyticsRouter = router({
  summary: domainAdminProcedure
    .use(metricsMiddleware)  // ← Add this line
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => { ... }),

  timeSeries: domainAdminProcedure
    .use(metricsMiddleware)  // ← Add this line
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => { ... }),

  rawEvents: rateLimitedDomainAdminProcedure
    .use(metricsMiddleware)  // ← Add this line
    .input(rawEventsInput)
    .query(async ({ ctx, input }) => { ... }),

  export: rateLimitedDomainAdminProcedure
    .use(metricsMiddleware)  // ← Add this line
    .input(exportInput)
    .query(async ({ ctx, input }) => { ... }),

  invalidateCache: domainAdminProcedure
    .use(metricsMiddleware)  // ← Add this line
    .mutation(async ({ ctx }) => { ... }),
});
```

**File: server/_core/index.ts**

Add import (with other service imports):
```typescript
import { metricsHandler } from "../middleware/prometheusMetrics";
```

Add endpoint (after /readyz, before other routes):
```typescript
/**
 * GET /metrics - Prometheus metrics endpoint
 * Exposes metrics in Prometheus text format for scraping
 */
app.get("/metrics", metricsHandler);
```

### 3. Verify installation

```bash
# Build and start
pnpm check
pnpm dev

# Check metrics endpoint
curl http://localhost:3000/metrics

# Expected output includes:
# funnel_analytics_request_duration_seconds
# funnel_analytics_requests_total
# funnel_analytics_errors_total
# funnel_analytics_cache_hits_total
# funnel_analytics_cache_misses_total
```

## Metrics Collected

### Request Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `funnel_analytics_request_duration_seconds` | Histogram | Request latency (p50, p95, p99) | endpoint, status_code, cached |
| `funnel_analytics_requests_total` | Counter | Total request count | endpoint, status_code, cached |
| `funnel_analytics_errors_total` | Counter | Error count | endpoint, error_code |

### Cache Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `funnel_analytics_cache_hits_total` | Counter | Cache hit count | endpoint |
| `funnel_analytics_cache_misses_total` | Counter | Cache miss count | endpoint |

### System Metrics (default from prom-client)

| Metric | Type | Description |
|--------|------|-------------|
| `smartspec_process_cpu_user_seconds_total` | Counter | CPU usage (user) |
| `smartspec_process_cpu_system_seconds_total` | Counter | CPU usage (system) |
| `smartspec_nodejs_heap_size_used_bytes` | Gauge | Heap memory used |
| `smartspec_nodejs_heap_size_total_bytes` | Gauge | Total heap size |
| `smartspec_nodejs_eventloop_lag_seconds` | Gauge | Event loop lag |

## Grafana Dashboard Setup

### Import pre-built dashboard:

1. Open Grafana → Dashboards → Import
2. Upload `grafana-dashboard-funnel-analytics.json`
3. Select Prometheus data source
4. Click Import

### Dashboard includes:

- Request latency graph (p50, p95, p99)
- Request rate by endpoint
- Error rate percentage
- Cache hit rate gauge
- Status code distribution pie chart
- Error breakdown table
- Endpoint performance comparison
- Node.js process metrics

## Key PromQL Queries

### Request Latency (p95):
```promql
histogram_quantile(0.95,
  sum(rate(funnel_analytics_request_duration_seconds_bucket[5m]))
  by (le, endpoint)
)
```

### Error Rate (%):
```promql
sum(rate(funnel_analytics_errors_total[5m])) /
sum(rate(funnel_analytics_requests_total[5m])) * 100
```

### Cache Hit Rate (%):
```promql
sum(rate(funnel_analytics_cache_hits_total[5m])) /
(
  sum(rate(funnel_analytics_cache_hits_total[5m])) +
  sum(rate(funnel_analytics_cache_misses_total[5m]))
) * 100
```

### Request Rate (req/sec):
```promql
rate(funnel_analytics_requests_total[5m])
```

## Alerting Rules

### High Latency (p95 > 5s for 5 minutes):
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

### High Error Rate (>5% for 5 minutes):
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

### Low Cache Hit Rate (<50% for 10 minutes):
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

## Prometheus Configuration

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'smartspec-web'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['localhost:3000']
        labels:
          environment: 'production'
          service: 'smartspec-web'
```

## Security Considerations

The `/metrics` endpoint is public by default. In production, restrict access:

### Option 1: Nginx IP whitelist (recommended)
```nginx
location /metrics {
    allow 10.0.0.0/8;      # Internal network
    allow 172.16.0.0/12;   # Docker network
    deny all;
    proxy_pass http://localhost:3000;
}
```

### Option 2: Firewall rules
```bash
# UFW example
sudo ufw allow from 10.0.0.0/8 to any port 3000 proto tcp comment "Prometheus scraper"
```

### Option 3: VPN/Private network
Only expose the metrics endpoint on internal network interface.

## Performance Impact

Metrics collection overhead per request:
- Counter increment: ~1-2μs
- Histogram observation: ~5-10μs
- Total overhead: <20μs

For context:
- Typical funnel analytics query: 50-500ms
- Metrics overhead: 0.002-0.04% of request time
- Negligible impact on user experience

## Troubleshooting

### Metrics endpoint returns 404
- Verify `metricsHandler` import in `index.ts`
- Check `app.get("/metrics", metricsHandler)` is added
- Restart server: `pnpm dev`

### No metrics data appearing
- Verify prom-client installed: `pnpm list prom-client`
- Check middleware is applied to endpoints
- Make test requests to generate metrics
- Verify Prometheus scrape config

### Cache metrics always 0
- Check Redis is running: `docker ps | grep redis`
- Verify cache is not bypassed (bypassCache=false)
- Make multiple identical requests to trigger cache
- Check audit logs: `grep '"cached":true' apps/web/logs/audit/*.jsonl`

### High memory usage
- Check histogram bucket count (currently 9 buckets)
- Verify no metric label cardinality explosion
- Monitor: `smartspec_nodejs_heap_size_used_bytes`

## Architecture

```
User Request
    ↓
Express Server (:3000)
    ↓
tRPC Router (funnelAnalytics)
    ↓
metricsMiddleware (start timer)
    ↓
Procedure Handler (business logic)
    ↓ (returns { data, cached: true/false })
    ↓
metricsMiddleware (record metrics)
    ↓
Response to User

Prometheus scrapes /metrics every 15s
    ↓
Metrics stored in Prometheus TSDB
    ↓
Grafana queries Prometheus for dashboard
```

## Label Cardinality

Current label cardinality (max combinations):

| Metric | Labels | Cardinality | Safe? |
|--------|--------|-------------|-------|
| request_duration_seconds | endpoint (5) × status_code (8) × cached (2) | 80 | ✅ Safe |
| requests_total | endpoint (5) × status_code (8) × cached (2) | 80 | ✅ Safe |
| errors_total | endpoint (5) × error_code (10) | 50 | ✅ Safe |
| cache_hits_total | endpoint (5) | 5 | ✅ Safe |
| cache_misses_total | endpoint (5) | 5 | ✅ Safe |

**Total time series: ~220** (well within Prometheus limits)

## Next Steps

1. **Install and verify**: Follow Quick Start section
2. **Set up Prometheus**: Configure scraping from /metrics endpoint
3. **Import dashboard**: Load Grafana dashboard JSON
4. **Configure alerts**: Add alerting rules to Prometheus
5. **Monitor metrics**: Observe p95 latency, error rate, cache hit rate
6. **Tune cache**: Adjust TTL based on cache hit rate metrics
7. **Scale**: Use metrics to identify bottlenecks and scale accordingly

## References

- [prom-client documentation](https://github.com/siimon/prom-client)
- [Prometheus best practices](https://prometheus.io/docs/practices/naming/)
- [Grafana dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [PromQL guide](https://prometheus.io/docs/prometheus/latest/querying/basics/)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review audit logs: `apps/web/logs/audit/audit-*.jsonl`
3. Check Prometheus targets: `http://prometheus:9090/targets`
4. Verify metrics format: `curl localhost:3000/metrics`
