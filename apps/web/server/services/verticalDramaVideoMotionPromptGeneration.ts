/**
 * Vertical Drama Series — real video motion-prompt-pack generation for the
 * `video_motion_prompt_pack` pipeline stage (spec feature 131 §11.5).
 *
 * Invokes the already-installed `vertical-drama-video-motion-prompt-pack`
 * skill (`apps/web/skills/vertical-drama-video-motion-prompt-pack/`) via a
 * direct `executeWithFallback` LLM call — mirrors
 * `verticalDramaStoryboardGeneration.ts`'s (itself mirroring
 * `verticalDramaStoryBible.ts`'s) check-credits -> resolve-model -> call ->
 * validate -> deduct-credits convention exactly.
 *
 * This is a credit-gated LLM *planning* call only — it produces per-clip
 * motion prompts + provider request payloads, not rendered video. The actual
 * paid video render stays behind `render_or_import_video_clips` /
 * `verticalDramaProviderRouting.ts`, untouched by this file.
 *
 * The existing `sub_shot_plan`/`planSubShots` feature in
 * `verticalDramaEpisodePipeline.ts` is left exactly as-is: when the sub-shot
 * flag is on, the pipeline expands `clips` from `planSubShots` AFTER this
 * module's real per-shot motion prompts are substituted into the base clip
 * list, so sub-shot clip prompts are seeded from the real generated prompt
 * for their parent shot instead of the dry-run placeholder text.
 *
 * `verticalDramaEpisodePipeline.ts`'s `runStage` is the only caller, and only
 * invokes this for non-dry-run/non-plan-only runner modes.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import { executeWithFallback } from "./llmRouter";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import { resolveVerticalDramaCapabilities, type ModelDefinition } from "./modelRegistry";
import { detectProviderFamily } from "./verticalDramaProviderRouting";
import {
  executeJsonPlanningCallWithRetry,
  extractJson,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import type {
  VerticalDramaPromptLanguage,
  VerticalDramaDialogueLanguage,
  VerticalDramaSeriesLocale,
  VerticalDramaThaiAccent,
  // Speaker-aware sub-shots task — the split-window shape decided by
  // `computeSpeakerSwitchSubShotPlan` (pure, no LLM call); this module's
  // `generateVerticalDramaShotVideoPromptSubShots` only writes prose for
  // windows it's given, it never re-decides the split itself.
  SpeakerSwitchSubShotWindow,
} from "@shared/verticalDramaSeries";
import {
  VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES,
  VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES,
  VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES,
} from "@shared/verticalDramaSeries";
import { targetVerticalDramaSpeechSeconds } from "@shared/verticalDramaSeries/dialogueQuality";
import { VD_PRODUCT_LOCK_VIDEO_INSTRUCTION } from "./verticalDramaProductTieIn";
import { buildThaiAdComplianceInstruction } from "@shared/verticalDramaSeries/thaiAdCompliance";
// Preset visual identity flow-through (spec §8.2.2 flow-through rule,
// section-15 change D, Wave-4A completing the "motion prompts" leg of the
// rule). Type-only — pure/shared, no runtime import needed here.
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/**
 * Thrown when the per-user `mediaGenerationLimiter` rejects a video
 * motion-prompt-pack generation call. `verticalDramaEpisodePipeline.ts`'s
 * `mapMotionPromptGenerationError` does not special-case this (by design — we
 * do not touch that file here); it falls through to that mapper's generic
 * `VD_MOTION_PROMPT_PACK_GENERATION_FAILED` / `repairable: true` branch,
 * which is an accurate, safe classification for a transient rate-limit
 * condition (the caller can simply retry the stage later).
 */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for video motion prompt pack generation. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    );
    this.name = "RateLimitExceededError";
  }
}

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-video-motion-prompt-pack");

let cachedSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-video-motion-prompt-pack` skill's markdown body
 * (everything after the YAML frontmatter) verbatim, to use as the LLM system
 * prompt. Resolves the skill folder the same way `skillRegistry.ts` does.
 */
function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedSystemPrompt = content;
        return cachedSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-video-motion-prompt-pack" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — validates + narrows to the `VerticalDramaMotionPromptPack`  */
/* shape expected by the pipeline's `video_motion_prompt_pack` stage payload   */
/* (`@shared/verticalDramaSeries` `contracts.ts`).                             */
/* -------------------------------------------------------------------------- */

/**
 * Preserve upstream snake_case fields exactly (no camelCase translation) —
 * the skill's own instructions require this. `.passthrough()` everywhere so
 * optional upstream fields survive even though only the required subset is
 * strictly validated here.
 */
const videoClipRequestSchema = z
  .object({
    clip_number: z.number().int(),
    source_shot_numbers: z.array(z.number().int()),
    duration_seconds: z.number(),
    prompt: z.string().min(1),
    negative_motion_prompt: z.string().optional().default(""),
    audio_direction: z.string().optional(),
    start_frame_reference: z
      .object({ asset_id: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
    end_frame_reference: z
      .object({ asset_id: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const videoMotionPromptPackOutputBaseSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    video_plan_summary: z.object({}).passthrough(),
    provider_feasibility: z.object({}).passthrough().optional(),
    video_clip_requests: z.array(videoClipRequestSchema).min(1),
    plain_text_video_plan: z.string().min(1),
    final_episode_assembly_manifest: z.object({}).passthrough().optional(),
    repair_loop: z.object({}).passthrough().optional(),
  })
  .passthrough();

/**
 * Root-cause hardening (Phase 6, §6.6a): when the LLM ever produces the SAME
 * `prompt` string for two or more `video_clip_requests[]` entries — a failure
 * mode the schema itself never forbade — treat that response the same as a
 * schema-validation failure (`.superRefine` -> zod issue), so
 * `executeJsonPlanningCallWithRetry`'s existing one-shot same-model retry (see
 * that function's doc comment in `verticalDramaStoryBible.ts`) automatically
 * re-runs the call instead of a duplicate-prompt pack silently persisting to
 * `episode.motionPromptPack`. Trailing/leading whitespace is trimmed before
 * comparing so cosmetic formatting differences don't mask a real duplicate.
 * Investigation note: this codebase's actual persisted data + the one real
 * `video_motion_prompt_pack` LLM call so far (see Part A of the
 * Phase-6-§6.6 task) both already produce distinct per-clip prompts — this
 * check is a regression guard against the failure mode recurring, not
 * evidence it is currently happening.
 */
export const videoMotionPromptPackOutputSchema = videoMotionPromptPackOutputBaseSchema.superRefine(
  (value, ctx) => {
    const seen = new Map<string, number>();
    value.video_clip_requests.forEach((clip, index) => {
      const key = clip.prompt.trim();
      const firstIndex = seen.get(key);
      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["video_clip_requests", index, "prompt"],
          message: `video_clip_requests[${index}].prompt is identical to video_clip_requests[${firstIndex}].prompt (clip_number ${clip.clip_number}) — every clip must have a distinct motion prompt`,
        });
      } else {
        seen.set(key, index);
      }
    });
  },
);

export type VideoMotionPromptPackOutput = z.infer<typeof videoMotionPromptPackOutputBaseSchema>;

/**
 * Typed projection matching `VerticalDramaMotionPromptPack` from
 * `@shared/verticalDramaSeries` (minus `warnings`, which the pipeline fills
 * in) — this is the shape persisted into
 * `verticalDramaEpisodes.motionPromptPack` and used as the stage payload's
 * `clips` source before any sub-shot expansion.
 */
/**
 * One clip's dialogue line (storyboard-complete plan, Phase 3.1). Synced onto
 * `clips[j].dialogue` from `episode.dialogueAudioPlan` (raw
 * `vertical-drama-dialogue-audio-planner` skill output — `dialogue_lines[]`)
 * by `syncDialogueOntoMotionPromptClips` below whenever the motion-pack skill
 * output didn't already carry it via `.passthrough()`.
 */
export interface VerticalDramaMotionPromptClipDialogueLine {
  characterKey?: string;
  lineTh: string;
  emotion?: string;
  delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
  subtext?: string;
  /**
   * Additive (2026-07-07 unusable-dialogue fix) — set ONLY when this line
   * came from `resolveShotDialogueLines`'s script-fallback branch
   * (`server/routers/verticalDramaEpisodes.ts`'s `ShotDialogueLine.origin`),
   * i.e. it was auto-recovered from the script's freeform scene dialogue and
   * never reviewed by a dedicated dialogue-planning pass or a human edit.
   * Lets the storyboard panel surface a subtle "from the script — check it
   * sounds natural" hint. `undefined` everywhere else (default).
   */
  origin?: "script_fallback";
}

export interface VideoMotionPromptPackProjection {
  selectedVideoModelId: string;
  durationProfileId: string;
  /** The language the video-clip prompt TEXT is written in — echoed straight through from the caller-supplied language plan (see `projectMotionPromptPack`'s `languagePlan` param). Absent when the caller supplied none (defaults are applied downstream, never baked in here). */
  promptLanguage?: VerticalDramaPromptLanguage;
  /** The language the character(s) SPEAK in the video — echoed straight through from the caller-supplied language plan. */
  dialogueLanguage?: VerticalDramaDialogueLanguage;
  /** Thai regional speech accent — echoed straight through from the caller-supplied language plan. Only meaningful when `dialogueLanguage` is `"th"` (or absent, which defaults to Thai). */
  thaiAccent?: VerticalDramaThaiAccent;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  clips: Array<{
    clipNumber: number;
    sourceShotNumbers: number[];
    prompt: string;
    negativeMotionPrompt?: string;
    startFrameAssetId?: string;
    endFrameAssetId?: string;
    durationSeconds: number;
    /** Dialogue line(s) spoken during this clip (Phase 3.1) — optional, empty/omitted for silent clips. */
    dialogue?: VerticalDramaMotionPromptClipDialogueLine[];
    /** Speaker-aware sub-shots task (Package 5) — present only on a sub-shot clip produced by splitting a parent shot; mirrors `VerticalDramaMotionPromptPack["clips"][number].parentShotNumber` in `@shared/verticalDramaSeries/contracts.ts`. */
    parentShotNumber?: number;
    /** Speaker-aware sub-shots task (Package 5) — 1-based order within `parentShotNumber`. */
    subShotNumber?: number;
    /** Speaker-aware sub-shots task (Package 5) — see `VerticalDramaMotionPromptPack["clips"][number].requiredDisclosure`'s doc comment; attached only to the last sub-shot window's clip. */
    requiredDisclosure?: string;
    /** Speaker-aware sub-shots task (Package 5) — see `VerticalDramaMotionPromptPack["clips"][number].audioDirection`'s doc comment; attached only to the last sub-shot window's clip. */
    audioDirection?: string;
  }>;
}

/**
 * Preset visual identity flow-through for motion prompts (spec §8.2.2
 * flow-through rule, section-15 change D; flag `verticalDramaSeriesPresetMixV2`,
 * resolved/gated by the CALLER — this function never re-decides the flag,
 * same convention `verticalDramaCharacterImageGeneration.ts`'s
 * `buildPresetVisualIdentityInstruction` established for character prompts).
 * Deterministically appends the preset's `styleName`/`lighting` as short
 * style tokens onto a clip's final motion-prompt text — a CODE-level append
 * (not just an LLM instruction), mirroring `projectMotionPromptPack`'s own
 * `dialogueNote` append pattern below, so the tokens are guaranteed present
 * regardless of what the LLM's own prose happened to include (spec §8.2.2's
 * "verifiably real" blending philosophy — a mecha preset must not silently
 * degrade back to a generic-looking clip prompt).
 *
 * No-op (returns `prompt` unchanged) when `identity` is absent (flag off, or
 * the series carries no preset visual identity).
 *
 * DEFERRED for vertical-drama-skill-first-architecture plan, Phase 3, item 3
 * (2026-07-11) — NOT converted to skill input this phase, despite all 3
 * current call sites (`server/routers/verticalDramaEpisodes.ts`'s
 * `generateShotVideoPrompt`'s sub-shots loop, `generateShotVideoPrompt`'s
 * single-clip path, and `generateVideoClip`'s render-time formatter) living
 * in in-scope files. Investigation found this append is ALREADY only
 * partially "generation time": `generateShotVideoPrompt` persists the
 * preset-appended prompt onto `motionPromptPack.clips[]` (so it is really a
 * one-time planning-side append, same shape as the identity-lock fix this
 * phase DID complete), while `generateVideoClip` re-applies the SAME
 * non-idempotent append again at every render — a latent literal-duplicate-
 * text bug ("Preset style tokens (...)" appearing twice) independent of this
 * phase's scope. Properly completing this conversion requires: (a) threading
 * preset style/lighting facts into BOTH producing skills' own inputs —
 * `vertical-drama-video-motion-prompt-pack` (bulk planning, which today
 * never receives these tokens at all — confirmed via
 * `verticalDramaEpisodePipeline.ts`'s `generateRealMotionPromptPack`, out of
 * scope for this phase) and `vertical-drama-shot-video-prompt` (per-shot);
 * (b) rewriting skill.md for both; (c) removing all 3 call sites together so
 * the bulk-pack path doesn't regress to never carrying preset tokens at all.
 * That is substantial new cross-cutting work across the video pipeline, not
 * a pure deletion — deferred to a dedicated follow-up rather than rushed
 * alongside this phase's start-frame image changes (this phase's own
 * instructions: "be conservative... prefer... documented, low-risk
 * exception").
 */
export function appendPresetVisualIdentityStyleTokensToMotionPrompt(
  prompt: string,
  identity: Pick<VerticalDramaPresetVisualIdentity, "styleName" | "lighting"> | undefined,
): string {
  if (!identity?.styleName && !identity?.lighting) return prompt;
  const tokens = [
    identity.styleName ? `visual style: ${identity.styleName}` : null,
    identity.lighting ? `lighting: ${identity.lighting}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${prompt} Preset style tokens (${tokens}).`;
}

/** Project the raw skill output onto the pipeline's typed stage-payload shape. */
export function projectMotionPromptPack(
  raw: VideoMotionPromptPackOutput,
  /**
   * The model id to persist as `selectedVideoModelId` when the caller
   * already knows which model should be used — this is either (a) the
   * episode's own pre-existing `motionPromptPack.selectedVideoModelId` set
   * by the user via `setEpisodeModelSelection` (Vertical Drama Storyboard
   * Completion Plan, Phase 1.2 — "honor pre-existing user selection"), or
   * (b) a caller-supplied fallback/default when there is no prior
   * selection. Takes priority over the LLM's own `video_plan_summary
   * .video_model` string in both cases — see `projectStartFramePlan`'s
   * matching doc comment for the identical rationale (free-text LLM claims
   * must never silently override an explicit model choice).
   */
  callerVideoModelId: string,
  fallbackDurationProfileId: string,
  /**
   * Ground-truth dialogue per shot number. Appended deterministically to
   * each clip's final prompt (in addition to being given to the LLM as
   * context, see `buildUserPrompt`) so the spoken line reliably ends up in
   * the prompt actually sent to the video model, regardless of whether the
   * LLM chose to mention it.
   */
  shotDialogueByShotNumber?: Map<number, string>,
  /**
   * Episode-level language plan to echo straight through onto the projected
   * pack (episode-level language options wave) — this function never invents
   * or defaults these; the caller (`generateVideoMotionPromptPack` /
   * `verticalDramaEpisodePipeline.ts`'s `generateRealMotionPromptPack`) reads
   * the episode's pre-existing `motionPromptPack.promptLanguage`/
   * `dialogueLanguage` (set via `setEpisodeVideoPromptLanguage`) and passes it
   * here so a real regeneration never silently drops the user's language
   * choice — same "honor pre-existing selection" rationale as
   * `callerVideoModelId` above.
   */
  languagePlan?: {
    promptLanguage?: VideoMotionPromptPackProjection["promptLanguage"];
    dialogueLanguage?: VideoMotionPromptPackProjection["dialogueLanguage"];
    thaiAccent?: VideoMotionPromptPackProjection["thaiAccent"];
  },
): VideoMotionPromptPackProjection {
  const summary = raw.video_plan_summary as Record<string, unknown>;
  const selectedVideoModelId =
    callerVideoModelId ||
    (typeof summary?.video_model === "string" ? (summary.video_model as string) : callerVideoModelId);

  const hasBridgedClip = raw.video_clip_requests.some(
    (c) => c.start_frame_reference?.asset_id && c.end_frame_reference?.asset_id,
  );

  return {
    selectedVideoModelId,
    durationProfileId: fallbackDurationProfileId,
    ...(languagePlan?.promptLanguage ? { promptLanguage: languagePlan.promptLanguage } : {}),
    ...(languagePlan?.dialogueLanguage ? { dialogueLanguage: languagePlan.dialogueLanguage } : {}),
    ...(languagePlan?.thaiAccent ? { thaiAccent: languagePlan.thaiAccent } : {}),
    motionMode: hasBridgedClip ? "first_last_frame_bridge" : "first_frame_to_video",
    clips: raw.video_clip_requests
      .slice()
      .sort((a, b) => a.clip_number - b.clip_number)
      .map((c) => {
        const dialogueLines = c.source_shot_numbers
          .map((n) => shotDialogueByShotNumber?.get(n))
          .filter((v): v is string => typeof v === "string" && v.length > 0);
        const dialogueNote = dialogueLines.length
          ? ` Dialogue spoken during this clip: ${dialogueLines.map((l) => `"${l}"`).join(" / ")}.`
          : "";
        const audioNote = c.audio_direction ? ` SFX cues: ${c.audio_direction}` : "";
        return {
          clipNumber: c.clip_number,
          sourceShotNumbers: c.source_shot_numbers,
          prompt: `${c.prompt}${audioNote}${dialogueNote}`,
          negativeMotionPrompt: c.negative_motion_prompt ?? undefined,
          startFrameAssetId: c.start_frame_reference?.asset_id ?? undefined,
          endFrameAssetId: c.end_frame_reference?.asset_id ?? undefined,
          durationSeconds: c.duration_seconds,
          audioDirection: c.audio_direction ?? undefined,
        };
      }),
  };
}

/* -------------------------------------------------------------------------- */
/* Dialogue sync (storyboard-complete plan, Phase 3.1)                        */
/* -------------------------------------------------------------------------- */

/** Loosely-typed shape of one `dialogueAudioPlan.dialogue_lines[]` entry (raw skill output — snake_case, `.passthrough()`). */
interface RawDialoguePlanLine {
  shot_number?: number;
  clip_number?: number;
  speaker_character_id?: string;
  dialogue_line?: string;
  emotion?: string;
  delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
  subtext?: string;
}

/** Best-effort extraction of `dialogue_lines[]` from whatever shape `episode.dialogueAudioPlan` currently holds. */
function extractRawDialogueLines(dialogueAudioPlan: unknown): RawDialoguePlanLine[] {
  if (!dialogueAudioPlan || typeof dialogueAudioPlan !== "object") return [];
  const plan = dialogueAudioPlan as Record<string, unknown>;
  // Real skill output (snake_case) — the primary/expected shape once the
  // `dialogue_audio_plan` stage has a real generation path.
  if (Array.isArray(plan.dialogue_lines)) {
    return plan.dialogue_lines as RawDialoguePlanLine[];
  }
  // Today's dry-run placeholder (camelCase `shotLines`, see
  // `verticalDramaEpisodePipeline.ts`'s `buildStagePayload`) — has no
  // delivery/subtext/dialogue text yet, so nothing usable to sync; returning
  // [] here is correct (silence, not a crash).
  return [];
}

function rawLineToClipDialogueLine(
  line: RawDialoguePlanLine,
): VerticalDramaMotionPromptClipDialogueLine | null {
  if (!line.dialogue_line || !line.dialogue_line.trim()) return null;
  return {
    characterKey: line.speaker_character_id,
    lineTh: line.dialogue_line,
    emotion: line.emotion,
    delivery: line.delivery,
    subtext: line.subtext,
  };
}

/**
 * Map `dialogueAudioPlan` lines onto `pack.clips[j].dialogue` (Phase 3.1) —
 * ONLY for clips that don't already carry a `dialogue` array (the
 * `.passthrough()` skill schema may already include it if the LLM emitted
 * `provider_request`/dialogue fields directly; this never overwrites an
 * existing non-empty array). Matches primarily by `clip_number` (present on
 * the raw dialogue-planner output), falling back to matching by shot number
 * against the clip's `sourceShotNumbers` when a line has no `clip_number`.
 * Pure — no I/O — so it is unit-testable and safe to call unconditionally
 * whenever a motion-pack is (re)generated.
 */
export function syncDialogueOntoMotionPromptClips(
  pack: VideoMotionPromptPackProjection,
  dialogueAudioPlan: unknown,
): VideoMotionPromptPackProjection {
  const rawLines = extractRawDialogueLines(dialogueAudioPlan);
  if (rawLines.length === 0) return pack;

  const linesByClipNumber = new Map<number, VerticalDramaMotionPromptClipDialogueLine[]>();
  const linesByShotNumber = new Map<number, VerticalDramaMotionPromptClipDialogueLine[]>();
  for (const raw of rawLines) {
    const mapped = rawLineToClipDialogueLine(raw);
    if (!mapped) continue;
    if (typeof raw.clip_number === "number") {
      const bucket = linesByClipNumber.get(raw.clip_number) ?? [];
      bucket.push(mapped);
      linesByClipNumber.set(raw.clip_number, bucket);
    } else if (typeof raw.shot_number === "number") {
      const bucket = linesByShotNumber.get(raw.shot_number) ?? [];
      bucket.push(mapped);
      linesByShotNumber.set(raw.shot_number, bucket);
    }
  }

  if (linesByClipNumber.size === 0 && linesByShotNumber.size === 0) return pack;

  return {
    ...pack,
    clips: pack.clips.map((clip) => {
      // Passthrough may already carry dialogue (upstream LLM emitted it
      // directly) — never overwrite a non-empty existing array.
      if (clip.dialogue && clip.dialogue.length > 0) return clip;

      const byClip = linesByClipNumber.get(clip.clipNumber);
      if (byClip && byClip.length > 0) return { ...clip, dialogue: byClip };

      const byShot = clip.sourceShotNumbers
        .flatMap((shotNumber) => linesByShotNumber.get(shotNumber) ?? []);
      if (byShot.length > 0) return { ...clip, dialogue: byShot };

      return clip;
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Start-frame sync (video MCP submission fix)                                */
/* -------------------------------------------------------------------------- */

/**
 * Map the episode's approved start-frame render (`startFramePlan.frames[]
 * .approvedMediaAssetId` — ground truth chosen/approved by the user in the
 * storyboard panel) onto `pack.clips[j].startFrameAssetId` — ONLY for clips
 * that don't already carry one (the motion-prompt-pack LLM's own
 * `start_frame_reference.asset_id` free-text claim, when present, is never
 * overwritten). Without this sync, the LLM has no real asset ids to
 * reference (it is never given them — see `buildUserPrompt`) and almost
 * always emits nothing, so `clip.startFrameAssetId` ends up empty and
 * `generateVideoClip` (in `routers/verticalDramaEpisodes.ts`) resolves zero
 * `referenceImageUrls`, silently submitting the video MCP task (e.g.
 * Higgsfield) with no start-frame image at all — confirmed via
 * `mcp_media_tasks.parameters.referenceImageCount: 0` in production. Matches
 * `syncDialogueOntoMotionPromptClips`'s "ground truth over free-text LLM
 * claim" convention above. Pure — no I/O — safe to call unconditionally.
 */
export function syncStartFramesOntoMotionPromptClips(
  pack: VideoMotionPromptPackProjection,
  startFramePlan: unknown,
): VideoMotionPromptPackProjection {
  if (!startFramePlan || typeof startFramePlan !== "object") return pack;
  const plan = startFramePlan as { frames?: Array<{ shotNumber?: number; approvedMediaAssetId?: string }> };
  if (!Array.isArray(plan.frames) || plan.frames.length === 0) return pack;

  const approvedAssetIdByShotNumber = new Map<number, string>();
  for (const frame of plan.frames) {
    if (typeof frame.shotNumber === "number" && frame.approvedMediaAssetId) {
      approvedAssetIdByShotNumber.set(frame.shotNumber, frame.approvedMediaAssetId);
    }
  }
  if (approvedAssetIdByShotNumber.size === 0) return pack;

  return {
    ...pack,
    clips: pack.clips.map((clip) => {
      if (clip.startFrameAssetId) return clip;
      const primaryShotNumber = clip.sourceShotNumbers[0];
      const approvedAssetId =
        primaryShotNumber !== undefined
          ? approvedAssetIdByShotNumber.get(primaryShotNumber)
          : undefined;
      if (!approvedAssetId) return clip;
      return { ...clip, startFrameAssetId: approvedAssetId };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface GenerateVideoMotionPromptPackParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  durationSeconds: number;
  durationProfileId: string;
  selectedVideoModelId?: string;
  storyboardShots: Array<{
    shotNumber: number;
    description: string;
    durationSeconds: number;
    /**
     * The shot's spoken line (from the storyboard's `dialogue_excerpt` /
     * `subtitle_text`), when the shot has one. Without this, the motion-
     * prompt LLM only ever sees visual/camera description and produces
     * clip prompts with no notion of what's being said during the clip —
     * a real gap when the resulting video needs to imply speech/lip
     * movement matching actual dialogue.
     */
    dialogueExcerpt?: string;
  }>;
  /**
   * The language the video-clip PROMPT TEXT ITSELF must be written in
   * (episode-level language plan) — defaults to `"en"` when absent. See
   * `VerticalDramaPromptLanguage` in `@shared/verticalDramaSeries`.
   */
  promptLanguage?: VerticalDramaPromptLanguage;
  /**
   * The language the character(s) SPEAK in the video (episode-level language
   * plan) — defaults to `"th"` when absent. See
   * `VerticalDramaDialogueLanguage` in `@shared/verticalDramaSeries`.
   */
  dialogueLanguage?: VerticalDramaDialogueLanguage;
  /**
   * Thai regional speech accent (episode-level language plan) — only
   * meaningful when the effective `dialogueLanguage` is `"th"` (or absent,
   * which defaults to Thai); ignored otherwise. See `VerticalDramaThaiAccent`
   * in `@shared/verticalDramaSeries`.
   */
  thaiAccent?: VerticalDramaThaiAccent;
  /**
   * Part B3 (planning/`polished-toasting-gadget.md`) — compact episode
   * scene-setting plan context (ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง), built
   * via `formatStoryScriptEpisodePlanContext`. Reference-only, same
   * "do not copy verbatim" contract as `GenerateStartFrameRenderPlanParams
   * .episodePlanContext` — keeps clip prompts consistent with the episode's
   * planned scene without being pasted into any clip's own `prompt`.
   * Optional — omitted when the active breakdown has no matching item.
   */
  episodePlanContext?: string;
}

function buildUserPrompt(params: GenerateVideoMotionPromptPackParams): string {
  const promptLanguage = params.promptLanguage ?? "en";
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];
  const shotLines = params.storyboardShots
    .map((s) => {
      const dialogue = s.dialogueExcerpt ? ` | dialogue: "${s.dialogueExcerpt}"` : "";
      return `- Shot ${s.shotNumber} (${s.durationSeconds}s): ${s.description}${dialogue}`;
    })
    .join("\n");

  // Part B3 — reference-only episode scene-setting context, same
  // "do not copy verbatim" contract as `buildStartFrameRenderPlanUserPrompt`.
  const episodePlanContextBlock = params.episodePlanContext
    ? `บริบทฉากของตอน (อ้างอิงเพื่อความสอดคล้อง ห้ามคัดลอกลง output):\n${params.episodePlanContext}`
    : null;

  return [
    `Episode title: ${params.episodeTitle}`,
    `Episode duration: ${params.durationSeconds} seconds`,
    `Duration profile: ${params.durationProfileId}`,
    params.selectedVideoModelId ? `Preferred video model: ${params.selectedVideoModelId}` : null,
    episodePlanContextBlock,
    `Storyboard shots (bridge shots into motion clips per the skill's usual pairing strategy):\n${shotLines}`,
    `When a shot has a "dialogue" line, the resulting clip's "prompt" must explicitly mention the character speaking it and describe mouth/lip movement matching that line — do not produce a silent/mute description for a shot that has dialogue.`,
    `PROMPT LANGUAGE (MANDATORY): write every "video_clip_requests[].prompt" and "negative_motion_prompt" entirely in ${promptLanguageName} — all motion/acting/camera direction must be in ${promptLanguageName}, regardless of what language the dialogue is in.`,
    `SPEECH LANGUAGE (MANDATORY): the character(s) speak in ${dialogueLanguageName} in this video — any literal quoted dialogue embedded in a clip's prompt (native-audio models) or returned as a dialogue line must be in ${dialogueLanguageName}, adapted/translated naturally into ${dialogueLanguageName} if the source line above is shown in a different language.`,
    dialogueLanguage === "th" && params.thaiAccent
      ? `SPEECH ACCENT (MANDATORY): ${VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES[params.thaiAccent]} Apply this delivery direction to every spoken line.`
      : null,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate the `video_motion_prompt_pack` stage's real content via the
 * `vertical-drama-video-motion-prompt-pack` skill, using a direct
 * `executeWithFallback` LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateStoryboardShotgrid`'s check-credits -> call -> deduct-credits
 * convention.
 */
export async function generateVideoMotionPromptPack(
  params: GenerateVideoMotionPromptPackParams,
): Promise<{
  pack: VideoMotionPromptPackProjection;
  raw: VideoMotionPromptPackOutput;
  creditsUsed: number;
  model: string;
}> {
  // Rate limiting — reuses the shared `mediaGenerationLimiter` (this is a
  // paid LLM call, same per-user cap as `media.ts`'s generation mutations).
  // Checked first, before the credit check / LLM call.
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Same truncation flaw and fix as `generateStartFrameRenderPlan` — 9
  // enriched per-shot clips (Phase 3B skill upgrades) previously truncated
  // the old 4000-token ceiling mid-array. Raised, plus one automatic
  // same-model retry on truncated/invalid JSON — see
  // `executeJsonPlanningCallWithRetry`'s doc comment.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    userId: params.userId,
    maxTokens: 16000,
    schema: videoMotionPromptPackOutputSchema,
    label: "Video motion prompt pack",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate video motion prompt pack (episode #${params.episodeId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  const shotDialogueByShotNumber = new Map(
    params.storyboardShots
      .filter((s) => s.dialogueExcerpt)
      .map((s) => [s.shotNumber, s.dialogueExcerpt as string]),
  );
  const pack = projectMotionPromptPack(
    validatedData,
    params.selectedVideoModelId ?? "dry-run-video-model",
    params.durationProfileId,
    shotDialogueByShotNumber,
    {
      promptLanguage: params.promptLanguage,
      dialogueLanguage: params.dialogueLanguage,
      thaiAccent: params.thaiAccent,
    },
  );

  return { pack, raw: validatedData, creditsUsed, model };
}

/* -------------------------------------------------------------------------- */
/* Per-shot, image-grounded video prompt generation (Phase 6, §6.6b)          */
/* -------------------------------------------------------------------------- */

/**
 * Vision-support investigation (Phase 6, §6.6b task instructions, part 1):
 *
 * `executeWithFallback` (`llmRouter.ts`) and the shared `Message` type
 * (`server/_core/llm.ts`) already support multimodal input — `Message.content`
 * accepts `ImageContent` (`{ type: "image_url", image_url: { url, detail? } }`)
 * alongside plain text, and the "Responses" API-style providers get this
 * normalized into `input_image` parts (`llmRouter.ts` lines ~34, ~341-348).
 * A REAL precedent already sends an image this way straight through
 * `executeWithFallback`:
 * `productReferenceStoryboardSkillRunner.ts`'s `buildVisionMessages()` builds
 * a `user` message whose `content` is `[{ type: "text", text }, ...referenceImages
 * .map(url => ({ type: "image_url", image_url: { url, detail: "high" } }))]`
 * and passes it directly to `executeWithFallback({ model, messages, ... })` —
 * no separate "vision endpoint", it is the same chat-completions call this
 * module already makes for the motion-prompt-pack.
 *
 * There is, however, no per-call enforcement that the RESOLVED model actually
 * has vision support — `resolveQualityLargeContextModelId()` (used
 * everywhere else in this file, Phase 6 of
 * `planning/vertical-drama-centralized-model-policy/plan.md`) only requires
 * context ≥1M/non-free/thinking-capable, not vision. `intelligentModel
 * Selector.ts`'s `CapabilityRequirements`/`selectBestLlmModel` DOES expose a
 * `supportsVision` flag, so `resolveShotVideoPromptModel` below explicitly
 * requires it (falling back to `resolveQualityLargeContextModelId()`'s
 * non-vision default only when no enabled model declares vision support, per
 * the task's "closest viable alternative" instruction) — and in EITHER case, the
 * shot's `imagePrompt` text is always folded into the user message too, so a
 * non-vision model still gets a rich textual description of what the start
 * frame contains, never just a bare image the model cannot see.
 */

const SHOT_VIDEO_PROMPT_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-shot-video-prompt",
);

let cachedShotVideoPromptSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-shot-video-prompt` skill's markdown body verbatim
 * — same resolution strategy as `loadSkillSystemPrompt()` above, kept as a
 * separate cache/function because this is a distinct, focused skill (see
 * this module's doc comment on why a new skill instead of overloading the
 * pack-level one).
 */
function loadShotVideoPromptSystemPrompt(): string {
  if (cachedShotVideoPromptSystemPrompt) return cachedShotVideoPromptSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SHOT_VIDEO_PROMPT_SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedShotVideoPromptSystemPrompt = content;
        return cachedShotVideoPromptSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-shot-video-prompt" under any known skills directory`,
  );
}

