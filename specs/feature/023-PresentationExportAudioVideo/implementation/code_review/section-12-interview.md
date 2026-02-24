# Section-12 Code Review Interview Transcript

**Date:** 2026-02-24
**Section:** section-12-playback-engine
**Verdict after fixes:** APPROVED

---

## Auto-Fixes Applied (No User Input Required)

### H2: `_elapsedAtPause` accumulation bug across multiple pause/resume cycles (auto-fix)

- **Root cause**: `pause()` used `=` instead of `+=` when recording elapsed time. On second pause, the accumulated elapsed from the first pause cycle was discarded.
- **Fix**: Changed `this._elapsedAtPause = Date.now() - this._slideStartedAt` to `this._elapsedAtPause += Date.now() - this._slideStartedAt`.
- **Test added**: "H2: accumulated elapsed time across multiple pause/resume cycles" — verifies that pausing twice (1s + 0.5s = 1.5s total) leaves 1.5s remaining on a 3s slide.

### L3: `destroy()` does not reset engine state (auto-fix)

- Added `this._state = PlaybackState.IDLE` to `destroy()` body.
- Prevents any post-destroy `onStateChange` callbacks (e.g., from hot-reload or StrictMode double-effect) from appearing as valid state.

---

## Items Noted But Not Fixed

### H1: `onSlideEnter()` called on every PLAYING transition, including manual resume (deferred to section-13)

- When the user manually resumes from pause, the PLAYING callback in PresentationPlayMode.tsx calls both `onSlideEnter()` and `resume()`. On manual resume, the slide index hasn't changed, so `onSlideEnter()` with the same audio track is redundant.
- **Rationale for deferral**: `AudioTrackPlayer.onSlideEnter()` (section-13) is designed to detect same-track calls and not restart the track. The spec says AudioTrackPlayer owns this logic. Fixing this in PresentationPlayMode.tsx would require tracking the previous index in the callback, which is complex due to React closure staleness. Section-13 will implement idempotent `onSlideEnter()` behavior.

### M1: `goToSlide()` during `SLIDE_TRANSITIONING` state (dismissed — not feasible)

- If `goToSlide()` were called while state is `SLIDE_TRANSITIONING`, no timer would be rescheduled (the PLAYING guard check fails).
- **Rationale for dismissal**: JavaScript's event loop is single-threaded. The `_scheduleAdvance` setTimeout callback executes atomically — it sets SLIDE_TRANSITIONING, increments the index, then sets PLAYING synchronously. No user event handler can fire between these. The only way to trigger this race would be if `onStateChange` synchronously called `goToSlide()`, which PresentationPlayMode.tsx does not do (it only calls `setState`, which is async).

### M2: Plan specified `export enum PlaybackState`, implementation uses dual type+const (intentional deviation)

- TypeScript string enums (`enum Foo { BAR = "BAR" }`) are not assignable from string literals (`"BAR"` is not assignable to `Foo`), which would break `useState<PlaybackState>("IDLE")` and all string comparisons across the codebase.
- The companion const object pattern (`type PlaybackState = "IDLE" | ...` + `const PlaybackState = { IDLE: "IDLE" as PlaybackState, ... }`) provides identical runtime behavior without enum pitfalls.
- Deviation is intentional and improves type compatibility.

### M3: Duck type `PlaybackSlide` instead of `PresentationSlidePayload` (accepted)

- The contracts.ts file does NOT export a standalone `PresentationSlidePayload` type. The actual type is `PresentationSlideshowPayload['slides'][number]`, which requires an import from a file that may not be accessible from within `presentation-canvas/`.
- The local `interface PlaybackSlide { durationMs?: number }` is structurally compatible with the real slide type and correctly limits the engine's dependencies to only what it needs.

---

## Final Test Count

- **18 tests** in `apps/web/client/src/presentation-canvas/play/PlaybackEngine.test.ts`
- **18/18 passing**
- Tests cover: IDLE initial state, play→PLAYING, pause→PAUSED, pause no-op on non-PLAYING, goToSlide clamp, nextSlide, prevSlide clamp, auto-advance SLIDE_TRANSITIONING, auto-advance→PLAYING on next slide, pause stops timer, destroy clears timer, ENDED on last slide, play no-op after ENDED, goToSlide resets ENDED→IDLE, goToSlide resets timer while PLAYING, resume uses remaining time, H2 multi-pause accumulation.
- PresentationPlayMode tests: 12/12 still passing after audio fix (PLAYING handler now correctly calls onSlideEnter for new slide).
