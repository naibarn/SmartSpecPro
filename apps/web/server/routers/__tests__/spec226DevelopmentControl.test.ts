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
}));

vi.mock("../../_core/trpc", () => {
  const procedure: any = {
    input: () => procedure,
    use: () => procedure,
    query: (handler: Function) => handler,
    mutation: (handler: Function) => handler,
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

import { spec226DevelopmentControlRouter } from "../spec226DevelopmentControl";

const CTX = { tenantId: "tenant-acme", user: { id: 42 } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("spec226DevelopmentControlRouter", () => {
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