/**
 * Resolve a vision-capable model when one is enabled; falls back to the
 * non-vision default (see the vision-support doc comment above). Routes the
 * non-vision fallback through the centralized per-series override resolver
 * (`planning/vertical-drama-centralized-model-policy/plan.md`, Phase 3) so a
 * series-wide `llmModelPolicy.defaultModelId` override wins there too — the
 * vision-capability requirement above is left untouched (an explicit
 * override still can't be honored when it lacks vision support and the call
 * has an image attached, mirroring `resolveAdBannerPromptModel`'s identical
 * shape).
 */
async function resolveShotVideoPromptModel(
  seriesId: number,
): Promise<{ model: string; hasVision: boolean }> {
  try {
    const rows = await loadEnabledLlmModelRows();
    if (rows.length > 0) {
      const visionModel = selectBestLlmModel(
        { supportsVision: true, supportsStructuredOutputs: true },
        rows,
      );
      if (visionModel) return { model: visionModel, hasVision: true };
    }
  } catch {
    // Fall through to the non-vision default below.
  }
  const fallbackModel = await resolveVerticalDramaSeriesModel(
    seriesId,
    resolveQualityLargeContextModelId,
  );
  return { model: fallbackModel, hasVision: false };
}

const shotVideoPromptOutputSchema = z
  .object({
    prompt: z.string().min(1),
    negative_motion_prompt: z.string().optional().default(""),
    dialogue: z
      .array(
        z.object({
          characterKey: z.string().optional(),
          lineTh: z.string().min(1),
          emotion: z.string().optional(),
          delivery: z
            .object({
              tone: z.string().optional(),
              pace: z.string().optional(),
              pauses: z.string().optional(),
              texture: z.string().optional(),
            })
            .optional(),
          subtext: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
    /**
     * Category-mandated Thai-law disclosure line (spec §13 extension), e.g.
     * "อ่านคำเตือนในฉลากก่อนบริโภค" for อาหารเสริม — present only when the
     * shot carries a product tie-in whose category requires one (see
     * `buildThaiAdComplianceInstruction`). Absent/omitted for silent clips,
     * non-tie-in shots, or categories with no mandated line.
     */
    requiredDisclosure: z.string().optional(),
    /**
     * Vertical Drama task #36 — model-directed ambient bed + SFX cues for
     * this shot; the skill only produces this when the caller's payload
     * stated `native_audio: true` (see `buildShotVideoPromptUserPrompt`'s
     * `nativeAudioEnabled` branch below). Optional/additive — every
     * pre-existing response (and every model that ignores the instruction)
     * validates unchanged.
     */
    audio_direction: z.string().optional(),
  })
  .passthrough();

export type ShotVideoPromptOutput = z.infer<typeof shotVideoPromptOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Shared vision-aware executeWithFallback -> extractJson -> schema-validate  */
/* retry harness (speaker-aware sub-shots task) — used by BOTH               */
/* `generateVerticalDramaShotVideoPrompt` and                                 */
/* `generateVerticalDramaShotVideoPromptSubShots` below, so the "one retry on */
/* truncated/invalid JSON with a raised token ceiling" pattern is defined     */
/* exactly once instead of copy-pasted per generator. Deliberately local to   */
/* this file (NOT the shared `executeJsonPlanningCallWithRetry` in            */
/* `verticalDramaStoryBible.ts`) — that helper only accepts a plain string     */
/* `userPrompt`, but both callers here need the vision-aware `image_url`      */
/* content shape (see this module's earlier vision-support doc comment).      */
/* -------------------------------------------------------------------------- */

type VisionAwareContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } }
    >;

/** Build the vision-aware message content: text+image array when vision is available, plain text otherwise. */
function buildVisionAwareContent(
  text: string,
  hasVision: boolean,
  imageUrl: string,
): VisionAwareContent {
  return hasVision
    ? [
        { type: "text" as const, text },
        {
          type: "image_url" as const,
          image_url: { url: imageUrl, detail: "high" as const },
        },
      ]
    : text;
}

type VisionAwareCallResponse = Awaited<ReturnType<typeof executeWithFallback>> extends infer R
  ? R extends { type: "success"; response: infer Resp }
    ? Resp
    : never
  : never;

/** ONE executeWithFallback -> extractJson -> zod-safeParse attempt (no retry). Throws `VdSchemaValidationError` on a malformed/truncated response. */
async function runVisionAwareJsonAttempt<T>(args: {
  model: string;
  systemPrompt: string;
  content: VisionAwareContent;
  userId: number;
  maxTokens: number;
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } };
}): Promise<{ data: T; response: VisionAwareCallResponse }> {
  const result = await executeWithFallback({
    model: args.model,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.content },
    ],
    stream: false,
    userId: args.userId,
    maxTokens: args.maxTokens,
    temperature: 0.7,
  });

  if (result.type !== "success") {
    throw new Error(
      result.type === "error"
        ? `LLM request failed: ${result.error}`
        : "LLM request did not reach a successful provider response",
    );
  }

  const responseContent = result.response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(responseContent);
  const validation = args.schema.safeParse(parsed);
  if (!validation.success) {
    throw new VdSchemaValidationError(
      "Shot video prompt response failed schema validation",
      validation.error,
    );
  }
  return { data: validation.data as T, response: result.response };
}

