import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], policyRows: [] as unknown[], node: vi.fn() }));
vi.mock("../../db", () => {
  const query: any = { from: () => query, where: () => query, limit: async () => mocks.rows.shift() ?? [] };
  const database = { select: () => query, execute: async () => mocks.policyRows };
  return { db: { ...database, instance: database }, getDb: () => database };
});
vi.mock("../runnerGateway", () => ({ defaultRunnerGateway: { getNode: (...args: unknown[]) => mocks.node(...args) } }));

import { createSpec224AuthorizationService, Spec224AuthorizationError } from "../spec224AuthorizationService";

const context = { tenantId: "tenant-a", actorId: 7, userToken: "unit-test-owner-session" };
const request = { context, runId: "run-a", runnerId: "runner-a" };
const approvalRequired = { version: "spec-224-authorization-binding-v1" as const, status: "APPROVAL_REQUIRED" as const, reasons: [] };
const budgetRequired = { ...approvalRequired, status: "BUDGET_REQUIRED" as const, references: { approvalRef: "approval-a" } };

function createService() {
  const service = createSpec224AuthorizationService();
  vi.spyOn(service, "runnerReadiness").mockResolvedValue({ ready: true, code: "RUNNER_READY" } as any);
  return service;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.rows = [[{ id: "job-a", attempt: 1,
    progressJson: { spec224: { runId: "run-a", workerJobId: "job-a", workspaceId: "workspace-a", baseRevision: `git:${"a".repeat(40)}` } }, inputJson: {} }],
    [{ id: "attempt-a" }], [{ id: "budget-a" }]];
  mocks.policyRows = [{ id: "policy-a", definition: {
    initiatorUserIds: [7], profileAllowlist: ["spec224-recovery-windows-x64-codex-nonprod"],
    environmentAllowlist: ["development"], operations: ["spec224.development.run"],
    maxBudgetMinorUnits: 50, currency: "USD", maxTtlSeconds: 600, expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  } }];
  mocks.node.mockResolvedValue({ currentSnapshot: { platform: { os: "windows" }, workspaces: [{ workspaceId: "workspace-a", projectId: "project-a" }] } });
});

describe("owner Start authorization continuation", () => {
  it("continues approved policy, hold and binding in one Start without a manual approval", async () => {
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValueOnce(approvalRequired).mockResolvedValueOnce(budgetRequired);
    const approval = vi.spyOn(service, "requestApproval").mockResolvedValue({ approvalRef: "approval-a", status: "approved" } as any);
    const reserve = vi.spyOn(service, "reserveBudget").mockResolvedValue({ budgetReservationRef: "hold-a" } as any);
    const bind = vi.spyOn(service, "bind").mockResolvedValue({ ...approvalRequired, status: "READY_FOR_LIVE" });
    await expect(service.advanceStart(request)).resolves.toMatchObject({ status: "READY_FOR_LIVE" });
    expect(approval).toHaveBeenCalledWith(expect.objectContaining({ context, runId: "run-a", runnerId: "runner-a", policyOnly: true, policyId: "policy-a", budgetCapMinorUnits: 50 }));
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ approvalRef: "approval-a", budgetId: "budget-a", amountMinorUnits: 50 }));
    expect(bind).toHaveBeenCalledWith({ ...request, approvalRef: "approval-a", budgetReservationRef: "hold-a" });
  });

  it("reuses an existing approved reservation without another approval or charge", async () => {
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValue({ ...budgetRequired, references: { approvalRef: "approval-a", budgetReservationRef: "hold-a" } });
    const approval = vi.spyOn(service, "requestApproval");
    const reserve = vi.spyOn(service, "reserveBudget");
    vi.spyOn(service, "bind").mockResolvedValue({ ...approvalRequired, status: "READY_FOR_LIVE" });
    await expect(service.advanceStart(request)).resolves.toMatchObject({ status: "READY_FOR_LIVE" });
    expect(approval).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("preserves denied policy results and never reserves or releases work", async () => {
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValue(approvalRequired);
    vi.spyOn(service, "requestApproval").mockRejectedValue(new Spec224AuthorizationError("SPEC224_POLICY_RESOURCE_SCOPE_DENIED"));
    const reserve = vi.spyOn(service, "reserveBudget");
    const bind = vi.spyOn(service, "bind");
    await expect(service.advanceStart(request)).resolves.toMatchObject({ status: "NOT_CONFIGURED", reasons: ["SPEC224_POLICY_RESOURCE_SCOPE_DENIED"] });
    expect(reserve).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
  });

  it("reports an absent policy without creating one or a manual approval request", async () => {
    mocks.policyRows = [];
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValue(approvalRequired);
    const approval = vi.spyOn(service, "requestApproval");
    await expect(service.advanceStart(request)).resolves.toMatchObject({ reasons: ["SPEC224_NONPRODUCTION_POLICY_NOT_CONFIGURED"] });
    expect(approval).not.toHaveBeenCalled();
  });

  it("retains an existing pending or rejected approval instead of replacing it", async () => {
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValue({ ...approvalRequired, references: { approvalRef: "existing-approval" } });
    const approval = vi.spyOn(service, "requestApproval");
    await expect(service.advanceStart(request)).resolves.toMatchObject({ status: "APPROVAL_REQUIRED" });
    expect(approval).not.toHaveBeenCalled();
  });
});
