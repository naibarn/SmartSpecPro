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
    mediaType: "image" | "video" | "audio" | "file";
    open: boolean;
    withTrigger: boolean;
  }> = {},
) {
  return render(
    <MediaInsertMenu
      open={overrides.open ?? true}
      onOpenChange={mockOnOpenChange}
      mediaType={overrides.mediaType ?? "image"}
      onInsert={mockOnInsert}
    >
      {overrides.withTrigger === false ? undefined : <button>Trigger</button>}
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

  it("renders as a centered dialog when used without a trigger", () => {
    render(
      <MediaInsertMenu
        open
        onOpenChange={mockOnOpenChange}
        mediaType="image"
        onInsert={mockOnInsert}
      />,
    );

    expect(screen.getByTestId("media-insert-dialog")).toHaveClass("resize");
    expect(screen.getByTestId("media-insert-menu")).toBeDefined();
    expect(screen.getByTestId("media-results-scroll").className).toContain("overflow-y-auto");
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
      caption: "Test Audio",
      assetId: "3",
    });
  });

  it("clicking a file item fires onInsert with attachment attrs", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 4,
            title: "Project Brief",
            source_url: "https://example.com/brief.pdf",
            item_type: "document",
            metadata: { file_type: "application/pdf", file_size_bytes: 1024 },
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "file" });

    const item = screen.getByTestId("library-item");
    fireEvent.click(item);

    expect(mockOnInsert).toHaveBeenCalledWith({
      type: "attachment",
      src: "https://example.com/brief.pdf",
      title: "Project Brief",
      fileName: "Project Brief",
      mimeType: "application/pdf",
      assetId: "4",
      sizeBytes: 1024,
    });
  });

  it("shows markdown documents in file mode even when they have no source url", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 5,
            title: "README",
            source_url: null,
            item_type: "md",
            metadata: { extension: ".md" },
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "file" });

    expect(screen.getByText("README")).toBeDefined();
    expect(screen.getByText("Markdown document")).toBeDefined();
  });

  it("inserts a document link for markdown files without a source url", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 7,
            title: "Guide",
            source_url: null,
            item_type: "md",
            metadata: { extension: ".md" },
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "file" });

    fireEvent.click(screen.getByTestId("library-item"));

    expect(mockOnInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "attachment",
        src: expect.stringContaining("/document-management?mode=editor&doc=7"),
        mimeType: "text/markdown",
        assetId: "7",
      }),
    );
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

  it("falls back to a placeholder when an image thumbnail fails to load", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 11,
            title: "Broken Image",
            source_url: "https://example.com/broken.jpg",
            thumbnail_url: "https://example.com/broken-thumb.jpg",
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "image" });

    const image = screen.getByAltText("Broken Image");
    fireEvent.error(image);

    expect(screen.getByTestId("image-preview-fallback-11")).toBeDefined();
  });

  it("uses a video element when no thumbnail is available for a video item", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 12,
            title: "Preview Video",
            source_url: "https://example.com/video.mp4",
            thumbnail_url: null,
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "video" });

    expect(screen.getByTestId("video-preview-12")).toBeDefined();
  });

  it("upload tab trigger is present", () => {
    renderMenu();
    const uploadTab = screen.getByTestId("upload-tab");
    expect(uploadTab).toBeDefined();
    expect(uploadTab.textContent).toContain("Upload");
  });

  it("file mode shows files and excludes media items", () => {
    mockListResults.mockReturnValue({
      data: {
        results: [
          {
            id: 10,
            title: "Spec PDF",
            source_url: "https://example.com/spec.pdf",
            item_type: "document",
            metadata: { file_type: "application/pdf" },
          },
          {
            id: 11,
            title: "Hero Image",
            source_url: "https://example.com/hero.png",
            item_type: "image",
            metadata: { file_type: "image/png" },
          },
        ],
      },
      isLoading: false,
    });

    renderMenu({ mediaType: "file" });

    expect(screen.getByText("Spec PDF")).toBeDefined();
    expect(screen.queryByText("Hero Image")).toBeNull();
  });

  it("search input accepts user input for library queries", () => {
    renderMenu({ mediaType: "image" });

    const searchInput = screen.getByTestId("media-search-input") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "cat" } });

    expect(searchInput.value).toBe("cat");

    // Verify both list and search hooks are called (component renders both, `enabled` controls execution)
    expect(mockListResults).toHaveBeenCalled();
    expect(mockSearchResults).toHaveBeenCalled();

    // The search input shape should include the right filters
    const listCall = mockListResults.mock.calls[0];
    expect(listCall[0]).toMatchObject({
      filters: { itemType: "image" },
      scope: "all",
      limit: 50,
    });
  });

  it("search query resets when menu closes and reopens", () => {
    const { rerender } = render(
      <MediaInsertMenu
        open={true}
        onOpenChange={mockOnOpenChange}
        mediaType="image"
        onInsert={mockOnInsert}
      >
        <button>Trigger</button>
      </MediaInsertMenu>,
    );

    // Type a query
    const searchInput = screen.getByTestId("media-search-input");
    fireEvent.change(searchInput, { target: { value: "test query" } });
    expect((searchInput as HTMLInputElement).value).toBe("test query");

    // Close menu
    rerender(
      <MediaInsertMenu
        open={false}
        onOpenChange={mockOnOpenChange}
        mediaType="image"
        onInsert={mockOnInsert}
      >
        <button>Trigger</button>
      </MediaInsertMenu>,
    );

    // Reopen menu
    rerender(
      <MediaInsertMenu
        open={true}
        onOpenChange={mockOnOpenChange}
        mediaType="image"
        onInsert={mockOnInsert}
      >
        <button>Trigger</button>
      </MediaInsertMenu>,
    );

    // Search input should be reset
    const resetInput = screen.getByTestId("media-search-input");
    expect((resetInput as HTMLInputElement).value).toBe("");
  });
});
