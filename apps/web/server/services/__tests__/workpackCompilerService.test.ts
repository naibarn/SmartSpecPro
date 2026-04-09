import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan, isExecutionPlanAutonomySafe } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { resetWorkpackStore, updateWorkpackVersion } from "../workpackPersistence";

describe("compileWorkpackExecutionPlan", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("chooses bounded runtime paths deterministically", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Vendor quote comparison",
      goal: "Compare quotes and prepare procurement action",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "RFQ",
          sourceText: "Compare vendor quotes, prepare approval packet, and commit the approved purchase.",
        },
      ],
    });

    const plan = compileWorkpackExecutionPlan({ workpackId: draft.workpack.id, requestedBy: 9 });

    expect(plan.steps[1]?.preferredRuntimePath).toBe("browser");
    expect(plan.steps[2]?.preferredRuntimePath).toBe("hybrid");
  });

  it("blocks autonomous safety when a write step cannot preserve a safe retry envelope", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Critical finance commit",
      goal: "Post a sensitive closing action",
      domainPack: "finance_ops",
      sources: [
        {
          type: "document",
          title: "Closing SOP",
          sourceText: "Post sensitive closing adjustments after approval.",
        },
      ],
    });

    updateWorkpackVersion(draft.version.id, (version) => ({
      ...version,
      playbook: {
        ...version.playbook,
        steps: version.playbook.steps.map((step, index) => index === version.playbook.steps.length - 1
          ? {
              ...step,
              requiredConnectorFamilies: [],
              sideEffectClass: "financial",
            }
          : step),
      },
    }));

    const plan = compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    expect(isExecutionPlanAutonomySafe(plan)).toBe(false);
    expect(plan.steps.at(-1)?.idempotency.retryDisposition).toBe("blocked");
  });
});
