import { describe, expect, it } from "vitest";

import {
  openClawBrowserJobPayloadSchema,
  openClawWorkflowJobPayloadSchema,
  workerCallbackMetadataSchema,
} from "../workerOpenClawPayloads";

describe("workerOpenClawPayloads", () => {
  it("parses browser automation payloads with typed browser session context", () => {
    const parsed = openClawBrowserJobPayloadSchema.parse({
      stage: "review_gate",
      sessionId: "lbs_demo_123",
      currentUrl: "https://example.com/checkout",
      pageTitle: "Checkout",
      browserState: "review_required",
      connectorFamilies: ["crm", "billing"],
      publishedArtifacts: [{ artifactId: "artifact-1", label: "queue-summary" }],
      browserSession: {
        sessionId: "lbs_demo_123",
        state: "review_required",
        pageTitle: "Checkout",
        url: "https://example.com/checkout",
      },
    });

    expect(parsed.browserSession?.state).toBe("review_required");
    expect(parsed.publishedArtifacts[0]?.label).toBe("queue-summary");
  });

  it("parses workflow automation payloads and callback metadata with nested lane details", () => {
    const workflowPayload = openClawWorkflowJobPayloadSchema.parse({
      workflowRunId: "wf_run_123",
      stage: "publish_results",
      intent: "workpack_workflow_step",
      resultSummary: "Published the normalized manifest",
      publishedArtifacts: [{ artifactId: "artifact-2", label: "manifest" }],
    });

    const metadata = workerCallbackMetadataSchema.parse({
      lane: "workflow",
      workpackId: "wp_1",
      runId: "run_1",
      stepId: "step_1",
      workflowRunId: "wf_run_123",
      workflowPayload,
    });

    expect(metadata.workflowPayload?.intent).toBe("workpack_workflow_step");
    expect(metadata.workflowPayload?.publishedArtifacts[0]?.label).toBe("manifest");
  });
});
