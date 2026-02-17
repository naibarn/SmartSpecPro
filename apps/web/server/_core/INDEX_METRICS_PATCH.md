# Exact Code Changes for server/_core/index.ts

## File: /home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts

### 1. Add import (after line 50, with other service imports):

```typescript
import { metricsHandler } from "../middleware/prometheusMetrics";
```

### 2. Add /metrics endpoint (after /readyz endpoint, around line 165-180):

Insert this block after the `/readyz` endpoint definition:

```typescript
// ============================================================================
// PROMETHEUS METRICS ENDPOINT (before auth middleware)
// ============================================================================

/**
 * GET /metrics - Prometheus metrics endpoint
 * Exposes metrics in Prometheus text format for scraping
 * Includes:
 * - Funnel analytics request metrics (duration, count, errors, cache)
 * - Default Node.js metrics (CPU, memory, event loop, etc.)
 *
 * No authentication required (should be restricted by firewall in production)
 * Format: Prometheus text exposition format
 */
app.get("/metrics", metricsHandler);
```

---

## Complete Diff View

```diff
 import { getUploadStaticHeaders } from "../services/uploadContentSafety";
 import { ImageProxySafetyError, proxyImageFromUrl } from "../services/imageProxySafety";
 import { getDb } from "../db";
 import { getRedisClient } from "../services/redis";
 import { sql } from "drizzle-orm";
 import { COOKIE_NAME } from "@shared/const";
+import { metricsHandler } from "../middleware/prometheusMetrics";

 /** Shared database adapter (implements @smartspec/db DbAdapter) */
 export const dbAdapter = new PostgresAdapter();

 // ... (health check endpoints)

 /**
  * GET /readyz - Readiness probe
  * Performs shallow checks of DB and Redis connections
  * Returns 200 if ready to serve traffic, 503 if not ready
  */
 app.get("/readyz", async (_req, res) => {
   // ... readiness check implementation ...
 });

+// ============================================================================
+// PROMETHEUS METRICS ENDPOINT (before auth middleware)
+// ============================================================================
+
+/**
+ * GET /metrics - Prometheus metrics endpoint
+ * Exposes metrics in Prometheus text format for scraping
+ * Includes:
+ * - Funnel analytics request metrics (duration, count, errors, cache)
+ * - Default Node.js metrics (CPU, memory, event loop, etc.)
+ *
+ * No authentication required (should be restricted by firewall in production)
+ * Format: Prometheus text exposition format
+ */
+app.get("/metrics", metricsHandler);
+
 // Continue with rest of middleware and routes...
```

---

## Placement Notes

The `/metrics` endpoint is placed:

1. **AFTER health checks** (`/healthz`, `/readyz`) - Health checks come first for container orchestration
2. **BEFORE auth middleware** - Prometheus scraper doesn't authenticate, metrics endpoint should be public (or restricted by firewall)
3. **BEFORE tRPC and other route handlers** - Ensures metrics endpoint is registered early and not interfered with by other middleware

---

## Security Considerations

### Production Deployment:

In production, the `/metrics` endpoint should be restricted to Prometheus scraper only:

**Option 1: Firewall rule (recommended)**
```nginx
# nginx.conf
location /metrics {
    allow 10.0.0.0/8;      # Internal network
    allow 172.16.0.0/12;   # Docker network
    deny all;
    proxy_pass http://localhost:3000;
}
```

**Option 2: IP whitelist in Express** (if nginx not available)
```typescript
app.get("/metrics", (req, res, next) => {
  const allowedIPs = ["127.0.0.1", "::1", "10.0.0.0/8"];
  const clientIP = req.ip;

  if (!allowedIPs.some(ip => clientIP.startsWith(ip))) {
    return res.status(403).send("Forbidden");
  }

  metricsHandler(req, res, next);
});
```

**Option 3: Basic auth** (if exposing to external Prometheus)
```typescript
import basicAuth from "express-basic-auth";

app.get("/metrics",
  basicAuth({ users: { 'prometheus': process.env.METRICS_PASSWORD || 'changeme' } }),
  metricsHandler
);
```

---

## Verification

After applying this change:

1. Start server: `pnpm dev`
2. Check metrics endpoint: `curl http://localhost:3000/metrics`
3. Expected output should include:
   ```
   # HELP funnel_analytics_request_duration_seconds Request duration in seconds for funnel analytics endpoints
   # TYPE funnel_analytics_request_duration_seconds histogram

   # HELP funnel_analytics_requests_total Total number of requests to funnel analytics endpoints
   # TYPE funnel_analytics_requests_total counter

   # HELP smartspec_process_cpu_user_seconds_total Total user CPU time spent in seconds.
   # TYPE smartspec_process_cpu_user_seconds_total counter

   # ... (more metrics)
   ```

4. Make a funnel analytics request to generate metrics
5. Check metrics again to see incremented values
