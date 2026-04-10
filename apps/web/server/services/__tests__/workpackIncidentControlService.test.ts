import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { applyWorkpackIncidentAction } from "../workpackIncidentControlService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { createReplayGradeLedger, finalizeLedgerRun } from "../workpackLedgerService";
import { getWorkpack, getWorkpackRun, resetWorkpackStore, updateWorkpackRun } from "../workpackPersistence";

describe("workpackIncidentControlService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("pauses active work and supports safe resume", async () => {
    const draft = await createDraftWorkpack({
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
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    const run = await createReplayGradeLedger({ workpackId: draft.workpack.id });
    await updateWorkpackRun(run.id, (current) => ({ ...current, status: "running" }));

    const paused = await applyWorkpackIncidentAction({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
      action: "pause",
      reason: "Unexpected drift",
    });

    expect(paused.status).toBe("active");
    expect((await getWorkpackRun(run.id))?.status).toBe("blocked");
    expect((await getWorkpack(draft.workpack.id))?.lifecycleState).toBe("paused");

    const resumed = await applyWorkpackIncidentAction({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
      action: "resume",
      reason: "Incident resolved",
    });

    expect(resumed.status).toBe("resolved");
    expect((await getWorkpack(draft.workpack.id))?.lifecycleState).toBe("clarification_needed");
    expect((await getWorkpack(draft.workpack.id))?.policyProfile.safeResumeRequired).toBe(true);
  });

  it("cancels queued work without touching completed runs", async () => {
    const draft = await createDraftWorkpack({
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
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    const queuedRun = await createReplayGradeLedger({ workpackId: draft.workpack.id });
    const completedRun = await createReplayGradeLedger({ workpackId: draft.workpack.id });
    await finalizeLedgerRun({
      runId: completedRun.id,
      status: "succeeded",
      actualSteps: [],
    });
    await updateWorkpackRun(queuedRun.id, (current) => ({ ...current, status: "queued" }));

    await applyWorkpackIncidentAction({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
      action: "cancel_queued",
      reason: "Freeze queue",
    });

    expect((await getWorkpackRun(queuedRun.id))?.status).toBe("cancelled");
    expect((await getWorkpackRun(completedRun.id))?.status).toBe("succeeded");
  });
});
