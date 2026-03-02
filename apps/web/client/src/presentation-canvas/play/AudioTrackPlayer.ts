/**
 * AudioTrackPlayer
 *
 * Manages two independent HTMLAudioElement instances for presentation play mode:
 *  - slideAudio: plays per-slide audio, created fresh on each slide entry
 *  - projectAudio: plays continuously for the full presentation, created once
 *
 * Both elements are created as detached DOM elements via `new Audio(url)`.
 * They are NOT mounted in the React component tree.
 *
 * No React dependencies. No PlaybackEngine dependencies.
 * PresentationPlayMode (section 11) owns both instances and wires them together.
 */

import type { ResolvedAudioTrack, ResolvedProjectAudioTrack } from "@shared/presentation/contracts";

export class AudioTrackPlayer {
  private slideAudio: HTMLAudioElement | null = null;
  private projectAudio: HTMLAudioElement | null = null;
  private slideAudioEndTimer: ReturnType<typeof setTimeout> | null = null;
  private projectAudioEndTimer: ReturnType<typeof setTimeout> | null = null;
  private projectAudioStartAtSec: number = 0;
  private projectAudioRemainingMs: number | null = null;
  private projectAudioTimerStartedAt: number | null = null;

  constructor(projectAudioTrack: ResolvedProjectAudioTrack | null) {
    if (projectAudioTrack !== null) {
      const audio = new Audio(projectAudioTrack.url);
      audio.volume = projectAudioTrack.volume;
      audio.loop = projectAudioTrack.loop;
      this.projectAudioStartAtSec = Math.max(0, (projectAudioTrack.startAtMs ?? 0) / 1000);
      audio.currentTime = this.projectAudioStartAtSec;
      if (projectAudioTrack.endAtMs != null) {
        const playDurationMs = projectAudioTrack.endAtMs - (projectAudioTrack.startAtMs ?? 0);
        if (playDurationMs > 0) {
          this.projectAudioRemainingMs = playDurationMs;
        }
      }
      this.projectAudio = audio;
    }
  }

  /**
   * Called when transitioning into a new slide.
   * If slideAudioTrack is non-null: creates a fresh per-slide audio element,
   * sets src/volume/currentTime, and calls play().
   * If slideAudioTrack is null: does nothing (silence on this slide).
   * If there is existing slide audio still playing, stops it immediately.
   */
  onSlideEnter(slideAudioTrack: ResolvedAudioTrack | null): void {
    // Stop any existing slide audio immediately (no fade — new slide takes priority)
    if (this.slideAudioEndTimer !== null) {
      clearTimeout(this.slideAudioEndTimer);
      this.slideAudioEndTimer = null;
    }
    if (this.slideAudio !== null) {
      this.slideAudio.pause();
      this.slideAudio.currentTime = 0;
      this.slideAudio = null;
    }

    if (slideAudioTrack === null) return;

    const audio = new Audio(slideAudioTrack.url);
    audio.volume = slideAudioTrack.volume;
    audio.currentTime = slideAudioTrack.startAtMs / 1000;
    audio.play().catch(() => {});
    this.slideAudio = audio;

    // Honour endAtMs: stop the clip at the specified offset (relative to audio start)
    if (slideAudioTrack.endAtMs != null) {
      const playDurationMs = slideAudioTrack.endAtMs - slideAudioTrack.startAtMs;
      if (playDurationMs > 0) {
        this.slideAudioEndTimer = setTimeout(() => {
          this.slideAudioEndTimer = null;
          if (this.slideAudio === audio) {
            audio.pause();
            audio.currentTime = 0;
            this.slideAudio = null;
          }
        }, playDurationMs);
      }
    }
  }

  /**
   * Called when transitioning out of the current slide.
   * Pauses the per-slide audio immediately and resets currentTime to 0.
   * The project audio is NOT affected by this call.
   * Note: a fade-out UX improvement would require fake-timer support in tests
   * and is deferred to a future enhancement.
   */
  onSlideExit(): void {
    if (this.slideAudioEndTimer !== null) {
      clearTimeout(this.slideAudioEndTimer);
      this.slideAudioEndTimer = null;
    }
    if (this.slideAudio === null) return;
    const audio = this.slideAudio;
    this.slideAudio = null;
    audio.pause();
    audio.currentTime = 0;
  }

  /**
   * Pauses both the per-slide audio (if active) and the project audio (if active).
   * Called when the engine transitions to PAUSED.
   */
  pause(): void {
    if (this.projectAudioEndTimer !== null) {
      clearTimeout(this.projectAudioEndTimer);
      this.projectAudioEndTimer = null;
      if (this.projectAudioTimerStartedAt !== null && this.projectAudioRemainingMs !== null) {
        const elapsed = Date.now() - this.projectAudioTimerStartedAt;
        this.projectAudioRemainingMs = Math.max(0, this.projectAudioRemainingMs - elapsed);
      }
      this.projectAudioTimerStartedAt = null;
    }
    this.slideAudio?.pause();
    this.projectAudio?.pause();
  }

  /**
   * Resumes both the per-slide audio (if active) and the project audio (if active).
   * Called when the engine transitions back to PLAYING from PAUSED.
   */
  resume(): void {
    this.slideAudio?.play().catch(() => {});
    this.projectAudio?.play().catch(() => {});
    if (
      this.projectAudio !== null
      && this.projectAudioRemainingMs !== null
      && this.projectAudioRemainingMs > 0
      && this.projectAudioEndTimer === null
    ) {
      this.projectAudioTimerStartedAt = Date.now();
      this.projectAudioEndTimer = setTimeout(() => {
        this.projectAudioEndTimer = null;
        this.projectAudioTimerStartedAt = null;
        this.projectAudioRemainingMs = 0;
        if (this.projectAudio) {
          this.projectAudio.pause();
          this.projectAudio.currentTime = this.projectAudioStartAtSec;
        }
      }, this.projectAudioRemainingMs);
    }
  }

  /**
   * Cleans up all audio resources. Pauses all elements and nulls out references
   * to allow garbage collection. Called on PresentationPlayMode unmount.
   */
  destroy(): void {
    if (this.slideAudioEndTimer !== null) {
      clearTimeout(this.slideAudioEndTimer);
      this.slideAudioEndTimer = null;
    }
    if (this.projectAudioEndTimer !== null) {
      clearTimeout(this.projectAudioEndTimer);
      this.projectAudioEndTimer = null;
    }
    this.pause();
    this.slideAudio = null;
    this.projectAudio = null;
    this.projectAudioRemainingMs = null;
    this.projectAudioTimerStartedAt = null;
  }

}
