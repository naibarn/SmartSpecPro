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
        spendCeilingMicros: 100_000,
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
        policyBinding: { ...bound.policyBinding, spendCeilingMicros: 0 },
      })
    ).toThrowError(expect.objectContaining({ code: "AGENT_CONTRACT_INVALID" }));
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
