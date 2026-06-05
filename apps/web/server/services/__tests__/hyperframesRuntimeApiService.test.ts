import { describe, expect, it } from "vitest";

import {
  HyperframesArtifactRefSchema,
  buildHyperframesLibraryIdempotencyKey,
} from "@shared/hyperframes/contracts";
import {
  buildHyperframesFinalizeInputFromCompletedRender,
  buildHyperframesLibrarySaveChargeSummary,
  isHyperframesRunEligibleForPreview,
} from "../hyperframesRuntimeApiService";
import { buildHyperframesRenderProjection } from "../hyperframesRenderService";
import { CreateHyperframesPreviewInputSchema } from "@shared/hyperframes/runtimeApiSchemas";

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

  it("keeps createHyperframesPreview scoped to supported preview requests", () => {
    expect(
      CreateHyperframesPreviewInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        renderIntent: "preview",
        compositionMode: "storyboard_motion_preview",
      })
    ).toMatchObject({
      productId: "product_1",
      runId: "mar_1",
      renderIntent: "preview",
      compositionMode: "storyboard_motion_preview",
    });
    expect(() =>
      CreateHyperframesPreviewInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        renderIntent: "final",
      })
    ).toThrow();
    expect(() =>
      CreateHyperframesPreviewInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        idempotencyKey: "caller_supplied",
      })
    ).toThrow();
  });

  it("separates new and duplicate Library finalize no-charge reasons", () => {
    expect(
      buildHyperframesLibrarySaveChargeSummary({
        created: true,
        idempotencyKey: "hyperframes-library:tenant_1:mar_1:final:hf_input:hf_output",
      })
    ).toMatchObject({
      chargeRequired: false,
      noChargeReason: "not_billable",
    });
    expect(
      buildHyperframesLibrarySaveChargeSummary({
        created: false,
        idempotencyKey: "hyperframes-library:tenant_1:mar_1:final:hf_input:hf_output",
      })
    ).toMatchObject({
      chargeRequired: false,
      noChargeReason: "duplicate_library_finalize",
    });
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

  it("uses the durable final video when snapshot output refs appear first", () => {
    const snapshotArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "snapshot_1",
      kind: "hyperframes_snapshot",
      storageRef:
        "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/snapshot.png",
      contentHash: "hf_snapshot",
      mimeType: "image/png",
      retentionClass: "review",
      redacted: true,
    });
    const outputArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef:
        "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
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
      artifactRefs: [snapshotArtifactRef, outputArtifactRef],
      outputRefs: [
        {
          outputId: "snapshot_1",
          kind: "snapshot",
          url: "https://cdn.example.com/snapshot.png",
          storageRef: snapshotArtifactRef.storageRef,
          thumbnailUrl: "https://cdn.example.com/snapshot-thumb.png",
          contentHash: snapshotArtifactRef.contentHash,
          accessibleLabel: "Snapshot",
        },
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.com/output.mp4",
          storageRef: outputArtifactRef.storageRef,
          thumbnailUrl: "https://cdn.example.com/output-thumb.jpg",
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

    expect(finalizeInput.outputArtifactRef.contentHash).toBe("hf_output");
    expect(finalizeInput.outputUrl).toBe("https://cdn.example.com/output.mp4");
    expect(finalizeInput.thumbnailUrl).toBe(
      "https://cdn.example.com/output-thumb.jpg"
    );
    expect(finalizeInput.payload.outputArtifactRef).toEqual(outputArtifactRef);
    expect(finalizeInput.payload.outputUrl).toBe(
      "https://cdn.example.com/output.mp4"
    );
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
