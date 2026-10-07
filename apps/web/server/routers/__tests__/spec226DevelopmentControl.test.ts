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
    requestFullVerification: (...args: unknown[]) => mocks.requestFullVerification(...args),
  }),
  defaultDevelopmentRunPersistenceAdapter: {},
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
