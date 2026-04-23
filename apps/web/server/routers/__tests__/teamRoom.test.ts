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
    adminProcedure: createProcedure(),
    domainAdminProcedure: createProcedure(),
  };
});

const { mockResolveTenantIdVarchar } = vi.hoisted(() => ({
  mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

const {
  mockCreateRoom,
  mockGetRoom,
  mockGetViewerState,
  mockSendMessage,
  mockMarkRoomViewed,
  mockListRoomsByTeam,
  mockGetMessages,
  mockHasRoomParticipantAccess,
  mockCaptureUserMemoryFromTeamMessage,
  mockGetContextEngineHealth,
  mockGetAutoTeamLedgerSnapshot,
} = vi.hoisted(() => ({
  mockCreateRoom: vi.fn(),
  mockGetRoom: vi.fn(),
  mockGetViewerState: vi.fn(),
  mockSendMessage: vi.fn(),
  mockMarkRoomViewed: vi.fn(),
  mockListRoomsByTeam: vi.fn(),
  mockGetMessages: vi.fn(),
  mockHasRoomParticipantAccess: vi.fn(),
  mockCaptureUserMemoryFromTeamMessage: vi.fn(),
  mockGetContextEngineHealth: vi.fn(),
  mockGetAutoTeamLedgerSnapshot: vi.fn(),
}));

vi.mock("../../services/roomService", () => ({
  createRoom: mockCreateRoom,
  getRoom: mockGetRoom,
  getViewerState: mockGetViewerState,
  hasRoomParticipantAccess: mockHasRoomParticipantAccess,
  sendMessage: mockSendMessage,
  markRoomViewed: mockMarkRoomViewed,
  listRoomsByTeam: mockListRoomsByTeam,
  getMessages: mockGetMessages,
}));

const {
  mockRouteRoomIntent,
  mockStartRun,
  mockAdvanceRun,
  mockResumeRun,
  mockUpdateRunObjective,
  mockGetDb,
} = vi.hoisted(() => ({
  mockRouteRoomIntent: vi.fn(),
  mockStartRun: vi.fn(),
  mockAdvanceRun: vi.fn(),
  mockResumeRun: vi.fn(),
  mockUpdateRunObjective: vi.fn(),
  mockGetDb: vi.fn(),
}));

vi.mock("../../services/roomIntentRouter", () => ({
  routeRoomIntent: mockRouteRoomIntent,
}));

vi.mock("../../services/runEngine", () => ({
  DEFAULT_STOP_POLICY: {
    maxRounds: 20,
    maxDurationMinutes: 30,
    maxBudgetCredits: 100,
    stopOnConsensus: false,
    stopOnArtifactReady: false,
    stopOnLeadSummary: true,
    requireFinalSummary: true,
    idleTimeoutSeconds: 120,
  },
  startRun: mockStartRun,
  advanceRun: mockAdvanceRun,
  resumeRun: mockResumeRun,
  updateRunObjective: mockUpdateRunObjective,
}));

vi.mock("../../services/teamRoomMemoryService", () => ({
  captureUserMemoryFromTeamMessage: mockCaptureUserMemoryFromTeamMessage,
}));

vi.mock("../../services/monitoringService", () => ({
  getContextEngineHealth: mockGetContextEngineHealth,
}));

vi.mock("../../services/autoTeamLedgerService", () => ({
  getAutoTeamLedgerSnapshot: mockGetAutoTeamLedgerSnapshot,
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import { teamRoomRouter } from "../teamRoom";

describe("teamRoomRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
    mockRouteRoomIntent.mockResolvedValue({
      route: "skill",
      reason: "rules",
      confidence: 0.8,
      selectedSkillId: "test-skill",
      source: "rules",
    });
    mockCaptureUserMemoryFromTeamMessage.mockResolvedValue(1);
    mockHasRoomParticipantAccess.mockResolvedValue(true);
    mockStartRun.mockResolvedValue({ id: "run-1", status: "running" });
    mockAdvanceRun.mockResolvedValue([{ runId: "run-1" }]);
    mockResumeRun.mockResolvedValue({ id: "run-1", status: "running" });
    mockUpdateRunObjective.mockResolvedValue({ id: "run-1", status: "running" });
    mockGetContextEngineHealth.mockResolvedValue({
      scope: {
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        skillId: null,
        userId: 42,
        since: new Date("2026-04-17T00:00:00.000Z").toISOString(),
        limit: 12,
      },
      window: {
        matchedChecks: 1,
        latestCreatedAt: new Date("2026-04-17T00:05:00.000Z").toISOString(),
      },
      totals: {
        total: 1,
        ok: 1,
        warning: 0,
        critical: 0,
        error: 0,
      },
      latest: null,
      recentChecks: [],
      averages: {
        healthScore: 0.92,
        groundingScore: 0.81,
        retrievalCoverage: 0.66,
        freshnessScore: 0.74,
        staleContextRatio: 0.12,
        tokenPressureRatio: 0.34,
        latencyMs: 420,
      },
      sourceBreakdown: [{ source: "team_run", count: 1 }],
    });
    mockGetAutoTeamLedgerSnapshot.mockResolvedValue({
      roomId: "room-1",
      runId: "run-1",
      summary: {
        terminalState: "running",
      },
    });
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      }),
    });
  });

  it("viewerState resolves the viewer state for the current user", async () => {
    mockGetViewerState.mockResolvedValue({
      roomId: "room-1",
      userId: 42,
      lastViewedAt: new Date("2026-03-20T10:00:00.000Z"),
    });

    const result = await teamRoomRouter.viewerState({
      input: { roomId: "room-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockGetViewerState).toHaveBeenCalledWith("room-1", "tenant-1", 42);
    expect(result).toEqual(expect.objectContaining({
      roomId: "room-1",
      userId: 42,
    }));
  });

  it("returns the auto-team ledger for room viewers", async () => {
    const result = await teamRoomRouter.getAutoTeamLedger({
      input: { roomId: "room-1", runId: "run-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "user" },
      },
    } as any);

    expect(mockGetAutoTeamLedgerSnapshot).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      caller: expect.objectContaining({
        tenantId: "tenant-1",
        userId: 42,
        isTenantAdmin: false,
        isDebugUser: false,
      }),
      roomId: "room-1",
      runId: "run-1",
      workRequestId: null,
      workCaseId: null,
      limitMessages: undefined,
    });
    expect(result).toEqual(
      expect.objectContaining({
        roomId: "room-1",
        runId: "run-1",
      }),
    );
  });

  it("markViewed persists the latest viewed timestamp for the current user", async () => {
    mockMarkRoomViewed.mockResolvedValue({
      roomId: "room-1",
      userId: 42,
      lastViewedAt: new Date("2026-03-20T10:05:00.000Z"),
    });

    const result = await teamRoomRouter.markViewed({
      input: { roomId: "room-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockMarkRoomViewed).toHaveBeenCalledWith("room-1", "tenant-1", 42);
    expect(result).toEqual(expect.objectContaining({
      roomId: "room-1",
      userId: 42,
    }));
  });

  it("sendMessage stores the message and auto-starts a guided run when requested", async () => {
    mockGetRoom.mockResolvedValue({
      id: "room-1",
      roomType: "team",
      projectId: 12,
    });
    mockSendMessage.mockResolvedValue({ id: "msg-1", roomId: "room-1" });

    const result = await teamRoomRouter.sendMessage({
      input: {
        roomId: "room-1",
        content: "Please summarize the latest findings.",
        autoRespond: true,
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        senderUserId: 42,
        content: "Please summarize the latest findings.",
      }),
    );
    expect(mockCaptureUserMemoryFromTeamMessage).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      content: "Please summarize the latest findings.",
      projectId: "12",
    });
    expect(mockStartRun).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        tenantId: "tenant-1",
        initiatedByUserId: 42,
        executionMode: "team_chat",
        objective: "Please summarize the latest findings.",
      }),
    );
    expect(mockAdvanceRun).toHaveBeenCalledWith("run-1", "tenant-1", 1);
    expect(result).toEqual({
      message: { id: "msg-1", roomId: "room-1" },
      triggeredRunId: "run-1",
      assistantTurnsStarted: 1,
    });
  });

  it("sendMessage avoids auto-response inside auto_team rooms", async () => {
    mockGetRoom.mockResolvedValue({
      id: "room-1",
      roomType: "auto_team",
      projectId: null,
    });
    mockSendMessage.mockResolvedValue({ id: "msg-1", roomId: "room-1" });

    const result = await teamRoomRouter.sendMessage({
      input: {
        roomId: "room-1",
        content: "Human guidance",
        autoRespond: true,
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockStartRun).not.toHaveBeenCalled();
    expect(mockAdvanceRun).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: { id: "msg-1", roomId: "room-1" },
      triggeredRunId: null,
      assistantTurnsStarted: 0,
    });
  });

  it("returns context-engine health for a room", async () => {
    mockGetRoom.mockResolvedValue({
      id: "room-1",
      roomType: "team",
      teamId: "team-1",
      projectId: null,
      lastRunId: "run-1",
    });

    const result = await teamRoomRouter.getContextEngineHealth({
      input: {
        roomId: "room-1",
        teamId: "team-1",
        runId: "run-1",
        limit: 12,
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockGetContextEngineHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        roomId: "room-1",
        teamId: "team-1",
        runId: "run-1",
        userId: null,
        limit: 12,
        since: null,
        skillId: null,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        scope: expect.objectContaining({
          roomId: "room-1",
        }),
      })
    );
  });

  it("returns the latest active run for a room", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: "run-2",
                    status: "running",
                    executionMode: "auto_team",
                  },
                ]),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await teamRoomRouter.getActiveRun({
      input: { roomId: "room-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(result).toEqual({
      id: "run-2",
      status: "running",
      executionMode: "auto_team",
    });
  });

  it("rejects context-engine health access for non-participants", async () => {
    mockGetRoom.mockResolvedValue({
      id: "room-1",
      roomType: "team",
      teamId: "team-1",
      projectId: null,
      lastRunId: "run-1",
    });
    mockHasRoomParticipantAccess.mockResolvedValue(false);

    await expect(
      teamRoomRouter.getContextEngineHealth({
        input: {
          roomId: "room-1",
          teamId: "team-1",
          runId: "run-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 99, currentTenantId: 1 },
        },
      } as any),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
