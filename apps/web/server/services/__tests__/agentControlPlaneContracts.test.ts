import { describe, expect, it, vi } from "vitest";

import {
  acceptAgentEvent,
  AgentAdapterRegistry,
  buildAgentJobDefinition,
  validateAgentTaskManifest,
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
