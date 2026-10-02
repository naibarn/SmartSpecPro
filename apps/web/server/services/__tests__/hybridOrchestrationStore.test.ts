import { describe, expect, it } from "vitest";

import type { HybridOrchestrationPlan } from "@shared/orchestration/hybridOrchestration";
import {
  buildPreviewIdempotencyKey,
  createHybridExecutionFromPreview,
  createMemoryHybridOrchestrationRepository,
  getHybridExecutionFromStore,
} from "../hybridOrchestrationStore";

const plan: HybridOrchestrationPlan = {
  mode: "hybrid",
  blendMode: "balanced-mixed",
  summary: "Coordinate workflow and swarm with approval.",
  workflowAnchor: "hybrid-flow",
  swarmRoles: ["explorer", "critic", "synthesizer"],
  requiresApproval: true,
  reason: "multi_stage_or_approval_request",
  stages: [
    {
      id: "intake",
      type: "intake",
      owner: "workflow",
      title: "Lock scope",
      description: "Create the deterministic brief.",
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
      id: "approval",
      type: "approval",
      owner: "human",
      title: "Approve",
      description: "Approve before mutating commit.",
      inputs: ["validated plan"],
      outputs: ["decision"],
    },
  ],
};

describe("hybridOrchestrationStore", () => {
  it("creates durable execution and ordered stage rows from a preview", async () => {
    const repository = createMemoryHybridOrchestrationRepository();
    const previewIdempotencyKey = buildPreviewIdempotencyKey({
      tenantId: "tenant-1",
      userId: 7,
      previewId: "preview-1",
    });

    const created = await createHybridExecutionFromPreview({
      id: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      originSurface: "chat",
      objective: "Create a reviewed execution plan",
      routingDecision: { route: "hybrid_candidate" },
      plan,
      previewId: "preview-1",
      previewIdempotencyKey,
    }, repository);

    expect(created.execution.status).toBe("running_stage");
    expect(created.execution.currentStageId).toBe("intake");
    expect(created.execution.runtimeContractVersion).toBe("hybrid-runtime-v1");
    expect(created.stages.map((stage) => stage.stageIndex)).toEqual([0, 1, 2]);
    expect(created.stages[0]?.status).toBe("running");
    expect(created.stages[1]?.status).toBe("pending");
  });

  it("returns the existing execution for repeated start from the same preview", async () => {
    const repository = createMemoryHybridOrchestrationRepository();
    const previewIdempotencyKey = buildPreviewIdempotencyKey({
      tenantId: "tenant-1",
      userId: 7,
      previewId: "preview-1",
    });

    const first = await createHybridExecutionFromPreview({
      id: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      originSurface: "chat",
      objective: "Plan",
      plan,
      previewId: "preview-1",
      previewIdempotencyKey,
    }, repository);
    const second = await createHybridExecutionFromPreview({
      id: "exec-2",
      tenantId: "tenant-1",
      userId: 7,
      originSurface: "chat",
      objective: "Plan",
      plan,
      previewId: "preview-1",
      previewIdempotencyKey,
    }, repository);

    expect(second.execution.id).toBe(first.execution.id);
  });

  it("fails closed for tenant or user mismatch reads", async () => {
    const repository = createMemoryHybridOrchestrationRepository();
    const previewIdempotencyKey = buildPreviewIdempotencyKey({
      tenantId: "tenant-1",
      userId: 7,
      previewId: "preview-1",
    });
    await createHybridExecutionFromPreview({
      id: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      originSurface: "chat",
      objective: "Plan",
      plan,
      previewId: "preview-1",
      previewIdempotencyKey,
    }, repository);

    await expect(getHybridExecutionFromStore({
      executionId: "exec-1",
      tenantId: "tenant-2",
      userId: 7,
    }, repository)).resolves.toBeNull();

    await expect(getHybridExecutionFromStore({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 8,
    }, repository)).resolves.toBeNull();
  });
});
