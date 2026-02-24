Now I have all the context I need to write the section. Let me produce the complete markdown for section-12-playback-engine.

# Section 12: Frontend — PlaybackEngine

## Overview

This section creates the `PlaybackEngine` TypeScript class, a pure state-machine that encapsulates slide playback timing and navigation for the presentation play mode. It has no React dependencies and no audio management — those concerns belong to `AudioTrackPlayer` (section 13) and `PresentationPlayMode` (section 11).

This section can be implemented in parallel with sections 7, 8, 9, and 13 because it has no dependencies on any other section in this feature.

## Dependencies

- No dependencies on other sections in this feature.
- Blocks: section 11 (PresentationPlayMode page).
- The `PresentationSlidePayload` type comes from `apps/web/shared/presentation/contracts.ts` (extended in section 2, but the `durationMs` field already exists there today).

## File to Create

**`/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts`**

The `play/` subdirectory is new — create it alongside the existing `selection/`, `snap/`, `commands/`, `save/`, and `mobile/` subdirectories under `presentation-canvas/`.

---

## Tests First

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/PlaybackEngine.test.ts`

Write this test file before implementing the class. The tests use Vitest's fake timer support (`vi.useFakeTimers()`) so that `setTimeout`-based auto-advance can be tested synchronously.

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackEngine, PlaybackState } from "./PlaybackEngine";
import type { PresentationSlidePayload } from "@shared/presentation/contracts";

// Minimal slide fixtures
function makeSlides(count: number, durationMs = 3000): PresentationSlidePayload[] {
  return Array.from({ length: count }, (_, i) => ({
    slideId: i + 1,
    orderIndex: i,
    title: `Slide ${i + 1}`,
    durationMs,
    transition: null,
    // audioTrack omitted — section 2 adds it as optional
  })) as PresentationSlidePayload[];
}

describe("PlaybackEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial state is IDLE", () => {
    const engine = new PlaybackEngine(makeSlides(3), vi.fn());
    expect(engine.state).toBe(PlaybackState.IDLE);
    expect(engine.currentIndex).toBe(0);
    expect(engine.isPlaying).toBe(false);
    engine.destroy();
  });

  it("play() transitions state from IDLE to PLAYING", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3), onStateChange);
    engine.play();
    expect(engine.state).toBe(PlaybackState.PLAYING);
    expect(engine.isPlaying).toBe(true);
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.PLAYING);
    engine.destroy();
  });

  it("pause() transitions state from PLAYING to PAUSED", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3), onStateChange);
    engine.play();
    engine.pause();
    expect(engine.state).toBe(PlaybackState.PAUSED);
    expect(engine.isPlaying).toBe(false);
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.PAUSED);
    engine.destroy();
  });

  it("goToSlide(n) updates currentIndex to n", () => {
    const engine = new PlaybackEngine(makeSlides(5), vi.fn());
    engine.goToSlide(3);
    expect(engine.currentIndex).toBe(3);
    engine.destroy();
  });

  it("nextSlide() increments currentIndex", () => {
    const engine = new PlaybackEngine(makeSlides(5), vi.fn());
    engine.goToSlide(1);
    engine.nextSlide();
    expect(engine.currentIndex).toBe(2);
    engine.destroy();
  });

  it("prevSlide() decrements currentIndex, clamped to 0", () => {
    const engine = new PlaybackEngine(makeSlides(5), vi.fn());
    engine.prevSlide(); // already at 0
    expect(engine.currentIndex).toBe(0);
    engine.goToSlide(2);
    engine.prevSlide();
    expect(engine.currentIndex).toBe(1);
    engine.destroy();
  });

  it("auto-advance calls onStateChange with SLIDE_TRANSITIONING after slide.durationMs", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    vi.advanceTimersByTime(3000);
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.SLIDE_TRANSITIONING);
    engine.destroy();
  });

  it("auto-advance does not fire when paused", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    engine.pause();
    onStateChange.mockClear();
    vi.advanceTimersByTime(10000);
    expect(onStateChange).not.toHaveBeenCalledWith(PlaybackState.SLIDE_TRANSITIONING);
    engine.destroy();
  });

  it("destroy() clears the auto-advance timer (no late callbacks)", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    engine.destroy();
    onStateChange.mockClear();
    vi.advanceTimersByTime(10000);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("onStateChange callback is invoked on every state transition", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3), onStateChange);
    engine.play();
    engine.pause();
    engine.play();
    engine.goToSlide(1);
    expect(onStateChange.mock.calls.length).toBeGreaterThanOrEqual(3);
    engine.destroy();
  });

  it("after reaching the last slide, state transitions to ENDED", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(2, 1000), onStateChange);
    engine.play();
    vi.advanceTimersByTime(1000); // slide 0 → 1
    vi.advanceTimersByTime(1000); // slide 1 → ENDED
    expect(engine.state).toBe(PlaybackState.ENDED);
    engine.destroy();
  });
});
```

