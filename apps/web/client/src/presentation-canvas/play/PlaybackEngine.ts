/**
 * PlaybackEngine — pure slide timing / navigation state machine.
 * No React dependencies, no audio management.
 * Lives in presentation-canvas/play/ alongside AudioTrackPlayer.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** String-literal union type used across the codebase. */
export type PlaybackState =
  | "IDLE"
  | "LOADING"
  | "PLAYING"
  | "PAUSED"
  | "SLIDE_TRANSITIONING"
  | "ENDED";

/**
 * Companion const object — provides enum-like named constants while keeping
 * the string literal type for compatibility with React useState and comparisons.
 */
export const PlaybackState = {
  IDLE: "IDLE" as PlaybackState,
  LOADING: "LOADING" as PlaybackState,
  PLAYING: "PLAYING" as PlaybackState,
  PAUSED: "PAUSED" as PlaybackState,
  SLIDE_TRANSITIONING: "SLIDE_TRANSITIONING" as PlaybackState,
  ENDED: "ENDED" as PlaybackState,
} as const;

export type PlaybackStateChangeCallback = (
  state: PlaybackState,
  currentIndex: number,
) => void;

/** Minimal slide shape that PlaybackEngine needs — only durationMs is read. */
interface PlaybackSlide {
  durationMs?: number;
}

const DEFAULT_SLIDE_DURATION_MS = 3000;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class PlaybackEngine {
  private _state: PlaybackState = PlaybackState.IDLE;
  private _currentIndex: number = 0;
  private readonly _slides: PlaybackSlide[];
  private readonly _onStateChange: PlaybackStateChangeCallback;

  /** setTimeout handle for the auto-advance timer. */
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /** Date.now() when the current slide started (after any pause adjustments). */
  private _slideStartedAt: number | null = null;

  /** Milliseconds already elapsed on the current slide when paused. */
  private _elapsedAtPause: number = 0;

  constructor(slides: PlaybackSlide[], onStateChange: PlaybackStateChangeCallback) {
    this._slides = slides;
    this._onStateChange = onStateChange;
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  get state(): PlaybackState {
    return this._state;
  }

  get currentIndex(): number {
    return this._currentIndex;
  }

  get isPlaying(): boolean {
    return this._state === PlaybackState.PLAYING;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start or resume playback.
   * No-op if already PLAYING or if the presentation has ENDED
   * (caller must call goToSlide(0) first to restart).
   */
  play(): void {
    if (this._state === PlaybackState.PLAYING || this._state === PlaybackState.ENDED) return;
    if (this._slides.length === 0) return;

    const slideDuration =
      this._slides[this._currentIndex]?.durationMs ?? DEFAULT_SLIDE_DURATION_MS;
    const remaining =
      this._state === PlaybackState.PAUSED
        ? slideDuration - this._elapsedAtPause
        : slideDuration;

    this._slideStartedAt = Date.now();
    this._setState(PlaybackState.PLAYING);
    this._scheduleAdvance(Math.max(0, remaining));
  }

  /**
   * Pause playback, recording elapsed time so play() resumes from the correct position.
   * No-op if not PLAYING.
   */
  pause(): void {
    if (this._state !== PlaybackState.PLAYING) return;
    if (this._slideStartedAt !== null) {
      // H2: accumulate elapsed across multiple pause/resume cycles on the same slide
      this._elapsedAtPause += Date.now() - this._slideStartedAt;
    }
    this._clearTimer();
    this._setState(PlaybackState.PAUSED);
  }

  /**
   * Jump to an arbitrary slide index (clamped to valid range).
   * If currently PLAYING, resets the auto-advance timer for the new slide.
   * Fires the onStateChange callback with the current state (useful for UI re-render).
   */
  goToSlide(index: number): void {
    if (this._slides.length === 0) return;
    const clamped = Math.max(0, Math.min(index, this._slides.length - 1));
    this._currentIndex = clamped;
    this._elapsedAtPause = 0;
    this._slideStartedAt = null;

    // Navigating away from ENDED resets so play() can restart
    if (this._state === PlaybackState.ENDED) {
      this._state = PlaybackState.IDLE;
    }

    if (this._state === PlaybackState.PLAYING) {
      this._clearTimer();
      this._slideStartedAt = Date.now();
      this._scheduleAdvance(
        this._slides[this._currentIndex]?.durationMs ?? DEFAULT_SLIDE_DURATION_MS,
      );
    }

    // Notify render layer that the index (and possibly state) has changed
    this._onStateChange(this._state, this._currentIndex);
  }

  /** Advance to the next slide (clamps at last slide). */
  nextSlide(): void {
    this.goToSlide(this._currentIndex + 1);
  }

  /** Go to the previous slide (clamps at slide 0). */
  prevSlide(): void {
    this.goToSlide(this._currentIndex - 1);
  }

  /** Release the auto-advance timer. Must be called on component unmount. */
  destroy(): void {
    this._clearTimer();
    // L3: prevent any post-destroy onStateChange from being meaningful
    this._state = PlaybackState.IDLE;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _scheduleAdvance(remainingMs: number): void {
    this._clearTimer();
    this._timer = setTimeout(() => {
      this._timer = null;

      // 1. Notify render layer to begin slide exit animation (old index still current)
      this._setState(PlaybackState.SLIDE_TRANSITIONING);

      // 2. Advance to the next slide
      this._currentIndex += 1;

      // 3. Past the last slide → ENDED
      if (this._currentIndex >= this._slides.length) {
        this._currentIndex = this._slides.length - 1;
        this._setState(PlaybackState.ENDED);
        return;
      }

      // 4. Enter the new slide and continue auto-advance
      this._elapsedAtPause = 0;
      this._slideStartedAt = Date.now();
      this._setState(PlaybackState.PLAYING);
      this._scheduleAdvance(
        this._slides[this._currentIndex]?.durationMs ?? DEFAULT_SLIDE_DURATION_MS,
      );
    }, remainingMs);
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _setState(next: PlaybackState): void {
    this._state = next;
    this._onStateChange(next, this._currentIndex);
  }
}
