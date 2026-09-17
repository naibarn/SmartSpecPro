import { describe, expect, it, vi } from "vitest";

import {
  buildGoal,
  buildJobDefinitions,
  compilePlan,
  normalizeUniversalCommand,
  type CapabilityOffer,
} from "../orchestration/contracts";
import {
  assertApprovedPlan,
  evaluatePlanPolicy,
} from "../orchestration/policy";
import { submitApprovedPlan } from "../orchestration/gateway";

const offer: CapabilityOffer = {
  capabilityId: "media.render",
  providerNeutralName: "Media renderer",
  executionClass: "long",
  jobType: "media.render",
  available: true,
  estimatedCostCredits: 4,
  qualityScore: 0.9,
  snapshotRevision: "cap-r1",
  requiresApproval: false,
};

describe("Feature 196 orchestration contracts", () => {
  it("normalizes a command and keeps tenant/actor identity explicit", () => {
    const command = normalizeUniversalCommand({
      commandId: "cmd-1",
      tenantId: "tenant-1",
      actorId: 7,
      channel: "chat",
      text: "  Render this  ",
      requestedAt: "2026-09-17T00:00:00Z",
      idempotencyKey: " request-1 ",
    });
    expect(buildGoal(command, "goal-1")).toMatchObject({
      tenantId: "tenant-1",
      commandId: "cmd-1",
    });
    expect(command.text).toBe("Render this");
  });

  it("creates immutable plan hash and only hands approved plans to Jobs", () => {
    const command = normalizeUniversalCommand({
      commandId: "cmd-2",
      tenantId: "tenant-1",
      actorId: 7,
      channel: "assistant",
      text: "Render",
      idempotencyKey: "r2",
    });
    const plan = compilePlan({
      goal: buildGoal(command, "goal-2"),
      offers: [offer],
      capabilitySnapshotRevision: "cap-r1",
      planId: "plan-1",
    });
    expect(() => buildJobDefinitions(plan)).toThrowError(
      expect.objectContaining({ code: "ORCHESTRATION_CONTRACT_INVALID" })
    );
    const approved = { ...plan, status: "approved" as const };
    const jobs = buildJobDefinitions(approved);
    expect(jobs[0]).toMatchObject({
      tenantId: "tenant-1",
      jobType: "media.render",
      executionClass: "long",
    });
    expect(jobs[0].input.orchestration).toMatchObject({
      planId: "plan-1",
      planHash: plan.planHash,
    });
  });

  it("denies unsafe policy decisions and rejects stale approval", () => {
    const command = normalizeUniversalCommand({
      commandId: "cmd-3",
      tenantId: "tenant-1",
      actorId: 7,
      channel: "api",
      text: "Render",
      idempotencyKey: "r3",
    });
    const plan = {
      ...compilePlan({
        goal: buildGoal(command, "goal-3"),
        offers: [offer],
        capabilitySnapshotRevision: "cap-r1",
        planId: "plan-3",
      }),
      status: "approved" as const,
    };
    expect(
      evaluatePlanPolicy(plan, [offer], {
        version: "p1",
        maxSteps: 1,
        maxEstimatedCostCredits: 1,
        requireApprovalForExternal: true,
      }).outcome
    ).toBe("deny");
    expect(() =>
      assertApprovedPlan({
        plan,
        approval: {
          planId: plan.planId,
          planRevision: 2,
          decision: "approved",
        },
      })
    ).toThrowError(
      expect.objectContaining({ code: "ORCHESTRATION_APPROVAL_REQUIRED" })
    );
  });

  it("hands an approved plan to the canonical Job gateway with server scope", async () => {
    const command = normalizeUniversalCommand({
      commandId: "cmd-4",
      tenantId: "tenant-1",
      actorId: 7,
      channel: "chat",
      text: "Render",
      idempotencyKey: "r4",
    });
    const plan = {
      ...compilePlan({
        goal: buildGoal(command, "goal-4"),
        offers: [{ ...offer, jobType: "maintenance.cleanup" }],
        capabilitySnapshotRevision: "cap-r1",
        planId: "plan-4",
      }),
      status: "approved" as const,
    };
    const create = vi.fn().mockResolvedValue({ jobId: "job-4", created: true });
    await expect(
      submitApprovedPlan({
        plan,
        approval: {
          approvalId: "approval-4",
          planId: plan.planId,
          planRevision: plan.revision,
          tenantId: "tenant-1",
          actorId: 7,
          decision: "approved",
          decidedAt: new Date().toISOString(),
        },
        context: {
          tenantId: "tenant-1",
          actorType: "user",
          actorId: 7,
          authorizationScope: "tenant:write",
          correlationId: "corr-4",
          idempotencyKey: "r4",
        },
        controlPlane: { create } as any,
        executorRegistry: { has: () => true } as any,
      })
    ).resolves.toEqual([{ jobId: "job-4", created: true }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", requestedByUserId: 7 }),
      expect.anything()
    );
  });
});
