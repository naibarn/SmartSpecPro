import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createDefaultHyperframesPollingGuidance,
  type HyperframesRenderStatusProjection,
} from "@shared/hyperframes/contracts";
import { HyperframesRenderPanel } from "../HyperframesRenderPanel";

describe("HyperframesRenderPanel", () => {
  const baseRenderProjection: HyperframesRenderStatusProjection = {
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
    outputRefs: [],
    artifactRefs: [],
    redaction: {
      rawHtmlHidden: true,
      signedUrlsHidden: true,
      workerLogsHidden: true,
      storageKeysHidden: true,
    },
    updatedAt: "2026-06-04T00:00:00.000Z",
  };

  it("shows progress and safe repair action", () => {
    const onRetry = vi.fn();
    const renderProjection: HyperframesRenderStatusProjection = {
      schemaVersion: 1,
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      launchMode: "auto_storyboard_review",
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "failed_transient",
      progressPercent: 60,
      statusCopyId: "hyperframes.status.failed_transient",
      safeMessage: "Temporary failure",
      safeDiagnostics: ["storage timeout"],
      repairActions: [
        {
          actionId: "repair_retry_worker_step",
          actionType: "retry_worker_step",
          label: "Retry worker step",
          safeDescription: "Retry safely",
          requiresOperator: false,
          auditRequired: true,
          disabledReason: null,
        },
      ],
      polling: createDefaultHyperframesPollingGuidance("failed_transient"),
      outputRefs: [],
      artifactRefs: [],
      redaction: {
        rawHtmlHidden: true,
        signedUrlsHidden: true,
        workerLogsHidden: true,
        storageKeysHidden: true,
      },
      updatedAt: "2026-06-04T00:00:00.000Z",
    };

    render(<HyperframesRenderPanel render={renderProjection} onRetry={onRetry} />);

    expect(screen.getByText("HyperFrames render")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry worker step/i }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByText(new RegExp("marketplace-auto-review/"))).toBeNull();
  });

  it("does not offer Library save for completed preview-only output", () => {
    const onSave = vi.fn();

    render(
      <HyperframesRenderPanel
        render={{
          ...baseRenderProjection,
          renderIntent: "preview",
          outputRefs: [
            {
              outputId: "preview_1",
              kind: "preview_video",
              contentHash: "hf_preview",
              accessibleLabel: "Preview video",
            },
          ],
        }}
        onSaveToLibrary={onSave}
      />
    );

    expect(screen.queryByRole("button", { name: /save to library/i })).toBeNull();
  });

  it("offers Library save only for durable final output with content hash", () => {
    const onSave = vi.fn();

    render(
      <HyperframesRenderPanel
        render={{
          ...baseRenderProjection,
          renderIntent: "final",
      compositionInputHash: "hf_input",
      outputRefs: [
        {
          outputId: "final_1",
          kind: "final_video",
          contentHash: "hf_output",
          accessibleLabel: "Final video",
        },
      ],
      artifactRefs: [
        {
          artifactId: "final_1",
          kind: "hyperframes_render_mp4",
          storageRef:
            "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
          contentHash: "hf_output",
          mimeType: "video/mp4",
          retentionClass: "library",
          redacted: true,
        },
      ],
    }}
    onSaveToLibrary={onSave}
  />
    );

    fireEvent.click(screen.getByRole("button", { name: /save to library/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not expose output or artifact details through production DOM attributes", () => {
    const { container } = render(
      <HyperframesRenderPanel
        render={{
          ...baseRenderProjection,
          renderIntent: "final",
          compositionInputHash: "hf_input",
          outputRefs: [
            {
              outputId: "final_1",
              kind: "final_video",
              contentHash: "hf_output",
              accessibleLabel: "Final video",
            },
          ],
          artifactRefs: [
            {
              artifactId: "final_1",
              kind: "hyperframes_render_mp4",
              storageRef:
                "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
              contentHash: "hf_output",
              mimeType: "video/mp4",
              retentionClass: "library",
              redacted: true,
            },
          ],
        }}
        onSaveToLibrary={vi.fn()}
      />
    );
    const status = container.querySelector(
      '[aria-label="HyperFrames render status"]'
    );

    expect(status?.getAttribute("data-library-ready")).toBe("true");
    expect(status?.hasAttribute("data-render-output-kinds")).toBe(false);
    expect(status?.hasAttribute("data-render-artifact-kinds")).toBe(false);
    expect(status?.hasAttribute("data-render-intent")).toBe(false);
  });

  it("does not offer Library save when the matching output artifact is not library-retained", () => {
    const onSave = vi.fn();

    render(
      <HyperframesRenderPanel
        render={{
          ...baseRenderProjection,
          renderIntent: "final",
          compositionInputHash: "hf_input",
          outputRefs: [
            {
              outputId: "final_1",
              kind: "final_video",
              contentHash: "hf_output",
              accessibleLabel: "Final video",
            },
          ],
          artifactRefs: [
            {
              artifactId: "final_1",
              kind: "hyperframes_render_mp4",
              storageRef:
                "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
              contentHash: "hf_output",
              mimeType: "video/mp4",
              retentionClass: "temporary",
              redacted: true,
            },
          ],
        }}
        onSaveToLibrary={onSave}
      />
    );

    expect(screen.queryByRole("button", { name: /save to library/i })).toBeNull();
  });
});