/**
 * Wraps `runVisionAwareJsonAttempt` with the ONE-retry-on-truncation/
 * validation-failure convention already established for this module's shot-
 * level generators: on a `VdSchemaValidationError`, retries exactly once with
 * (a) an appended strict-JSON instruction and (b) a higher `retryMaxTokens`
 * ceiling. Any other error (rate limit, provider failure) is never retried
 * here — it propagates immediately.
 */
async function executeVisionAwareJsonCallWithRetry<T>(args: {
  model: string;
  systemPrompt: string;
  userPromptText: string;
  hasVision: boolean;
  imageUrl: string;
  userId: number;
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } };
  firstAttemptMaxTokens: number;
  retryMaxTokens: number;
}): Promise<{ data: T; response: VisionAwareCallResponse }> {
  try {
    return await runVisionAwareJsonAttempt<T>({
      model: args.model,
      systemPrompt: args.systemPrompt,
      content: buildVisionAwareContent(args.userPromptText, args.hasVision, args.imageUrl),
      userId: args.userId,
      maxTokens: args.firstAttemptMaxTokens,
      schema: args.schema,
    });
  } catch (firstError) {
    if (!(firstError instanceof VdSchemaValidationError)) throw firstError;
    const retryText = `${args.userPromptText}\n\nYour previous response was truncated or was not valid JSON. Return ONLY complete, valid, compact JSON (no markdown fences, no commentary, no trailing text).`;
    return runVisionAwareJsonAttempt<T>({
      model: args.model,
      systemPrompt: args.systemPrompt,
      content: buildVisionAwareContent(retryText, args.hasVision, args.imageUrl),
      userId: args.userId,
      maxTokens: args.retryMaxTokens,
      schema: args.schema,
    });
  }
}

export interface GenerateVerticalDramaShotVideoPromptParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  /** Publicly-fetchable URL of the shot's current approved main image (the start frame this clip continues from). */
  imageUrl: string;
  /** The prompt that generated `imageUrl` — always folded in as a textual proxy, see this module's vision doc comment. */
  imagePrompt?: string;
  shotContext: {
    description?: string;
    camera?: string;
    emotion?: string;
    /** Dialogue line(s) spoken during this shot, in delivery order, when the shot has dialogue. */
    dialogueLines?: Array<{
      characterKey?: string;
      lineTh: string;
      emotion?: string;
      delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
      subtext?: string;
    }>;
    /**
     * Compact "key = name (role): descriptor" character identity map
     * (2026-07-07 non-human-character-vanishing fix), pre-built by the
     * router via `buildCharacterIdentityMapBlock` from this shot's required
     * character rows — see `@shared/verticalDramaSeries/characterIdentityMap.ts`.
     * When present, injected verbatim into the user prompt so the model
     * knows each required character's real identity (species/age) instead
     * of inferring a generic human figure from the bare `characterKey`
     * mentions already baked into `description`/`imagePrompt`. `undefined`
     * when the shot has no required characters or none resolved to a known
     * row (falls back to the pre-existing behavior).
     */
    characterIdentityMap?: string;
    /**
     * Product tie-in context (spec §13) — present ONLY when this shot is a
     * tie-in shot per the script stage's `product_tie_in_plan.tie_ins[]`
     * (see `verticalDramaProductTieIn.ts`'s `extractShotProductPlacements`).
     * When present, the skill must naturally reference the product/its
     * benefit in a dialogue line or acting beat for this clip — never a
     * hard-sell line, must fit the scene's emotion.
     */
    productContext?: {
      productName?: string;
      benefitTalkingPoint?: string;
      placementStyle?: "hero_prop" | "background" | "in_use_moment";
      /** Additive (2026-07-06 Thai ad-compliance upgrade) — drives the mandatory disclosure line, see `buildThaiAdComplianceInstruction`. */
      productCategory?: string;
    };
  };
  selectedVideoModelId: string;
  /** The resolved video model row, so the native-audio/dialogue decision below matches `verticalDramaVideoPromptFormatter.ts`'s capability logic exactly. */
  selectedVideoModel: Pick<ModelDefinition, "type" | "aspectRatios" | "configJson" | "provider" | "aliases"> & {
    id?: string;
  };
  locale: VerticalDramaSeriesLocale;
  /**
   * The language the video-clip PROMPT TEXT ITSELF must be written in
   * (episode-level language plan) — defaults to `"en"` when the caller has
   * no explicit `motionPromptPack.promptLanguage` set. Distinct from
   * `dialogueLanguage`: this only governs the acting/motion-direction prose,
   * never the literal spoken line.
   */
  promptLanguage?: VerticalDramaPromptLanguage;
  /**
   * The language the character(s) SPEAK in the video (episode-level language
   * plan) — defaults to `"th"` when absent. Governs the literal dialogue
   * transcript embedded verbatim for native-audio models (and the
   * `lineTh`/`dialogue[]` lines returned for the separate-TTS path).
   */
  dialogueLanguage?: VerticalDramaDialogueLanguage;
  /**
   * Thai regional speech accent (episode-level language plan) — only
   * meaningful when the effective `dialogueLanguage` is `"th"` (or absent,
   * which defaults to Thai); ignored otherwise. See `VerticalDramaThaiAccent`
   * in `@shared/verticalDramaSeries`.
   */
  thaiAccent?: VerticalDramaThaiAccent;
  /**
   * Story-density reform (spec §7.7.2 Layer 4, section-13, added
   * 2026-07-07) — this shot's resolved clip duration in seconds. Optional
   * so callers/tests that predate this field (or the
   * `verticalDramaSeriesSpeechBudget` flag being off) are byte-identical;
   * only rendered into the prompt when BOTH this and `targetSpeechSeconds`
   * are provided. First-pass duration awareness — previously only
   * `generateVerticalDramaClipDialogue`'s regeneration path
   * (`buildClipDialogueUserPrompt`, this file) stated a duration/target-
   * speech band; this brings the FIRST-pass video prompt builder to parity.
   */
  shotDurationSeconds?: number;
  /**
   * This shot's target spoken-dialogue seconds — the caller resolves this
   * via the canonical `targetVerticalDramaSpeechSeconds(shotDurationSeconds)`
   * (never a second speech-rate model, spec §7.7.1 hard rule 1). Optional,
   * same flag-off/byte-identical rationale as `shotDurationSeconds`.
   */
  targetSpeechSeconds?: number;
  /**
   * Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt option,
   * added 2026-07-09) — the CALLER's already-resolved decision of whether
   * this generation should request native ambient bed + SFX prompt
   * direction, i.e. the user's persisted `pack.nativeAudioEnabled`
   * preference ANDed with the rollout gate (`VD_NATIVE_AUDIO_PROMPTS_ROLLOUT`
   * in `@shared/verticalDramaSeries/nativeAudioPrompts`) — the router
   * resolves BOTH before calling this function. This function still ANDs its
   * own model-CAPABILITY check on top (`capabilities.supportsNativeAudio`,
   * resolved from `selectedVideoModel` below) before actually activating the
   * skill's NATIVE AUDIO DIRECTION section, mirroring exactly how
   * `nativeAudioDialogue` is resolved internally rather than pre-computed by
   * the caller. Optional/omitted (falsy) preserves today's byte-identical
   * prompt output — no new instruction text, no `audioDirection` on the
   * result.
   */
  nativeAudioEnabled?: boolean;
  idempotencyKey?: string;
  /**
   * Part B3 (planning/`polished-toasting-gadget.md`) — compact episode
   * scene-setting plan context, same shape/contract as
   * `GenerateVideoMotionPromptPackParams.episodePlanContext` (this is the
   * per-shot sibling builder). Episode-level (not shot-level), so it lives
   * at the top of this params object alongside `locale`/`promptLanguage`
   * rather than inside `shotContext`. Optional — omitted when the active
   * breakdown has no matching item.
   */
  episodePlanContext?: string;
}

export interface GenerateVerticalDramaShotVideoPromptResult {
  prompt: string;
  negativeMotionPrompt?: string;
  dialogue?: Array<{
    characterKey?: string;
    lineTh: string;
    emotion?: string;
    delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
    subtext?: string;
  }>;
  creditsUsed: number;
  model: string;
  /** True when the resolved model actually received the image (vision path); false when only the textual `imagePrompt` proxy was used. */
  usedVision: boolean;
  /** Category-mandated Thai-law disclosure line, see `ShotVideoPromptOutput.requiredDisclosure`. */
  requiredDisclosure?: string;
  /**
   * Vertical Drama task #36 — this shot's model-directed ambient bed + SFX
   * cues (SFX cues tied to visible on-screen actions first, ambient
   * soundscape second — see the skill's "NATIVE AUDIO DIRECTION" section).
   * Only ever set when `params.nativeAudioEnabled` AND the resolved model's
   * `supportsNativeAudio` capability were BOTH true for this call — always
   * `undefined` otherwise, so callers that never opt in see byte-identical
   * results. A SEPARATE field, never inlined into `prompt` here — see
   * `VerticalDramaMotionPromptPack["clips"][number].audioDirection`'s own
   * doc comment (`@shared/verticalDramaSeries/contracts`) for why.
   */
  audioDirection?: string;
}

function buildShotVideoPromptUserPrompt(
  params: GenerateVerticalDramaShotVideoPromptParams,
  nativeAudioDialogue: boolean,
  nativeAudioDirectionEnabled: boolean,
): string {
  const { shotContext } = params;
  const promptLanguage = params.promptLanguage ?? "en";
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];
  const dialogueLines = shotContext.dialogueLines ?? [];
  const dialogueBlock = dialogueLines.length
    ? dialogueLines
        .map((l, i) => {
          const parts = [`${i + 1}. ${l.characterKey ?? "character"}: "${l.lineTh}"`];
          if (l.emotion) parts.push(`emotion: ${l.emotion}`);
          if (l.delivery?.tone) parts.push(`tone: ${l.delivery.tone}`);
          if (l.delivery?.pace) parts.push(`pace: ${l.delivery.pace}`);
          if (l.delivery?.pauses) parts.push(`pauses: ${l.delivery.pauses}`);
          if (l.delivery?.texture) parts.push(`voice texture: ${l.delivery.texture}`);
          if (l.subtext) parts.push(`subtext: ${l.subtext}`);
          return parts.join(" | ");
        })
        .join("\n")
    : "(no source dialogue line was found for this shot — see the NO-SOURCE-DIALOGUE instruction below for what to do)";

  return [
    `Shot number: ${params.shotNumber}`,
    typeof params.shotDurationSeconds === "number"
      ? `Clip duration: ${params.shotDurationSeconds}s`
      : null,
    // Story-density reform (spec §7.7.2 Layer 4, section-13, added
    // 2026-07-07) — mirrors `buildClipDialogueUserPrompt`'s identical
    // duration/target-speech phrasing above so both the FIRST-pass prompt
    // (this function) and the regeneration path state the band consistently.
    typeof params.shotDurationSeconds === "number" && typeof params.targetSpeechSeconds === "number"
      ? `Target spoken-dialogue duration: about ${params.targetSpeechSeconds.toFixed(1)}s total across all returned lines. Avoid one-line dialogue that only fills 1-2 seconds of an 8-second clip unless the user explicitly requests silence.`
      : null,
    shotContext.description ? `Shot description: ${shotContext.description}` : null,
    shotContext.camera ? `Camera setup: ${shotContext.camera}` : null,
    shotContext.emotion ? `Shot emotion: ${shotContext.emotion}` : null,
    // Part B3 — reference-only episode scene-setting context, same
    // "do not copy verbatim" contract as the start-frame/pack-level builders.
    params.episodePlanContext
      ? `บริบทฉากของตอน (อ้างอิงเพื่อความสอดคล้อง ห้ามคัดลอกลง output):\n${params.episodePlanContext}`
      : null,
    params.imagePrompt
      ? `The attached image was generated from this exact prompt (use it as a precise textual description of what the start frame shows, in addition to analyzing the attached image directly): ${params.imagePrompt}`
      : null,
    shotContext.characterIdentityMap ?? null,
    `Dialogue for this shot (source lines, already in ${dialogueLanguageName}):\n${dialogueBlock}`,
    dialogueLines.length === 0
      ? `NO-SOURCE-DIALOGUE (MANDATORY): no dialogue line was supplied for this shot. If the shot description/camera setup above clearly implies a character is speaking (e.g. mentions talking, calling out, answering, a line of dialogue, or a mouth-open speaking beat), WRITE one short, natural line yourself (1 sentence, fitting the scene's emotion) in ${dialogueLanguageName}, and return it in the "dialogue" array. Otherwise (the shot is genuinely silent/ambient — no character is depicted speaking), leave "dialogue" as an empty array and do NOT invent speech.`
      : null,
    shotContext.productContext
      ? `PRODUCT TIE-IN (MANDATORY for this shot): the tied-in product is placed in this shot (${shotContext.productContext.placementStyle ?? "in_use_moment"}). Naturally reference the product GENERICALLY (e.g. "the product", a category descriptor — NEVER the brand/product name itself, which must never appear in the "prompt"/"negative_motion_prompt"/dialogue text) or its benefit${shotContext.productContext.benefitTalkingPoint ? ` (e.g. "${shotContext.productContext.benefitTalkingPoint}")` : ""} in a dialogue line or acting beat for this clip — it must sound like a real character moment, never a hard-sell or advertisement line, and must fit the scene's emotion. Brand identity comes ONLY from the attached/locked reference image, never from prompt or dialogue text. ${VD_PRODUCT_LOCK_VIDEO_INSTRUCTION}`
      : null,
    shotContext.productContext
      ? buildThaiAdComplianceInstruction(shotContext.productContext.productCategory)
      : null,
    shotContext.productContext
      ? "Public-figure/brand guard (MANDATORY): never name a real public figure, celebrity, or real company/brand anywhere in the \"prompt\", \"negative_motion_prompt\", or dialogue text."
      : null,
    `PROMPT LANGUAGE (MANDATORY): write the "prompt" and "negative_motion_prompt" fields entirely in ${promptLanguageName} — every word of the motion/acting/camera direction must be in ${promptLanguageName}, regardless of what language the dialogue is in.`,
    `SPEECH LANGUAGE (MANDATORY): the character(s) speak in ${dialogueLanguageName} in this video. When dialogue is present, the "dialogue[].lineTh" field must contain the line verbatim in ${dialogueLanguageName} (translate/adapt naturally into ${dialogueLanguageName} if the source line above is in a different language — never leave it in the wrong language).`,
    dialogueLanguage === "th" && params.thaiAccent
      ? `SPEECH ACCENT (MANDATORY): ${VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES[params.thaiAccent]} Apply this delivery direction to every spoken line.`
      : null,
    nativeAudioDialogue
      ? `The selected video model (${params.selectedVideoModelId}) supports native lip-synced audio — when dialogue is present, embed the ${dialogueLanguageName} line(s) VERBATIM in the prompt (written in ${promptLanguageName} elsewhere, but the quoted spoken line itself stays in ${dialogueLanguageName}) with matching mouth/lip movement and delivery direction, and return them again in the "dialogue" array.`
      : `The selected video model (${params.selectedVideoModelId}) has NO native lip-sync/audio channel — when dialogue is present, describe mouth movement + acting direction only (in ${promptLanguageName}, no literal transcript in the prompt), and return the resolved ${dialogueLanguageName} lines in the "dialogue" array so the caller can route them to text-to-speech.`,
    // Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
    // option) — states `native_audio: true` verbatim so the skill's
    // conditional NATIVE AUDIO DIRECTION section activates (see
    // skill.md's own trigger-condition wording). Omitted entirely
    // (`null`, filtered out below) when the caller/capability didn't
    // resolve to true — the user prompt text is then byte-identical to
    // before this task.
    nativeAudioDirectionEnabled
      ? `NATIVE AUDIO DIRECTION (native_audio: true): the selected video model (${params.selectedVideoModelId}) generates synchronized audio natively as part of the clip — return an additional "audio_direction" field directing the model's own in-clip audio for this shot: SFX cues tied to this shot's visible on-screen actions FIRST (primary, always produce), then a brief ambient soundscape matched to the scene's mood/location and this shot's emotional-beat intensity SECOND (secondary enrichment). NEVER include speech/dialogue/voices/vocals (dialogue comes only from "dialogue"/text-to-speech) and NEVER include music/melody/lyrics/score (a separate background-music layer owns that) in "audio_direction".`
      : null,
    `Locale: ${params.locale}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * True when every dialogue line's `lineTh` text appears verbatim somewhere in
 * `prompt` (normalizing curly/straight quotes since the LLM may substitute
 * one style for the other around the embedded line). Used to catch the
 * silent-non-compliance failure mode where the model was correctly told the
 * selected video model has native lip-synced audio (see
 * `buildShotVideoPromptUserPrompt`'s `nativeAudioDialogue` branch) but still
 * wrote descriptive "mouth moves in sync"-style prose instead of quoting the
 * line — 2026-07-07 fix, see the shot 4/series 4/episode 11 bug report.
 */
function promptEmbedsDialogueVerbatim(
  prompt: string,
  dialogueLines: Array<{ lineTh: string }>,
): boolean {
  if (dialogueLines.length === 0) return true;
  const normalize = (s: string) => s.replace(/[""''`]/g, "").replace(/\s+/g, " ").trim();
  const normalizedPrompt = normalize(prompt);
  return dialogueLines.every((line) => {
    const normalizedLine = normalize(line.lineTh);
    return normalizedLine.length > 0 && normalizedPrompt.includes(normalizedLine);
  });
}

