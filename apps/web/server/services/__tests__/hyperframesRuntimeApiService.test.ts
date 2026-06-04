import { describe, expect, it } from "vitest";

import {
  HyperframesArtifactRefSchema,
  buildHyperframesLibraryIdempotencyKey,
} from "@shared/hyperframes/contracts";
import {
  buildHyperframesFinalizeInputFromCompletedRender,
  isHyperframesRunEligibleForPreview,
} from "../hyperframesRuntimeApiService";
import { buildHyperframesRenderProjection } from "../hyperframesRenderService";

describe("hyperframesRuntimeApiService", () => {
  it("blocks preview queueing until Storyboard Review evidence exists", () => {
    expect(
      isHyperframesRunEligibleForPreview({
        id: "mar_1",
        resultJson: {},
        metadataJson: {},
        timeline: { items: [] },
      })
    ).toEqual({
      eligible: false,
      reason: "storyboard_review_not_ready",
    });
  });

  it("allows preview queueing when Storyboard Review output is present", () => {
    expect(
      isHyperframesRunEligibleForPreview({
        id: "mar_1",
        resultJson: { storyboardReviewId: "review_1" },
      })
    ).toEqual({
      eligible: true,
      reason: "storyboard_ready",
    });
    expect(
      isHyperframesRunEligibleForPreview({
        id: "mar_2",
        timeline: {
          items: [
            {
              stageKey: "storyboard_review",
              status: "completed_with_warnings",
            },
          ],
        },
      }).eligible
    ).toBe(true);
  });

  it("rejects Library finalization for preview-only renders", () => {
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        platformPresetId: "generic_vertical_9_16",
        renderIntent: "preview",
        compositionMode: "storyboard_motion_preview",
      },
    });

    expect(() =>
      buildHyperframesFinalizeInputFromCompletedRender({
        auth: { userId: 1, tenantId: "tenant_1" },
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
        idempotencyKey: "hyperframes-library:tenant_1:mar_1:preview:hf_input:hf_output",
        render,
      })
    ).toThrow(/Preview-only/);
  });

  it("builds Library finalization input from completed durable artifact refs", () => {
    const outputArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const render = buildHyperframesRenderProjection({
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
      artifactRefs: [outputArtifactRef],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.com/output.mp4",
          storageRef: outputArtifactRef.storageRef,
          contentHash: outputArtifactRef.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });
    const idempotencyKey = buildHyperframesLibraryIdempotencyKey({
      tenantId: "tenant_1",
      runId: "mar_1",
      renderIntent: "final",
      compositionInputHash: "hf_input",
      outputHash: "hf_output",
    });

    const finalizeInput = buildHyperframesFinalizeInputFromCompletedRender({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      idempotencyKey,
      render,
    });

    expect(finalizeInput.outputArtifactRef).toEqual(outputArtifactRef);
    expect(finalizeInput.payload.outputArtifactRef).toEqual(outputArtifactRef);
    expect(finalizeInput.payload.qaStatus).toBe("passed");
    expect(finalizeInput.payload.compositionHtmlHash).toBe("hf_html");
    expect(finalizeInput.payload.templateContentHash).toBe("hf_template");
    expect(finalizeInput.payload.runtimeProfileHash).toBe("hf_runtime");
  });

  it("rejects durable output when render QA is not passed", () => {
    const outputArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const render = buildHyperframesRenderProjection({
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
      },
      artifactRefs: [outputArtifactRef],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          storageRef: outputArtifactRef.storageRef,
          contentHash: outputArtifactRef.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    expect(() =>
      buildHyperframesFinalizeInputFromCompletedRender({
        auth: { userId: 1, tenantId: "tenant_1" },
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
        idempotencyKey: buildHyperframesLibraryIdempotencyKey({
          tenantId: "tenant_1",
          runId: "mar_1",
          renderIntent: "final",
          compositionInputHash: "hf_input",
          outputHash: "hf_output",
        }),
        render,
      })
    ).toThrow(/QA/);
  });
});
