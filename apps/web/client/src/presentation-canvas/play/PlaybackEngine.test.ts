import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackEngine, PlaybackState } from "./PlaybackEngine";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSlides(count: number, durationMs = 3000) {
  return Array.from({ length: count }, (_, i) => ({
    slideId: i + 1,
    orderIndex: i,
    title: `Slide ${i + 1}`,
    durationMs,
    transition: "cut" as const,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PlaybackEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("initial state is IDLE with currentIndex 0 and isPlaying false", () => {
    const engine = new PlaybackEngine(makeSlides(3), vi.fn());
    expect(engine.state).toBe(PlaybackState.IDLE);
    expect(engine.currentIndex).toBe(0);
    expect(engine.isPlaying).toBe(false);
    engine.destroy();
  });

  it("play() transitions from IDLE to PLAYING and fires onStateChange", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3), onStateChange);
    engine.play();
    expect(engine.state).toBe(PlaybackState.PLAYING);
    expect(engine.isPlaying).toBe(true);
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.PLAYING, 0);
    engine.destroy();
  });

  it("pause() transitions from PLAYING to PAUSED and fires onStateChange", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3), onStateChange);
    engine.play();
    engine.pause();
    expect(engine.state).toBe(PlaybackState.PAUSED);
    expect(engine.isPlaying).toBe(false);
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.PAUSED, 0);
    engine.destroy();
  });

  it("pause() is a no-op when not PLAYING", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3), onStateChange);
    engine.pause(); // IDLE → no-op
    expect(engine.state).toBe(PlaybackState.IDLE);
    expect(onStateChange).not.toHaveBeenCalled();
    engine.destroy();
  });

  it("goToSlide(n) updates currentIndex to n", () => {
    const engine = new PlaybackEngine(makeSlides(5), vi.fn());
    engine.goToSlide(3);
    expect(engine.currentIndex).toBe(3);
    engine.destroy();
  });

  it("goToSlide() clamps to valid range (no out-of-bounds)", () => {
    const engine = new PlaybackEngine(makeSlides(5), vi.fn());
    engine.goToSlide(100);
    expect(engine.currentIndex).toBe(4); // clamped to last index
    engine.goToSlide(-5);
    expect(engine.currentIndex).toBe(0); // clamped to 0
    engine.destroy();
  });

  it("nextSlide() increments currentIndex", () => {
    const engine = new PlaybackEngine(makeSlides(5), vi.fn());
    engine.goToSlide(1);
    engine.nextSlide();
    expect(engine.currentIndex).toBe(2);
    engine.destroy();
  });

  it("prevSlide() decrements currentIndex and clamps to 0", () => {
    const engine = new PlaybackEngine(makeSlides(5), vi.fn());
    engine.prevSlide(); // already at 0
    expect(engine.currentIndex).toBe(0);
    engine.goToSlide(2);
    engine.prevSlide();
    expect(engine.currentIndex).toBe(1);
    engine.destroy();
  });

  it("auto-advance fires SLIDE_TRANSITIONING after slide.durationMs when PLAYING", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    onStateChange.mockClear();
    vi.advanceTimersByTime(3000);
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.SLIDE_TRANSITIONING, 0);
    engine.destroy();
  });

  it("auto-advance then moves to PLAYING on the next slide", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    vi.advanceTimersByTime(3000);
    expect(engine.currentIndex).toBe(1);
    expect(engine.state).toBe(PlaybackState.PLAYING);
    engine.destroy();
  });

  it("auto-advance does not fire when paused", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    engine.pause();
    onStateChange.mockClear();
    vi.advanceTimersByTime(10_000);
    expect(onStateChange).not.toHaveBeenCalledWith(
      PlaybackState.SLIDE_TRANSITIONING,
      expect.any(Number),
    );
    engine.destroy();
  });

  it("destroy() clears the auto-advance timer (no late callbacks)", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    engine.destroy();
    onStateChange.mockClear();
    vi.advanceTimersByTime(10_000);
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

  it("reaching the last slide transitions to ENDED", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(2, 1000), onStateChange);
    engine.play();
    vi.advanceTimersByTime(1000); // slide 0 → SLIDE_TRANSITIONING → slide 1 PLAYING
    vi.advanceTimersByTime(1000); // slide 1 → SLIDE_TRANSITIONING → ENDED
    expect(engine.state).toBe(PlaybackState.ENDED);
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.ENDED, expect.any(Number));
    engine.destroy();
  });

  it("play() after ENDED is a no-op (goToSlide first required)", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(1, 500), onStateChange);
    engine.play();
    vi.advanceTimersByTime(500); // → ENDED
    onStateChange.mockClear();
    engine.play(); // should be no-op
    expect(engine.state).toBe(PlaybackState.ENDED);
    expect(onStateChange).not.toHaveBeenCalled();
    // After goToSlide(0), play() resumes
    engine.goToSlide(0);
    engine.play();
    expect(engine.state).toBe(PlaybackState.PLAYING);
    engine.destroy();
  });

  it("goToSlide while PLAYING resets timer for new slide duration", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    vi.advanceTimersByTime(1500); // halfway through slide 0
    engine.goToSlide(2); // jump to slide 2
    expect(engine.currentIndex).toBe(2);
    onStateChange.mockClear();
    vi.advanceTimersByTime(2999); // should NOT have advanced yet
    expect(engine.state).toBe(PlaybackState.PLAYING);
    vi.advanceTimersByTime(1); // now 3000ms since goToSlide(2)
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.SLIDE_TRANSITIONING, 2);
    engine.destroy();
  });

  it("resume after pause uses remaining time (not full duration)", () => {
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    vi.advanceTimersByTime(1000); // 1s elapsed
    engine.pause();
    engine.play(); // resume — 2s remaining
    onStateChange.mockClear();
    vi.advanceTimersByTime(1999); // should NOT have transitioned yet
    expect(engine.state).toBe(PlaybackState.PLAYING);
    vi.advanceTimersByTime(1); // now 2000ms since resume
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.SLIDE_TRANSITIONING, 0);
    engine.destroy();
  });

  it("H2: accumulated elapsed time across multiple pause/resume cycles", () => {
    // 3s slide: pause at 1s, resume, pause at 0.5s → 1.5s total elapsed → 1.5s remaining
    const onStateChange = vi.fn();
    const engine = new PlaybackEngine(makeSlides(3, 3000), onStateChange);
    engine.play();
    vi.advanceTimersByTime(1000); // first 1s
    engine.pause(); // elapsedAtPause = 1s
    engine.play(); // 2s remaining
    vi.advanceTimersByTime(500); // another 0.5s
    engine.pause(); // elapsedAtPause = 1.5s accumulated
    engine.play(); // 1.5s remaining
    onStateChange.mockClear();
    vi.advanceTimersByTime(1499); // should NOT have transitioned yet
    expect(engine.state).toBe(PlaybackState.PLAYING);
    vi.advanceTimersByTime(1); // now 1.5s since last resume → transition
    expect(onStateChange).toHaveBeenCalledWith(PlaybackState.SLIDE_TRANSITIONING, 0);
    engine.destroy();
  });
});
