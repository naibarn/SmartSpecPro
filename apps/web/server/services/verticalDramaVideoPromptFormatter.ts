/**
 * Vertical Drama Series — model-aware video-clip prompt formatter (storyboard-
 * complete plan, Phase 3, §3.3 / §3B.4).
 *
 * Pure function module: given one motion-pack clip + its resolved dialogue
 * lines + the episode's selected video model's capability metadata (from
 * `modelRegistry.ts`'s `resolveVerticalDramaCapabilities`), produces the
 * final provider-ready prompt text plus payload hints for the router's async
 * `mediaGenerationService.generateVideoAsync` submission (Section 4B hard
 * constraint — this module changes WHAT is sent, never HOW; it never calls a
 * provider or the media generation service itself).
 *
 * Two behaviors, selected by `nativeAudioDialogue`:
 *  - `true` (Veo 3.1 tiers today): the Thai dialogue line(s) are embedded
 *    VERBATIM in the final prompt together with delivery direction
 *    (tone/pace/pauses/texture) and subtext as an acting note, so the
 *    character is described as SPEAKING the line with matching lip movement.
 *    `generateAudio: true` is returned so the caller passes
 *    `generate_audio: true` through to the provider (mirrors the
 *    `veo31_request` snapshot shape in
 *    `verticalDramaProviderRouting.ts`/`references/output_contract.md`).
 *  - `false` (Grok Imagine 1.5, Seedance, generic/unknown models): the prompt
 *    carries acting/mouth-movement direction only (no literal transcript —
 *    these models have no lip-sync/transcript channel), and the function
 *    returns `ttsFallback: true` + the resolved dialogue lines so the caller
 *    routes them to the existing separate-TTS path
 *    (`dialogueAudioPlan.audio_mode: "separate_tts"` / `separate_tts_plan`).
 *
 * Provider request variant selection mirrors the skill's `provider_request`
 * variants (`veo31_request` / `grok_request` / `seedance_request` /
 * `generic_request`, see `skills/vertical-drama-video-motion-prompt-pack/
 * schemas/output.schema.json`), keyed off `detectProviderFamily` — reused
 * from `verticalDramaProviderRouting.ts` rather than re-implemented here.
 */

import { detectProviderFamily } from "./verticalDramaProviderRouting";
import type { ModelDefinition } from "./modelRegistry";
import { resolveVerticalDramaCapabilities } from "./modelRegistry";

/* -------------------------------------------------------------------------- */
/* Input contracts                                                            */
/* -------------------------------------------------------------------------- */

/** Per-line delivery direction (Phase 3B narrative-quality superset — see dialogue-audio-planner output schema). */
export interface VerticalDramaClipDialogueDelivery {
  tone?: string;
  pace?: string;
  pauses?: string;
  texture?: string;
}

/** One resolved dialogue line attached to a clip, ready for prompt embedding. */
export interface VerticalDramaClipDialogueLine {
  characterKey?: string;
  /** The Thai (or locale) spoken line, verbatim — never translated/paraphrased here. */
  lineTh: string;
  emotion?: string;
  delivery?: VerticalDramaClipDialogueDelivery;
  /** What the character is really thinking/feeling underneath the literal words. */
  subtext?: string;
}

/** The minimal clip shape the formatter needs — a subset of `VideoMotionPromptPackProjection.clips[number]`. */
export interface VerticalDramaFormatterClip {
  clipNumber: number;
  /** Base motion/camera prompt text (already includes camera/blocking direction). */
  prompt: string;
  negativeMotionPrompt?: string;
  durationSeconds: number;
  startFrameAssetId?: string;
  endFrameAssetId?: string;
}

export type VerticalDramaProviderFamily = "veo" | "grok" | "seedance" | "generic";

export interface FormatVideoClipRequestParams {
  clip: VerticalDramaFormatterClip;
  /** Dialogue line(s) spoken during this clip, already resolved by clip number (empty/undefined = silent clip). */
  dialogueLines?: VerticalDramaClipDialogueLine[];
  /**
   * The resolved video model. Accepts either a full `ModelDefinition` (from
   * `getModelsByTypeAsync`) or the minimal shape `resolveVerticalDramaCapabilities`
   * needs, so callers that only have DB-row fields on hand don't need to
   * construct a full `ModelDefinition`.
   */
  modelId: string;
  model: Pick<ModelDefinition, "type" | "aspectRatios" | "configJson" | "provider" | "aliases"> & {
    id?: string;
  };
  aspectRatio?: "9:16" | "16:9" | "1:1";
}

