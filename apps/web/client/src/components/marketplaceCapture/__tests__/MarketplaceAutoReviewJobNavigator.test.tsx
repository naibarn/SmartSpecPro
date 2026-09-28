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

/**
 * Delete affordance. A job delete is irreversible — the run row cascades to its
 * stages, attempts, provider events, outbox jobs and artifacts — so it is
 * gated behind a two-step inline confirm, this codebase's convention for
 * destructive row actions.
 */
describe("MarketplaceAutoReviewJobNavigator — delete", () => {
  const RUNS = [
    {
      id: "mar-a",
      status: "completed",
      currentStage: "render",
      metadataJson: {},
      updatedAt: "2026-07-26T12:00:00.000Z",
    },
  ];

  it("hides the delete affordance entirely when no handler is supplied", () => {
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={RUNS}
        productId="product_1"
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
      />
    );
    expect(screen.queryByTestId("job-delete-mar-a")).toBeNull();
  });

  it("requires a confirm before deleting — the first click never deletes", () => {
    const onDeleteRun = vi.fn();
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={RUNS}
        productId="product_1"
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
        onDeleteRun={onDeleteRun}
      />
    );

    fireEvent.click(screen.getByTestId("job-delete-mar-a"));
    expect(onDeleteRun).not.toHaveBeenCalled();
    expect(screen.getByText("ลบงานนี้?")).toBeTruthy();

    fireEvent.click(screen.getByTestId("job-delete-confirm-mar-a"));
    expect(onDeleteRun).toHaveBeenCalledWith("mar-a");
  });

  it("does NOT open the run when the delete button is clicked", () => {
    const onOpenRun = vi.fn();
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={RUNS}
        productId="product_1"
        onOpenRun={onOpenRun}
        onCreateNew={vi.fn()}
        onDeleteRun={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("job-delete-mar-a"));
    expect(onOpenRun).not.toHaveBeenCalled();
  });

  it("can be cancelled, leaving the job untouched", () => {
    const onDeleteRun = vi.fn();
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={RUNS}
        productId="product_1"
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
        onDeleteRun={onDeleteRun}
      />
    );
    fireEvent.click(screen.getByTestId("job-delete-mar-a"));
    fireEvent.click(screen.getByLabelText("ยกเลิกการลบ Job Review #1"));
    expect(screen.queryByText("ลบงานนี้?")).toBeNull();
    expect(onDeleteRun).not.toHaveBeenCalled();
  });
});

/**
 * Visibility guard. The delete button was first shipped `opacity-0` with
 * `group-hover` — invisible until hovered, which the user immediately reported
 * as "ไม่มีปุ่มลบ". Same failure mode as the look selector earlier the same day.
 * An affordance that only exists on hover does not exist.
 */
describe("MarketplaceAutoReviewJobNavigator — delete is discoverable", () => {
  it("renders the delete button visibly, not hidden behind hover", () => {
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={[
          {
            id: "mar-a",
            status: "completed",
            currentStage: "render",
            metadataJson: {},
            updatedAt: "2026-07-26T12:00:00.000Z",
          },
        ]}
        productId="product_1"
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
        onDeleteRun={vi.fn()}
      />
    );
    const button = screen.getByTestId("job-delete-mar-a");
    expect(button.className).not.toContain("opacity-0");
    expect(button.className).not.toContain("group-hover");
  });
});
