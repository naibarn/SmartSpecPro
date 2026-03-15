import { describe, expect, it } from "vitest";

import {
  buildWorkflowBrowserSessionArtifact,
  buildWorkflowBrowserSessionLaunchContext,
  getWorkflowBrowserSessionId,
  normalizeWorkflowComparisonPreview,
  stripWorkflowPresentationFields,
} from "./outputPresentation";

describe("workflow output presentation helpers", () => {
  it("builds a workflow return context for Browser Session launches", () => {
    expect(
      buildWorkflowBrowserSessionLaunchContext("17", "lbs_123"),
    ).toEqual({
      originSurface: "workflow",
      originLabel: "Workflow",
      sourceId: "17",
      returnContext: {
        path: "/workflows/editor/17?browserSessionId=lbs_123",
        label: "Return to Workflow",
      },
    });
  });

  it("builds a Browser Session artifact from a workflow-owned live session", () => {
    const artifact = buildWorkflowBrowserSessionArtifact({
      sessionId: "lbs_123",
      tenantId: "tenant-1",
      userId: 42,
      sourceType: "workflow",
      sourceId: "17",
      status: "waiting_for_human",
      controlMode: "observe",
      sessionVersion: 2,
      controllerActorType: null,
      controllerActorId: null,
      controllerConnectionId: null,
      controllerLeaseExpiresAt: null,
      pauseReason: null,
      pendingAssistRequestId: "assist_1",
      pendingApprovalRequestId: null,
      barrierType: "login_required",
      policyContext: {},
      browserContextRef: {
        pageTitle: "Sign In",
        url: "https://example.com/login",
      },
      stream: {
        viewerToken: "viewer-token",
        expiresAt: "2026-03-12T10:10:00.000Z",
      },
      activeTabCount: 1,
      startedAt: "2026-03-12T10:00:00.000Z",
      lastActivityAt: "2026-03-12T10:05:00.000Z",
      endedAt: null,
      endReason: null,
    }, "17");

    expect(artifact.launchContext?.originSurface).toBe("workflow");
    expect(artifact.summary.badgeLabel).toBe("Login Required");
    expect(artifact.summary.primaryActionLabel).toBe("Take Control");
  });

  it("extracts workflow Browser Session ids and comparison previews from raw output", () => {
    expect(getWorkflowBrowserSessionId({ browserSessionId: "lbs_123" })).toBe("lbs_123");

    expect(
      normalizeWorkflowComparisonPreview({
        title: "Bangkok Hotels",
        comparisonKind: "hotel",
        summary: "Closest options first",
        options: [
          {
            vendor: "Booking.com",
            optionTitle: "Asok Suites",
            priceLabel: "THB 4,200",
          },
        ],
      }),
    ).toMatchObject({
      lifecycleState: "preview_generated",
      data: {
        comparisonKind: "hotel",
        title: "Bangkok Hotels",
      },
    });
  });

  it("strips workflow presentation fields from rich output fallback rendering", () => {
    expect(
      stripWorkflowPresentationFields({
        browserSessionArtifact: { sessionId: "lbs_123" },
        comparisonPreview: { summaryText: "ready" },
        note: "keep me",
      }),
    ).toEqual({ note: "keep me" });

    expect(
      stripWorkflowPresentationFields({
        browserSessionArtifact: { sessionId: "lbs_123" },
      }),
    ).toBeNull();
  });
});
