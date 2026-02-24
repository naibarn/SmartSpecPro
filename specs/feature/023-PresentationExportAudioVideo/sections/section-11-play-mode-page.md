Now I have all the context I need. Let me generate the section content for `section-11-play-mode-page`.

# Section 11: Frontend — PresentationPlayMode Page

## Overview

This section creates the full-screen presentation play mode page. It is a new lazy-loaded React page accessible at `/presentation/:itemId/play`. The page uses the `PlaybackEngine` class (section-12) and `AudioTrackPlayer` class (section-13) for state management and audio control, and calls the `getPlayDeck` tRPC procedure (section-04) for data.

## Dependencies

This section depends on:

- **section-02** (Shared Contracts) — `PresentationPlayDeckPayload`, `PresentationSlidePayload`, `ResolvedAudioTrack`, `ResolvedProjectAudioTrack` types
- **section-04** (tRPC Router) — `getPlayDeck` procedure must exist before this page can query data
- **section-12** (PlaybackEngine) — the `PlaybackEngine` class must exist at `apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts`
- **section-13** (AudioTrackPlayer) — the `AudioTrackPlayer` class must exist at `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts`

## Files to Create / Modify

| Action | File |
|--------|------|
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationPlayMode.tsx` |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationPlayMode.test.tsx` |

---

## Tests First

Write these tests before implementing `PresentationPlayMode.tsx`. Test file location:
`/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationPlayMode.test.tsx`

Run with: `cd apps/web && pnpm test PresentationPlayMode`

The tests use Vitest + React Testing Library. The `trpc` client, `PlaybackEngine`, and `AudioTrackPlayer` must all be mocked.

```typescript
// PresentationPlayMode.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "wouter"; // or use wouter's MemoryRouter equivalent

// Mock trpc client
vi.mock("@/lib/trpc", () => ({ /* stub getPlayDeck query */ }));

// Mock PlaybackEngine and AudioTrackPlayer
vi.mock("@/presentation-canvas/play/PlaybackEngine");
vi.mock("@/presentation-canvas/play/AudioTrackPlayer");

// Mock slide canvas rendering (read-only canvas component from presentation-canvas)
vi.mock("@/presentation-canvas", () => ({ /* stub CanvasStage */ }));

describe("PresentationPlayMode", () => {
  it("renders full-screen loading spinner while getPlayDeck query is pending");
  it("renders slide canvas when data is ready (uses mocked getPlayDeck response)");
  it("pressing Space toggles play/pause state");
  it("pressing ArrowRight advances to next slide");
  it("pressing ArrowLeft goes to previous slide");
  it("pressing ArrowRight on last slide does not advance past end (ENDED state)");
  it("fullscreen button calls document.documentElement.requestFullscreen");
  it("slide counter shows '1 / N' format");
  it("control bar is visible on mouse hover and hidden after 3 seconds of inactivity");
  it("keyboard listeners are cleaned up on component unmount");
});
```

Key testing considerations:
- Mock `document.documentElement.requestFullscreen` using `vi.fn()` since JSDOM does not implement it.
- Mock `window.setTimeout` / `vi.useFakeTimers()` to test the 3-second auto-hide and auto-advance without actually waiting.
- The `Audio` constructor is not available in JSDOM — the `AudioTrackPlayer` mock eliminates this dependency in page tests.
- For keyboard tests, use `fireEvent.keyDown(document, { key: "Space" })` etc. on the document, since the listener is on `window`.

---

## Route Registration

### `App.tsx` Changes

Two changes are required in `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`:

**1. Add lazy import** (alongside the existing `PresentationEditor` import on line 20):

```typescript
const PresentationPlayMode = lazy(() => import("@/pages/PresentationPlayMode"));
```

**2. Register the route** (inside the `<Switch>` block, immediately after the existing presentation editor route on line 190):

```typescript
// Existing:
<Route path="/presentation-editor/:docId" component={PresentationEditor} />
// Add this line after:
<Route path="/presentation/:itemId/play" component={PresentationPlayMode} />
```

Note the route path uses `/presentation/:itemId/play`, not `/presentation-editor/:docId`. The `:itemId` parameter is a library item ID (integer) — the same numeric ID used by `getPlayDeck`. The play mode route must be placed **before** the catch-all `<Route component={NotFound} />`.

---

## Implementation: `PresentationPlayMode.tsx`

### File Location

`/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationPlayMode.tsx`

