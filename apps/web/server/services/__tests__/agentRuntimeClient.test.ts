import { describe, expect, it, vi } from "vitest";

import {
  CURRENT_CHECKPOINT_SCHEMA_VERSION,
  CURRENT_RUNTIME_CONTRACT_VERSION,
  CURRENT_TRACE_SCHEMA_VERSION,
  type AgentRuntimeRequest,
} from "../../../shared/agentRuntime/types";
import {
  AGENT_RUNTIME_INTERNAL_ROUTE_PREFIX,
  AgentRuntimeClient,
  AgentRuntimeClientError,
  buildAgentRuntimeAdapterUrl,
  mapAdapterErrorToRuntimeError,
} from "../agentRuntime/client";

function makeRequest(
  overrides: Partial<AgentRuntimeRequest> = {},
): AgentRuntimeRequest {
  return {
    runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION,
    traceSchemaVersion: CURRENT_TRACE_SCHEMA_VERSION,
    checkpointSchemaVersion: CURRENT_CHECKPOINT_SCHEMA_VERSION,
    surface: "chat",
    entryPoint: "chat_turn",
    tenantId: "tenant-1",
    roomId: "room-1",
    runId: null,
    messageId: "message-1",
    requestId: "req-1",
    idempotencyKey: "idem-1",
    objective: "Answer the user request.",
    planContext: {},
    stepContext: null,
    activePersonaId: null,
    personaSnapshot: null,
    teamMembers: [],
    stepAssignment: null,
    approvalCheckpointId: null,
    resumeCursor: null,
    structuredContextPackRef: "context-pack:chat:req-1",
    contextEvidenceItems: [],
    candidateSkillManifests: [],
    allowedTools: ["search"],
    allowedSkills: ["brainstorm"],
    allowedAgents: ["Planner"],
    completionPolicy: {},
    reviewPolicy: {},
    retryPolicy: {},
    traceCorrelationIds: {},
    sdkVersionConstraint: "0.14.x",
    modelConfig: {
      providerId: "openrouter",
      modelId: "openai/gpt-4.1-mini",
      gatewayRouteId: "gateway-auto",
      resolvedGatewayModelId: "openai/gpt-4.1-mini",
    },
    executionEnvelope: {
      envelopeId: "env-1",
      tenantId: "tenant-1",
      issuedAt: "2026-04-20T00:00:00.000Z",
      expiresAt: "2026-04-20T01:00:00.000Z",
      allowedTools: ["search"],
      allowedSkills: ["brainstorm"],
      allowedAgents: ["Planner"],
      sideEffectPolicy: "read_only",
    },
    ...overrides,
  };
}

function makeValidResponse(overrides: Record<string, unknown> = {}) {
  return {
    runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION,
    traceSchemaVersion: CURRENT_TRACE_SCHEMA_VERSION,
    checkpointSchemaVersion: CURRENT_CHECKPOINT_SCHEMA_VERSION,
    status: "completed",
    selectedAgentName: "Planner",
    selectedSkillSlug: "brainstorm",
    providerId: "openrouter",
    modelId: "openai/gpt-4.1-mini",
    gatewayRouteId: "gateway-auto",
    resolvedGatewayModelId: "openai/gpt-4.1-mini",
    finalOutput: {
      summary: "Done",
    },
    artifacts: [],
    reviewVerdict: null,
    events: [],
    traceMetadata: {},
    checkpoint: null,
    terminalReason: "plan_completed",
    adapterVersion: "0.1.0",
    sdkVersion: "0.14.2",
    toolCallsMade: ["search"],
    handoffsExecuted: [],
    actingPersona: null,
    stepAssignment: null,
    nextAction: null,
    stepId: null,
    attemptId: null,
    checkpointMetadata: null,
    eventSequenceMetadata: {},
    stepLinks: [],
    evidenceRefs: [],
    repairInstructions: [],
    ...overrides,
  };
}

describe("AgentRuntimeClient", () => {
  it("sends required transport fields to the internal Python adapter", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeValidResponse()), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    const client = new AgentRuntimeClient({
      fetchImpl,
      runtimeConfigLoader: async () =>
        ({
          pythonBackendUrl: "http://python-backend.test",
        } as any),
      internalTokenLoader: async () => "internal-token-1",
    });

    await client.run(makeRequest());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://python-backend.test/api/internal/openai-agents-runtime/run",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-internal-token": "internal-token-1",
      "x-gateway-attribution-token": "internal-token-1",
      "x-platform-request-id": "req-1",
      "x-tenant-id": "tenant-1",
      "x-agent-runtime-surface": "chat",
    });
  });

  it("validates adapter response before persistence", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          selectedAgentName: "Planner",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new AgentRuntimeClient({
      fetchImpl,
      runtimeConfigLoader: async () =>
        ({
          pythonBackendUrl: "http://python-backend.test",
        } as any),
      internalTokenLoader: async () => "internal-token-1",
    });

    await expect(client.run(makeRequest())).rejects.toThrow();
  });

  it("uses an internal-only adapter route that is not frontend-addressable", () => {
    const url = buildAgentRuntimeAdapterUrl(
      "http://python-backend.test",
      "run",
    );

    expect(AGENT_RUNTIME_INTERNAL_ROUTE_PREFIX.startsWith("/api/internal/")).toBe(
      true,
    );
    expect(url).toContain("/api/internal/openai-agents-runtime/run");
  });

  it("rejects a selected skill outside the execution envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          makeValidResponse({
            selectedSkillSlug: "forbidden-skill",
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new AgentRuntimeClient({
      fetchImpl,
      runtimeConfigLoader: async () =>
        ({
          pythonBackendUrl: "http://python-backend.test",
        } as any),
      internalTokenLoader: async () => "internal-token-1",
    });

    await expect(client.run(makeRequest())).rejects.toMatchObject({
      code: "selected_skill_not_allowed",
    } satisfies Partial<AgentRuntimeClientError>);
  });

  it("rejects a selected tool outside the execution envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          makeValidResponse({
            toolCallsMade: ["search", "connector-write"],
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new AgentRuntimeClient({
      fetchImpl,
      runtimeConfigLoader: async () =>
        ({
          pythonBackendUrl: "http://python-backend.test",
        } as any),
      internalTokenLoader: async () => "internal-token-1",
    });

    await expect(client.run(makeRequest())).rejects.toMatchObject({
      code: "selected_tool_not_allowed",
    } satisfies Partial<AgentRuntimeClientError>);
  });

  it("maps structured adapter errors to platform runtime errors", () => {
    const error = mapAdapterErrorToRuntimeError(
      {
        error: {
          code: "invalid_request",
          message: "Execution envelope missing.",
          details: {
            path: "executionEnvelope",
          },
        },
      },
      422,
    );

    expect(error).toMatchObject({
      code: "invalid_request",
      status: 422,
      message: "Execution envelope missing.",
      details: {
        path: "executionEnvelope",
      },
    });
  });

  it("fails closed when the adapter returns an unsupported contract version", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          makeValidResponse({
            runtimeContractVersion: CURRENT_RUNTIME_CONTRACT_VERSION + 1,
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new AgentRuntimeClient({
      fetchImpl,
      runtimeConfigLoader: async () =>
        ({
          pythonBackendUrl: "http://python-backend.test",
        } as any),
      internalTokenLoader: async () => "internal-token-1",
    });

    await expect(client.run(makeRequest())).rejects.toMatchObject({
      code: "adapter_runtime_contract_unsupported",
    } satisfies Partial<AgentRuntimeClientError>);
  });
});
