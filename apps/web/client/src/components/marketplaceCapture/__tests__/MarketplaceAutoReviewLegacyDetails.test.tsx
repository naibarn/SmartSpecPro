import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketplaceAutoReviewLegacyDetails } from "../MarketplaceAutoReviewLegacyDetails";

describe("MarketplaceAutoReviewLegacyDetails", () => {
  it("shows the complete read-only legacy run history and available outputs", () => {
    const onCreateStaged = vi.fn();

    render(
      <MarketplaceAutoReviewLegacyDetails
        productName="สินค้าทดสอบ"
        onCreateStaged={onCreateStaged}
        run={{
          id: "mar-legacy-1",
          status: "running",
          currentStage: "storyboard_review",
          updatedAt: "2026-07-26T12:00:00.000Z",
          timeline: {
            currentStage: "storyboard_review",
            progressPercent: 50,
            statusDetail: {
              severity: "info",
              safeMessage: "กำลังตรวจผลภาพ",
            },
            items: [
              {
                order: 1,
                stageKey: "concept_story",
                label: "สร้างแนวคิดและโครงเรื่อง",
                status: "completed",
                progressPercent: 100,
                detail: { safeMessage: "สร้างเรื่องแล้ว" },
                credit: { spentCredits: 2, refundedCredits: 0 },
                evidenceRefs: ["evidence:story"],
              },
              {
                order: 2,
                stageKey: "storyboard_review",
                label: "ส่งเข้า Storyboard Review",
                status: "running",
                progressPercent: 50,
                detail: {
                  safeMessage: "กำลังตรวจผลภาพ",
                  nextAction: "รอ provider",
                },
                credit: { spentCredits: 4, refundedCredits: 1 },
                evidenceRefs: [],
              },
            ],
          },
          creditSummary: {
            estimateCredits: 10,
            reservedCredits: 3,
            spentCredits: 6,
            refundedCredits: 1,
            outstandingCredits: 3,
          },
          resultJson: {
            frameUrls: ["https://cdn.example.com/frame-1.png"],
          },
          outputLinks: [
            {
              kind: "storyboard_review",
              url: "/storyboard-review/123",
              label: "Storyboard",
            },
          ],
        }}
      />
    );

    expect(screen.getByText("Legacy Auto Review")).toBeTruthy();
    expect(screen.getByText("สิ่งที่เกิดขึ้นแล้วในงานนี้")).toBeTruthy();
    expect(screen.getByText("สร้างแนวคิดและโครงเรื่อง")).toBeTruthy();
    expect(screen.getByText("กำลังตรวจผลภาพ")).toBeTruthy();
    expect(screen.getByText("เปิด Storyboard Review")).toBeTruthy();
    expect(screen.getByAltText("ผลลัพธ์ภาพที่ 1")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /สร้าง Job แบบตรวจทีละขั้น/ })
    );
    expect(onCreateStaged).toHaveBeenCalledTimes(1);
  });
});
