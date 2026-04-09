import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { evaluateWorkpackPromotionEligibility, publishBenchmarkPack, rollbackWorkpackPromotion } from "../workpackPromotionService";
import { resetWorkpackStore, updateWorkpackVersion } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";

describe("workpackPromotionService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("blocks promotion when evidence is incomplete", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Executive briefing",
      goal: "Prepare a weekly briefing",
      domainPack: "executive_support",
      sources: [
        {
          type: "document",
          title: "Briefing notes",
          sourceText: "Collect the briefing context and prepare a summary.",
        },
      ],
    });

    const eligibility = evaluateWorkpackPromotionEligibility(draft.workpack.id);

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasonCode).toBe("execution_plan_missing");
  });

  it("publishes tenant-local benchmarks and supports rollback", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support benchmark",
      goal: "Classify and route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support flow",
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

    const promotion = publishBenchmarkPack({ workpackId: draft.workpack.id });

    expect(promotion.benchmarkPack?.publicationStatus).toBe("published");
    expect(promotion.promotionRecord.state).toBe("active");

    const rolledBack = rollbackWorkpackPromotion(promotion.promotionRecord.id);
    expect(rolledBack.state).toBe("rolled_back");
  });
});
