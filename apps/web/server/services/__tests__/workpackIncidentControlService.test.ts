import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { applyWorkpackIncidentAction } from "../workpackIncidentControlService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { createReplayGradeLedger, finalizeLedgerRun } from "../workpackLedgerService";
import { getWorkpack, getWorkpackRun, resetWorkpackStore, updateWorkpackRun } from "../workpackPersistence";

describe("workpackIncidentControlService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("pauses active work and supports safe resume", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Ops queue",
      goal: "Route daily tasks",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Ops guide",
          sourceText: "Review the ops queue and route tasks.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    const run = createReplayGradeLedger({ workpackId: draft.workpack.id });
    updateWorkpackRun(run.id, (current) => ({ ...current, status: "running" }));

    const paused = applyWorkpackIncidentAction({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
      action: "pause",
      reason: "Unexpected drift",
    });

    expect(paused.status).toBe("active");
    expect(getWorkpackRun(run.id)?.status).toBe("blocked");
    expect(getWorkpack(draft.workpack.id)?.lifecycleState).toBe("paused");

    const resumed = applyWorkpackIncidentAction({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
      action: "resume",
      reason: "Incident resolved",
    });

    expect(resumed.status).toBe("resolved");
    expect(getWorkpack(draft.workpack.id)?.lifecycleState).toBe("ready");
  });

  it("cancels queued work without touching completed runs", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Store audit",
      goal: "Audit store inventory",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "Store SOP",
          sourceText: "Audit store inventory and compare vendor records.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    const queuedRun = createReplayGradeLedger({ workpackId: draft.workpack.id });
    const completedRun = createReplayGradeLedger({ workpackId: draft.workpack.id });
    finalizeLedgerRun({
      runId: completedRun.id,
      status: "succeeded",
      actualSteps: [],
    });
    updateWorkpackRun(queuedRun.id, (current) => ({ ...current, status: "queued" }));

    applyWorkpackIncidentAction({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
      action: "cancel_queued",
      reason: "Freeze queue",
    });

    expect(getWorkpackRun(queuedRun.id)?.status).toBe("cancelled");
    expect(getWorkpackRun(completedRun.id)?.status).toBe("succeeded");
  });
});
