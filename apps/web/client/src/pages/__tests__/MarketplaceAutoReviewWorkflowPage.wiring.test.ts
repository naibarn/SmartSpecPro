import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  new URL("../../App.tsx", import.meta.url),
  "utf8"
);
const workflowSource = readFileSync(
  new URL("../MarketplaceAutoReviewWorkflowPage.tsx", import.meta.url),
  "utf8"
);
const surfaceSource = readFileSync(
  new URL(
    "../../components/marketplaceCapture/StagedCheckpointReviewSurface.tsx",
    import.meta.url
  ),
  "utf8"
);
const panelSource = readFileSync(
  new URL(
    "../../components/marketplaceCapture/StagedCheckpointReviewPanel.tsx",
    import.meta.url
  ),
  "utf8"
);
const productSource = readFileSync(
  new URL("../MarketplaceCaptureProductDetail.tsx", import.meta.url),
  "utf8"
);
const storyboardSource = readFileSync(
  new URL("../StoryboardReviewPage.tsx", import.meta.url),
  "utf8"
);

describe("Marketplace staged auto-review workflow page wiring", () => {
  it("registers an authenticated dedicated run route", () => {
    expect(appSource).toContain("MarketplaceAutoReviewWorkflowPage");
    expect(appSource).toContain("/marketplace/auto-review/new/:productId");
    expect(appSource).toContain("/marketplace/auto-review/:runId");
    expect(workflowSource).toContain("StagedCheckpointReviewSurface");
    expect(workflowSource).toContain("MarketplaceAutoReviewLegacyDetails");
    expect(workflowSource).toContain("onCreateStaged");
    expect(workflowSource).toContain("Job Workbench");
    expect(surfaceSource).toContain("StagedCheckpointReviewPanel");
    expect(panelSource).toContain("Checkpoint progress");
    expect(workflowSource).toContain("ไป Storyboard Review");
  });

  it("keeps product and storyboard pages as entry points to the workbench", () => {
    expect(productSource).toContain("isAutoReviewJobSetupRoute");
    expect(productSource).toContain("ตั้งค่า Job Review");
    expect(productSource).toContain("/marketplace/auto-review/new/");
    expect(productSource).toMatch(
      /const autoStoryboardReviewSurface\s*=\s*\n\s*isAutoReviewJobSetupRoute &&/
    );
    expect(productSource).toContain(
      "isAutoReviewJobSetupRoute && showAutoReviewRuns"
    );
    expect(productSource).toContain(
      'isAutoReviewJobSetupRoute ? "" : "hidden"'
    );
    expect(productSource).toContain(
      "/marketplace/auto-review/${encodeURIComponent(stagedAutoReviewRunId)}"
    );
    expect(storyboardSource).toContain(
      "/marketplace/auto-review/${encodeURIComponent(stagedWorkflowRunId)}"
    );
    expect(storyboardSource).toContain(
      "Storyboard Review คือขั้นแก้ละเอียดหลังผ่าน Job Workbench"
    );
    expect(productSource).not.toContain("<StagedCheckpointReviewPanel");
    expect(productSource).not.toContain("StagedCheckpointReviewSurface");
    expect(storyboardSource).not.toContain("<StagedCheckpointReviewPanel");
  });
});
