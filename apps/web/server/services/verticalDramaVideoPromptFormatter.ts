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
import type { VerticalDramaDialogueLanguage, VerticalDramaThaiAccent } from "@shared/verticalDramaSeries";
import {
  VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES,
  VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES,
  // Model-family-aware, vision-grounded video prompt quality upgrade
  // (`planning/vd-video-prompt-model-family-quality/plan.md`, item I) — the
  // same hard cap the router's post-generation QC (`ensurePromptWithinLimit`)
  // enforces on the PERSISTED `clip.prompt`, reused here as the final guard
  // on the RENDER-TIME formatted prompt (which can grow further via this
  // function's own prepend/append steps below).
  VD_VIDEO_PROMPT_MAX,
} from "@shared/verticalDramaSeries";
// Speakability sanitizer (2026-07-08/W9-A, spec §14.1 rule 6b) — applied
// ONLY to the literal transcript embedded for native-audio models below
// (`buildNativeDialogueClause`'s `exactly: "..."` clause), never to the
// persisted `VerticalDramaClipDialogueLine`/artifact text this module reads
// from. The mouth-movement-only branch (`buildMouthMovementOnlyClause`)
// never embeds a literal transcript at all, so it needs no sanitization.
import { sanitizeSpeakableLineForDelivery } from "@shared/verticalDramaSeries/dialogueQuality";
// Skill-first stitching / render-time idempotency
// (`planning/vd-video-prompt-skill-first/plan.md` Phase 3b) — reused from
// the generation-time module (single source of truth for "does this prompt
// already embed every dialogue line verbatim?", see that export's own doc
// comment) so this render-time formatter never appends a second dialogue
// clause on top of a clip prompt that already carries the lines verbatim
// (e.g. an already-compliant skill-first `clip.prompt`, or a clip formatted
// a second time). One-directional import only (this module is never
// imported back by the generation module) — no circular dependency.
import { promptEmbedsDialogueVerbatim } from "./verticalDramaVideoMotionPromptGeneration";

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
  /**
   * Speaker-attributed lip-sync discipline fix — the speaker's DISPLAY name
   * (e.g. `"กล้า"`), when the caller has already resolved it from the
   * series' character roster (mirrors the `name || characterKey` fallback
   * pattern used across this codebase). Optional/omitted by every caller
   * that hasn't threaded roster names through yet — `buildNativeDialogueVerbatimBlock`
   * falls back to `characterKey` in that case. See
   * `@shared/verticalDramaSeries/nativeDialogue.ts`'s own doc comment.
   */
  speakerName?: string;
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
  /**
   * Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt option)
   * — this clip's model-directed ambient bed + SFX cues, when the option
   * was on + supported at generation time (see
   * `VerticalDramaMotionPromptPack["clips"][number].audioDirection`'s own
   * doc comment, `@shared/verticalDramaSeries/contracts`, for the full
   * rationale). Sound-direction ownership fix (recorded gap 4, 2026-07-22)
   * — `formatVideoClipRequest` no longer folds this field into `prompt`
   * (that used to double-append the sound direction alongside the
   * generation-time service's own now-removed concat, see that function's
   * doc comment). The video-prompt skills write this SAME text directly
   * into `prompt` itself when native audio is on, so this field is now
   * display/audit-only from the formatter's perspective — carried through
   * on the type purely for shape-compatibility with the persisted clip.
   */
  audioDirection?: string;
}

export type VerticalDramaProviderFamily = "veo" | "grok" | "seedance" | "generic";

