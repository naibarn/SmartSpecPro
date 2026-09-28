/**
 * Feature 142 — section-08 §4.4/§6.7: Video Intelligence health sensor.
 *
 * Consumes the in-process rollup from `videoIntelligenceObservability.ts`
 * (dynamically imported, mirroring `sensors/queueHealth.ts`'s own
 * `await import(...)` seam so a test can mock it the same way) PLUS a
 * bounded tail of today's audit JSONL (the `errorSpike` sensor's precedent)
 * for the `recommended_model_revoked` signal, so a revocation emitted by a
 * DIFFERENT web instance still counts — the in-process rollup alone would
 * miss it. Never throws — returns status `"unknown"` instead.
 */
import fs from "node:fs";
import path from "node:path";
import type { Sensor, SensorReading } from "../types";

const AUDIT_LOG_DIR = path.resolve("logs/audit");

/** How far back a `recommended_model_revoked` audit event still counts
 *  toward the degraded threshold (spec §11 / §4.4 threshold table row 4). */
const REVOCATION_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Minimum-run floor for the schema-failure-rate threshold. Deliberate: 1
 *  failure out of 2 runs is not a 50% regression, and paging on it trains
 *  people to ignore the alert (spec §4.4). */
const MIN_RUNS_FOR_SCHEMA_FAILURE_RATE = 5;
const SCHEMA_FAILURE_RATE_THRESHOLD = 0.1;

/** Bounded tail scan (same ~1000-line cap as `errorSpike.ts`) for a
 *  `recommended_model_revoked` event within the lookback window. Never
 *  throws — a missing/unreadable log reads as "no revocation seen". */
function hasRecentRecommendedModelRevocation(nowMs: number): boolean {
  try {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const logPath = path.join(AUDIT_LOG_DIR, `audit-${today}.jsonl`);
    if (!fs.existsSync(logPath)) return false;

    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n").slice(-1000);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as {
          timestamp?: string;
          ts?: string;
          metadata?: { event?: string };
        };
        if (entry?.metadata?.event !== "recommended_model_revoked") continue;
        const tsRaw = entry.timestamp ?? entry.ts;
        const ts = tsRaw ? new Date(tsRaw).getTime() : NaN;
        if (!Number.isNaN(ts) && nowMs - ts <= REVOCATION_LOOKBACK_MS) {
          return true;
        }
      } catch {
        // Skip unparsable lines — one bad line must not fail the scan.
      }
    }
    return false;
  } catch {
    return false;
  }
}

const videoIntelligenceHealthSensor: Sensor = {
  id: "video_intelligence_health",
  name: "Video Intelligence Stages",
  defaultIntervalMs: 300_000,
  category: "system",

  async collect(): Promise<SensorReading> {
    try {
      const { getVideoIntelligenceObservabilityState } = await import(
        "../../videoIntelligenceObservability"
      );
      const state = getVideoIntelligenceObservabilityState();
      const nowMs = Date.now();

      const stuckQueuedCount = state.stuckQueuedJobIds.length;
      const schemaFailures15m = state.schemaFailuresLast15Min;
      const stageRuns15m = state.stageRunsLast15Min;
      const schemaFailureRate = stageRuns15m > 0 ? schemaFailures15m / stageRuns15m : 0;
      const revokedRecently = hasRecentRecommendedModelRevocation(nowMs);
      const revocations24h = revokedRecently ? 1 : 0;

      let status: SensorReading["status"] = "healthy";
      let message = "Video Intelligence stages are healthy";

      if (state.queueRegistered === false && state.registrationCheckFired === true) {
        // G1 regression: the queue/worker never registered — every stage
        // strands at `queued` forever.
        status = "critical";
        message =
          "Video Intelligence queue/worker never registered — every stage will strand at queued";
      } else if (stuckQueuedCount > 0) {
        status = "critical";
        message = `${stuckQueuedCount} Video Intelligence job(s) stuck in queued past the orphan TTL`;
      } else if (
        stageRuns15m >= MIN_RUNS_FOR_SCHEMA_FAILURE_RATE &&
        schemaFailureRate > SCHEMA_FAILURE_RATE_THRESHOLD
      ) {
        status = "degraded";
        message = `Schema-failure rate ${(schemaFailureRate * 100).toFixed(1)}% over ${stageRuns15m} runs`;
      } else if (revokedRecently) {
        status = "degraded";
        message = "A recommended model was revoked in the last 24 hours";
      }

      return {
        sensorId: "video_intelligence_health",
        timestamp: new Date(),
        status,
        metrics: {
          queueRegistered: state.queueRegistered ? 1 : 0,
          stuckQueuedCount,
          schemaFailures15m,
          stageRuns15m,
          schemaFailureRate: Math.round(schemaFailureRate * 1000) / 1000,
          revocations24h,
        },
        message,
      };
    } catch (err) {
      return {
        sensorId: "video_intelligence_health",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Video Intelligence health check failed",
      };
    }
  },
};

export default videoIntelligenceHealthSensor;
