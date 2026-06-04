import { describe, expect, it } from "vitest";

import { HyperframesArtifactRefSchema } from "@shared/hyperframes/contracts";
import { buildHyperframesCompositionInput } from "../hyperframesCompositionService";
import {
  buildHyperframesRenderJobPayload,
  buildHyperframesRenderProjection,
  mapOutboxStatusToRenderStatus,
} from "../hyperframesRenderService";

describe("hyperframesRenderService", () => {
  it("builds required outbox payload hash fields", () => {
    const composition = buildHyperframesCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: {
        selectedImageUrls: ["https://cdn.example.com/product.png"],
      },
    });
    const payload = buildHyperframesRenderJobPayload({ composition });

    expect(payload).toMatchObject({
      productId: "product_1",
      compositionInputHash: composition.provenance.compositionInputHash,
      templateId: "marketplace_storyboard_motion_9x9_v1",
      platformPresetId: "generic_vertical_9_16",
      renderIntent: "preview",
      compositionMode: "storyboard_motion_preview",
      launchMode: "auto_storyboard_review",
    });
    expect(payload.compositionHtmlHash).toMatch(/^hf_/);
    expect(payload.runtimeProfileHash).toMatch(/^hf_/);
  });

  it("always returns explicit repairActions arrays", () => {
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "failed_transient",
      safeDiagnostics: ["storage timeout"],
    });

    expect(projection.repairActions).toHaveLength(1);
    expect(projection.repairActions[0]?.actionType).toBe("retry_worker_step");
    expect(projection.redaction.rawHtmlHidden).toBe(true);
  });

  it("carries completed output refs and artifact refs from runtime payload", () => {
    const artifact = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const projection = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        compositionHtmlHash: "hf_html",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        templateContentHash: "hf_template",
        platformPresetId: "generic_vertical_9_16",
        platformPresetVersion: "1.0.0",
        renderIntent: "final",
        compositionMode: "storyboard_motion_preview",
        runtimeProfileHash: "hf_runtime",
        launchMode: "auto_storyboard_review",
        traceId: "trace_1",
        correlationId: "corr_1",
        qaStatus: "passed",
      },
      artifactRefs: [artifact],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.com/output.mp4",
          storageRef: artifact.storageRef,
          contentHash: artifact.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    expect(projection.outputRefs[0]).toMatchObject({
      kind: "final_video",
      contentHash: "hf_output",
    });
    expect(projection.artifactRefs[0]?.retentionClass).toBe("library");
    expect(projection.qaStatus).toBe("passed");
    expect(projection.compositionHtmlHash).toBe("hf_html");
    expect(projection.runtimeProfileHash).toBe("hf_runtime");
  });

  it("keeps runtime-deferred worker failures transient while QA failures stay permanent", () => {
    expect(
      mapOutboxStatusToRenderStatus(
        "failed",
        "HyperFrames runtime execution is not implemented in this web worker; dependency/runtime rollout must provide render, inspect, QA, and artifact persistence."
      )
    ).toBe("failed_transient");
    expect(
      mapOutboxStatusToRenderStatus("failed", "QA rejected unsafe output")
    ).toBe("failed_permanent");
  });
});
