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
    domainAdminProcedure: createProcedure(),
  };
});

const { mockResolveTenantIdVarchar } = vi.hoisted(() => ({
  mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
}));
vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

const mocks = vi.hoisted(() => ({
  createWorkRequest: vi.fn(),
  createWorkTask: vi.fn(),
  listMyWorkRequests: vi.fn(),
  attachLegacyTaskToCase: vi.fn(),
  reassignWorkCase: vi.fn(),
  getWorkCaseProjection: vi.fn(),
  projectTaskAsCase: vi.fn(),
  getInbox: vi.fn(),
  recordApproval: vi.fn(),
  recordException: vi.fn(),
  recordOutcome: vi.fn(),
  recordSla: vi.fn(),
  getOverview: vi.fn(),
}));

vi.mock("../../services/workOsService", () => mocks);

import { workOsRouter } from "../workOs";

describe("workOsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
  });

  it("creates a canonical work request through the service boundary", async () => {
    mocks.createWorkRequest.mockResolvedValue({ request: { id: "req-1" }, case: { id: "case-1" } });

    const result = await workOsRouter.createRequest({
      input: {
        sourceType: "chat",
        title: "Process invoice",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mocks.createWorkRequest).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      sourceType: "chat",
      title: "Process invoice",
    }));
    expect(result).toEqual({ request: { id: "req-1" }, case: { id: "case-1" } });
  });

  it("lists the current user's work requests", async () => {
    mocks.listMyWorkRequests.mockResolvedValue([
      { id: "req-1", title: "Review refund request", currentState: "new" },
    ]);

    const result = await workOsRouter.listMyRequests({
      input: { limit: 5 },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mocks.listMyWorkRequests).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      requesterId: "42",
      limit: 5,
    });
    expect(result).toEqual([
      { id: "req-1", title: "Review refund request", currentState: "new" },
    ]);
  });

  it("projects a case timeline through the Work OS service", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: null,
      case: { id: "case-1" },
      task: null,
      approvals: [],
      exceptions: [],
      outcomes: [],
      slas: [],
      timeline: [{ id: "evt-1" }],
    });

    const result = await workOsRouter.timeline({
      input: { caseId: "case-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mocks.getWorkCaseProjection).toHaveBeenCalledWith("case-1", "tenant-1");
    expect(result).toEqual([{ id: "evt-1" }]);
  });

  it("returns the work overview from the monitoring-friendly service", async () => {
    mocks.getOverview.mockResolvedValue({
      byState: { planned: 2 },
      openExceptions: 1,
      overdueSla: 0,
      completed: 3,
    });

    const result = await workOsRouter.overview({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mocks.getOverview).toHaveBeenCalledWith("tenant-1");
    expect(result).toEqual({
      byState: { planned: 2 },
      openExceptions: 1,
      overdueSla: 0,
      completed: 3,
    });
  });

  it("reassigns a case through the Work OS service boundary", async () => {
    mocks.reassignWorkCase.mockResolvedValue({ case: { id: "case-1" }, timeline: [] });

    const result = await workOsRouter.reassignCase({
      input: {
        caseId: "case-1",
        ownerType: "queue",
        ownerId: "queue-1",
        reason: "shift work",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(mocks.reassignWorkCase).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      caseId: "case-1",
      ownerType: "queue",
      ownerId: "queue-1",
      reason: "shift work",
    }));
    expect(result).toEqual({ case: { id: "case-1" }, timeline: [] });
  });
});
