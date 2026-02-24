/**
 * PlaybackEngine — manages slide advancement, auto-advance timing, and playback state.
 * Full implementation in section-12. This skeleton enables section-11 imports.
 */

export type PlaybackState = "IDLE" | "PLAYING" | "PAUSED" | "SLIDE_TRANSITIONING" | "ENDED";

export type PlaybackStateChangeCallback = (state: PlaybackState, index: number) => void;

export class PlaybackEngine {
  constructor(_slides: unknown[], _onStateChange: PlaybackStateChangeCallback) {}
  play(): void {}
  pause(): void {}
  nextSlide(): void {}
  prevSlide(): void {}
  goToSlide(_index: number): void {}
  destroy(): void {}
}
