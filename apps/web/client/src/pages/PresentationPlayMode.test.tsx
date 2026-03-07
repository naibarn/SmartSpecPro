import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { PlaybackState } from "@/presentation-canvas/play/PlaybackEngine";

// ---------------------------------------------------------------------------
// Mock: PlaybackEngine
// ---------------------------------------------------------------------------

const mockEngineInstance = {
  play: vi.fn(),
  pause: vi.fn(),
  nextSlide: vi.fn(),
  prevSlide: vi.fn(),
  goToSlide: vi.fn(),
  destroy: vi.fn(),
};

let capturedOnStateChange: ((state: PlaybackState, index: number) => void) | null = null;

vi.mock("@/presentation-canvas/play/PlaybackEngine", () => ({
  PlaybackEngine: vi.fn().mockImplementation((_slides: unknown, onStateChange: (state: PlaybackState, index: number) => void) => {
    capturedOnStateChange = onStateChange;
    return mockEngineInstance;
  }),
}));

// ---------------------------------------------------------------------------
// Mock: AudioTrackPlayer
// ---------------------------------------------------------------------------

const mockAudioInstance = {
  onSlideExit: vi.fn(),
  onSlideEnter: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  destroy: vi.fn(),
};

vi.mock("@/presentation-canvas/play/AudioTrackPlayer", () => ({
  AudioTrackPlayer: vi.fn().mockImplementation(() => mockAudioInstance),
}));

// ---------------------------------------------------------------------------
// Mock: @/presentation-canvas (H1: normalizeCanvasSize moved to constants)
// ---------------------------------------------------------------------------

vi.mock("@/presentation-canvas", () => ({
  CanvasStage: ({
    elements,
    autoPlayVideos,
    showVideoPlaybackToggle,
  }: {
    elements: unknown[];
    autoPlayVideos?: boolean;
    showVideoPlaybackToggle?: boolean;
  }) => (
    <div
      data-testid="canvas-stage"
      data-element-count={elements.length}
      data-auto-play-videos={String(Boolean(autoPlayVideos))}
      data-show-video-playback-toggle={String(showVideoPlaybackToggle ?? true)}
    />
  ),
}));

// H1: normalizeCanvasSize comes from constants, not the barrel
vi.mock("@/presentation-canvas/constants", () => ({
  normalizeCanvasSize: vi.fn(() => ({ width: 1920, height: 1080, preset: "16:9" })),
}));

// ---------------------------------------------------------------------------
// Mock: wouter
// ---------------------------------------------------------------------------

const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/presentation/42/play", mockSetLocation],
  useRoute: () => [true, { itemId: "42" }],
}));

// ---------------------------------------------------------------------------
// Mock: @/contexts/AuthContext
// ---------------------------------------------------------------------------

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/trpc
// ---------------------------------------------------------------------------

