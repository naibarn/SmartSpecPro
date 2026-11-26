import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketplaceAutoReviewJobNavigator } from "../MarketplaceAutoReviewJobNavigator";

describe("MarketplaceAutoReviewJobNavigator", () => {
  it("shows the scheduled Facebook publish date and time on the job row", () => {
    const scheduledAt = new Date("2099-11-26T16:05");
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={[{
          id: "mar-scheduled",
          status: "completed",
          facebookPublishStatus: "scheduled",
          facebookScheduledAt: scheduledAt.toISOString(),
        }]}
        allProducts
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
      />
    );

    const schedule = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(scheduledAt);
    expect(screen.getByText(`Facebook: ตั้งเวลาแล้ว · ${schedule}`)).toBeInTheDocument();
  });

  it("opens each job in a new tab and starts full-history thumbnails immediately", () => {
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={[
          {
            id: "mar-late-job",
            status: "completed",
            productThumbnailUrl: "/api/storage/files/product-late.webp",
          },
        ]}
        allProducts
        largeProductThumbnails
        openRunsInNewTab
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
      />
    );

    const jobLink = screen.getByRole("link", { name: /Job Review/ });
    expect(jobLink).toHaveAttribute(
      "href",
      "/marketplace/auto-review/mar-late-job"
    );
    expect(jobLink).toHaveAttribute("target", "_blank");
    expect(jobLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByAltText("ภาพสินค้า: Job Review")
    ).toHaveAttribute("loading", "eager");
  });

  it("lists every job and marks the selected run", () => {
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
    expect(screen.getAllByText("Job Review")).toHaveLength(2);
    expect(screen.getByText("ล่าสุด")).toBeTruthy();
    expect(screen.getByText("รอตรวจ/ยืนยัน")).toBeTruthy();
    expect(screen.getByText("Legacy")).toBeTruthy();
    expect(
      screen.getByRole("link", { current: "page" })
    ).toHaveAttribute("href", "/marketplace/auto-review/mar-new");
    expect(
      screen.getByRole("link", { name: /mar-old/ })
    ).toHaveAttribute(
      "href",
      "/marketplace/auto-review/mar-old"
    );
    fireEvent.click(screen.getByRole("link", { name: /mar-old/ }));
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

  it("shows image prompt and image delivery progress beside the overall stage", () => {
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={[
          {
            id: "mar-images",
            status: "running",
            currentStage: "storyboard_review",
            stageIndex: 5,
            stageCount: 11,
            planningArchitecture: "staged_two_skill_v2",
            metadataJson: {
              planningArchitecture: "staged_two_skill_v2",
              stagedProgress: {
                totalShots: 9,
                imagePromptsReady: 9,
                imageArtifactsReady: 0,
                imageTasksInFlight: 0,
              },
            },
          },
        ]}
        selectedRunId="mar-images"
        productId="product_1"
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
      />
    );

    expect(screen.getByText("รอสร้างภาพ 0/9")).toBeTruthy();
    expect(screen.getByText("Prompt ภาพ 9/9 · ภาพ 0/9")).toBeTruthy();
    expect(screen.getByText("สร้างภาพรายช็อต")).toBeTruthy();
    expect(screen.getByText("ขั้นตอน 5/11")).toBeTruthy();
  });

  it("requests fresh run URLs once when a preview image fails", () => {
    const onMediaLoadError = vi.fn();
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={[
          {
            id: "mar-media-1",
            status: "completed",
            productThumbnailUrl: "/api/storage/files/product-1.png",
          },
          {
            id: "mar-media-2",
            status: "completed",
            productThumbnailUrl: "/api/storage/files/product-2.png",
          },
        ]}
        allProducts
        onMediaLoadError={onMediaLoadError}
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
      />
    );

    screen
      .getAllByAltText("ภาพสินค้า: Job Review")
      .forEach(image => fireEvent.error(image));

    expect(onMediaLoadError).toHaveBeenCalledTimes(1);
  });

  it("does not fetch video metadata until a preview is played", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe() {
          this.callback(
            [{ contentRect: { width: 500 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
        }
        disconnect() {}
      }
    );

    render(
      <MarketplaceAutoReviewJobNavigator
        runs={[
          {
            id: "mar-video",
            status: "completed",
            videoPreviewUrl: "/api/storage/files/preview.mp4",
          },
        ]}
        onOpenRun={vi.fn()}
        onCreateNew={vi.fn()}
      />
    );

    expect(
      screen.getByLabelText("ตัวอย่างวิดีโอที่รวมแล้ว: Job Review")
    ).toHaveAttribute("preload", "none");
    vi.unstubAllGlobals();
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

  it("keeps the delete action separate from the new-tab job link", () => {
    const onOpenRun = vi.fn();
    render(
      <MarketplaceAutoReviewJobNavigator
        runs={RUNS}
        productId="product_1"
        openRunsInNewTab
        onOpenRun={onOpenRun}
        onCreateNew={vi.fn()}
        onDeleteRun={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("job-delete-mar-a"));
    expect(onOpenRun).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /mar-a/ })).toHaveAttribute(
      "target",
      "_blank"
    );
    expect(screen.getByText("ลบงานนี้?")).toBeTruthy();
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
    fireEvent.click(screen.getByLabelText("ยกเลิกการลบ Job Review"));
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
