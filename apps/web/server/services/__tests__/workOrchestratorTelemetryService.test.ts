import { describe, expect, it } from "vitest";

import {
  createTelemetryEvent,
  redactTelemetryEventForRequester,
} from "../workOrchestratorTelemetryService";

describe("workOrchestratorTelemetryService", () => {
  it("creates structured telemetry events with correlation fields", () => {
    const event = createTelemetryEvent({
      eventName: "preflight.preview.generated",
      eventVersion: "1",
      occurredAt: "2026-04-21T00:00:00.000Z",
      severity: "info",
      primaryReasonCode: "preview_generated",
      actorClass: "requester",
      redactionMode: "requester_safe",
      tenantId: "tenant-1",
      actorUserId: 42,
      caseId: "case-1",
      requestId: "req-1",
      preflightBundleId: "bundle-1",
      correlationId: "corr-1",
      payload: {
        selectedSourceCount: 2,
      },
    });

    expect(event).toEqual(
      expect.objectContaining({
        eventName: "preflight.preview.generated",
        correlationId: "corr-1",
        payload: { selectedSourceCount: 2 },
      }),
    );
  });

  it("redacts admin-only payload fields from requester-safe telemetry", () => {
    const event = createTelemetryEvent({
      eventName: "launch.blocked_surface_authority",
      eventVersion: "1",
      occurredAt: "2026-04-21T00:00:00.000Z",
      severity: "warning",
      primaryReasonCode: "surface_authority_missing",
      actorClass: "requester",
      redactionMode: "requester_safe",
      tenantId: "tenant-1",
      caseId: "case-1",
      payload: {
        visibleReasonCodes: ["surface_authority_missing"],
        adminDiagnostics: { permissionDetails: true },
        policyJson: { secret: true },
        capabilityCatalog: [
          {
            id: "workflow",
            governance: {
              requiredPermissions: ["orchestrator.surface.workflow"],
              requiredFeatureFlags: ["workflowSurfacePlanning"],
            },
          },
        ],
      },
    });

    expect(redactTelemetryEventForRequester(event).payload).toEqual({
      visibleReasonCodes: ["surface_authority_missing"],
      capabilityCatalog: [
        {
          id: "workflow",
          governance: {},
        },
      ],
    });
  });
});
