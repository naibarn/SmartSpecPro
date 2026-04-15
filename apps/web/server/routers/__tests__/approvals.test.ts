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

vi.mock("../../services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: vi.fn(async () => ({
    pythonBackendUrl: "https://backend.test",
  })),
}));

const { mockRecordApproval } = vi.hoisted(() => ({
  mockRecordApproval: vi.fn(),
}));
vi.mock("../../services/workOsService", () => ({
  recordApproval: mockRecordApproval,
}));

import { approvalsRouter } from "../approvals";

describe("approvalsRouter Work OS linkage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ requestId: "remote-req-1" }),
    })) as any);
  });

  it("persists linked Work OS approval data when a decision is submitted", async () => {
    const result = await approvalsRouter.submitDecision({
      input: {
        requestId: "11111111-1111-1111-1111-111111111111",
        decision: "approved",
        comment: "looks good",
        workRequestId: "work-req-1",
        workCaseId: "work-case-1",
        workTaskId: "work-task-1",
      },
      ctx: {
        userToken: "token",
        user: { id: 7, currentTenantId: 1 },
        tenantId: "tenant-1",
      },
    } as any);

    expect(mockRecordApproval).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      requestId: "work-req-1",
      caseId: "work-case-1",
      taskId: "work-task-1",
      approvalTransportId: "11111111-1111-1111-1111-111111111111",
      decision: "approved",
      actorUserId: 7,
    }));
    expect(result).toEqual({ requestId: "remote-req-1" });
  });

  it("persists a cancelled Work OS approval record when an approval request is cancelled", async () => {
    const result = await approvalsRouter.cancel({
      input: {
        requestId: "22222222-2222-2222-2222-222222222222",
        reason: "not needed",
        workRequestId: "work-req-1",
        workCaseId: "work-case-1",
      },
      ctx: {
        userToken: "token",
        user: { id: 7, currentTenantId: 1 },
        tenantId: "tenant-1",
      },
    } as any);

    expect(mockRecordApproval).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      requestId: "work-req-1",
      caseId: "work-case-1",
      approvalTransportId: "22222222-2222-2222-2222-222222222222",
      decision: "cancelled",
      actorUserId: 7,
    }));
    expect(result).toEqual({ requestId: "remote-req-1" });
  });
});
