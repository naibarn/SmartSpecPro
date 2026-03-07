import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft, Loader2, Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { PlaybackEngine, type PlaybackState } from "@/presentation-canvas/play/PlaybackEngine";
import { AudioTrackPlayer } from "@/presentation-canvas/play/AudioTrackPlayer";
import { CanvasStage } from "@/presentation-canvas";
import { normalizeCanvasSize } from "@/presentation-canvas/constants";
import { ensureSlideContent } from "@/lib/presentationEditorState";
import { Button } from "@/components/ui/button";

const PLAY_MODE_ROUTE = "/presentation/:itemId/play";
const PLAY_TRANSITION_DURATION_MS = 700;

type PlayTransitionType =
  | "cut"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "blur";

function normalizePlayTransition(input: unknown): PlayTransitionType {
  switch (input) {
    case "cut":
    case "fade":
    case "slide-left":
    case "slide-right":
    case "zoom-in":
    case "zoom-out":
    case "blur":
      return input;
    default:
      return "fade";
  }
}

function getTransitionStyle(
  transition: PlayTransitionType,
  phase: "steady" | "exit" | "enter",
): CSSProperties {
  if (phase === "steady" || transition === "cut") {
    return {
      opacity: 1,
      transform: "none",
    };
  }

  if (phase === "enter") {
    switch (transition) {
      case "slide-left":
        return {
          opacity: 0,
          transform: "translate3d(220px, 0, 0) scale(1)",
        };
      case "slide-right":
        return {
          opacity: 0,
          transform: "translate3d(-220px, 0, 0) scale(1)",
        };
      case "zoom-in":
        return {
          opacity: 0,
          transform: "translate3d(0, 0, 0) scale(1.2)",
        };
      case "zoom-out":
        return {
          opacity: 0,
          transform: "translate3d(0, 0, 0) scale(0.8)",
        };
      case "blur":
        return {
          opacity: 0,
          transform: "translate3d(0, 0, 0) scale(1)",
          filter: "blur(20px)",
        };
      case "fade":
      default:
        return {
          opacity: 0,
          transform: "none",
        };
    }
  }

  switch (transition) {
    case "slide-left":
      return {
        opacity: 0,
        transform: "translate3d(-220px, 0, 0) scale(1)",
      };
    case "slide-right":
      return {
        opacity: 0,
        transform: "translate3d(220px, 0, 0) scale(1)",
      };
    case "zoom-in":
      return {
        opacity: 0,
        transform: "translate3d(0, 0, 0) scale(0.8)",
      };
    case "zoom-out":
      return {
        opacity: 0,
        transform: "translate3d(0, 0, 0) scale(1.2)",
      };
    case "blur":
      return {
        opacity: 0,
        transform: "translate3d(0, 0, 0) scale(1)",
        filter: "blur(20px)",
      };
    case "fade":
    default:
      return {
        opacity: 0,
        transform: "none",
      };
  }
}

