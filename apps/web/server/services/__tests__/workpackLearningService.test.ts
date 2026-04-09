import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { normalizeWorkpackException } from "../workpackExceptionService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { deriveWorkpackImprovementProposals } from "../workpackLearningService";
import { resetWorkpackStore } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";

describe("workpackLearningService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("groups repeated exception patterns into improvement proposals", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Procurement intake",
      goal: "Compare vendor options",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "RFQ",
          sourceText: "Compare vendors and prepare approval packet.",
        },
      ],
    });

    normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "connector_auth",
      reasonCode: "connector_scope_missing",
      title: "Connector scope missing",
      summary: "Vendor portal scope missing",
      remediationPointer: "/workpacks/connectors",
      nextAction: "Refresh scope",
    });
    normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "connector_auth",
      reasonCode: "connector_scope_missing",
      title: "Connector scope missing",
      summary: "Vendor portal scope missing again",
      remediationPointer: "/workpacks/connectors",
      nextAction: "Refresh scope",
    });

    const bundle = deriveWorkpackImprovementProposals(draft.workpack.id);

    expect(bundle.proposals.some((proposal) => proposal.actionType === "connector_map_adjustment")).toBe(true);
  });

  it("emits benchmark candidates for stable successful runs", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Support ops",
      goal: "Classify and route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support SOP",
          sourceText: "Classify and route tickets, then notify the requester.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    simulateWorkpack({ workpackId: draft.workpack.id });

    const bundle = deriveWorkpackImprovementProposals(draft.workpack.id);

    expect(bundle.benchmarkCandidate).toBe(true);
    expect(bundle.proposals.some((proposal) => proposal.actionType === "benchmark_publication")).toBe(true);
  });
});
