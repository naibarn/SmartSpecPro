import { describe, expect, it } from "vitest";

import {
  HYBRID_EXECUTOR_REGISTRY_VERSION,
  HYBRID_PLAN_SCHEMA_VERSION,
  HYBRID_RESULT_SCHEMA_VERSION,
  HYBRID_RUNTIME_CONTRACT_VERSION,
  hybridRuntimeStageRequestSchema,
  hybridStageExecutorDefinitionSchema,
  hybridStageResultSchema,
} from "../orchestration/hybridOrchestration";

describe("Hybrid orchestration contracts", () => {
  it("accepts current runtime stage requests and rejects stale contract versions", () => {
    const request = {
      executionId: "exec-1",
      stageId: "stage-1",
      stageType: "intake",
      owner: "workflow",
      tenantId: "tenant-1",
      userId: 1,
      objective: "Create a validated plan",
      input: { message: "plan this" },
      runtimeContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
      planSchemaVersion: HYBRID_PLAN_SCHEMA_VERSION,
    };

    expect(hybridRuntimeStageRequestSchema.safeParse(request).success).toBe(true);
    expect(
      hybridRuntimeStageRequestSchema.safeParse({
        ...request,
        runtimeContractVersion: "hybrid-runtime-v0",
      }).success,
    ).toBe(false);
  });

  it("requires approval for mutating executor definitions", () => {
    expect(
      hybridStageExecutorDefinitionSchema.safeParse({
        executorId: "commit-document",
        stageType: "commit",
        owner: "executor",
        sideEffectClass: "mutating",
        requiresApproval: false,
        registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
      }).success,
    ).toBe(false);

    expect(
      hybridStageExecutorDefinitionSchema.safeParse({
        executorId: "commit-document",
        stageType: "commit",
        owner: "executor",
        sideEffectClass: "mutating",
        requiresApproval: true,
        registryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
      }).success,
    ).toBe(true);
  });

  it("carries result cost, token, trace, and schema metadata", () => {
    const parsed = hybridStageResultSchema.parse({
      executionId: "exec-1",
      stageId: "stage-1",
      status: "succeeded",
      output: { summary: "ready" },
      traceRefs: ["trace-1"],
      estimatedCredits: 1,
      actualCredits: 0.75,
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      modelRoute: "openai-agents:gpt-4.1-mini",
      executorCost: 0.01,
      resultSchemaVersion: HYBRID_RESULT_SCHEMA_VERSION,
    });

    expect(parsed.traceRefs).toEqual(["trace-1"]);
    expect(parsed.tokenUsage?.totalTokens).toBe(30);
  });
});
