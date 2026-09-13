import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetStatus, mockRunDoctor, mockShouldInvokeSafeRepair, mockReport } = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
  mockRunDoctor: vi.fn(),
  mockShouldInvokeSafeRepair: vi.fn().mockReturnValue(false),
  mockReport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/celeryMediaDoctorService", () => ({
  getCeleryMediaDoctorStatus: mockGetStatus,
  runCeleryMediaDoctor: mockRunDoctor,
  shouldInvokeSafeRepair: mockShouldInvokeSafeRepair,
}));
vi.mock("../../services/systemAutoReportService", () => ({ reportSystemFailure: mockReport }));

import { runCeleryMediaDoctorMonitorOnce } from "../celeryMediaDoctorJob";

const healthyWorkers = {
  media: { status: "running", duplicate: false },
  beat: { status: "running", duplicate: false },
};

function status(overrides: Record<string, unknown> = {}) {
  return {
    overallStatus: "healthy",
    workers: healthyWorkers,
    queue: {
      redisMediaDepth: 0,
      pendingCount: 7,
      processingCount: 3,
      claimedPendingCount: 0,
      unclaimedPendingCount: 7,
      inFlightCount: 3,
      stalePendingCount: 0,
    },
    users: [],
    repair: { available: false, reason: null },
    ...overrides,
  } as any;
}

describe("celeryMediaDoctorJob monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldInvokeSafeRepair.mockReturnValue(false);
  });

  it("does not report a normal backlog when the user's three slots are occupied", async () => {
    mockGetStatus.mockResolvedValue(status());

    await runCeleryMediaDoctorMonitorOnce();

    expect(mockReport).not.toHaveBeenCalled();
  });

  it("reports only dispatchable stale work with affected users and tasks", async () => {
    mockGetStatus.mockResolvedValue(status({
      overallStatus: "degraded",
      queue: {
        redisMediaDepth: 0,
        pendingCount: 1,
        processingCount: 2,
        claimedPendingCount: 0,
        unclaimedPendingCount: 1,
        inFlightCount: 2,
        stalePendingCount: 1,
      },
      users: [{ userId: 24, stalePendingCount: 1, staleTaskIds: ["task-1"] }],
    }));

    await runCeleryMediaDoctorMonitorOnce();

    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({
      priority: "critical",
      affectedUserIds: [24],
      affectedTaskIds: ["task-1"],
      extra: expect.objectContaining({
        stalePendingCount: 1,
        affectedUserCount: 1,
        affectedTaskCount: 1,
      }),
    }));
  });
});
