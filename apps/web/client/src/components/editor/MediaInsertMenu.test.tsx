/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOnInsert = vi.fn();
const mockOnOpenChange = vi.fn();
const mockMutateAsync = vi.fn();

const mockListResults = vi.fn(() => ({
  data: { results: [] },
  isLoading: false,
}));

const mockSearchResults = vi.fn(() => ({
  data: { results: [] },
  isLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      listDocuments: {
        useQuery: (...args: any[]) => mockListResults(...args),
      },
      search: {
        useQuery: (...args: any[]) => mockSearchResults(...args),
      },
      uploadFile: {
        useMutation: () => ({
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
    },
  },
}));

import MediaInsertMenu from "./MediaInsertMenu";

function renderMenu(
  overrides: Partial<{
    mediaType: "image" | "video" | "audio";
    open: boolean;
  }> = {},
) {
  return render(
    <MediaInsertMenu
      open={overrides.open ?? true}
      onOpenChange={mockOnOpenChange}
      mediaType={overrides.mediaType ?? "image"}
      onInsert={mockOnInsert}
    >
      <button>Trigger</button>
    </MediaInsertMenu>,
  );
}

describe("MediaInsertMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListResults.mockReturnValue({
      data: { results: [] },
      isLoading: false,
    });
    mockSearchResults.mockReturnValue({
      data: { results: [] },
      isLoading: false,
    });
  });

  it("renders Library and Upload tabs", () => {
    renderMenu();
    expect(screen.getByTestId("library-tab")).toBeDefined();
    expect(screen.getByTestId("upload-tab")).toBeDefined();
  });

  it("clicking an image item fires onInsert with correct attrs", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 1,
            title: "Test Image",
            source_url: "https://example.com/img.jpg",
            thumbnail_url: "https://example.com/thumb.jpg",
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "image" });

    const item = screen.getByTestId("library-item");
    fireEvent.click(item);

    expect(mockOnInsert).toHaveBeenCalledWith({
      type: "image",
      src: "https://example.com/img.jpg",
      alt: "Test Image",
      assetId: "1",
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking a video item fires onInsert with video attrs", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 2,
            title: "Test Video",
            source_url: "https://example.com/video.mp4",
            thumbnail_url: "https://example.com/thumb.jpg",
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "video" });

    const item = screen.getByTestId("library-item");
    fireEvent.click(item);

    expect(mockOnInsert).toHaveBeenCalledWith({
      type: "video",
      src: "https://example.com/video.mp4",
      poster: "https://example.com/thumb.jpg",
      caption: "Test Video",
      assetId: "2",
    });
  });

  it("clicking an audio item fires onInsert with audio attrs", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 3,
            title: "Test Audio",
            source_url: "https://example.com/audio.mp3",
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "audio" });

    const item = screen.getByTestId("library-item");
    fireEvent.click(item);

    expect(mockOnInsert).toHaveBeenCalledWith({
      type: "audio",
      src: "https://example.com/audio.mp3",
      assetId: "3",
    });
  });

  it("empty search results show 'no items' message", () => {
    renderMenu({ mediaType: "image" });
    expect(screen.getByTestId("empty-message")).toBeDefined();
    expect(screen.getByText("No images found.")).toBeDefined();
  });

  it("loading state shows spinner", () => {
    mockListResults.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderMenu();
    expect(screen.getByTestId("loading-spinner")).toBeDefined();
  });

  it("menu closes after item selection", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 1,
            title: "Test",
            source_url: "https://example.com/img.jpg",
          },
        ],
      },
      isLoading: false,
    });

    renderMenu();
    fireEvent.click(screen.getByTestId("library-item"));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("upload tab trigger is present", () => {
    renderMenu();
    const uploadTab = screen.getByTestId("upload-tab");
    expect(uploadTab).toBeDefined();
    expect(uploadTab.textContent).toContain("Upload");
  });
});
