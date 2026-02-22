import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const setLocationMock = vi.fn();
const routeParamsMock = { docId: "42" };

const mutationMocks = {
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

const queryState = {
  libraryItem: {
    id: 42,
    item_type: "presentation",
    itemType: "presentation",
    title: "Product Pitch",
  },
  guard: {
    allowed: true,
    itemId: 42,
    editorRoute: "/presentation-editor/42",
  },
  deckByItem: buildDeckByItem(),
  deckError: null as Error | null,
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

vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      getItem: {
        useQuery: vi.fn(() => ({
          data: queryState.libraryItem,
          isLoading: false,
          error: null,
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
      guardEditorOpen: {
        useQuery: vi.fn(() => ({
          data: queryState.guard,
          isLoading: false,
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
    mutationMocks.duplicateSlide.mockResolvedValue({});
    mutationMocks.deleteSlide.mockResolvedValue({});
    mutationMocks.reorderSlides.mockResolvedValue({});
    mutationMocks.updateSlide.mockResolvedValue({});
    mutationMocks.createDeck.mockResolvedValue({});
    mutationMocks.triggerExport.mockResolvedValue({
      exportId: "exp-1",
      status: "queued",
      deduped: false,
      message: "Queued",
    });
    queryState.guard = {
      allowed: true,
      itemId: 42,
      editorRoute: "/presentation-editor/42",
    };
    queryState.deckByItem = buildDeckByItem();
    queryState.deckError = null;
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
  });

  it("wires slide CRUD and reorder controls to typed API bindings", async () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /add slide/i }));
    fireEvent.click(screen.getByRole("button", { name: /duplicate slide/i }));
    fireEvent.click(screen.getByRole("button", { name: /move slide down/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete slide/i }));

    await waitFor(() => {
      expect(mutationMocks.addSlide).toHaveBeenCalled();
      expect(mutationMocks.duplicateSlide).toHaveBeenCalled();
      expect(mutationMocks.reorderSlides).toHaveBeenCalled();
      expect(mutationMocks.deleteSlide).toHaveBeenCalled();
    });
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
      exportId: "exp-warning-1",
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
    });
  });

  it("navigates back to Document Management from editor header", () => {
    render(<PresentationEditor />);

    fireEvent.click(screen.getByRole("button", { name: /back to document management/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=42");
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
