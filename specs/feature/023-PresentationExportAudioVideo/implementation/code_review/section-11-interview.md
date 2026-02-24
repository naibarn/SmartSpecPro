# Section-11 Code Review Interview Transcript

**Date:** 2026-02-24
**Section:** section-11-play-mode-page
**Verdict after fixes:** APPROVED

---

## Auto-Fixes Applied (No User Input Required)

All issues were auto-fixable or auto-dismissable. No user decisions were required.

### H1: `normalizeCanvasSize` import will fail — not exported from barrel (auto-fix)

- Split import on line 8:
  - `import { CanvasStage } from "@/presentation-canvas";` (unchanged)
  - `import { normalizeCanvasSize } from "@/presentation-canvas/constants";` (new path)
- Updated test mock: removed `normalizeCanvasSize` from `vi.mock("@/presentation-canvas", ...)` and added `vi.mock("@/presentation-canvas/constants", () => ({ normalizeCanvasSize: vi.fn(...) }))`.

### H2: CanvasStage renders Transform Dock in play mode (auto-fix)

- Added `showTransformDock={false}` and `suppressTransformHandles={true}` to the CanvasStage in play mode.
- Prevents transform handles and the dock from appearing on top of slides during playback.

### H3: Scale doubly-applied — CanvasStage has internal fit logic (auto-fix)

- Removed the manual `scale` computation and the `viewport` prop from CanvasStage.
- CanvasStage manages its own fit via internal ResizeObserver when `viewport` is absent.
- Removed `canvasSize.width / canvasSize.height` scale math; `canvasSize` is still passed for CanvasStage's internal aspect ratio computation.
- `(currentSlide as any)?.slideContent?.canvas` and `elements` accesses updated with `as any` bridge casts to match the un-propagated section-02 types.

### H4: ENDED state not handled in Play button / Space key (auto-fix)

- Play button onClick updated: when `playbackState === "ENDED"`, calls `engineRef.current?.goToSlide(0)` then `engineRef.current?.play()`.
- Same logic added to the `case " ":` keyboard handler.
- Added test: `"pressing Space in ENDED state restarts from slide 0"` — verifies `goToSlide(0)` and `play()` called.

### M1: Auto-hide timer starts before playDeck loads (auto-fix)

- Removed the standalone `useEffect` that called `resetHideTimer()` on mount.
- Added `resetHideTimer()` call at the end of the `playDeck` useEffect (after engines are initialized).
- Added `if (hideTimerRef.current) clearTimeout(hideTimerRef.current)` to the effect's cleanup.
- Added `resetHideTimer` to the playDeck useEffect dependency array (it is stable — `useCallback` with `[]` deps).

### M2: Escape key should navigate back when not in fullscreen (auto-fix)

- Updated `case "Escape":` to call `setLocation("/presentations")` when `document.fullscreenElement` is null.
- Destructured `mockSetLocation = vi.fn()` in test mock to allow assertion.
- Added test: `"pressing Escape when not in fullscreen navigates back to /presentations"`.
- Added `resetHideTimer` to the keyboard useEffect deps (`[playbackState, setLocation]`).

### L1: slide.transition field ignored for CSS animation (auto-fix)

- Added `const transitionType = (currentSlide as any)?.transition ?? "fade"`.
- Slide canvas wrapper now uses `cn(... transitionType === "cut" ? "duration-0" : "duration-300")`.
- Test fixture already had `transition: "cut"` / `transition: "fade"` on slides — no test changes required.

### L2: Fullscreen button doesn't toggle off (auto-fix)

- Fullscreen button onClick updated: checks `document.fullscreenElement` first; calls `document.exitFullscreen()` if in fullscreen, `document.documentElement.requestFullscreen()` otherwise.
- Added `Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true })` to test `beforeEach` so the toggle behavior is deterministic.
- Existing fullscreen test updated label to `"fullscreen button calls document.documentElement.requestFullscreen when not in fullscreen"`.

### L3: `"Space"` dual-case missing (auto-fix)

- Added `case "Space":` above `case " ":` in the keyboard switch statement.
- Both cases share the same logic block.

---

## Items Noted But Not Fixed

### H5: `as any` casts bypass section-02 types

- Several casts: `(currentSlide as any)?.slideContent?.canvas`, `(currentSlide as any)?.slideContent?.elements`, `(currentSlide as any)?.transition`, `(playDeck.slides[newIndex] as any)?.audioTrack`.
- These are intentional bridges pending section-04 propagating the full `PresentationSlidePayload` type to the tRPC response. Not fixed here; tracked in section-04 clean-up.

---

## Final Test Count

- **12 tests** in `apps/web/client/src/pages/PresentationPlayMode.test.tsx`
- **12/12 passing**
- Tests cover: loading spinner, canvas renders, Space toggle (IDLE→PLAYING), ArrowRight/ArrowLeft, ArrowRight in ENDED, Space in ENDED restarts, fullscreen button, Escape navigates back, slide counter, auto-hide timer (3s), keyboard cleanup on unmount.
