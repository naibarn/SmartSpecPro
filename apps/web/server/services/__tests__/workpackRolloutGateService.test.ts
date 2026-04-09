import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../tenantFeatureFlagService")>("../tenantFeatureFlagService");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn().mockResolvedValue({
      workpacksEnabled: true,
      workpackAutonomousPilot: false,
      workpackOpsConsole: true,
    }),
  };
});

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { evaluateWorkpackRolloutGate } from "../workpackRolloutGateService";
import { resetWorkpackStore } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";

describe("workpackRolloutGateService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("requires simulation before rollout", async () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Ops intake",
      goal: "Triage daily ops work",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Ops note",
          sourceText: "Review ops queue and route tasks.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const decision = await evaluateWorkpackRolloutGate({ workpackId: draft.workpack.id, targetMode: "supervised" });

    expect(decision.gateResult).toBe("review_required");
    expect(decision.reasonCode).toBe("simulation_missing");
  });

  it("keeps autonomous rollout staged when pilot flag is disabled", async () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support ops",
      goal: "Route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support guide",
          sourceText: "Classify and route support tickets.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    simulateWorkpack({ workpackId: draft.workpack.id });

    const decision = await evaluateWorkpackRolloutGate({ workpackId: draft.workpack.id, targetMode: "autonomous" });

    expect(decision.gateResult).toBe("staged");
  });
});
