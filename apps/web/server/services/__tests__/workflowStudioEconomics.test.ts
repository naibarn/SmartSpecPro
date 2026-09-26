import { describe, expect, it } from "vitest";
import {
  buildWorkflowCostProjection,
  admitWorkflowRunEconomics,
  releaseWorkflowRunEconomics,
} from "../workflowStudioEconomics";

describe("workflowStudioEconomics", () => {
  it("returns explainable estimate/reservation state and correlation", () => {
    const result = admitWorkflowRunEconomics({
      tenantId: "tenant-1",
      actorId: "user-1",
      jobId: "job-1",
      attemptId: "attempt-1",
      idempotencyKey: "workflow-cost-1",
      estimateMinorUnits: 20,
      currency: "USD",
      workflowVersionId: "version-1",
    });
    expect(result).toMatchObject({
      status: "reserved",
      correlation: {
        jobId: "job-1",
        attemptId: "attempt-1",
        workflowVersionId: "version-1",
      },
      reservation: { status: "held" },
    });
    expect(releaseWorkflowRunEconomics(result.reservation!)).toMatchObject({
      status: "released",
    });
    expect(
      buildWorkflowCostProjection({
        estimateMinorUnits: 20,
        capturedMinorUnits: 0,
        currency: "USD",
        state: "reconciliation_required",
      })
    ).toMatchObject({ label: "reconciliation_required", amountMinorUnits: 20 });
  });
});