### High-Level Responsibilities

1. Parse `itemId` from the route using Wouter's `useRoute`
2. Fetch presentation data via `trpc.presentation.getPlayDeck.useQuery({ itemId })`
3. Instantiate and manage `PlaybackEngine` and `AudioTrackPlayer` via `useRef` + `useEffect`
4. Render full-screen layout: slide canvas (read-only) + controls overlay
5. Register and clean up keyboard event listeners
6. Manage control bar visibility (auto-hide after 3 seconds of mouse inactivity)

### Routing and URL Parsing

```typescript
const PLAY_MODE_ROUTE = "/presentation/:itemId/play";

// Inside the component:
const [, routeParams] = useRoute(PLAY_MODE_ROUTE);
const itemId = routeParams?.itemId ? parseInt(routeParams.itemId, 10) : null;
```

If `itemId` is null or NaN, the component should show a "Not Found" message and a "Back" link.

### Data Loading

```typescript
const { data: playDeck, isLoading, isError } = trpc.presentation.getPlayDeck.useQuery(
  { itemId: itemId! },
  { enabled: Boolean(itemId) }
);
```

While `isLoading` is true: render a full-screen centered spinner (`<Loader2 className="animate-spin" />`).

If `isError` is true: render a full-screen error state with the error message and a "Go Back" button that calls `useLocation` to navigate to `/presentations`.

### PlaybackEngine and AudioTrackPlayer Integration

Both engine instances are stored in `useRef` and initialized once `playDeck` data is available. They must be destroyed on component unmount.

```typescript
const engineRef = useRef<PlaybackEngine | null>(null);
const audioRef = useRef<AudioTrackPlayer | null>(null);

// Derived UI state driven by PlaybackEngine callbacks
const [playbackState, setPlaybackState] = useState<PlaybackState>("IDLE");
const [currentIndex, setCurrentIndex] = useState(0);

useEffect(() => {
  if (!playDeck) return;

  // Initialize AudioTrackPlayer with the project-wide audio track
  audioRef.current = new AudioTrackPlayer(playDeck.projectAudioTrack ?? null);

  // Initialize PlaybackEngine with slides and a state-change callback
  engineRef.current = new PlaybackEngine(
    playDeck.slides,
    (newState, newIndex) => {
      setPlaybackState(newState);
      setCurrentIndex(newIndex);
      // Notify AudioTrackPlayer on slide transitions
      if (newState === "SLIDE_TRANSITIONING") {
        audioRef.current?.onSlideExit();
        audioRef.current?.onSlideEnter(playDeck.slides[newIndex]?.audioTrack ?? null);
      }
      if (newState === "PAUSED") {
        audioRef.current?.pause();
      }
      if (newState === "PLAYING") {
        audioRef.current?.resume();
      }
    }
  );

  return () => {
    engineRef.current?.destroy();
    audioRef.current?.destroy();
    engineRef.current = null;
    audioRef.current = null;
  };
}, [playDeck]);
```

Note: the exact callback signature must match what `PlaybackEngine` actually emits — refer to section-12 for the `onStateChange` type. Adapt if the engine passes the state and index as separate arguments or as a single object.

### Keyboard Shortcuts

Register on `window` via `useEffect`. Keyboard handling must be cleaned up on unmount.

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case " ":
      case "Space":
        e.preventDefault();
        if (playbackState === "PLAYING") {
          engineRef.current?.pause();
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
        }
        break;
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [playbackState]); // re-register when playbackState changes so closure has current value
```

### Control Bar Auto-Hide

```typescript
const [showControls, setShowControls] = useState(true);
const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const resetHideTimer = useCallback(() => {
  setShowControls(true);
  if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
}, []);

// On mount, start the timer
useEffect(() => {
  resetHideTimer();
  return () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };
}, [resetHideTimer]);
```

Attach `onMouseMove={resetHideTimer}` to the outermost wrapper div so any mouse movement within the page resets the timer.

### Slide Transitions

Transitions are CSS-only. Apply a class to the slide canvas wrapper that triggers a fade:

```tsx
<div
  key={currentIndex}  // key change forces remount = triggers enter animation
  className="absolute inset-0 transition-opacity duration-300 ease-in-out"
  style={{ opacity: playbackState === "SLIDE_TRANSITIONING" ? 0 : 1 }}
>
  {/* slide canvas */}