---

## Implementation

### State Machine

The engine transitions through these states:

```
IDLE → PLAYING → PAUSED → PLAYING (resume)
                         → ENDED  (last slide auto-advances)
     → SLIDE_TRANSITIONING (fires briefly during auto-advance, then resolves to PLAYING or ENDED)
```

`LOADING` is reserved for future use (e.g., preloading assets before first play). It is defined in the enum but the engine transitions directly from `IDLE` to `PLAYING` in this implementation.

### Class Stub

```typescript
// /home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts

import type { PresentationSlidePayload } from "@shared/presentation/contracts";

export enum PlaybackState {
  IDLE = "IDLE",
  LOADING = "LOADING",
  PLAYING = "PLAYING",
  PAUSED = "PAUSED",
  SLIDE_TRANSITIONING = "SLIDE_TRANSITIONING",
  ENDED = "ENDED",
}

export class PlaybackEngine {
  private _state: PlaybackState;
  private _currentIndex: number;
  private _slides: PresentationSlidePayload[];
  private _onStateChange: (state: PlaybackState) => void;
  private _timer: ReturnType<typeof setTimeout> | null;
  private _slideStartedAt: number | null;  // Date.now() when current slide started
  private _elapsedAtPause: number;          // ms elapsed on current slide when paused

  constructor(
    slides: PresentationSlidePayload[],
    onStateChange: (state: PlaybackState) => void,
  ) { /* ... */ }

  get state(): PlaybackState { /* ... */ }
  get currentIndex(): number { /* ... */ }
  get isPlaying(): boolean { /* ... */ }

  /** Start or resume playback. No-op if already playing or ENDED. */
  play(): void { /* ... */ }

  /** Pause playback, recording elapsed time on current slide for correct resume. */
  pause(): void { /* ... */ }

  /**
   * Jump to an arbitrary slide index. Clamps to [0, slides.length - 1].
   * If currently playing, resets the auto-advance timer for the new slide.
   */
  goToSlide(index: number): void { /* ... */ }

  /** Advance to the next slide. Clamps at last slide (does not wrap). */
  nextSlide(): void { /* ... */ }

  /** Go to the previous slide. Clamps at slide 0 (does not wrap). */
  prevSlide(): void { /* ... */ }

  /** Clear all timers. Must be called on component unmount to prevent memory leaks. */
  destroy(): void { /* ... */ }

  private _scheduleAdvance(remainingMs: number): void {
    /**
     * Clears any existing timer, then sets a new setTimeout for remainingMs.
     * On fire: transitions to SLIDE_TRANSITIONING, then either PLAYING (next slide)
     * or ENDED (past last slide).
     */
  }

  private _clearTimer(): void { /* ... */ }

  private _setState(next: PlaybackState): void {
    /** Updates _state and fires onStateChange callback. */
  }
}
```

### Timer Management Detail

The engine records `_slideStartedAt = Date.now()` whenever a slide starts fresh (i.e., `goToSlide()` is called or the engine advances past a slide transition). On `pause()`, it computes `_elapsedAtPause = Date.now() - _slideStartedAt` and clears the timer. On `play()` when resuming from `PAUSED`, it calls `_scheduleAdvance(slide.durationMs - _elapsedAtPause)`. On `play()` from `IDLE` or after a slide transition, `_elapsedAtPause` is 0 and the full `durationMs` is used.

When `_scheduleAdvance` fires:
1. `_setState(PlaybackState.SLIDE_TRANSITIONING)` — notify the render layer to apply the transition animation
2. Advance `_currentIndex` by 1
3. If `_currentIndex >= _slides.length`: set `_currentIndex = _slides.length - 1`, `_setState(PlaybackState.ENDED)`, return
4. Otherwise: reset `_elapsedAtPause = 0`, set `_slideStartedAt = Date.now()`, `_setState(PlaybackState.PLAYING)`, call `_scheduleAdvance(slides[_currentIndex].durationMs)`

