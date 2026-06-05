import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createDefaultHyperframesPollingGuidance,
  type HyperframesRenderStatusProjection,
} from "@shared/hyperframes/contracts";
import { HyperframesStoryboardReviewPanel } from "../HyperframesStoryboardReviewPanel";

describe("HyperframesStoryboardReviewPanel", () => {
  it("prioritizes safe auto-repair before manual fallback", () => {
    const onRetry = vi.fn();
    const renderProjection: HyperframesRenderStatusProjection = {
      schemaVersion: 1,
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      launchMode: "auto_storyboard_review",
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "stale_input_hash",
      progressPercent: 100,
      statusCopyId: "hyperframes.status.stale_input_hash",
      safeMessage: "Plan changed",
      safeDiagnostics: [],
      permissions: { canCancel: false, canRepair: true },
      repairActions: [
        {
          actionId: "repair_regenerate_from_current_plan",
          actionType: "regenerate_from_current_plan",
          label: "Regenerate from current plan",
          safeDescription: "Rebuild safely",
          requiresOperator: false,
          auditRequired: true,
          disabledReason: null,
        },
      ],
      polling: createDefaultHyperframesPollingGuidance("stale_input_hash"),
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

    render(
      <HyperframesStoryboardReviewPanel
        render={renderProjection}
        onRetry={onRetry}
        manualFallbackVisible
      />
    );

    const repairButtons = screen.getAllByRole("button", {
      name: /regenerate from current plan/i,
    });
    expect(repairButtons).toHaveLength(1);
    fireEvent.click(repairButtons[0]);
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByText(/manual render controls are available/i)).toBeTruthy();
  });

  it("does not expose operator-only repair as a user auto action", () => {
    const onRetry = vi.fn();
    const renderProjection: HyperframesRenderStatusProjection = {
      schemaVersion: 1,
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      launchMode: "auto_storyboard_review",
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "failed_permanent",
      progressPercent: 100,
      statusCopyId: "hyperframes.status.failed_permanent",
      safeMessage: "Operator support required",
      safeDiagnostics: [],
      permissions: { canCancel: false, canRepair: false },
      repairActions: [
        {
          actionId: "repair_operator_rerun",
          actionType: "rerun_layout_inspect",
          label: "Rerun layout inspect",
          safeDescription: "Requires support",
          requiresOperator: true,
          auditRequired: true,
          disabledReason: null,
        },
      ],
      polling: createDefaultHyperframesPollingGuidance("failed_permanent"),
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

    render(
      <HyperframesStoryboardReviewPanel
        render={renderProjection}
        onRetry={onRetry}
        manualFallbackVisible
      />
    );

    expect(
      screen.queryByRole("button", { name: /rerun layout inspect/i })
    ).toBeNull();
    expect(screen.getByText(/manual render controls are available/i)).toBeTruthy();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
