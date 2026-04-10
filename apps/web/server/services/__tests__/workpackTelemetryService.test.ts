import { beforeEach, describe, expect, it } from "vitest";

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { validateConnectorMaps } from "../workpackConnectorService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { resetWorkpackStore } from "../workpackPersistence";
import { simulateWorkpack } from "../workpackSimulationService";
import { captureWorkpackMetricSnapshot, getWorkpackTelemetrySummary, recordWorkpackTelemetryEvent } from "../workpackTelemetryService";

describe("workpackTelemetryService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("records workpack telemetry events", async () => {
    const event = await recordWorkpackTelemetryEvent({
      tenantId: "tenant-1",
      workpackId: "wp_1",
      versionId: "wpv_1",
      eventName: "draft_created",
      detail: "Draft created",
    });

    expect(event.id).toContain("evt_");
  });

  it("captures metrics from completed workpack runs", async () => {
    const draft = await createDraftWorkpack({
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
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });
    await validateConnectorMaps({
      workpackId: draft.workpack.id,
      emitExceptions: false,
      metadataByFamily: {
        helpdesk: {
          availableFields: ["record_id", "status", "summary", "ticket_id", "priority"],
          fieldTypes: {
            record_id: "string",
            status: "string",
            summary: "string",
            ticket_id: "string",
            priority: "string",
          },
          grantedScopes: ["helpdesk:read", "helpdesk:write"],
          supportsIdempotency: true,
          status: "healthy",
        },
        knowledge_base: {
          availableFields: ["record_id", "status", "summary", "article_id"],
          fieldTypes: {
            record_id: "string",
            status: "string",
            summary: "string",
            article_id: "string",
          },
          grantedScopes: ["knowledge_base:read", "knowledge_base:write"],
          supportsIdempotency: true,
          status: "healthy",
        },
        chat: {
          availableFields: ["record_id", "status", "summary", "thread_id"],
          fieldTypes: {
            record_id: "string",
            status: "string",
            summary: "string",
            thread_id: "string",
          },
          grantedScopes: ["chat:read", "chat:write"],
          supportsIdempotency: true,
          status: "healthy",
        },
      },
    });
    await simulateWorkpack({ workpackId: draft.workpack.id });

    const snapshot = await captureWorkpackMetricSnapshot(draft.workpack.id);
    const summary = await getWorkpackTelemetrySummary("tenant-1");

    expect(snapshot.completionRate).toBeGreaterThan(0);
    expect(snapshot.successRate).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.slices)).toBe(true);
    expect(summary.totals.workpackCount).toBe(1);
  });
});
