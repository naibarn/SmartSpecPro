import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../_core/rateLimitedProcedure", () => ({
  createRateLimitMiddleware: () => (_opts: unknown) => _opts,
}));

const { mockResolveTenantIdVarchar } = vi.hoisted(() => ({
  mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

const {
  mockGetRoom,
  mockMapRoomTypeToExecutionMode,
  mockStartRun,
} = vi.hoisted(() => ({
  mockGetRoom: vi.fn(),
  mockMapRoomTypeToExecutionMode: vi.fn(),
  mockStartRun: vi.fn(),
}));

vi.mock("../../services/roomService", () => ({
  getRoom: mockGetRoom,
  mapRoomTypeToExecutionMode: mockMapRoomTypeToExecutionMode,
}));

vi.mock("../../services/runEngine", () => ({
  startRun: mockStartRun,
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  chooseExplorationCandidate: vi.fn(),
  rejectExplorationCandidates: vi.fn(),
  approveFinalReview: vi.fn(),
  rejectFinalReview: vi.fn(),
  advanceRun: vi.fn(),
  stopRun: vi.fn(),
  getRun: vi.fn(),
}));

import { teamRunRouter } from "../teamRun";

describe("teamRunRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRoom.mockResolvedValue({
      id: "room-1",
      tenantId: "tenant-1",
      roomType: "auto_team",
    });
    mockMapRoomTypeToExecutionMode.mockReturnValue("auto_team");
    mockStartRun.mockResolvedValue({ id: "run-1", status: "running" });
  });

  it("normalizes auto_team stop policy so automation keeps running until completion gates are reached", async () => {
    await teamRunRouter.start({
      input: {
        roomId: "room-1",
        executionMode: "auto_team",
        objective: "Create a Songkran video",
        stopPolicy: {
          maxRounds: 20,
          maxDurationMinutes: 30,
          maxBudgetCredits: 500,
          stopOnConsensus: true,
          stopOnArtifactReady: true,
          stopOnLeadSummary: true,
          requireFinalSummary: false,
          idleTimeoutSeconds: 120,
        },
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockStartRun).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: "auto_team",
        stopPolicy: expect.objectContaining({
          stopOnConsensus: false,
          stopOnArtifactReady: false,
          stopOnLeadSummary: false,
          requireFinalSummary: true,
          idleTimeoutSeconds: 600,
        }),
      }),
    );
  });
});
