import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { getWorkpackDetail, resetWorkpackStore, updateWorkpackRun } from "../workpackPersistence";
import { replayWorkpackRun } from "../workpackReplayService";
import { simulateWorkpack } from "../workpackSimulationService";

describe("workpackReplayService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("keeps replay inspection-only for stable runs", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Sales qualification",
      goal: "Review lead and prepare follow-up",
      domainPack: "sales_ops",
      sources: [
        {
          type: "document",
          title: "Lead SOP",
          sourceText: "Review lead quality, update CRM, and prepare follow-up.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    const simulation = simulateWorkpack({ workpackId: draft.workpack.id });

    const replay = replayWorkpackRun({
      workpackId: draft.workpack.id,
      simulationRunId: simulation.simulationRun.id,
    });

    expect(replay.inspectionMode).toBe("inspection_only");
    expect(replay.canReemitSideEffects).toBe(false);
    expect(replay.gateStatus).toBe("clean");
  });

  it("classifies drift categories separately", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Procurement compare",
      goal: "Compare supplier options and prepare approval packet",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "RFQ",
          sourceText: "Compare suppliers and prepare approval packet.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    const simulation = simulateWorkpack({ workpackId: draft.workpack.id });
    const detail = getWorkpackDetail(draft.workpack.id)!;
    const runId = simulation.ledgerRunId;

    updateWorkpackRun(runId, (run) => ({
      ...run,
      actualSteps: [
        ...run.actualSteps.slice(1),
        run.actualSteps[0]!,
      ].map((step, index) => index === 0
        ? {
            ...step,
            outputSummary: "layout changed and output no longer matches",
          }
        : step),
      connectorSummaries: [
        ...run.connectorSummaries.map((summary, index) => index === 0 ? { ...summary, status: "blocked" as const } : summary),
      ],
    }));

    const replay = replayWorkpackRun({
      workpackId: draft.workpack.id,
      runId,
    });

    expect(replay.gateStatus).toBe("blocked");
    expect(replay.diffs.some((diff) => diff.category === "step_order_drift")).toBe(true);
    expect(replay.diffs.some((diff) => diff.category === "browser_layout_instability")).toBe(true);
    expect(replay.diffs.some((diff) => diff.category === "connector_auth_mismatch")).toBe(true);
    expect(detail.workpack.id).toBe(draft.workpack.id);
  });
});
