import { describe, expect, it } from "vitest";

import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesRenderStatusProjectionSchema,
  buildHyperframesCreditIdempotencyKey,
  buildHyperframesLibraryIdempotencyKey,
  buildHyperframesRenderJobIdempotencyKey,
  createDefaultHyperframesPollingGuidance,
  hyperframesTerminalStatuses,
  isTerminalHyperframesStatus,
} from "../contracts";

describe("HyperFrames Marketplace contracts", () => {
  it("keeps Auto Storyboard Review separate from Standard Order", () => {
    const projection = HyperframesRenderStatusProjectionSchema.parse({
      contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      renderJobId: "hf_render_1",
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      launchMode: "auto_storyboard_review",
      status: "queued",
      progressPercent: 0,
      statusCopyId: "hyperframes.status.queued",
      safeMessage: "Queued",
      repairActions: [],
      polling: createDefaultHyperframesPollingGuidance("queued"),
      updatedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(projection.contractVersion).toBe(
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION
    );
    expect(projection.launchMode).toBe("auto_storyboard_review");
    expect(projection.repairActions).toEqual([]);
    expect(projection.redaction).toMatchObject({
      rawHtmlHidden: true,
      signedUrlsHidden: true,
      workerLogsHidden: true,
      storageKeysHidden: true,
    });
  });

  it("builds deterministic idempotency keys for credit, render, and library", () => {
    expect(
      buildHyperframesCreditIdempotencyKey({
        tenantId: "tenant_1",
        runId: "mar_1",
        renderIntent: "preview",
        compositionInputHash: "hf_input",
        templateVersion: "1.0.0",
        platformPresetId: "generic_vertical_9_16",
      })
    ).toBe(
      "hyperframes-credit:tenant_1:mar_1:preview:hf_input:1.0.0:generic_vertical_9_16"
    );
    expect(
      buildHyperframesRenderJobIdempotencyKey({
        tenantId: "tenant_1",
        runId: "mar_1",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        platformPresetId: "generic_vertical_9_16",
        renderIntent: "preview",
        compositionInputHash: "hf_input",
      })
    ).toBe(
      "hyperframes:tenant_1:mar_1:marketplace_storyboard_motion_9x9_v1:1.0.0:generic_vertical_9_16:preview:hf_input"
    );
    expect(
      buildHyperframesLibraryIdempotencyKey({
        tenantId: "tenant_1",
        runId: "mar_1",
        renderIntent: "final",
        compositionInputHash: "hf_input",
        outputHash: "hf_output",
      })
    ).toBe("hyperframes-library:tenant_1:mar_1:final:hf_input:hf_output");
  });

  it("marks terminal statuses and polling stop statuses explicitly", () => {
    expect(isTerminalHyperframesStatus("completed")).toBe(true);
    expect(isTerminalHyperframesStatus("rendering")).toBe(false);
    expect(createDefaultHyperframesPollingGuidance("rendering")).toMatchObject({
      recommendedIntervalMs: 5000,
      maxIntervalMs: 30000,
      terminalState: false,
    });
    expect(
      createDefaultHyperframesPollingGuidance("completed").stopWhenStatus
    ).toEqual(hyperframesTerminalStatuses);
  });
});
