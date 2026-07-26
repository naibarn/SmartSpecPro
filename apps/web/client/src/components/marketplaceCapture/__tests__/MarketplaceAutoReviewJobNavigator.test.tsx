import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketplaceAutoReviewJobNavigator } from "../MarketplaceAutoReviewJobNavigator";

describe("MarketplaceAutoReviewJobNavigator", () => {
  it("lists every job and opens the selected run", () => {
    const onOpenRun = vi.fn();
    const runs = [
      {
        id: "mar-old",
        status: "completed",
        currentStage: "render",
        metadataJson: {},
        updatedAt: "2026-07-25T12:00:00.000Z",
      },
      {
        id: "mar-new",
        status: "running",
        currentStage: "concept_story",
        planningArchitecture: "staged_two_skill_v2",
        metadataJson: { planningArchitecture: "staged_two_skill_v2" },
        stages: [{ stageKey: "concept_story", status: "blocked_needs_user" }],
        updatedAt: "2026-07-26T12:00:00.000Z",
      },
    ];

    render(
      <MarketplaceAutoReviewJobNavigator
        runs={runs}
        selectedRunId="mar-new"
        productId="product_1"
        onOpenRun={onOpenRun}
        onCreateNew={vi.fn()}
      />
    );

    expect(screen.getByText("2 งาน")).toBeTruthy();
    expect(screen.getByText("Job Review #1")).toBeTruthy();
    expect(screen.getByText("Job Review #2")).toBeTruthy();
    expect(screen.getByText("ล่าสุด")).toBeTruthy();
    expect(screen.getByText("รอตรวจ/ยืนยัน")).toBeTruthy();
    expect(screen.getByText("Legacy")).toBeTruthy();
    expect(screen.getByRole("button", { current: "page" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    fireEvent.click(screen.getByText("Job Review #2"));
    expect(onOpenRun).toHaveBeenCalledWith("mar-old");
  });

  it("shows a query error instead of presenting an empty job history", () => {
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={[]}
        error="network unavailable"
        productId="product_1"
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "โหลดรายการ Job ไม่สำเร็จ: network unavailable"
    );
    expect(
      screen.queryByText("ยังไม่มี Job Review สำหรับสินค้านี้")
    ).toBeNull();
  });
});