/* -------------------------------------------------------------------------- */
/* Output contract                                                            */
/* -------------------------------------------------------------------------- */

export interface FormatVideoClipRequestResult {
  /** Final provider-ready prompt text (base motion prompt + dialogue/acting direction folded in). */
  prompt: string;
  negativePrompt?: string;
  /** Provider family used to pick the request variant (mirrors the skill's `provider_request` variants). */
  providerFamily: VerticalDramaProviderFamily;
  /** True when the model embeds dialogue natively (lip-synced) — mirrors `nativeAudioDialogue`. */
  nativeAudioDialogue: boolean;
  /** Pass straight through to `VideoGenerationRequest`/`generate_audio` extra param when native audio applies. */
  generateAudio: boolean;
  /**
   * True when this clip's dialogue could NOT be embedded natively and must go
   * through the separate-TTS path (`dialogueAudioPlan.audio_mode:
   * "separate_tts"`). Always `false` when the clip has no dialogue at all
   * (nothing to route to TTS either way).
   */
  ttsFallback: boolean;
  /** The same dialogue lines the caller passed in, echoed back for convenience when `ttsFallback` is true. */
  ttsLines: VerticalDramaClipDialogueLine[];
  /** Max reference images this model accepts (0 = none) — callers use this to trim shot references before submission. */
  maxReferenceImages: number;
  /** Whether this model accepts a start-frame input at all. */
  supportsStartFrame: boolean;
}

/* -------------------------------------------------------------------------- */
/* Delivery-direction text building                                          */
/* -------------------------------------------------------------------------- */

/** Render one line's delivery direction as a short clause, e.g. "tone: cold, pace: slow, pauses: a beat before the last word". */
function deliveryClause(delivery: VerticalDramaClipDialogueDelivery | undefined): string {
  if (!delivery) return "";
  const parts: string[] = [];
  if (delivery.tone) parts.push(`tone: ${delivery.tone}`);
  if (delivery.pace) parts.push(`pace: ${delivery.pace}`);
  if (delivery.pauses) parts.push(`pauses: ${delivery.pauses}`);
  if (delivery.texture) parts.push(`voice texture: ${delivery.texture}`);
  return parts.join(", ");
}

/** Build the acting-direction sentence for one dialogue line (used in BOTH native and non-native modes). */
function actingDirectionSentence(line: VerticalDramaClipDialogueLine): string {
  const speaker = line.characterKey ? `${line.characterKey}` : "the character";
  const clause = deliveryClause(line.delivery);
  const emotion = line.emotion ? ` (${line.emotion})` : "";
  const deliveryText = clause ? ` — deliver with ${clause}` : "";
  const subtextText = line.subtext ? ` Subtext/acting note: ${line.subtext}.` : "";
  return `${speaker}${emotion} speaks${deliveryText}.${subtextText}`;
}

/**
 * Native-audio mode (Veo 3.1): embed the line VERBATIM so the provider can
 * lip-sync it, followed by the delivery/acting direction.
 */
function buildNativeDialogueClause(lines: VerticalDramaClipDialogueLine[]): string {
  return lines
    .map((line) => {
      const speaker = line.characterKey ? `${line.characterKey} says` : "Character says";
      const direction = actingDirectionSentence(line);
      return `${speaker}, in natural spoken Thai, exactly: "${line.lineTh}". ${direction}`;
    })
    .join(" ");
}

/**
 * Non-native mode (Grok / Seedance / generic): mouth-movement + acting
 * direction ONLY — never the literal transcript (these models have no
 * lip-sync/transcript channel; the actual audio comes from the separate TTS
 * path using the same line text).
 */
function buildMouthMovementOnlyClause(lines: VerticalDramaClipDialogueLine[]): string {
  return lines
    .map((line) => {
      const direction = actingDirectionSentence(line);
      return `Character's mouth moves naturally as if speaking a short line of Thai dialogue matching the described emotion/delivery; ${direction}`;
    })
    .join(" ");
}