/**
 * Generate ONE shot's image-grounded video-clip prompt (Phase 6, §6.6b) —
 * analyzes the shot's current approved main image (or, absent real vision
 * support, its generating `imagePrompt` as a textual proxy — see this
 * module's vision-support doc comment) and produces a MOVEMENT/emotion/
 * atmosphere/camera-continuation prompt. Deliberately never describes
 * character appearance — the attached image (or its prompt proxy) already
 * carries identity, so re-describing it would waste prompt budget and risks
 * contradicting the actual image. Credit-gated + idempotency-keyed exactly
 * like every other Vertical Drama paid LLM call in this file; the router
 * mutation (out of scope here — see the Phase 6 §6.6 mutation spec) is
 * responsible for resolving `shotNumber` -> `imageUrl` via
 * `approvedMediaAssetId` and rejecting with `PRECONDITION_FAILED` when no
 * image exists yet.
 */
export async function generateVerticalDramaShotVideoPrompt(
  params: GenerateVerticalDramaShotVideoPromptParams,
): Promise<GenerateVerticalDramaShotVideoPromptResult> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const { model, hasVision } = await resolveShotVideoPromptModel(params.seriesId);
  const systemPrompt = loadShotVideoPromptSystemPrompt();

  const capabilities = resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
    type: params.selectedVideoModel.type,
    aspectRatios: params.selectedVideoModel.aspectRatios,
    configJson: params.selectedVideoModel.configJson,
  });
  const nativeAudioDialogue = capabilities.nativeAudioDialogue === true;
  // Vertical Drama task #36 — the caller (router) already resolved the
  // rollout gate + the user's persisted preference into
  // `params.nativeAudioEnabled`; this function ANDs its own model-capability
  // check on top, mirroring `nativeAudioDialogue` immediately above.
  const nativeAudioDirectionEnabled =
    params.nativeAudioEnabled === true && capabilities.supportsNativeAudio === true;
  // Kept for parity with `verticalDramaVideoPromptFormatter.ts`'s own family
  // detection (not otherwise used here — the formatter is the single place
  // that builds the final provider-submitted prompt/payload; this function
  // only produces the base motion prompt + dialogue for it to format).
  void detectProviderFamily;

  const userPromptText = buildShotVideoPromptUserPrompt(
    params,
    nativeAudioDialogue,
    nativeAudioDirectionEnabled,
  );

  let outcome = await executeVisionAwareJsonCallWithRetry<ShotVideoPromptOutput>({
    model,
    systemPrompt,
    userPromptText,
    hasVision,
    imageUrl: params.imageUrl,
    userId: params.userId,
    schema: shotVideoPromptOutputSchema,
    firstAttemptMaxTokens: 2000,
    retryMaxTokens: 4000,
  });

  // Verbatim-embedding compliance check (2026-07-07 fix): the model was
  // correctly instructed that the selected video model has native lip-synced
  // audio and to quote the line(s) verbatim, but weaker models (e.g. "nano"
  // tiers) sometimes ignore this and write descriptive "mouth moves in sync"
  // prose instead — see this file's bug report for a real repro. One
  // corrective retry with an explicit, unambiguous instruction before giving
  // up and returning the model's (still schema-valid) best effort.
  if (
    nativeAudioDialogue &&
    !promptEmbedsDialogueVerbatim(outcome.data.prompt, outcome.data.dialogue ?? [])
  ) {
    try {
      const dialogueForRetry = outcome.data.dialogue ?? [];
      const quotedLines = dialogueForRetry
        .map((l) => `"${l.lineTh}"`)
        .join(", ");
      const complianceRetryText = `${userPromptText}\n\nCOMPLIANCE CORRECTION (MANDATORY): your previous "prompt" did NOT include the dialogue line(s) verbatim in quotes — it only described mouth movement. This video model DOES support native lip-synced audio, so you MUST quote the exact spoken line(s) ${quotedLines} inside "prompt", each wrapped in quotation marks exactly as given, alongside the acting/delivery direction. Rewrite "prompt" now so it contains the verbatim quoted line(s).`;
      const correctedOutcome = await runVisionAwareJsonAttempt<ShotVideoPromptOutput>({
        model,
        systemPrompt,
        content: buildVisionAwareContent(complianceRetryText, hasVision, params.imageUrl),
        userId: params.userId,
        maxTokens: 2000,
        schema: shotVideoPromptOutputSchema,
      });
      if (
        promptEmbedsDialogueVerbatim(
          correctedOutcome.data.prompt,
          correctedOutcome.data.dialogue ?? dialogueForRetry,
        )
      ) {
        outcome = correctedOutcome;
      }
      // If the corrective retry still doesn't comply, keep the original
      // (still schema-valid) outcome rather than throwing — a slightly
      // non-compliant prompt is better than a hard failure on a paid call.
    } catch {
      // Corrective retry is best-effort only; never fail the whole call
      // over it — keep the original outcome.
    }
  }

  const { data, response } = outcome;
  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate shot video prompt (episode #${params.episodeId}, shot #${params.shotNumber})`,
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      shotNumber: params.shotNumber,
      usedVision: hasVision,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  const resolvedAudioDirection = nativeAudioDirectionEnabled
    ? data.audio_direction || undefined
    : undefined;

  return {
    prompt: resolvedAudioDirection
      ? `${data.prompt} SFX cues: ${resolvedAudioDirection}`
      : data.prompt,
    negativeMotionPrompt: data.negative_motion_prompt || undefined,
    dialogue: data.dialogue,
    creditsUsed,
    model,
    usedVision: hasVision,
    requiredDisclosure: data.requiredDisclosure || undefined,
    audioDirection: resolvedAudioDirection,
  };
}

/* -------------------------------------------------------------------------- */
/* Speaker-switch sub-shots (shot-reverse-shot split, speaker-aware sub-shots  */
/* task) — generates ALL of a split shot's sub-shot prompts in ONE LLM call,  */
/* so the model can write a coherent reverse-shot arc across the whole shot   */
/* instead of N independent, context-blind calls. Sibling to                  */
/* `generateVerticalDramaShotVideoPrompt` above (which stays completely       */
/* untouched — every shot that does NOT need splitting keeps using it exactly */
/* as before); the SPLIT DECISION itself is made deterministically, with no   */
/* LLM call, by `computeSpeakerSwitchSubShotPlan`                             */
/* (`@shared/verticalDramaSeries/subShots.ts`) — the caller (router) computes  */
/* the `subShotWindows` BEFORE calling this function.                         */
/* -------------------------------------------------------------------------- */

const SHOT_VIDEO_PROMPT_SUBSHOTS_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-shot-video-prompt-subshots",
);

let cachedShotVideoPromptSubShotsSystemPrompt: string | null = null;

/** Same skill.md-loader resolution strategy as `loadShotVideoPromptSystemPrompt()` — separate cache/function because this is a distinct skill file (different response contract: N sub-shots per call, not one). */
function loadShotVideoPromptSubShotsSystemPrompt(): string {
  if (cachedShotVideoPromptSubShotsSystemPrompt) return cachedShotVideoPromptSubShotsSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SHOT_VIDEO_PROMPT_SUBSHOTS_SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedShotVideoPromptSubShotsSystemPrompt = content;
        return cachedShotVideoPromptSubShotsSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-shot-video-prompt-subshots" under any known skills directory`,
  );
}

