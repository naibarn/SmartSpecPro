/**
 * ProductLibraryPanel coverage (Feature 133, catalog projects' right-side
 * "คลังสินค้า" panel). Same hand-rolled `@/lib/trpc` mock convention as
 * `QaPanel.test.tsx`: `useMutation` returns `{ mutate: (input, callOpts) =>
 * mock(input, callOpts); simulate onSuccess/onSettled synchronously }` so
 * per-call callbacks (used here for the per-image pending guard) are
 * assertable in one `fireEvent`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const getProductQueryMock = vi.fn();
const listByProductQueryMock = vi.fn();
const listAutoReviewRunsQueryMock = vi.fn();
const updateBriefMutateMock = vi.fn();
const updateSourceRefsMutateMock = vi.fn();
const invalidateMock = vi.fn();

let updateBriefCallOpts: Record<string, unknown> | null = null;
let updateSourceRefsIsError = false;
let updateSourceRefsIsPending = false;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ videoProjects: { get: { invalidate: invalidateMock } } }),
    marketplaceCapture: {
      getProduct: { useQuery: (...args: unknown[]) => getProductQueryMock(...args) },
      listAutoReviewRuns: { useQuery: (...args: unknown[]) => listAutoReviewRunsQueryMock(...args) },
    },
    videoProjects: {
      listByProduct: { useQuery: (...args: unknown[]) => listByProductQueryMock(...args) },
      updateBrief: {
        useMutation: (hookOpts: Record<string, unknown>) => ({
          mutate: (input: unknown, callOpts: Record<string, unknown>) => {
            updateBriefCallOpts = callOpts;
            updateBriefMutateMock(input, hookOpts, callOpts);
          },
          isPending: false,
        }),
      },
      updateSourceRefs: {
        useMutation: (hookOpts: Record<string, unknown>) => ({
          mutate: (input: unknown) => {
            updateSourceRefsMutateMock(input, hookOpts);
          },
          isPending: updateSourceRefsIsPending,
          isError: updateSourceRefsIsError,
          error: updateSourceRefsIsError ? { message: "sourceRefs failed" } : undefined,
        }),
      },
    },
  },
}));

import { ProductLibraryPanel } from "../ProductLibraryPanel";

const PRODUCT = {
  productName: "Wireless Earbuds Pro",
  priceCurrent: "599",
  currency: "THB",
  descriptionText: "Long-lasting battery and noise cancellation for everyday use.",
};

const IMAGES = [
  { id: "img-1", url: "https://cdn.example.com/1.jpg" },
  { id: "img-2", url: "https://cdn.example.com/2.jpg" },
  { id: "img-3", url: "https://cdn.example.com/3.jpg" },
];

const BRIEF = {
  productId: "prod-1",
  productName: "Wireless Earbuds Pro",
  productDescription: "Snapshot description",
  productImageUrls: ["https://cdn.example.com/1.jpg"],
  productPrice: "599",
  productCurrency: "THB",
};

function renderPanel(overrides: Partial<Parameters<typeof ProductLibraryPanel>[0]> = {}) {
  return render(
    <ProductLibraryPanel
      lang="en"
      projectId={42}
      productId="prod-1"
      brief={BRIEF}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateBriefCallOpts = null;
  updateSourceRefsIsError = false;
  updateSourceRefsIsPending = false;

  getProductQueryMock.mockReturnValue({
    data: { product: PRODUCT, images: IMAGES },
    isLoading: false,
    isError: false,
    error: undefined,
  });
  listByProductQueryMock.mockReturnValue({ data: [], isLoading: false });
  listAutoReviewRunsQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe("ProductLibraryPanel — product details", () => {
  it("renders live product name, price, and description", () => {
    renderPanel();
    expect(screen.getByTestId("product-panel-name")).toHaveTextContent("Wireless Earbuds Pro");
    expect(screen.getByText(/599 THB/)).toBeInTheDocument();
    expect(screen.getByTestId("product-panel-description")).toHaveTextContent(
      "Long-lasting battery",
    );
  });

  it("falls back to the brief snapshot when the live query errors", () => {
    getProductQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "network down" },
    });
    renderPanel();
    expect(screen.getByTestId("product-panel-name")).toHaveTextContent("Wireless Earbuds Pro");
    expect(screen.getByText(/Snapshot description/)).toBeInTheDocument();
  });
});

describe("ProductLibraryPanel — image selection", () => {
  it("shows the used/total image count", () => {
    renderPanel();
    expect(screen.getByTestId("product-panel-image-count")).toHaveTextContent("1/3");
  });

  it("marks the selected image as pressed and others as not", () => {
    renderPanel();
    const toggles = screen.getAllByTestId("product-panel-image-toggle");
    expect(toggles[0]).toHaveAttribute("aria-pressed", "true");
    expect(toggles[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("toggling an unselected image persists the merged brief via updateBrief", () => {
    renderPanel();
    const toggles = screen.getAllByTestId("product-panel-image-toggle");
    fireEvent.click(toggles[1]);

    expect(updateBriefMutateMock).toHaveBeenCalledWith(
      {
        projectId: 42,
        brief: {
          ...BRIEF,
          productImageUrls: ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"],
        },
      },
      expect.anything(),
      expect.anything(),
    );
  });

  it("toggling an already-selected image removes it from the persisted list", () => {
    renderPanel();
    const toggles = screen.getAllByTestId("product-panel-image-toggle");
    fireEvent.click(toggles[0]);

    expect(updateBriefMutateMock).toHaveBeenCalledWith(
      { projectId: 42, brief: { ...BRIEF, productImageUrls: [] } },
      expect.anything(),
      expect.anything(),
    );
  });

  it("only disables the toggle for the image currently being persisted, not the whole grid", () => {
    renderPanel();
    const toggles = screen.getAllByTestId("product-panel-image-toggle");
    fireEvent.click(toggles[1]);
    // The clicked image's own onSettled has NOT fired yet (mutate is a mock
    // that doesn't auto-resolve), so it stays pending/disabled while its
    // siblings remain interactive.
    expect(toggles[1]).toBeDisabled();
    expect(toggles[0]).not.toBeDisabled();
    expect(toggles[2]).not.toBeDisabled();
  });
});

describe("ProductLibraryPanel — prior videos", () => {
  it("shows the empty state for prior projects and review runs", () => {
    renderPanel();
    expect(screen.getByText("No other Video Studio projects for this product yet")).toBeInTheDocument();
    expect(screen.getByText("No auto-review runs for this product yet")).toBeInTheDocument();
  });

  it("lists prior Video Studio projects excluding the current project, linking to /video-studio/:id", () => {
    listByProductQueryMock.mockReturnValue({
      data: [
        { id: 42, name: "Current project", studioType: "catalog", status: "draft", updatedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", resultLibraryItemId: null, resultThumbnailUrl: null, resultVideoUrl: null },
        { id: 7, name: "Older cut", studioType: "catalog", status: "rendered", updatedAt: "2026-01-02T00:00:00.000Z", createdAt: "2026-01-02T00:00:00.000Z", resultLibraryItemId: 1, resultThumbnailUrl: "https://cdn.example.com/thumb.jpg", resultVideoUrl: "https://cdn.example.com/video.mp4" },
      ],
      isLoading: false,
    });
    renderPanel();
    const rows = screen.getAllByTestId("product-panel-prior-project");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Older cut");
    expect(rows[0]).toHaveAttribute("href", "/video-studio/7");
  });

  it("lists prior auto-review runs with their status", () => {
    listAutoReviewRunsQueryMock.mockReturnValue({
      data: [
        { id: "run-1", status: "completed", createdAt: "2026-01-01T00:00:00.000Z", links: { libraryItem: "/library/9" } },
      ],
      isLoading: false,
      isError: false,
    });
    renderPanel();
    const runs = screen.getAllByTestId("product-panel-review-run");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveTextContent("completed");
  });
});

describe("ProductLibraryPanel — sourceRefs backfill (real-bug fix)", () => {
  it("backfills sourceRefs.productIds when the established product isn't present yet", () => {
    renderPanel({ sourceRefs: null });
    expect(updateSourceRefsMutateMock).toHaveBeenCalledWith(
      { projectId: 42, sourceRefs: { productIds: ["prod-1"] } },
      expect.anything(),
    );
  });

  it("does NOT backfill when sourceRefs already contains the established product", () => {
    renderPanel({ sourceRefs: { productIds: ["prod-1"] } });
    expect(updateSourceRefsMutateMock).not.toHaveBeenCalled();
  });

  it("preserves other productIds already present when backfilling", () => {
    renderPanel({ sourceRefs: { productIds: ["other-product"] } });
    expect(updateSourceRefsMutateMock).toHaveBeenCalledWith(
      { projectId: 42, sourceRefs: { productIds: ["other-product", "prod-1"] } },
      expect.anything(),
    );
  });

  it("shows an error banner (and keeps the updateBrief mutation independent) when updateSourceRefs fails", () => {
    updateSourceRefsIsError = true;
    renderPanel({ sourceRefs: null });
    expect(screen.getByTestId("product-panel-sourcerefs-error")).toBeInTheDocument();

    // updateBrief (image selection) is a totally separate mutation and still works.
    const toggles = screen.getAllByTestId("product-panel-image-toggle");
    fireEvent.click(toggles[1]);
    expect(updateBriefMutateMock).toHaveBeenCalled();
  });
});
