import type {
  ShotAudioIntent,
  EpisodeSoundPlan,
  MusicCue,
  SeriesSoundBible,
  DramaGenre,
} from "../../types/audioScoring";

export function generateMiniMaxStylePrompt(
  emotionalTone: ShotAudioIntent["emotionalTone"],
  genre: DramaGenre = "romance_ceo"
): { stylePrompt: string; bpm: number } {
  switch (emotionalTone) {
    case "climax":
      return {
        stylePrompt: "cinematic crescendo, powerful strings, dramatic orchestral hits, emotional climax, high dynamic range, no vocals",
        bpm: 110,
      };
    case "tension":
      return {
        stylePrompt: "dark atmospheric drone, subtle cello pulse, ominous suspense, psychological thriller underbed, slow build, no vocals",
        bpm: 85,
      };
    case "tender":
      return {
        stylePrompt: "warm acoustic piano, soft emotional violins, heartfelt romance, tender melancholic vertical drama melody, gentle, no vocals",
        bpm: 78,
      };
    case "heartbreak":
      return {
        stylePrompt: "solo acoustic piano, grieving cello, tearful separation, poignant melancholic melody, quiet dynamic, no vocals",
        bpm: 72,
      };
    case "action":
      return {
        stylePrompt: "driving hybrid percussion, fast paced synth pulses, tense cinematic pursuit, urgent brass stabs, no vocals",
        bpm: 128,
      };
    default:
      return {
        stylePrompt: "ambient cinematic pad, neutral dialogue underbed, gentle acoustic guitar texture, subtle room tone, no vocals",
        bpm: 90,
      };
  }
}

/**
 * Cue Segmenter
 * Groups consecutive shots of harmonious emotion into sustained music cues (20 - 90s),
 * preventing distracting micro-cues and preserving cinematic pacing.
 */
export function segmentEpisodeSoundPlan(options: {
  episodeId: string;
  seriesId: string;
  totalDurationMs: number;
  shotIntents: ShotAudioIntent[];
  bible?: SeriesSoundBible | null;
  genre?: DramaGenre;
}): EpisodeSoundPlan {
  const { episodeId, seriesId, totalDurationMs, shotIntents, genre = "romance_ceo" } = options;

  const cues: MusicCue[] = [];
  const minCueDurationMs = 20000; // 20 seconds minimum

  let cueStartMs = 0;
  let currentTone = shotIntents[0]?.emotionalTone || "neutral";
  let cueIndex = 1;

  for (let i = 0; i < shotIntents.length; i++) {
    const shot = shotIntents[i];
    const isLast = i === shotIntents.length - 1;
    const toneChanged = shot.emotionalTone !== currentTone;
    const currentDur = shot.endMs - cueStartMs;

    if ((toneChanged && currentDur >= minCueDurationMs) || isLast) {
      const cueDur = Math.max(minCueDurationMs, shot.endMs - cueStartMs);
      const { stylePrompt, bpm } = generateMiniMaxStylePrompt(currentTone, genre);

      cues.push({
        cueId: `cue_${episodeId}_${cueIndex}`,
        timelineStartMs: cueStartMs,
        timelineDurationMs: Math.min(cueDur, totalDurationMs - cueStartMs),
        placement:
          cueIndex === 1
            ? "intro_hook"
            : isLast
            ? "cliffhanger_outro"
            : currentTone === "tension"
            ? "suspense_buildup"
            : "dialogue_underbed",
        stylePrompt,
        tempoBpm: bpm,
        intensity: currentTone === "climax" ? 0.9 : currentTone === "tension" ? 0.75 : 0.5,
        duckingRequired: true,
        duckingLevelDb: -16.0,
        fadeInMs: cueIndex === 1 ? 500 : 1500,
        fadeOutMs: isLast ? 3000 : 2000,
      });

      cueIndex++;
      cueStartMs = shot.endMs;
      currentTone = shot.emotionalTone;
    }
  }

  // Fallback single cue if script is short or uniform
  if (cues.length === 0) {
    const { stylePrompt, bpm } = generateMiniMaxStylePrompt("tender", genre);
    cues.push({
      cueId: `cue_${episodeId}_main`,
      timelineStartMs: 0,
      timelineDurationMs: totalDurationMs,
      placement: "dialogue_underbed",
      stylePrompt,
      tempoBpm: bpm,
      intensity: 0.55,
      duckingRequired: true,
      duckingLevelDb: -16.0,
      fadeInMs: 1000,
      fadeOutMs: 2500,
    });
  }

  return {
    planId: `plan_sound_${Date.now()}`,
    episodeId,
    seriesId,
    totalDurationMs,
    overallMood: genre,
    intensityCurve: shotIntents.map((s) => ({
      timelineMs: s.startMs,
      intensity: s.emotionalTone === "climax" ? 1.0 : s.emotionalTone === "action" ? 0.85 : 0.5,
      dramaticEvent: s.emotionalTone,
    })),
    cues,
    sfxEvents: [],
  };
}
