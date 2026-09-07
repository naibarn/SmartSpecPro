import type {
  ApprovedPlanAuthority,
  EpisodeSoundPlan,
  MusicCue,
  SFXEvent,
} from "../../types/audioScoring";

/**
 * Converts an already approved Web plan to the Worker wire shape.
 * Cue grouping, emotion, captions and musical direction are intentionally not
 * calculated here; those decisions belong to the Feature 176 skill.
 */
export function segmentEpisodeSoundPlan(options: {
  episodeId: string;
  seriesId: string;
  totalDurationMs: number;
  approvedCues: MusicCue[];
  authority: ApprovedPlanAuthority;
  overallMood: string;
  intensityCurve?: EpisodeSoundPlan["intensityCurve"];
  sfxEvents?: SFXEvent[];
}): EpisodeSoundPlan {
  const { approvedCues, totalDurationMs } = options;
  if (approvedCues.some((cue) => !cue.displayCaption || !cue.modelInstruction)) {
    throw new Error("SKILL_UNAVAILABLE: approved cue captions are incomplete.");
  }

  return {
    planId: options.authority.planId,
    episodeId: options.episodeId,
    seriesId: options.seriesId,
    totalDurationMs,
    overallMood: options.overallMood,
    authority: options.authority,
    intensityCurve: options.intensityCurve ?? [],
    cues: approvedCues,
    sfxEvents: options.sfxEvents ?? [],
  };
}
