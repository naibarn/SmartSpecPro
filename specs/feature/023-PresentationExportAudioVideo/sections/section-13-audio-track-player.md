Now I have all the information needed to write the section content for `section-13-audio-track-player`.

# Section 13: Audio Track Player

## Overview

This section implements `AudioTrackPlayer`, a TypeScript class that manages playback of two independent audio streams during presentation play mode: per-slide audio (changes on each slide transition) and project-wide background audio (plays continuously for the entire presentation). This is a pure TypeScript module with no React or DOM dependencies beyond the browser's `Audio` constructor.

**Position in batch:** This section is in Batch 5 and has no dependencies on any other section. It can be implemented in parallel with sections 07, 08, 09, and 12. It is a prerequisite for section 11 (PresentationPlayMode page).

**Depends on (for types only):**
- Section 02 (shared contracts) — provides `ResolvedAudioTrack` and `ResolvedProjectAudioTrack` type shapes. You can use plain TypeScript interfaces in this file if section 02 is not yet complete; reconcile the type imports once section 02 lands.

---

## File to Create

**`/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts`**

This is a new file in a new directory. The `play/` subdirectory does not yet exist; create it alongside `PlaybackEngine.ts` (section 12).

**Test file to create:**

**`/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.test.ts`**

---

## Tests First

Write these tests before implementing the class. The test file uses Vitest. Because JSDOM (the Vitest test environment) does not implement the `Audio` constructor, you must mock it with `vi.fn()`.

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioTrackPlayer } from "./AudioTrackPlayer";

// Mock the Audio constructor — JSDOM does not implement HTMLAudioElement.
const mockAudioInstance = {
  src: "",
  volume: 1,
  loop: false,
  currentTime: 0,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
};
const MockAudio = vi.fn(() => mockAudioInstance);

describe("AudioTrackPlayer", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", MockAudio);
    vi.clearAllMocks();
    // Reset mock instance state between tests
    mockAudioInstance.src = "";
    mockAudioInstance.volume = 1;
    mockAudioInstance.loop = false;
    mockAudioInstance.currentTime = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- onSlideEnter ---

  it("onSlideEnter(null) does not create an audio element", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter(null);
    // Audio was never constructed for per-slide track
    expect(MockAudio).not.toHaveBeenCalled();
    player.destroy();
  });

  it("onSlideEnter(track) creates audio element with correct src and volume", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 0.7, startAtMs: 0 });
    expect(MockAudio).toHaveBeenCalledWith("https://cdn.example.com/audio.mp3");
    expect(mockAudioInstance.volume).toBe(0.7);
    player.destroy();
  });

  it("onSlideEnter(track) calls audio.play()", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 0.8, startAtMs: 0 });
    expect(mockAudioInstance.play).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("onSlideEnter(track) sets currentTime to startAtMs / 1000", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 1.0, startAtMs: 3000 });
    expect(mockAudioInstance.currentTime).toBe(3);
    player.destroy();
  });

  // --- onSlideExit ---

  it("onSlideExit() calls audio.pause() on the per-slide audio element", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 1.0, startAtMs: 0 });
    player.onSlideExit();
    expect(mockAudioInstance.pause).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("onSlideExit() resets per-slide audio currentTime to 0", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 1.0, startAtMs: 0 });
    mockAudioInstance.currentTime = 5; // simulate mid-play
    player.onSlideExit();
    expect(mockAudioInstance.currentTime).toBe(0);
    player.destroy();
  });

  it("onSlideExit() is a no-op when no per-slide audio was started", () => {
    const player = new AudioTrackPlayer(null);
    // Should not throw
    expect(() => player.onSlideExit()).not.toThrow();
    player.destroy();
  });

  // --- project-wide audio ---

  it("project audio with loop: true sets audio.loop = true", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.4,
      loop: true,
      fadeOutMs: null,
    });
    expect(MockAudio).toHaveBeenCalledWith("https://cdn.example.com/bg.mp3");
    expect(mockAudioInstance.loop).toBe(true);
    player.destroy();
  });

  it("project audio with loop: false does not set audio.loop = true", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.4,
      loop: false,
      fadeOutMs: null,
    });
    expect(mockAudioInstance.loop).toBe(false);
    player.destroy();
  });

  it("project audio volume is set from projectAudioTrack.volume", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.3,
      loop: true,
      fadeOutMs: null,
    });
    expect(mockAudioInstance.volume).toBe(0.3);
    player.destroy();
  });

  // --- pause / resume ---

  it("pause() pauses both per-slide and project audio elements", () => {
    // Use separate mock instances for per-slide vs project audio
    const projectAudioMock = { src: "", volume: 0.5, loop: true, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    const slideAudioMock = { src: "", volume: 1.0, loop: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    let callCount = 0;
    MockAudio.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? projectAudioMock : slideAudioMock;
    });

    const player = new AudioTrackPlayer({ url: "https://cdn.example.com/bg.mp3", volume: 0.5, loop: true, fadeOutMs: null });
    player.onSlideEnter({ url: "https://cdn.example.com/slide.mp3", volume: 1.0, startAtMs: 0 });
    player.pause();

    expect(projectAudioMock.pause).toHaveBeenCalledOnce();
    expect(slideAudioMock.pause).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("resume() calls play() on both per-slide and project audio elements", () => {
    const projectAudioMock = { src: "", volume: 0.5, loop: true, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    const slideAudioMock = { src: "", volume: 1.0, loop: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    let callCount = 0;
    MockAudio.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? projectAudioMock : slideAudioMock;
    });

    const player = new AudioTrackPlayer({ url: "https://cdn.example.com/bg.mp3", volume: 0.5, loop: true, fadeOutMs: null });
    player.onSlideEnter({ url: "https://cdn.example.com/slide.mp3", volume: 1.0, startAtMs: 0 });
    player.pause();
    // Clear play call count from initial play()
    projectAudioMock.play.mockClear();
    slideAudioMock.play.mockClear();
    player.resume();

    expect(projectAudioMock.play).toHaveBeenCalledOnce();
    expect(slideAudioMock.play).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("resume() is a no-op when no audio is active", () => {
    const player = new AudioTrackPlayer(null);
    expect(() => player.resume()).not.toThrow();
    player.destroy();
  });

  // --- destroy ---

  it("destroy() pauses all audio elements as cleanup", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.5,
      loop: true,
      fadeOutMs: null,
    });
    player.destroy();
    expect(mockAudioInstance.pause).toHaveBeenCalled();
  });
});
```

---

## Types

The class depends on these type shapes (defined in section 02's `apps/web/shared/presentation/contracts.ts`). Until section 02 is merged, declare them as local interfaces in the file and swap to imports once available:

```typescript
// These will be imported from "@shared/presentation/contracts" once section 02 lands:
interface ResolvedAudioTrack {
  url: string;
  volume: number;    // 0.0 – 1.0
  startAtMs: number; // default 0
  endAtMs?: number | null;
}

