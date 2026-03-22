import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import {
  WorkItemLockConflictError,
  WorkItemSupersededError,
  WorkItemVersionConflictError,
  acquireWorkItemLock,
  approveWorkItemRevision,
  createWorkItem,
  resolveTeamWorkflowAssignments,
  reviseWorkItem,
  routeWorkItemByRole,
  suggestAutoAdvanceStep,
} from "../workItemService";

function makeWorkItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "work-1",
    tenantId: "tenant-1",
    teamId: "team-1",
    roomId: "room-1",
    runId: "run-1",
    routineId: null,
    sourceType: "manual",
    sourceRef: null,
    title: "Draft daily article",
    objective: "Produce the first draft",
    status: "planned",
    revisionVersion: 1,
    threadRootMessageId: "msg-root",
    activeDraftArtifactId: null,
    priority: "normal",
    riskClass: "medium",
    assignedMemberId: "assistant-1",
    reviewerMemberId: "assistant-2",
    approverMemberId: "assistant-3",
    lockOwnerMemberId: null,
    lockExpiresAt: null,
    parentWorkItemId: null,
    supersededByWorkItemId: null,
    artifactRefsJson: null,
    approvalState: "pending",
    carryOverReason: null,
    dueAt: null,
    completedAt: null,
    createdAt: new Date("2026-03-19T00:00:00Z"),
    updatedAt: new Date("2026-03-19T00:00:00Z"),
    ...overrides,
  };
}

function makeDb(selectRows: unknown[][] = [], insertRows: unknown[][] = [], updateRows: unknown[][] = []) {
  const queuedSelectRows = [...selectRows];
  const queuedInsertRows = [...insertRows];
  const queuedUpdateRows = [...updateRows];

  const limit = vi.fn().mockImplementation(() => Promise.resolve(queuedSelectRows.shift() ?? []));
  const orderBy = vi.fn().mockImplementation(() => Promise.resolve(queuedSelectRows.shift() ?? []));
  const whereSelect = vi.fn().mockReturnValue({ limit, orderBy });
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });

  const insertReturning = vi.fn().mockImplementation(() => Promise.resolve(queuedInsertRows.shift() ?? []));
  const values = vi.fn().mockReturnValue({ returning: insertReturning });
  const insert = vi.fn().mockReturnValue({ values });

  const updateReturning = vi.fn().mockImplementation(() => Promise.resolve(queuedUpdateRows.shift() ?? []));
  const whereUpdate = vi.fn().mockReturnValue({ returning: updateReturning });
  const set = vi.fn().mockReturnValue({ where: whereUpdate });
  const update = vi.fn().mockReturnValue({ set });

  return {
    select,
    from,
    whereSelect,
    limit,
    insert,
    values,
    insertReturning,
    update,
    set,
    whereUpdate,
    updateReturning,
    orderBy,
  };
}