export default function PresentationPlayMode() {
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute(PLAY_MODE_ROUTE);
  const itemId = routeParams?.itemId ? parseInt(routeParams.itemId, 10) : null;
  const validItemId = itemId !== null && Number.isFinite(itemId) ? itemId : null;
  const navigateBackToEditor = useCallback(() => {
    if (validItemId) {
      setLocation(`/presentation-editor/${validItemId}`);
      return;
    }
    setLocation("/presentations");
  }, [setLocation, validItemId]);

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  const { data: playDeck, isLoading, isError, error } = trpc.presentation.getPlayDeck.useQuery(
    { itemId: validItemId! },
    { enabled: Boolean(validItemId) },
  );
  const deckDetailQuery = trpc.presentation.getDeckByLibraryItem.useQuery(
    { libraryItemId: validItemId! },
    { enabled: Boolean(validItemId) },
  );

  const playbackSlides = useMemo(() => {
    if (!playDeck) {
      return [];
    }
    const detailSlidesRaw = Array.isArray((deckDetailQuery.data as any)?.slides)
      ? (deckDetailQuery.data as any).slides
      : [];
    const detailSlideMap = new Map<number, any>();
    for (const detailSlide of detailSlidesRaw) {
      const detailId = Number((detailSlide as any)?.id);
      if (Number.isFinite(detailId) && detailId > 0) {
        detailSlideMap.set(detailId, detailSlide);
      }
    }

    return playDeck.slides.map((slide: any) => {
      const resolvedSlideId = Number(slide.slideId ?? slide.id);
      const detailSlide = Number.isFinite(resolvedSlideId)
        ? detailSlideMap.get(resolvedSlideId)
        : null;
      return {
        ...slide,
        slideId: Number.isFinite(resolvedSlideId) ? resolvedSlideId : 0,
        slideContent: detailSlide?.slideContent ?? slide.slideContent ?? { elements: [] },
      };
    });
  }, [deckDetailQuery.data, playDeck]);

  // Detect feature-disabled errors (FORBIDDEN with FEATURE_DISABLED code)
  const isFeatureDisabled =
    isError && (error as { data?: { code?: string } } | null)?.data?.code === "FORBIDDEN";

  // -------------------------------------------------------------------------
  // Playback state (driven by PlaybackEngine callbacks)
  // -------------------------------------------------------------------------

  const [playbackState, setPlaybackState] = useState<PlaybackState>("IDLE");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [indexTransitioning, setIndexTransitioning] = useState(false);

  // -------------------------------------------------------------------------
  // Engine refs
  // -------------------------------------------------------------------------

  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioRef = useRef<AudioTrackPlayer | null>(null);
  const lastIndexRef = useRef(0);
  const transitionFrameRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Control bar auto-hide
  // -------------------------------------------------------------------------

  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // -------------------------------------------------------------------------
  // Initialize engines when data is available
  // M1: auto-hide timer starts here (after data loads, not on raw mount)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!playDeck || !playbackSlides.length) return;

    audioRef.current = new AudioTrackPlayer(playDeck.projectAudioTrack ?? null);
    lastIndexRef.current = 0;
    setIndexTransitioning(false);
    if (transitionFrameRef.current != null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }

    engineRef.current = new PlaybackEngine(
      playbackSlides,
      (newState: PlaybackState, newIndex: number) => {
        const previousIndex = lastIndexRef.current;
        const indexChanged = newIndex !== previousIndex;
        if (indexChanged) {
          if (transitionFrameRef.current != null) {
            window.cancelAnimationFrame(transitionFrameRef.current);
          }
          setIndexTransitioning(true);
          transitionFrameRef.current = window.requestAnimationFrame(() => {
            setIndexTransitioning(false);
            transitionFrameRef.current = null;
          });
        } else if (newState !== "PLAYING" && newState !== "SLIDE_TRANSITIONING") {
          if (transitionFrameRef.current != null) {
            window.cancelAnimationFrame(transitionFrameRef.current);
            transitionFrameRef.current = null;
          }
          setIndexTransitioning(false);
        }
        lastIndexRef.current = newIndex;

        setPlaybackState(newState);
        setCurrentIndex(newIndex);
        if (newState === "SLIDE_TRANSITIONING") {
          // Exit the current slide (newIndex is still the old slide at this point)
          audioRef.current?.onSlideExit();
        }
        if (newState === "PLAYING") {
          // Enter the new slide (newIndex is now the new slide)
          audioRef.current?.onSlideEnter((playbackSlides[newIndex] as any)?.audioTrack ?? null);
          audioRef.current?.resume();
        }
        if (newState === "PAUSED") {
          audioRef.current?.pause();
        }
      },
    );

    // Start auto-hide timer once slide data is ready
    resetHideTimer();

    return () => {
      if (transitionFrameRef.current != null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }
      engineRef.current?.destroy();
      audioRef.current?.destroy();
      engineRef.current = null;
      audioRef.current = null;
      setIndexTransitioning(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playDeck, playbackSlides, resetHideTimer]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
        case "Space": // L3: dual-case for browser compatibility
          e.preventDefault();
          if (playbackState === "PLAYING") {
            engineRef.current?.pause();
          } else if (playbackState === "ENDED") {
            // H4: restart from beginning when presentation has ended
            engineRef.current?.goToSlide(0);
            engineRef.current?.play();
          } else {
            engineRef.current?.play();
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          engineRef.current?.nextSlide();
          break;
        case "ArrowLeft":
          e.preventDefault();
          engineRef.current?.prevSlide();
          break;
        case "Escape":
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            navigateBackToEditor();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateBackToEditor, playbackState]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading || deckDetailQuery.isLoading || (!playDeck && !isError && validItemId)) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-white animate-spin" aria-label="Loading" role="status" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error / invalid state
  // -------------------------------------------------------------------------

  if (isFeatureDisabled) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <p className="text-white text-lg">Presentation play mode is not available.</p>
        <p className="text-gray-400 text-sm">This feature has not been enabled for your account.</p>
        <button
          className="text-white underline"
          onClick={navigateBackToEditor}
          aria-label="Go back to presentations"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (isError || deckDetailQuery.isError || !validItemId || !playDeck) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <p className="text-white text-lg">Failed to load presentation.</p>
        <button
          className="text-white underline"
          onClick={navigateBackToEditor}
          aria-label="Go back to presentations"
        >
          Go Back
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Empty slides
  // -------------------------------------------------------------------------

  if (playbackSlides.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="text-white">No slides in this presentation.</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const currentSlide = playbackSlides[currentIndex] ?? null;
  const normalizedSlideContent = ensureSlideContent((currentSlide as any)?.slideContent ?? { elements: [] });
  const canvasSize = normalizeCanvasSize(normalizedSlideContent.canvas);
  const transitionType = normalizePlayTransition(
    normalizedSlideContent.transition ?? (currentSlide as any)?.transition ?? "fade",
  );
  const isPlaying = playbackState === "PLAYING";
  const transitionPhase: "steady" | "exit" | "enter" = indexTransitioning
    ? "enter"
    : playbackState === "SLIDE_TRANSITIONING"
      ? "exit"
      : "steady";

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center"
      onMouseMove={resetHideTimer}
    >
      <div className="fixed left-3 top-3 z-20">
        <Button
          size="sm"
          variant="secondary"
          className="gap-1 bg-black/60 text-white hover:bg-black/75"
          onClick={navigateBackToEditor}
          aria-label="Back to editor"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Editor
        </Button>
      </div>
      {/* Slide canvas — key change triggers CSS fade on slide transition */}
      <div
        key={currentIndex}
        data-testid="play-slide-transition-layer"
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-[opacity,transform,filter] ease-in-out",
        )}
        style={{
          ...getTransitionStyle(transitionType, transitionPhase),
          transitionDuration: `${transitionType === "cut" ? 0 : PLAY_TRANSITION_DURATION_MS}ms`,
        }}
      >
        <div className="h-full w-full p-3 md:p-5">
          {/* H2: showTransformDock=false + suppressTransformHandles=true for read-only play mode */}
          {/* H3: no viewport prop — CanvasStage handles its own fit via ResizeObserver */}
          <CanvasStage
            elements={normalizedSlideContent.elements}
            canvasSize={canvasSize}
            selectedElementIds={[]}
            snapGuides={[]}
            showElementFrames={false}
            autoPlayVideos={true}
            showVideoPlaybackToggle={false}
            showTransformDock={false}
            suppressTransformHandles={true}
            onSelectElement={() => {}}
            onMoveSelection={() => {}}
            onResizeSelection={() => {}}
            onRotateSelection={() => {}}
            onArrangeSelection={() => {}}
          />
        </div>
      </div>

      {/* Controls overlay — auto-hides after 3s of inactivity */}
      <div
        data-testid="play-controls-bar"
        className={cn(
          "fixed bottom-0 left-0 right-0 h-16 bg-black/60 backdrop-blur-sm",
          "flex items-center justify-between px-6",
          "transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {/* Left: Prev / Play-Pause / Next */}
        <div className="flex items-center gap-3">
          <button onClick={() => engineRef.current?.prevSlide()} aria-label="Previous slide">
            <SkipBack className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => {
              if (playbackState === "PLAYING") {
                engineRef.current?.pause();
              } else if (playbackState === "ENDED") {
                // H4: restart from beginning when ended
                engineRef.current?.goToSlide(0);
                engineRef.current?.play();
              } else {
                engineRef.current?.play();
              }
            }}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying
              ? <Pause className="w-6 h-6 text-white" />
              : <Play className="w-6 h-6 text-white" />}
          </button>
          <button onClick={() => engineRef.current?.nextSlide()} aria-label="Next slide">
            <SkipForward className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Center: Slide counter */}
        <span className="text-white text-sm font-medium tabular-nums">
          {currentIndex + 1} / {playbackSlides.length}
        </span>

        {/* Right: Fullscreen toggle */}
        <button
          onClick={() => {
            // L2: toggle fullscreen (exit if already in fullscreen)
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen();
            }
          }}
          aria-label="Toggle fullscreen"
        >
          <Maximize2 className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
