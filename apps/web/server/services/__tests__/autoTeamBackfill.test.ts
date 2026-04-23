import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getRoom: vi.fn(),
  getMessages: vi.fn(),
  getWorkRequest: vi.fn(),
  startRun: vi.fn(),
  getRunSnapshot: vi.fn(),
  ensureRouteDecision: vi.fn(),
  ensureStagePlan: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("../roomService", () => ({
  getRoom: mocks.getRoom,
  getMessages: mocks.getMessages,
}));

vi.mock("../workOsService", () => ({
  getWorkRequest: mocks.getWorkRequest,
}));

vi.mock("../runEngine", () => ({
  startRun: mocks.startRun,
}));

vi.mock("../autoTeamExecutionService", () => ({
  getRunSnapshot: mocks.getRunSnapshot,
  ensureRouteDecision: mocks.ensureRouteDecision,
  ensureStagePlan: mocks.ensureStagePlan,
}));

import { backfillAutoTeamRoom } from "../autoTeamBackfillService";

function makeDb() {
  const inserted: any[] = [];
  const updates: any[] = [];
  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((payload: any) => ({
        returning: vi.fn(async () => {
          const row = {
            id: `final-${inserted.length + 1}`,
            createdAt: new Date("2026-04-17T12:10:00.000Z"),
            updatedAt: new Date("2026-04-17T12:10:00.000Z"),
            ...payload,
          };
          inserted.push(row);
          return [row];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: any) => ({
        where: vi.fn(async () => {
          updates.push(payload);
          return [];
        }),
      })),
    })),
    _inserted: inserted,
    _updates: updates,
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRoom.mockResolvedValue({
    id: "room-1",
    tenantId: "tenant-1",
    teamId: "team-1",
    roomType: "auto_team",
    language: "th",
    goalPrompt: "Create a 24-30 second Songkran video using Veo 3.1",
    orchestratorUserId: 42,
    lastRunId: "run-1",
  });
  mocks.getMessages.mockResolvedValue([
    {
      id: "msg-1",
      content: "สรุปผลการวิจัยเกี่ยวกับสงกรานต์",
    },
    {
      id: "msg-2",
      content: "ทำ storyboard และ prompt ต่อ",
    },
  ]);
  mocks.getWorkRequest.mockResolvedValue({
    request: {
      id: "request-1",
      title: "Songkran video",
      objective: "Create a 24-30 second Songkran video using Veo 3.1",
    },
    case: {
      id: "case-1",
      automationRunId: "run-1",
      title: "Songkran video",
      objective: "Create a 24-30 second Songkran video using Veo 3.1",
    },
    editable: true,
  });
  mocks.getRunSnapshot.mockResolvedValue(null);
  mocks.ensureRouteDecision.mockResolvedValue({
    id: "route-1",
    routeClass: "media.video",
    language: "th",
    teamId: "team-1",
    roomId: "room-1",
  });
  mocks.ensureStagePlan.mockResolvedValue({
    routeDecision: {
      id: "route-1",
      routeClass: "media.video",
      language: "th",
      teamId: "team-1",
      roomId: "room-1",
    },
    stages: [
      { id: "stage-1", stageType: "research", status: "queued" },
      { id: "stage-2", stageType: "storyboard", status: "queued" },
    ],
  });
  mocks.startRun.mockResolvedValue({
    id: "run-retry",
    status: "running",
  });
});

describe("autoTeamBackfillService", () => {
  it("marks legacy-derived canonical records as legacy_unverified", async () => {
    const db = makeDb();
    mocks.getDb.mockResolvedValue(db);

    const result = await backfillAutoTeamRoom({
      tenantId: "tenant-1",
      roomId: "room-1",
      workRequestId: "request-1",
      initiatedByUserId: 42,
    });

    expect(result.legacyUnverified).toBe(true);
    expect(result.finalResult?.status).toBe("legacy_unverified");
    expect(result.routeDecision?.routeClass).toBe("media.video");
    expect(result.sourceMessageIds).toEqual(["msg-1", "msg-2"]);
    expect(mocks.getWorkRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 42,
      }),
    );
    expect(mocks.getWorkRequest.mock.calls[0]?.[0]?.actorRole).toBeUndefined();
    expect(db._updates[0]).toEqual(
      expect.objectContaining({
        status: "superseded",
        blockedReason: "legacy_unverified",
      }),
    );
    expect(db._inserted[0]).toEqual(
      expect.objectContaining({
        status: "legacy_unverified",
        blockedReason: "legacy_unverified",
      }),
    );
  });

  it("can retry a legacy room into a new canonical auto_team run", async () => {
    const db = makeDb();
    mocks.getDb.mockResolvedValue(db);
    mocks.getRunSnapshot.mockResolvedValue(null);
    mocks.getRoom.mockResolvedValue({
      id: "room-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomType: "auto_team",
      language: "th",
      goalPrompt: "Create a 24-30 second Songkran video using Veo 3.1",
      orchestratorUserId: 42,
      lastRunId: null,
    });

    const result = await backfillAutoTeamRoom({
      tenantId: "tenant-1",
      roomId: "room-1",
      createRetryRun: true,
      initiatedByUserId: 42,
    });

    expect(result.retryRunId).toBe("run-retry");
    expect(result.legacyUnverified).toBe(false);
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        tenantId: "tenant-1",
        initiatedByUserId: 42,
        executionMode: "auto_team",
      }),
    );
  });

  it("does not treat workCaseId as a runId fallback when retrying", async () => {
    const db = makeDb();
    mocks.getDb.mockResolvedValue(db);
    mocks.getRunSnapshot.mockResolvedValue(null);
    mocks.getRoom.mockResolvedValue({
      id: "room-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomType: "auto_team",
      language: "th",
      goalPrompt: "Create a 24-30 second Songkran video using Veo 3.1",
      orchestratorUserId: 42,
      lastRunId: null,
    });
    mocks.getWorkRequest.mockResolvedValue({
      request: {
        id: "request-1",
        title: "Songkran video",
        objective: "Create a 24-30 second Songkran video using Veo 3.1",
      },
      case: {
        id: "case-from-request",
        automationRunId: null,
        title: "Songkran video",
        objective: "Create a 24-30 second Songkran video using Veo 3.1",
      },
      editable: true,
    });

    const result = await backfillAutoTeamRoom({
      tenantId: "tenant-1",
      roomId: "room-1",
      workCaseId: "case-explicit-but-not-a-run",
      createRetryRun: true,
      initiatedByUserId: 42,
    });

    expect(result.retryRunId).toBe("run-retry");
    expect(result.runId).toBe("run-retry");
    expect(mocks.startRun).toHaveBeenCalledTimes(1);
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        tenantId: "tenant-1",
        initiatedByUserId: 42,
        executionMode: "auto_team",
      }),
    );
  });
});