The `PresentationPlayMode` component uses the `SLIDE_TRANSITIONING` state change to trigger the CSS fade transition. It listens to `onStateChange` and updates its own React state accordingly — the engine itself is not a React component.

### Audio Integration

The engine does not call `AudioTrackPlayer` directly. `PresentationPlayMode` listens to the `onStateChange` callback and bridges to `AudioTrackPlayer` at the React component level:
- When state becomes `SLIDE_TRANSITIONING`: call `audioPlayer.onSlideExit()` on the old index
- When state becomes `PLAYING` (and index changed): call `audioPlayer.onSlideEnter(newSlide.audioTrack)`
- When `pause()` is called: call `audioPlayer.pause()`
- When `play()` is called: call `audioPlayer.resume()`

This keeps `PlaybackEngine` free of audio-related imports and makes it independently testable.

### Export from presentation-canvas Index

After implementing `PlaybackEngine.ts`, export it from the barrel file if it needs to be accessible from outside `presentation-canvas/`. Since `PresentationPlayMode.tsx` is in `pages/`, it will import directly:

```typescript
// In PresentationPlayMode.tsx:
import { PlaybackEngine, PlaybackState } from "@/presentation-canvas/play/PlaybackEngine";
```

No changes to `apps/web/client/src/presentation-canvas/index.ts` are required — internal play-mode utilities need not be re-exported from the public barrel.

---

## Acceptance Criteria

All tests in `PlaybackEngine.test.ts` must pass with `cd apps/web && pnpm test`.

Specific behaviors verified by the test suite:
- Initial state is `IDLE`, `currentIndex` is `0`, `isPlaying` is `false`
- `play()` transitions to `PLAYING` and fires `onStateChange`
- `pause()` transitions to `PAUSED` and fires `onStateChange`
- `goToSlide(n)` sets `currentIndex` without throwing for in-range values
- `nextSlide()` increments, `prevSlide()` decrements and clamps at 0
- Auto-advance fires `SLIDE_TRANSITIONING` after `durationMs` when playing
- Auto-advance does not fire when paused
- `destroy()` prevents any late timer callbacks after the engine is discarded
- Reaching the last slide transitions to `ENDED`
- Every state transition invokes the `onStateChange` callback

---

## Related Sections

- **Section 2** (Shared Contracts): Provides `PresentationSlidePayload` type with `durationMs` field.
- **Section 11** (PresentationPlayMode): Instantiates `PlaybackEngine` inside a `useRef`, calls `play()`/`pause()`/`nextSlide()`/`prevSlide()` from keyboard handlers and control buttons, and calls `engine.destroy()` in the `useEffect` cleanup.
- **Section 13** (AudioTrackPlayer): Companion class. `PlaybackEngine` does not depend on it, but `PresentationPlayMode` coordinates both together.

---

## Implementation Results

**Date:** 2026-02-24
**Tests:** 18/18 passing (1 extra test added for H2 multi-pause accumulation)
**Files created/modified:**
- `apps/web/client/src/presentation-canvas/play/PlaybackEngine.ts` (replaced skeleton with full implementation)
- `apps/web/client/src/presentation-canvas/play/PlaybackEngine.test.ts` (created, 18 tests)
- `apps/web/client/src/pages/PresentationPlayMode.tsx` (audio bridge fix: PLAYING fires onSlideEnter + resume; SLIDE_TRANSITIONING fires only onSlideExit)

**Deviations from plan:**
- `PlaybackState` implemented as string-literal union type + companion const object (not `export enum`). TypeScript string enums don't allow string literal assignment, breaking `useState<PlaybackState>("IDLE")`. The companion const pattern is equivalent at runtime.
- `PresentationSlidePayload` not importable from contracts.ts (type not exported). Used local `interface PlaybackSlide { durationMs?: number }` duck type instead.
- `onStateChange` callback is `(state, currentIndex)` with two args (not one arg as in plan stub). PresentationPlayMode.tsx already uses two args.
- `_elapsedAtPause` uses `+=` accumulation (fixed H2 bug from code review).
- `destroy()` also resets `_state` to IDLE (L3 fix).
- `goToSlide()` resets ENDED→IDLE state so `play()` can restart after `goToSlide(0)`.
- Audio bridge fix in PresentationPlayMode.tsx: `onSlideEnter()` only called on PLAYING (new slide); `onSlideExit()` only called on SLIDE_TRANSITIONING.