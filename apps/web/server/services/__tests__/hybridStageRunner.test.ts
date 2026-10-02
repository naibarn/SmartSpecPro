import { describe, expect, it, vi } from "vitest";

import {
  HYBRID_PLAN_SCHEMA_VERSION,
  HYBRID_RESULT_SCHEMA_VERSION,
  HYBRID_RUNTIME_CONTRACT_VERSION,
  type HybridOrchestrationPlan,
  type HybridStageResult,
} from "@shared/orchestration/hybridOrchestration";
import type { AgentRuntimeHealth } from "../agentRuntime/client";
import {
  buildPreviewIdempotencyKey,
  createHybridExecutionFromPreview,
  createMemoryHybridOrchestrationRepository,
} from "../hybridOrchestrationStore";
import { runNextHybridStage, type HybridStageRunnerClient } from "../hybridStageRunner";

const plan: HybridOrchestrationPlan = {
  mode: "hybrid",
  blendMode: "balanced-mixed",
  summary: "Coordinate workflow and swarm.",
  workflowAnchor: "hybrid-flow",
  swarmRoles: ["explorer", "critic", "synthesizer"],
  requiresApproval: true,
  reason: "multi_stage",
  stages: [
    {
      id: "intake",
      type: "intake",
      owner: "workflow",
      title: "Lock scope",
      description: "Create the brief.",
      inputs: ["message"],
      outputs: ["brief"],
    },
    {
      id: "explore",
      type: "explore",
      owner: "swarm",
      title: "Explore",
      description: "Explore alternatives.",
      inputs: ["brief"],
      outputs: ["options"],
    },
    {
      id: "validate",
      type: "validate",
      owner: "workflow",
      title: "Validate",
      description: "Validate plan.",
      inputs: ["options"],
      outputs: ["validated"],
    },
    {
      id: "approval",
      type: "approval",
      owner: "human",
      title: "Approve",
      description: "Approve the plan.",
      inputs: ["validated"],
      outputs: ["decision"],
      gate: "required",
    },
  ],
};

const health: AgentRuntimeHealth = {
  adapterVersion: "adapter-test",
  sdkVersion: "0.17.7",
  gatewayModelSupportEnabled: true,
  traceExportMode: "internal",
  productionSafeTracing: true,
  supportedRuntimeContractVersions: [2],
  supportedTraceSchemaVersions: [2],
  supportedCheckpointSchemaVersions: [2],
  supportedSurfaces: ["chat", "hybrid"],
  supportedHybridStageTypes: ["intake", "explore", "validate", "repair"],
  supportedHybridRuntimeContractVersions: [HYBRID_RUNTIME_CONTRACT_VERSION],
  hybridRoleTemplateVersion: "hybrid-role-template-v1",
};

function result(stageId: string, output: Record<string, unknown> = {}): HybridStageResult {
  return {
    executionId: "exec-1",
    stageId,
    status: "succeeded",
    output,
    traceRefs: [`trace:${stageId}`],
    actualCredits: 1,
    tokenUsage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    },
    modelRoute: "gateway/openai",
    resultSchemaVersion: HYBRID_RESULT_SCHEMA_VERSION,
  };
}

async function setupExecution() {
  const repository = createMemoryHybridOrchestrationRepository();
  await createHybridExecutionFromPreview({
    id: "exec-1",
    tenantId: "tenant-1",
    userId: 7,
    originSurface: "chat",
    objective: "Create a reviewed plan",
    plan,
    previewId: "preview-1",
    previewIdempotencyKey: buildPreviewIdempotencyKey({
      tenantId: "tenant-1",
      userId: 7,
      previewId: "preview-1",
    }),
  }, repository);
  return repository;
}

function client(response: HybridStageResult, clientHealth = health): HybridStageRunnerClient {
  return {
    health: vi.fn(async () => clientHealth),
    runHybridStage: vi.fn(async (request) => ({
      ...response,
      executionId: request.executionId,
      stageId: request.stageId,
    })),
  };
}

describe("hybridStageRunner", () => {
  it("builds a Hybrid stage request, calls the SDK adapter, and persists normalized result", async () => {
    const repository = await setupExecution();
    const sdkClient = client(result("intake"));

    const outcome = await runNextHybridStage({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      repository,
      client: sdkClient,
    });

    expect(outcome.status).toBe("completed");
    expect(outcome.nextStageId).toBe("explore");
    expect(sdkClient.runHybridStage).toHaveBeenCalledWith(expect.objectContaining({
      runtimeContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
      planSchemaVersion: HYBRID_PLAN_SCHEMA_VERSION,
      stageId: "intake",
      stageType: "intake",
      owner: "workflow",
    }));

    const readBack = await repository.findExecutionById("exec-1");
    expect(readBack?.execution.currentStageId).toBe("explore");
    expect(readBack?.stages[0]?.status).toBe("completed");
    expect(readBack?.stages[0]?.traceRefs).toEqual(["trace:intake"]);
    expect(readBack?.stages[1]?.status).toBe("running");
  });

  it("pauses without SDK calls when the active stage is human approval", async () => {
    const repository = await setupExecution();
    const sdkClient = client(result("intake"));
    await runNextHybridStage({ executionId: "exec-1", tenantId: "tenant-1", userId: 7, repository, client: sdkClient });
    await runNextHybridStage({ executionId: "exec-1", tenantId: "tenant-1", userId: 7, repository, client: sdkClient });
    await runNextHybridStage({ executionId: "exec-1", tenantId: "tenant-1", userId: 7, repository, client: sdkClient });

    const outcome = await runNextHybridStage({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      repository,
      client: sdkClient,
    });

    expect(outcome.status).toBe("awaiting_approval");
    const readBack = await repository.findExecutionById("exec-1");
    expect(readBack?.execution.status).toBe("awaiting_approval");
    expect(readBack?.stages[3]?.status).toBe("awaiting_approval");
  });

  it("transitions to repairing when validation asks for repair", async () => {
    const repository = await setupExecution();
    const sdkClient = client(result("intake", { nextAction: "repair_required" }));

    const outcome = await runNextHybridStage({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      repository,
      client: sdkClient,
    });

    expect(outcome.status).toBe("repair_required");
    const readBack = await repository.findExecutionById("exec-1");
    expect(readBack?.execution.status).toBe("repairing");
  });

  it("fails closed when adapter health does not support Hybrid", async () => {
    const repository = await setupExecution();
    const sdkClient = client(result("intake"), {
      ...health,
      supportedSurfaces: ["chat"],
    });

    const outcome = await runNextHybridStage({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      repository,
      client: sdkClient,
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("adapter_hybrid_surface_unsupported");
  });

  it("fails closed before a billable stage when total budget is exceeded", async () => {
    const repository = await setupExecution();

    const outcome = await runNextHybridStage({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      repository,
      client: client(result("intake")),
      maxTotalCredits: 0,
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("hybrid_budget_exceeded");
  });
});
