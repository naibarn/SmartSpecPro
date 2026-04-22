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

const roomMocks = vi.hoisted(() => ({
  listRoomsByTeam: vi.fn(),
  createRoom: vi.fn(),
  normalizeRoomLanguage: vi.fn((value?: string | null) =>
    value === "th" ? "th" : "en"
  ),
}));
vi.mock("../../services/roomService", () => roomMocks);

const workItemMocks = vi.hoisted(() => ({
  listWorkItemsByRoom: vi.fn(),
}));
vi.mock("../../services/workItemService", () => workItemMocks);

const automationMocks = vi.hoisted(() => ({
  createAutomationRun: vi.fn(),
  recordAutomationRunStepProgress: vi.fn(),
  recordAutomationCheckpoint: vi.fn(),
  resumeAutomationRunFromCheckpoint: vi.fn(),
  recordAutomationModeChange: vi.fn(),
  getAutomationRunProjection: vi.fn(),
}));
vi.mock("../../services/workAutomationFabricService", () => automationMocks);

const runEngineMocks = vi.hoisted(() => ({
  startRun: vi.fn(),
  getRun: vi.fn(),
  advanceRun: vi.fn(),
}));
vi.mock("../../services/runEngine", () => runEngineMocks);

const automationExecutionMocks = vi.hoisted(() => ({
  executeAutomationStep: vi.fn(),
}));
vi.mock(
  "../../services/workAutomationExecutionService",
  () => automationExecutionMocks
);

const browserTaskMocks = vi.hoisted(() => ({
  reconcileBrowserAutomationTaskClaims: vi.fn(),
  getBrowserAutomationHealth: vi.fn(),
}));
vi.mock(
  "../../services/workAutomationBrowserTaskService",
  () => browserTaskMocks
);

const policyMocks = vi.hoisted(() => ({
  resolveAutomationLaunchPolicy: vi.fn(),
  buildAutomationPolicySnapshot: vi.fn(),
  resolveAutomationStepRoute: vi.fn(),
}));
vi.mock("../../services/workAutomationPolicyService", () => policyMocks);

const preflightStoreState = vi.hoisted(() => ({
  currentBundleId: null as string | null,
  bundles: new Map<string, any>(),
}));
const preflightBundleStoreMocks = vi.hoisted(() => ({
  getCurrentPreflightBundle: vi.fn(async () =>
    preflightStoreState.currentBundleId
      ? (preflightStoreState.bundles.get(preflightStoreState.currentBundleId) ?? null)
      : null
  ),
  getPreflightBundle: vi.fn(async ({ preflightBundleId }: any) =>
    preflightStoreState.bundles.get(preflightBundleId) ?? null
  ),
  putPreflightBundle: vi.fn(async ({ bundle, makeCurrent }: any) => {
    preflightStoreState.bundles.set(bundle.id, bundle);
    if (makeCurrent) {
      preflightStoreState.currentBundleId = bundle.id;
    }
    return bundle;
  }),
  transitionPreflightBundleAtomically: vi.fn(
    async ({
      preflightBundleId,
      expectedCurrentBundleId,
      expectedState,
      transform,
      makeCurrent,
    }: any) => {
      if (
        expectedCurrentBundleId !== undefined &&
        preflightStoreState.currentBundleId !== expectedCurrentBundleId
      ) {
        return {
          applied: false,
          reason: "current_bundle_mismatch",
          bundle: preflightStoreState.bundles.get(preflightBundleId) ?? null,
        };
      }

      const existing =
        preflightStoreState.bundles.get(preflightBundleId) ?? null;
      if (!existing) {
        return {
          applied: false,
          reason: "missing_bundle",
          bundle: null,
        };
      }
      if (expectedState && existing.state !== expectedState) {
        return {
          applied: false,
          reason: "state_mismatch",
          bundle: existing,
        };
      }

      const nextBundle = transform(existing);
      preflightStoreState.bundles.set(nextBundle.id, nextBundle);
      if (makeCurrent) {
        preflightStoreState.currentBundleId = nextBundle.id;
      }
      return {
        applied: true,
        reason: "updated",
        bundle: nextBundle,
      };
    },
  ),
}));
vi.mock(
  "../../services/preflightBundleStoreService",
  () => preflightBundleStoreMocks
);

const workOrchestratorFeatureFlagMocks = vi.hoisted(() => ({
  getWorkOrchestratorFeatureFlags: vi.fn(async () => ({
    chatToRequestLaunch: true,
    workflowSurfacePlanning: true,
    skillStudioPlanning: true,
    learningLoopAutomation: true,
    privilegedSurfaceAutoExecution: false,
    approvalSnapshotEnforcement: true,
    launchEnforcement: false,
  })),
}));
vi.mock("../../services/workOrchestratorFeatureFlags", () => workOrchestratorFeatureFlagMocks);

const privateVaultMocks = vi.hoisted(() => ({
  normalizePrivateVaultPrefs: vi.fn(() => null),
  getPrivateVaultPinVersion: vi.fn(() => 1),
  validatePrivateVaultAccessToken: vi.fn(async () => false),
}));
vi.mock("../../services/privateVaultService", () => privateVaultMocks);

const chatServiceMocks = vi.hoisted(() => ({
  getConversationById: vi.fn(async () => undefined),
}));
vi.mock("../../services/chatService", () => chatServiceMocks);

const rolePersistenceMocks = vi.hoisted(() => ({
  getRoleRoutineRunForTenant: vi.fn(async () => null),
}));
vi.mock("../../services/rolePersistence", () => rolePersistenceMocks);

const workpackPersistenceMocks = vi.hoisted(() => ({
  getWorkpackRun: vi.fn(async () => null),
}));
vi.mock("../../services/workpackPersistence", () => workpackPersistenceMocks);

import { workOsRouter } from "../workOs";
import { preflightApprovalBundleSchema } from "../../../shared/workOrchestrator";
import { buildPreflightRevisionFingerprint } from "../../services/preflightRevisionService";

const basePreflightRevision = buildPreflightRevisionFingerprint({
  requestTitle: "Launch campaign",
  requestObjective: "Create launch assets",
  selectedSourceIds: ["case-10", "req-10"],
  policyInputs: {
    templateKey: "content-production",
  },
  generatedAt: "2026-04-21T00:00:00.000Z",
});