const speakerSwitchSubShotOutputSchema = z
  .object({
    subShots: z
      .array(
        z.object({
          subShotNumber: z.number().int().positive(),
          cameraSetup: z.string().min(1),
          prompt: z.string().min(1),
          negative_motion_prompt: z.string().optional().default(""),
          transitionIn: z.enum(["cut", "match_cut", "smash_cut", "continuous"]),
        }),
      )
      .min(2)
      .max(3),
    /**
     * Additive over the brief's literal schema (deviation, documented in the
     * task's final report): the category-mandated tie-in disclosure and the
     * native-audio-direction cue are properties of the PARENT shot as a
     * whole (one product tie-in, one native-audio decision per shot), not
     * per sub-shot-window — so this schema asks the LLM for them ONCE,
     * mirroring `shotVideoPromptOutputSchema`'s `requiredDisclosure`/
     * `audio_direction` fields, so the router can still copy them onto the
     * LAST window's clip (see `verticalDramaEpisodes.ts`'s
     * `generateShotVideoPrompt` persistence step). Omitted entirely when not
     * applicable — same conditional-presence convention as the single-shot
     * schema.
     */
    requiredDisclosure: z.string().optional(),
    audio_direction: z.string().optional(),
  })
  .passthrough();

export type SpeakerSwitchSubShotOutput = z.infer<typeof speakerSwitchSubShotOutputSchema>;

export interface GenerateVerticalDramaShotVideoPromptSubShotsParams
  extends GenerateVerticalDramaShotVideoPromptParams {
  /** Speaker-anchored cut windows already decided by `computeSpeakerSwitchSubShotPlan` — this function only writes prose for them, it never re-decides the split. */
  subShotWindows: SpeakerSwitchSubShotWindow[];
}

export interface GenerateVerticalDramaShotVideoPromptSubShotsResult {
  subShots: Array<{
    subShotNumber: number;
    characterKey: string;
    durationSeconds: number;
    cameraSetup: string;
    prompt: string;
    negativeMotionPrompt?: string;
    transitionIn: "cut" | "match_cut" | "smash_cut" | "continuous";
    dialogue: VerticalDramaMotionPromptClipDialogueLine[];
  }>;
  creditsUsed: number;
  model: string;
  /** True when the resolved model actually received the image (vision path); false when only the textual `imagePrompt` proxy was used. */
  usedVision: boolean;
  /** See `speakerSwitchSubShotOutputSchema`'s doc comment — computed once for the whole (split) shot; the router copies this onto the LAST sub-shot's clip. */
  requiredDisclosure?: string;
  /** See `speakerSwitchSubShotOutputSchema`'s doc comment — computed once for the whole (split) shot; the router copies this onto the LAST sub-shot's clip. */
  audioDirection?: string;
}

