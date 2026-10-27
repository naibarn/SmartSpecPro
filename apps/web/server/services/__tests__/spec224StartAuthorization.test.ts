import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], policyRows: [] as unknown[], node: vi.fn(), jobControlPlane: vi.fn(), eqCalls: [] as Array<{ columnName?: string; value: unknown }>, limitCalls: [] as number[] }));
vi.mock("drizzle-orm", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (column: { name?: string }, value: unknown) => {
      mocks.eqCalls.push({ columnName: column?.name, value });
      return actual.eq(column as never, value as never);
    },
  };
});
vi.mock("../../db", () => {
  const query: any = { from: () => query, where: () => query, orderBy: () => query, limit: async (size: number) => { mocks.limitCalls.push(size); return mocks.rows.shift() ?? []; } };
  const database = { select: () => query, execute: async () => mocks.policyRows };
  return { db: { ...database, instance: database }, getDb: () => database };
});
vi.mock("../runnerGateway", () => ({ defaultRunnerGateway: { getNode: (...args: unknown[]) => mocks.node(...args) } }));
vi.mock("../economicProvisioningService", () => ({ provisionEconomicBudget: vi.fn(async () => ({ budgetId: "budget-created" })) }));
vi.mock("../jobControlPlane", () => ({
  appendJobEvent: vi.fn(),
  createJobControlPlane: (...args: unknown[]) => mocks.jobControlPlane(...args),
  defaultJobControlPlaneRepository: {},
}));

import { createSpec224AuthorizationService, Spec224AuthorizationError, spec224ReservationIntentId } from "../spec224AuthorizationService";
import { provisionEconomicBudget } from "../economicProvisioningService";
import { canonicalDevelopmentRunWorkerJobId } from "../spec224DevelopmentRunContracts";

const context = { tenantId: "tenant-a", actorId: 7, userToken: "unit-test-owner-session" };
const request = { context, runId: "run-a", runnerId: "runner-a" };
const approvalRequired = { version: "spec-224-authorization-binding-v1" as const, status: "APPROVAL_REQUIRED" as const, reasons: [] };
const budgetRequired = { ...approvalRequired, status: "BUDGET_REQUIRED" as const, references: { approvalRef: "approval-a" } };

describe("Spec 224 reservation identity", () => {
  it("is stable across retries and scoped by tenant and attempt key", () => {
    const first = spec224ReservationIntentId("tenant-a", "run:attempt-a");
    expect(first).toMatch(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
    expect(spec224ReservationIntentId("tenant-a", "run:attempt-a")).toBe(first);
    expect(spec224ReservationIntentId("tenant-b", "run:attempt-a")).not.toBe(first);
    expect(spec224ReservationIntentId("tenant-a", "run:attempt-b")).not.toBe(first);
  });
});

function createService() {
  const service = createSpec224AuthorizationService();
  vi.spyOn(service, "runnerReadiness").mockResolvedValue({ ready: true, code: "RUNNER_READY" } as any);
  return service;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.eqCalls = [];
  mocks.limitCalls = [];
  mocks.jobControlPlane.mockReturnValue({ resumeUnstartedAuthorizationHold: vi.fn().mockResolvedValue(null) });
  mocks.rows = [[{ id: "job-a", attempt: 1,
    progressJson: { spec224: { runId: "run-a", workerJobId: "job-a", workspaceId: "workspace-a", baseRevision: `git:${"a".repeat(40)}` } }, inputJson: {} }],
    [{ id: "attempt-a" }], [{ id: "budget-a" }]];
  mocks.policyRows = [{ id: "policy-a", definition: {
    initiatorUserIds: [7], profileAllowlist: ["spec224-recovery-windows-x64-codex-nonprod"],
    environmentAllowlist: ["development"], operations: ["spec224.development.run"],
    resourceScopes: [
      { kind: "development_run", id: "run-a" }, { kind: "worker_job", id: "job-a" },
      { kind: "attempt", id: "attempt-a" }, { kind: "workspace", id: "workspace-a" },
      { kind: "runner", id: "runner-a" }, { kind: "runner_session", id: "runner-session-a" },
      { kind: "capability_snapshot", id: "snapshot-a" },
    ],
    maxBudgetMinorUnits: 50, currency: "USD", maxTtlSeconds: 600, expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  } }];
  mocks.node.mockResolvedValue({ activeSessionId: "runner-session-a", currentSnapshot: { platform: { os: "windows" }, runnerSessionId: "runner-session-a",
    capabilitySnapshotId: "snapshot-a", revision: "revision-a", capabilities: ["agent.external_task"],
    toolInventory: [{ adapterId: "codex.v1", authorizationEvidenceRef: "codex-auth-a" }],
    workspaces: [{ workspaceId: "workspace-a", projectId: "project-a" }] } });
});

