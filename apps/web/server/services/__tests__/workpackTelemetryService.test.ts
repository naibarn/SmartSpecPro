import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { resetWorkpackStore } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";
import { captureWorkpackMetricSnapshot, getWorkpackTelemetrySummary, recordWorkpackTelemetryEvent } from "../workpackTelemetryService";

describe("workpackTelemetryService", () => {
  beforeEach(() => {
    resetWorkpackStore();
  });

  it("records workpack telemetry events", () => {
    const event = recordWorkpackTelemetryEvent({
      tenantId: "tenant-1",
      workpackId: "wp_1",
      versionId: "wpv_1",
      eventName: "draft_created",
      detail: "Draft created",
    });

    expect(event.id).toContain("evt_");
  });

  it("captures metrics from completed workpack runs", () => {
    const draft = createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Ticket triage",
      goal: "Route tickets",
      domainPack: "support_ops",
      sources: [
        {
          type: "document",
          title: "Support flow",
          sourceText: "Classify, route, and notify.",
        },
      ],
    });
    compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    simulateWorkpack({ workpackId: draft.workpack.id });

    const snapshot = captureWorkpackMetricSnapshot(draft.workpack.id);
    const summary = getWorkpackTelemetrySummary("tenant-1");

    expect(snapshot.completionRate).toBeGreaterThan(0);
    expect(summary.totals.workpackCount).toBe(1);
  });
});
