import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { appendLedgerArtifacts, createReplayGradeLedger, finalizeLedgerRun } from "../workpackLedgerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { getWorkpackRun, resetWorkpackStore } from "../workpackPersistence";

describe("workpackLedgerService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("persists replay-grade run history with artifacts and connector summaries", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Invoice review",
      goal: "Review invoice data",
      domainPack: "finance_ops",
      sources: [
        {
          type: "document",
          title: "Invoice batch",
          sourceText: "Collect and reconcile invoice details.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const ledgerRun = await createReplayGradeLedger({ workpackId: draft.workpack.id });
    await appendLedgerArtifacts(ledgerRun.id, [
      {
        artifactId: "artifact_1",
        label: "Summary",
        governance: {
          sensitivityClass: "internal",
          accessScope: "tenant",
          retentionTier: "standard",
          redactionState: "redacted",
        },
        summary: "Sanitized run summary",
      },
    ]);
    await finalizeLedgerRun({
      runId: ledgerRun.id,
      status: "succeeded",
      actualSteps: [
        {
          stepId: draft.playbook.steps[0]!.id,
          title: draft.playbook.steps[0]!.title,
          runtimePath: "hybrid",
          status: "succeeded",
          sideEffectClass: "read_only",
          effectKey: null,
          outputSummary: "Collected invoice data",
        },
      ],
      connectorSummaries: [
        {
          connectorFamily: "erp",
          status: "validated",
          summary: "Schema matched",
        },
      ],
    });

    const persisted = await getWorkpackRun(ledgerRun.id);
    expect(persisted?.actualSteps).toHaveLength(1);
    expect(persisted?.artifactReferences[0]?.summary).toContain("Sanitized");
    expect(persisted?.connectorSummaries[0]?.status).toBe("validated");
  });
});
