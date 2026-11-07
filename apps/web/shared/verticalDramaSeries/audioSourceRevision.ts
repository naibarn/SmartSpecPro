import { artifactChecksumSha256 } from "./artifacts";
import type { VerticalDramaDialogueAudioPlan } from "./audio";

export interface VerticalDramaEpisodeAudioSource {
  seriesId: number;
  episodeId: number;
  script: unknown;
  storyboard: unknown;
}

export type VerticalDramaAudioSourceStatus =
  | "current"
  | "stale"
  | "unverified"
  | "missing";

/** Stable content binding for authored episode dialogue and storyboard facts. */
export function fingerprintVerticalDramaEpisodeAudioSource(
  source: VerticalDramaEpisodeAudioSource,
): string {
  return artifactChecksumSha256({
    scheme: "episode_script_storyboard_sha256_v1",
    seriesId: source.seriesId,
    episodeId: source.episodeId,
    script: source.script ?? null,
    storyboard: source.storyboard ?? null,
  });
}

/** Legacy plans remain usable but are reported as unverified. */
export function classifyVerticalDramaAudioPlanSource(
  plan: VerticalDramaDialogueAudioPlan | null | undefined,
  source?: VerticalDramaEpisodeAudioSource,
): VerticalDramaAudioSourceStatus {
  if (!plan) return "missing";
  if (!source) return "unverified";
  const binding = plan.sourceRevision;
  if (
    !binding ||
    binding.scheme !== "episode_script_storyboard_sha256_v1" ||
    typeof binding.fingerprint !== "string"
  ) {
    return "unverified";
  }
  return binding.fingerprint === fingerprintVerticalDramaEpisodeAudioSource(source)
    ? "current"
    : "stale";
}