function makePreflightBundle(overrides: Record<string, unknown> = {}) {
  return preflightApprovalBundleSchema.parse({
    id: "bundle-1",
    tenantId: "tenant-1",
    requestId: "req-10",
    caseId: "case-10",
    state: "previewed",
    createdAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    previewView: "requester_safe",
    brief: {
      title: "Launch campaign",
      objective: "Create launch assets",
      summary: "Create launch assets",
      sourceRefs: [
        {
          sourceType: "case",
          sourceId: "case-10",
          label: "Launch campaign",
          required: true,
          trust: "trusted",
          freshness: "current",
        },
        {
          sourceType: "request",
          sourceId: "req-10",
          label: "Launch campaign",
          required: true,
          trust: "trusted",
          freshness: "current",
        },
      ],
      approvalSnapshots: [],
      generatedAt: "2026-04-21T00:00:00.000Z",
    },
    capabilityCatalog: [
      {
        id: "skill",
        surface: "skill",
        action: null,
        title: "Skill",
        description: "Selected by policy",
        governance: {
          surface: "skill",
          action: null,
          plannerVisible: true,
          autoExecutableByDefault: true,
          approvalRequired: false,
          minimumGate: "manifest_risk_policy",
          requiredFeatureFlags: [],
          requiredPermissions: ["orchestrator.surface.skill"],
        },
        contractCompatibility: {
          state: "compatible",
          reasonCode: null,
          migrationRequired: false,
        },
        blockedReason: null,
        metadata: {
          selectedByPolicy: true,
          authorityDecision: "allowed",
          reasonCodes: [],
        },
      },
      {
        id: "agency",
        surface: "agency",
        action: null,
        title: "Agency",
        description: "Selected by policy",
        governance: {
          surface: "agency",
          action: null,
          plannerVisible: true,
          autoExecutableByDefault: true,
          approvalRequired: false,
          minimumGate: "capability_risk_policy",
          requiredFeatureFlags: [],
          requiredPermissions: ["orchestrator.surface.agency"],
        },
        contractCompatibility: {
          state: "compatible",
          reasonCode: null,
          migrationRequired: false,
        },
        blockedReason: null,
        metadata: {
          selectedByPolicy: true,
          authorityDecision: "allowed",
          reasonCodes: [],
        },
      },
    ],
    capabilityPlan: {
      id: "capability-plan-1",
      version: "capability-plan.v1",
      selectedCapabilityIds: ["skill", "agency"],
      summary: "Capability plan",
      steps: [
        {
          stepId: "step-1",
          title: "Research",
          selectedCapabilityId: "skill",
          selectedSurface: "skill",
          blockedReasonCodes: [],
          alternativeCapabilityIds: ["skill", "agency"],
        },
      ],
      createdAt: "2026-04-21T00:00:00.000Z",
    },
    executionPlan: {
      id: "execution-plan-1",
      version: "team-execution-plan.v1",
      brief: {
        title: "Launch campaign",
        objective: "Create launch assets",
        summary: "Create launch assets",
        sourceRefs: [
          {
            sourceType: "case",
            sourceId: "case-10",
            label: "Launch campaign",
            required: true,
            trust: "trusted",
            freshness: "current",
          },
          {
            sourceType: "request",
            sourceId: "req-10",
            label: "Launch campaign",
            required: true,
            trust: "trusted",
            freshness: "current",
          },
        ],
        approvalSnapshots: [],
        generatedAt: "2026-04-21T00:00:00.000Z",
      },
      steps: [
        {
          id: "step-1",
          stepKey: "research",
          title: "Research",
          objective: "Research",
          surface: "skill",
          action: null,
          capabilityId: "skill",
          governance: {
            surface: "skill",
            action: null,
            plannerVisible: true,
            autoExecutableByDefault: true,
            approvalRequired: false,
            minimumGate: "manifest_risk_policy",
            requiredFeatureFlags: [],
            requiredPermissions: ["orchestrator.surface.skill"],
          },
          contractCompatibility: {
            state: "compatible",
            reasonCode: null,
            migrationRequired: false,
          },
          expectedArtifacts: ["research"],
          optional: false,
          metadata: {
            stepKey: "research",
            sideEffectClass: "read_only",
          },
        },
      ],
      budget: {
        maxRounds: 12,
        maxTokens: 12000,
        maxToolCalls: 6,
        maxDurationMinutes: 30,
        maxBudgetCredits: 500,
        maxRetries: 1,
        perSurfaceMaxAttempts: {
          skill: 2,
        },
        retryDisposition: "safe_retry",
        sideEffectRetryPolicy: "automatic",
        onExceeded: "pause_for_approval",
      },
      teamResolution: {
        status: "resolved",
        code: "resolved_request_default_queue",
        teamId: "team-10",
        source: "request_default_queue",
        reason: "Resolved from request default queue",
        diagnostics: {},
      },
      preflightRevision: {
        ...basePreflightRevision,
      },
      createdAt: "2026-04-21T00:00:00.000Z",
    },
    teamResolution: {
      status: "resolved",
      code: "resolved_request_default_queue",
      teamId: "team-10",
      source: "request_default_queue",
      reason: "Resolved from request default queue",
      diagnostics: {},
    },
    budget: {
      maxRounds: 12,
      maxTokens: 12000,
      maxToolCalls: 6,
      maxDurationMinutes: 30,
      maxBudgetCredits: 500,
      maxRetries: 1,
      perSurfaceMaxAttempts: {
        skill: 2,
      },
      retryDisposition: "safe_retry",
      sideEffectRetryPolicy: "automatic",
      onExceeded: "pause_for_approval",
    },
    approvalSnapshots: [],
    preflightRevision: {
      ...basePreflightRevision,
    },
    createdByUserId: 42,
    launchedAt: null,
    supersededByBundleId: null,
    approvedAt: null,
    approvedByUserId: null,
    idempotencyRecords: [],
    stateTransitions: [],
    requesterSafeDiagnostics: {
      redacted: true,
      visibleReasonCodes: [],
    },
    adminDiagnostics: {
      visibleReasonCodes: [],
      policyJson: {
        templateKey: "content-production",
      },
    },
    metadata: {},
    ...overrides,
  });
}

