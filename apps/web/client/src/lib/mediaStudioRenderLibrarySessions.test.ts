import { describe, expect, it } from "vitest";

import {
  createDefaultHyperframesPollingGuidance,
  type HyperframesRenderStatusProjection,
} from "@shared/hyperframes/contracts";
import {
  buildHyperframesRenderLibrarySession,
  buildHyperframesRenderLibrarySaveInputFromSession,
  getHyperframesRenderDisplayOutput,
  getHyperframesRenderLibraryReadyOutput,
} from "./mediaStudioRenderLibrarySessions";

const baseRender: HyperframesRenderStatusProjection = {
  schemaVersion: 1,
  contractVersion: "hyperframes_marketplace_auto_review_v1",
  launchMode: "auto_storyboard_review",
  tenantId: "tenant_1",
  productId: "product_1",
  runId: "mar_1",
  renderJobId: "hf_render_1",
  status: "completed",
  progressPercent: 100,
  statusCopyId: "hyperframes.status.completed",
  safeMessage: "Render complete",
  safeDiagnostics: [],
  repairActions: [],
  polling: createDefaultHyperframesPollingGuidance("completed"),
  renderIntent: "final",
  compositionInputHash: "hf_input",
  qaStatus: "passed",
  outputRefs: [
    {
      outputId: "output_1",
      kind: "final_video",
      url: "https://cdn.example.test/output.mp4",
      contentHash: "hf_output",
      accessibleLabel: "Final HyperFrames video",
    },
  ],
  artifactRefs: [
    {
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef:
        "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    },
  ],
  redaction: {
    rawHtmlHidden: true,
    signedUrlsHidden: true,
    workerLogsHidden: true,
    storageKeysHidden: true,
  },
  updatedAt: "2026-06-04T00:00:00.000Z",
};

describe("mediaStudioRenderLibrarySessions", () => {
  it("builds a reload-safe HyperFrames render-to-library session from final output", () => {
    const output = getHyperframesRenderLibraryReadyOutput(baseRender);
    const session = buildHyperframesRenderLibrarySession(baseRender, {
      title: "Product demo",
    });

    expect(output?.contentHash).toBe("hf_output");
    expect(session).toMatchObject({
      source: "marketplace_auto_review_hyperframes_render",
      jobId: "hf_render_1",
      productionRunId: "mar_1",
      title: "Product demo",
      metadata: {
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
        outputHash: "hf_output",
      },
    });
    expect(buildHyperframesRenderLibrarySaveInputFromSession(session)).toEqual({
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      idempotencyKey: "hyperframes-library:tenant_1:mar_1:final:hf_input:hf_output",
    });
  });

  it("does not create sessions for preview-only or already-saved outputs", () => {
    expect(
      buildHyperframesRenderLibrarySession({
        ...baseRender,
        renderIntent: "preview",
        outputRefs: [
          {
            outputId: "preview_1",
            kind: "preview_video",
            contentHash: "hf_preview",
            accessibleLabel: "Preview video",
          },
        ],
      })
    ).toBeNull();
    expect(
      buildHyperframesRenderLibrarySession({
        ...baseRender,
        outputRefs: [
          {
            outputId: "library_1",
            kind: "library_item",
            contentHash: "hf_output",
            accessibleLabel: "Library video",
          },
        ],
      })
    ).toBeNull();
  });

  it("allows redacted public refs but rejects temporary artifacts and failed QA", () => {
    expect(
      getHyperframesRenderLibraryReadyOutput({
        ...baseRender,
        artifactRefs: [],
      })
    ).toMatchObject({
      outputId: "output_1",
      contentHash: "hf_output",
    });
    expect(
      buildHyperframesRenderLibrarySession({
        ...baseRender,
        artifactRefs: [],
      })
    ).toMatchObject({
      source: "marketplace_auto_review_hyperframes_render",
      jobId: "hf_render_1",
    });
    expect(
      buildHyperframesRenderLibrarySession({
        ...baseRender,
        artifactRefs: [
          {
            artifactId: "temporary_output",
            kind: "hyperframes_render_mp4",
            storageRef:
              "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/temp.mp4",
            contentHash: "hf_output",
            mimeType: "video/mp4",
            retentionClass: "temporary",
            redacted: true,
          },
        ],
      })
    ).toBeNull();
    expect(
      getHyperframesRenderLibraryReadyOutput({
        ...baseRender,
        qaStatus: "failed",
      })
    ).toBeNull();
    expect(
      buildHyperframesRenderLibrarySession({
        ...baseRender,
        qaStatus: undefined,
      })
    ).toBeNull();
  });

  it("selects the first final output that has a matching library-retained artifact", () => {
    const output = getHyperframesRenderLibraryReadyOutput({
      ...baseRender,
      outputRefs: [
        {
          outputId: "output_temporary",
          kind: "final_video",
          url: "https://cdn.example.test/temp.mp4",
          contentHash: "hf_temp",
          accessibleLabel: "Temporary final video",
        },
        {
          outputId: "output_library",
          kind: "final_video",
          url: "https://cdn.example.test/final.mp4",
          contentHash: "hf_library",
          accessibleLabel: "Library final video",
        },
      ],
      artifactRefs: [
        {
          artifactId: "output_temporary",
          kind: "hyperframes_render_mp4",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/temp.mp4",
          contentHash: "hf_temp",
          mimeType: "video/mp4",
          retentionClass: "temporary",
          redacted: true,
        },
        {
          artifactId: "output_library",
          kind: "hyperframes_render_mp4",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/final.mp4",
          contentHash: "hf_library",
          mimeType: "video/mp4",
          retentionClass: "library",
          redacted: true,
        },
      ],
    });

    expect(output?.outputId).toBe("output_library");
    expect(output?.contentHash).toBe("hf_library");
  });

  it("prefers the final video for display when snapshot refs appear first", () => {
    const render: HyperframesRenderStatusProjection = {
      ...baseRender,
      outputRefs: [
        {
          outputId: "snapshot_1",
          kind: "snapshot",
          url: "https://cdn.example.test/snapshot.png",
          contentHash: "hf_snapshot",
          accessibleLabel: "Snapshot",
        },
        {
          outputId: "output_library",
          kind: "final_video",
          url: "https://cdn.example.test/final.mp4",
          contentHash: "hf_library",
          accessibleLabel: "Library final video",
        },
      ],
      artifactRefs: [
        {
          artifactId: "snapshot_1",
          kind: "hyperframes_snapshot",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/snapshot.png",
          contentHash: "hf_snapshot",
          mimeType: "image/png",
          retentionClass: "review",
          redacted: true,
        },
        {
          artifactId: "output_library",
          kind: "hyperframes_render_mp4",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/final.mp4",
          contentHash: "hf_library",
          mimeType: "video/mp4",
          retentionClass: "library",
          redacted: true,
        },
      ],
    };

    expect(getHyperframesRenderLibraryReadyOutput(render)?.outputId).toBe(
      "output_library"
    );
    expect(getHyperframesRenderDisplayOutput(render)?.outputId).toBe(
      "output_library"
    );
  });

  it("rejects incomplete HyperFrames render-to-library sessions", () => {
    expect(
      buildHyperframesRenderLibrarySaveInputFromSession({
        version: 1,
        source: "marketplace_auto_review_hyperframes_render",
        jobId: "hf_render_1",
        productionRunId: "mar_1",
        metadata: {
          productId: "product_1",
          runId: "mar_1",
        },
        startedAt: 1,
        updatedAt: 1,
      })
    ).toBeNull();
  });
});
