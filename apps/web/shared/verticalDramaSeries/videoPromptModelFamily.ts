/**
 * Video-prompt model-family taxonomy for Vertical Drama shot video prompts.
 *
 * Classifies the episode's currently-selected VIDEO model into the prompt-
 * shaping family the `vertical-drama-shot-video-prompt[-subshots]` skills
 * understand (`grok` / `veo` / `seedance` / `other`), and carries the small
 * per-family facts TypeScript owns (the skills own all creative guidance).
 *
 * This module is imported from BOTH the server (generation-time fact block +
 * persisted `promptModelTarget` stamping) and the client (badge + mismatch
 * warning on the storyboard video-prompt card), so it must stay dependency-
 * free and side-effect-free. It is deliberately separate from
 * `detectProviderFamily` (render/request routing) and
 * `detectVideoSegmentPromptDialect` (video segment planner) — those serve
 * different consumers with different taxonomies (neither knows `grok`).
 */

export type VideoPromptModelFamily = "grok" | "veo" | "seedance" | "other";

export const VIDEO_PROMPT_MODEL_FAMILIES: readonly VideoPromptModelFamily[] = [
  "grok",
  "veo",
  "seedance",
  "other",
] as const;

/** UI badge labels (same in every locale — these are product names). */
export const VIDEO_PROMPT_MODEL_FAMILY_LABELS: Record<VideoPromptModelFamily, string> = {
  grok: "Grok",
  veo: "Veo",
  seedance: "Seedance",
  other: "Other",
};

/**
 * Metadata stamped onto a motion-prompt-pack clip when its video prompt is
 * (re)generated, recording which model the prompt was shaped for. Mirrored on
 * `VerticalDramaMotionPromptPack["clips"][number]` (jsonb — additive, no
 * migration) and the client clip view type.
 */
export interface VideoPromptModelTarget {
  family: VideoPromptModelFamily;
  modelId: string;
  modelName?: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
}

export interface VideoPromptModelFamilySource {
  modelId?: string | null;
  name?: string | null;
  provider?: string | null;
  configJson?: Record<string, unknown> | null;
}

// Letter-only boundaries so version-suffixed ids still match ("veo3",
// "grok-imagine-video-1.5", "hermes_grok") while letter-embedded fragments
// ("alveolar") do not.
const GROK_TOKEN = /(^|[^a-z])grok([^a-z]|$)/i;
const VEO_TOKEN = /(^|[^a-z])veo([^a-z]|$)/i;
const SEEDANCE_TOKEN = /seedance/i;
/** Seedance ships via ByteDance's BytePlus / ModelArk platforms. */
const SEEDANCE_PROVIDER_TOKEN = /byteplus|modelark/i;

const configJsonHints = (configJson?: Record<string, unknown> | null): string => {
  if (!configJson || typeof configJson !== "object") return "";
  const hints: string[] = [];
  for (const key of ["kieModelId", "apiPayloadFormat", "externalModelId"]) {
    const value = (configJson as Record<string, unknown>)[key];
    if (typeof value === "string") hints.push(value);
  }
  return hints.join(" ");
};

/**
 * Resolve which prompt-shaping family a video model belongs to.
 * Order matters: grok first (a `hermes_grok`-provided model wins grok no
 * matter what its display name says), then veo, then seedance; anything
 * unrecognized — including kling — is `other`.
 */
export function resolveVideoPromptTargetFamily(
  source: VideoPromptModelFamilySource | null | undefined,
): VideoPromptModelFamily {
  if (!source) return "other";
  const idAndName = [source.modelId ?? "", source.name ?? "", configJsonHints(source.configJson)]
    .join(" ")
    .trim();
  const provider = (source.provider ?? "").trim();
  const haystack = `${idAndName} ${provider}`;
  if (GROK_TOKEN.test(haystack)) return "grok";
  if (VEO_TOKEN.test(haystack)) return "veo";
  if (SEEDANCE_TOKEN.test(idAndName) || SEEDANCE_PROVIDER_TOKEN.test(provider)) {
    return "seedance";
  }
  return "other";
}

/**
 * Whether the family's render path carries a usable negative-prompt channel.
 * Grok Imagine has none — every hard constraint must live positively in the
 * prompt itself (the skills teach this; this flag is the fact they receive).
 */
export function videoPromptFamilySupportsNegativePrompt(
  family: VideoPromptModelFamily,
): boolean {
  return family !== "grok";
}
