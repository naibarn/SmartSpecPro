/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import {
  severityFromGateResult,
  workpackIncidentRecordSchema,
  workpackReadinessSummarySchema,
  workpackTelemetryEventSchema,
} from "../workpackTelemetry";

describe("workpackTelemetry", () => {
  it("validates readiness summaries", () => {
    const parsed = workpackReadinessSummarySchema.parse({
      workpackId: "wp_1",
      versionId: "wpv_1",
      rolloutPhase: "supervised",
      gateResult: "review_required",
      reasonCode: "connector_stale",
      evidenceCompleteness: 0.75,
      exceptionSeverity: "medium",
      trustStatus: "tainted",
      connectorHealth: "stale",
      benchmarkAvailable: false,
      rollbackAvailable: true,
      nextAction: "Refresh connector mappings",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    expect(parsed.connectorHealth).toBe("stale");
    expect(severityFromGateResult(parsed.gateResult)).toBe("warning");
  });

  it("validates telemetry events and incident records", () => {
    const event = workpackTelemetryEventSchema.parse({
      id: "evt_1",
      tenantId: "tenant-1",
      workpackId: "wp_1",
      versionId: "wpv_1",
      eventName: "draft_created",
      detail: "Draft created from case intake",
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    const incident = workpackIncidentRecordSchema.parse({
      id: "inc_1",
      tenantId: "tenant-1",
      workpackId: "wp_1",
      versionId: "wpv_1",
      action: "quarantine",
      status: "active",
      reason: "Unexpected write drift",
      affectedRunIds: ["run_1"],
      safeResumeRequired: true,
      createdAt: "2026-04-10T00:00:00.000Z",
      resolvedAt: null,
    });

    expect(event.eventName).toBe("draft_created");
    expect(incident.safeResumeRequired).toBe(true);
  });
});