</div>
```

The transition type (fade vs. cut) is read from `playDeck.slides[currentIndex]?.transition`. If no transition is configured, use a cut (no animation, or `duration-0`).

### Slide Canvas (Read-Only Mode)

The current slide content is rendered using the existing `CanvasStage` or equivalent read-only renderer from `@/presentation-canvas`. The key prop is:
- `slideContent`: the current slide's `slideContent` field from `playDeck.slides[currentIndex]`
- `readonly={true}`: disables all editor interactions (drag handles, selection, context menus)
- `width` / `height`: from `playDeck.width` and `playDeck.height` (or default 1920/1080)

Check the existing `PresentationEditor.tsx` to see exactly which props `CanvasStage` accepts — the play mode must pass the same slide content shape.

### Controls Overlay JSX Structure

```tsx
<div
  className={cn(
    "fixed bottom-0 left-0 right-0 h-16 bg-black/60 backdrop-blur-sm",
    "flex items-center justify-between px-6",
    "transition-opacity duration-300",
    showControls ? "opacity-100" : "opacity-0 pointer-events-none"
  )}
>
  {/* Left: Prev / Play-Pause / Next */}
  <div className="flex items-center gap-3">
    <button onClick={() => engineRef.current?.prevSlide()} aria-label="Previous slide">
      <SkipBack className="w-5 h-5 text-white" />
    </button>
    <button
      onClick={() => playbackState === "PLAYING"
        ? engineRef.current?.pause()
        : engineRef.current?.play()
      }
      aria-label={playbackState === "PLAYING" ? "Pause" : "Play"}
    >
      {playbackState === "PLAYING"
        ? <Pause className="w-6 h-6 text-white" />
        : <Play className="w-6 h-6 text-white" />
      }
    </button>
    <button onClick={() => engineRef.current?.nextSlide()} aria-label="Next slide">
      <SkipForward className="w-5 h-5 text-white" />
    </button>
  </div>

  {/* Center: Slide counter */}
  <span className="text-white text-sm font-medium tabular-nums">
    {currentIndex + 1} / {playDeck?.slides.length ?? 0}
  </span>

  {/* Right: Fullscreen */}
  <button
    onClick={() => document.documentElement.requestFullscreen()}
    aria-label="Toggle fullscreen"
  >
    <Maximize2 className="w-5 h-5 text-white" />
  </button>
</div>
```

Icons imported from `lucide-react`: `SkipBack`, `SkipForward`, `Play`, `Pause`, `Maximize2`, `Loader2`. These are all already present in the `PresentationEditor.tsx` import list as a reference.

### Full Component Structure (Stub)

```typescript
// apps/web/client/src/pages/PresentationPlayMode.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Loader2, Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { PlaybackEngine, type PlaybackState } from "@/presentation-canvas/play/PlaybackEngine";
import { AudioTrackPlayer } from "@/presentation-canvas/play/AudioTrackPlayer";
import { CanvasStage } from "@/presentation-canvas"; // or appropriate read-only renderer

const PLAY_MODE_ROUTE = "/presentation/:itemId/play";

export default function PresentationPlayMode() {
  /**
   * Parse itemId from route params. Redirect or show error if not a valid integer.
   */

  /**
   * Fetch play deck data via tRPC getPlayDeck query.
   * Renders loading spinner while pending, error state if query fails.
   */

  /**
   * Initialize PlaybackEngine and AudioTrackPlayer in useRef.
   * Destroy both on unmount.
   */

  /**
   * Register keyboard event listeners on window.
   * Clean up on unmount.
   */

  /**
   * Control bar auto-hide: show on mouse move, hide after 3s.
   */

  /**
   * Render:
   * - Loading state: full-screen centered spinner
   * - Error state: full-screen error message + back button
   * - Ready state:
   *   - Full-screen black background
   *   - Slide canvas (read-only, current slide)
   *   - Controls overlay (conditionally visible)
   */
}
```

---

## Auto-Advance Logic

When `playbackState === "PLAYING"`, the `PlaybackEngine` owns the auto-advance timer (see section-12). The `PresentationPlayMode` component does not need a separate `setTimeout` for slide advancement — it only renders the state that the engine emits via `onStateChange`. The component's responsibility is only:

1. Displaying the correct slide index (from `currentIndex` state)
2. Displaying the correct play/pause icon (from `playbackState`)
3. Triggering `play()` on initial mount if auto-play is desired (not required — the user can press Space or Play)

Do NOT duplicate auto-advance logic in the page component — this lives entirely in `PlaybackEngine`.

---

## Full-Screen Layout

The outermost container must be `position: fixed; inset: 0` with a black background to prevent any application chrome from bleeding through:

```tsx
<div
  className="fixed inset-0 bg-black flex items-center justify-center"
  onMouseMove={resetHideTimer}
