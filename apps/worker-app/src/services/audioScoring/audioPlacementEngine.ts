import type { SmartSpecProjectDraft, NleClip } from "../../types/nleProject";
import type { EpisodeSoundPlan, SFXEvent } from "../../types/audioScoring";

/**
 * Audio Placement Engine
 * Maps EpisodeSoundPlan cues and SFX events into NLE timeline tracks (A2 and A3)
 * with precise timecode offsets and ducking envelope sidechains.
 */
export function applySoundPlanToProjectTimeline(options: {
  project: SmartSpecProjectDraft;
  soundPlan: EpisodeSoundPlan;
  generatedCues: Array<{
    cueId: string;
    audioPath: string;
    durationSeconds: number;
  }>;
  sfxEvents?: SFXEvent[];
}): SmartSpecProjectDraft {
  const { project, soundPlan, generatedCues, sfxEvents = [] } = options;

  // 1. Map Music Cues to Track A2
  const bgmClips: NleClip[] = soundPlan.cues.map((cue, idx) => {
    const gen = generatedCues.find((g) => g.cueId === cue.cueId);
    return {
      id: `bgm_clip_${idx + 1}`,
      name: `BGM: ${cue.placement.replace("_", " ").toUpperCase()}`,
      timelineStartMs: cue.timelineStartMs,
      durationMs: cue.timelineDurationMs,
      sourceType: "local_file",
      sourcePath: gen?.audioPath || cue.audioFilePath || "",
      volume: 0.35,
      fadeInMs: cue.fadeInMs,
      fadeOutMs: cue.fadeOutMs,
    };
  });

  // 2. Map SFX Events to Track A3
  const sfxClips: NleClip[] = sfxEvents.map((sfx, idx) => ({
    id: `sfx_clip_${idx + 1}`,
    name: `SFX: ${sfx.description.slice(0, 24)}`,
    timelineStartMs: sfx.timelineMs,
    durationMs: sfx.durationMs,
    sourceType: "local_file",
    sourcePath: sfx.audioFilePath || "",
    volume: sfx.volume,
    fadeInMs: 50,
    fadeOutMs: 150,
  }));

  // 3. Insert or update tracks in Project Draft
  const updatedTracks = project.tracks.map((track) => {
    if (track.id === "track_a2") {
      return {
        ...track,
        ducking: {
          enabled: true,
          sidechainSourceTrackId: "track_a1",
          attenuationDb: -16.0,
          thresholdDb: -28.0,
          attackMs: 40,
          releaseMs: 350,
        },
        clips: bgmClips,
      };
    }
    if (track.id === "track_a3") {
      return {
        ...track,
        clips: sfxClips,
      };
    }
    return track;
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    tracks: updatedTracks,
  };
}
