import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStartFeature186SystemSchedule,
  mockStopFeature186SystemSchedule,
  mockCleanup,
} = vi.hoisted(() => ({
  mockStartFeature186SystemSchedule: vi.fn(),
  mockStopFeature186SystemSchedule: vi.fn(),
  mockCleanup: vi.fn(),
}));

vi.mock("./feature186SystemScheduler", () => ({
  startFeature186SystemSchedule: mockStartFeature186SystemSchedule,
  stopFeature186SystemSchedule: mockStopFeature186SystemSchedule,
  utcDailyDue: (hour: number, minute: number) => (now: Date) =>
    now.getUTCHours() * 60 + now.getUTCMinutes() >= hour * 60 + minute,
}));

vi.mock("../services/workerHeartbeatRetentionService", () => ({
  cleanupWorkerHeartbeatRetention: mockCleanup,
}));

import {
  executeWorkerHeartbeatRetention,
  initializeWorkerHeartbeatRetentionJob,
  shutdownWorkerHeartbeatRetentionJob,
} from "./workerHeartbeatRetentionJob";

describe("worker heartbeat retention job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.FEATURE_186_SYSTEM_TENANT_ID = "system-tenant";
  });

  it("uses the canonical daily scheduler during hard cutover", async () => {
    await initializeWorkerHeartbeatRetentionJob();

    expect(mockStartFeature186SystemSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "worker-heartbeat-retention",
        jobType: "worker.heartbeat_retention",
        executionClass: "short",
        priority: 100,
        missedOccurrencePolicy: "coalesce",
      })
    );
  });

  it("executes retention through the bounded cleanup service", async () => {
    mockCleanup.mockResolvedValueOnce({
      deletedHeartbeats: 4,
      batches: 1,
      cutoff: "2026-08-18T00:00:00.000Z",
    });

    await expect(executeWorkerHeartbeatRetention()).resolves.toEqual({
      deletedHeartbeats: 4,
      batches: 1,
      cutoff: "2026-08-18T00:00:00.000Z",
    });
    expect(mockCleanup).toHaveBeenCalledWith();
  });

  it("stops the canonical scheduler", async () => {
    await shutdownWorkerHeartbeatRetentionJob();
    expect(mockStopFeature186SystemSchedule).toHaveBeenCalledWith(
      "worker-heartbeat-retention"
    );
  });
});
