import { describe, expect, it, vi } from "vitest";
import { createDecisionIntelligenceRouter } from "./decisionIntelligence";

function setup(overrides: Record<string, unknown> = {}) {
  const service = {
    createDecisionProject: vi.fn(async (input: any) => ({ id: "project-1", ...input })),
    listDecisionProjects: vi.fn(async (input: any) => [input.authority]),
    getDecisionProject: vi.fn(async (input: any) => ({ id: input.projectId, ...input.authority })),
    listDecisionAnalysisRuns: vi.fn(async (input: any) => [input]),
    ...overrides,
  };
  const caller = createDecisionIntelligenceRouter(service as any).createCaller({
    user: { id: 42, currentTenantId: "tenant-account" },
    tenantId: "tenant-request",
  } as any);
  return { service, caller };
}

const validProject = {
  title: "Compare flood-safe locations",
  projectJson: {
    version: "decision-project-v1",
    domainRefs: ["domain:flood-risk"],
    geographyRefs: ["geo:TH-10"],
    goal: "Find source-backed options.",
  },
};

describe("decisionIntelligence protected router", () => {
  it("derives tenant and owner from account identity, ignoring host tenant and forged authority fields", async () => {
    const { caller, service } = setup();

    await expect(caller.createProject({ ...validProject, tenantId: "attacker-tenant", ownerPrincipalId: "attacker" } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller.createProject(validProject);
    await caller.listProjects();

    expect(service.createDecisionProject).toHaveBeenCalledWith({
      authority: { tenantId: "tenant-account", ownerPrincipalId: "42" },
      ...validProject,
    });
    expect(service.listDecisionProjects).toHaveBeenCalledWith({
      authority: { tenantId: "tenant-account", ownerPrincipalId: "42" },
    });
  });

  it("rejects unauthenticated access and fails closed when authenticated tenant context is missing", async () => {
    const router = createDecisionIntelligenceRouter({
      createDecisionProject: vi.fn(), listDecisionProjects: vi.fn(), getDecisionProject: vi.fn(),
      listDecisionAnalysisRuns: vi.fn(),
    } as any);
    const anonymous = router.createCaller({ user: null, tenantId: null } as any);
    await expect(anonymous.listProjects()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const noTenant = router.createCaller({ user: { id: 42, currentTenantId: null }, tenantId: null } as any);
    await expect(noTenant.listProjects()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates bounded reference-only input and scopes project/run operations to the caller", async () => {
    const { caller, service } = setup();
    expect("updateProjectStatus" in caller).toBe(false);

    await expect(caller.createProject({ ...validProject, projectJson: { ...validProject.projectJson, evidence: { secret: true } } } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller.getProject({ projectId: "project-1" });
    await caller.listAnalysisRuns({ projectId: "project-1" });

    expect(service.getDecisionProject).toHaveBeenCalledWith({ projectId: "project-1", authority: { tenantId: "tenant-account", ownerPrincipalId: "42" } });
    expect(service.listDecisionAnalysisRuns).toHaveBeenCalledWith({ projectId: "project-1", authority: { tenantId: "tenant-account", ownerPrincipalId: "42" } });
  });

  it("rejects unsupported project payload versions before persistence", async () => {
    const { caller, service } = setup();
    await expect(caller.createProject({ ...validProject, projectJson: { ...validProject.projectJson, version: "future-version" } } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.createDecisionProject).not.toHaveBeenCalled();
  });

  it("does not disclose persistence driver errors", async () => {
    const { caller } = setup({ listDecisionProjects: vi.fn(async () => { throw new Error("password=secret database host details"); }) });
    let caught: unknown;
    try { await caller.listProjects(); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Decision project service unavailable" });
    expect(String(caught)).not.toMatch(/secret|database host/);
  });

  it("does not reveal another owner's project existence", async () => {
    const { caller } = setup({ getDecisionProject: vi.fn(async () => undefined) });
    await expect(caller.getProject({ projectId: "foreign-project" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