interface ResolvedProjectAudioTrack {
  url: string;
  volume: number;    // 0.0 – 1.0
  loop: boolean;
  fadeOutMs: number | null;
}
```

---

## Implementation Details

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts`

### Class Shape

```typescript
/**
 * AudioTrackPlayer
 *
 * Manages two independent HTMLAudioElement instances for presentation play mode:
 *  - slideAudio: plays per-slide audio, created/reused on each slide entry
 *  - projectAudio: plays continuously for the full presentation, created once
 *
 * Both elements are created as detached DOM elements via `new Audio(url)`.
 * They are NOT mounted in the React component tree.
 */
export class AudioTrackPlayer {
  private slideAudio: HTMLAudioElement | null = null;
  private projectAudio: HTMLAudioElement | null = null;

  constructor(projectAudioTrack: ResolvedProjectAudioTrack | null) {
    /**
     * If a project audio track is provided, create the HTMLAudioElement immediately
     * and begin playing. The project audio runs continuously for the full presentation
     * lifecycle — it is not tied to individual slide transitions.
     */
  }

  /**
   * Called by PlaybackEngine when transitioning into a new slide.
   * If slideAudioTrack is non-null: creates or reuses the per-slide audio element,
   * sets src/volume/currentTime, and calls play().
   * If slideAudioTrack is null: does nothing (silence on this slide).
   */
  onSlideEnter(slideAudioTrack: ResolvedAudioTrack | null): void {}

  /**
   * Called by PlaybackEngine when transitioning out of the current slide.
   * Pauses the per-slide audio element and resets currentTime to 0.
   * Applies a 0.5-second linear fade-out before pausing if audio is mid-play.
   * The project audio is NOT affected by this call.
   */
  onSlideExit(): void {}

  /**
   * Pauses both the per-slide audio element (if active) and the project audio element.
   * Called when the user presses pause or the playback engine transitions to PAUSED.
   */
  pause(): void {}

  /**
   * Resumes both the per-slide audio element (if active) and the project audio element.
   * Called when the user presses play after a pause.
   */
  resume(): void {}

  /**
   * Cleans up all audio resources. Pauses all elements. Called when the
   * PresentationPlayMode component unmounts or the presentation ends.
   */
  destroy(): void {}
}
```

### Behavioral Requirements

**Per-slide audio (`slideAudio`):**

- `onSlideEnter(track)`: Construct `new Audio(track.url)`. Set `audio.volume = track.volume`. Set `audio.currentTime = track.startAtMs / 1000`. Call `audio.play()`. The returned Promise may be ignored (autoplay may be blocked by browser policy — suppress the rejection silently with `.catch(() => {})`).
- `onSlideExit()`: If `slideAudio` is non-null, call `audio.pause()` and set `audio.currentTime = 0`. The 0.5-second fade-out is implemented as a simple linear ramp using `setTimeout` intervals that decrease `audio.volume` by `0.1` every 50ms before calling `pause()`. This is a best-effort visual polish — if the slide transition is faster than 500ms, the audio can be paused immediately without completing the fade.
- The same `HTMLAudioElement` instance can be reused across slides (set `src` to the new URL each time) or a fresh instance can be created each time. Fresh instances are simpler and avoid stale state.

