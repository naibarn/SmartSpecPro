/**
 * Feature 142 — section-08 §5.7. Mirrors `sensors/queueHealth.test.ts`: mock
 * the dynamically-imported observability module, assert on the returned
 * `SensorReading`. `node:fs` is auto-mocked (mirrors `errorSpike.test.ts`)
 * for the audit-tail revocation scan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

vi.mock("node:fs");

vi.mock("../../../videoIntelligenceObservability", () => ({
  getVideoIntelligenceObservabilityState: vi.fn(),
}));

import videoIntelligenceHealthSensor from "../../sensors/videoIntelligenceHealth";

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    queueRegistered: true,
    registeredAt: "2026-01-01T00:00:00.000Z",
    registrationCheckFired: true,
    stuckQueuedJobIds: [] as string[],
    lastSweepAt: "2026-01-01T00:00:00.000Z",
    schemaFailuresLast15Min: 0,
    stageRunsLast15Min: 0,
    lastRevokedModelId: null,
    lastRevokedAt: null,
    ...overrides,
  };
}

describe("VideoIntelligenceHealthSensor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(false);
  });

  it("reports critical when the queue is unregistered after the self-check", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(
      baseState({ queueRegistered: false, registrationCheckFired: true }),
    );

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("critical");
    expect(reading.sensorId).toBe("video_intelligence_health");
  });

  it("does not report critical when unregistered but the self-check has not fired yet", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(
      baseState({ queueRegistered: false, registrationCheckFired: false }),
    );

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("healthy");
  });

  it("reports critical when any job is stuck in queued", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(
      baseState({ stuckQueuedJobIds: ["job-1"] }),
    );

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("critical");
    expect(reading.metrics.stuckQueuedCount).toBe(1);
  });

  it("reports degraded above a 10% schema-failure rate", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(
      baseState({ schemaFailuresLast15Min: 3, stageRunsLast15Min: 10 }),
    );

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("degraded");
  });

  it("does NOT report degraded below the minimum-run floor", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    // 1-of-2 is a 50% rate but well below the minimum-run floor (5).
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(
      baseState({ schemaFailuresLast15Min: 1, stageRunsLast15Min: 2 }),
    );

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("healthy");
  });

  it("reports degraded after a recommended-model revocation within 24h", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(baseState());

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        timestamp: new Date(Date.now() - 60_000).toISOString(),
        eventType: "video_project_stage",
        metadata: { event: "recommended_model_revoked" },
      }),
    );

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("degraded");
    expect(reading.metrics.revocations24h).toBe(1);
  });

  it("does not count a revocation older than 24h", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(baseState());

    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        eventType: "video_project_stage",
        metadata: { event: "recommended_model_revoked" },
      }),
    );

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("healthy");
    expect(reading.metrics.revocations24h).toBe(0);
  });

  it("reports healthy on a clean rollup", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(baseState());

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("healthy");
  });

  it("returns status 'unknown' instead of throwing when the rollup module fails", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockImplementation(() => {
      throw new Error("rollup exploded");
    });

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(reading.status).toBe("unknown");
  });

  it("exposes stable metric keys the dashboard can query", async () => {
    const { getVideoIntelligenceObservabilityState } = await import(
      "../../../videoIntelligenceObservability"
    );
    (getVideoIntelligenceObservabilityState as any).mockReturnValue(baseState());

    const reading = await videoIntelligenceHealthSensor.collect();

    expect(Object.keys(reading.metrics).sort()).toEqual(
      [
        "queueRegistered",
        "stuckQueuedCount",
        "schemaFailures15m",
        "stageRuns15m",
        "schemaFailureRate",
        "revocations24h",
      ].sort(),
    );
  });
});