describe("workOsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preflightStoreState.currentBundleId = null;
    preflightStoreState.bundles.clear();
    preflightBundleStoreMocks.getCurrentPreflightBundle.mockImplementation(
      async () =>
        preflightStoreState.currentBundleId
          ? (preflightStoreState.bundles.get(preflightStoreState.currentBundleId) ??
            null)
          : null,
    );
    preflightBundleStoreMocks.getPreflightBundle.mockImplementation(
      async ({ preflightBundleId }: any) =>
        preflightStoreState.bundles.get(preflightBundleId) ?? null,
    );
    preflightBundleStoreMocks.putPreflightBundle.mockImplementation(
      async ({ bundle, makeCurrent }: any) => {
        preflightStoreState.bundles.set(bundle.id, bundle);
        if (makeCurrent) {
          preflightStoreState.currentBundleId = bundle.id;
        }
        return bundle;
      },
    );
    preflightBundleStoreMocks.transitionPreflightBundleAtomically.mockImplementation(
      async ({
        preflightBundleId,
        expectedCurrentBundleId,
        expectedState,
        transform,
        makeCurrent,
      }: any) => {
        if (
          expectedCurrentBundleId !== undefined &&
          preflightStoreState.currentBundleId !== expectedCurrentBundleId
        ) {
          return {
            applied: false,
            reason: "current_bundle_mismatch",
            bundle: preflightStoreState.bundles.get(preflightBundleId) ?? null,
          };
        }

        const existing =
          preflightStoreState.bundles.get(preflightBundleId) ?? null;
        if (!existing) {
          return {
            applied: false,
            reason: "missing_bundle",
            bundle: null,
          };
        }
        if (expectedState && existing.state !== expectedState) {
          return {
            applied: false,
            reason: "state_mismatch",
            bundle: existing,
          };
        }

        const nextBundle = transform(existing);
        preflightStoreState.bundles.set(nextBundle.id, nextBundle);
        if (makeCurrent) {
          preflightStoreState.currentBundleId = nextBundle.id;
        }
        return {
          applied: true,
          reason: "updated",
          bundle: nextBundle,
        };
      },
    );
    workOrchestratorFeatureFlagMocks.getWorkOrchestratorFeatureFlags.mockResolvedValue({
      chatToRequestLaunch: true,
      workflowSurfacePlanning: true,
      skillStudioPlanning: true,
      learningLoopAutomation: true,
      privilegedSurfaceAutoExecution: false,
      approvalSnapshotEnforcement: true,
      launchEnforcement: false,
    });
    privateVaultMocks.normalizePrivateVaultPrefs.mockReturnValue(null);
    privateVaultMocks.getPrivateVaultPinVersion.mockReturnValue(1);
    privateVaultMocks.validatePrivateVaultAccessToken.mockResolvedValue(false);
    chatServiceMocks.getConversationById.mockResolvedValue(undefined);
    rolePersistenceMocks.getRoleRoutineRunForTenant.mockResolvedValue(null);
    workpackPersistenceMocks.getWorkpackRun.mockResolvedValue(null);
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
    roomMocks.listRoomsByTeam.mockResolvedValue([]);
    roomMocks.normalizeRoomLanguage.mockImplementation(
      (value?: string | null) => (value === "th" ? "th" : "en")
    );
    roomMocks.createRoom.mockImplementation(async (input: any) => ({
      id: "room-1",
      tenantId: input.tenantId,
      teamId: input.teamId,
      orchestratorUserId: input.orchestratorUserId,
      roomType: input.roomType,
      goalPrompt: input.goalPrompt,
      language: input.language ?? "en",
      title: input.goalPrompt,
      projectId: input.projectId ?? null,
      viewMode: input.viewMode ?? "transparent",
      autonomyLevel: input.autonomyLevel ?? "guided",
      status: "active",
      lastRunId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    runEngineMocks.getRun.mockResolvedValue(null);
    runEngineMocks.advanceRun.mockResolvedValue([]);
    runEngineMocks.startRun.mockImplementation(async (input: any) => ({
      id: "team-run-1",
      roomId: input.roomId,
      teamId: "team-1",
      initiatedByUserId: input.initiatedByUserId,
      executionMode: input.executionMode,
      objective: input.objective,
      constraintsJson: input.constraintsJson ?? null,
      approvalPolicyJson: input.approvalPolicyJson ?? null,
      stopPolicyJson: input.stopPolicy,
      budgetSnapshotJson: null,
      status: "running",
      activeAssistantId: "assistant-1",
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      endedAt: null,
      stopReason: null,
      lastTurnAt: null,
      turnCount: 0,
      summaryArtifactId: null,
      executionModeHint: null,
      currentMode: input.executionMode,
    }));
    workItemMocks.listWorkItemsByRoom.mockResolvedValue([
      {
        id: "task-1",
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "team-run-1",
        routineId: null,
        sourceType: "run_objective",
        sourceRef: "run:team-run-1",
        title: "Kickoff: Generate launch assets",
        objective: "Create a concise launch plan",
        status: "planned",
        revisionVersion: 1,
        threadRootMessageId: null,
        activeDraftArtifactId: null,
        priority: "high",
        riskClass: "medium",
        assignedMemberId: null,
        reviewerMemberId: null,
        approverMemberId: null,
        artifactRefsJson: null,
        approvalState: "not_required",
        dueAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        supersededByWorkItemId: null,
        completedAt: null,
      },
    ] as any);
    mocks.attachLegacyTaskToCase.mockResolvedValue({
      request: null,
      case: { id: "case-1" },
      task: {
        id: "task-1",
      },
      automation: {},
      assignments: [],
      approvals: [],
      exceptions: [],
      outcomes: [],
      slas: [],
      timeline: [],
    });
    preflightBundleStoreMocks.getCurrentPreflightBundle.mockImplementation(
      async () =>
        preflightStoreState.currentBundleId
          ? (preflightStoreState.bundles.get(
              preflightStoreState.currentBundleId
            ) ?? null)
          : null
    );
    preflightBundleStoreMocks.getPreflightBundle.mockImplementation(
      async ({ preflightBundleId }: any) =>
        preflightStoreState.bundles.get(preflightBundleId) ?? null
    );
    preflightBundleStoreMocks.putPreflightBundle.mockImplementation(
      async ({ bundle, makeCurrent }: any) => {
        preflightStoreState.bundles.set(bundle.id, bundle);
        if (makeCurrent) {
          preflightStoreState.currentBundleId = bundle.id;
        }
        return bundle;
      }
    );
  });

  it("creates a canonical work request through the service boundary", async () => {
    mocks.createWorkRequest.mockResolvedValue({
      request: { id: "req-1" },
      case: { id: "case-1" },
    });

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

    expect(mocks.createWorkRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        sourceType: "chat",
        title: "Process invoice",
      })
    );
    expect(result).toEqual({
      request: { id: "req-1" },
      case: { id: "case-1" },
    });
  });

  it("rejects requester overrides for non-admin users", async () => {
    await expect(
      workOsRouter.createRequest({
        input: {
          sourceType: "chat",
          title: "Process invoice",
          requesterId: "99",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("REQUESTER_ID_OVERRIDE_FORBIDDEN");
  });

  it("allows admins to create requests on behalf of another requester", async () => {
    mocks.createWorkRequest.mockResolvedValue({
      request: { id: "req-admin-1" },
      case: { id: "case-admin-1" },
    });

    await workOsRouter.createRequest({
      input: {
        sourceType: "chat",
        title: "Admin intake",
        requesterId: "99",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(mocks.createWorkRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: "99",
      }),
    );
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

    expect(mocks.getWorkCaseProjection).toHaveBeenCalledWith(
      "case-1",
      "tenant-1"
    );
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
    mocks.reassignWorkCase.mockResolvedValue({
      case: { id: "case-1" },
      timeline: [],
    });

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

    expect(mocks.reassignWorkCase).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-1",
        ownerType: "queue",
        ownerId: "queue-1",
        reason: "shift work",
      })
    );
    expect(result).toEqual({ case: { id: "case-1" }, timeline: [] });
  });

  it("creates an automation run through the automation fabric service boundary", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-1",
        requesterId: "42",
        defaultQueueId: "team-1",
        objective: "Create a concise launch plan",
      },
      case: {
        id: "case-1",
        ownerType: "queue",
        ownerId: "team-1",
        riskLevel: "medium",
        summary: "Build launch assets",
        title: "Generate launch assets",
      },
    });
    automationMocks.createAutomationRun.mockResolvedValue({
      id: "run-1",
      caseId: "case-1",
      title: "Generate launch assets",
      objective: "Create a concise launch plan",
      currentMode: "fully_auto",
    });
    mocks.createWorkTask.mockResolvedValue({
      case: { id: "case-1" },
      task: {
        id: "task-1",
        objective: "Create a concise launch plan",
      },
    });
    workItemMocks.listWorkItemsByRoom.mockResolvedValue([
      {
        id: "task-1",
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "team-run-1",
        routineId: null,
        sourceType: "run_objective",
        sourceRef: "run:team-run-1",
        title: "Kickoff: Generate launch assets",
        objective: "Create a concise launch plan",
        status: "superseded",
        revisionVersion: 1,
        threadRootMessageId: null,
        activeDraftArtifactId: null,
        priority: "high",
        riskClass: "medium",
        assignedMemberId: null,
        reviewerMemberId: null,
        approverMemberId: null,
        artifactRefsJson: null,
        approvalState: "not_required",
        dueAt: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:01:00.000Z"),
        supersededByWorkItemId: "task-2",
        completedAt: null,
      },
      {
        id: "task-2",
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "team-run-1",
        routineId: null,
        sourceType: "run_objective",
        sourceRef: "run:team-run-1",
        title: "Kickoff: Generate launch assets",
        objective: "Create a concise launch plan",
        status: "planned",
        revisionVersion: 2,
        threadRootMessageId: null,
        activeDraftArtifactId: null,
        priority: "high",
        riskClass: "medium",
        assignedMemberId: null,
        reviewerMemberId: null,
        approverMemberId: null,
        artifactRefsJson: null,
        approvalState: "not_required",
        dueAt: null,
        createdAt: new Date("2026-04-10T00:02:00.000Z"),
        updatedAt: new Date("2026-04-10T00:02:00.000Z"),
        supersededByWorkItemId: null,
        completedAt: null,
      },
    ] as any);

    const result = await workOsRouter.createAutomationRun({
      input: {
        caseId: "case-1",
        templateKey: "content-production",
        title: "Generate launch assets",
        objective: "Start automation for Generate launch assets",
        mode: "fully_auto",
        createdByUserId: 999,
        createdByAssistantId: "assistant-spoof",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(automationMocks.createAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-1",
        templateKey: "content-production",
        title: "Generate launch assets",
        objective: "Create a concise launch plan",
        mode: "fully_auto",
        preserveRequestedMode: true,
        createdByUserId: 42,
        createdByAssistantId: null,
      })
    );
    expect(roomMocks.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        orchestratorUserId: 42,
        roomType: "auto_team",
        language: "en",
        autonomyLevel: "autonomous",
      })
    );
    expect(runEngineMocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        roomId: "room-1",
        initiatedByUserId: 42,
        executionMode: "auto_team",
        objective: "Create a concise launch plan",
      })
    );
    expect(runEngineMocks.advanceRun).toHaveBeenCalledWith(
      "team-run-1",
      "tenant-1",
      1
    );
    expect(workItemMocks.listWorkItemsByRoom).toHaveBeenCalledWith(
      "room-1",
      "tenant-1"
    );
    expect(mocks.attachLegacyTaskToCase).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-1",
        taskId: "task-2",
        actorUserId: 42,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "run-1",
        caseId: "case-1",
        title: "Generate launch assets",
        objective: "Create a concise launch plan",
        currentMode: "fully_auto",
        kickoff: {
          teamId: "team-1",
          roomId: "room-1",
          teamRunId: "team-run-1",
          workItemId: "task-2",
        },
      })
    );
  });

  it("creates the automation room in the requested language", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-3",
        requesterId: "42",
        defaultQueueId: "team-1",
        objective: "สร้างวิดีโอสั้น",
      },
      case: {
        id: "case-3",
        ownerType: "queue",
        ownerId: "team-1",
        riskLevel: "medium",
        summary: "วิดีโอประเพณีสงกรานต์",
        title: "วิดีโอประเพณีสงกรานต์",
      },
    });
    automationMocks.createAutomationRun.mockResolvedValue({
      id: "run-3",
      caseId: "case-3",
      title: "วิดีโอประเพณีสงกรานต์",
      objective: "สร้างวิดีโอสั้น",
      currentMode: "fully_auto",
    });
    mocks.createWorkTask.mockResolvedValue({
      case: { id: "case-3" },
      task: {
        id: "task-3",
        objective: "สร้างวิดีโอสั้น",
      },
    });
    workItemMocks.listWorkItemsByRoom.mockResolvedValue([
      {
        id: "task-3",
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "team-run-3",
        routineId: null,
        sourceType: "run_objective",
        sourceRef: "run:team-run-3",
        title: "Kickoff: วิดีโอประเพณีสงกรานต์",
        objective: "สร้างวิดีโอสั้น",
        status: "planned",
        revisionVersion: 1,
        threadRootMessageId: null,
        activeDraftArtifactId: null,
        priority: "high",
        riskClass: "medium",
        assignedMemberId: null,
        reviewerMemberId: null,
        approverMemberId: null,
        artifactRefsJson: null,
        approvalState: "not_required",
        dueAt: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
        supersededByWorkItemId: null,
        completedAt: null,
      },
    ] as any);

    const result = await workOsRouter.createAutomationRun({
      input: {
        caseId: "case-3",
        requestId: "req-3",
        title: "วิดีโอประเพณีสงกรานต์",
        objective: "สร้างวิดีโอสั้น",
        mode: "fully_auto",
        roomLanguage: "th",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(roomMocks.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        orchestratorUserId: 42,
        roomType: "auto_team",
        language: "th",
        autonomyLevel: "autonomous",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "run-3",
        kickoff: expect.objectContaining({
          teamId: "team-1",
          roomId: "room-1",
        }),
      })
    );
  });

  it("allows the requester to start automation for their own request", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-2",
        requesterId: "99",
        defaultQueueId: "team-2",
      },
      case: {
        id: "case-2",
        ownerType: "queue",
        ownerId: "team-2",
        riskLevel: "medium",
        summary: "Requester kickoff",
      },
    });
    automationMocks.createAutomationRun.mockResolvedValue({
      id: "run-2",
      caseId: "case-2",
      title: "Requester kickoff",
      objective: "Requester kickoff",
      currentMode: "running",
    });
    mocks.createWorkTask.mockResolvedValue({
      case: { id: "case-2" },
      task: {
        id: "task-2",
        objective: "Requester kickoff",
      },
    });

    const result = await workOsRouter.createAutomationRun({
      input: {
        caseId: "case-2",
        requestId: "req-2",
        title: "Requester kickoff",
        status: "running",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 99, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(automationMocks.createAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-2",
        requestId: "req-2",
        title: "Requester kickoff",
        status: "running",
      })
    );
    expect(roomMocks.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-2",
        orchestratorUserId: 99,
        roomType: "auto_team",
        language: "en",
        autonomyLevel: "autonomous",
      })
    );
    expect(runEngineMocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        roomId: "room-1",
        initiatedByUserId: 99,
        executionMode: "auto_team",
        objective: "Requester kickoff",
      })
    );
    expect(runEngineMocks.advanceRun).toHaveBeenCalledWith(
      "team-run-1",
      "tenant-1",
      1
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "run-2",
        caseId: "case-2",
        title: "Requester kickoff",
        objective: "Requester kickoff",
        currentMode: "running",
        kickoff: {
          teamId: "team-2",
          roomId: "room-1",
          teamRunId: "team-run-1",
          workItemId: "task-1",
        },
      })
    );
  });

  it("blocks legacy direct automation launch when launch enforcement is enabled", async () => {
    workOrchestratorFeatureFlagMocks.getWorkOrchestratorFeatureFlags.mockResolvedValue({
      chatToRequestLaunch: true,
      workflowSurfacePlanning: true,
      skillStudioPlanning: true,
      learningLoopAutomation: true,
      privilegedSurfaceAutoExecution: false,
      approvalSnapshotEnforcement: true,
      launchEnforcement: true,
    });

    await expect(
      workOsRouter.createAutomationRun({
        input: {
          caseId: "case-1",
          title: "Generate launch assets",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "domain_admin" },
        },
      } as any),
    ).rejects.toThrow("PREVIEW_APPROVAL_REQUIRED");
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

    expect(automationExecutionMocks.executeAutomationStep).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-1",
        runId: "run-1",
        stepKey: "brief",
        stepIndex: 1,
        title: "Brief synthesis",
        skillId: "general-article-writer",
        userToken: "user-token",
        actorUserId: 42,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        adapterKind: "skill",
        outputRefsJson: ["library-item:1"],
      })
    );
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

    expect(
      browserTaskMocks.reconcileBrowserAutomationTaskClaims
    ).toHaveBeenCalledWith("tenant-1", { limit: 5 });
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

    expect(browserTaskMocks.getBrowserAutomationHealth).toHaveBeenCalledWith(
      "tenant-1"
    );
    expect(result).toEqual(
      expect.objectContaining({
        pendingClaims: 2,
        staleClaims: 1,
        distinctCases: 2,
      })
    );
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
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
    });

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

    expect(mocks.getWorkCaseProjection).toHaveBeenCalledWith(
      "case-1",
      "tenant-1"
    );
    expect(policyMocks.resolveAutomationLaunchPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: null,
        mode: "semi_auto",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        templateKey: "content-production",
        policyJson: { templateKey: "content-production" },
        caseId: "case-1",
        title: "Generate launch assets",
      })
    );
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
    expect(result.diagnostics).toEqual(expect.objectContaining({
      redacted: true,
      visibleReasonCodes: expect.arrayContaining([
        "surface_contract_not_migrated",
      ]),
    }));
    expect(result.teamResolution).toEqual(expect.objectContaining({
      code: "resolved_request_default_queue",
      teamId: null,
      diagnostics: {},
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
    expect(
      result.capabilityCatalog.every(
        (entry: any) =>
          entry.governance.requiredPermissions.length === 0 &&
          entry.governance.requiredFeatureFlags.length === 0 &&
          !("authorityDecision" in (entry.metadata ?? {})),
      ),
    ).toBe(true);
    expect(
      result.executionPlan?.steps.every(
        (step: any) =>
          step.governance.requiredPermissions.length === 0 &&
          step.governance.requiredFeatureFlags.length === 0,
      ) ?? true,
    ).toBe(true);
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

  it("omits linked conversations that validate to another tenant", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-tenant",
        requesterId: "42",
        title: "Tenant isolated preview",
        objective: "Review only tenant-local context",
        defaultQueueId: "team-tenant",
        linkedConversationIdsJson: ["1"],
        linkedWorkpackRunIdsJson: [],
        linkedRoleRoutineRunIdsJson: [],
      },
      case: {
        id: "case-tenant",
        title: "Tenant isolated preview",
        summary: "Review only tenant-local context",
        ownerType: null,
        ownerId: null,
      },
    });
    chatServiceMocks.getConversationById.mockResolvedValue({
      id: 1,
      tenantId: "tenant-2",
      title: "Other tenant chat",
      createdAt: new Date("2026-04-20T00:00:00.000Z"),
      updatedAt: new Date("2026-04-20T00:00:00.000Z"),
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
        caseId: "case-tenant",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "domain_admin" },
      },
    } as any);

    expect(chatServiceMocks.getConversationById).toHaveBeenCalledWith(1, 42);
    expect(result.brief.sourceRefs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "conversation",
          sourceId: "1",
        }),
      ]),
    );
    expect(result.diagnostics.governedContext.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "conversation",
          sourceId: "1",
          included: false,
          code: "source_selected_but_unavailable",
          adminDetail: "conversation_wrong_tenant",
        }),
      ]),
    );
  });

  it("regenerates a preview bundle and approves it with snapshots", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-13",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-13",
        linkedConversationIdsJson: ["chat-1"],
      },
      case: {
        id: "case-13",
        title: "Launch campaign",
        summary: "Create launch assets",
        ownerType: null,
        ownerId: null,
      },
      task: null,
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
      stepBlueprints: [
        {
          stepKey: "research",
          title: "Research",
          surface: "skill",
          riskTier: "low",
          evidenceType: "brief",
          checkpointKey: "research-complete",
          requiresApproval: false,
          allowedSurfaces: ["skill"],
          sideEffectClass: "read_only",
        },
      ],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
      templateVersion: "content-production.v1",
      modeResolution: {
        requestedMode: "fully_auto",
      },
    });

    const preview = await workOsRouter.resolvePreflightPreview({
      input: {
        caseId: "case-13",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);
    const persistedPreviewBundle =
      preflightBundleStoreMocks.putPreflightBundle.mock.lastCall?.[0]?.bundle;
    if (persistedPreviewBundle) {
      preflightStoreState.bundles.set(
        persistedPreviewBundle.id,
        persistedPreviewBundle,
      );
      preflightStoreState.currentBundleId = persistedPreviewBundle.id;
    }

    const regenerated = await workOsRouter.regeneratePreflightPreview({
      input: {
        caseId: "case-13",
        previousPreflightBundleId: preview.preflightBundleId,
        idempotencyKey: "regen-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(regenerated.state).toBe("previewed");
    expect(regenerated.preflightBundleId).not.toBe(preview.preflightBundleId);

    const approved = await workOsRouter.approvePreflightBundle({
      input: {
        caseId: "case-13",
        preflightBundleId: regenerated.preflightBundleId,
        approvedRevisionHash: regenerated.preflightRevision.fingerprint,
        selectedSourceIds: regenerated.preflightRevision.inputs.selectedSourceIds,
        approvalDecision: "approve",
        idempotencyKey: "approve-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(approved.state).toBe("approved");
    expect(approved.launchReadiness).toEqual(
      expect.objectContaining({
        ready: true,
      }),
    );
  });

  it("invalidates a current preflight bundle", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-14",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-14",
      },
      case: {
        id: "case-14",
        title: "Launch campaign",
        summary: "Create launch assets",
        ownerType: null,
        ownerId: null,
      },
      task: null,
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

    const preview = await workOsRouter.resolvePreflightPreview({
      input: {
        caseId: "case-14",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);
    const persistedPreviewBundle =
      preflightBundleStoreMocks.putPreflightBundle.mock.lastCall?.[0]?.bundle;
    if (persistedPreviewBundle) {
      preflightStoreState.bundles.set(
        persistedPreviewBundle.id,
        persistedPreviewBundle,
      );
      preflightStoreState.currentBundleId = persistedPreviewBundle.id;
    }

    const invalidated = await workOsRouter.invalidatePreflightBundle({
      input: {
        caseId: "case-14",
        preflightBundleId: preview.preflightBundleId,
        reasonCode: "request_edited",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(invalidated).toEqual(
      expect.objectContaining({
        preflightBundleId: preview.preflightBundleId,
        state: "stale",
      }),
    );
  });

  it("launches approved automation from a preflight bundle", async () => {
    let storedBundle: any = null;
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-15",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-15",
      },
      case: {
        id: "case-15",
        title: "Launch campaign",
        summary: "Create launch assets",
        ownerType: null,
        ownerId: null,
      },
      task: null,
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
      stepBlueprints: [
        {
          stepKey: "research",
          title: "Research",
          surface: "skill",
          riskTier: "low",
          evidenceType: "brief",
          checkpointKey: "research-complete",
          requiresApproval: false,
          allowedSurfaces: ["skill"],
          sideEffectClass: "read_only",
        },
      ],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
      templateVersion: "content-production.v1",
      modeResolution: {
        requestedMode: "fully_auto",
      },
    });
    preflightBundleStoreMocks.getCurrentPreflightBundle.mockImplementation(
      async () => storedBundle
    );
    preflightBundleStoreMocks.getPreflightBundle.mockImplementation(
      async (input: any) =>
        storedBundle && storedBundle.id === input.preflightBundleId
          ? storedBundle
          : null
    );
    preflightBundleStoreMocks.putPreflightBundle.mockImplementation(
      async (input: any) => {
        storedBundle = input.bundle;
        return input.bundle;
      }
    );
    preflightBundleStoreMocks.transitionPreflightBundleAtomically.mockImplementation(
      async ({
        expectedCurrentBundleId,
        expectedState,
        transform,
      }: any) => {
        if (
          expectedCurrentBundleId !== undefined &&
          storedBundle?.id !== expectedCurrentBundleId
        ) {
          return {
            applied: false,
            reason: "current_bundle_mismatch",
            bundle: storedBundle,
          };
        }
        if (expectedState && storedBundle?.state !== expectedState) {
          return {
            applied: false,
            reason: "state_mismatch",
            bundle: storedBundle,
          };
        }
        storedBundle = transform(storedBundle);
        return {
          applied: true,
          reason: "updated",
          bundle: storedBundle,
        };
      },
    );
    automationMocks.createAutomationRun.mockResolvedValue({
      id: "run-15",
      tenantId: "tenant-1",
      caseId: "case-15",
      requestId: "req-15",
      taskId: null,
      title: "Launch campaign",
      objective: "Create launch assets",
      currentMode: "fully_auto",
      status: "pending",
    });

    const preview = await workOsRouter.resolvePreflightPreview({
      input: {
        caseId: "case-15",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);
    const approved = await workOsRouter.approvePreflightBundle({
      input: {
        caseId: "case-15",
        preflightBundleId: preview.preflightBundleId,
        approvedRevisionHash: preview.preflightRevision.fingerprint,
        selectedSourceIds: preview.preflightRevision.inputs.selectedSourceIds,
        approvalDecision: "approve",
        idempotencyKey: "approve-launch-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    const launched = await workOsRouter.launchApprovedAutomation({
      input: {
        caseId: "case-15",
        preflightBundleId: preview.preflightBundleId,
        approvedRevisionHash: preview.preflightRevision.fingerprint,
        idempotencyKey: "launch-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(approved.state).toBe("approved");
    expect(automationMocks.createAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: "case-15",
        requestId: "req-15",
        policyJson: expect.objectContaining({
          workOrchestrator: expect.objectContaining({
            preflightBundle: expect.objectContaining({
              id: preview.preflightBundleId,
              state: "launching",
            }),
          }),
        }),
      }),
    );
    expect(launched).toEqual(
      expect.objectContaining({
        automationRunId: "run-15",
        preflightBundleId: preview.preflightBundleId,
        state: "launched",
      }),
    );
  });

  it("rolls launch state back to launch_blocked and replays a stable error when automation run creation fails", async () => {
    const bundle = makePreflightBundle({
      state: "approved",
      approvedAt: "2026-04-21T01:00:00.000Z",
      approvedByUserId: 42,
    });
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-10",
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
      stepBlueprints: [
        {
          stepKey: "research",
          title: "Research",
          surface: "skill",
          allowedSurfaces: ["skill"],
          riskTier: "low",
          requiresApproval: false,
          checkpointKey: null,
          evidenceType: "research",
          sideEffectClass: "read_only",
        },
      ],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
    });
    preflightStoreState.bundles.set(bundle.id, bundle);
    preflightStoreState.currentBundleId = bundle.id;
    preflightBundleStoreMocks.getPreflightBundle.mockImplementation(
      async ({ preflightBundleId }: any) =>
        preflightStoreState.bundles.get(preflightBundleId) ?? null,
    );
    preflightBundleStoreMocks.getCurrentPreflightBundle.mockImplementation(
      async () =>
        preflightStoreState.currentBundleId
          ? (preflightStoreState.bundles.get(preflightStoreState.currentBundleId) ??
              null)
          : null,
    );
    automationMocks.createAutomationRun.mockRejectedValue(new Error("launch boom"));

    await expect(
      workOsRouter.launchApprovedAutomation({
        input: {
          caseId: "case-10",
          preflightBundleId: "bundle-1",
          approvedRevisionHash: basePreflightRevision.fingerprint,
          idempotencyKey: "launch-error-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("AUTOMATION_RUN_CREATE_FAILED");

    const persisted = preflightStoreState.bundles.get("bundle-1");
    expect(persisted).toEqual(
      expect.objectContaining({
        state: "launch_blocked",
        idempotencyRecords: expect.arrayContaining([
          expect.objectContaining({
            operation: "launch_approved_automation",
            idempotencyKey: "launch-error-1",
            result: expect.objectContaining({
              state: "launch_blocked",
              errorCode: "AUTOMATION_RUN_CREATE_FAILED",
            }),
          }),
        ]),
      }),
    );

    automationMocks.createAutomationRun.mockClear();
    await expect(
      workOsRouter.launchApprovedAutomation({
        input: {
          caseId: "case-10",
          preflightBundleId: "bundle-1",
          approvedRevisionHash: basePreflightRevision.fingerprint,
          idempotencyKey: "launch-error-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("AUTOMATION_RUN_CREATE_FAILED");
    expect(automationMocks.createAutomationRun).not.toHaveBeenCalled();
  });

  it("records idempotency for pre-launch team resolution failures", async () => {
    const bundle = makePreflightBundle({
      state: "approved",
      approvedAt: "2026-04-21T01:00:00.000Z",
      approvedByUserId: 42,
      teamResolution: {
        status: "resolved",
        code: "resolved_request_default_queue",
        teamId: "team-10",
        source: "request_default_queue",
        reason: "Resolved from request default queue",
        diagnostics: {},
      },
    });
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: null,
        linkedConversationIdsJson: [],
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
      surfaceAllowlist: ["skill"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
    });
    preflightStoreState.bundles.set(bundle.id, bundle);
    preflightStoreState.currentBundleId = bundle.id;
    preflightBundleStoreMocks.getPreflightBundle.mockImplementation(
      async ({ preflightBundleId }: any) =>
        preflightStoreState.bundles.get(preflightBundleId) ?? null,
    );
    preflightBundleStoreMocks.getCurrentPreflightBundle.mockImplementation(
      async () =>
        preflightStoreState.currentBundleId
          ? (preflightStoreState.bundles.get(preflightStoreState.currentBundleId) ??
              null)
          : null,
    );

    await expect(
      workOsRouter.launchApprovedAutomation({
        input: {
          caseId: "case-10",
          preflightBundleId: "bundle-1",
          approvedRevisionHash: basePreflightRevision.fingerprint,
          idempotencyKey: "launch-missing-team-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("MISSING_TEAM");

    const persisted = preflightStoreState.bundles.get("bundle-1");
    expect(persisted).toEqual(
      expect.objectContaining({
        state: "launch_blocked",
        idempotencyRecords: expect.arrayContaining([
          expect.objectContaining({
            operation: "launch_approved_automation",
            idempotencyKey: "launch-missing-team-1",
            result: expect.objectContaining({
              state: "launch_blocked",
              errorCode: "MISSING_TEAM",
            }),
          }),
        ]),
      }),
    );

    automationMocks.createAutomationRun.mockClear();
    await expect(
      workOsRouter.launchApprovedAutomation({
        input: {
          caseId: "case-10",
          preflightBundleId: "bundle-1",
          approvedRevisionHash: basePreflightRevision.fingerprint,
          idempotencyKey: "launch-missing-team-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("MISSING_TEAM");
    expect(automationMocks.createAutomationRun).not.toHaveBeenCalled();
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

  it("blocks approved launches for unrelated non-admin users", async () => {
    const bundle = makePreflightBundle({
      state: "approved",
      approvedAt: "2026-04-21T01:00:00.000Z",
      approvedByUserId: 42,
    });
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
      },
      case: {
        id: "case-10",
        title: "Launch campaign",
        summary: "Create launch assets",
        ownerType: null,
        ownerId: null,
      },
    });
    preflightBundleStoreMocks.getPreflightBundle.mockResolvedValue(bundle);

    await expect(
      workOsRouter.launchApprovedAutomation({
        input: {
          caseId: "case-10",
          preflightBundleId: "bundle-1",
          approvedRevisionHash: basePreflightRevision.fingerprint,
          idempotencyKey: "launch-forbidden-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 7, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("You can only preview automation");
  });

  it("approves a preflight bundle with immutable source snapshots", async () => {
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-10",
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
      stepBlueprints: [
        {
          stepKey: "research",
          title: "Research",
          surface: "skill",
          allowedSurfaces: ["skill", "agency"],
          riskTier: "low",
          requiresApproval: false,
          checkpointKey: null,
          evidenceType: "research",
          sideEffectClass: "read_only",
        },
      ],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill", "agency"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({});

    const preview = await workOsRouter.resolvePreflightPreview({
      input: {
        caseId: "case-10",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    const result = await workOsRouter.approvePreflightBundle({
      input: {
        caseId: "case-10",
        preflightBundleId: preview.preflightBundleId,
        approvedRevisionHash: preview.preflightRevision.fingerprint,
        selectedSourceIds: preview.preflightRevision.inputs.selectedSourceIds,
        approvalDecision: "approve",
        idempotencyKey: "approve-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(result.state).toBe("approved");
    expect(result.approvalSnapshots).toEqual([]);
    const storedBundle = preflightStoreState.bundles.get(preview.preflightBundleId);
    expect(storedBundle).toEqual(
      expect.objectContaining({
        state: "approved",
        approvalSnapshots: expect.arrayContaining([
          expect.objectContaining({
            source: expect.objectContaining({ sourceId: "case-10" }),
          }),
          expect.objectContaining({
            source: expect.objectContaining({ sourceId: "req-10" }),
          }),
        ]),
      }),
    );
  });

  it("revalidates approval input before replaying an already-approved bundle", async () => {
    const bundle = makePreflightBundle({
      state: "approved",
      approvedAt: "2026-04-21T01:00:00.000Z",
      approvedByUserId: 42,
    });
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-10",
      },
      case: {
        id: "case-10",
        title: "Launch campaign",
        summary: "Create launch assets",
        ownerType: null,
        ownerId: null,
      },
    });
    preflightStoreState.bundles.set(bundle.id, bundle);
    preflightStoreState.currentBundleId = bundle.id;
    preflightBundleStoreMocks.getPreflightBundle.mockResolvedValue(bundle);
    preflightBundleStoreMocks.getCurrentPreflightBundle.mockResolvedValue(bundle);

    await expect(
      workOsRouter.approvePreflightBundle({
        input: {
          caseId: "case-10",
          preflightBundleId: bundle.id,
          approvedRevisionHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          selectedSourceIds: bundle.preflightRevision.inputs.selectedSourceIds,
          approvalDecision: "approve",
          idempotencyKey: "approve-already-approved-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("PREVIEW_STALE");
  });

  it("returns requester-safe preflight bundle reads without admin diagnostics", async () => {
    const bundle = makePreflightBundle({
      state: "approved",
      approvedAt: "2026-04-21T01:00:00.000Z",
      approvedByUserId: 42,
      adminDiagnostics: {
        visibleReasonCodes: ["surface_contract_not_migrated"],
        policyJson: { templateKey: "content-production" },
      },
      requesterSafeDiagnostics: {
        redacted: true,
        visibleReasonCodes: ["surface_contract_not_migrated"],
      },
    });
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-10",
      },
      case: {
        id: "case-10",
        title: "Launch campaign",
        summary: "Create launch assets",
        ownerType: null,
        ownerId: null,
      },
    });
    preflightBundleStoreMocks.getPreflightBundle.mockResolvedValue(bundle);

    const result = await workOsRouter.getPreflightBundle({
      input: {
        caseId: "case-10",
        preflightBundleId: "bundle-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(result.state).toBe("approved");
    expect(result.diagnostics).toEqual({
      redacted: true,
      visibleReasonCodes: ["surface_contract_not_migrated"],
    });
    expect(result.teamResolution).toEqual(
      expect.objectContaining({
        code: "resolved_request_default_queue",
        teamId: null,
        diagnostics: {},
      }),
    );
  });

  it("launches an approved bundle into automation and Team kickoff", async () => {
    const bundle = makePreflightBundle({
      state: "approved",
      approvedAt: "2026-04-21T01:00:00.000Z",
      approvedByUserId: 42,
    });
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-10",
        linkedConversationIdsJson: [],
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
      stepBlueprints: [
        {
          stepKey: "research",
          title: "Research",
          surface: "skill",
          allowedSurfaces: ["skill", "agency", "manual", "work_os"],
          riskTier: "low",
          requiresApproval: false,
          checkpointKey: null,
          evidenceType: "research",
          sideEffectClass: "read_only",
        },
      ],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill", "agency"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
    });
    automationMocks.createAutomationRun.mockResolvedValue({
      id: "run-1",
      caseId: "case-10",
      requestId: "req-10",
      taskId: null,
      templateKey: "content-production",
      templateVersion: "content-production.v1",
      templateFamily: "content-production",
      templateSource: "case_intake",
      title: "Launch campaign",
      objective: "Create launch assets",
      currentMode: "fully_auto",
      status: "pending",
    });
    preflightStoreState.bundles.set(bundle.id, bundle);
    preflightStoreState.currentBundleId = bundle.id;
    preflightBundleStoreMocks.getPreflightBundle.mockResolvedValue(bundle);
    preflightBundleStoreMocks.getCurrentPreflightBundle.mockResolvedValue(bundle);
    preflightBundleStoreMocks.putPreflightBundle.mockImplementation(
      async (input: any) => input.bundle
    );

    const result = await workOsRouter.launchApprovedAutomation({
      input: {
        caseId: "case-10",
        preflightBundleId: "bundle-1",
        approvedRevisionHash: basePreflightRevision.fingerprint,
        idempotencyKey: "launch-1",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1, role: "member" },
      },
    } as any);

    expect(automationMocks.createAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-10",
        policyJson: expect.objectContaining({
          workOrchestrator: expect.objectContaining({
            preflightBundle: expect.objectContaining({
              id: "bundle-1",
              state: "launching",
            }),
          }),
        }),
      })
    );
    expect(runEngineMocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        constraintsJson: expect.objectContaining({
          workOrchestrator: expect.objectContaining({
            preflightBundle: expect.objectContaining({
              id: "bundle-1",
              state: "launching",
            }),
          }),
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        automationRunId: "run-1",
        teamId: "team-10",
        roomId: "room-1",
        teamRunId: "team-run-1",
        preflightBundleId: "bundle-1",
        state: "launched",
      })
    );
  });

  it("marks the automation run failed and records a stable kickoff error when Team kickoff cannot start", async () => {
    const bundle = makePreflightBundle({
      state: "approved",
      approvedAt: "2026-04-21T01:00:00.000Z",
      approvedByUserId: 42,
    });
    mocks.getWorkCaseProjection.mockResolvedValue({
      request: {
        id: "req-10",
        requesterId: "42",
        title: "Launch campaign",
        objective: "Create launch assets",
        defaultQueueId: "team-10",
        linkedConversationIdsJson: [],
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
      stepBlueprints: [
        {
          stepKey: "research",
          title: "Research",
          surface: "skill",
          allowedSurfaces: ["skill", "agency", "manual", "work_os"],
          riskTier: "low",
          requiresApproval: false,
          checkpointKey: null,
          evidenceType: "research",
          sideEffectClass: "read_only",
        },
      ],
      approvalGateStepKeys: [],
      surfaceAllowlist: ["skill", "agency"],
      policyJson: {},
    });
    policyMocks.buildAutomationPolicySnapshot.mockReturnValue({
      templateKey: "content-production",
    });
    automationMocks.createAutomationRun.mockResolvedValue({
      id: "run-kickoff-failed",
      caseId: "case-10",
      requestId: "req-10",
      taskId: null,
      templateKey: "content-production",
      templateVersion: "content-production.v1",
      templateFamily: "content-production",
      templateSource: "case_intake",
      title: "Launch campaign",
      objective: "Create launch assets",
      currentMode: "fully_auto",
      status: "pending",
    });
    automationMocks.recordAutomationRunStepProgress.mockResolvedValue({
      run: { id: "run-kickoff-failed", status: "failed" },
      step: { id: "team-kickoff" },
      checkpoint: null,
    });
    roomMocks.createRoom.mockRejectedValue(new Error("room unavailable"));
    preflightStoreState.bundles.set(bundle.id, bundle);
    preflightStoreState.currentBundleId = bundle.id;

    await expect(
      workOsRouter.launchApprovedAutomation({
        input: {
          caseId: "case-10",
          preflightBundleId: "bundle-1",
          approvedRevisionHash: basePreflightRevision.fingerprint,
          idempotencyKey: "launch-kickoff-failed-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("TEAM_KICKOFF_FAILED");

    expect(automationMocks.recordAutomationRunStepProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-10",
        runId: "run-kickoff-failed",
        stepKey: "team_kickoff",
        status: "failed",
        runStatus: "failed",
        finalDisposition: "failed",
        finalDispositionReason: "team_kickoff_failed",
        createdByUserId: 42,
      }),
    );
    const persisted = preflightStoreState.bundles.get("bundle-1");
    expect(persisted).toEqual(
      expect.objectContaining({
        state: "launch_blocked",
        metadata: expect.objectContaining({
          automationRunId: "run-kickoff-failed",
        }),
        idempotencyRecords: expect.arrayContaining([
          expect.objectContaining({
            operation: "launch_approved_automation",
            idempotencyKey: "launch-kickoff-failed-1",
            result: expect.objectContaining({
              automationRunId: "run-kickoff-failed",
              state: "launch_blocked",
              errorCode: "TEAM_KICKOFF_FAILED",
            }),
          }),
        ]),
      }),
    );

    automationMocks.createAutomationRun.mockClear();
    await expect(
      workOsRouter.launchApprovedAutomation({
        input: {
          caseId: "case-10",
          preflightBundleId: "bundle-1",
          approvedRevisionHash: basePreflightRevision.fingerprint,
          idempotencyKey: "launch-kickoff-failed-1",
        },
        ctx: {
          tenantId: "tenant-1",
          user: { id: 42, currentTenantId: 1, role: "member" },
        },
      } as any),
    ).rejects.toThrow("TEAM_KICKOFF_FAILED");
    expect(automationMocks.createAutomationRun).not.toHaveBeenCalled();
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
      stepBlueprints: [
        {
          stepKey: "research",
          title: "Research",
          surface: "agency",
          allowedSurfaces: ["agency", "manual", "work_os"],
          riskTier: "medium",
          requiresApproval: false,
          checkpointKey: null,
          evidenceType: "research",
          sideEffectClass: "read_only",
        },
      ],
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

    expect(result).toEqual(
      expect.objectContaining({
        stepKey: "research",
        surface: "agency",
        caseId: "case-1",
        policyJson: { templateKey: "content-production" },
      })
    );
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

    expect(
      automationMocks.resumeAutomationRunFromCheckpoint
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-1",
        runId: "run-1",
        checkpointId: "checkpoint-1",
      })
    );
    expect(result).toEqual({
      run: { id: "run-1" },
      checkpoint: { id: "checkpoint-2" },
    });
  });

  it("records automation mode changes through the automation fabric service boundary", async () => {
    automationMocks.recordAutomationModeChange.mockResolvedValue({
      run: { id: "run-1" },
      event: { id: "evt-1" },
    });

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

    expect(automationMocks.recordAutomationModeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        caseId: "case-1",
        runId: "run-1",
        fromMode: "manual_assist",
        toMode: "fully_auto",
      })
    );
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

    expect(automationMocks.getAutomationRunProjection).toHaveBeenCalledWith(
      "run-1",
      "tenant-1"
    );
    expect(result).toEqual({
      run: { id: "run-1" },
      steps: [],
      checkpoints: [],
      events: [],
    });
  });
});
