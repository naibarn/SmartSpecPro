import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bridge: {
    list: vi.fn(),
    get: vi.fn(),
    events: vi.fn(),
    command: vi.fn(),
  },
  auditLog: vi.fn(),
  createRun: vi.fn(),
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
  runnerInputStaging: { preStageRunnerInput: vi.fn(), bindSourceToWorkerJob: vi.fn() },
  analyzeVisualReferences: vi.fn(),
  createMiniAppIdentity: vi.fn(async (input: any) => ({ appId: input.preferredAppId })),
  resolveOwnedMiniAppIdentity: vi.fn(async (input: any) => ({ appId: input.appId, tenantId: input.tenantId, ownerUserId: input.ownerUserId, visibility: "private" })),
  resolveMiniAppFactoryHome: vi.fn(),
  getUserGitHubConnection: vi.fn(async () => ({ configured: false, githubLogin: null })),
  developmentRunService: { initialize: vi.fn(async (input: any) => ({ run: input.run, revision: 0, events: [] })) },
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

const CTX = { tenantId: "tenant-acme", user: { id: 42, role: "admin" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("spec226DevelopmentControlRouter", () => {
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
    }));
    expect(mocks.developmentRunService.initialize).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ metadata: expect.objectContaining({ conversationId: 8 }) }),
    }));
    expect(mocks.enqueueMiniAppStage).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ runId: result.runId, tenantId: "tenant-acme", actorId: 42 }),
    }));
    expect(mocks.workspaceSpecSets.resolveWorkspaceRunInput).not.toHaveBeenCalled();
    expect(mocks.runnerInputStaging.preStageRunnerInput).not.toHaveBeenCalled();
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
