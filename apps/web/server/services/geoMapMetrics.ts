import { Counter, Histogram } from "prom-client";

const mapProviderRequests = new Counter({
  name: "map_provider_requests_total",
  help: "Map provider requests by bounded operation and outcome.",
  labelNames: ["provider_id", "operation", "status"],
});
const mapProviderErrors = new Counter({
  name: "map_provider_errors_total",
  help: "Map provider errors by bounded operation and error class.",
  labelNames: ["provider_id", "operation", "error_class"],
});
const mapProviderLatency = new Histogram({
  name: "map_provider_latency_seconds",
  help: "Map provider request latency in seconds.",
  labelNames: ["provider_id", "operation"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});
const mapProviderFailovers = new Counter({
  name: "map_provider_failovers_total",
  help: "Map provider failovers by bounded provider and reason class.",
  labelNames: ["from_provider", "to_provider", "reason"],
});
const googleTileSessionsCreated = new Counter({
  name: "google_tile_session_created_total",
  help: "Google Map Tiles sessions created.",
});
const googleTileSessionErrors = new Counter({
  name: "google_tile_session_error_total",
  help: "Google Map Tiles session creation errors.",
});

export function recordMapProviderRequest(input: {
  providerId: "google" | "maplibre";
  operation: "session" | "tile" | "attribution";
  status: "success" | "failure";
  durationMs: number;
  errorClass?: "timeout" | "quota" | "authentication" | "provider" | "invalid";
}): void {
  mapProviderRequests.inc({ provider_id: input.providerId, operation: input.operation, status: input.status });
  mapProviderLatency.observe({ provider_id: input.providerId, operation: input.operation }, Math.max(0, input.durationMs) / 1000);
  if (input.status === "failure") {
    mapProviderErrors.inc({ provider_id: input.providerId, operation: input.operation, error_class: input.errorClass ?? "provider" });
  }
  if (input.operation === "session") {
    if (input.status === "success") googleTileSessionsCreated.inc();
    else googleTileSessionErrors.inc();
  }
}

export function recordMapProviderFailover(reason: "provider" | "quota" | "authentication" | "timeout"): void {
  mapProviderFailovers.inc({ from_provider: "google", to_provider: "maplibre", reason });
}
