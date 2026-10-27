import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  bridge: {
    list: vi.fn(),
    get: vi.fn(),
    events: vi.fn(),
    command: vi.fn(),
  },
  auditLog: vi.fn(),
  createRun: vi.fn(),
  runnerReadiness: vi.fn(),
  advanceStart: vi.fn(),
  createDeveloperFastLaneJob: vi.fn(),
  requestFullVerification: vi.fn(),
  workspaceSpecSets: {
    availableWorkspaces: vi.fn(),
    bindConversationWorkspace: vi.fn(),
    getConversationWorkspace: vi.fn(),
    ingestSpecSet: vi.fn(),
    prepareWorkspaceRun: vi.fn(),
    resolveWorkspaceRunInput: vi.fn(),
  },
  featureSpecCatalog: { list: vi.fn(), load: vi.fn() },
  runnerInputStaging: { preStageRunnerInput: vi.fn(), bindSourceToWorkerJob: vi.fn() },
  analyzeVisualReferences: vi.fn(),
  createMiniAppIdentity: vi.fn(async (input: any) => ({ appId: input.preferredAppId })),
  resolveOwnedMiniAppIdentity: vi.fn(async (input: any) => ({ appId: input.appId, tenantId: input.tenantId, ownerUserId: input.ownerUserId, visibility: "private" })),
  resolveMiniAppFactoryHome: vi.fn(),
  importMiniAppGitRevisionCandidate: vi.fn(async (input: any) => ({ sourceRef: `r2://mini-app-sources/${input.tenantId}/${input.appId}/sha256/${"c".repeat(64)}`, sourceDigest: "c".repeat(64), bundle: { parentRevision: "b".repeat(40), sourceTreeDigest: "d".repeat(64) } })),
  listMiniAppGitRevisionCandidates: vi.fn(async () => ({ defaultBranch: "main", candidates: [{ branch: "feature/dashboard", revision: "b".repeat(40), isDefault: false }] })),
  restoreMiniAppDeploymentVersion: vi.fn(async (input: any) => ({ appId: input.appId, deploymentVersion: input.deploymentVersion, artifactRef: "r2://mini-app-previews/tenant-synthetic-two/app_synthetic_second/sha256/" + "a".repeat(64) })),
  getUserGitHubConnection: vi.fn(async () => ({ configured: false, githubLogin: null })),
  developmentRunService: {
    initialize: vi.fn(async (input: any) => ({ run: input.run, revision: 0, events: [] })),
    get: vi.fn(),
    recordVerificationEvent: vi.fn(async () => ({ accepted: true })),
  },
  enqueueMiniAppStage: vi.fn(async () => ({ stageId: "ui_implementation", jobId: "hosted-factory-job", created: true, state: "ENQUEUED" })),
  VisionUnavailableError: class MiniAppVisionCapabilityUnavailableError extends Error {},
  workspaceSafeActions: { enqueue: vi.fn(), status: vi.fn() },
}));

vi.mock("../../_core/trpc", () => {
  const procedure: any = {
    input: () => procedure,
    use: () => procedure,
    query: (handler: Function) => Object.assign(handler, { procedureType: "query" }),
    mutation: (handler: Function) => Object.assign(handler, { procedureType: "mutation" }),
  };
  return {
    protectedProcedure: procedure,
    adminProcedure: procedure,
    router: (routes: unknown) => routes,
  };
});

vi.mock("../../services/spec226DevelopmentControlBridge", () => ({
  defaultSpec226DevelopmentControlBridge: mocks.bridge,
}));

vi.mock("../../services/spec224DevelopmentRunPersistence", () => ({
  createPersistedDevelopmentRun: (...args: unknown[]) =>
    mocks.createRun(...args),
  createDevelopmentRunService: () => ({
    initialize: (...args: unknown[]) => mocks.developmentRunService.initialize(...args),
    get: (...args: unknown[]) => mocks.developmentRunService.get(...args),
    recordVerificationEvent: (...args: unknown[]) => mocks.developmentRunService.recordVerificationEvent(...args),
    requestFullVerification: (...args: unknown[]) => mocks.requestFullVerification(...args),
  }),
  defaultDevelopmentRunPersistenceAdapter: {},
}));

vi.mock("../../services/miniAppFactoryStageWorker", () => ({
  enqueueNextMiniAppFactoryStage: (...args: unknown[]) => mocks.enqueueMiniAppStage(...args),
}));

vi.mock("../../services/spec224BackendRuntimeIdentity", () => ({
  getSpec224BackendRuntimeIdentity: () => ({ environment: "test", runtimeRevision: "a".repeat(40), instanceId: "test" }),
}));

vi.mock("../../services/spec224AuthorizationService", () => ({
  defaultSpec224AuthorizationService: {
    runnerReadiness: (...args: unknown[]) => mocks.runnerReadiness(...args),
    advanceStart: (...args: unknown[]) => mocks.advanceStart(...args),
  },
}));

vi.mock("../../services/spec224DeveloperFastLane", () => ({
  DEVELOPER_FAST_LANE_JOB: "developer.fast_lane",
  DEVELOPER_FAST_LANE_CONTRACT: "developer-fast-lane-v1",
  createDeveloperFastLaneJob: (...args: unknown[]) => mocks.createDeveloperFastLaneJob(...args),
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    createTrace: () => "trace-226",
    log: (...args: unknown[]) => mocks.auditLog(...args),
  },
}));

vi.mock("../../services/spec224WorkspaceSpecSet", () => ({
  defaultSpec224WorkspaceSpecSetService: mocks.workspaceSpecSets,
}));

vi.mock("../../services/spec224FeatureSpecCatalog", () => ({
  listRepositoryFeatureSpecs: (...args: unknown[]) => mocks.featureSpecCatalog.list(...args),
  loadRepositoryFeatureSpec: (...args: unknown[]) => mocks.featureSpecCatalog.load(...args),
}));

vi.mock("../../services/spec224RunnerInputStaging", () => ({
  defaultSpec224RunnerInputStagingService: mocks.runnerInputStaging,
}));

vi.mock("../../services/miniAppVisualBlueprint", () => ({
  analyzeMiniAppVisualReferences: mocks.analyzeVisualReferences,
  MiniAppVisionCapabilityUnavailableError: mocks.VisionUnavailableError,
}));