const queryState = {
  playDeck: null as ReturnType<typeof buildPlayDeck> | null,
  deckDetail: null as ReturnType<typeof buildDeckDetail> | null,
  isLoading: false,
  isError: false,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentation: {
      getPlayDeck: {
        useQuery: vi.fn(() => ({
          data: queryState.playDeck,
          isLoading: queryState.isLoading,
          isError: queryState.isError,
          error: queryState.isError ? new Error("Not found") : null,
        })),
      },
      getDeckByLibraryItem: {
        useQuery: vi.fn(() => ({
          data: queryState.deckDetail,
          isLoading: queryState.isLoading,
          isError: queryState.isError,
          error: queryState.isError ? new Error("Not found") : null,
        })),
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildPlayDeck() {
  return {
    deckId: 7,
    width: 1920,
    height: 1080,
    projectAudioTrack: null,
    slides: [
      {
        slideId: 71,
        orderIndex: 0,
        title: "Intro",
        transition: "cut",
        durationMs: 3000,
        audioTrack: null,
      },
      {
        slideId: 72,
        orderIndex: 1,
        title: "Agenda",
        transition: "fade",
        durationMs: 3000,
        audioTrack: null,
      },
    ],
  };
}

function buildDeckDetail() {
  return {
    deck: {
      id: 7,
      libraryItemId: 42,
      title: "Test Deck",
    },
    slides: [
      {
        id: 71,
        orderIndex: 0,
        title: "Intro",
        slideContent: { elements: [] },
      },
      {
        id: 72,
        orderIndex: 1,
        title: "Agenda",
        slideContent: { elements: [] },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Import (after mocks)
// ---------------------------------------------------------------------------

import PresentationPlayMode from "./PresentationPlayMode";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PresentationPlayMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnStateChange = null;
    queryState.playDeck = buildPlayDeck();
    queryState.deckDetail = buildDeckDetail();
    queryState.isLoading = false;
    queryState.isError = false;

    // Mock fullscreen API (not in JSDOM)
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    });
    // JSDOM: fullscreenElement is null by default (not in fullscreen)
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders full-screen loading spinner while getPlayDeck query is pending", () => {
    queryState.isLoading = true;
    queryState.playDeck = null;
    render(<PresentationPlayMode />);
    // Should show a loading indicator (Loader2 with animate-spin)
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("renders slide canvas when data is ready", () => {
    render(<PresentationPlayMode />);
    const stage = screen.getByTestId("canvas-stage");
    expect(stage).toBeInTheDocument();
    expect(stage).toHaveAttribute("data-auto-play-videos", "true");
    expect(stage).toHaveAttribute("data-show-video-playback-toggle", "false");
  });

  it("applies modern transition styles when slide state is transitioning", () => {
    const baseDeck = buildPlayDeck();
    queryState.playDeck = {
      ...baseDeck,
      slides: [
        {
          ...baseDeck.slides[0],
          transition: "slide-left",
        },
        baseDeck.slides[1],
      ],
    } as any;

    render(<PresentationPlayMode />);
    act(() => {
      capturedOnStateChange?.("SLIDE_TRANSITIONING", 0);
    });

    expect(screen.getByTestId("play-slide-transition-layer")).toHaveStyle({
      opacity: "0",
      transform: "translate3d(-220px, 0, 0) scale(1)",
    });
  });

  it("animates enter transition when playback advances to the next slide", () => {
    const baseDeck = buildPlayDeck();
    queryState.playDeck = {
      ...baseDeck,
      slides: [
        baseDeck.slides[0],
        {
          ...baseDeck.slides[1],
          transition: "slide-left",
        },
      ],
    } as any;
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1 as any);

    render(<PresentationPlayMode />);
    act(() => {
      capturedOnStateChange?.("PLAYING", 1);
    });

    expect(screen.getByTestId("play-slide-transition-layer")).toHaveStyle({
      opacity: "0",
      transform: "translate3d(220px, 0, 0) scale(1)",
    });
    rafSpy.mockRestore();
  });

  it("animates transition when user navigates slides with Arrow keys while not playing", () => {
    const baseDeck = buildPlayDeck();
    queryState.playDeck = {
      ...baseDeck,
      slides: [
        baseDeck.slides[0],
        {
          ...baseDeck.slides[1],
          transition: "slide-left",
        },
      ],
    } as any;
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1 as any);

    render(<PresentationPlayMode />);
    act(() => {
      capturedOnStateChange?.("IDLE", 1);
    });

    expect(screen.getByTestId("play-slide-transition-layer")).toHaveStyle({
      opacity: "0",
      transform: "translate3d(220px, 0, 0) scale(1)",
    });
    rafSpy.mockRestore();
  });

  it("pressing Space calls play when IDLE, pause when PLAYING", () => {
    render(<PresentationPlayMode />);
    // Initial state is IDLE → pressing Space calls play()
    fireEvent.keyDown(window, { key: " " });
    expect(mockEngineInstance.play).toHaveBeenCalledTimes(1);

    // Simulate transition to PLAYING state
    act(() => {
      capturedOnStateChange?.("PLAYING", 0);
    });

    // Now pressing Space calls pause()
    fireEvent.keyDown(window, { key: " " });
    expect(mockEngineInstance.pause).toHaveBeenCalledTimes(1);
  });

  it("applies slide enter/exit audio lifecycle hooks across playback state changes", () => {
    queryState.playDeck = {
      ...buildPlayDeck(),
      slides: [
        {
          ...buildPlayDeck().slides[0],
          audioTrack: null,
        },
        {
          ...buildPlayDeck().slides[1],
          audioTrack: {
            url: "https://cdn.example.com/audio/agenda.mp3",
            volume: 0.8,
            startAtMs: 0,
          },
        },
      ],
    } as any;

    render(<PresentationPlayMode />);

    act(() => {
      capturedOnStateChange?.("SLIDE_TRANSITIONING", 0);
    });
    expect(mockAudioInstance.onSlideExit).toHaveBeenCalledTimes(1);

    act(() => {
      capturedOnStateChange?.("PLAYING", 1);
    });
    expect(mockAudioInstance.onSlideEnter).toHaveBeenCalledWith(
      queryState.playDeck?.slides[1]?.audioTrack ?? null,
    );
    expect(mockAudioInstance.resume).toHaveBeenCalledTimes(1);

    act(() => {
      capturedOnStateChange?.("PAUSED", 1);
    });
    expect(mockAudioInstance.pause).toHaveBeenCalledTimes(1);
  });

  it("pressing ArrowRight advances to next slide", () => {
    render(<PresentationPlayMode />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mockEngineInstance.nextSlide).toHaveBeenCalledTimes(1);
  });

  it("pressing ArrowLeft goes to previous slide", () => {
    render(<PresentationPlayMode />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(mockEngineInstance.prevSlide).toHaveBeenCalledTimes(1);
  });

  it("pressing ArrowRight in ENDED state still calls nextSlide (engine handles boundary)", () => {
    render(<PresentationPlayMode />);
    act(() => {
      capturedOnStateChange?.("ENDED", 1);
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mockEngineInstance.nextSlide).toHaveBeenCalledTimes(1);
  });

  it("pressing Space in ENDED state restarts from slide 0", () => {
    render(<PresentationPlayMode />);
    act(() => {
      capturedOnStateChange?.("ENDED", 1);
    });
    fireEvent.keyDown(window, { key: " " });
    expect(mockEngineInstance.goToSlide).toHaveBeenCalledWith(0);
    expect(mockEngineInstance.play).toHaveBeenCalledTimes(1);
  });

  it("fullscreen button calls document.documentElement.requestFullscreen when not in fullscreen", () => {
    render(<PresentationPlayMode />);
    fireEvent.click(screen.getByRole("button", { name: /toggle fullscreen/i }));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });

  it("pressing Escape when not in fullscreen navigates back to editor route", () => {
    render(<PresentationPlayMode />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockSetLocation).toHaveBeenCalledWith("/presentation-editor/42");
  });

  it("slide counter shows '1 / N' format", () => {
    render(<PresentationPlayMode />);
    // currentIndex = 0, slides.length = 2 → "1 / 2"
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("control bar is hidden after 3 seconds of inactivity", () => {
    vi.useFakeTimers();
    render(<PresentationPlayMode />);
    const controlBar = screen.getByTestId("play-controls-bar");
    // Initially visible
    expect(controlBar).toHaveClass("opacity-100");
    // Advance 3 seconds
    act(() => {
      vi.advanceTimersByTime(3001);
    });
    expect(controlBar).toHaveClass("opacity-0");
  });

  it("keyboard listeners are cleaned up on component unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<PresentationPlayMode />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
