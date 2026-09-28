import { invoke } from "@tauri-apps/api/core";
import type { ApprovedPlanAuthority, MusicCue } from "../../types/audioScoring";
import { AudioScoringError } from "./smartAiHubSkillClient";

export interface RustMusicCueResult {
  jobId: string;
  cueId: string;
  status: "completed";
  outputWavPath: string;
  outputDurationSeconds: number;
  sampleRate: number;
  channels: number;
  measuredLufs: number;
  truePeakDb: number;
  generationTimeSeconds: number;
  modelName: "MiniMaxAI/MiniMax-Music3";
  modelRevision: string;
  outputSha256: string;
}

/**
 * Resolve a cue through the genuine local Music 3 runtime only.
 * Existing project-bin, stock, synth and library audio are not valid outputs
 * for a newly generated score and therefore never enter this function's
 * success path.
 */
export async function resolveMusicCueAudio(
  cue: MusicCue,
  authority: ApprovedPlanAuthority,
  _mediaPool: unknown[] = [],
  workspacePath?: string | null,
): Promise<{
  audioPath: string;
  durationSeconds: number;
  provider: "minimax_direct";
  modelName: "MiniMaxAI/MiniMax-Music3";
  modelRevision: string;
  outputSha256: string;
  measuredLufs: number;
  truePeakDb: number;
}> {
  if (!cue.modelInstruction.trim() || cue.lyricsPrompt?.trim()) {
    throw new AudioScoringError(
      "SKILL_UNAVAILABLE",
      `Cue ${cue.cueId} is missing an approved instrumental model instruction.`,
    );
  }
  if (
    authority.skill.skillId !== "vertical-drama-emotion-score-director" ||
    authority.rightsPolicyHash !== cue.rightsPolicyHash
  ) {
    throw new AudioScoringError("RIGHTS_REVIEW_REQUIRED", `Cue ${cue.cueId} is not bound to the approved plan rights snapshot.`);
  }

  const res = await invoke<RustMusicCueResult>("worker_app_generate_music_cue", {
    req: {
      cue_id: cue.cueId,
      model_instruction: cue.modelInstruction,
      plan_hash: authority.planHash,
      skill_execution_id: authority.skill.executionId,
      rights_policy_hash: authority.rightsPolicyHash,
      rights_status: "approved_for_project",
      duration_seconds: cue.timelineDurationMs / 1000,
      intensity: cue.intensity,
      fade_in_ms: cue.fadeInMs,
      fade_out_ms: cue.fadeOutMs,
      target_lufs: -16.0,
      workspace_path: workspacePath ?? null,
    },
  });

  if (
    res.status !== "completed" ||
    res.modelName !== "MiniMaxAI/MiniMax-Music3" ||
    !res.outputWavPath ||
    !res.outputSha256 ||
    !Number.isFinite(res.measuredLufs) ||
    !Number.isFinite(res.truePeakDb) ||
    res.sampleRate <= 0 ||
    res.channels <= 0
  ) {
    throw new AudioScoringError(
      "GENERATION_OUTCOME_UNKNOWN",
      `Music 3 cue ${cue.cueId} returned incomplete or unverifiable provenance.`,
    );
  }

  return {
    audioPath: res.outputWavPath,
    durationSeconds: res.outputDurationSeconds,
    provider: "minimax_direct",
    modelName: res.modelName,
    modelRevision: res.modelRevision,
    outputSha256: res.outputSha256,
    measuredLufs: res.measuredLufs,
    truePeakDb: res.truePeakDb,
  };
}

/** Propagates user cancellation to the managed runtime without treating the
 * canceled request as a successful generation. */
export async function cancelMusicCueGeneration(jobId: string): Promise<void> {
  if (!jobId.trim()) {
    throw new AudioScoringError("CANCELED", "Music 3 runtime job id is missing.");
  }
  await invoke<void>("worker_app_cancel_music_cue", { jobId });
}
