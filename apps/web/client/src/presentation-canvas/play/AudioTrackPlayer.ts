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

  constructor(projectAudioTrack: ResolvedProjectAudioTrack | null) {
    if (projectAudioTrack !== null) {
      const audio = new Audio(projectAudioTrack.url);
      audio.volume = projectAudioTrack.volume;
      audio.loop = projectAudioTrack.loop;
      audio.play().catch(() => {});
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
    if (this.slideAudio !== null) {
      this.slideAudio.pause();
      this.slideAudio.currentTime = 0;
      this.slideAudio = null;
    }

    if (slideAudioTrack === null) return;

    const audio = new Audio(slideAudioTrack.url);
    audio.volume = slideAudioTrack.volume;
    audio.currentTime = slideAudioTrack.startAtMs / 1000;
    // TODO: honour slideAudioTrack.endAtMs by scheduling a stop timeout
    audio.play().catch(() => {});
    this.slideAudio = audio;
  }

  /**
   * Called when transitioning out of the current slide.
   * Pauses the per-slide audio immediately and resets currentTime to 0.
   * The project audio is NOT affected by this call.
   * Note: a fade-out UX improvement would require fake-timer support in tests
   * and is deferred to a future enhancement.
   */
  onSlideExit(): void {
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
  }

  /**
   * Cleans up all audio resources. Pauses all elements and nulls out references
   * to allow garbage collection. Called on PresentationPlayMode unmount.
   */
  destroy(): void {
    this.pause();
    this.slideAudio = null;
    this.projectAudio = null;
  }

}
