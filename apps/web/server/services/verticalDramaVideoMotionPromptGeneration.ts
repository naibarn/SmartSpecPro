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
import { executeWithFallback } from "./llmRouter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import {
  resolveStoryBibleModel,
  extractJson,
  InsufficientCreditsError,
  VdSchemaValidationError,
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
  }>;
}

/** Project the raw skill output onto the pipeline's typed stage-payload shape. */
export function projectMotionPromptPack(
  raw: VideoMotionPromptPackOutput,
  fallbackVideoModelId: string,
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
    typeof summary?.video_model === "string" ? (summary.video_model as string) : fallbackVideoModelId;

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

  const result = await executeWithFallback({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    userId: params.userId,
    maxTokens: 4000,
    temperature: 0.7,
  });

  if (result.type !== "success") {
    throw new Error(
      result.type === "error"
        ? `LLM request failed: ${result.error}`
        : "LLM request did not reach a successful provider response",
    );
  }

  const content = result.response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  const validation = videoMotionPromptPackOutputSchema.safeParse(parsed);
  if (!validation.success) {
    throw new VdSchemaValidationError(
      "Video motion prompt pack response failed schema validation",
      validation.error.issues,
    );
  }

  const usage = result.response.usage;
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
    validation.data,
    params.selectedVideoModelId ?? "dry-run-video-model",
    params.durationProfileId,
    shotDialogueByShotNumber,
  );

  return { pack, raw: validation.data, creditsUsed, model };
}
