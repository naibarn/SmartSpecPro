import { describe, expect, it, vi } from "vitest";

import {
  acceptAgentEvent,
  AgentAdapterRegistry,
  buildAgentJobDefinition,
  validateAgentTaskManifest,
  type AgentEvent,
  type AgentAdapter,
  type AgentTaskManifest,
} from "../agentControlPlaneContracts";

const manifest: AgentTaskManifest = {
  taskId: "task-1",
  tenantId: "tenant-1",
  actorId: 5,
  goalId: "goal-1",
  planId: "plan-1",
  planRevision: 2,
  provider: "codex",
  runtime: "local_runner",
  workspaceId: "workspace-1",
  workPackageId: "wp:package-a",
  contextPackageIds: ["context-1"],
  skillIds: ["skill-1"],
  mcpGrantIds: [],
  requestedCapabilities: ["code.edit"],
};

describe("Feature 200 Agent control-plane contracts", () => {
  it("validates provider-neutral manifests and rejects credential leakage", () => {
    expect(validateAgentTaskManifest(manifest)).toMatchObject({
      provider: "codex",
      planRevision: 2,
      workPackageId: "wp:package-a",
    });
    expect(() =>
      validateAgentTaskManifest({
        ...manifest,
        apiKey: "secret",
      } as AgentTaskManifest)
    ).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
    expect(() =>
      validateAgentTaskManifest({
        ...manifest,
        skillIds: undefined,
      } as unknown as AgentTaskManifest)
    ).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
  });

  it("validates immutable Runner policy bindings when external dispatch is requested", () => {
    const bound = {
      ...manifest,
      policyBinding: {
        runnerId: "runner-1",
        runnerSessionId: "session-1",
        capabilitySnapshotId: "capability-1",
        capabilitySnapshotRevision: "revision-1",
        authorizationGrantRef: "grant:1",
        approvalRef: "approval:1",
        budgetReservationRef: "budget:1",
        budgetCapMinorUnits: 100_000,
        currency: "USD",
        workspaceRef: "workspace-1",
        deadline: "2099-01-01T00:00:00.000Z",
      },
    };
    expect(validateAgentTaskManifest(bound)).toMatchObject({
      policyBinding: expect.objectContaining({ runnerId: "runner-1" }),
    });
    expect(() =>
      validateAgentTaskManifest({
        ...bound,
        policyBinding: { ...bound.policyBinding, budgetCapMinorUnits: 0 },
      })
    ).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
  });

  it("keeps Spec 224 staged input references in the manifest without input bytes or fetch credentials", () => {
    const input = {
      ...manifest,
      spec224Input: { inputSourceRef: "spec224-source:run-1", inputDigest: "a".repeat(64), totalBytes: 128 },
    };
    expect(validateAgentTaskManifest(input)).toMatchObject({ spec224Input: input.spec224Input });
    expect(buildAgentJobDefinition(input).input).not.toHaveProperty("inputFetchGrant");
    expect(() => validateAgentTaskManifest({
      ...input,
      spec224Input: { ...input.spec224Input, inputFetchGrant: "must-not-be-here" },
    })).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
  });

  it("pins a bounded Spec 224 source fingerprint and explicit write set", () => {
    const execution = { sourceFingerprint: "b".repeat(64), mode: "work_package", allowedWriteSet: ["apps/web/server/auth.ts"] };
    expect(validateAgentTaskManifest({ ...manifest, spec224Execution: execution })).toMatchObject({ spec224Execution: execution });
    expect(() => validateAgentTaskManifest({ ...manifest, spec224Execution: { ...execution, allowedWriteSet: ["../outside.ts"] } })).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
  });

  it("deduplicates normalized events and creates one canonical Job handoff", () => {
    expect(
      acceptAgentEvent(1, {
        eventId: "e1",
        taskId: "task-1",
        sequence: 1,
        kind: "started",
        payload: {},
      })
    ).toBe("duplicate");
    expect(
      acceptAgentEvent(1, {
        eventId: "e3",
        taskId: "task-1",
        sequence: 3,
        kind: "text",
        payload: {},
      })
    ).toBe("out_of_order");
    const job = buildAgentJobDefinition(manifest);
    expect(job).toMatchObject({
      jobType: "external_agent_task",
      executionClass: "external",
      tenantId: "tenant-1",
    });
    expect(job.input).not.toHaveProperty("apiKey");
    expect(() =>
      validateAgentTaskManifest(null as unknown as AgentTaskManifest)
    ).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
    expect(() =>
      acceptAgentEvent(0, {
        eventId: "bad",
        taskId: "task-1",
        sequence: 1,
        kind: "text",
        payload: null as unknown as Record<string, unknown>,
      })
    ).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
    expect(() =>
      acceptAgentEvent(0, {
        eventId: "bad-kind",
        taskId: "task-1",
        sequence: 1,
        kind: "unknown" as AgentEvent["kind"],
        payload: {},
      })
    ).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
  });

  it("keeps provider volatility behind a single adapter registry", async () => {
    const adapter: AgentAdapter = {
      provider: "codex",
      start: vi.fn().mockResolvedValue({ providerSessionId: "session-1" }),
      cancel: vi.fn(),
      collect: vi.fn(),
    };
    const registry = new AgentAdapterRegistry();
    registry.register(adapter);
    expect(registry.resolve("codex")).toBe(adapter);
    await expect(registry.resolve("codex")!.start(manifest)).resolves.toEqual({
      providerSessionId: "session-1",
    });
  });
});
