import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../tenantFeatureFlagService")>("../tenantFeatureFlagService");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn().mockResolvedValue({
      workpacksEnabled: true,
      workpackAutonomousPilot: true,
      workpackOpsConsole: true,
    }),
  };
});

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { getWorkpackReadinessSummary } from "../workpackReadinessService";
import { resetWorkpackStore, updateWorkpackVersion } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";

describe("workpackReadinessService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("derives stable readiness summaries from evidence", async () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support ops",
      goal: "Classify tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP",
          sourceText: "Classify and route tickets.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    updateWorkpackVersion(draft.version.id, (version) => ({
      ...version,
      fixtureCatalog: version.fixtureCatalog.map((fixture) => ({
        ...fixture,
        governance: {
          ...fixture.governance,
          redactionState: "de_identified",
          accessScope: "benchmark_candidate",
        },
      })),
    }));
    simulateWorkpack({ workpackId: draft.workpack.id });

    const summary = await getWorkpackReadinessSummary(draft.workpack.id);

    expect(summary.gateResult).toBe("ready");
    expect(summary.trustStatus).toBe("verified");
  });
});
