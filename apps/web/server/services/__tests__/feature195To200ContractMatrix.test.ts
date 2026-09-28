import { describe, expect, it } from "vitest";

import { CANONICAL_JOB_STATUSES } from "../jobControlPlaneTypes";
import {
  AGENT_CONTROL_PLANE_CONTRACT_VERSION,
  buildAgentJobDefinition,
} from "../agentControlPlaneContracts";
import {
  CHAT_ORCHESTRATION_CONTRACT_VERSION,
  normalizeChatRequest,
} from "../chatOrchestrationContracts";
import { MCP_GOVERNANCE_CONTRACT_VERSION } from "../mcpGovernanceContracts";
import { ORCHESTRATION_CONTRACT_VERSION } from "../orchestration/contracts";
import { RUNNER_CONTRACT_VERSION } from "../runnerContracts";

describe("Features 195-200 contract matrix", () => {
  it("has one execution status authority and versioned cross-spec boundaries", () => {
    expect(CANONICAL_JOB_STATUSES).toContain("succeeded");
    expect(
      new Set([
        ORCHESTRATION_CONTRACT_VERSION,
        RUNNER_CONTRACT_VERSION,
        CHAT_ORCHESTRATION_CONTRACT_VERSION,
        MCP_GOVERNANCE_CONTRACT_VERSION,
        AGENT_CONTROL_PLANE_CONTRACT_VERSION,
      ]).size
    ).toBe(5);
  });

  it("preserves tenant and correlation scope through the Chat boundary", () => {
    const request = normalizeChatRequest({
      tenantId: "tenant-1",
      userId: 1,
      conversationId: "conversation-1",
      correlationId: "correlation-1",
      text: "do work",
      idempotencyKey: "request-1",
    });
    expect(request).toMatchObject({
      tenantId: "tenant-1",
      correlationId: "correlation-1",
    });
    expect(
      buildAgentJobDefinition({
        taskId: "task-1",
        tenantId: request.tenantId,
        actorId: request.userId,
        goalId: "goal-1",
        planId: "plan-1",
        planRevision: 1,
        provider: "codex",
        runtime: "local_runner",
        workspaceId: "workspace-1",
        contextPackageIds: [],
        skillIds: [],
        mcpGrantIds: [],
        requestedCapabilities: [],
      })
    ).toMatchObject({
      tenantId: request.tenantId,
      jobType: "external_agent_task",
    });
  });
});