**Project-wide audio (`projectAudio`):**

- Created once in the constructor if `projectAudioTrack` is non-null.
- `new Audio(projectAudioTrack.url)` — sets `volume` and `loop` immediately after construction.
- Calls `audio.play()` immediately in the constructor (suppress rejection with `.catch(() => {})`).
- `audio.loop = projectAudioTrack.loop` — when `true`, the browser will loop the audio automatically without any additional code.
- `projectAudio` is not affected by `onSlideEnter` or `onSlideExit` calls.

**`pause()` / `resume()`:**

- `pause()` calls `audio.pause()` on `slideAudio` (if non-null) and `projectAudio` (if non-null).
- `resume()` calls `audio.play()` on both (if non-null). Suppress rejection with `.catch(() => {})`.

**`destroy()`:**

- Calls `pause()` to stop all audio.
- Nulls out both references to allow garbage collection: `this.slideAudio = null; this.projectAudio = null`.

### Fade-Out Implementation

The 0.5-second fade-out on slide exit is a progressive volume reduction before calling `pause()`. A simple implementation using `setInterval`:

```typescript
// Docstring only — stub in implementation:
private fadeOutAndPause(audio: HTMLAudioElement): void {
  /**
   * Reduces audio.volume from its current value to 0 over 500ms (10 steps × 50ms),
   * then calls audio.pause() and resets volume to 1 for reuse.
   * If audio is already at volume 0, calls pause() immediately.
   */
}
```

This method is used inside `onSlideExit()` for the per-slide audio element. If no fade-out is desired (e.g., `slideAudioTrack.endAtMs` was reached), `onSlideExit()` can bypass the fade and call `pause()` directly.

---

## Integration with PlaybackEngine

`AudioTrackPlayer` is designed to be driven by `PlaybackEngine` (section 12). The play mode page (`PresentationPlayMode.tsx`, section 11) owns both instances and wires them together:

```typescript
// How section 11 (PresentationPlayMode) will use both classes:
const audioPlayer = new AudioTrackPlayer(deck.projectAudioTrack ?? null);
const engine = new PlaybackEngine(slides, (state) => {
  if (state === "SLIDE_TRANSITIONING") {
    audioPlayer.onSlideExit();
    audioPlayer.onSlideEnter(slides[engine.currentIndex].audioTrack ?? null);
  }
  if (state === "PAUSED") audioPlayer.pause();
  if (state === "PLAYING") audioPlayer.resume();
  if (state === "ENDED") audioPlayer.pause();
});

// On component unmount:
engine.destroy();
audioPlayer.destroy();
```

Do NOT implement this wiring in the `AudioTrackPlayer` itself — it belongs in the play mode page.

---

## Edge Cases to Handle

| Scenario | Expected Behavior |
|---|---|
| `onSlideEnter()` called before previous `onSlideExit()` | Immediately pause the previous slide audio (no fade) and start the new one |
| `audio.play()` rejected (browser autoplay policy) | Catch the Promise rejection silently — do not throw or log errors in production |
| `onSlideExit()` called when `slideAudio` is null | No-op, no error |
| `pause()` called when no audio is active | No-op, no error |
| `resume()` called when no audio is active | No-op, no error |
| Project audio track with `fadeOutMs` set | Reserved for future implementation; `fadeOutMs` is stored but not yet acted upon in this section |

---

## File System Summary

| Action | File Path |
|---|---|
| Create (new dir + file) | `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts` |
| Create (test file) | `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.test.ts` |

The `play/` directory is also where `PlaybackEngine.ts` (section 12) lives. Both files should be created together.

---

## Verification

Run the test suite after implementation:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
```

All tests in `AudioTrackPlayer.test.ts` must pass. No existing tests should regress.

---

## Implementation Results

**Date:** 2026-02-24
**Tests:** 15/15 passing (1 extra test added for M3 double-onSlideEnter edge case)
**Files created/modified:**
- `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.ts` (replaced skeleton with full implementation)
- `apps/web/client/src/presentation-canvas/play/AudioTrackPlayer.test.ts` (created, 15 tests)

**Deviations from plan:**
- Fade-out in `onSlideExit()` not implemented: The spec tests require immediate synchronous `pause()` with no fake timers, making an async setInterval fade incompatible. Spec's "best-effort" language supports this. A TODO comment marks it for future enhancement.
- Test `beforeEach` adds `MockAudio.mockImplementation(() => mockAudioInstance)` after `vi.clearAllMocks()` to reset stale implementations from tests 11/12 (which use `MockAudio.mockImplementation(...)` and persist across tests since `vi.clearAllMocks()` only clears call history).
- `destroy()` delegates to `this.pause()` (H2 fix from code review).
- Added TODO comment for `endAtMs` (M4 fix).
- Added test for double-`onSlideEnter` edge case (M3 fix).