describe("workItemService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an initial work item with revisionVersion=1 and logs a created event", async () => {
    const profiles = [
      { id: "assistant-1", memberKind: "assistant", memberRole: "orchestrator", isLead: true },
      { id: "assistant-2", memberKind: "assistant", memberRole: "researcher", isLead: false },
      { id: "assistant-3", memberKind: "assistant", memberRole: "reviewer", isLead: false },
      { id: "assistant-4", memberKind: "assistant", memberRole: "publisher", isLead: false },
    ];
    const created = makeWorkItem({
      id: "work-1",
      revisionVersion: 1,
      approvalState: "pending",
      assignedMemberId: "assistant-2",
      reviewerMemberId: "assistant-3",
      approverMemberId: "assistant-4",
    });
    const db = makeDb([profiles], [[created], [{}]], []);
    mockGetDb.mockResolvedValue(db);

    const result = await createWorkItem({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      title: "Draft daily article",
      objective: "Produce the first draft",
      requiresApproval: true,
      actorAssistantId: "assistant-1",
    });

    expect(result).toEqual(created);
    expect(db.values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: "Draft daily article",
      revisionVersion: 1,
      approvalState: "pending",
      assignedMemberId: "assistant-2",
      reviewerMemberId: "assistant-3",
      approverMemberId: "assistant-4",
    }));
    expect(db.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      workItemId: "work-1",
      eventType: "created",
      revisionVersion: 1,
    }));
  });

  it("rejects stale revision writes with a conflict", async () => {
    const current = makeWorkItem({
      id: "work-1",
      revisionVersion: 4,
    });
    const db = makeDb([[current]], [], []);
    mockGetDb.mockResolvedValue(db);

    await expect(
      reviseWorkItem({
        workItemId: "work-1",
        expectedRevisionVersion: 3,
        actorAssistantId: "assistant-1",
      }),
    ).rejects.toBeInstanceOf(WorkItemVersionConflictError);
  });

  it("creates a new revision and supersedes the previous work item", async () => {
    const current = makeWorkItem({
      id: "work-1",
      revisionVersion: 1,
      status: "needs_revision",
    });
    const revision = makeWorkItem({
      id: "work-2",
      parentWorkItemId: "work-1",
      revisionVersion: 2,
      status: "in_progress",
    });
    const superseded = makeWorkItem({
      id: "work-1",
      status: "superseded",
      supersededByWorkItemId: "work-2",
    });
    const db = makeDb(
      [[current]],
      [[revision], [{}], [{}]],
      [[superseded]],
    );
    mockGetDb.mockResolvedValue(db);

    const result = await reviseWorkItem({
      workItemId: "work-1",
      expectedRevisionVersion: 1,
      actorAssistantId: "assistant-1",
      title: "Draft daily article v2",
    });

    expect(result).toEqual(revision);
    expect(db.values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      parentWorkItemId: "work-1",
      revisionVersion: 2,
      title: "Draft daily article v2",
    }));
    expect(db.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "superseded",
      supersededByWorkItemId: "work-2",
    }));
  });

  it("rejects lock acquisition when another active member holds the lock", async () => {
    const current = makeWorkItem({
      id: "work-1",
      lockOwnerMemberId: "assistant-2",
      lockExpiresAt: new Date("2026-03-19T12:10:00Z"),
    });
    const db = makeDb([[current]], [], []);
    mockGetDb.mockResolvedValue(db);

    await expect(
      acquireWorkItemLock({
        workItemId: "work-1",
        memberId: "assistant-1",
        now: new Date("2026-03-19T12:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(WorkItemLockConflictError);
  });

  it("blocks approval on superseded revisions", async () => {
    const current = makeWorkItem({
      id: "work-1",
      revisionVersion: 2,
      supersededByWorkItemId: "work-2",
    });
    const db = makeDb([[current]], [], []);
    mockGetDb.mockResolvedValue(db);

    await expect(
      approveWorkItemRevision({
        workItemId: "work-1",
        expectedRevisionVersion: 2,
        approverMemberId: "assistant-3",
      }),
    ).rejects.toBeInstanceOf(WorkItemSupersededError);
  });

  it("approves the latest active revision and marks it completed", async () => {
    const current = makeWorkItem({
      id: "work-2",
      revisionVersion: 2,
      status: "awaiting_approval",
      parentWorkItemId: "work-1",
    });
    const approved = makeWorkItem({
      id: "work-2",
      revisionVersion: 2,
      status: "completed",
      approvalState: "approved",
      completedAt: new Date("2026-03-19T12:00:00Z"),
    });
    const db = makeDb([[current]], [[{}]], [[approved]]);
    mockGetDb.mockResolvedValue(db);

    const result = await approveWorkItemRevision({
      workItemId: "work-2",
      expectedRevisionVersion: 2,
      approverMemberId: "assistant-3",
    });

    expect(result).toEqual(approved);
    expect(db.set).toHaveBeenCalledWith(expect.objectContaining({
      approvalState: "approved",
      status: "completed",
      completedAt: expect.any(Date),
    }));
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-2",
      eventType: "approved",
      revisionVersion: 2,
    }));
  });

  it("resolves workflow assignees from member roles with orchestrator fallback", async () => {
    const profiles = [
      { id: "assistant-1", memberKind: "assistant", memberRole: "orchestrator", isLead: true },
      { id: "assistant-2", memberKind: "assistant", memberRole: "researcher", isLead: false },
      { id: "assistant-3", memberKind: "assistant", memberRole: "reviewer", isLead: false },
    ];
    const db = makeDb([profiles], [], []);
    mockGetDb.mockResolvedValue(db);

    const result = await resolveTeamWorkflowAssignments("team-1", "tenant-1");

    expect(result).toEqual({
      orchestratorMemberId: "assistant-1",
      researchMemberId: "assistant-2",
      reviewerMemberId: "assistant-3",
      approverMemberId: "assistant-1",
      publisherMemberId: "assistant-1",
    });
  });

  it("routes a work item to review and assigns the reviewer by role", async () => {
    const current = makeWorkItem({
      id: "work-1",
      revisionVersion: 1,
      status: "in_progress",
      assignedMemberId: "assistant-2",
      reviewerMemberId: null,
      approverMemberId: null,
    });
    const profiles = [
      { id: "assistant-1", memberKind: "assistant", memberRole: "orchestrator", isLead: true },
      { id: "assistant-2", memberKind: "assistant", memberRole: "researcher", isLead: false },
      { id: "assistant-3", memberKind: "assistant", memberRole: "reviewer", isLead: false },
      { id: "assistant-4", memberKind: "assistant", memberRole: "publisher", isLead: false },
    ];
    const revision = makeWorkItem({
      id: "work-2",
      parentWorkItemId: "work-1",
      revisionVersion: 2,
      status: "in_review",
      assignedMemberId: "assistant-2",
      reviewerMemberId: "assistant-3",
      approverMemberId: null,
    });
    const superseded = makeWorkItem({
      id: "work-1",
      status: "superseded",
      supersededByWorkItemId: "work-2",
    });
    const db = makeDb(
      [[current], profiles, [current]],
      [[revision], [{}], [{}], [{}]],
      [[superseded]],
    );
    mockGetDb.mockResolvedValue(db);

    const result = await routeWorkItemByRole({
      workItemId: "work-1",
      expectedRevisionVersion: 1,
      actorAssistantId: "assistant-1",
      targetStep: "review",
    });

    expect(result.targetStep).toBe("review");
    expect(result.workItem).toEqual(revision);
    expect(db.values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      reviewerMemberId: "assistant-3",
      status: "in_review",
    }));
    expect(db.values).toHaveBeenLastCalledWith(expect.objectContaining({
      workItemId: "work-2",
      eventType: "workflow_routed",
    }));
  });

  it("suggests review when an in-progress item has a draft artifact", () => {
    const result = suggestAutoAdvanceStep(makeWorkItem({
      status: "in_progress",
      activeDraftArtifactId: "artifact-1",
    }) as any);

    expect(result).toBe("review");
  });

  it("suggests research when a work item needs revision", () => {
    const result = suggestAutoAdvanceStep(makeWorkItem({
      status: "needs_revision",
      activeDraftArtifactId: null,
      artifactRefsJson: null,
    }) as any);

    expect(result).toBe("research");
  });
});