export interface FormatVideoClipRequestParams {
  clip: VerticalDramaFormatterClip;
  /** Dialogue line(s) spoken during this clip, already resolved by clip number (empty/undefined = silent clip). */
  dialogueLines?: VerticalDramaClipDialogueLine[];
  /**
   * The language the character(s) SPEAK in the video (episode-level language
   * plan) — defaults to `"th"` when absent, preserving this formatter's
   * pre-existing Thai-only behavior for episodes with no explicit
   * selection. When dialogue is present, the final provider prompt states
   * the speech language explicitly (e.g. "spoken in Thai"/"spoken in
   * English") in ADDITION to embedding/describing the line, so the provider
   * never has to infer the spoken language from the transcript alone.
   */
  dialogueLanguage?: VerticalDramaDialogueLanguage;
  /**
   * Thai regional speech accent (episode-level language plan) — only
   * meaningful when the effective `dialogueLanguage` is `"th"` (or absent,
   * which defaults to Thai); ignored otherwise. When set, appends the
   * matching English delivery directive after the native dialogue clause
   * (native-audio models only — never in the TTS-fallback/mouth-movement
   * branch, since that path never embeds a literal transcript for the
   * accent direction to attach to).
   */
  thaiAccent?: VerticalDramaThaiAccent;
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
 * lip-sync it, followed by the delivery/acting direction. States the spoken
 * language explicitly (e.g. "in natural spoken Thai"/"in natural spoken
 * English") so the provider never has to infer it from the transcript alone.
 *
 * Speakability sanitize (2026-07-08/W9-A, spec §14.1 rule 6b) — the line is
 * run through `sanitizeSpeakableLineForDelivery` right here, at the moment
 * it enters the OUTBOUND provider prompt (the literal `exactly: "..."`
 * clause the provider lip-syncs to). The original `line.lineTh` on the
 * caller's artifact is never mutated — only this local copy of the text
 * changes. A line with no violations is byte-identical (idempotent
 * sanitizer), so this is a no-op for the overwhelming majority of dialogue.
 */
function buildNativeDialogueClause(
  lines: VerticalDramaClipDialogueLine[],
  dialogueLanguageName: string,
): string {
  return lines
    .map((line) => {
      const speaker = line.characterKey ? `${line.characterKey} says` : "Character says";
      const direction = actingDirectionSentence(line);
      const speakableLine = sanitizeSpeakableLineForDelivery(line.lineTh);
      return `${speaker}, in natural spoken ${dialogueLanguageName}, exactly: "${speakableLine}". ${direction}`;
    })
    .join(" ");
}

/**
 * Non-native mode (Grok / Seedance / generic): mouth-movement + acting
 * direction ONLY — never the literal transcript (these models have no
 * lip-sync/transcript channel; the actual audio comes from the separate TTS
 * path using the same line text). States the spoken language explicitly
 * (e.g. "spoken in Thai"/"spoken in English") so mouth-shape/lip-movement
 * description matches the actual language even without a literal transcript.
 */
function buildMouthMovementOnlyClause(
  lines: VerticalDramaClipDialogueLine[],
  dialogueLanguageName: string,
): string {
  return lines
    .map((line) => {
      const direction = actingDirectionSentence(line);
      return `Character's mouth moves naturally as if speaking a short line of dialogue spoken in ${dialogueLanguageName}, matching the described emotion/delivery; ${direction}`;
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
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];

  let finalPrompt = clip.prompt;
  let generateAudio = false;
  let ttsFallback = false;

  // Start-frame grounding instruction (video MCP submission fix): without an
  // explicit textual anchor, some providers (e.g. Higgsfield) treat an
  // attached image as a loose style/character reference rather than the
  // literal first frame to continue motion from — this line makes the intent
  // unambiguous. Only added when this clip actually has an approved start
  // frame AND the model claims to support one; a model with
  // `supportsStartFrame: false` gets no grounding line since no image will be
  // attached for it to refer to. Prepended (not appended) so it survives the
  // router's `VD_VIDEO_PROMPT_MAX` (2000 char) truncation-from-the-end QC
  // step in `ensurePromptWithinLimit` even on long clip prompts.
  if (clip.startFrameAssetId && capabilities.supportsStartFrame) {
    finalPrompt =
      `Use the attached first image as the exact start frame and visual source of truth — continue motion from it; keep faces, wardrobe, set and composition identical. ${finalPrompt}`.trim();
  }
  // Budget-guard checkpoint (re-pointed for the recorded gap-4 sound-
  // direction ownership fix, 2026-07-22, see the final guard below) —
  // captured right after this function's FIRST own addition (the grounding
  // prepend), so the guard can roll back later additions one tier at a time
  // without ever losing this one.
  const promptAfterGrounding = finalPrompt;

  // Silence-aware / idempotent dialogue clause
  // (`planning/vd-video-prompt-skill-first/plan.md` Phase 3b) — (a) an empty
  // `dialogueLines` (silent clip, or a stale/never-resolved guess the caller
  // chose not to pass) appends nothing at all, unchanged from before this
  // fix (the whole block is gated on `dialogueLines.length > 0`); (b) when
  // `finalPrompt` (the persisted `clip.prompt`, possibly already an
  // already-compliant skill-first composition from the generation-time
  // service) already embeds every line verbatim, do NOT append a second
  // clause on top — `promptEmbedsDialogueVerbatim` is the same reusable
  // "does this text already carry every line?" check the generation-time
  // module uses for its own stitching gate, so both layers agree on what
  // counts as "already embedded".
  let promptAfterDialogueClause = finalPrompt;
  if (dialogueLines.length > 0) {
    const dialogueAlreadyEmbedded = promptEmbedsDialogueVerbatim(finalPrompt, dialogueLines);
    if (nativeAudioDialogue) {
      if (!dialogueAlreadyEmbedded) {
        const clause = buildNativeDialogueClause(dialogueLines, dialogueLanguageName);
        finalPrompt = `${finalPrompt} ${clause}`.trim();
      }
      // Checkpoint BEFORE the accent directive (below), so the guard can
      // drop the accent directive alone without also losing the dialogue
      // clause itself.
      promptAfterDialogueClause = finalPrompt;
      if (dialogueLanguage === "th" && params.thaiAccent) {
        const accentDirective = `${VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES[params.thaiAccent]} Apply this delivery direction to every spoken line.`;
        finalPrompt = `${finalPrompt} ${accentDirective}`.trim();
      }
      generateAudio = true;
      ttsFallback = false;
    } else {
      if (!dialogueAlreadyEmbedded) {
        const clause = buildMouthMovementOnlyClause(dialogueLines, dialogueLanguageName);
        finalPrompt = `${finalPrompt} ${clause}`.trim();
      }
      promptAfterDialogueClause = finalPrompt;
      generateAudio = false;
      ttsFallback = true;
    }
  }

  // Sound-direction ownership fix (recorded gap 4, 2026-07-22) — this
  // function used to fold `clip.audioDirection` onto `finalPrompt` here as
  // a render-time-appended tail (Vertical Drama task #36), and this file's
  // own doc comment used to claim it was "the ONLY place `audioDirection`
  // is folded into the actual provider-submitted prompt text" — but the
  // GENERATION-time service (`verticalDramaVideoMotionPromptGeneration.ts`)
  // ALSO folded the same text into the persisted `clip.prompt` (its "SFX
  // budget-aware concat"), so the sound direction appeared TWICE in the
  // provider-submitted prompt whenever native audio was on. The updated
  // video-prompt skills now write the closing sound clause directly into
  // `clip.prompt` themselves (budget-guarded by the skill's own rule),
  // still returning the SAME text in `audioDirection` for display/audit
  // only (see `VerticalDramaFormatterClip.audioDirection`'s doc comment
  // above) — so this function must NEVER append it again. There is
  // therefore no more audio-direction tier in this function at all; the
  // final budget guard below only ever has to roll back ITS OWN two
  // remaining additions (start-frame grounding, dialogue/accent clauses).

  // Final budget guard (item I; re-pointed for the sound-direction
  // ownership fix above — there is no audio-direction tail to trim
  // anymore) — the PERSISTED `clip.prompt` is already <= VD_VIDEO_PROMPT_MAX
  // (`ensurePromptWithinLimit`, enforced at the router's persist step,
  // sound clause included), but this function's OWN prepend (start-frame
  // grounding) and appends (dialogue/mouth-movement clause, accent
  // directive) can still push the RENDER-TIME formatted request over that
  // same cap. Roll back ONLY this function's own additions, most-recently-
  // added tier first, stopping as soon as the result fits — NEVER trim the
  // base `clip.prompt` itself (guaranteed to already fit on its own).
  if (finalPrompt.length > VD_VIDEO_PROMPT_MAX) {
    if (promptAfterDialogueClause.length <= VD_VIDEO_PROMPT_MAX) {
      finalPrompt = promptAfterDialogueClause; // drop the accent directive only
    } else if (promptAfterGrounding.length <= VD_VIDEO_PROMPT_MAX) {
      finalPrompt = promptAfterGrounding; // drop the accent directive + dialogue/mouth-movement clause
    } else {
      finalPrompt = clip.prompt; // drop every addition this function made; the base always fits on its own
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
