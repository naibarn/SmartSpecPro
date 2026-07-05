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
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  extractJson,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";

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
}

export interface VideoMotionPromptPackProjection {
  selectedVideoModelId: string;
  durationProfileId: string;
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
  }>;
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
        return {
          clipNumber: c.clip_number,
          sourceShotNumbers: c.source_shot_numbers,
          prompt: `${c.prompt}${dialogueNote}`,
          negativeMotionPrompt: c.negative_motion_prompt ?? undefined,
          startFrameAssetId: c.start_frame_reference?.asset_id ?? undefined,
          endFrameAssetId: c.end_frame_reference?.asset_id ?? undefined,
          durationSeconds: c.duration_seconds,
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
}

function buildUserPrompt(params: GenerateVideoMotionPromptPackParams): string {
  const shotLines = params.storyboardShots
    .map((s) => {
      const dialogue = s.dialogueExcerpt ? ` | dialogue: "${s.dialogueExcerpt}"` : "";
      return `- Shot ${s.shotNumber} (${s.durationSeconds}s): ${s.description}${dialogue}`;
    })
    .join("\n");

  return [
    `Episode title: ${params.episodeTitle}`,
    `Episode duration: ${params.durationSeconds} seconds`,
    `Duration profile: ${params.durationProfileId}`,
    params.selectedVideoModelId ? `Preferred video model: ${params.selectedVideoModelId}` : null,
    `Storyboard shots (bridge shots into motion clips per the skill's usual pairing strategy):\n${shotLines}`,
    `When a shot has a "dialogue" line, the resulting clip's "prompt" must explicitly mention the character speaking it and describe mouth/lip movement matching that line — do not produce a silent/mute description for a shot that has dialogue.`,
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

  const model = await resolveStoryBibleModel();
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
 * has vision support — `resolveStoryBibleModel()` (used everywhere else in
 * this file) only requires `supportsStructuredOutputs`. `intelligentModel
 * Selector.ts`'s `CapabilityRequirements`/`selectBestLlmModel` DOES expose a
 * `supportsVision` flag, so `resolveShotVideoPromptModel` below explicitly
 * requires it (falling back to `resolveStoryBibleModel()`'s non-vision
 * default only when no enabled model declares vision support, per the task's
 * "closest viable alternative" instruction) — and in EITHER case, the
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

/** Resolve a vision-capable model when one is enabled; falls back to the non-vision default (see the vision-support doc comment above). */
async function resolveShotVideoPromptModel(): Promise<{ model: string; hasVision: boolean }> {
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
  const fallbackModel = await resolveStoryBibleModel();
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
  })
  .passthrough();

export type ShotVideoPromptOutput = z.infer<typeof shotVideoPromptOutputSchema>;

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
  };
  selectedVideoModelId: string;
  /** The resolved video model row, so the native-audio/dialogue decision below matches `verticalDramaVideoPromptFormatter.ts`'s capability logic exactly. */
  selectedVideoModel: Pick<ModelDefinition, "type" | "aspectRatios" | "configJson" | "provider" | "aliases"> & {
    id?: string;
  };
  locale: "th" | "en";
  idempotencyKey?: string;
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
}

function buildShotVideoPromptUserPrompt(
  params: GenerateVerticalDramaShotVideoPromptParams,
  nativeAudioDialogue: boolean,
): string {
  const { shotContext } = params;
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
    : "(no dialogue in this shot — silent/ambient clip)";

  return [
    `Shot number: ${params.shotNumber}`,
    shotContext.description ? `Shot description: ${shotContext.description}` : null,
    shotContext.camera ? `Camera setup: ${shotContext.camera}` : null,
    shotContext.emotion ? `Shot emotion: ${shotContext.emotion}` : null,
    params.imagePrompt
      ? `The attached image was generated from this exact prompt (use it as a precise textual description of what the start frame shows, in addition to analyzing the attached image directly): ${params.imagePrompt}`
      : null,
    `Dialogue for this shot:\n${dialogueBlock}`,
    nativeAudioDialogue
      ? `The selected video model (${params.selectedVideoModelId}) supports native lip-synced audio — when dialogue is present, embed the Thai line(s) VERBATIM in the prompt with matching mouth/lip movement and delivery direction, and return them again in the "dialogue" array.`
      : `The selected video model (${params.selectedVideoModelId}) has NO native lip-sync/audio channel — when dialogue is present, describe mouth movement + acting direction only (no literal transcript in the prompt), and return the resolved lines in the "dialogue" array so the caller can route them to text-to-speech.`,
    `Locale: ${params.locale}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
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

  const { model, hasVision } = await resolveShotVideoPromptModel();
  const systemPrompt = loadShotVideoPromptSystemPrompt();

  const capabilities = resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
    type: params.selectedVideoModel.type,
    aspectRatios: params.selectedVideoModel.aspectRatios,
    configJson: params.selectedVideoModel.configJson,
  });
  const nativeAudioDialogue = capabilities.nativeAudioDialogue === true;
  // Kept for parity with `verticalDramaVideoPromptFormatter.ts`'s own family
  // detection (not otherwise used here — the formatter is the single place
  // that builds the final provider-submitted prompt/payload; this function
  // only produces the base motion prompt + dialogue for it to format).
  void detectProviderFamily;

  const userPromptText = buildShotVideoPromptUserPrompt(params, nativeAudioDialogue);

  const userContent = hasVision
    ? [
        { type: "text" as const, text: userPromptText },
        {
          type: "image_url" as const,
          image_url: { url: params.imageUrl, detail: "high" as const },
        },
      ]
    : userPromptText;

  const attempt = async (content: typeof userContent, maxTokens: number) => {
    const result = await executeWithFallback({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      stream: false,
      userId: params.userId,
      maxTokens,
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
    const validation = shotVideoPromptOutputSchema.safeParse(parsed);
    if (!validation.success) {
      throw new VdSchemaValidationError(
        "Shot video prompt response failed schema validation",
        validation.error,
      );
    }
    return { data: validation.data, response: result.response };
  };

  let outcome: Awaited<ReturnType<typeof attempt>>;
  try {
    outcome = await attempt(userContent, 2000);
  } catch (firstError) {
    if (!(firstError instanceof VdSchemaValidationError)) throw firstError;
    const retryText = `${userPromptText}\n\nYour previous response was truncated or was not valid JSON. Return ONLY complete, valid, compact JSON (no markdown fences, no commentary, no trailing text).`;
    const retryContent = hasVision
      ? [
          { type: "text" as const, text: retryText },
          {
            type: "image_url" as const,
            image_url: { url: params.imageUrl, detail: "high" as const },
          },
        ]
      : retryText;
    outcome = await attempt(retryContent, 4000);
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

  return {
    prompt: data.prompt,
    negativeMotionPrompt: data.negative_motion_prompt || undefined,
    dialogue: data.dialogue,
    creditsUsed,
    model,
    usedVision: hasVision,
  };
}
