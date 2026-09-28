/**
 * VideoStudioAssetPicker coverage (Feature 143 §4.7 client half). Same
 * hand-rolled `@/lib/trpc` mock convention as `ProductLibraryPanel.test.tsx`
 * — `useQuery` is a thin wrapper around a vi.fn() so each test controls the
 * exact response shape.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

// Astryx's Dialog renders a native <dialog> element and calls showModal()/
// close() on it. jsdom does not implement HTMLDialogElement's showModal/close
// (see @astryxdesign/core's own Dialog.test.tsx, and
// CatalogCreateDialog.test.tsx which mocks the same way) — without this, the
// dialog-mode tests below fail with "dialog.showModal is not a function".
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

const listPickerAssetsQueryMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      listPickerAssets: {
        useQuery: (...args: unknown[]) => listPickerAssetsQueryMock(...args),
      },
    },
  },
}));

import { VideoStudioAssetPicker, type VideoStudioPickerAsset } from "../VideoStudioAssetPicker";

const ASSET_1: VideoStudioPickerAsset = {
  assetId: 1,
  storageUrl: "/api/media/proxy/1",
  sha256: "hash1",
  kind: "image",
  thumbnailUrl: "/api/media/proxy/1/thumb",
};

const ASSET_2: VideoStudioPickerAsset = {
  assetId: 2,
  storageUrl: "/api/media/proxy/2",
  sha256: "hash2",
  kind: "video",
};

const ASSET_3: VideoStudioPickerAsset = {
  assetId: 3,
  storageUrl: "/api/media/proxy/3",
  sha256: "hash3",
  kind: "audio",
};

function mockResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: { items: [ASSET_1, ASSET_2, ASSET_3], nextOffset: null },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listPickerAssetsQueryMock.mockReturnValue(mockResult());
});

function renderPicker(overrides: Partial<Parameters<typeof VideoStudioAssetPicker>[0]> = {}) {
  const onPick = vi.fn();
  const utils = render(
    <VideoStudioAssetPicker lang="en" onPick={onPick} {...overrides} />,
  );
  return { onPick, ...utils };
}

describe("VideoStudioAssetPicker — rendering", () => {
  it("renders items returned by the query", () => {
    renderPicker();
    expect(screen.getAllByTestId("asset-picker-item")).toHaveLength(3);
  });

  it("renders a distinct audio tile with no thumbnail", () => {
    renderPicker();
    const items = screen.getAllByTestId("asset-picker-item");
    const audioTile = items.find((el) => el.getAttribute("data-asset-kind") === "audio");
    expect(audioTile).toBeTruthy();
    expect(audioTile?.querySelector("img")).toBeNull();
  });

  it("shows the loading skeleton (not a spinner) while the initial page loads", () => {
    listPickerAssetsQueryMock.mockReturnValue(
      mockResult({ data: undefined, isLoading: true, isFetching: true }),
    );
    renderPicker();
    expect(screen.queryByTestId("asset-picker-item")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are zero results", () => {
    listPickerAssetsQueryMock.mockReturnValue(mockResult({ data: { items: [], nextOffset: null } }));
    renderPicker();
    expect(screen.getByText("No files in your library yet")).toBeInTheDocument();
  });

  it("shows an error banner with a retry action", () => {
    const refetch = vi.fn();
    listPickerAssetsQueryMock.mockReturnValue(
      mockResult({ data: undefined, isError: true, error: { message: "network down" }, refetch }),
    );
    renderPicker();
    expect(screen.getByText("Failed to load files")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("VideoStudioAssetPicker — filter and search pass-through", () => {
  it("passes the kind filter through to the query", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    const lastCallInput = listPickerAssetsQueryMock.mock.calls.at(-1)?.[0];
    expect(lastCallInput).toMatchObject({ kind: "video" });
  });

  it("passes the debounced search term through to the query", async () => {
    vi.useFakeTimers();
    renderPicker();
    fireEvent.change(screen.getByTestId("asset-picker-search"), { target: { value: "logo" } });

    // Not yet debounced.
    expect(listPickerAssetsQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({ query: undefined });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(listPickerAssetsQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({ query: "logo" });
    vi.useRealTimers();
  });
});

describe("VideoStudioAssetPicker — paging", () => {
  it("shows a load-more button when nextOffset is present and appends on click", () => {
    listPickerAssetsQueryMock.mockReturnValue(
      mockResult({ data: { items: [ASSET_1], nextOffset: 24 } }),
    );
    renderPicker();
    expect(screen.getAllByTestId("asset-picker-item")).toHaveLength(1);

    const loadMore = screen.getByTestId("asset-picker-load-more");
    listPickerAssetsQueryMock.mockReturnValue(
      mockResult({ data: { items: [ASSET_2], nextOffset: null } }),
    );
    fireEvent.click(loadMore);

    expect(listPickerAssetsQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({ offset: 24 });
  });

  it("does not show a load-more button when nextOffset is null", () => {
    renderPicker();
    expect(screen.queryByTestId("asset-picker-load-more")).not.toBeInTheDocument();
  });
});

describe("VideoStudioAssetPicker — onPick", () => {
  it("passes the full asset object (including assetId and sha256) to onPick", () => {
    const { onPick } = renderPicker();
    const items = screen.getAllByTestId("asset-picker-item");
    fireEvent.click(items[0]);
    expect(onPick).toHaveBeenCalledWith(ASSET_1);
  });

  it("marks the picked item as selected", () => {
    renderPicker();
    const items = screen.getAllByTestId("asset-picker-item");
    fireEvent.click(items[0]);
    expect(items[0]).toHaveAttribute("aria-pressed", "true");
  });
});

describe("VideoStudioAssetPicker — dialog mode", () => {
  it("renders inside a Dialog shell and closes after a pick when open/onOpenChange are provided", () => {
    const onOpenChange = vi.fn();
    renderPicker({ open: true, onOpenChange });
    const items = screen.getAllByTestId("asset-picker-item");
    fireEvent.click(items[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not auto-close when closeOnPick is false", () => {
    const onOpenChange = vi.fn();
    renderPicker({ open: true, onOpenChange, closeOnPick: false });
    const items = screen.getAllByTestId("asset-picker-item");
    fireEvent.click(items[0]);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