>
  {/* slide canvas centered in viewport */}
  {/* controls overlay at bottom */}
</div>
```

The slide canvas should be scaled to fit the viewport while maintaining the 16:9 aspect ratio of the deck dimensions. Use CSS `object-fit: contain` semantics — compute a scale factor from `min(viewportWidth / deckWidth, viewportHeight / deckHeight)` and apply it as a CSS `transform: scale(N)`.

---

## Edge Cases

- **No slides**: if `playDeck.slides.length === 0`, show a "No slides in this presentation" empty state in place of the canvas.
- **ENDED state**: when `PlaybackEngine` transitions to `ENDED` (last slide reached while playing), keep the last slide visible. The Play button should restart from slide 0 — call `engineRef.current?.goToSlide(0)` then `engineRef.current?.play()`.
- **itemId NaN**: `parseInt("abc", 10)` returns `NaN`. Guard with `Number.isFinite(itemId)` before enabling the tRPC query.
- **Fullscreen API unavailable**: `document.documentElement.requestFullscreen` may not exist in all environments. Guard: `if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); }`.

---

## Implementation Checklist

- [x] Write `PresentationPlayMode.test.tsx` with all 10 test cases listed above
- [x] Add `PresentationPlayMode` lazy import in `App.tsx` (line ~20, after `PresentationLibrary`)
- [x] Add `<Route path="/presentation/:itemId/play" component={PresentationPlayMode} />` in `App.tsx` `<Switch>` block, after line 190 (after the existing PresentationEditor route), before the catch-all NotFound route
- [x] Create `apps/web/client/src/pages/PresentationPlayMode.tsx`
- [x] Parse `itemId` from route, guard against NaN
- [x] Wire `trpc.presentation.getPlayDeck.useQuery` with loading/error states
- [x] Initialize `PlaybackEngine` and `AudioTrackPlayer` in `useRef`, destroy on unmount
- [x] Implement keyboard handler (`Space`, `ArrowLeft`, `ArrowRight`, `Escape`) on `window`
- [x] Implement control bar auto-hide with 3-second timer on mouse inactivity
- [x] Render read-only slide canvas for `playDeck.slides[currentIndex]`
- [x] Render controls overlay (Prev, Play/Pause, Next, counter, Fullscreen)
- [x] Handle `ENDED` state — allow restart
- [x] Handle empty slides array
- [x] Apply CSS fade transition based on `slide.transition` field
- [x] Run `cd apps/web && pnpm test PresentationPlayMode` — all tests pass
- [x] Run `cd apps/web && pnpm check` — no TypeScript errors

---

## Implementation Results

**Date:** 2026-02-24
**Tests:** 12/12 passing (2 extra tests added for ENDED state restart and Escape navigation)
**Files created/modified:**
- `apps/web/client/src/pages/PresentationPlayMode.tsx` (created)
- `apps/web/client/src/pages/PresentationPlayMode.test.tsx` (created, 12 tests)
- `apps/web/client/src/App.tsx` (modified — lazy import + route)
- `apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts` (skeleton created for section-12)
- `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts` (skeleton created for section-13)

**Deviations from plan:**
- `normalizeCanvasSize` imported from `@/presentation-canvas/constants` directly (not the barrel — it was never re-exported from the barrel index).
- `viewport` prop omitted from `CanvasStage` — CanvasStage handles its own fit internally; passing an external scale caused double-scaling.
- `showTransformDock={false}` and `suppressTransformHandles={true}` added to suppress editor UI in play mode.
- Auto-hide timer starts inside the `playDeck` useEffect (after data loads), not on raw mount.
- Escape key navigates to `/presentations` when not in fullscreen (M2 fix).
- Fullscreen button toggles (exit if in fullscreen, enter if not) (L2 fix).
- Both `case " ":` and `case "Space":` handled in keyboard switch (L3 fix).
- CSS transition duration set dynamically: `duration-0` for "cut", `duration-300` for "fade" (L1 fix).
- `slideContent` and `audioTrack` accessed via `as any` bridge — pending section-04 type propagation.