function buildSpeakerSwitchSubShotUserPrompt(
  params: GenerateVerticalDramaShotVideoPromptSubShotsParams,
  nativeAudioDialogue: boolean,
  nativeAudioDirectionEnabled: boolean,
): string {
  const { shotContext, subShotWindows } = params;
  const promptLanguage = params.promptLanguage ?? "en";
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];
  const allDialogueLines = shotContext.dialogueLines ?? [];

  const windowBlocks = subShotWindows
    .map((w) => {
      const lines = w.lineIndexes
        .map((idx) => allDialogueLines[idx])
        .filter((l): l is NonNullable<typeof l> => Boolean(l));
      const linesText = lines.length
        ? lines
            .map((l, li) => {
              const parts = [`${li + 1}. ${l.characterKey ?? w.characterKey}: "${l.lineTh}"`];
              if (l.emotion) parts.push(`emotion: ${l.emotion}`);
              if (l.delivery?.tone) parts.push(`tone: ${l.delivery.tone}`);
              if (l.delivery?.pace) parts.push(`pace: ${l.delivery.pace}`);
              if (l.delivery?.pauses) parts.push(`pauses: ${l.delivery.pauses}`);
              if (l.delivery?.texture) parts.push(`voice texture: ${l.delivery.texture}`);
              if (l.subtext) parts.push(`subtext: ${l.subtext}`);
              return parts.join(" | ");
            })
            .join("\n")
        : "(no dialogue lines assigned to this window)";
      const otherSpeakers = Array.from(
        new Set(
          allDialogueLines
            .map((l) => l.characterKey)
            .filter((k): k is string => Boolean(k) && k !== w.characterKey),
        ),
      );
      const cutInstruction = otherSpeakers.length
        ? `cut to ${w.characterKey}, over-the-shoulder/reaction framing, medium close-up on ${w.characterKey}'s face — ${otherSpeakers.join(", ")} is off-frame or only partially visible for this cut`
        : `cut to ${w.characterKey}`;
      return [
        `SUB-SHOT ${w.subShotNumber} of ${subShotWindows.length} (${w.durationSeconds}s): ${cutInstruction}.`,
        `Dialogue for this sub-shot:\n${linesText}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Shot number: ${params.shotNumber}`,
    `This shot is being split into ${subShotWindows.length} shot-reverse-shot sub-shots because 2+ characters go back and forth in dialogue during it — each sub-shot becomes its own separate clip, anchored on whichever character is speaking during that window, to avoid identity/costume drift on the non-speaking character across one long continuous clip.`,
    shotContext.description ? `Shot description: ${shotContext.description}` : null,
    shotContext.camera ? `Overall scene camera setup (base framing before the reverse-shot cuts): ${shotContext.camera}` : null,
    shotContext.emotion ? `Shot emotion: ${shotContext.emotion}` : null,
    params.imagePrompt
      ? `The attached image was generated from this exact prompt (use it as a precise textual description of what the start frame shows, in addition to analyzing the attached image directly): ${params.imagePrompt}`
      : null,
    shotContext.characterIdentityMap ?? null,
    `Sub-shot windows (produce exactly one camera-direction + video-motion "prompt" for EACH, matching "subShotNumber" — return exactly ${subShotWindows.length} entries in "subShots"):\n${windowBlocks}`,
    `SHOT-REVERSE-SHOT CONTINUITY (MANDATORY): write the ${subShotWindows.length} prompts so together they read as one coherent cutaway sequence — a later sub-shot's "prompt" may reference cutting back from an earlier sub-shot's framing (e.g. "cutting back to X after the previous reaction shot"), but each sub-shot's own "prompt" must also stand alone as a complete, self-sufficient motion direction for its own clip.`,
    `Never describe character appearance in any sub-shot's "prompt" — each sub-shot's own start-frame reference image (not this prompt text) carries that character's identity/wardrobe. Focus only on movement, emotion, camera motion, and dialogue delivery.`,
    shotContext.productContext
      ? `PRODUCT TIE-IN (MANDATORY for this shot): the tied-in product is placed in this shot (${shotContext.productContext.placementStyle ?? "in_use_moment"}). Naturally reference the product GENERICALLY (e.g. "the product", a category descriptor — NEVER the brand/product name itself, which must never appear in any "prompt"/"negative_motion_prompt"/dialogue text) or its benefit${shotContext.productContext.benefitTalkingPoint ? ` (e.g. "${shotContext.productContext.benefitTalkingPoint}")` : ""} in whichever sub-shot's dialogue/acting beat fits it best — it must sound like a real character moment, never a hard-sell or advertisement line, and must fit the scene's emotion. Brand identity comes ONLY from the attached/locked reference image, never from prompt or dialogue text. ${VD_PRODUCT_LOCK_VIDEO_INSTRUCTION} Return the category-mandated disclosure line (if any) ONCE in the top-level "requiredDisclosure" field — do not repeat it per sub-shot.`
      : null,
    shotContext.productContext
      ? buildThaiAdComplianceInstruction(shotContext.productContext.productCategory)
      : null,
    shotContext.productContext
      ? "Public-figure/brand guard (MANDATORY): never name a real public figure, celebrity, or real company/brand anywhere in any \"prompt\", \"negative_motion_prompt\", or dialogue text."
      : null,
    `PROMPT LANGUAGE (MANDATORY): write every sub-shot's "prompt" and "negative_motion_prompt" entirely in ${promptLanguageName} — every word of the motion/acting/camera direction must be in ${promptLanguageName}, regardless of what language the dialogue is in.`,
    `SPEECH LANGUAGE (MANDATORY): the character(s) speak in ${dialogueLanguageName} in this video. Any literal quoted dialogue embedded in a sub-shot's prompt (native-audio models) must be in ${dialogueLanguageName}, adapted/translated naturally into ${dialogueLanguageName} if the source line shown above is in a different language.`,
    dialogueLanguage === "th" && params.thaiAccent
      ? `SPEECH ACCENT (MANDATORY): ${VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES[params.thaiAccent]} Apply this delivery direction to every spoken line.`
      : null,
    nativeAudioDialogue
      ? `The selected video model (${params.selectedVideoModelId}) supports native lip-synced audio — for any sub-shot with dialogue, embed that window's line(s) VERBATIM (in the SPEECH LANGUAGE) in its own "prompt", with matching mouth/lip movement and delivery direction.`
      : `The selected video model (${params.selectedVideoModelId}) has NO native lip-sync/audio channel — for any sub-shot with dialogue, describe mouth movement + acting direction only in its own "prompt" (in the PROMPT LANGUAGE, no literal transcript embedded).`,
    nativeAudioDirectionEnabled
      ? `NATIVE AUDIO DIRECTION (native_audio: true): the selected video model (${params.selectedVideoModelId}) generates synchronized audio natively — return an additional top-level "audio_direction" field (ONCE for the whole shot, not per sub-shot) directing the model's own in-clip audio: SFX cues tied to this shot's visible on-screen actions FIRST, then a brief ambient soundscape matched to the scene's mood/location and emotional-beat intensity SECOND. NEVER include speech/dialogue/voices/vocals and NEVER include music/melody/lyrics/score in "audio_direction".`
      : null,
    `Locale: ${params.locale}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate a whole SPLIT shot's shot-reverse-shot sub-shot prompts in ONE
 * LLM call (Package 2, speaker-aware sub-shots task) — sibling to
 * `generateVerticalDramaShotVideoPrompt`, reusing the same vision-aware
 * retry harness (`executeVisionAwareJsonCallWithRetry`), credit-check/rate-
 * limit gating, and model-resolution convention. The CALLER (router) is
 * responsible for deciding whether a shot needs splitting at all
 * (`computeSpeakerSwitchSubShotPlan`) and for resolving each window's
 * `startFrameAssetId` (the character's own portrait) — this function only
 * writes the prose for the windows it's given.
 */
export async function generateVerticalDramaShotVideoPromptSubShots(
  params: GenerateVerticalDramaShotVideoPromptSubShotsParams,
): Promise<GenerateVerticalDramaShotVideoPromptSubShotsResult> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const { model, hasVision } = await resolveShotVideoPromptModel(params.seriesId);
  const systemPrompt = loadShotVideoPromptSubShotsSystemPrompt();

  const capabilities = resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
    type: params.selectedVideoModel.type,
    aspectRatios: params.selectedVideoModel.aspectRatios,
    configJson: params.selectedVideoModel.configJson,
  });
  const nativeAudioDialogue = capabilities.nativeAudioDialogue === true;
  const nativeAudioDirectionEnabled =
    params.nativeAudioEnabled === true && capabilities.supportsNativeAudio === true;

  const userPromptText = buildSpeakerSwitchSubShotUserPrompt(
    params,
    nativeAudioDialogue,
    nativeAudioDirectionEnabled,
  );

  const { data, response } = await executeVisionAwareJsonCallWithRetry<SpeakerSwitchSubShotOutput>({
    model,
    systemPrompt,
    userPromptText,
    hasVision,
    imageUrl: params.imageUrl,
    userId: params.userId,
    schema: speakerSwitchSubShotOutputSchema,
    firstAttemptMaxTokens: 3000,
    retryMaxTokens: 6000,
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate shot video prompt sub-shots (episode #${params.episodeId}, shot #${params.shotNumber})`,
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      shotNumber: params.shotNumber,
      usedVision: hasVision,
      subShotCount: data.subShots.length,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  const resolvedAudioDirection = nativeAudioDirectionEnabled
    ? data.audio_direction || undefined
    : undefined;

  const windowByNumber = new Map(params.subShotWindows.map((w) => [w.subShotNumber, w]));
  const allDialogueLines = params.shotContext.dialogueLines ?? [];
  const sortedSubShots = data.subShots.slice().sort((a, b) => a.subShotNumber - b.subShotNumber);

  const subShots = sortedSubShots.map((s, i) => {
    const window = windowByNumber.get(s.subShotNumber);
    const dialogue: VerticalDramaMotionPromptClipDialogueLine[] = window
      ? window.lineIndexes
          .map((idx) => allDialogueLines[idx])
          .filter((l): l is NonNullable<typeof l> => Boolean(l))
          .map((l) => ({
            characterKey: l.characterKey,
            lineTh: l.lineTh,
            emotion: l.emotion,
            delivery: l.delivery,
            subtext: l.subtext,
          }))
      : [];
    const isLastSubShot = i === sortedSubShots.length - 1;
    return {
      subShotNumber: s.subShotNumber,
      characterKey: window?.characterKey ?? "",
      durationSeconds: window?.durationSeconds ?? 0,
      cameraSetup: s.cameraSetup,
      prompt:
        isLastSubShot && resolvedAudioDirection
          ? `${s.prompt} SFX cues: ${resolvedAudioDirection}`
          : s.prompt,
      negativeMotionPrompt: s.negative_motion_prompt || undefined,
      transitionIn: s.transitionIn,
      dialogue,
    };
  });

  return {
    subShots,
    creditsUsed,
    model,
    usedVision: hasVision,
    requiredDisclosure: data.requiredDisclosure || undefined,
    audioDirection: resolvedAudioDirection,
  };
}

/* -------------------------------------------------------------------------- */
/* Per-shot dialogue REGENERATION (`regenerateClipDialogue`, 2026-07-07 fix)   */
/* -------------------------------------------------------------------------- */

/**
 * Root cause of the "unusable dialogue" bug report (e.g.
 * `เสียง…ชา…อืม…ใครมาฝากอีกแล้วหรือเปล่า`): `resolveShotDialogueLines`'s
 * script-fallback path recovers a scene's freeform `dialogue_lines[]` strings
 * verbatim — when the script itself contains a stage-direction fragment
 * (sound cue, half-formed murmur) that was never meant to be a spoken line,
 * that fragment becomes "the dialogue" for the shot with no way to fix it
 * short of a full episode/script regeneration (which `generateShotVideoPrompt`
 * deliberately never triggers — see this module's other doc comments on
 * "ground truth over free-text LLM claim").
 *
 * `regenerateClipDialogue` is the explicit, user-triggered escape hatch: it
 * asks the LLM to WRITE a fresh, natural 2-4 line spoken exchange for this one
 * shot from its storyboard/script CONTEXT (description, emotion, characters,
 * scene dialogue for tone) — never by "fixing" the old fragment text — and
 * the caller (router) OVERWRITES `clip.dialogue` with the result. Credit-gated
 * (same check-credits -> call -> deduct convention as every other real LLM
 * call in this file) and idempotency-keyed.
 */
const clipDialogueLineOutputSchema = z.object({
  characterKey: z.string().optional(),
  lineTh: z.string().min(1),
  emotion: z.string().optional(),
  delivery: z
    .object({
      tone: z.string().optional(),
      pace: z.string().optional(),
      pauses: z.string().optional(),
      texture: z.string().optional(),
    })
    .optional(),
  subtext: z.string().optional(),
});

const clipDialogueOutputSchema = z
  .object({
    dialogue: z.array(clipDialogueLineOutputSchema).min(1).max(4),
  })
  .passthrough();

export type ClipDialogueOutput = z.infer<typeof clipDialogueOutputSchema>;

const CLIP_DIALOGUE_SYSTEM_PROMPT = [
  "You are a Thai vertical-drama dialogue writer. Given a single shot's visual/emotional context, write a natural, duration-aware spoken exchange for that shot.",
  "Rules (MANDATORY):",
  "- Write 2 to 4 dialogue lines maximum for this one shot — never more, but make the total spoken content fit the supplied target speech duration.",
  "- Every line must be REAL, grammatically complete, natural spoken dialogue a person would actually say out loud — never a sound effect, stage direction, murmur, or sentence fragment (e.g. never output something like \"เสียง…ชา…อืม…\").",
  "- Every line must be attributed to one of the characters explicitly listed in the shot context (by their exact character key). Never invent a new character or attribute a line to a generic label like \"narrator\" or \"voice\" unless that exact label is one of the listed characters.",
  "- If the caller supplies an optional creative instruction, follow it while still obeying every rule above.",
  "- Match the scene's established tone/emotion and any prior scene dialogue given as context — do not contradict the story.",
  'Return ONLY a single JSON object of the shape {"dialogue":[{"characterKey":"...","lineTh":"...","emotion":"...","delivery":{"tone":"...","pace":"...","pauses":"...","texture":"..."},"subtext":"..."}]} — "characterKey" and "lineTh" are required on every line, all other fields optional.',
  VD_COMPACT_JSON_INSTRUCTION,
].join("\n");

export interface GenerateVerticalDramaClipDialogueParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  shotContext: {
    description?: string;
    camera?: string;
    emotion?: string;
    durationSeconds?: number;
    /** Compact "key = name (role): descriptor" character identity map — see `buildCharacterIdentityMapBlock`. */
    characterIdentityMap?: string;
    /** Existing dialogue lines for nearby/this shot's scene, for tone/continuity context only — never copied verbatim into the rewrite. */
    sceneDialogueContext?: string[];
  };
  /** Optional free-text creative instruction from the user (e.g. "สั้นลง", "ทางการน้อยลง"). Capped by the router's Zod schema at 500 chars. */
  instruction?: string;
  dialogueLanguage?: VerticalDramaDialogueLanguage;
  thaiAccent?: VerticalDramaThaiAccent;
  idempotencyKey?: string;
}

export interface GenerateVerticalDramaClipDialogueResult {
  dialogue: Array<{
    characterKey?: string;
    lineTh: string;
    emotion?: string;
    delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
    subtext?: string;
  }>;
  creditsUsed: number;
  model: string;
}

function buildClipDialogueUserPrompt(params: GenerateVerticalDramaClipDialogueParams): string {
  const { shotContext } = params;
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];
  const sceneContext = shotContext.sceneDialogueContext?.length
    ? shotContext.sceneDialogueContext.map((l) => `- ${l}`).join("\n")
    : null;
  const targetSpeechSeconds =
    typeof shotContext.durationSeconds === "number"
      ? targetVerticalDramaSpeechSeconds(shotContext.durationSeconds)
      : undefined;

  return [
    `Shot number: ${params.shotNumber}`,
    typeof shotContext.durationSeconds === "number"
      ? `Clip duration: ${shotContext.durationSeconds}s`
      : null,
    targetSpeechSeconds
      ? `Target spoken-dialogue duration: about ${targetSpeechSeconds.toFixed(1)}s total across all returned lines. Avoid one-line dialogue that only fills 1-2 seconds of an 8-second clip unless the user explicitly requests silence.`
      : null,
    shotContext.description ? `Shot description: ${shotContext.description}` : null,
    shotContext.camera ? `Camera setup: ${shotContext.camera}` : null,
    shotContext.emotion ? `Shot emotion: ${shotContext.emotion}` : null,
    shotContext.characterIdentityMap ?? null,
    sceneContext
      ? `Nearby scene dialogue (context/tone only — do NOT copy these lines verbatim, do NOT reuse a broken/fragment line as-is):\n${sceneContext}`
      : null,
    params.instruction
      ? `Additional creative instruction from the user (MANDATORY to follow): ${params.instruction}`
      : null,
    `SPEECH LANGUAGE (MANDATORY): every line's "lineTh" must be written in ${dialogueLanguageName}.`,
    params.dialogueLanguage === undefined || params.dialogueLanguage === "th"
      ? params.thaiAccent
        ? `SPEECH ACCENT (MANDATORY): ${VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES[params.thaiAccent]} Apply this delivery direction to every line.`
        : null
      : null,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate a fresh 2-4 line spoken exchange for ONE shot, replacing whatever
 * (possibly broken) dialogue currently exists on that shot's clip. The
 * caller (router mutation) is responsible for OVERWRITING
 * `motionPromptPack.clips[j].dialogue` with the result — this function is
 * pure generation, no persistence. Credit-gated + idempotency-keyed exactly
 * like `generateVerticalDramaShotVideoPrompt`.
 */
export async function generateVerticalDramaClipDialogue(
  params: GenerateVerticalDramaClipDialogueParams,
): Promise<GenerateVerticalDramaClipDialogueResult> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const userPrompt = buildClipDialogueUserPrompt(params);

  const { data, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt: CLIP_DIALOGUE_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.8,
    userId: params.userId,
    maxTokens: 1200,
    schema: clipDialogueOutputSchema,
    label: "Clip dialogue regeneration",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — regenerate clip dialogue (episode #${params.episodeId}, shot #${params.shotNumber})`,
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      shotNumber: params.shotNumber,
      hadInstruction: Boolean(params.instruction?.trim()),
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return {
    dialogue: data.dialogue,
    creditsUsed,
    model,
  };
}
