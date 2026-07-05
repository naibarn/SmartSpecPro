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
import {
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
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

export const videoMotionPromptPackOutputSchema = z
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

export type VideoMotionPromptPackOutput = z.infer<typeof videoMotionPromptPackOutputSchema>;

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