/* -------------------------------------------------------------------------- */
/* Provider-family detection                                                  */
/* -------------------------------------------------------------------------- */

/** Map `detectProviderFamily`'s 4-way result onto this module's `VerticalDramaProviderFamily` (folds `gemini_omni` into `generic` — no dedicated skill variant for it). */
function toFormatterProviderFamily(
  family: ReturnType<typeof detectProviderFamily>,
): VerticalDramaProviderFamily {
  if (family === "veo") return "veo";
  if (family === "openai") return "generic";
  if (family === "gemini_omni") return "generic";
  // `detectProviderFamily` only special-cases veo/openai/gemini_omni — grok
  // and seedance both fall through to "generic" there, so detect them
  // ourselves from the model id/aliases the same way that function does.
  return "generic";
}

function detectGrokOrSeedance(modelId: string, aliases: string[] = []): "grok" | "seedance" | null {
  const hay = [modelId, ...aliases].join(" ").toLowerCase();
  if (hay.includes("grok")) return "grok";
  if (hay.includes("seedance") || hay.includes("bytedance")) return "seedance";
  return null;
}

/** Resolve the provider family used to pick a `provider_request` variant, per model family (veo/grok/seedance/generic). */
export function resolveProviderFamily(
  modelId: string,
  model: Pick<ModelDefinition, "type" | "aspectRatios" | "configJson" | "provider" | "aliases"> & { id?: string },
): VerticalDramaProviderFamily {
  const definitionLike: ModelDefinition = {
    id: model.id ?? modelId,
    type: model.type,
    name: model.id ?? modelId,
    provider: model.provider,
    description: "",
    aliases: model.aliases ?? [],
    creditCost: 0,
    aspectRatios: model.aspectRatios,
    configJson: model.configJson,
  };
  const base = detectProviderFamily(definitionLike);
  if (base === "veo") return "veo";
  const grokOrSeedance = detectGrokOrSeedance(modelId, model.aliases);
  if (grokOrSeedance) return grokOrSeedance;
  return toFormatterProviderFamily(base);
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Format one clip's final provider-ready prompt + payload hints. Pure — no
 * I/O, no provider calls. Callers (the router's video-clip submission
 * mutation) pass the result's `prompt`/`negativePrompt` straight into
 * `mediaGenerationService.generateVideoAsync`'s `VideoGenerationRequest`, and
 * route `ttsLines` to the existing separate-TTS path when `ttsFallback` is
 * true.
 */
export function formatVideoClipRequest(
  params: FormatVideoClipRequestParams,
): FormatVideoClipRequestResult {
  const { clip, model, modelId } = params;
  const dialogueLines = (params.dialogueLines ?? []).filter(
    (l): l is VerticalDramaClipDialogueLine => Boolean(l && l.lineTh && l.lineTh.trim().length > 0),
  );

  const capabilities = resolveVerticalDramaCapabilities(modelId, {
    type: model.type,
    aspectRatios: model.aspectRatios,
    configJson: model.configJson,
  });
  const nativeAudioDialogue = capabilities.nativeAudioDialogue === true;
  const providerFamily = resolveProviderFamily(modelId, model);

  let finalPrompt = clip.prompt;
  let generateAudio = false;
  let ttsFallback = false;

  if (dialogueLines.length > 0) {
    if (nativeAudioDialogue) {
      const clause = buildNativeDialogueClause(dialogueLines);
      finalPrompt = `${finalPrompt} ${clause}`.trim();
      generateAudio = true;
      ttsFallback = false;
    } else {
      const clause = buildMouthMovementOnlyClause(dialogueLines);
      finalPrompt = `${finalPrompt} ${clause}`.trim();
      generateAudio = false;
      ttsFallback = true;
    }
  }

  return {
    prompt: finalPrompt,
    negativePrompt: clip.negativeMotionPrompt,
    providerFamily,
    nativeAudioDialogue,
    generateAudio,
    ttsFallback,
    ttsLines: ttsFallback ? dialogueLines : [],
    maxReferenceImages: capabilities.maxReferenceImages ?? 0,
    supportsStartFrame: capabilities.supportsStartFrame === true,
  };
}
