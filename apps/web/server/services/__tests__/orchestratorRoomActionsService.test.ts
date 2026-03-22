import { beforeEach, describe, expect, it, vi } from "vitest";

const limitQueue: any[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => limitQueue.shift() ?? []),
      })),
    })),
  })),
};

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const {
  mockPostWorkUpdate,
} = vi.hoisted(() => ({
  mockPostWorkUpdate: vi.fn(),
}));

vi.mock("../roomService", () => ({
  postWorkUpdate: mockPostWorkUpdate,
}));

const {
  mockCreateWorkItem,
  mockSetThreadRootMessageId,
  mockRouteWorkItemByRole,
  mockGetWorkItem,
  mockApproveWorkItemRevision,
  mockRejectWorkItemRevision,
  mockSuggestAutoAdvanceStep,
} = vi.hoisted(() => ({
  mockCreateWorkItem: vi.fn(),
  mockSetThreadRootMessageId: vi.fn(),
  mockRouteWorkItemByRole: vi.fn(),
  mockGetWorkItem: vi.fn(),
  mockApproveWorkItemRevision: vi.fn(),
  mockRejectWorkItemRevision: vi.fn(),
  mockSuggestAutoAdvanceStep: vi.fn(),
}));

vi.mock("../workItemService", () => ({
  createWorkItem: mockCreateWorkItem,
  setThreadRootMessageId: mockSetThreadRootMessageId,
  routeWorkItemByRole: mockRouteWorkItemByRole,
  getWorkItem: mockGetWorkItem,
  approveWorkItemRevision: mockApproveWorkItemRevision,
  rejectWorkItemRevision: mockRejectWorkItemRevision,
  suggestAutoAdvanceStep: mockSuggestAutoAdvanceStep,
}));

import {
  promoteMessageToWorkItem,
  requestWorkItemChangesByAssistant,
} from "../orchestratorRoomActionsService";

describe("orchestratorRoomActionsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitQueue.length = 0;
  });

  it("promotes a room message into a work item and routes it to research", async () => {
    limitQueue.push(
      [{ id: "room-1" }],
      [{ id: "assistant-1" }],
      [{
        id: "msg-source",
        roomId: "room-1",
        runId: "run-1",
        content: "Research the pricing changes and prepare a summary.",
        metadataJson: { threadRootMessageId: "msg-root" },
      }],
      [{ id: "room-1" }],
    );

    mockCreateWorkItem.mockResolvedValue({
      id: "work-1",
      roomId: "room-1",
      runId: "run-1",
      title: "Pricing follow-up",
      revisionVersion: 1,
      threadRootMessageId: null,
    });
    mockPostWorkUpdate
      .mockResolvedValueOnce({ id: "msg-created" })
      .mockResolvedValueOnce({ id: "msg-routed" });
    mockSetThreadRootMessageId.mockResolvedValue({
      id: "work-1",
      roomId: "room-1",
      runId: "run-1",
      title: "Pricing follow-up",
      revisionVersion: 1,
      threadRootMessageId: "msg-created",
    });
    mockRouteWorkItemByRole.mockResolvedValue({
      workItem: {
        id: "work-2",
        roomId: "room-1",
        runId: "run-1",
        title: "Pricing follow-up",
        revisionVersion: 2,
        threadRootMessageId: "msg-created",
      },
      targetStep: "research",
    });

    const result = await promoteMessageToWorkItem({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      actorAssistantId: "assistant-1",
      messageId: "msg-source",
      title: "Pricing follow-up",
    });

    expect(mockCreateWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "room_message",
      sourceRef: "msg-source",
      actorAssistantId: "assistant-1",
      autoAssignByRole: true,
    }));
    expect(mockPostWorkUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      senderAssistantId: "assistant-1",
      messageType: "decision",
      replyToMessageId: "msg-source",
      threadRootMessageId: "msg-root",
    }));
    expect(mockRouteWorkItemByRole).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      targetStep: "research",
      actorAssistantId: "assistant-1",
    }));
    expect(result.autoRouted?.targetStep).toBe("research");
  });

  it("requests changes and auto-routes the work item back to research", async () => {
    limitQueue.push(
      [{ id: "room-1" }],
      [{ id: "assistant-1" }],
    );

    mockGetWorkItem.mockResolvedValue({
      id: "work-9",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-2",
      title: "Morning report",
      revisionVersion: 4,
      threadRootMessageId: "msg-thread",
    });
    mockRejectWorkItemRevision.mockResolvedValue({
      id: "work-10",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-2",
      title: "Morning report",
      revisionVersion: 5,
      threadRootMessageId: "msg-thread",
      status: "needs_revision",
    });
    mockSuggestAutoAdvanceStep.mockReturnValue("research");
    mockRouteWorkItemByRole.mockResolvedValue({
      workItem: {
        id: "work-11",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-2",
        title: "Morning report",
        revisionVersion: 6,
        threadRootMessageId: "msg-thread",
      },
      targetStep: "research",
    });
    mockPostWorkUpdate
      .mockResolvedValueOnce({ id: "msg-request-changes" })
      .mockResolvedValueOnce({ id: "msg-reroute" });

    const result = await requestWorkItemChangesByAssistant({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      actorAssistantId: "assistant-1",
      workItemId: "work-9",
      reason: "Please add the missing KPI comparison.",
    });

    expect(mockRejectWorkItemRevision).toHaveBeenCalledWith(expect.objectContaining({
      approverMemberId: "assistant-1",
      reason: "Please add the missing KPI comparison.",
    }));
    expect(mockRouteWorkItemByRole).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-10",
      targetStep: "research",
      actorAssistantId: "assistant-1",
    }));
    expect(result.autoRouted?.roomMessage).toEqual({ id: "msg-reroute" });
  });
});
