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
    adminProcedure: createProcedure(),
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

const automationMocks = vi.hoisted(() => ({
  createAutomationRun: vi.fn(),
  recordAutomationRunStepProgress: vi.fn(),
  recordAutomationCheckpoint: vi.fn(),
  resumeAutomationRunFromCheckpoint: vi.fn(),
  recordAutomationModeChange: vi.fn(),
  getAutomationRunProjection: vi.fn(),
}));
vi.mock("../../services/workAutomationFabricService", () => automationMocks);

const automationExecutionMocks = vi.hoisted(() => ({
  executeAutomationStep: vi.fn(),
}));
vi.mock("../../services/workAutomationExecutionService", () => automationExecutionMocks);

const browserTaskMocks = vi.hoisted(() => ({
  reconcileBrowserAutomationTaskClaims: vi.fn(),
  getBrowserAutomationHealth: vi.fn(),
}));
vi.mock("../../services/workAutomationBrowserTaskService", () => browserTaskMocks);

const policyMocks = vi.hoisted(() => ({
  resolveAutomationLaunchPolicy: vi.fn(),
  buildAutomationPolicySnapshot: vi.fn(),
  resolveAutomationStepRoute: vi.fn(),
}));
vi.mock("../../services/workAutomationPolicyService", () => policyMocks);

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

  it("creates an automation run through the automation fabric service boundary", async () => {
    automationMocks.createAutomationRun.mockResolvedValue({ id: "run-1", caseId: "case-1" });

    const result = await workOsRouter.createAutomationRun({
      input: {
        caseId: "case-1",
        templateKey: "content-production",
        title: "Generate launch assets",
        mode: "semi_auto",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(automationMocks.createAutomationRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      caseId: "case-1",
      templateKey: "content-production",
      title: "Generate launch assets",
      mode: "semi_auto",
    }));
    expect(result).toEqual({ id: "run-1", caseId: "case-1" });
  });

  it("executes an automation step through the execution service boundary", async () => {
    automationExecutionMocks.executeAutomationStep.mockResolvedValue({
      run: { id: "run-1" },
      step: { id: "step-1" },
      checkpoint: null,
      surface: "skill",
      outputRefsJson: ["library-item:1"],
      adapterKind: "skill",
      adapterDetail: { skillId: "general-article-writer" },
      libraryItemId: 1,
      deckId: null,
      agencyRunId: null,
      skillId: "general-article-writer",
    });

    const result = await workOsRouter.executeAutomationStep({
      input: {
        caseId: "case-1",
        runId: "run-1",
        stepKey: "brief",
        stepIndex: 1,
        title: "Brief synthesis",
        prompt: "Draft a concise brief",
        skillId: "general-article-writer",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
        userToken: "user-token",
      },
    } as any);

    expect(automationExecutionMocks.executeAutomationStep).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "brief",
      stepIndex: 1,
      title: "Brief synthesis",
      skillId: "general-article-writer",
      userToken: "user-token",
      actorUserId: 42,
    }));
    expect(result).toEqual(expect.objectContaining({
      adapterKind: "skill",
      outputRefsJson: ["library-item:1"],
    }));
  });

  it("reconciles browser automation tasks through the browser task service boundary", async () => {
    browserTaskMocks.reconcileBrowserAutomationTaskClaims.mockResolvedValue({
      processed: 1,
      completed: 1,
      failed: 0,
      cancelled: 0,
      pending: 0,
    });

    const result = await workOsRouter.reconcileBrowserAutomationTasks({
      input: { limit: 5 },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(browserTaskMocks.reconcileBrowserAutomationTaskClaims).toHaveBeenCalledWith("tenant-1", { limit: 5 });
    expect(result).toEqual({
      processed: 1,
      completed: 1,
      failed: 0,
      cancelled: 0,
      pending: 0,
    });
  });

  it("returns browser automation health through the browser task service boundary", async () => {
    browserTaskMocks.getBrowserAutomationHealth.mockResolvedValue({
      totalClaims: 4,
      pendingClaims: 2,
      claimedClaims: 1,
      queuedClaims: 1,
      runningClaims: 1,
      completedClaims: 1,
      failedClaims: 0,
      cancelledClaims: 0,
      staleClaims: 1,
      distinctCases: 2,
      latestClaimedAt: new Date("2026-04-10T00:00:00.000Z"),
      latestPolledAt: new Date("2026-04-10T00:01:00.000Z"),
      latestUpdatedAt: new Date("2026-04-10T00:02:00.000Z"),
      latestCompletedAt: new Date("2026-04-10T00:03:00.000Z"),
      nextPollAt: new Date("2026-04-10T00:04:00.000Z"),
    });

    const result = await workOsRouter.getBrowserAutomationHealth({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(browserTaskMocks.getBrowserAutomationHealth).toHaveBeenCalledWith("tenant-1");
    expect(result).toEqual(expect.objectContaining({
      pendingClaims: 2,
      staleClaims: 1,
      distinctCases: 2,
    }));
  });

  it("resolves an automation plan through the policy service boundary", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-1",
        sourceType: "chat",
        workType: "content",
        businessDomain: "marketing",
        urgency: "normal",
        riskLevel: "medium",
        classificationConfidence: 0.92,
        title: "Generate launch assets",
        objective: "Create research, copy, storyboard, media, and video",
      },
      case: {
        id: "case-1",
        title: "Generate launch assets",
        summary: "Create research, copy, storyboard, media, and video",
      },
    });
    policyMocks.resolveAutomationLaunchPolicy.mockReturnValue({
      templateKey: "content-production",
      templateFamily: "content-production",
      templateVersion: "content-production.v1",
      templateSource: "case_intake",
      templateTitle: "Content Production Fabric",
      modeResolution: {
        requestedMode: "semi_auto",
        effectiveMode: "fully_auto",
        recommendedMode: "fully_auto",
        downgraded: false,
        reasonCode: "safe_default",
        reason: "Resolved fully_auto from case_intake signals",
        confidence: 0.93,
      },
      stepBlueprints: [],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["manual", "work_os"],
      policyJson: { templateKey: "content-production" },
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({ templateKey: "content-production" });

    const result = await workOsRouter.resolveAutomationPlan({
      input: {
        caseId: "case-1",
        mode: "semi_auto",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(mocks.getWorkCaseProjection).toHaveBeenCalledWith("case-1", "tenant-1");
    expect(policyMocks.resolveAutomationLaunchPolicy).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: null,
      mode: "semi_auto",
    }));
    expect(result).toEqual(expect.objectContaining({
      templateKey: "content-production",
      policyJson: { templateKey: "content-production" },
      caseId: "case-1",
      title: "Generate launch assets",
    }));
  });


  it("resolves requester-safe preflight preview with compatibility-blocked new surfaces", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-10",
        linkedConversationIdsJson: ["chat-1"],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
      },
      case: {
        id: "case-10",
        title: "Launch campaign",
        summary: "Create launch assets",
        ownerType: null,
        ownerId: null,
      },
    });
    policyMocks.resolveAutomationLaunchPolicy.mockReturnValue({
      templateKey: "content-production",
      templateFamily: "content-production",
      templateVersion: "content-production.v1",
      templateSource: "case_intake",
      templateTitle: "Content Production Fabric",
      modeResolution: {
        requestedMode: "fully_auto",
        effectiveMode: "fully_auto",
        recommendedMode: "fully_auto",
        downgraded: false,
        reasonCode: "explicit",
        reason: "Requested fully_auto",
        confidence: 0.9,
      },
      stepBlueprints: [],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill", "agency"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
    });

    const result = await workOsRouter.resolvePreflightPreview({
      input: {
        caseId: "case-10",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(result.previewView).toBe("requester_safe");
    expect(result.diagnostics).toEqual({
      redacted: true,
      visibleReasonCodes: expect.arrayContaining([
        "surface_contract_not_migrated",
      ]),
    });
    expect(result.teamResolution).toEqual(expect.objectContaining({
      code: "resolved_request_default_queue",
      teamId: "team-10",
    }));
    expect(result.capabilityCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "workflow",
          blockedReason: "surface_contract_not_migrated",
        }),
        expect.objectContaining({
          surface: "skill_studio",
          action: "create_private_or_pending_review",
          blockedReason: "surface_contract_not_migrated",
        }),
      ])
    );
  });

  it("keeps preflight diagnostics visible to admins", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-11",
        requesterId: "7",
        title: "Admin preview",
        objective: "Review execution plan",
        defaultQueueId: "team-admin",
      },
      case: {
        id: "case-11",
        title: "Admin preview",
        summary: "Review execution plan",
        ownerType: "queue",
        ownerId: "team-case",
      },
    });
    policyMocks.resolveAutomationLaunchPolicy.mockReturnValue({
      templateKey: "content-production",
      templateFamily: "content-production",
      templateVersion: "content-production.v1",
      templateSource: "case_intake",
      templateTitle: "Content Production Fabric",
      modeResolution: {
        requestedMode: "fully_auto",
        effectiveMode: "fully_auto",
        recommendedMode: "fully_auto",
        downgraded: false,
        reasonCode: "explicit",
        reason: "Requested fully_auto",
        confidence: 0.9,
      },
      stepBlueprints: [],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
    });

    const result = await workOsRouter.resolvePreflightPreview({
      input: {
        caseId: "case-11",
        explicitTeamId: "team-override",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(result.previewView).toBe("admin_diagnostic");
    expect(result.diagnostics).toEqual(
      expect.objectContaining({
        policyJson: { templateKey: "content-production" },
        teamResolution: expect.objectContaining({
          code: "resolved_plan_override",
          teamId: "team-override",
        }),
      })
    );
  });

  it("blocks preflight preview for unrelated non-admin users", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-12",
        requesterId: "42",
        title: "Private request",
        objective: "Do work",
      },
      case: {
        id: "case-12",
        title: "Private request",
        summary: "Do work",
        ownerType: null,
        ownerId: null,
      },
    });

    await expect(
      workOsRouter.resolvePreflightPreview({
        input: {
          caseId: "case-12",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 7, currentTenantId: 1, role: "member" },
        },
      } as any)
    ).rejects.toThrow("You can only preview automation");
  });

  it("resolves a step route through the policy service boundary", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: null,
      case: {
        id: "case-1",
        title: "Generate launch assets",
        summary: "Create research, copy, storyboard, media, and video",
      },
    });
    policyMocks.resolveAutomationLaunchPolicy.mockReturnValue({
      templateKey: "content-production",
      templateFamily: "content-production",
      templateVersion: "content-production.v1",
      templateSource: "case_intake",
      templateTitle: "Content Production Fabric",
      modeResolution: {
        requestedMode: "semi_auto",
        effectiveMode: "semi_auto",
        recommendedMode: "semi_auto",
        downgraded: false,
        reasonCode: "safe_default",
        reason: "Resolved semi_auto from case_intake signals",
        confidence: 0.8,
      },
      stepBlueprints: [{
        stepKey: "research",
        title: "Research",
        surface: "agency",
        allowedSurfaces: ["agency", "manual", "work_os"],
        riskTier: "medium",
        requiresApproval: false,
        checkpointKey: null,
        evidenceType: "research",
        sideEffectClass: "read_only",
      }],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["manual", "work_os"],
      policyJson: { templateKey: "content-production" },
    });
    policyMocks.resolveAutomationStepRoute.mockReturnValue({
      stepKey: "research",
      surface: "agency",
      allowedSurfaces: ["agency", "manual", "work_os"],
      requiresApproval: false,
      checkpointKey: null,
      riskTier: "medium",
      evidenceType: "research",
      sideEffectClass: "read_only",
    });

    const result = await workOsRouter.resolveAutomationStepRoute({
      input: {
        caseId: "case-1",
        stepKey: "research",
        requestedSurface: "agency",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(result).toEqual(expect.objectContaining({
      stepKey: "research",
      surface: "agency",
      caseId: "case-1",
      policyJson: { templateKey: "content-production" },
    }));
  });

  it("resumes an automation checkpoint through the automation fabric service boundary", async () => {
    automationMocks.resumeAutomationRunFromCheckpoint.mockResolvedValue({
      run: { id: "run-1" },
      checkpoint: { id: "checkpoint-2" },
    });

    const result = await workOsRouter.resumeAutomationCheckpoint({
      input: {
        caseId: "case-1",
        runId: "run-1",
        checkpointId: "checkpoint-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(automationMocks.resumeAutomationRunFromCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      checkpointId: "checkpoint-1",
    }));
    expect(result).toEqual({ run: { id: "run-1" }, checkpoint: { id: "checkpoint-2" } });
  });

  it("records automation mode changes through the automation fabric service boundary", async () => {
    automationMocks.recordAutomationModeChange.mockResolvedValue({ run: { id: "run-1" }, event: { id: "evt-1" } });

    const result = await workOsRouter.recordAutomationModeChange({
      input: {
        caseId: "case-1",
        runId: "run-1",
        fromMode: "manual_assist",
        toMode: "fully_auto",
        reason: "confidence threshold reached",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(automationMocks.recordAutomationModeChange).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      fromMode: "manual_assist",
      toMode: "fully_auto",
    }));
    expect(result).toEqual({ run: { id: "run-1" }, event: { id: "evt-1" } });
  });

  it("returns an automation run projection through the automation fabric service boundary", async () => {
    automationMocks.getAutomationRunProjection.mockResolvedValue({
      run: { id: "run-1" },
      steps: [],
      checkpoints: [],
      events: [],
    });

    const result = await workOsRouter.getAutomationRun({
      input: { runId: "run-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(automationMocks.getAutomationRunProjection).toHaveBeenCalledWith("run-1", "tenant-1");
    expect(result).toEqual({
      run: { id: "run-1" },
      steps: [],
      checkpoints: [],
      events: [],
    });
  });
});
