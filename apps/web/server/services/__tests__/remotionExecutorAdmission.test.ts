import { describe, expect, it } from "vitest";
import { WorkerSchedulerError, resolveRemotionExecutionTarget } from "../workerSchedulerService";

const now = Date.parse("2026-08-16T12:00:00.000Z");
const readyWorker = {
  id: "executor-1",
  runtimeType: "remotion_executor",
  status: "online",
  lastSeenAt: new Date(now - 10_000),
  capabilitiesJson: {
    capabilityFamilies: ["remotion-render", "chromium-render", "ffmpeg-probe"],
    claimCapability: "remotion-render-contract-2026-08-04.2",
    containers: ["mp4"],
    codecs: ["h264"],
    maxWidth: 16_384,
    maxHeight: 16_384,
    maxDurationInFrames: 2_000_000,
    maxConcurrency: 1,
    supportsChromiumRendering: true,
    supportsFfmpegProbe: true,
    supportsFfmpegPostPass: true,
    supportsFontMaterialization: true,
  },
  healthSummaryJson: {
    currentJobCount: 0,
    status: "ready",
    observedAt: "2026-08-16T11:59:50.000Z",
    checks: Object.fromEntries(["browser", "ffmpeg", "ffprobe", "fontSet", "diskFloor", "credentialStore", "manifestIntegrity", "contractCompatibility"].map((key) => [key, { status: "pass", reasonCode: null, version: null }])),
    blockingReasons: [],
  },
};

describe("Remotion executor admission", () => {
  it("selects a fresh ready idle executor for auto", () => {
    const result = resolveRemotionExecutionTarget({
      requestedTarget: "auto",
      preferredWorkerId: "executor-1",
      tenantExecutorEnabled: true,
      operatorExecutorEnabled: true,
      preferredWorker: readyWorker,
      nowMs: now,
    });
    expect(result.resolvedTarget).toBe("remotion_executor");
    expect(result.reason).toBe("auto_dedicated_ready");
  });

  it("falls back with an auditable reason when heartbeat is stale or busy", () => {
    const result = resolveRemotionExecutionTarget({
      requestedTarget: "auto",
      preferredWorkerId: "executor-1",
      tenantExecutorEnabled: true,
      operatorExecutorEnabled: true,
      preferredWorker: { ...readyWorker, lastSeenAt: new Date(now - 120_000) },
      nowMs: now,
    });
    expect(result).toMatchObject({ resolvedTarget: "desktop_worker", reason: "auto_no_eligible_executor" });
  });

  it("fails closed for an explicit executor request that is not eligible", () => {
    expect(() => resolveRemotionExecutionTarget({
      requestedTarget: "remotion_executor",
      preferredWorkerId: "executor-1",
      tenantExecutorEnabled: true,
      operatorExecutorEnabled: true,
      preferredWorker: { ...readyWorker, healthSummaryJson: { ...readyWorker.healthSummaryJson, currentJobCount: 1 } },
      nowMs: now,
    })).toThrowError(WorkerSchedulerError);
  });
});
