import type { SmartSpecProjectDraft, NleClip } from "../../types/nleProject";
import type { EpisodeSoundPlan, SFXEvent } from "../../types/audioScoring";
import { AudioScoringError } from "./smartAiHubSkillClient";

const SCORE_CLIP_PREFIX = "smartspec-score:";
const SCORE_SFX_PREFIX = "smartspec-score-sfx:";

/**
 * Applies only the current plan's owned score clips. Manual A2/A3 clips are
 * retained, and every selected generated artifact is validated before tracks
 * are changed. Reapplying the same plan replaces its own clips idempotently.
 */
export function applySoundPlanToProjectTimeline(options: {
  project: SmartSpecProjectDraft;
  soundPlan: EpisodeSoundPlan;
  generatedCues: Array<{
    cueId: string;
    audioPath: string;
    durationSeconds: number;
    outputSha256: string;
    measuredLufs: number;
    truePeakDb: number;
  }>;
  sfxEvents?: SFXEvent[];
}): SmartSpecProjectDraft {
  const { project, soundPlan, generatedCues, sfxEvents = [] } = options;
  const generatedByCue = new Map(generatedCues.map((cue) => [cue.cueId, cue]));

  const bgmClips: NleClip[] = soundPlan.cues.map((cue) => {
    const generated = generatedByCue.get(cue.cueId);
    if (!generated?.audioPath || !generated.outputSha256 || !Number.isFinite(generated.durationSeconds)) {
      throw new AudioScoringError("GENERATION_OUTCOME_UNKNOWN", `Cue ${cue.cueId} has no verifiable audio artifact.`);
    }
    return {
      id: `${SCORE_CLIP_PREFIX}${soundPlan.planId}:${cue.cueId}`,
      name: `Score: ${cue.displayCaption}`,
      timelineStartMs: cue.timelineStartMs,
      durationMs: Math.round(generated.durationSeconds * 1000),
      sourceType: "local_file",
      sourcePath: generated.audioPath,
      volume: 0.35,
      fadeInMs: cue.fadeInMs,
      fadeOutMs: cue.fadeOutMs,
    };
  });

  const validSfxClips: NleClip[] = sfxEvents
    .filter((event) => Boolean(event.audioFilePath))
    .map((event) => ({
      id: `${SCORE_SFX_PREFIX}${soundPlan.planId}:${event.sfxId}`,
      name: `SFX: ${event.description.slice(0, 24)}`,
      timelineStartMs: event.timelineMs,
      durationMs: event.durationMs,
      sourceType: "local_file",
      sourcePath: event.audioFilePath,
      volume: event.volume,
      fadeInMs: 50,
      fadeOutMs: 150,
    }));

  const ducking = {
    enabled: true,
    sidechainSourceTrackId: "track_a1",
    attenuationDb: -12.0,
    thresholdDb: -28.0,
    attackMs: 50,
    releaseMs: 300,
    holdMs: 100,
  };
  let hasA2 = false;
  let hasA3 = false;

  const updatedTracks = project.tracks.map((track) => {
    if (track.id === "track_a2") {
      hasA2 = true;
      return {
        ...track,
        ducking,
        clips: [...track.clips.filter((clip) => !clip.id.startsWith(SCORE_CLIP_PREFIX)), ...bgmClips],
      };
    }
    if (track.id === "track_a3") {
      hasA3 = true;
      return {
        ...track,
        clips: [...track.clips.filter((clip) => !clip.id.startsWith(SCORE_SFX_PREFIX)), ...validSfxClips],
      };
    }
    return track;
  });

  if (!hasA2) {
    updatedTracks.push({
      id: "track_a2",
      name: "BGM (Audio Track 2)",
      type: "audio_music",
      volume: 0.35,
      muted: false,
      locked: false,
      ducking,
      clips: bgmClips,
    });
  }
  if (!hasA3 && validSfxClips.length > 0) {
    updatedTracks.push({
      id: "track_a3",
      name: "SFX (Audio Track 3)",
      type: "audio_sfx",
      volume: 0.8,
      muted: false,
      locked: false,
      clips: validSfxClips,
    });
  }

  return { ...project, updatedAt: new Date().toISOString(), tracks: updatedTracks };
}
