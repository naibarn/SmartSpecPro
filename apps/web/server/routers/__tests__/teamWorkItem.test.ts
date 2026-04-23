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

const { mockResolveTenantIdVarchar } = vi.hoisted(() => ({
  mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

const {
  mockCreateWorkItem,
  mockGetWorkItem,
  mockSetThreadRootMessageId,
  mockGetWorkItemWithLatestRevision,
  mockListWorkItemsByRoom,
  mockReviseWorkItem,
  mockRouteWorkItemByRole,
  mockSuggestAutoAdvanceStep,
  mockAcquireWorkItemLock,
  mockReleaseWorkItemLock,
  mockApproveWorkItemRevision,
  mockRejectWorkItemRevision,
} = vi.hoisted(() => ({
  mockCreateWorkItem: vi.fn(),
  mockGetWorkItem: vi.fn(),
  mockSetThreadRootMessageId: vi.fn(),
  mockGetWorkItemWithLatestRevision: vi.fn(),
  mockListWorkItemsByRoom: vi.fn(),
  mockReviseWorkItem: vi.fn(),
  mockRouteWorkItemByRole: vi.fn(),
  mockSuggestAutoAdvanceStep: vi.fn(),
  mockAcquireWorkItemLock: vi.fn(),
  mockReleaseWorkItemLock: vi.fn(),
  mockApproveWorkItemRevision: vi.fn(),
  mockRejectWorkItemRevision: vi.fn(),
}));

vi.mock("../../services/workItemService", () => ({
  createWorkItem: mockCreateWorkItem,
  getWorkItem: mockGetWorkItem,
  setThreadRootMessageId: mockSetThreadRootMessageId,
  getWorkItemWithLatestRevision: mockGetWorkItemWithLatestRevision,
  listWorkItemsByRoom: mockListWorkItemsByRoom,
  reviseWorkItem: mockReviseWorkItem,
  routeWorkItemByRole: mockRouteWorkItemByRole,
  suggestAutoAdvanceStep: mockSuggestAutoAdvanceStep,
  acquireWorkItemLock: mockAcquireWorkItemLock,
  releaseWorkItemLock: mockReleaseWorkItemLock,
  approveWorkItemRevision: mockApproveWorkItemRevision,
  rejectWorkItemRevision: mockRejectWorkItemRevision,
}));

const {
  mockPrepareWorkUpdate,
  mockSendMessage,
  mockGetRoom,
} = vi.hoisted(() => ({
  mockPrepareWorkUpdate: vi.fn(),
  mockSendMessage: vi.fn(),
  mockGetRoom: vi.fn(),
}));

vi.mock("../../services/roomService", () => ({
  prepareWorkUpdate: mockPrepareWorkUpdate,
  sendMessage: mockSendMessage,
  getRoom: mockGetRoom,
}));

import { teamWorkItemRouter } from "../teamWorkItem";

describe("teamWorkItemRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
    mockSuggestAutoAdvanceStep.mockReturnValue(null);
    mockGetRoom.mockResolvedValue({ language: "en" });
    mockPrepareWorkUpdate.mockReturnValue({
      content: "safe trace",
      summaryContent: "safe trace",
      turnType: "execution_update",
      visibility: "transparent",
      artifactRefsJson: null,
      memoryRefsJson: null,
      metadataJson: { ok: true },
    });
  });

  it("create mirrors the initial work item into the room and attaches threadRootMessageId", async () => {
    mockCreateWorkItem.mockResolvedValue({
      id: "work-1",
      roomId: "room-1",
      runId: "run-1",
      title: "Draft article",
      threadRootMessageId: null,
      riskClass: "medium",
    });
    mockSendMessage.mockResolvedValue({ id: "msg-root" });
    mockSetThreadRootMessageId.mockResolvedValue({
      id: "work-1",
      threadRootMessageId: "msg-root",
    });

    const result = await teamWorkItemRouter.create({
      input: {
        teamId: "team-1",
        roomId: "room-1",
        title: "Draft article",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockCreateWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      actorUserId: 42,
    }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      senderType: "system",
      roomId: "room-1",
      content: "safe trace",
    }));
    expect(mockSetThreadRootMessageId).toHaveBeenCalledWith("work-1", "msg-root", "tenant-1");
    expect(result).toEqual({
      workItem: {
        id: "work-1",
        threadRootMessageId: "msg-root",
      },
      roomMessage: { id: "msg-root" },
    });
  });

  it("revise posts a room revision reply against the existing thread", async () => {
    mockGetWorkItem.mockResolvedValue({
      id: "work-1",
      assignedMemberId: "assistant-1",
      threadRootMessageId: "msg-root",
    });
    mockReviseWorkItem.mockResolvedValue({
      id: "work-2",
      roomId: "room-1",
      runId: "run-1",
      title: "Draft article v2",
      revisionVersion: 2,
      threadRootMessageId: "msg-root",
      riskClass: "medium",
    });
    mockSendMessage.mockResolvedValue({ id: "msg-revision" });

    const result = await teamWorkItemRouter.revise({
      input: {
        workItemId: "work-1",
        expectedRevisionVersion: 1,
        title: "Draft article v2",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockReviseWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      actorAssistantId: "assistant-1",
    }));
    expect(mockPrepareWorkUpdate).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-2",
      messageType: "revision",
      threadRootMessageId: "msg-root",
    }));
    expect(result.roomMessage).toEqual({ id: "msg-revision" });
  });

  it("revise auto-routes a draft-bearing work item to review", async () => {
    mockGetWorkItem.mockResolvedValue({
      id: "work-1",
      assignedMemberId: "assistant-1",
      threadRootMessageId: "msg-root",
    });
    mockReviseWorkItem.mockResolvedValue({
      id: "work-2",
      roomId: "room-1",
      runId: "run-1",
      title: "Draft article v2",
      revisionVersion: 2,
      threadRootMessageId: "msg-root",
      riskClass: "medium",
      status: "in_progress",
      activeDraftArtifactId: "artifact-1",
      artifactRefsJson: [{ artifactId: "artifact-1" }],
    });
    mockRouteWorkItemByRole.mockResolvedValue({
      workItem: {
        id: "work-3",
        roomId: "room-1",
        runId: "run-1",
        title: "Draft article v2",
        revisionVersion: 3,
        threadRootMessageId: "msg-root",
        riskClass: "medium",
      },
      targetStep: "review",
      assignments: {},
    });
    mockSuggestAutoAdvanceStep.mockReturnValue("review");
    mockSendMessage
      .mockResolvedValueOnce({ id: "msg-revision" })
      .mockResolvedValueOnce({ id: "msg-auto-route" });

    const result = await teamWorkItemRouter.revise({
      input: {
        workItemId: "work-1",
        expectedRevisionVersion: 1,
        title: "Draft article v2",
        actorAssistantId: "assistant-1",
        artifactRefs: [{ artifactId: "artifact-1" }],
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockRouteWorkItemByRole).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-2",
      targetStep: "review",
      actorAssistantId: "assistant-1",
    }));
    expect(result.autoAdvanced).toEqual({
      targetStep: "review",
      roomMessage: { id: "msg-auto-route" },
    });
  });

  it("approve posts an approval decision into the room", async () => {
    mockApproveWorkItemRevision.mockResolvedValue({
      id: "work-2",
      roomId: "room-1",
      runId: "run-1",
      title: "Draft article v2",
      revisionVersion: 2,
      threadRootMessageId: "msg-root",
      riskClass: "medium",
    });
    mockSendMessage
      .mockResolvedValueOnce({ id: "msg-approve" })
      .mockResolvedValueOnce({ id: "msg-approve-step-result" });

    await teamWorkItemRouter.approve({
      input: {
        workItemId: "work-2",
        expectedRevisionVersion: 2,
        approverMemberId: "assistant-3",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockApproveWorkItemRevision).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      approverMemberId: "assistant-3",
    }));
    expect(mockPrepareWorkUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      messageType: "approval",
      replyToMessageId: "msg-root",
    }));
    expect(mockPrepareWorkUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messageType: "step_result",
      replyToMessageId: "msg-approve",
    }));
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  it("reject auto-routes the work item back to research", async () => {
    mockRejectWorkItemRevision.mockResolvedValue({
      id: "work-2",
      roomId: "room-1",
      runId: "run-1",
      title: "Draft article v2",
      revisionVersion: 2,
      threadRootMessageId: "msg-root",
      riskClass: "medium",
      status: "needs_revision",
      activeDraftArtifactId: null,
      artifactRefsJson: null,
    });
    mockRouteWorkItemByRole.mockResolvedValue({
      workItem: {
        id: "work-3",
        roomId: "room-1",
        runId: "run-1",
        title: "Draft article v3",
        revisionVersion: 3,
        threadRootMessageId: "msg-root",
        riskClass: "medium",
      },
      targetStep: "research",
      assignments: {},
    });
    mockSuggestAutoAdvanceStep.mockReturnValue("research");
    mockSendMessage
      .mockResolvedValueOnce({ id: "msg-reject" })
      .mockResolvedValueOnce({ id: "msg-reject-step-result" })
      .mockResolvedValueOnce({ id: "msg-requeue" });

    const result = await teamWorkItemRouter.reject({
      input: {
        workItemId: "work-2",
        expectedRevisionVersion: 2,
        approverMemberId: "assistant-3",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockRouteWorkItemByRole).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-2",
      targetStep: "research",
      actorAssistantId: "assistant-3",
    }));
    expect(mockPrepareWorkUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      messageType: "decision",
      replyToMessageId: "msg-root",
    }));
    expect(mockPrepareWorkUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messageType: "step_result",
      replyToMessageId: "msg-reject",
    }));
    expect(mockSendMessage).toHaveBeenCalledTimes(3);
    expect(result.autoAdvanced).toEqual({
      targetStep: "research",
      roomMessage: { id: "msg-requeue" },
    });
  });

  it("advanceWorkflow routes the item to the next role-based stage and mirrors it to the room", async () => {
    mockGetWorkItem.mockResolvedValue({
      id: "work-2",
      roomId: "room-1",
      runId: "run-1",
      threadRootMessageId: "msg-root",
      title: "Draft article",
      riskClass: "medium",
    });
    mockRouteWorkItemByRole.mockResolvedValue({
      workItem: {
        id: "work-3",
        roomId: "room-1",
        runId: "run-1",
        threadRootMessageId: "msg-root",
        title: "Draft article",
        revisionVersion: 3,
        riskClass: "medium",
      },
      targetStep: "review",
      assignments: {
        orchestratorMemberId: "assistant-1",
        researchMemberId: "assistant-2",
        reviewerMemberId: "assistant-3",
        approverMemberId: "assistant-4",
        publisherMemberId: "assistant-4",
      },
    });
    mockSendMessage.mockResolvedValue({ id: "msg-route" });

    const result = await teamWorkItemRouter.advanceWorkflow({
      input: {
        workItemId: "work-2",
        expectedRevisionVersion: 2,
        targetStep: "review",
        actorAssistantId: "assistant-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockRouteWorkItemByRole).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-2",
      expectedRevisionVersion: 2,
      targetStep: "review",
      actorAssistantId: "assistant-1",
    }));
    expect(mockPrepareWorkUpdate).toHaveBeenCalledWith(expect.objectContaining({
      messageType: "decision",
      workItemId: "work-3",
      replyToMessageId: "msg-root",
    }));
    expect(result.targetStep).toBe("review");
    expect(result.roomMessage).toEqual({ id: "msg-route" });
  });
});