vi.mock("../../services/appIdentityRepository", () => ({
  createPrivateMiniAppIdentity: (...args: unknown[]) => mocks.createMiniAppIdentity(...args),
  resolveOwnedPrivateMiniAppIdentity: (...args: unknown[]) => mocks.resolveOwnedMiniAppIdentity(...args),
}));

vi.mock("../../services/personalMiniAppPreview", () => ({
  importMiniAppGitRevisionCandidate: (...args: unknown[]) => mocks.importMiniAppGitRevisionCandidate(...args),
  listMiniAppGitRevisionCandidates: (...args: unknown[]) => mocks.listMiniAppGitRevisionCandidates(...args),
  restoreMiniAppDeploymentVersion: (...args: unknown[]) => mocks.restoreMiniAppDeploymentVersion(...args),
  resolvePersonalMiniAppFactoryHome: (...args: unknown[]) => mocks.resolveMiniAppFactoryHome(...args),
}));

vi.mock("../../services/userGithubConnectionService", () => ({
  getUserGitHubConnection: (...args: unknown[]) => mocks.getUserGitHubConnection(...args),
}));

vi.mock("../../services/workspaceAuthoritySafeActions", () => ({
  enqueueWorkspaceAuthorityAction: (...args: unknown[]) => mocks.workspaceSafeActions.enqueue(...args),
  getWorkspaceAuthorityActionStatus: (...args: unknown[]) => mocks.workspaceSafeActions.status(...args),
  WorkspaceAuthorityActionError: class WorkspaceAuthorityActionError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
}));

import { spec226DevelopmentControlRouter } from "../spec226DevelopmentControl";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "../../services/miniAppFactoryDurableState";

const CTX = { tenantId: "tenant-acme", user: { id: 42, role: "admin" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runnerReadiness.mockReset().mockResolvedValue({ ready: true, code: "RUNNER_READY", policyDecision: "pending", ownerAction: null, projectId: "project-a", profileId: "spec224-recovery-windows-x64-codex-nonprod" });
  mocks.advanceStart.mockReset().mockResolvedValue({ version: "spec-224-authorization-binding-v1", status: "APPROVAL_REQUIRED", reasons: ["APPROVAL_PENDING"] });
  mocks.workspaceSpecSets.getConversationWorkspace.mockReset().mockResolvedValue({ workspace: { workspaceId: "workspace-a", runnerId: "runner-a" } });
  mocks.featureSpecCatalog.list.mockReset().mockResolvedValue({ specs: [{ id: "224-example", title: "Example", path: "specs/feature/224-example/spec.md", summary: "Example spec" }] });
  mocks.featureSpecCatalog.load.mockReset().mockResolvedValue({ id: "224 Example Spec", title: "Example", path: "specs/feature/224 Example Spec/spec.md", content: "# Example\n" });
  mocks.developmentRunService.get.mockReset().mockRejectedValue(new Error("RUN_NOT_FOUND"));
  mocks.enqueueMiniAppStage.mockReset().mockResolvedValue({ stageId: "ui_implementation", jobId: "hosted-factory-job", created: true, state: "ENQUEUED" });
});

