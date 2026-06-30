import type { ArticleStoryboardAudioStrategy, ArticleStoryboardVideoShotPlan } from "./contracts";

export const DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS = 5;
export const ARTICLE_STORYBOARD_TIMING_MISMATCH_TOLERANCE_SECONDS = 1.25;

export function estimateArticleStoryboardScriptSeconds(text: string): number {
  const characters = text.trim().length;
  if (characters === 0) {
    return DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS;
  }
  return Math.max(DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS, Math.ceil(characters / 14));
}

export function allocateArticleStoryboardShotDurations(
  shots: Pick<ArticleStoryboardVideoShotPlan, "id" | "articleText">[],
  totalAudioSeconds?: number,
): Record<string, number> {
  if (shots.length === 0) {
    return {};
  }

  if (!Number.isFinite(totalAudioSeconds) || !totalAudioSeconds || totalAudioSeconds <= 0) {
    return Object.fromEntries(
      shots.map((shot) => [shot.id, DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS]),
    );
  }

  const weights = shots.map((shot) => Math.max(1, shot.articleText.trim().length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    shots.map((shot, index) => [
      shot.id,
      Math.max(2, Number(((totalAudioSeconds * weights[index]!) / totalWeight).toFixed(2))),
    ]),
  );
}

export function evaluateArticleStoryboardTimingMismatch(
  plannedSeconds: number,
  measuredSeconds: number,
  toleranceSeconds = ARTICLE_STORYBOARD_TIMING_MISMATCH_TOLERANCE_SECONDS,
): { mismatch: boolean; deltaSeconds: number } {
  const deltaSeconds = Number((measuredSeconds - plannedSeconds).toFixed(2));
  return {
    mismatch: Math.abs(deltaSeconds) > toleranceSeconds,
    deltaSeconds,
  };
}

export function estimateArticleStoryboardAudioCharacters(
  shots: Pick<ArticleStoryboardVideoShotPlan, "articleText">[],
): number {
  return shots.reduce((sum, shot) => sum + shot.articleText.trim().length, 0);
}

export function estimateArticleStoryboardAudioCredits(input: {
  audioStrategy: ArticleStoryboardAudioStrategy;
  estimatedCharacters: number;
  estimatedNativeSpeechSeconds?: number;
}): number | undefined {
  if (input.audioStrategy === "silent") {
    return 0;
  }
  if (input.audioStrategy === "native_video_audio") {
    return input.estimatedNativeSpeechSeconds
      ? Number((input.estimatedNativeSpeechSeconds * 0.08).toFixed(2))
      : undefined;
  }
  return Number((Math.ceil(input.estimatedCharacters / 100) * 0.02).toFixed(2));
}
