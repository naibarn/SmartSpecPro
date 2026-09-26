import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bridge: {
    list: vi.fn(),
    get: vi.fn(),
    events: vi.fn(),
    command: vi.fn(),
  },
  auditLog: vi.fn(),
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
