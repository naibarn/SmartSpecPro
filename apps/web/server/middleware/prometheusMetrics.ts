import { register, collectDefaultMetrics, Histogram, Counter } from "prom-client";

/**
 * Prometheus Metrics Middleware for Funnel Analytics
 *
 * Collects request latency, error rates, cache hit rates, and request counts
 * for funnel analytics endpoints. Metrics are exposed at /metrics endpoint
 * for Prometheus scraping.
 *
 * Metrics collected:
 * - funnel_analytics_request_duration_seconds: Request latency histogram (p50, p95, p99)
 * - funnel_analytics_requests_total: Total request counter (by endpoint, status)
 * - funnel_analytics_errors_total: Error counter (by endpoint, error_code)
 * - funnel_analytics_cache_hits_total: Cache hit counter (by endpoint)
 * - funnel_analytics_cache_misses_total: Cache miss counter (by endpoint)
 *
 * Labels:
 * - endpoint: Funnel analytics endpoint name (summary, timeSeries, rawEvents, export)
 * - status_code: HTTP status code (200, 400, 500, etc.)
 * - cached: Whether the response was served from cache (true/false)
 */

// Enable default metrics (process CPU, memory, etc.)
collectDefaultMetrics({ prefix: "smartspec_" });

// ── Metrics Definitions ──

/**
 * Request duration histogram
 * Buckets cover typical API response times: 10ms to 30s
 */
export const requestDurationHistogram = new Histogram({
  name: "funnel_analytics_request_duration_seconds",
  help: "Request duration in seconds for funnel analytics endpoints",
  labelNames: ["endpoint", "status_code", "cached"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
});

/**
 * Total request counter
 */
export const requestCounter = new Counter({
  name: "funnel_analytics_requests_total",
  help: "Total number of requests to funnel analytics endpoints",
  labelNames: ["endpoint", "status_code", "cached"],
});

/**
 * Error counter
 */
export const errorCounter = new Counter({
  name: "funnel_analytics_errors_total",
  help: "Total number of errors in funnel analytics endpoints",
  labelNames: ["endpoint", "error_code"],
});

/**
 * Cache hit counter
 */
export const cacheHitCounter = new Counter({
  name: "funnel_analytics_cache_hits_total",
  help: "Total number of cache hits in funnel analytics endpoints",
  labelNames: ["endpoint"],
});

/**
 * Cache miss counter
 */
export const cacheMissCounter = new Counter({
  name: "funnel_analytics_cache_misses_total",
  help: "Total number of cache misses in funnel analytics endpoints",
  labelNames: ["endpoint"],
});

// ── Helper Functions ──

/**
 * Extract endpoint name from tRPC path
 * Examples:
 *   "funnelAnalytics.summary" -> "summary"
 *   "funnelAnalytics.timeSeries" -> "timeSeries"
 */
export function extractEndpointName(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1] ?? "unknown";
}

/**
 * Map tRPC error codes to HTTP-like status codes for metrics
 */
export function mapTRPCErrorToStatusCode(errorCode?: string): string {
  switch (errorCode) {
    case "UNAUTHORIZED":
      return "401";
    case "FORBIDDEN":
      return "403";
    case "NOT_FOUND":
      return "404";
    case "BAD_REQUEST":
    case "PARSE_ERROR":
      return "400";
    case "TIMEOUT":
      return "408";
    case "CONFLICT":
      return "409";
    case "PRECONDITION_FAILED":
      return "412";
    case "PAYLOAD_TOO_LARGE":
      return "413";
    case "TOO_MANY_REQUESTS":
      return "429";
    case "CLIENT_CLOSED_REQUEST":
      return "499";
    case "INTERNAL_SERVER_ERROR":
    default:
      return "500";
  }
}

// ── tRPC Middleware ──

/**
 * tRPC middleware for Prometheus metrics collection
 *
 * Usage in funnelAnalytics router:
 * ```typescript
 * import { createPrometheusMiddleware } from "../middleware/prometheusMetrics";
 *
 * const metricsMiddleware = createPrometheusMiddleware();
 *
 * export const funnelAnalyticsRouter = router({
 *   summary: domainAdminProcedure
 *     .use(metricsMiddleware)
 *     .input(dateRangeInput)
 *     .query(async ({ ctx, input }) => { ... }),
 * });
 * ```
 */
export function createPrometheusMiddleware() {
  return async function prometheusMiddleware(opts: {
    path: string;
    type: "query" | "mutation" | "subscription";
    next: () => Promise<any>;
  }) {
    const { path, next } = opts;
    const endpoint = extractEndpointName(path);
    const startTime = Date.now();

    let statusCode = "200";
    let errorCode = "INTERNAL_SERVER_ERROR";
    let cached = "false";

    try {
      const result = await next();

      // Detect cached responses (check if result has cached flag)
      if (typeof result === "object" && result !== null && "cached" in result) {
        cached = result.cached ? "true" : "false";

        // Track cache metrics
        if (result.cached) {
          cacheHitCounter.inc({ endpoint });
        } else {
          cacheMissCounter.inc({ endpoint });
        }
      }

      return result;
    } catch (error: any) {
      // Extract error code from tRPC error
      errorCode = error?.code ?? "INTERNAL_SERVER_ERROR";
      statusCode = mapTRPCErrorToStatusCode(errorCode);

      // Track error metrics
      errorCounter.inc({ endpoint, error_code: errorCode });

      // Re-throw to maintain normal error handling flow
      throw error;
    } finally {
      // Track request duration and count
      const durationSeconds = (Date.now() - startTime) / 1000;

      requestDurationHistogram.observe(
        { endpoint, status_code: statusCode, cached },
        durationSeconds,
      );

      requestCounter.inc({ endpoint, status_code: statusCode, cached });
    }
  };
}

// ── Express Endpoint ──

/**
 * Express handler for /metrics endpoint
 * Exposes Prometheus-formatted metrics for scraping
 *
 * Usage in server/_core/index.ts:
 * ```typescript
 * import { metricsHandler } from "./middleware/prometheusMetrics";
 * app.get("/metrics", metricsHandler);
 * ```
 */
export async function metricsHandler(_req: any, res: any) {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
}
