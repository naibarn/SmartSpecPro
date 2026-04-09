import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { resetWorkpackStore, updateWorkpackVersion } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";

describe("workpackSimulationService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("runs a fixture-backed simulation and records stable steps", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support inbox triage",
      goal: "Classify tickets and close the loop",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support guide",
          sourceText: "Classify, route, and close each support request.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const result = simulateWorkpack({ workpackId: draft.workpack.id });

    expect(result.simulationRun.status).toBe("passed");
    expect(result.simulationRun.simulatedSteps).toHaveLength(draft.playbook.steps.length);
    expect(result.exceptionIds).toHaveLength(0);
  });

  it("fails closed when fixtures are missing", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Finance close",
      goal: "Run closing checklist",
      domainPack: "finance_ops",
      sources: [
        {
          type: "document",
          title: "Close book",
          sourceText: "Collect and reconcile closing data.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    updateWorkpackVersion(draft.version.id, (version) => ({
      ...version,
      fixtureCatalog: [],
    }));

    const result = simulateWorkpack({ workpackId: draft.workpack.id });

    expect(result.simulationRun.status).toBe("blocked");
    expect(result.simulationRun.mismatchCategories).toContain("fixture_unavailable");
    expect(result.exceptionIds.length).toBeGreaterThan(0);
  });
});