describe("spec226DevelopmentControlRouter", () => {
  it("rejects a not-run Codex probe before source staging or job creation and exposes the exact owner action", async () => {
    mocks.runnerReadiness.mockResolvedValueOnce({ ready: false, code: "CODEX_TASK_PROBE_NOT_RUN", policyDecision: "pending", ownerAction: "Runner → Tools → Codex → ทดสอบสั่งงานจริง" });
    await expect((spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({ ctx: CTX, input: {
      conversationId: 8, mode: "prompt", prompt: "Small scoped change", idempotencyKey: "start-codex-probe-not-run",
    } })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("ทดสอบสั่งงานจริง") });
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.runnerInputStaging.preStageRunnerInput).not.toHaveBeenCalled();
    expect(mocks.advanceStart).not.toHaveBeenCalled();
  });

  it("keeps an explicit Codex policy denial forbidden at Start", async () => {
    mocks.runnerReadiness.mockResolvedValueOnce({ ready: false, code: "CODEX_CAPABILITY_POLICY_DENIED", policyDecision: "denied", ownerAction: null });
    await expect((spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({ ctx: CTX, input: {
      conversationId: 8, mode: "prompt", prompt: "Small scoped change", idempotencyKey: "start-codex-policy-denied",
    } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("resumes authorization for the same Start key without restaging a changing heartbeat snapshot", async () => {
    const input = { conversationId: 8, mode: "prompt", prompt: "Small scoped change", idempotencyKey: "repeat-same-owner-goal-key" };
    const digest = createHash("sha256").update(JSON.stringify({ conversationId: 8, mode: "prompt", prompt: input.prompt,
      specSetRevision: null, workPackageId: null, provider: "codex", visualReferences: [], visualFiles: [], designPreferences: {} })).digest("hex");
    const runId = `run-${createHash("sha256").update(`${CTX.tenantId}:${CTX.user.id}:${input.idempotencyKey}`).digest("hex").slice(0, 40)}`;
    mocks.developmentRunService.get.mockResolvedValueOnce({ run: { runId, workerJobId: "existing-job", state: "DISCOVERY", workspaceId: "workspace-a",
      metadata: { spec224StartRequestDigest: digest, spec224Input: { inputDigest: "c".repeat(64) }, spec224Workspace: { specSetRevision: null, workPackageId: null } } } });
    mocks.advanceStart.mockResolvedValueOnce({ version: "spec-224-authorization-binding-v1", status: "READY_FOR_LIVE", reasons: [] });
    const result = await (spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({ ctx: CTX, input });
    expect(result).toMatchObject({ runId, jobId: "existing-job", idempotent: true, dispatchStatus: "ENQUEUED" });
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.runnerInputStaging.preStageRunnerInput).not.toHaveBeenCalled();
    expect(mocks.advanceStart).toHaveBeenCalledWith(expect.objectContaining({ runId, runnerId: "runner-a" }));
  });

  it("continues an existing owner-scoped Run by ID without creating a replacement", async () => {
    mocks.workspaceSpecSets.getConversationWorkspace.mockResolvedValueOnce({ workspace: {
      runnerId: "runner-a", workspaceId: "workspace-a",
    } });
    mocks.developmentRunService.get.mockResolvedValueOnce({ run: {
      runId: "run-existing", workerJobId: "job-existing", state: "BLOCKED_RECOVERABLE", workspaceId: "workspace-a",
    } });
    mocks.advanceStart.mockResolvedValueOnce({ version: "spec-224-authorization-binding-v1", status: "APPROVAL_REQUIRED", reasons: ["APPROVAL_REQUIRED"] });

    const result = await (spec226DevelopmentControlRouter.resumeWorkspaceRun as unknown as Function)({
      ctx: CTX, input: { conversationId: 233, runId: "run-existing", budgetCapMinorUnits: 100 },
    });

    expect(result).toMatchObject({ runId: "run-existing", jobId: "job-existing", resumedExistingRun: true, dispatchStatus: "PENDING_AUTHORIZATION" });
    expect(mocks.developmentRunService.get).toHaveBeenCalledWith({ tenantId: "tenant-acme", actorId: 42, runId: "run-existing" });
    expect(mocks.advanceStart).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-existing", runnerId: "runner-a", budgetCapMinorUnits: 100 }));
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("does not resume a Run that belongs to another conversation workspace", async () => {
    mocks.workspaceSpecSets.getConversationWorkspace.mockResolvedValueOnce({ workspace: {
      runnerId: "runner-a", workspaceId: "workspace-a",
    } });
    mocks.developmentRunService.get.mockResolvedValueOnce({ run: {
      runId: "run-other", workerJobId: "job-other", state: "DISCOVERY", workspaceId: "workspace-b",
    } });

    await expect((spec226DevelopmentControlRouter.resumeWorkspaceRun as unknown as Function)({
      ctx: CTX, input: { conversationId: 233, runId: "run-other", budgetCapMinorUnits: 100 },
    })).rejects.toMatchObject({ message: "RUN_WORKSPACE_BINDING_MISMATCH" });
    expect(mocks.advanceStart).not.toHaveBeenCalled();
  });

  it("lists candidates for a different authorized owner and bound repository", async () => {
    const appId = "app_synthetic_second";
    const repository = { mode: "USER_OWNED", owner: "synthetic-owner", name: "another-private-app", url: "https://github.com/synthetic-owner/another-private-app", revision: "c".repeat(40) };
    mocks.resolveOwnedMiniAppIdentity.mockResolvedValueOnce({ appId, tenantId: "tenant-synthetic-two", ownerUserId: 73, visibility: "private" });
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({ repository, repositoryState: "BOUND", isInProgress: false });
    const result = await (spec226DevelopmentControlRouter.listMiniAppGitCandidates as unknown as Function)({ ctx: { tenantId: "tenant-synthetic-two", user: { id: 73, role: "user" } }, input: { appId } });
    expect(result).toMatchObject({ defaultBranch: "main", candidates: [{ branch: "feature/dashboard", revision: "b".repeat(40) }] });
    expect(mocks.listMiniAppGitRevisionCandidates).toHaveBeenCalledWith({ tenantId: "tenant-synthetic-two", ownerUserId: 73, repository });
  });

  it("restores a selected immutable app version and refuses rollback during an active build", async () => {
    const appId = "app_synthetic_second";
    mocks.resolveOwnedMiniAppIdentity.mockResolvedValueOnce({ appId, tenantId: "tenant-synthetic-two", ownerUserId: 73, visibility: "private" });
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({ isInProgress: false });
    const context = { tenantId: "tenant-synthetic-two", user: { id: 73, role: "user" } };
    await expect((spec226DevelopmentControlRouter.rollbackMiniAppVersion as unknown as Function)({ ctx: context, input: { appId, deploymentVersion: 1 } })).resolves.toMatchObject({ appId, deploymentVersion: 1 });
    expect(mocks.restoreMiniAppDeploymentVersion).toHaveBeenCalledWith({ tenantId: "tenant-synthetic-two", actorId: 73, ownerUserId: 73, appId, deploymentVersion: 1 });
    mocks.resolveOwnedMiniAppIdentity.mockResolvedValueOnce({ appId, tenantId: "tenant-synthetic-two", ownerUserId: 73, visibility: "private" });
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({ isInProgress: true });
    await expect((spec226DevelopmentControlRouter.rollbackMiniAppVersion as unknown as Function)({ ctx: context, input: { appId, deploymentVersion: 1 } })).rejects.toMatchObject({ message: "MINI_APP_ROLLBACK_BUILD_IN_PROGRESS" });
  });

  it("creates a scoped Developer Fast Lane Job from authenticated admin tenant and actor identity", async () => {
    mocks.createDeveloperFastLaneJob.mockResolvedValueOnce({ created: true, jobId: "job-fast-1", runId: "run-fast-1", workerJobId: "job-fast-1" });
    const input = {
      idempotencyKey: "developer-fast-lane-key-1",
      developerLogin: "dev-user",
      sourceRevision: "a".repeat(40),
      task: "Fix one scoped regression",
      allowedFiles: ["apps/web/server/services/example.ts", "apps/web/server/services/example.test.ts"],
      writableFiles: ["apps/web/server/services/example.ts"],
      tests: { runner: "vitest", cwd: "apps/web", paths: ["apps/web/server/services/example.test.ts"] },
      acceptanceCriteria: ["The focused regression passes"],
    };
    await expect((spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as Function)({ ctx: CTX, input })).resolves.toEqual({
      runId: "run-fast-1", jobId: "job-fast-1", created: true,
    });
    expect(mocks.createDeveloperFastLaneJob).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme", actorId: 42, idempotencyKey: input.idempotencyKey }));
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: 42, tenantId: "tenant-acme", metadata: expect.objectContaining({ jobType: "developer.fast_lane", accepted: true }) }));
  });

  it("does not accept tenant or actor bindings from the Developer request payload", async () => {
    mocks.createDeveloperFastLaneJob.mockResolvedValueOnce({ created: true, jobId: "job-fast-2", runId: "run-fast-2", workerJobId: "job-fast-2" });
    const input = {
      idempotencyKey: "developer-fast-lane-key-2", developerLogin: "dev-user", sourceRevision: "b".repeat(40),
      task: "Task", allowedFiles: ["apps/web/a.ts"], writableFiles: ["apps/web/a.ts"],
      tests: { runner: "vitest", cwd: "apps/web", paths: ["apps/web/a.ts"] }, acceptanceCriteria: ["Done"],
      tenantId: "attacker-tenant", actorId: 999,
    };
    await expect((spec226DevelopmentControlRouter.startDeveloperFastLane as unknown as Function)({ ctx: CTX, input })).resolves.toBeDefined();
    expect(mocks.createDeveloperFastLaneJob).toHaveBeenCalledWith(expect.not.objectContaining({ tenantId: "attacker-tenant", actorId: 999 }));
  });

  it("keeps workspace viewing a query and treats preparation as a mutation", () => {
    expect((spec226DevelopmentControlRouter.getConversationWorkspace as any).procedureType).toBe("query");
    expect((spec226DevelopmentControlRouter.prepareWorkspaceRun as any).procedureType).toBe("mutation");
  });

  it("queues a bounded repair attempt for the owner's failed stage on the same DevelopmentRun", async () => {
    const runId = "run-existing-mini-app";
    const state = createMiniAppFactoryDurableState({ programId: "factory", miniAppId: "app_existing", profile: "PERSONAL_MINIAPP" });
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({
      runId,
      retryable: true,
      currentStage: "ui_implementation",
      jobState: "failed",
    });
    mocks.developmentRunService.get.mockResolvedValueOnce({ run: {
      runId,
      workUnit: { progress: { remainingScope: ["ui_implementation"], completedScope: [] }, dependencies: [] },
      metadata: { [MINI_APP_FACTORY_STATE_KEY]: state },
    } });
    mocks.enqueueMiniAppStage.mockResolvedValueOnce({ stageId: "ui_implementation", jobId: "repair-job-1", created: true, state: "ENQUEUED" });

    await expect((spec226DevelopmentControlRouter.retryMiniAppFactoryStage as unknown as Function)({
      ctx: CTX,
      input: { appId: "app_existing" },
    })).resolves.toEqual({ appId: "app_existing", runId, jobId: "repair-job-1", stageId: "ui_implementation", created: true });
    expect(mocks.developmentRunService.get).toHaveBeenCalledWith({ runId, tenantId: "tenant-acme", actorId: 42 });
    expect(mocks.developmentRunService.recordVerificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      runId,
      idempotencyKey: `miniapp-factory-retry:${runId}:ui_implementation:1`,
      payload: expect.objectContaining({ outcome: "RETRY_SCHEDULED", attempt: 1 }),
    }));
    expect(mocks.enqueueMiniAppStage).toHaveBeenCalledWith(expect.objectContaining({
      run: { runId, tenantId: "tenant-acme", actorId: 42 },
      retrySequence: 1,
    }));
  });

  it("does not create a retry when the latest stage is active or not retryable", async () => {
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({ runId: "run-active", retryable: false, currentStage: "ui_implementation", jobState: "running" });
    await expect((spec226DevelopmentControlRouter.retryMiniAppFactoryStage as unknown as Function)({
      ctx: CTX,
      input: { appId: "app_existing" },
    })).rejects.toMatchObject({ message: "MINI_APP_STAGE_NOT_RETRYABLE" });
    expect(mocks.enqueueMiniAppStage).not.toHaveBeenCalled();
  });

  it("dispatches an authenticated safe action through the scoped worker job gateway", async () => {
    mocks.workspaceSafeActions.enqueue.mockResolvedValueOnce({
      status: "QUEUED", jobId: "job-safe-1", authority: { runnerId: "runner-a", snapshotRevision: "snap-4" },
    });
    await expect((spec226DevelopmentControlRouter.executeWorkspaceAuthoritySafeAction as unknown as Function)({
      ctx: CTX,
      input: { projectId: "project-a", repositoryId: "repo-a", workspaceId: "ws-a",
        action: "RECOVER_WORK", idempotencyKey: "recover-key-1" },
    })).resolves.toEqual({ status: "QUEUED", jobId: "job-safe-1" });
    expect(mocks.workspaceSafeActions.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-acme", actorId: 42, projectId: "project-a", repositoryId: "repo-a",
      workspaceId: "ws-a", action: "RECOVER_WORK", idempotencyKey: "recover-key-1", payload: {},
    }));
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "workspace_authority_action_queued", userId: 42,
      metadata: expect.objectContaining({ jobId: "job-safe-1", action: "RECOVER_WORK", runnerId: "runner-a" }),
    }));
  });

  it("rejects workspace mutation requests that omit their target identity", async () => {
    await expect((spec226DevelopmentControlRouter.executeWorkspaceAuthoritySafeAction as unknown as Function)({
      ctx: CTX,
      input: { projectId: "project-a", repositoryId: "repo-a", action: "RETIRE_SAFE_WORKTREE", idempotencyKey: "retire-key-1" },
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "WORKSPACE_ACTION_WORKSPACE_REQUIRED" });
    expect(mocks.workspaceSafeActions.enqueue).not.toHaveBeenCalled();
  });

  it("requires an administrative role before dispatching safe worktree retirement", async () => {
    await expect((spec226DevelopmentControlRouter.executeWorkspaceAuthoritySafeAction as unknown as Function)({
      ctx: { ...CTX, user: { ...CTX.user, role: "user" } },
      input: { projectId: "project-a", repositoryId: "repo-a", workspaceId: "ws-a",
        action: "RETIRE_SAFE_WORKTREE", idempotencyKey: "retire-key-2" },
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "WORKSPACE_ACTION_ROLE_REQUIRED" });
    expect(mocks.workspaceSafeActions.enqueue).not.toHaveBeenCalled();
  });

  it("projects durable DevelopmentRun status for the bound workspace across Chat sections", async () => {
    mocks.workspaceSpecSets.getConversationWorkspace.mockResolvedValueOnce({
      workspace: { workspaceId: "workspace-a", runnerId: "runner-a" },
      availability: { status: "current", available: true },
      specSet: { revision: 3 },
    });
    mocks.bridge.list.mockResolvedValueOnce([
      { runId: "run-in-scope", workspaceId: "workspace-a", state: "IMPLEMENT", workPackageId: "wp:api", workPackageExternalId: "api", specSetRevision: 3 },
      { runId: "run-other-workspace", workspaceId: "workspace-b", state: "COMPLETED", workPackageId: null, workPackageExternalId: null, specSetRevision: null },
    ]);

    await expect((spec226DevelopmentControlRouter.getConversationWorkspace as unknown as Function)({
      ctx: CTX,
      input: { conversationId: 8 },
    })).resolves.toMatchObject({
      developmentRuns: [{ runId: "run-in-scope", state: "IMPLEMENT", workPackageId: "wp:api", workPackageExternalId: "api", specSetRevision: 3 }],
    });
    expect(mocks.bridge.list).toHaveBeenCalledWith({ tenantId: CTX.tenantId, actorId: CTX.user.id, limit: 20, workspaceId: "workspace-a" });
  });

  it("keeps workspace binding and Spec Set preparation scoped to the authenticated conversation", async () => {
    mocks.workspaceSpecSets.availableWorkspaces.mockResolvedValueOnce([{ runnerId: "runner-a", workspaceId: "workspace-a" }]);
    mocks.workspaceSpecSets.bindConversationWorkspace.mockResolvedValueOnce({ conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a", revision: 1 });
    mocks.workspaceSpecSets.ingestSpecSet.mockResolvedValueOnce({ revision: 1, digest: "a".repeat(64), files: [{ path: "spec.md" }], requirementCount: 1, runnableWorkPackageCount: 1, blockedWorkPackageCount: 0 });
    mocks.workspaceSpecSets.prepareWorkspaceRun.mockResolvedValueOnce({ workspace: { workspaceId: "workspace-a" }, planId: "plan:1", planRevision: 1, contextPackHash: "b".repeat(64), workPackages: [], requirementCount: 1, runnableWorkPackageIds: [], blockers: [] });

    await expect((spec226DevelopmentControlRouter.availableWorkspaces as unknown as Function)({ ctx: CTX, input: {} })).resolves.toMatchObject({ workspaces: [{ workspaceId: "workspace-a" }] });
    await expect((spec226DevelopmentControlRouter.bindConversationWorkspace as unknown as Function)({ ctx: CTX, input: { conversationId: 8, runnerId: "runner-a", workspaceId: "workspace-a", repositoryRef: "repo:smartaihub", baseRevision: "git:abc" } })).resolves.toMatchObject({ revision: 1 });
    await expect((spec226DevelopmentControlRouter.ingestSpecSet as unknown as Function)({ ctx: CTX, input: { conversationId: 8, idempotencyKey: "spec-set-key-0001", artifacts: [{ path: "spec.md", contentBase64: "TUFZVA==" }] } })).resolves.toMatchObject({ requirementCount: 1 });
    await expect((spec226DevelopmentControlRouter.prepareWorkspaceRun as unknown as Function)({ ctx: CTX, input: { conversationId: 8, mode: "spec_set" } })).resolves.toMatchObject({ planId: "plan:1" });

    expect(mocks.workspaceSpecSets.bindConversationWorkspace).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme", actorId: 42, runnerId: "runner-a", workspaceId: "workspace-a" }));
    expect(mocks.workspaceSpecSets.prepareWorkspaceRun).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme", actorId: 42, conversationId: 8, mode: "spec_set" }));
  });

  it("lists Admin feature specs and ingests selected source into the existing conversation Spec Set", async () => {
    mocks.workspaceSpecSets.ingestSpecSet.mockResolvedValueOnce({ revision: 3, digest: "a".repeat(64), files: [{ path: "feature-specs/224-example-5c8fbd15e8.md" }], requirementCount: 2, runnableWorkPackageCount: 1, blockedWorkPackageCount: 0 });

    await expect((spec226DevelopmentControlRouter.listFeatureSpecs as unknown as Function)({ ctx: CTX, input: { search: "Example" } })).resolves.toMatchObject({ specs: [{ id: "224-example" }] });
    await expect((spec226DevelopmentControlRouter.ingestFeatureSpec as unknown as Function)({
      ctx: CTX,
      input: { conversationId: 8, specId: "224 Example Spec", idempotencyKey: "admin-spec-import-1" },
    })).resolves.toMatchObject({ revision: 3, sourceSpec: { id: "224 Example Spec", path: "specs/feature/224 Example Spec/spec.md" } });

    expect(mocks.featureSpecCatalog.list).toHaveBeenCalledWith({ search: "Example" });
    expect(mocks.featureSpecCatalog.load).toHaveBeenCalledWith({ specId: "224 Example Spec" });
    expect(mocks.workspaceSpecSets.ingestSpecSet).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-acme",
      actorId: 42,
      conversationId: 8,
      artifacts: [{ path: expect.stringMatching(/^feature-specs\/224-example-spec-[a-f0-9]{10}\.md$/), contentBase64: Buffer.from("# Example\n").toString("base64") }],
      idempotencyKey: expect.stringMatching(/^feature-spec:[a-f0-9]{10}:admin-spec-import-1$/),
    }));
  });

  it("starts a personal Mini-App on hosted worker_jobs without resolving a Runner workspace", async () => {
    const result = await (spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({
      ctx: CTX,
      input: {
        conversationId: 8,
        mode: "prompt",
        factoryMode: true,
        prompt: "Create a personal expense tracker",
        idempotencyKey: "spec224-factory-screenshot-key-0001",
      },
    });
    expect(result).toMatchObject({
      jobId: "hosted-factory-job",
      factoryStageRunId: result.runId,
      factoryStageId: "ui_implementation",
      miniAppId: expect.stringMatching(/^app_/),
      previewUrl: `https://smartaihub.app/miniapp/${result.miniAppId}`,
      dispatchStatus: "ENQUEUED",
    });
    expect(mocks.createMiniAppIdentity).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-acme",
      ownerUserId: 42,
      idempotencyKey: `spec224:${result.runId}`,
      preferredAppId: result.miniAppId,
    }));
    expect(mocks.developmentRunService.initialize).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({
        goal: "Create a personal expense tracker",
        metadata: expect.objectContaining({ miniAppFactoryProgramState: expect.objectContaining({ profile: "PERSONAL_MINIAPP" }) }),
        workUnit: expect.objectContaining({
          baseRevision: expect.stringMatching(/^source-snapshot:/),
          progress: expect.objectContaining({ remainingScope: ["ui_implementation", "package", "deploy", "smoke"] }),
        }),
      }),
      rootJobDefinition: expect.objectContaining({ jobType: "mini_app_factory.run_anchor", executionClass: "short" }),
    }));
    expect(mocks.developmentRunService.initialize.mock.calls[0]?.[0].run.workUnit.artifacts).toContain("app-repository-state:AUTH_REQUIRED");
    expect(mocks.developmentRunService.initialize).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ metadata: expect.objectContaining({ conversationId: 8 }) }),
    }));
    expect(mocks.enqueueMiniAppStage).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ runId: result.runId, tenantId: "tenant-acme", actorId: 42 }),
    }));
    expect(mocks.workspaceSpecSets.resolveWorkspaceRunInput).not.toHaveBeenCalled();
    expect(mocks.runnerInputStaging.preStageRunnerInput).not.toHaveBeenCalled();
  });

  it("dispatches a second synthetic owner's exact candidate to package without generation", async () => {
    const appId = "app_synthetic_second";
    const revision = "e".repeat(40);
    const repository = { mode: "USER_OWNED", owner: "synthetic-owner", name: "another-private-app", url: "https://github.com/synthetic-owner/another-private-app", revision: "c".repeat(40) };
    const context = { tenantId: "tenant-synthetic-two", user: { id: 73, role: "user" } };
    mocks.resolveOwnedMiniAppIdentity.mockResolvedValueOnce({ appId, tenantId: "tenant-synthetic-two", ownerUserId: 73, visibility: "private", runtimeDataMigrationStatus: "OWNER_CONFIRMED" });
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({ runId: "run-v1", isInProgress: false, artifacts: [], repository, repositoryState: "BOUND" });
    mocks.enqueueMiniAppStage.mockResolvedValueOnce({ stageId: "package", jobId: "candidate-package-job", created: true, state: "ENQUEUED" });

    const result = await (spec226DevelopmentControlRouter.adoptPreparedMiniAppCandidate as unknown as Function)({ ctx: context, input: { appId, branch: "release/thai-dashboard", revision } });

    expect(result).toMatchObject({ appId, jobId: "candidate-package-job", stageId: "package", sourceRevision: revision });
    expect(mocks.importMiniAppGitRevisionCandidate).toHaveBeenCalledWith({ appId, tenantId: "tenant-synthetic-two", ownerUserId: 73, repository, branch: "release/thai-dashboard", revision });
    expect(mocks.developmentRunService.initialize).toHaveBeenCalledWith(expect.objectContaining({ run: expect.objectContaining({
      tenantId: "tenant-synthetic-two",
      actorId: 73,
      repositoryRef: "repo:synthetic-owner/another-private-app",
      baseRevision: `git:${revision}`,
      metadata: expect.objectContaining({ miniAppCandidateAdoption: expect.objectContaining({ revision, branch: "release/thai-dashboard", repository: "synthetic-owner/another-private-app" }) }),
      workUnit: expect.objectContaining({ progress: expect.objectContaining({ completedScope: ["ui_implementation", "source_repository"], remainingScope: ["package", "deploy", "smoke"] }) }),
    }) }));
    expect(mocks.enqueueMiniAppStage).toHaveBeenCalledWith(expect.objectContaining({ run: expect.objectContaining({ runId: result.runId, tenantId: "tenant-synthetic-two", actorId: 73 }) }));
    expect(mocks.enqueueMiniAppStage).toHaveBeenCalledWith(expect.objectContaining({ pipeline: expect.any(Object) }));
    expect(mocks.createMiniAppIdentity).not.toHaveBeenCalled();
  });

  it("refuses candidate adoption when the existing app has no bound dedicated repository", async () => {
    mocks.resolveOwnedMiniAppIdentity.mockResolvedValueOnce({ appId: "app_candidate", tenantId: "tenant-acme", ownerUserId: 42, visibility: "private", runtimeDataMigrationStatus: "OWNER_CONFIRMED" });
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({ runId: "run-v1", isInProgress: false, artifacts: [], repository: null, repositoryState: "PROVISIONING_PENDING" });
    await expect((spec226DevelopmentControlRouter.adoptPreparedMiniAppCandidate as unknown as Function)({ ctx: CTX, input: { appId: "app_candidate", branch: "main", revision: "a".repeat(40) } }))
      .rejects.toMatchObject({ message: "MINI_APP_CANDIDATE_REPOSITORY_NOT_BOUND" });
    expect(mocks.importMiniAppGitRevisionCandidate).not.toHaveBeenCalled();
  });

  it("adds the per-app GitHub source stage when the owner has connected GitHub", async () => {
    mocks.getUserGitHubConnection.mockResolvedValueOnce({ configured: true, githubLogin: "owner" });
    const result = await (spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({
      ctx: CTX,
      input: {
        conversationId: 8,
        mode: "prompt",
        factoryMode: true,
        prompt: "Create a personal Mini-App",
        idempotencyKey: "spec224-factory-with-github-key-0001",
      },
    });
    expect(mocks.developmentRunService.initialize).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({
        workUnit: expect.objectContaining({
          progress: expect.objectContaining({ remainingScope: ["ui_implementation", "package", "deploy", "smoke", "source_repository"] }),
        }),
      }),
    }));
    expect(result.dispatchStatus).toBe("ENQUEUED");
  });

  it("continues a private Mini-App on the same identity, repository and saved source snapshot", async () => {
    const sourceDigest = "c".repeat(64);
    const revision = "d".repeat(40);
    mocks.resolveOwnedMiniAppIdentity.mockResolvedValueOnce({
      appId: "app_existing", tenantId: CTX.tenantId, ownerUserId: 42, visibility: "private",
      lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-acme/app_existing/sha256/" + "a".repeat(64),
      runtimeDataMigrationStatus: "OWNER_CONFIRMED",
    });
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({
      runId: "run-previous-miniapp",
      conversationId: 8,
      sourceSnapshotRef: `r2://mini-app-sources/tenant-acme/app_existing/sha256/${sourceDigest}`,
      appSourceDigest: sourceDigest,
      artifacts: [
        `app-source:r2://mini-app-sources/tenant-acme/app_existing/sha256/${sourceDigest}`,
        `app-source-digest:${sourceDigest}`,
        `app-repository:managed:smartaihub/smartaihub-app-existing@${revision}`,
      ],
      repository: { mode: "SMARTAIHUB_MANAGED", owner: "smartaihub", name: "smartaihub-app-existing", url: "https://github.com/smartaihub/smartaihub-app-existing", revision },
    });
    const result = await (spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({
      ctx: CTX,
      input: {
        conversationId: 8,
        mode: "prompt",
        factoryMode: true,
        appId: "app_existing",
        prompt: "Add a category filter to the existing expense tracker.",
        idempotencyKey: "spec224-factory-feedback-key-0001",
      },
    });
    expect(result.miniAppId).toBe("app_existing");
    expect(mocks.createMiniAppIdentity).not.toHaveBeenCalled();
    expect(mocks.resolveOwnedMiniAppIdentity).toHaveBeenCalledWith({ appId: "app_existing", tenantId: CTX.tenantId, ownerUserId: 42 });
    expect(mocks.developmentRunService.initialize).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({
        repositoryRef: "repo:smartaihub/smartaihub-app-existing",
        baseRevision: `git:${revision}`,
        metadata: expect.objectContaining({ miniAppPreviousRunId: "run-previous-miniapp" }),
        workUnit: expect.objectContaining({
          repositoryId: "github-smartaihub-smartaihub-app-existing",
          artifacts: expect.arrayContaining([`app-source-digest:${sourceDigest}`]),
        }),
      }),
    }));
  });

  it("blocks a new version until the existing artifact data migration is owner-confirmed", async () => {
    mocks.resolveMiniAppFactoryHome.mockResolvedValueOnce({
      runId: "run-existing", conversationId: 8, goal: "Existing app", artifacts: [],
      sourceSnapshotRef: null, appSourceDigest: null, repository: null,
    });
    mocks.resolveOwnedMiniAppIdentity.mockResolvedValueOnce({
      appId: "app_existing", tenantId: CTX.tenantId, ownerUserId: 42, visibility: "private",
      lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-acme/app_existing/sha256/" + "a".repeat(64),
      runtimeDataMigrationStatus: "VERIFIED",
    });
    await expect((spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({
      ctx: CTX,
      input: {
        conversationId: 8,
        mode: "prompt",
        factoryMode: true,
        appId: "app_existing",
        prompt: "Add a category filter.",
        idempotencyKey: "spec224-factory-feedback-unconfirmed-0001",
      },
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.developmentRunService.initialize).not.toHaveBeenCalled();
    expect(mocks.enqueueMiniAppStage).not.toHaveBeenCalled();
  });

  it("returns the permanent App Home when stage enqueue fails so the same run can be retried", async () => {
    mocks.enqueueMiniAppStage.mockRejectedValueOnce(new Error("temporary queue outage"));
    mocks.enqueueMiniAppStage.mockRejectedValueOnce(new Error("temporary queue outage"));
    const result = await (spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({
      ctx: CTX,
      input: {
        conversationId: 8,
        mode: "prompt",
        factoryMode: true,
        prompt: "Create a personal expense tracker",
        idempotencyKey: "spec224-factory-retry-key-0001",
      },
    });
    expect(result).toMatchObject({
      miniAppId: expect.stringMatching(/^app_/),
      previewUrl: `https://smartaihub.app/miniapp/${result.miniAppId}`,
      dispatchStatus: "RETRY_REQUIRED",
      jobId: null,
    });
    expect(mocks.developmentRunService.recordVerificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: `miniapp-factory-enqueue-failed:${result.runId}`,
      payload: expect.objectContaining({ outcome: "START_RETRY_REQUIRED" }),
    }));
    expect(mocks.enqueueMiniAppStage).toHaveBeenCalledTimes(2);
  });

  it("retries a transient enqueue failure on the same durable DevelopmentRun", async () => {
    mocks.enqueueMiniAppStage.mockRejectedValueOnce(new Error("temporary queue outage"));
    mocks.enqueueMiniAppStage.mockResolvedValueOnce({ stageId: "ui_implementation", jobId: "hosted-factory-retry", created: true, state: "ENQUEUED" });
    const result = await (spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({
      ctx: CTX,
      input: {
        conversationId: 8,
        mode: "prompt",
        factoryMode: true,
        prompt: "Create a personal expense tracker",
        idempotencyKey: "spec224-factory-retry-key-0002",
      },
    });

    expect(result).toMatchObject({ dispatchStatus: "ENQUEUED", jobId: "hosted-factory-retry" });
    expect(mocks.developmentRunService.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueMiniAppStage).toHaveBeenCalledTimes(2);
    expect(mocks.developmentRunService.recordVerificationEvent).not.toHaveBeenCalled();
  });

  it("starts a prompt run from server-derived workspace facts and stages bytes before canonical admission", async () => {
    mocks.workspaceSpecSets.resolveWorkspaceRunInput.mockResolvedValueOnce({
      workspace: { workspaceId: "workspace-a", runnerId: "runner-a" },
      runner: { runnerId: "runner-a", snapshotRevision: "snap-1", gitHead: "a".repeat(40), gitBranch: "main", dirty: false, contentFingerprint: "d".repeat(64) },
      goal: "Implement the staged prompt.",
      planId: "plan:ready",
      planRevision: 1,
      contextPackHash: "b".repeat(64),
      repositoryRef: "runner:runner-a/workspace-a",
      baseRevision: `git:${"a".repeat(40)}`,
      specSetRevision: null,
      workPackageId: null,
      allowedWriteSet: ["**"],
      inputFiles: [{ path: "prompt.md", contentBase64: Buffer.from("private request").toString("base64") }],
    });
    mocks.runnerInputStaging.preStageRunnerInput.mockResolvedValueOnce({
      inputSourceRef: "spec224-source:run-1",
      inputDigest: "c".repeat(64),
      totalBytes: 100,
      files: [],
    });
    mocks.createRun.mockImplementationOnce(async (value: any) => ({
      run: value.run,
      jobRef: { jobId: "canonical-job-1", created: true },
    }));
    mocks.runnerInputStaging.bindSourceToWorkerJob.mockResolvedValueOnce(undefined);
    const input = {
      conversationId: 8,
      mode: "prompt",
      prompt: "private request",
      idempotencyKey: "spec224-start-prompt-key-0001",
    };

    const result = await (spec226DevelopmentControlRouter.startWorkspaceRun as unknown as Function)({ ctx: CTX, input });

    expect(result).toMatchObject({
      jobId: "canonical-job-1",
      dispatchStatus: "PENDING_AUTHORIZATION",
      inputDigest: "c".repeat(64),
    });
    expect(mocks.runnerInputStaging.preStageRunnerInput).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: CTX.tenantId,
      startRef: result.runId,
      files: expect.arrayContaining([expect.objectContaining({ path: "prompt.md" }), expect.objectContaining({ path: "spec224-run-context.json" })]),
    }));
    expect(mocks.createRun).toHaveBeenCalledWith(expect.objectContaining({
      deferredAdmission: true,
      run: expect.objectContaining({
        repositoryRef: "runner:runner-a/workspace-a",
        baseRevision: `git:${"a".repeat(40)}`,
        workPackageId: "prompt",
        metadata: expect.objectContaining({
          spec224Input: expect.objectContaining({ inputSourceRef: "spec224-source:run-1" }),
          spec224Execution: { sourceFingerprint: "d".repeat(64), mode: "prompt", allowedWriteSet: ["**"] },
        }),
      }),
    }));
    expect(mocks.runnerInputStaging.bindSourceToWorkerJob).toHaveBeenCalledWith({
      tenantId: CTX.tenantId,
      startRef: result.runId,
      inputSourceRef: "spec224-source:run-1",
      workerJobId: "canonical-job-1",
    });
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain("private request");
  });
  it("requires authenticated tenant scope and records full verification requests", async () => {
    mocks.requestFullVerification.mockResolvedValue({
      state: "NOT_CONFIGURED",
      accepted: true,
      jobId: null,
      revision: 2,
    });
    const input = {
      runId: "run-224-existing-run",
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "spec224-full-verification-request-1",
    };
    const result = await (spec226DevelopmentControlRouter.requestFullVerification as unknown as Function)({
      ctx: CTX,
      input,
    });

    expect(result).toMatchObject({ state: "NOT_CONFIGURED", accepted: true });
    expect(mocks.requestFullVerification).toHaveBeenCalledWith({
      tenantId: "tenant-acme",
      actorId: 42,
      ...input,
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ action: "request_full_verification", state: "NOT_CONFIGURED" }),
    }));
  });

  it("creates an authenticated DevelopmentRun behind the canonical admission hold", async () => {
    mocks.createRun.mockImplementation(async (input: any) => ({
      run: input.run,
      jobRef: { jobId: "canonical-job-1", created: true },
    }));
    const input = {
      goal: "Implement a small approved task",
      repositoryRef: "repo:smartaihub",
      baseRevision: "git:abc123",
      contextPackHash: "a".repeat(64),
      workspaceId: "workspace:certification",
      planId: "plan-1",
      planRevision: 1,
      idempotencyKey: "spec224-create-run-request-1",
      skillIds: [],
      requestedCapabilities: [],
    };
    const invoke = () =>
      (spec226DevelopmentControlRouter.create as unknown as Function)({
        ctx: CTX,
        input,
      });
    const result = await invoke();
    const repeated = await invoke();

    expect(result).toMatchObject({
      jobId: "canonical-job-1",
      state: "DISCOVERY",
      dispatchStatus: "PENDING_AUTHORIZATION",
    });
    expect(mocks.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "codex",
        runtime: "local_runner",
        deferredAdmission: true,
        run: expect.objectContaining({
          tenantId: CTX.tenantId,
          actorId: CTX.user.id,
          workerJobId: null,
        }),
      })
    );
    expect(repeated.runId).toBe(result.runId);

    await (spec226DevelopmentControlRouter.create as unknown as Function)({
      ctx: CTX,
      input: {
        ...input,
        provider: "claude_code",
        idempotencyKey: "spec224-create-claude-request-1",
      },
    });
    expect(mocks.createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "claude_code",
        runtime: "local_runner",
        deferredAdmission: true,
        run: expect.objectContaining({
          tenantId: CTX.tenantId,
          actorId: CTX.user.id,
        }),
      })
    );
  });

  it("uses the authenticated tenant and actor for state and cursor reads", async () => {
    mocks.bridge.get.mockResolvedValueOnce({ runId: "run-226-control" });
    mocks.bridge.events.mockResolvedValueOnce({ events: [], nextCursor: 4 });

    await expect(
      (spec226DevelopmentControlRouter.get as unknown as Function)({
        ctx: CTX,
        input: { runId: "run-226-control" },
      })
    ).resolves.toEqual({ runId: "run-226-control" });
    await expect(
      (spec226DevelopmentControlRouter.events as unknown as Function)({
        ctx: CTX,
        input: { runId: "run-226-control", afterSequence: 3, limit: 20 },
      })
    ).resolves.toMatchObject({ nextCursor: 4 });

    expect(mocks.bridge.get).toHaveBeenCalledWith({
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
    });
    expect(mocks.bridge.events).toHaveBeenCalledWith({
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
      afterSequence: 3,
      limit: 20,
    });
  });

  it("fails closed without a tenant and audits an authorized control action", async () => {
    await expect(
      (spec226DevelopmentControlRouter.list as unknown as Function)({
        ctx: { tenantId: null, user: { id: 42 } },
        input: { limit: 20 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.bridge.command.mockResolvedValueOnce({
      accepted: true,
      run: { runId: "run-226-control", state: "PAUSED_POLICY" },
      revision: 3,
    });
    await expect(
      (spec226DevelopmentControlRouter.command as unknown as Function)({
        ctx: CTX,
        input: {
          runId: "run-226-control",
          action: "pause",
          expectedRevision: 2,
          expectedFencingVersion: 1,
          expectedDecisionEpoch: 3,
          idempotencyKey: "control:pause:1",
        },
      })
    ).resolves.toMatchObject({ accepted: true, revision: 3 });

    expect(mocks.bridge.command).toHaveBeenCalledWith({
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
      action: "pause",
      expectedRevision: 2,
      expectedFencingVersion: 1,
      expectedDecisionEpoch: 3,
      idempotencyKey: "control:pause:1",
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "spec226_development_control",
        tenantId: "tenant-acme",
        userId: 42,
        metadata: expect.objectContaining({ action: "pause", accepted: true }),
      })
    );
  });
});
