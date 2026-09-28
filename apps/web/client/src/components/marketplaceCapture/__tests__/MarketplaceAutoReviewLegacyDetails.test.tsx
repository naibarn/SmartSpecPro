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
    expect(
      screen.getByRole("button", { name: "ดูประวัติ Legacy เดิม" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "สิ่งที่เกิดขึ้นแล้วในงานนี้" })
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "สร้างแนวคิดและโครงเรื่อง" })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "ดูประวัติ Legacy เดิม" })
    );
    expect(screen.getByText("สิ่งที่เกิดขึ้นแล้วในงานนี้")).toBeTruthy();
    expect(screen.getByText("สร้างแนวคิดและโครงเรื่อง")).toBeTruthy();
    expect(screen.getByText("กำลังตรวจผลภาพ")).toBeTruthy();
    expect(screen.getByText("เปิด Storyboard Review")).toBeTruthy();
    expect(screen.getByAltText("ผลลัพธ์ภาพที่ 1")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /เปิด Job Workbench ใหม่/ })
    );
    expect(onCreateStaged).toHaveBeenCalledTimes(1);
  });

  it("explains why a legacy run has no 9-shot board and offers a staged job", () => {
    const onCreateStaged = vi.fn();
    render(
      <MarketplaceAutoReviewLegacyDetails
        productName="สินค้าทดสอบ"
        onCreateStaged={onCreateStaged}
        run={{
          id: "mar-legacy-no-shot-pack",
          status: "running",
          currentStage: "image_generation",
          metadataJson: {},
        }}
      />
    );

    expect(
      screen.getByText("งานนี้ยังไม่มีข้อมูล 9 ช็อตสำหรับทำงานรายช็อต")
    ).toBeTruthy();
    expect(
      screen.getByText("สร้าง Job ใหม่เพื่อเปิดบอร์ด 9 ช็อต")
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "สร้าง Job ใหม่เพื่อเปิดบอร์ด 9 ช็อต",
      })
    );
    expect(onCreateStaged).toHaveBeenCalledTimes(1);
  });

  it("shows legacy sequential shots with per-shot prompts and generated media", () => {
    const onRegenerateShot = vi.fn();
    const onSaveShotEdits = vi.fn();
    render(
      <MarketplaceAutoReviewLegacyDetails
        productName="สินค้าทดสอบ"
        onCreateStaged={vi.fn()}
        onRegenerateShot={onRegenerateShot}
        onSaveShotEdits={onSaveShotEdits}
        run={{
          id: "mar-legacy-sequential",
          status: "completed",
          metadataJson: {
            sequentialStoryboard: {
              shots: Array.from({ length: 9 }, (_, index) => ({
                shot_id: index + 1,
                purpose: `purpose_${index + 1}`,
                visual_summary: `เรื่องย่อช็อต ${index + 1}`,
                dialogue: `บทพูด ${index + 1}`,
                start_frame_image_prompt: `ภาพ ${index + 1}`,
                video_prompt: `วิดีโอ ${index + 1}`,
                qc: { status: "passed" },
              })),
            },
            storyboardFrameUrls: Array.from(
              { length: 9 },
              (_, index) => `https://cdn.example.com/frame-${index + 1}.png`
            ),
            videoClipUrls: Array.from(
              { length: 9 },
              (_, index) => `https://cdn.example.com/video-${index + 1}.mp4`
            ),
          },
        }}
      />
    );

    expect(screen.getByText("ภาพ Prompt และวิดีโอแยกตามช็อต")).toBeTruthy();
    expect(screen.getAllByTestId(/sequential-shot-card-/)).toHaveLength(9);
    expect(screen.getAllByDisplayValue(/ภาพ [1-9]/)).toHaveLength(9);
    expect(screen.getAllByDisplayValue(/วิดีโอ [1-9]/)).toHaveLength(9);
    expect(screen.getByLabelText("วิดีโอช็อตที่ 1")).toHaveAttribute(
      "src",
      "https://cdn.example.com/video-1.mp4"
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "สร้างภาพนี้ใหม่" })[0]
    );
    expect(onRegenerateShot).toHaveBeenCalledWith(1);
  });
});
