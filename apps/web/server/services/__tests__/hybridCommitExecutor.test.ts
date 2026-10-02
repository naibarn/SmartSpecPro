import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HybridOrchestrationPlan } from "@shared/orchestration/hybridOrchestration";
import {
  buildPreviewIdempotencyKey,
  createHybridExecutionFromPreview,
  createMemoryHybridOrchestrationRepository,
} from "../hybridOrchestrationStore";
import {
  commitHybridExecution,
  resetHybridCommitIdempotencyForTests,
} from "../hybridCommitExecutor";

const plan: HybridOrchestrationPlan = {
  mode: "hybrid",
  blendMode: "balanced-mixed",
  summary: "Commit only after review.",
  workflowAnchor: "hybrid-flow",
  swarmRoles: ["explorer", "critic", "synthesizer"],
  requiresApproval: true,
  reason: "commit_requires_approval",
  stages: [
    {
      id: "intake",
      type: "intake",
      owner: "workflow",
      title: "Intake",
      description: "Brief.",
      inputs: ["message"],
      outputs: ["brief"],
    },
    {
      id: "explore",
      type: "explore",
      owner: "swarm",
      title: "Explore",
      description: "Options.",
      inputs: ["brief"],
      outputs: ["options"],
    },
    {
      id: "approval",
      type: "approval",
      owner: "human",
      title: "Approve",
      description: "Approve.",
      inputs: ["options"],
      outputs: ["decision"],
      gate: "required",
    },
    {
      id: "commit",
      type: "commit",
      owner: "workflow",
      title: "Commit",
      description: "Safe first-slice commit.",
      inputs: ["decision"],
      outputs: ["artifact"],
    },
  ],
};

async function setupExecution() {
  const repository = createMemoryHybridOrchestrationRepository();
  await createHybridExecutionFromPreview({
    id: "exec-1",
    tenantId: "tenant-1",
    userId: 7,
    originSurface: "chat",
    objective: "Commit after approval",
    plan,
    previewId: "preview-1",
    previewIdempotencyKey: buildPreviewIdempotencyKey({
      tenantId: "tenant-1",
      userId: 7,
      previewId: "preview-1",
    }),
  }, repository);
  await repository.updateExecutionStatus("exec-1", "committing", "commit");
  await repository.updateStageStatus("exec-1", "stage-4", "running");
  return repository;
}

describe("hybridCommitExecutor", () => {
  beforeEach(() => {
    resetHybridCommitIdempotencyForTests();
  });

  it("blocks mutating commit until durable approval exists", async () => {
    const repository = await setupExecution();

    const outcome = await commitHybridExecution({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      approvalDecision: null,
      repository,
    });

    expect(outcome.status).toBe("blocked");
    expect(outcome.errorCode).toBe("hybrid_commit_approval_required");
    const readBack = await repository.findExecutionById("exec-1");
    expect(readBack?.execution.status).toBe("awaiting_approval");
  });

  it("runs a safe first-slice commit exactly once per idempotency key", async () => {
    const repository = await setupExecution();
    const adapter = {
      commit: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => ({
        idempotencyKey,
        output: { savedToLibrary: true },
      })),
    };

    const first = await commitHybridExecution({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      approvalDecision: "approved",
      repository,
      adapter,
    });
    const second = await commitHybridExecution({
      executionId: "exec-1",
      tenantId: "tenant-1",
      userId: 7,
      approvalDecision: "approved",
      repository,
      adapter,
    });

    expect(first.status).toBe("completed");
    expect(second.status).toBe("idempotent_replay");
    expect(adapter.commit).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-tenant commit attempts", async () => {
    const repository = await setupExecution();

    await expect(commitHybridExecution({
      executionId: "exec-1",
      tenantId: "tenant-2",
      userId: 7,
      approvalDecision: "approved",
      repository,
    })).rejects.toThrow("hybrid_execution_not_found");
  });
});
