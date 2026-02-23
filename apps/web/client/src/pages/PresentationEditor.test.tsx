import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const setLocationMock = vi.fn();
const routeParamsMock = { docId: "42" };

const mutationMocks = {
  updateItem: vi.fn(),
  updateDeck: vi.fn(),
  saveAsTemplate: vi.fn(),
  restoreVersion: vi.fn(),
  addSlide: vi.fn(),
  duplicateSlide: vi.fn(),
  deleteSlide: vi.fn(),
  reorderSlides: vi.fn(),
  updateSlide: vi.fn(),
  createDeck: vi.fn(),
  triggerExport: vi.fn(),
};

function buildDeckByItem() {
  return {
    deck: {
      id: 7,
      libraryItemId: 42,
      version: 5,
      title: "Product Pitch",
      slideCount: 2,
      totalAssetBytes: 0,
      updatedAt: new Date(),
    },
    slides: [
      {
        id: 71,
        deckId: 7,
        orderIndex: 0,
        version: 3,
        title: "Intro",
        slideContent: {
          elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
        },
        notes: null,
      },
      {
        id: 72,
        deckId: 7,
        orderIndex: 1,
        version: 1,
        title: "Agenda",
        slideContent: { elements: [] },
        notes: null,
      },
    ],
    assets: [],
  };
}

function buildLibraryMediaList() {
  return {
    total: 2,
    limit: 50,
    offset: 0,
    has_more: false,
    scope: "all",
    results: [
      {
        id: 401,
        item_type: "image",
        source: "media_task",
        title: "Hero Image",
        description: null,
        status: "ready",
        visibility: "private",
        source_url: "https://cdn.example.com/hero.png",
        thumbnail_url: "https://cdn.example.com/hero-thumb.png",
        owner_user_id: 1,
        metadata: {},
        access_source: "owner",
        permission_level: "owner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 402,
        item_type: "video",
        source: "media_task",
        title: "Teaser Clip",
        description: null,
        status: "ready",
        visibility: "private",
        source_url: "https://cdn.example.com/teaser.mp4",
        thumbnail_url: "https://cdn.example.com/teaser-thumb.png",
        owner_user_id: 1,
        metadata: {},
        access_source: "owner",
        permission_level: "owner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };
}

function buildPresentationVersions() {
  return [
    {
      id: 501,
      versionNumber: 12,
      contentType: "presentation_slide_snapshot_v1",
      changeDescription: "Manual save: Intro",
      createdAt: new Date().toISOString(),
      createdByUserId: 1,
      snapshot: {
        schemaVersion: "presentation_slide_snapshot_v1",
        deckId: 7,
        libraryItemId: 42,
        slideId: 71,
        slideVersion: 3,
        slideTitle: "Intro",
        slideContent: {
          elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
        },
        notes: null,
        saveMode: "manual",
        savedAt: new Date().toISOString(),
        savedByUserId: 1,
      },
    },
  ] as any[];
}

const queryState = {
  libraryItem: {
    id: 42,
    item_type: "presentation",
    itemType: "presentation",
    title: "Product Pitch",
  },
  libraryMediaList: buildLibraryMediaList(),
  itemLoading: false,
  guardLoading: false,
  guard: {
    allowed: true,
    itemId: 42,
    editorRoute: "/presentation-editor/42",
  },
  deckByItem: buildDeckByItem(),
  deckError: null as Error | null,
  presentationVersions: buildPresentationVersions(),
};

vi.mock("wouter", () => ({
  useLocation: () => ["/presentation-editor/42", setLocationMock],
  useRoute: () => [true, routeParamsMock],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      library: {
        getItem: { invalidate: vi.fn().mockResolvedValue(undefined) },
        listDocuments: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
      presentation: {
        listVersions: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
    }),
    library: {
      getItem: {
        useQuery: vi.fn(() => ({
          data: queryState.libraryItem,
          isLoading: queryState.itemLoading,
          error: null,
        })),
      },
      listDocuments: {
        useQuery: vi.fn((input?: any) => {
          const itemType = input?.filters?.itemType;
          const filteredResults = queryState.libraryMediaList.results.filter((item: any) =>
            itemType ? item.item_type === itemType : true,
          );
          return {
            data: {
              ...queryState.libraryMediaList,
              total: filteredResults.length,
              results: filteredResults,
            },
            isLoading: false,
            error: null,
          };
        }),
      },
      updateItem: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.updateItem,
          isPending: false,
        })),
      },
    },
    presentation: {
      getSlideshow: {
        useQuery: vi.fn(() => ({
          data: {
            schemaVersion: "presentation_slideshow_v1",
            deckId: 7,
            generatedAt: new Date(),
            slides: [
              { slideId: 71, orderIndex: 0, title: "Intro", durationMs: 3000, transition: "cut" },
              { slideId: 72, orderIndex: 1, title: "Agenda", durationMs: 3000, transition: "fade" },
            ],
          },
          isLoading: false,
          error: null,
        })),
      },
      getExportStatus: {
        useQuery: vi.fn(() => ({
          data: null,
          isLoading: false,
          error: null,
        })),
      },
      listVersions: {
        useQuery: vi.fn(() => ({
          data: queryState.presentationVersions,
          isLoading: false,
          error: null,
        })),
      },
      guardEditorOpen: {
        useQuery: vi.fn(() => ({
          data: queryState.guard,
          isLoading: queryState.guardLoading,
          error: null,
        })),
      },
      getDeckByLibraryItem: {
        useQuery: vi.fn(() => ({
          data: queryState.deckByItem,
          isLoading: false,
          error: queryState.deckError,
          refetch: vi.fn(),
        })),
      },
      addSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.addSlide,
          isPending: false,
        })),
      },
      duplicateSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.duplicateSlide,
          isPending: false,
        })),
      },
      deleteSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.deleteSlide,
          isPending: false,
        })),
      },
      reorderSlides: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.reorderSlides,
          isPending: false,
        })),
      },
      updateSlide: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.updateSlide,
          isPending: false,
        })),
      },
      createDeck: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.createDeck,
          isPending: false,
        })),
      },
      updateDeck: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.updateDeck,
          isPending: false,
        })),
      },
      saveAsTemplate: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.saveAsTemplate,
          isPending: false,
        })),
      },
      restoreVersion: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.restoreVersion,
          isPending: false,
        })),
      },
      triggerExport: {
        useMutation: vi.fn(() => ({
          mutateAsync: mutationMocks.triggerExport,
          isPending: false,
        })),
      },
    },
  },
}));