describe("owner Start authorization continuation", () => {
  it("loads a newly created run by its canonical worker job ID", async () => {
    const jobId = canonicalDevelopmentRunWorkerJobId("run-a");
    mocks.rows = [[{
      id: jobId,
      attempt: 1,
      progressJson: { spec224: { runId: "run-a", workerJobId: jobId, workspaceId: "workspace-a", baseRevision: `git:${"a".repeat(40)}` } },
      inputJson: {},
    }], []];

    const result = await createService().status({ context, runId: "run-a" });

    expect(result.reasons).not.toContain("RUN_NOT_FOUND");
    expect(mocks.eqCalls).toContainEqual({ columnName: "id", value: jobId });
    expect(mocks.eqCalls).not.toContainEqual({ columnName: "id", value: "run-a" });
    expect(mocks.eqCalls).toContainEqual({ columnName: "tenantId", value: context.tenantId });
    expect(mocks.eqCalls).toContainEqual({ columnName: "requestedByUserId", value: context.actorId });
    expect(mocks.limitCalls).toEqual([1, 1]);
  });

  it("uses an exact scoped lookup for legacy root jobs instead of scanning the first 100 jobs", async () => {
    const jobId = "legacy-root-job";
    mocks.rows = [[], [{
      id: jobId,
      attempt: 1,
      progressJson: { spec224: { runId: "run-a", workerJobId: jobId, workspaceId: "workspace-a", baseRevision: `git:${"a".repeat(40)}` } },
      inputJson: {},
    }], []];

    const result = await createService().status({ context, runId: "run-a" });

    expect(result.reasons).not.toContain("RUN_NOT_FOUND");
    expect(mocks.eqCalls).toContainEqual({ columnName: "id", value: canonicalDevelopmentRunWorkerJobId("run-a") });
    expect(mocks.limitCalls).toEqual([1, 1, 1]);
    expect(mocks.limitCalls).not.toContain(100);
  });

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

  it("reconciles an expired unstarted hold for the same Run before evaluating its attempt-bound policy", async () => {
    const runRow = { id: "job-a", attempt: 1,
      progressJson: { spec224: { runId: "run-a", workerJobId: "job-a", workspaceId: "workspace-a", baseRevision: `git:${"a".repeat(40)}` } },
      inputJson: {} };
    mocks.rows = [[runRow], [{ id: "attempt-a" }], [runRow], [{ id: "attempt-b" }], [{ id: "budget-a" }]];
    const resumeUnstartedAuthorizationHold = vi.fn().mockResolvedValue({ attemptId: "attempt-b", resumed: true });
    mocks.jobControlPlane.mockReturnValue({ resumeUnstartedAuthorizationHold });
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValueOnce(approvalRequired).mockResolvedValueOnce(budgetRequired);
    mocks.policyRows = [{ id: "policy-a", definition: {
      initiatorUserIds: [7], profileAllowlist: ["spec224-recovery-windows-x64-codex-nonprod"],
      environmentAllowlist: ["development"], operations: ["spec224.development.run"],
      resourceScopes: [
        { kind: "development_run", id: "run-a" }, { kind: "worker_job", id: "job-a" },
        { kind: "attempt", id: "attempt-b" }, { kind: "workspace", id: "workspace-a" },
        { kind: "runner", id: "runner-a" }, { kind: "runner_session", id: "runner-session-a" },
        { kind: "capability_snapshot", id: "snapshot-a" },
      ], maxBudgetMinorUnits: 50, currency: "USD", maxTtlSeconds: 600,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    } }];
    vi.spyOn(service, "requestApproval").mockResolvedValue({ approvalRef: "approval-a", status: "approved" } as any);
    vi.spyOn(service, "reserveBudget").mockResolvedValue({ budgetReservationRef: "hold-a" } as any);
    vi.spyOn(service, "bind").mockResolvedValue({ ...approvalRequired, status: "READY_FOR_LIVE" });

    await expect(service.advanceStart(request)).resolves.toMatchObject({ status: "READY_FOR_LIVE" });
    expect(resumeUnstartedAuthorizationHold).toHaveBeenCalledWith({
      jobId: "job-a", runId: "run-a", tenantId: "tenant-a", requestedByUserId: 7,
    });
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

  it("creates one exact owner scoped non-production policy and budget from the authenticated Start cap", async () => {
    mocks.policyRows = [];
    const [jobRows, attemptRows] = mocks.rows;
    mocks.rows = [jobRows ?? [], attemptRows ?? [], [], [{ id: "budget-created" }]];
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValueOnce(approvalRequired).mockResolvedValueOnce(budgetRequired);
    vi.spyOn(service, "requestApproval").mockResolvedValue({ approvalRef: "approval-a", status: "approved" } as any);
    vi.spyOn(service, "reserveBudget").mockResolvedValue({ budgetReservationRef: "hold-a" } as any);
    vi.spyOn(service, "bind").mockResolvedValue({ ...approvalRequired, status: "READY_FOR_LIVE" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      mocks.policyRows = [{ id: "policy-created", definition: body.definition }];
      return new Response(JSON.stringify({ policyId: "policy-created" }), { status: 200 });
    });

    await expect(service.advanceStart({ ...request, context: { ...context, actorRole: "admin" }, budgetCapMinorUnits: 50 }))
      .resolves.toMatchObject({ status: "READY_FOR_LIVE" });
    expect(provisionEconomicBudget).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      authorization: { tenantId: "tenant-a", actorId: 7, role: "admin" },
      scopeType: "worker_job", scopeRef: "job-a", currency: "USD", limitMinorUnits: 50,
    }));
    const definition = (JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)) as any).definition;
    expect(definition).toMatchObject({
      schemaVersion: "spec224.development-policy.v1", environmentAllowlist: ["development"],
      profileAllowlist: ["spec224-recovery-windows-x64-codex-nonprod"], initiatorUserIds: [7],
      operations: ["spec224.development.run"], maxBudgetMinorUnits: 50, currency: "USD", maxTtlSeconds: 3600,
    });
    expect(definition.resourceScopes).toEqual(expect.arrayContaining([
      { kind: "development_run", id: "run-a" }, { kind: "worker_job", id: "job-a" },
      { kind: "attempt", id: "attempt-a" }, { kind: "workspace", id: "workspace-a" },
      { kind: "runner", id: "runner-a" }, { kind: "runner_session", id: "runner-session-a" },
      { kind: "capability_snapshot", id: "snapshot-a" },
    ]));
  });

  it("retains an existing pending or rejected approval instead of replacing it", async () => {
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValue({ ...approvalRequired, references: { approvalRef: "existing-approval" } });
    const approval = vi.spyOn(service, "requestApproval");
    await expect(service.advanceStart(request)).resolves.toMatchObject({ status: "APPROVAL_REQUIRED" });
    expect(approval).not.toHaveBeenCalled();
  });

  it("releases a previously bound authorization hold when Start is retried", async () => {
    const run = { runId: "run-a", tenantId: "tenant-a", actorId: 7, workerJobId: "job-a", workspaceId: "workspace-a" };
    mocks.rows = [
      [{ id: "job-a", attempt: 1, inputJson: {}, progressJson: { spec224: run, spec224Authorization: { status: "READY_FOR_LIVE" } } }],
      [{ id: "attempt-a" }],
    ];
    const releaseAuthorizationHold = vi.fn().mockResolvedValue(true);
    const resumeUnstartedAuthorizationHold = vi.fn().mockResolvedValue(null);
    mocks.jobControlPlane.mockReturnValue({ releaseAuthorizationHold, resumeUnstartedAuthorizationHold });
    const service = createService();
    vi.spyOn(service, "status").mockResolvedValue({ ...approvalRequired, status: "READY_FOR_LIVE" });

    await expect(service.advanceStart(request)).resolves.toMatchObject({ status: "READY_FOR_LIVE" });

    expect(releaseAuthorizationHold).toHaveBeenCalledWith({ jobId: "job-a", tenantId: "tenant-a", requestedByUserId: 7 });
  });
});
