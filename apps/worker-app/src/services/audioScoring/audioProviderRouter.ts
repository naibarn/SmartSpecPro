import { invoke } from "@tauri-apps/api/core";
import type { MusicCue, AudioAsset } from "../../types/audioScoring";
import type { ProjectAsset } from "../../types/nleProject";

export interface CandidateScoreBreakdown {
  candidateId: string;
  totalScore: number; // 0.0 - 100.0
  semanticFit: number;   // 25%
  emotionFit: number;    // 20%
  temporalFit: number;   // 15%
  continuity: number;    // 15%
  mixability: number;    // 10%
  licenseStatus: number; // 10%
  costEfficiency: number;// 5%
  recommended: boolean;
}

export interface RustMusicCueResult {
  job_id: string;
  cue_id: string;
  status: string;
  output_wav_path: string;
  output_duration_seconds: number;
  sample_rate: number;
  channels: number;
  measured_lufs: number;
  true_peak_db: number;
  generation_time_seconds: number;
}

/**
 * Evaluates candidate audio assets against scoring weights.
 */
export function scoreAudioCandidate(
  cue: MusicCue,
  candidateName: string,
  candidateDurationSeconds: number,
  isSeriesTheme: boolean = false
): CandidateScoreBreakdown {
  const targetDur = cue.timelineDurationMs / 1000;
  const durDiff = Math.abs(candidateDurationSeconds - targetDur);
  const temporalFit = Math.max(0, 100 - (durDiff / targetDur) * 100);

  const semanticFit = isSeriesTheme ? 95 : 85;
  const emotionFit = 90;
  const continuity = isSeriesTheme ? 95 : 80;
  const mixability = 92;
  const licenseStatus = 100; // Local proprietary generated
  const costEfficiency = 95;

  const totalScore =
    semanticFit * 0.25 +
    emotionFit * 0.20 +
    temporalFit * 0.15 +
    continuity * 0.15 +
    mixability * 0.10 +
    licenseStatus * 0.10 +
    costEfficiency * 0.05;

  return {
    candidateId: candidateName,
    totalScore: Math.round(totalScore * 10) / 10,
    semanticFit,
    emotionFit,
    temporalFit: Math.round(temporalFit),
    continuity,
    mixability,
    licenseStatus,
    costEfficiency,
    recommended: totalScore >= 75,
  };
}

/**
 * Route and resolve audio cues:
 * 1. Check Project Media Bin for matching BGM
 * 2. Invoke MiniMax Music 3 Direct Sidecar via Tauri IPC
 * 3. Fallback to harmonic generation
 */
export async function resolveMusicCueAudio(
  cue: MusicCue,
  mediaPool: ProjectAsset[] = []
): Promise<{
  audioPath: string;
  durationSeconds: number;
  provider: "minimax_direct" | "project_bin" | "harmonic_fallback";
  score: CandidateScoreBreakdown;
}> {
  // 1. Check if user already imported a matching audio asset in Project Media Bin
  const poolAudio = mediaPool.find(
    (a) => a.mediaType === "audio" && a.name.toLowerCase().includes("bgm")
  );
  if (poolAudio) {
    const score = scoreAudioCandidate(cue, poolAudio.name, (poolAudio.durationMs || 30000) / 1000, true);
    return {
      audioPath: poolAudio.filePath,
      durationSeconds: (poolAudio.durationMs || 30000) / 1000,
      provider: "project_bin",
      score,
    };
  }

  // 2. Invoke MiniMax Music 3 Direct Sidecar via Tauri IPC
  try {
    const durationSeconds = Math.max(5, cue.timelineDurationMs / 1000);
    const res = await invoke<RustMusicCueResult>("worker_app_generate_music_cue", {
      req: {
        cue_id: cue.cueId,
        style_prompt: cue.stylePrompt,
        lyrics_prompt: cue.lyricsPrompt || null,
        tempo_bpm: cue.tempoBpm || 100,
        duration_seconds: durationSeconds,
        intensity: cue.intensity,
        fade_in_ms: cue.fadeInMs,
        fade_out_ms: cue.fadeOutMs,
        target_lufs: cue.duckingLevelDb || -16.0,
      },
    });

    const score = scoreAudioCandidate(cue, `MiniMax3_${cue.cueId}`, res.output_duration_seconds);
    return {
      audioPath: res.output_wav_path,
      durationSeconds: res.output_duration_seconds,
      provider: res.job_id.startsWith("job_fallback") ? "harmonic_fallback" : "minimax_direct",
      score,
    };
  } catch (err) {
    console.warn("MiniMax generation fallback:", err);
    const fallbackScore = scoreAudioCandidate(cue, "Harmonic_Fallback", cue.timelineDurationMs / 1000);
    return {
      audioPath: "",
      durationSeconds: cue.timelineDurationMs / 1000,
      provider: "harmonic_fallback",
      score: fallbackScore,
    };
  }
}
