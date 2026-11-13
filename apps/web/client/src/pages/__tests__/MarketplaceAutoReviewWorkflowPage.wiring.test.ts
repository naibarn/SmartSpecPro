import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  resolve(process.cwd(), "client/src/App.tsx"),
  "utf8"
);
const workflowSource = readFileSync(
  resolve(
    process.cwd(),
    "client/src/pages/MarketplaceAutoReviewWorkflowPage.tsx"
  ),
  "utf8"
);
const surfaceSource = readFileSync(
  resolve(
    process.cwd(),
    "client/src/components/marketplaceCapture/StagedCheckpointReviewSurface.tsx"
  ),
  "utf8"
);
const panelSource = readFileSync(
  resolve(
    process.cwd(),
    "client/src/components/marketplaceCapture/StagedCheckpointReviewPanel.tsx"
  ),
  "utf8"
);
const productSource = readFileSync(
  resolve(
    process.cwd(),
    "client/src/pages/MarketplaceCaptureProductDetail.tsx"
  ),
  "utf8"
);
const storyboardSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/StoryboardReviewPage.tsx"),
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
    expect(productSource).toContain(
      '"เปิด Job Workbench แล้ว กรุณาตรวจ Prompt และผลลัพธ์รายช็อตก่อนใช้เครดิต"'
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

  it("keeps workbench context compact and opens the related product in a new tab", () => {
    expect(workflowSource).toContain('aria-label="ข้อมูล Job Workbench"');
    expect(workflowSource).toContain("href={productDetailHref}");
    expect(workflowSource).toContain('target="_blank"');
    expect(workflowSource).toContain('rel="noopener noreferrer"');
    expect(workflowSource).not.toContain(
      "พื้นที่ทำงานสำหรับตรวจและยืนยันทีละ checkpoint"
    );
    expect(workflowSource).not.toContain(
      "หน้านี้คือรายละเอียดของงานที่เลือก: ใช้ตรวจ Prompt และผลลัพธ์"
    );
  });
});