import PresentationEditor from "./PresentationEditor";

describe("PresentationEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1200 });
    mutationMocks.addSlide.mockResolvedValue({});
    mutationMocks.updateItem.mockResolvedValue({});
    mutationMocks.updateDeck.mockResolvedValue({});
    mutationMocks.saveAsTemplate.mockResolvedValue({ item: { id: 500, title: "Product Pitch Template" } });
    mutationMocks.restoreVersion.mockResolvedValue({
      restoredSlideId: 71,
      restoredSlideVersion: 4,
      deckVersion: 9,
    });
    mutationMocks.duplicateSlide.mockResolvedValue({});
    mutationMocks.deleteSlide.mockResolvedValue({});
    mutationMocks.reorderSlides.mockResolvedValue({});
    mutationMocks.updateSlide.mockResolvedValue({});
    mutationMocks.createDeck.mockResolvedValue({});
    mutationMocks.triggerExport.mockResolvedValue({
      exportId: 1,
      status: "queued",
      deduped: false,
      message: "Queued",
    });
    queryState.guard = {
      allowed: true,
      itemId: 42,
      editorRoute: "/presentation-editor/42",
    };
    queryState.itemLoading = false;
    queryState.guardLoading = false;
    queryState.libraryMediaList = buildLibraryMediaList();
    queryState.deckByItem = buildDeckByItem();
    queryState.deckError = null;
    queryState.presentationVersions = buildPresentationVersions();
  });

  it("renders labeled controls for slide and canvas editing", () => {
    render(<PresentationEditor />);

    expect(screen.getByRole("button", { name: /add slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /duplicate slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move slide up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move slide down/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add text element/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save slide/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play slideshow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export png/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export mp4/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable snap lock/i })).toBeInTheDocument();
    expect(screen.getByTestId("slide-preview-1")).toBeInTheDocument();
    expect(screen.getByTestId("slide-preview-2")).toBeInTheDocument();
    expect(screen.getByText(/save: ready/i)).toBeInTheDocument();
    expect(screen.getByText(/snap: locked/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas Aspect Ratio (Properties)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fit canvas to view/i })).toBeInTheDocument();
  });

  it("keeps hook order stable when editor transitions from loading to ready", async () => {
    queryState.itemLoading = true;
    const { rerender } = render(<PresentationEditor />);
    expect(screen.getByText(/loading presentation editor/i)).toBeInTheDocument();

    queryState.itemLoading = false;
    queryState.guardLoading = false;
    rerender(<PresentationEditor />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save slide/i })).toBeInTheDocument();
    });
  });

  it("inserts image from library panel into canvas content", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open photos library/i }));
    fireEvent.click(screen.getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Image URL")).toHaveValue("https://cdn.example.com/hero.png");
      expect(screen.getByLabelText("Image Alt Text")).toHaveValue("Hero Image");
      expect(screen.getByLabelText("Image URL")).toHaveAttribute("readonly");
      expect(screen.getByLabelText("Image Alt Text")).toHaveAttribute("readonly");
    });
  });

  it("inserts video from library panel into canvas content", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));
    fireEvent.click(screen.getByRole("button", { name: /^insert$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Video URL")).toHaveValue("https://cdn.example.com/teaser.mp4");
      expect(screen.getByLabelText("Video Title")).toHaveValue("Teaser Clip");
    });
  });

  it("renders fallback video thumbnail in library when thumbnail_url is missing", async () => {
    queryState.libraryMediaList = {
      ...queryState.libraryMediaList,
      results: queryState.libraryMediaList.results.map((item: any) =>
        item.item_type === "video"
          ? { ...item, thumbnail_url: null }
          : item),
    };

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /open videos library/i }));

    await waitFor(() => {
      expect(screen.getByTestId("asset-video-thumb-402")).toBeInTheDocument();
    });
  });

  it("renders video slide previews using poster or video frame", () => {
    queryState.deckByItem = {
      ...buildDeckByItem(),
      slides: [
        {
          id: 71,
          deckId: 7,
          orderIndex: 0,
          version: 3,
          title: "Video Intro",
          slideContent: {
            elements: [{
              id: "v-1",
              type: "video",
              x: 20,
              y: 20,
              width: 360,
              height: 220,
              src: "https://cdn.example.com/slide-video.mp4",
              poster: "https://cdn.example.com/slide-video-poster.png",
              title: "Clip",
              muted: true,
            }],
          },
          notes: null,
        },
      ],
    } as any;

    render(<PresentationEditor />);
    expect(screen.getByTestId("slide-preview-media-video-poster-1")).toBeInTheDocument();
  });

  it("opens playable slideshow overlay and supports closing", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    await waitFor(() => {
      expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /close slideshow preview/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("slideshow-preview-overlay")).not.toBeInTheDocument();
    });
  });

  it("shows fullscreen toggle control in slideshow overlay", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /play slideshow/i }));
    await waitFor(() => {
      expect(screen.getByTestId("slideshow-preview-overlay")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /enter fullscreen/i })).toBeInTheDocument();
  });

  it("renders presentation saved version history list", () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /inspector tab version history/i }));
    expect(screen.getByText(/saved versions/i)).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-group-slide-71")).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-item-501")).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore selected version 12/i })).toBeInTheDocument();
  });

  it("groups versions by slide and shows preview diff for selected version", async () => {
    queryState.presentationVersions = [
      {
        id: 501,
        versionNumber: 12,
        contentType: "presentation_slide_snapshot_v1",
        changeDescription: "Manual save: Intro",
        createdAt: new Date().toISOString(),
        createdByUserId: 1,
        snapshot: {
          schemaVersion: "presentation_slide_snapshot_v1",
          deckId: 7,
          libraryItemId: 42,
          slideId: 71,
          slideVersion: 3,
          slideTitle: "Intro",
          slideContent: {
            elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
          },
          notes: null,
          saveMode: "manual",
          savedAt: new Date().toISOString(),
          savedByUserId: 1,
        },
      },
      {
        id: 502,
        versionNumber: 11,
        contentType: "presentation_slide_snapshot_v1",
        changeDescription: "Manual save: Agenda",
        createdAt: new Date(Date.now() - 60000).toISOString(),
        createdByUserId: 1,
        snapshot: {
          schemaVersion: "presentation_slide_snapshot_v1",
          deckId: 7,
          libraryItemId: 42,
          slideId: 72,
          slideVersion: 1,
          slideTitle: "Agenda",
          slideContent: {
            elements: [{ id: "t-2", type: "text", x: 20, y: 20, width: 240, height: 70, text: "Agenda v1", color: "#111827" }],
          },
          notes: null,
          saveMode: "manual",
          savedAt: new Date(Date.now() - 60000).toISOString(),
          savedByUserId: 1,
        },
      },
    ] as any[];

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /inspector tab version history/i }));

    expect(screen.getByTestId("presentation-version-group-slide-71")).toBeInTheDocument();
    expect(screen.getByTestId("presentation-version-group-slide-72")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("presentation-version-item-502"));
    await waitFor(() => {
      expect(screen.getByTestId("presentation-version-preview")).toBeInTheDocument();
      expect(screen.getByTestId("presentation-version-diff-summary")).toBeInTheDocument();
    });
  });

  it("restores a selected presentation version from history after confirmation", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /inspector tab version history/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore selected version 12/i }));
    expect(mutationMocks.restoreVersion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm restore/i }));
    await waitFor(() => {
      expect(mutationMocks.restoreVersion).toHaveBeenCalledWith({ deckId: 7, versionId: 501 });
    });
  });

  it("exposes standard text styling controls and shape fill/border controls", async () => {
    render(<PresentationEditor />);

    expect(screen.getByRole("button", { name: /apply heading text preset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply subheading text preset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply body text preset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply citation text preset/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Text Font Size")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Font Family")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Font Weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Font Style")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Decoration")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Align")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Line Height")).toBeInTheDocument();
    expect(screen.getByLabelText("Text Letter Spacing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add rectangle element/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Rectangle Fill")).toBeInTheDocument();
      expect(screen.getByLabelText("Rectangle Border")).toBeInTheDocument();
      expect(screen.getByLabelText("Rectangle Border Width")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /add line element/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Line Fill")).toBeInTheDocument();
      expect(screen.getByLabelText("Line Stroke")).toBeInTheDocument();
      expect(screen.getByLabelText("Line Stroke Width")).toBeInTheDocument();
    });
  });

  it("applies text preset styles with one click", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /apply heading text preset/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Text Font Size")).toHaveValue(64);
      expect(screen.getByLabelText("Text Font Weight")).toHaveValue("700");
      expect(screen.getByLabelText("Text Font Style")).toHaveValue("normal");
      expect(screen.getByLabelText("Text Line Height")).toHaveValue(1.1);
    });

    fireEvent.click(screen.getByRole("button", { name: /apply citation text preset/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Text Font Size")).toHaveValue(26);
      expect(screen.getByLabelText("Text Font Weight")).toHaveValue("500");
      expect(screen.getByLabelText("Text Font Style")).toHaveValue("italic");
      expect(screen.getByLabelText("Text Align")).toHaveValue("right");
    });
  });

  it("wires slide CRUD and reorder controls to typed API bindings", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /add slide/i }));
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /duplicate slide/i }));
    await waitFor(() => {
      expect(mutationMocks.duplicateSlide).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /move slide down/i }));
    await waitFor(() => {
      expect(mutationMocks.reorderSlides).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /delete slide/i }));

    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
      expect(mutationMocks.duplicateSlide).toHaveBeenCalledTimes(1);
      expect(mutationMocks.reorderSlides).toHaveBeenCalledTimes(1);
      expect(mutationMocks.deleteSlide).toHaveBeenCalled();
    });
  });

  it("supports adding slides repeatedly with incremented deck expectedVersion", async () => {
    render(<PresentationEditor />);

    const addSlideButton = screen.getByRole("button", { name: /add slide/i });
    fireEvent.click(addSlideButton);
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(addSlideButton);
    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalledTimes(2);
    });

    expect(mutationMocks.addSlide).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedVersion: 5,
    }));
    expect(mutationMocks.addSlide).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedVersion: 6,
    }));
  });

  it("shows deterministic wrong-editor recovery CTA when guard blocks", () => {
    queryState.guard = {
      allowed: false,
      itemId: 42,
      itemType: "document",
      errorCode: "PRESENTATION_ITEM_TYPE_MISMATCH",
      message: "Presentation editor only supports itemType=\"presentation\".",
      recoveryCta: {
        label: "Open in Document Management",
        href: "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=42",
      },
    };

    render(<PresentationEditor />);

    expect(screen.getByText(/wrong editor route/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open in document management/i }),
    ).toBeInTheDocument();
  });

  it("shows deterministic blocked-edit guidance for unsupported legacy payloads", async () => {
    queryState.deckByItem = null as any;
    queryState.deckError = new Error(
      "PRESENTATION_VALIDATION_FAILED: unsupported legacy payload for editable v2 content [PRESENTATION_LEGACY_PAYLOAD_BLOCKED]",
    );

    render(<PresentationEditor />);

    await waitFor(() => {
      expect(screen.getByText(/open read-only and convert this deck before editing/i)).toBeInTheDocument();
    });
  });

  it("surfaces actionable export failure messaging", async () => {
    mutationMocks.triggerExport.mockRejectedValueOnce(new Error("PRESENTATION_EXPORT_THROTTLED: retry later"));

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /export mp4/i }));

    await waitFor(() => {
      expect(screen.getByText(/retry later/i)).toBeInTheDocument();
    });
  });

  it("renders deterministic export warning codes from export responses", async () => {
    mutationMocks.triggerExport.mockResolvedValueOnce({
      exportId: 2,
      status: "queued",
      deduped: false,
      message: "Queued with degradation warnings",
      warnings: [{ code: "SLIDE_TRANSITION_UNSUPPORTED", slideId: 71 }],
    });

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /export png/i }));

    await waitFor(() => {
      expect(screen.getByTestId("presentation-export-warnings")).toHaveTextContent(
        /SLIDE_TRANSITION_UNSUPPORTED \(slide 71\)/i,
      );
      expect(screen.getByTestId("presentation-export-warnings")).toHaveAttribute("role", "status");
      expect(screen.getByTestId("presentation-export-warnings")).toHaveAttribute("aria-live", "polite");
    });
  });

  it("navigates back to Presentation Library from editor header", () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /back to presentation library/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/presentations");
  });

  it("shows project title and supports renaming from header", async () => {
    render(<PresentationEditor />);

    expect(screen.getByRole("heading", { name: /product pitch/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit project name/i }));
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Pitch V2" } });
    fireEvent.click(screen.getByRole("button", { name: /save project name/i }));

    await waitFor(() => {
      expect(mutationMocks.updateItem).toHaveBeenCalledWith({ id: 42, title: "Pitch V2" });
      expect(mutationMocks.updateDeck).toHaveBeenCalled();
    });
  });

  it("supports saving current presentation as template", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /save to template/i }));

    await waitFor(() => {
      expect(mutationMocks.saveAsTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLibraryItemId: 42 }),
      );
      expect(setLocationMock).toHaveBeenCalledWith("/presentations");
    });
  });

  it("auto-initializes deck when deck is missing", async () => {
    queryState.deckByItem = null as any;
    queryState.deckError = new Error("PRESENTATION_NOT_FOUND: no presentation deck exists for library item 42");

    render(<PresentationEditor />);

    await waitFor(() => {
      expect(mutationMocks.createDeck).toHaveBeenCalledWith({
        libraryItemId: 42,
        title: "Product Pitch",
      });
    });
  });

  it("renders canvas shell stage layers from serialized slide content", () => {
    render(<PresentationEditor />);

    expect(screen.getByTestId("canvas-shell")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-background")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-content")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-selection-guides")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-interaction-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-stage-layer-content")).toHaveTextContent(/hello/i);
  });

  it("cleans up canvas stage listeners on unmount/remount", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<PresentationEditor />);
    unmount();
    render(<PresentationEditor />);

    expect(addEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("supports keyboard movement plus undo/redo for selected elements", async () => {
    render(<PresentationEditor />);

    expect(screen.getByTestId("canvas-transform-handles")).toBeInTheDocument();
    expect(screen.getByLabelText("Element X")).toHaveValue(10);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByLabelText("Element X")).toHaveValue(11);
    });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText("Element X")).toHaveValue(10);
    });

    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText("Element X")).toHaveValue(11);
    });
  });

  it("supports pointer drag to move selected elements on canvas", async () => {
    render(<PresentationEditor />);
    const canvasElement = screen.getByRole("button", { name: /select canvas element 1/i });

    expect(screen.getByLabelText("Element X")).toHaveValue(10);
    expect(screen.getByLabelText("Element Y")).toHaveValue(10);

    fireEvent.pointerDown(canvasElement, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      clientX: 135,
      clientY: 145,
    });
    fireEvent.pointerUp(window, {
      pointerId: 1,
      clientX: 135,
      clientY: 145,
    });

    await waitFor(() => {
      const xInput = screen.getByLabelText("Element X") as HTMLInputElement;
      const yInput = screen.getByLabelText("Element Y") as HTMLInputElement;
      expect(Number(xInput.value)).toBeGreaterThan(10);
      expect(Number(yInput.value)).toBeGreaterThan(10);
    });
  });

  it("supports pointer resize via canvas corner handle", async () => {
    render(<PresentationEditor />);
    const resizeHandle = screen.getByLabelText("Resize Selected Element");

    expect(screen.getByLabelText("Element Width")).toHaveValue(200);
    expect(screen.getByLabelText("Element Height")).toHaveValue(60);

    fireEvent.pointerDown(resizeHandle, {
      pointerId: 2,
      button: 0,
      clientX: 300,
      clientY: 220,
    });
    fireEvent.pointerMove(window, {
      pointerId: 2,
      clientX: 340,
      clientY: 250,
    });
    fireEvent.pointerUp(window, {
      pointerId: 2,
      clientX: 340,
      clientY: 250,
    });

    await waitFor(() => {
      const widthInput = screen.getByLabelText("Element Width") as HTMLInputElement;
      const heightInput = screen.getByLabelText("Element Height") as HTMLInputElement;
      expect(Number(widthInput.value)).toBeGreaterThan(200);
      expect(Number(heightInput.value)).toBeGreaterThan(60);
    });
  });

  it("updates canvas zoom from toolbar controls", async () => {
    render(<PresentationEditor />);

    expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");

    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x (0, 0)");
    });

    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });
  });

  it("updates canvas zoom from mouse wheel scrolling on workspace", async () => {
    render(<PresentationEditor />);

    const workspace = screen.getByLabelText("Canvas workspace");
    fireEvent.wheel(workspace, { deltaY: -100, clientX: 300, clientY: 260 });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });
  });

  it("allows panning after zooming in on desktop canvas", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));

    const panSurface = screen.getByTestId("canvas-stage-pan-surface");
    fireEvent.pointerDown(panSurface, {
      pointerId: 55,
      button: 0,
      clientX: 320,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 55,
      clientX: 210,
      clientY: 180,
    });
    fireEvent.pointerUp(window, {
      pointerId: 55,
      clientX: 210,
      clientY: 180,
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).not.toHaveTextContent("(0, 0)");
    });
  });

  it("allows middle-mouse panning even when pointer starts on a canvas element", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));

    const canvasElement = screen.getByRole("button", { name: /select canvas element 1/i });
    fireEvent.pointerDown(canvasElement, {
      pointerId: 57,
      button: 1,
      clientX: 320,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 57,
      clientX: 210,
      clientY: 180,
    });
    fireEvent.pointerUp(window, {
      pointerId: 57,
      clientX: 210,
      clientY: 180,
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).not.toHaveTextContent("(0, 0)");
    });
  });

  it("fits viewport back to defaults after zoom/pan", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));

    const panSurface = screen.getByTestId("canvas-stage-pan-surface");
    fireEvent.pointerDown(panSurface, {
      pointerId: 56,
      button: 0,
      clientX: 300,
      clientY: 240,
    });
    fireEvent.pointerMove(window, {
      pointerId: 56,
      clientX: 220,
      clientY: 180,
    });
    fireEvent.pointerUp(window, {
      pointerId: 56,
      clientX: 220,
      clientY: 180,
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });

    fireEvent.click(screen.getByRole("button", { name: /fit canvas to view/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });
  });

  it("supports desktop keyboard shortcuts for zoom in/out and reset", async () => {
    render(<PresentationEditor />);
    expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });

    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.10x");
    });

    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.00x (0, 0)");
    });
  });

  it("supports changing canvas preset ratio from toolbar", async () => {
    render(<PresentationEditor />);
    expect(screen.getByTestId("canvas-stage-size")).toHaveTextContent("canvas: 1280x720 (16:9)");

    fireEvent.change(screen.getByLabelText("Canvas Aspect Ratio"), {
      target: { value: "9:16" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-size")).toHaveTextContent("canvas: 720x1280 (9:16)");
    });
  });

  it("supports rotating selected element from canvas rotate handle", async () => {
    render(<PresentationEditor />);
    const rotateHandle = screen.getByLabelText("Rotate Selected Element");
    expect(screen.getByLabelText("Element Rotation")).toHaveValue(0);

    fireEvent.pointerDown(rotateHandle, {
      pointerId: 77,
      button: 0,
      clientX: 320,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 77,
      clientX: 380,
      clientY: 100,
    });
    fireEvent.pointerUp(window, {
      pointerId: 77,
      clientX: 380,
      clientY: 100,
    });

    await waitFor(() => {
      const rotation = Number((screen.getByLabelText("Element Rotation") as HTMLInputElement).value);
      expect(rotation).toBeGreaterThan(0);
    });
  });

  it("renders mobile pan-safe mode with explicit toggle and viewport gesture updates", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    expect(screen.getByTestId("mobile-quick-actions")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-transform-suppressed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /switch to edit mode/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-transform-handles")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /simulate pinch \+ pan/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-stage-viewport")).toHaveTextContent("viewport: 1.20x (12, 8)");
    });
  });

  it("shows version history in mobile bottom sheet versions tab", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("tab", { name: "Versions" }));

    await waitFor(() => {
      expect(screen.getByText(/saved versions/i)).toBeInTheDocument();
      expect(screen.getByTestId("presentation-version-group-slide-71")).toBeInTheDocument();
      expect(screen.getByTestId("presentation-version-preview")).toBeInTheDocument();
    });
  });

  it("prevents accidental mobile advanced transforms below touch-target threshold", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /switch to edit mode/i }));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-transform-handles")).toBeInTheDocument();
      expect(screen.getByLabelText("Element Width")).toHaveValue(200);
    });

    fireEvent.click(screen.getByRole("button", { name: /wider/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Element Width")).toHaveValue(200);
    });
  });

  it("debounces rapid edits into a single autosave mutation", async () => {
    vi.useFakeTimers();
    let version = 3;
    mutationMocks.updateSlide.mockImplementation(async () => ({ version: ++version }));

    render(<PresentationEditor />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(mutationMocks.updateSlide).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);
    expect(mutationMocks.updateSlide).toHaveBeenCalledWith(expect.objectContaining({
      saveMode: "autosave",
    }));
  });

  it("applies cooldown after autosave conflict and suppresses immediate retry", async () => {
    vi.useFakeTimers();
    const conflict = new Error("PRESENTATION_VERSION_CONFLICT: stale");
    mutationMocks.updateSlide
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue({ version: 5 });

    render(<PresentationEditor />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(2);
  });

  it("treats manual conflict as saved when latest slide already matches draft content", async () => {
    const conflict = new Error("PRESENTATION_VERSION_CONFLICT: stale-manual");
    (conflict as any).cause = {
      conflictSchemaVersion: "presentation_conflict_v1",
      reasonCode: "SLIDE_VERSION_MISMATCH",
      expectedVersion: 3,
      latestDeckVersion: 6,
      latestSlideVersion: 4,
      deckId: 7,
      slideId: 71,
      saveMode: "manual",
      latestDeck: {
        id: 7,
        version: 6,
        slideCount: 2,
        totalAssetBytes: 0,
        updatedAt: new Date(),
      },
      latestSlide: {
        id: 71,
        deckId: 7,
        orderIndex: 0,
        version: 4,
        title: "Intro",
        slideContent: {
          elements: [{ id: "t-1", type: "text", x: 10, y: 10, width: 200, height: 60, text: "Hello", color: "#111827" }],
        },
        notes: null,
        updatedAt: new Date(),
      },
    };
    mutationMocks.updateSlide.mockRejectedValueOnce(conflict);

    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /save slide/i }));
    await waitFor(() => {
      expect(screen.getByText(/save: saved/i)).toBeInTheDocument();
    });

    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /reload latest slide/i })).not.toBeInTheDocument();
  });

  it("blocks autosave and manual save when stale guard is active until reload", async () => {
    vi.useFakeTimers();
    mutationMocks.updateSlide
      .mockRejectedValueOnce(new Error("PRESENTATION_VERSION_CONFLICT: stale-1"))
      .mockRejectedValueOnce(new Error("PRESENTATION_VERSION_CONFLICT: stale-2"))
      .mockResolvedValue({ version: 8 });

    render(<PresentationEditor />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /save slide/i }));
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(2);

    expect(screen.getByRole("button", { name: /reload latest slide/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reload latest slide/i }));
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /save slide/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutationMocks.updateSlide).toHaveBeenCalledTimes(3);
    expect(mutationMocks.updateSlide).toHaveBeenLastCalledWith(expect.objectContaining({
      saveMode: "manual",
    }));
  });
});
