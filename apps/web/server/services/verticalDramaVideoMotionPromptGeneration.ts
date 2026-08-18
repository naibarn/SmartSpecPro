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
import { isAvailable } from "./providerHealth";
import { resolveVerticalDramaCapabilities, type ModelDefinition } from "./modelRegistry";
import { detectProviderFamily } from "./verticalDramaProviderRouting";
import {
  executeJsonPlanningCallWithRetry,
  executeVisionAwareJsonCallWithRetry,
  // Pre-existing gap fix (found while extending the compliance-retry blocks
  // for `planning/vd-video-prompt-model-family-quality/plan.md`): both
  // `generateVerticalDramaShotVideoPrompt`'s and
  // `generateVerticalDramaShotVideoPromptSpeakerSwitch`'s hand-rolled
  // corrective-retry blocks call `runVisionAwareJsonAttempt` directly
  // (needed because they use a CUSTOM correction prompt/maxTokens, unlike
  // `executeVisionAwareJsonCallWithRetry`'s fixed first/retry-token
  // contract), but this name was never imported — the call sites were
  // silently swallowed by their own `try/catch` (best-effort by design),
  // so the corrective retry never actually reran the LLM. Restoring the
  // import makes the pre-existing dialogue-verbatim retry (and this task's
  // new position-anchor retry) actually execute.
  runVisionAwareJsonAttempt,
  buildVisionAwareContent,
  type VisionAwareContent,
  type VisionAwareImageInput,
  extractJson,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  buildRuntimeModelConfig,
  executeSharedSkillTextRuntime,
} from "./agentRuntime/skillRuntimeOrchestrator";
import type {
  VerticalDramaPromptLanguage,
  VerticalDramaDialogueLanguage,
  VerticalDramaSeriesLocale,
  VerticalDramaThaiAccent,
  // Speaker-aware sub-shots task (consolidated to a single combined prompt,
  // 2026-07-11 redesign) — the timed-window shape decided by
  // `computeSpeakerSwitchSubShotPlan` (pure, no LLM call); this module's
  // `generateVerticalDramaShotVideoPromptSpeakerSwitch` only writes ONE
  // combined timed-narrative prose prompt for the windows it's given, it
  // never re-decides the split itself.
  SpeakerSwitchSubShotWindow,
} from "@shared/verticalDramaSeries";
import type { VerticalDramaBarrierMultiView } from "@shared/verticalDramaSeries/barrierMultiView";
import {
  normalizeVerticalDramaCharacterDescriptionOverrides,
  type VerticalDramaCharacterDescriptionOverrides,
  type VerticalDramaVerifiedCastPosition,
} from "@shared/verticalDramaSeries/castPositionLock";
import { renderVerticalDramaBarrierMultiViewFactBlock } from "@shared/verticalDramaSeries/barrierMultiView";
import { filterSceneContinuityLockBlockForShot } from "@shared/verticalDramaSeries/sceneContinuity";
import {
  deriveVerticalDramaSpokenCallerVirtualScreens,
  renderVerticalDramaSpokenCallerVirtualScreenPromptBlock,
} from "@shared/verticalDramaSeries/spokenCallerVirtualScreen";

import {
  VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES,
  VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES,
  VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES,
  // Speaker-aware sub-shots task, multi-character disambiguation fix
  // (`polished-toasting-gadget.md`) — shared anchor-first/first-appearance
  // dedup helper, see `deriveDistinctSpeakerCharacterKeysFromWindows`'s own
  // doc comment in `subShots.ts` for why this is extracted rather than
  // inlined here.
  deriveDistinctSpeakerCharacterKeysFromWindows,
  // Model-family-aware, vision-grounded video prompt quality upgrade
  // (`planning/vd-video-prompt-model-family-quality/plan.md`) — used by
  // `buildCandidateFactSheet`'s `overCap` fact (judged quality loop, Phase
  // 2), the same hard cap the router's post-generation QC
  // (`ensurePromptWithinLimit`) enforces on the persisted `clip.prompt`.
  // Sound-direction ownership fix (recorded gap 4, 2026-07-22) removed this
  // module's OWN generation-time SFX/ambient concat (the skill now writes
  // its closing sound clause directly into `prompt`, budget-guarded by the
  // skill itself), so this remains the legacy/default fallback here.
  VD_VIDEO_PROMPT_MAX,
} from "@shared/verticalDramaSeries";
import { targetVerticalDramaSpeechSeconds } from "@shared/verticalDramaSeries/dialogueQuality";
import { resolveVdVideoPromptBudgetForCatalogModel } from "@shared/verticalDramaSeries/videoPromptBudget";
import { VD_PRODUCT_LOCK_VIDEO_INSTRUCTION } from "./verticalDramaProductTieIn";
import { buildThaiAdComplianceInstruction } from "@shared/verticalDramaSeries/thaiAdCompliance";
import {
  buildNativeDialogueVerbatimBlock,
  NATIVE_DIALOGUE_BLOCK_MARKER,
} from "@shared/verticalDramaSeries/nativeDialogue";
// Preset visual identity flow-through (spec §8.2.2 flow-through rule,
// section-15 change D, Wave-4A completing the "motion prompts" leg of the
// rule). Type-only — pure/shared, no runtime import needed here.
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
// Model-family-aware, vision-grounded video prompt quality upgrade
// (`planning/vd-video-prompt-model-family-quality/plan.md`) — the shared,
// dependency-free family resolver both this service (fact block + result
// stamping) and the client (badge/mismatch) use as the single source of
// truth. Deliberately separate from `detectProviderFamily`
// (`./verticalDramaProviderRouting`, render/request routing) — that stays
// completely untouched by this task.
import {
  resolveVideoPromptTargetFamily,
  videoPromptFamilySupportsNegativePrompt,
  type VideoPromptModelFamily,
} from "@shared/verticalDramaSeries/videoPromptModelFamily";
import {
  parseMotionProfile,
  type VdIdentityRisk,
  type VdMotionProfile,
  type VdMotionContractStatus,
} from "@shared/verticalDramaSeries/motionProfile";
import {
  assureVideoPromptMotion,
  applyVideoPromptMotionSafetyFallback,
  buildVideoPromptMotionAssuranceDirective,
  isVideoPromptSourceBlockingFinding,
  type VideoPromptAssuranceFinding,
} from "@shared/verticalDramaSeries/videoPromptMotionAssurance";
import type { VerticalDramaSupportingPresence } from "@shared/verticalDramaSeries/supportingPresence";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };
export { buildNativeDialogueVerbatimBlock } from "@shared/verticalDramaSeries/nativeDialogue";

/**
 * Raised when a visually grounded video prompt cannot inspect its required
 * start/reference frames. Persisting a text-only guess is worse than asking
 * the user to retry with a vision-capable authoring model.
 */
export class VdVisionRequiredError extends Error {
  code = "VD_VISION_REQUIRED" as const;

  constructor(message = "A vision-capable model is required for character-grounded video prompts") {
    super(message);
    this.name = "VdVisionRequiredError";
  }
}

function assertVisionForCharacterGroundedPrompt(
  hasVision: boolean,
  hasRequiredVisualGrounding: boolean,
): void {
  if (hasRequiredVisualGrounding && !hasVision) {
    throw new VdVisionRequiredError(
      "ต้องใช้โมเดลที่รองรับการอ่านภาพจริงเพื่อสร้าง video prompt จากภาพตัวละครหรือภาพคู่ Dual View",
    );
  }
}

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

/**
 * Use the OpenAI Agents SDK runtime when the tenant has promoted the shared
 * skill runtime.  The direct vision call remains the compatibility fallback
 * because the native runtime may be unavailable during rollout or may not yet
 * have a capability manifest for this skill.  Both paths return the same
 * schema-validated candidate, so the deterministic verifier stays the final
 * authority.
 */
async function tryRunVideoPromptRepairAgent(params: {
  tenantId?: string;
  userId: number;
  model: string;
  systemPrompt: string;
  repairPrompt: string;
  referenceImages: VisionAwareImageInput[];
  publicUrl?: string | null;
}): Promise<ShotVideoPromptOutput | null> {
  if (!params.tenantId) return null;
  try {
    const flags = await getTenantFeatureFlags(params.tenantId);
    if (!flags.openAiAgentsRuntimeSkillActive) return null;
    const execution = await executeSharedSkillTextRuntime({
      tenantId: params.tenantId,
      userId: params.userId,
      objective: "Repair and verify a vision-grounded vertical-drama video prompt before provider submission.",
      originSurface: "media_studio_video_shot",
      entryPoint: "enhance_prompt",
      modelConfig: buildRuntimeModelConfig({ modelId: params.model }),
      skillSlugs: ["vertical-drama-shot-video-prompt"],
      systemPrompt: params.systemPrompt,
      userPrompt: params.repairPrompt,
      planContext: { phase: "repair", verifier: "deterministic_video_prompt_assurance" },
      dynamicParams: { repair: true },
      referenceImages: params.referenceImages.map(image => image.url),
      publicUrl: params.publicUrl,
      requestLabel: "vertical-drama-video-prompt-repair",
      schemaHint: { name: "vertical_drama_shot_video_prompt_repair", validationMode: "text_output" },
      legacyExecute: async () => ({
        rawContent: "",
        usage: { promptTokens: 0, completionTokens: 0 },
        creditsUsed: 0,
        providerName: null,
        modelId: params.model,
      }),
    });
    const parsed = extractJson(execution.value.rawContent);
    const validation = shotVideoPromptOutputSchema.safeParse(parsed);
    return validation.success ? validation.data : null;
  } catch {
    return null;
  }
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
    /** Speaker-aware sub-shots task (Package 5) — legacy field, no longer written by `applySpeakerSwitchSubShotsToRealMotionPromptPack` after the 2026-07-11 consolidated-clip redesign (kept for typing any still-persisted legacy pre-redesign rows read back through this projection). Mirrors `VerticalDramaMotionPromptPack["clips"][number].parentShotNumber` in `@shared/verticalDramaSeries/contracts.ts`. */
    parentShotNumber?: number;
    /** Speaker-aware sub-shots task (Package 5) — legacy field, see `parentShotNumber`'s doc comment above. */
    subShotNumber?: number;
    /** Speaker-aware sub-shots task (Package 5) — see `VerticalDramaMotionPromptPack["clips"][number].requiredDisclosure`'s doc comment. */
    requiredDisclosure?: string;
    /** Speaker-aware sub-shots task (Package 5) — see `VerticalDramaMotionPromptPack["clips"][number].audioDirection`'s doc comment. */
    audioDirection?: string;
    /** 2026-07-11 consolidated-clip redesign — see `VerticalDramaMotionPromptPack["clips"][number].extraReferenceAssetIds`'s doc comment in `@shared/verticalDramaSeries/contracts.ts`. */
    extraReferenceAssetIds?: string[];
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
    // Sound-direction/dialogue ownership fix (pack-parity follow-up,
    // `planning/vd-video-prompt-model-family-quality/plan.md`, closed
    // 2026-07-22) — this used to fold ` SFX cues: <audioDirection>` and
    // ` Dialogue spoken during this clip: "..."` onto `c.prompt` here. The
    // updated skill (`vertical-drama-video-motion-prompt-pack/skill.md`,
    // "SOUND — SFX ONLY, WRITTEN INTO THE PROMPT" + "Weave delivery + acting
    // direction into every clip prompt" sections) now writes both the sound
    // clause and the dialogue delivery directly into `c.prompt` itself, so
    // `prompt` is returned completely as-is — NEVER append either note here
    // again (mirrors the identical fix already shipped for the per-shot
    // generator, see `generateVerticalDramaShotVideoPrompt`'s own doc
    // comment). `audioDirection` keeps being returned/persisted unchanged
    // below — the UI "เสียง:" block and audit trail read it from there,
    // independent of what's now embedded in `prompt`. `dialogue` stays a
    // SEPARATE persisted field, populated by `syncDialogueOntoMotionPromptClips`
    // (UI + audit + TTS depend on it) — this function never touches it.
    // Feature 137 intentionally does not project `motionProfile` here: the
    // bulk skill has no attached per-shot start frame, so `start_facing`
    // would be an ungrounded guess. Only the per-shot/sub-shot paths persist
    // the request-gated contract.
    clips: raw.video_clip_requests
      .slice()
      .sort((a, b) => a.clip_number - b.clip_number)
      .map((c) => ({
        clipNumber: c.clip_number,
        sourceShotNumbers: c.source_shot_numbers,
        prompt: c.prompt,
        negativeMotionPrompt: c.negative_motion_prompt ?? undefined,
        startFrameAssetId: c.start_frame_reference?.asset_id ?? undefined,
        endFrameAssetId: c.end_frame_reference?.asset_id ?? undefined,
        durationSeconds: c.duration_seconds,
        audioDirection: c.audio_direction ?? undefined,
      })),
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
  publicUrl?: string | null;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  /** Series genre used to select the motion/physics policy. */
  genre?: string;
  durationSeconds: number;
  durationProfileId: string;
  selectedVideoModelId?: string;
  /**
   * Pack-parity follow-up (`planning/vd-video-prompt-model-family-quality/
   * plan.md`, "pack bulk generator — out of scope" item, closed 2026-07-22)
   * — the resolved video model catalog row, same optional
   * `Pick<ModelDefinition, ...>` shape
   * `GenerateVerticalDramaShotVideoPromptParams.selectedVideoModel` uses.
   * Feeds `buildTargetVideoModelFactBlock`'s `model`/family classification
   * and `resolveVerticalDramaCapabilities`' `maxReferenceImages`/
   * `supportsNativeAudio`. Optional (unlike the per-shot sibling, which is
   * required) — omitted/absent degrades the fact block to family `"other"`
   * and omits the native-audio fact, never throws (see
   * `resolveShotVideoPromptModelFamily`'s doc comment).
   */
  selectedVideoModel?: Pick<ModelDefinition, "type" | "aspectRatios" | "configJson" | "provider" | "aliases"> & {
    id?: string;
    name?: string;
  };
  /**
   * Pack-parity follow-up — the caller's already-resolved decision (rollout
   * gate ANDed with the episode's persisted preference) of whether this
   * generation should request the skill's SOUND section, mirroring
   * `GenerateVerticalDramaShotVideoPromptParams.nativeAudioEnabled`'s exact
   * contract. This function ANDs its own model-capability check
   * (`resolveVerticalDramaCapabilities(...).supportsNativeAudio`) on top —
   * the caller never pre-resolves the capability half. Optional/omitted
   * (falsy) preserves today's byte-identical prompt (no NATIVE AUDIO
   * DIRECTION fact, no `audio_direction` requested).
   */
  nativeAudioEnabled?: boolean;
  /**
   * Pack-parity follow-up — OPTIONAL best-effort start-frame images, one per
   * shot, so the LLM can read actual on-screen speaker position the same way
   * the per-shot generator's vision call does (the skill's "Single camera
   * move + speaker anchoring per clip" section already instructs this when
   * images are attached). Each entry's `url` must be a publicly-fetchable
   * image URL; `shotNumber` labels the image so the skill can match it to
   * the shot(s) it grounds. Attached ONLY when a vision-capable LLM is
   * resolvable (see `generateVideoMotionPromptPack`'s own doc comment) —
   * never blocks or fails generation when unavailable, and capped at 12
   * selected shot bundles regardless of how many are supplied; every selected
   * bundle includes its start frame followed by all resolved character
   * portraits. Omitted/empty (every caller
   * before this task) preserves today's byte-identical text-only call.
   */
  startFrameImages?: Array<{
    shotNumber: number;
    url: string;
    /** Image 2 for Dual View shots. Always attached immediately after Image 1. */
    dualViewReferenceImage?: { url: string; name?: string };
    /** The labeled portraits visible/required in this shot, attached after its start frame. */
    characterReferenceImages?: ShotVideoPromptCharacterReferenceImage[];
  }>;
  storyboardShots: Array<{
    shotNumber: number;
    description: string;
    durationSeconds: number;
    /** Character keys established in this shot, in the start-frame contract order. */
    characterKeys?: string[];
    /** Explicit caller keys shown only inside phone/video-call screens. */
    screenCallerCharacterKeys?: string[];
    /** Speaker-attributed source lines, so the bulk skill cannot lose who owns a line. */
    dialogueLines?: Array<{
      line: string;
      speakerName?: string;
      characterKey?: string;
    }>;
    supportingPresence?: VerticalDramaSupportingPresence[];
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
   *
   * Cliffhanger-bleed judgment call (2026-07-11, same incident as the
   * per-shot sibling `GenerateVerticalDramaShotVideoPromptParams
   * .episodePlanContext`'s doc comment): UNLIKE the per-shot generator, this
   * function's caller (`generateRealMotionPromptPack` in
   * `verticalDramaEpisodePipeline.ts`) deliberately KEEPS
   * `cliffhangerLine` in the context it builds. Reasoning: `buildUserPrompt`
   * below renders `episodePlanContext` as exactly ONE global block for the
   * WHOLE episode in a single LLM call (not repeated per shot line, see
   * `episodePlanContextBlock`) — the confirmed bleed vector was N
   * INDEPENDENT per-shot LLM calls each risking drift, which does not apply
   * here. A single whole-episode pass can legitimately use the episode's own
   * ending beat/cliffhanger to shape its last clip(s) appropriately (same
   * spirit as the `is_retention_ending_shot` marker below). If future
   * evidence shows this whole-pack path also bleeds cliffhanger content into
   * non-final clips, revisit this decision.
   */
  episodePlanContext?: string;
  /**
   * Feature flag `verticalDramaRetentionHooks` (`planning/vertical-drama-
   * retention-hooks/plan.md` W7, added 2026-07-11) — gates whether each
   * `storyboardShots[]` line in `buildUserPrompt`'s `shotLines` block is
   * annotated with `is_opening_shot: true` / `is_retention_ending_shot:
   * true`. Both facts are fully derivable from `storyboardShots` this
   * function ALREADY receives (opening = the minimum `shotNumber`, ending =
   * the maximum) — no new caller wiring needed for this pack-level
   * generator, unlike the per-shot sibling
   * (`GenerateVerticalDramaShotVideoPromptParams.totalShotCount`). See
   * `vertical-drama-video-motion-prompt-pack/skill.md`'s "Hook +
   * retention-ending clip motion energy" rule for the actual creative
   * instruction (skill-first — no rule text lives here). Omitted/false
   * preserves today's byte-identical prompt.
   */
  retentionHooksEnabled?: boolean;
  /** Feature 137 P1 — activates bulk identity guidance without changing output schema. */
  motionContractsEnabled?: boolean;
}

function buildUserPrompt(
  params: GenerateVideoMotionPromptPackParams,
  /**
   * Pack-parity follow-up — the SAME `TARGET VIDEO MODEL (MANDATORY
   * MODEL-FAMILY SHAPING)` fact block the per-shot builder emits
   * (`buildTargetVideoModelFactBlock`), pre-computed by the caller
   * (`generateVideoMotionPromptPack`) so this pure builder never has to
   * import model-resolution helpers itself. `null` only when the caller
   * supplied no `selectedVideoModelId` at all (mirrors the old bare
   * "Preferred video model" line's identical omission condition).
   */
  targetVideoModelFactBlock: string | null,
  /**
   * Pack-parity follow-up — mirrors the per-shot builder's
   * `nativeAudioDirectionEnabled` param exactly: true only when the caller's
   * `nativeAudioEnabled` AND the resolved model's `supportsNativeAudio`
   * capability are BOTH true. Activates the skill's SOUND section fact;
   * omitted (false) preserves today's byte-identical prompt.
   */
  nativeAudioDirectionEnabled: boolean,
): string {
  const promptLanguage = params.promptLanguage ?? "en";
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];
  // Retention hooks (W7) — see `retentionHooksEnabled`'s doc comment above.
  // Only computed/rendered when the flag is on; `undefined` otherwise so no
  // shot line ever gets a marker, matching this builder's flag-off
  // byte-identical contract.
  const retentionHooksEnabled = params.retentionHooksEnabled === true;
  const openingShotNumber =
    retentionHooksEnabled && params.storyboardShots.length > 0
      ? Math.min(...params.storyboardShots.map((s) => s.shotNumber))
      : undefined;
  const endingShotNumber =
    retentionHooksEnabled && params.storyboardShots.length > 0
      ? Math.max(...params.storyboardShots.map((s) => s.shotNumber))
      : undefined;
  const shotLines = params.storyboardShots
    .map((s) => {
      const dialogue = s.dialogueLines?.length
        ? ` | dialogue: ${s.dialogueLines
            .map(line => `${line.speakerName ?? line.characterKey ?? "speaker"}: "${line.line}"`)
            .join("; ")}`
        : s.dialogueExcerpt
          ? ` | dialogue: "${s.dialogueExcerpt}"`
          : "";
      const characters = s.characterKeys?.length
        ? ` | established characters: ${s.characterKeys.join(", ")}`
        : "";
      const supportingPresence = s.supportingPresence?.length
        ? ` | declared supporting presence: ${s.supportingPresence.map(p => `${p.role} x${p.countMin === p.countMax ? p.countMin : `${p.countMin}-${p.countMax}`}`).join(", ")}`
        : "";
      const spokenCallerPolicy = deriveVerticalDramaSpokenCallerVirtualScreens({
        physicalSceneCharacterRefs: s.characterKeys ?? [],
        screenCallerCharacterRefs: s.screenCallerCharacterKeys ?? [],
        dialogueSpeakerRefs: (s.dialogueLines ?? []).flatMap(line =>
          [line.characterKey, line.speakerName].filter(
            (value): value is string => Boolean(value?.trim())
          )
        ),
      });
      const spokenCallerVirtualScreenBlock =
        renderVerticalDramaSpokenCallerVirtualScreenPromptBlock(spokenCallerPolicy);
      const retentionMarkers = [
        s.shotNumber === openingShotNumber ? "is_opening_shot: true (episode's hook shot)" : null,
        s.shotNumber === endingShotNumber
          ? "is_retention_ending_shot: true (episode's retention-loop ending shot)"
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      const retentionMarkersSuffix = retentionMarkers ? ` | ${retentionMarkers}` : "";
      return `- Shot ${s.shotNumber} (${s.durationSeconds}s): ${s.description}${characters}${supportingPresence}${dialogue}${retentionMarkersSuffix}${spokenCallerVirtualScreenBlock ? ` | ${spokenCallerVirtualScreenBlock}` : ""}`;
    })
    .join("\n");

  const visionBundleFacts = (params.startFrameImages ?? [])
    .filter(
      frame =>
        frame.characterReferenceImages?.length || frame.dualViewReferenceImage
    )
    .map(frame => {
      const refs = (frame.characterReferenceImages ?? [])
        .map(ref => `${ref.name ?? ref.characterKey} [${ref.characterKey}]`)
        .join(", ");
      const dualView = frame.dualViewReferenceImage
        ? ` Inspect BOTH Image 1 (start frame) and Image 2 (reference frame: ${frame.dualViewReferenceImage.name ?? "secondary location"}); describe timed cuts using the character and environment visible in the corresponding image and never merge the two locations into one frame.`
        : "";
      const portraits = refs
        ? ` Compare the views against these labeled character portraits before assigning any speaker position or action: ${refs}.`
        : "";
      return `VISION BUNDLE — Shot ${frame.shotNumber}:${dualView}${portraits} Each attached view is authoritative for its own character placement and environment.`;
    });

  // Part B3 — reference-only episode scene-setting context, same
  // "do not copy verbatim" contract as `buildStartFrameRenderPlanUserPrompt`.
  const episodePlanContextBlock = params.episodePlanContext
    ? `บริบทฉากของตอน (อ้างอิงเพื่อความสอดคล้อง ห้ามคัดลอกลง output):\n${params.episodePlanContext}`
    : null;

  return [
    `Episode title: ${params.episodeTitle}`,
    `Episode duration: ${params.durationSeconds} seconds`,
    `Duration profile: ${params.durationProfileId}`,
    episodePlanContextBlock,
    `Storyboard shots (bridge shots into motion clips per the skill's usual pairing strategy):\n${shotLines}`,
    visionBundleFacts.length
      ? `${visionBundleFacts.join("\n")} For every spoken line, bind the exact named character to the observed screen position using viewer-left/viewer-center-left/viewer-center/viewer-center-right/viewer-right, always from the viewer/camera side; never use anatomical left/right or left/right hand. All other established characters remain silent with mouths fully closed. Never infer identity from gender, clothing, or requested layout when the attached images disagree.`
      : null,
    `When a shot has a "dialogue" line, the resulting clip's "prompt" must explicitly mention the character speaking it and describe mouth/lip movement matching that line — do not produce a silent/mute description for a shot that has dialogue.`,
    `PROMPT LANGUAGE (MANDATORY): write every "video_clip_requests[].prompt" and "negative_motion_prompt" entirely in ${promptLanguageName} — all motion/acting/camera direction must be in ${promptLanguageName}, regardless of what language the dialogue is in.`,
    `SPEECH LANGUAGE (MANDATORY): the character(s) speak in ${dialogueLanguageName} in this video — any literal quoted dialogue embedded in a clip's prompt (native-audio models) or returned as a dialogue line must be in ${dialogueLanguageName}, adapted/translated naturally into ${dialogueLanguageName} if the source line above is shown in a different language.`,
    dialogueLanguage === "th" && params.thaiAccent
      ? `SPEECH ACCENT (MANDATORY): ${VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES[params.thaiAccent]} Apply this delivery direction to every spoken line.`
      : null,
    // Pack-parity follow-up — mirrors the per-shot builder's NATIVE AUDIO
    // DIRECTION fact (same wording/shape, adapted from "this shot" to
    // "every clip"), naming `native_audio: true` explicitly so the skill's
    // SOUND section activates; omitted entirely when off, so the skill
    // "writes no sound clause and omits audio_direction" exactly as its own
    // SOUND section instructs.
    nativeAudioDirectionEnabled
      ? `NATIVE AUDIO DIRECTION (native_audio: true): the selected video model generates synchronized audio natively as part of each clip — per the skill's SOUND section, for EVERY "video_clip_requests[]" entry write the sound direction into that clip's "prompt" itself (as the final clause) and also return the identical text in that clip's "audio_direction" field: SFX cues tied to that clip's own visible on-screen actions FIRST (primary, always produce), then a brief ambient soundscape matched to the scene's mood/location and that clip's emotional-beat intensity SECOND (secondary enrichment). NEVER include speech/dialogue/voices/vocals (dialogue comes only from "dialogue"/text-to-speech) and NEVER include music/melody/lyrics/score (a separate background-music layer owns that) in "audio_direction".`
      : null,
    // Pack-parity follow-up — grouped with the other target-model-capability
    // facts immediately above (native-audio), close to the end of the
    // prompt so the model reads it right before actually writing the clip
    // requests. `null` (omitted) only when the caller supplied no
    // `selectedVideoModelId` at all.
    targetVideoModelFactBlock,
    params.motionContractsEnabled
      ? "motion_contracts: enabled — apply the skill's identity-preserving motion section to attached start frames."
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
 *
 * Pack-parity follow-up (`planning/vd-video-prompt-model-family-quality/
 * plan.md`, "pack bulk generator — out of scope" item, closed 2026-07-22) —
 * this is still exactly ONE LLM call plus its existing retry: when
 * `params.startFrameImages` is supplied AND a vision-capable model is
 * enabled, that one call is routed through `executeVisionAwareJsonCallWithRetry`
 * (the SAME vision-call helper the per-shot generator uses) instead of
 * `executeJsonPlanningCallWithRetry`; otherwise (no images, or none
 * resolvable) the call is byte-identical to before this task — same model
 * resolution, same `executeJsonPlanningCallWithRetry` schema+transient retry
 * budget. No judged/best-of-N loop here (out of scope — this call already
 * produces 8-9 clips per generation).
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

  // Pack-parity follow-up — resolve a vision-capable model ONLY when the
  // caller supplied start-frame images to attach, reusing the SAME
  // model-resolution helper family the per-shot generator uses
  // (`resolveShotVideoPromptModel`, itself falling back to this exact
  // `resolveVerticalDramaSeriesModel(seriesId, resolveQualityLargeContextModelId)`
  // call when no vision-capable model is enabled) — never a new selection
  // policy. When no images are supplied, `model` resolves EXACTLY as before
  // this task (byte-identical text-only call).
  const wantsVision = (params.startFrameImages?.length ?? 0) > 0;
  let model: string;
  let hasVision = false;
  if (wantsVision) {
    const resolved = await resolveShotVideoPromptModel(params.seriesId);
    model = resolved.model;
    hasVision = resolved.hasVision;
    if (!hasVision) {
      // Vision fallback surface — same signal the per-shot generator logs
      // (see that function's own doc comment), so a pack call that WANTED
      // vision but couldn't get one is visible in server logs instead of
      // silently degrading. Character-grounded packs fail closed below when
      // no vision-capable model is available; text-only packs retain the
      // legacy warning-only behavior.
      console.warn(
        "[vd_video_prompt] generated WITHOUT vision (no vision-capable model enabled) — pack relied on text-only clip descriptions",
        { seriesId: params.seriesId, episodeId: params.episodeId },
      );
    }
    const hasRequiredVisualGrounding = (params.startFrameImages ?? []).some(
      frame =>
        (frame.characterReferenceImages?.length ?? 0) > 0 ||
        Boolean(frame.dualViewReferenceImage),
    );
    if (hasRequiredVisualGrounding && !hasVision) {
      throw new VdVisionRequiredError(
        "ต้องใช้โมเดลที่รองรับการอ่านภาพจริงเพื่อสร้าง video prompt จากภาพตัวละครหรือภาพคู่ Dual View",
      );
    }
  } else {
    model = await resolveVerticalDramaSeriesModel(
      params.seriesId,
      resolveQualityLargeContextModelId
    );
  }

  const systemPrompt = loadSkillSystemPrompt();

  // Pack-parity follow-up — the SAME `TARGET VIDEO MODEL` fact block +
  // native-audio fact the per-shot generator emits, reusing its exported
  // helpers rather than duplicating their logic. `capabilities` is only
  // resolvable when the caller supplied BOTH a model id and the full model
  // row (`selectedVideoModel`); absent either, capability-derived facts
  // (`maxReferenceImages`, native-audio) are simply omitted — never thrown.
  const capabilities =
    params.selectedVideoModelId && params.selectedVideoModel
      ? resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
          type: params.selectedVideoModel.type,
          aspectRatios: params.selectedVideoModel.aspectRatios,
          configJson: params.selectedVideoModel.configJson,
        })
      : undefined;
  const targetVideoModelFactBlock = params.selectedVideoModelId
    ? buildTargetVideoModelFactBlock({
        family: resolveShotVideoPromptModelFamily(
          params.selectedVideoModelId,
          params.selectedVideoModel ?? {},
        ),
        modelId: params.selectedVideoModelId,
        modelName: params.selectedVideoModel?.name,
        maxReferenceImages: capabilities?.maxReferenceImages,
        // The pack skill has no `frame_analysis` JSON contract — position
        // anchoring is a plain-prose instruction in its "Single camera move
        // + speaker anchoring per clip" section instead — so this generator
        // never requests the per-shot-only structured field.
        frameAnalysisRequested: false,
        genre: params.genre,
      })
    : null;
  const nativeAudioDirectionEnabled =
    params.nativeAudioEnabled === true && capabilities?.supportsNativeAudio === true;

  const userPrompt = buildUserPrompt(params, targetVideoModelFactBlock, nativeAudioDirectionEnabled);

  // Same truncation flaw and fix as `generateStartFrameRenderPlan` — 9
  // enriched per-shot clips (Phase 3B skill upgrades) previously truncated
  // the old 4000-token ceiling mid-array. Raised, plus one automatic
  // same-model retry on truncated/invalid JSON — see
  // `executeJsonPlanningCallWithRetry`'s doc comment. The vision branch
  // mirrors this with `executeVisionAwareJsonCallWithRetry`'s own one-retry
  // (higher-token-ceiling) contract.
  const generationResult = hasVision
    ? await executeVisionAwareJsonCallWithRetry<VideoMotionPromptPackOutput>({
        model,
        systemPrompt,
        userPromptText: userPrompt,
        hasVision: true,
        images: (params.startFrameImages ?? [])
          .slice(0, 12)
          .flatMap((frame) => [
            {
              url: frame.url,
              label: `Shot ${frame.shotNumber} start frame`,
            },
            ...(frame.dualViewReferenceImage
              ? [
                  {
                    url: frame.dualViewReferenceImage.url,
                    label: `Shot ${frame.shotNumber} — Image 2: ${frame.dualViewReferenceImage.name ?? "secondary location"}`,
                  },
                ]
              : []),
            ...(frame.characterReferenceImages ?? []).map(ref => ({
              url: ref.url,
              label: `Shot ${frame.shotNumber} character reference: ${ref.name ?? ref.characterKey} (${ref.characterKey})`,
            })),
          ]),
        userId: params.userId,
        tenantId: params.tenantId,
        publicUrl: params.publicUrl,
        schema: videoMotionPromptPackOutputSchema,
        firstAttemptMaxTokens: 16000,
        retryMaxTokens: 32000,
        modelFallbackPolicy: "recommended",
      })
    : await executeJsonPlanningCallWithRetry<VideoMotionPromptPackOutput>({
        model,
        systemPrompt,
        userPrompt,
        temperature: 0.7,
        userId: params.userId,
        maxTokens: 16000,
        schema: videoMotionPromptPackOutputSchema,
        label: "Video motion prompt pack",
        modelFallbackPolicy: "recommended",
      });
  const { data: validatedData, response } = generationResult;
  const usedVision = hasVision && "usedVision" in generationResult
    ? generationResult.usedVision
    : false;

  const hasCharacterGrounding = (params.startFrameImages ?? []).some(
    frame => (frame.characterReferenceImages?.length ?? 0) > 0,
  );
  if (hasCharacterGrounding && !usedVision) {
    throw new VdVisionRequiredError(
      "ต้องใช้โมเดลที่รองรับการอ่านภาพจริงเพื่อสร้าง video prompt ที่มีตัวละครและตำแหน่งในภาพ",
    );
  }

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
      usedVision,
    },
  });

  const pack = projectMotionPromptPack(
    validatedData,
    params.selectedVideoModelId ?? "dry-run-video-model",
    params.durationProfileId,
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
 * requires it (preferring the admin-recommended vision pool, then falling back
 * to any enabled/routable model that truthfully declares vision support before
 * using `resolveQualityLargeContextModelId()`'s non-vision default) — and in EITHER case, the
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
    const routableRows = rows.filter((row) => isAvailable(row.providerId));
    if (routableRows.length > 0) {
      const visionRequirements = {
        supportsVision: true,
        supportsStructuredOutputs: true,
      } as const;
      // Recommended-only is a quality preference, not a capability gate. A
      // complete reference set must not be rejected merely because the
      // tenant's only vision model has not been marked `isRecommended` yet.
      const visionModel = selectBestLlmModel(
        {
          ...visionRequirements,
          recommendedOnly: true,
        },
        routableRows,
      ) ?? selectBestLlmModel(visionRequirements, routableRows);
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

export const shotVideoPromptOutputSchema = z
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
    /**
     * Model-family-aware, vision-grounded video prompt quality upgrade
     * (`planning/vd-video-prompt-model-family-quality/plan.md`) — the
     * skill's "FRAME ANALYSIS FIRST" reading of who is where on screen in
     * the attached start frame, requested via the fact block's conditional
     * `frame_analysis: REQUIRED` line whenever an established character
     * portrait is attached
     * (see `buildTargetVideoModelFactBlock`). LENIENT by design (VD
     * weak-model JSON failure class — cheaper models return sloppy
     * enums/shapes): `position`/`position_source` accept ANY string, never
     * an enum, and every field is optional so a model that ignores the
     * request, or returns a malformed shape, still validates unchanged.
     * Normalized (trimmed, capped) downstream by `normalizeFrameAnalysis`
     * before being surfaced on the result — never trusted raw.
     */
    frame_analysis: z
      .object({
        people: z
          .array(
            z
              .object({
                name: z.string(),
                position: z.string(),
                view_role: z.string().optional(),
                note: z.string().optional(),
                action: z.string().optional(),
                facing: z.string().optional(),
                eyes_visible: z.string().optional(),
                occlusion: z.string().optional(),
                face_size: z.string().optional(),
                overlapped_by_other_face: z.boolean().optional(),
              })
              .passthrough(),
          )
          .optional(),
        position_source: z.string().optional(),
        faces_separated: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    /**
     * Feature 137 P1 — optional, request-gated declaration of the facial and
     * camera motion a candidate intends to perform. Deliberately lenient:
     * weak-model enum variants and extra keys cross this boundary as strings
     * and are classified by the total shared parser instead of failing the
     * whole generation response.
     */
    motion_profile: z
      .object({
        characters: z
          .array(z.object({ name: z.string() }).passthrough())
          .optional(),
        camera_motion: z.string().optional(),
        new_character_enters: z.boolean().optional(),
        identity_risk: z.string().optional(),
        risk_reasons: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ShotVideoPromptOutput = z.infer<typeof shotVideoPromptOutputSchema>;

/**
 * Character reference image input for shot-video-prompt generation
 * (multi-character disambiguation fix, `polished-toasting-gadget.md`) — see
 * `GenerateVerticalDramaShotVideoPromptParams.characterReferenceImages`'s
 * doc comment for the full contract.
 */
export interface ShotVideoPromptCharacterReferenceImage {
  characterKey: string;
  name?: string;
  url: string;
}

/**
 * Build the vision-call images array for a shot-video-prompt generation
 * call: the shot's own start frame FIRST (unlabeled, preserving today's
 * single-image shape when `characterReferenceImages`/`locationReferenceImage`
 * are empty/omitted), then each character reference portrait labeled with
 * its name so the model can visually anchor "this face = this name" when 2+
 * characters share the shot, then (Phase E of `planning/polished-toasting-
 * gadget.md` — location visual bible) the shot's single environment/location
 * reference image, if any, labeled with its name. Shared by both
 * `generateVerticalDramaShotVideoPrompt` (including its hand-rolled
 * compliance-correction retry) and
 * `generateVerticalDramaShotVideoPromptSpeakerSwitch` so all 3 vision-call
 * sites build this array identically.
 */
function buildShotVideoPromptVisionImages(
  imageUrl: string,
  characterReferenceImages?: ShotVideoPromptCharacterReferenceImage[],
  locationReferenceImage?: { url: string; name?: string },
  barrierReferenceImage?: { url: string; name?: string },
  additionalImageUrls?: string[],
): VisionAwareImageInput[] {
  return [
    {
      url: imageUrl,
      ...(barrierReferenceImage
        ? { label: `Image 1: primary shot location` }
        : {}),
    },
    ...(barrierReferenceImage
      ? [
          {
            url: barrierReferenceImage.url,
            label: `Image 2: ${barrierReferenceImage.name ?? "secondary location"}`,
          },
        ]
      : []),
    ...(characterReferenceImages ?? []).map(c => ({
      url: c.url,
      label: `Reference image for character: ${c.name ?? c.characterKey} (${c.characterKey})`,
    })),
    ...(locationReferenceImage
      ? [
          {
            url: locationReferenceImage.url,
            label: `Environment/location reference image: ${locationReferenceImage.name ?? "location"}`,
          },
        ]
      : []),
    // VideoPromptAiEditDialog — user-supplied additional reference images;
    // appended after all system-resolved reference images so the model
    // always sees the start frame first.
    ...(additionalImageUrls ?? []).map((url, i) => ({
      url,
      label: `Additional reference image ${i + 1} (user-supplied)`,
    })),
  ];
}

/* -------------------------------------------------------------------------- */
/* Model-family-aware, vision-grounded video prompt quality upgrade           */
/* (`planning/vd-video-prompt-model-family-quality/plan.md`) — shared helpers */
/* used by BOTH `generateVerticalDramaShotVideoPrompt` and                    */
/* `generateVerticalDramaShotVideoPromptSpeakerSwitch` below.                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the video-prompt-shaping family for the selected video model.
 * Never throws — `resolveVideoPromptTargetFamily` is a pure string-matching
 * function with no expected failure modes, but the fact block this feeds
 * must NEVER block/fail generation (per the plan's "emit family 'other'
 * gracefully" requirement), so any unexpected error still degrades to the
 * safe, universal-defaults `"other"` family instead of throwing. Exported
 * (alongside `buildTargetVideoModelFactBlock` below) purely so the real-
 * skill-file gate test (taught-not-wired memory) can call it directly
 * without spinning up a full mocked LLM call.
 */
export function resolveShotVideoPromptModelFamily(
  modelId: string,
  model: { name?: string; provider?: string; configJson?: Record<string, any> },
): VideoPromptModelFamily {
  try {
    return resolveVideoPromptTargetFamily({
      modelId,
      name: model.name,
      provider: model.provider,
      configJson: model.configJson,
    });
  } catch {
    return "other";
  }
}

/**
 * Build the `TARGET VIDEO MODEL (MANDATORY MODEL-FAMILY SHAPING)` fact
 * block both user-prompt builders inject — a purely FACTUAL announcement
 * (skill-first architecture: the actual per-family creative guidance lives
 * entirely in skill.md's "MODEL-FAMILY SHAPING" section, never duplicated
 * here). Always present (every shot's prompt should be shaped for its
 * target model); the trailing `frame_analysis: REQUIRED` line is the ONE
 * conditional piece, gated on `hasEstablishedCharacters` (mirrors the
 * router's own `characterReferenceImages.length >= 1` gate for resolving
 * reference portraits in the first place — see both generator functions'
 * own `hasEstablishedCharacters` local). Exported for the real-skill-file
 * gate test — see `resolveShotVideoPromptModelFamily`'s doc comment above.
 */
export function buildTargetVideoModelFactBlock(params: {
  family: VideoPromptModelFamily;
  modelId: string;
  modelName?: string;
  maxReferenceImages?: number;
  frameAnalysisRequested: boolean;
  frameObservabilityRequested?: boolean;
  motionContractsEnabled?: boolean;
  genre?: unknown;
  establishedCharacterCount?: number;
  supportingPresence?: readonly VerticalDramaSupportingPresence[];
}): string {
  const modelLabel = params.modelName
    ? `${params.modelName} (${params.modelId})`
    : params.modelId;
  return [
    `TARGET VIDEO MODEL (MANDATORY MODEL-FAMILY SHAPING):`,
    `- family: ${params.family}`,
    `- model: "${modelLabel}"`,
    `- negative_prompt_supported: ${videoPromptFamilySupportsNegativePrompt(params.family) ? "yes" : "no"}`,
    `- reference_images_accepted: ${params.maxReferenceImages ?? 0}`,
    params.frameAnalysisRequested
      ? `- frame_analysis: REQUIRED — return the frame_analysis output field per the skill's "FRAME ANALYSIS FIRST" section, reading positions from the ATTACHED IMAGE.`
      : null,
    params.frameObservabilityRequested
      ? `- frame_observability: REQUIRED — also fill the per-person observability fields (facing, eyes_visible, occlusion, face_size, overlapped_by_other_face) and the sibling faces_separated flag inside frame_analysis, per the skill's "FRAME ANALYSIS FIRST" section.`
      : null,
    params.motionContractsEnabled
      ? `- motion_profile: REQUIRED — return the motion_profile output field per the skill's "${VD_MOTION_PROFILE_SKILL_SECTION_NAME}" section, grounding start_facing in the ATTACHED IMAGE and end_facing in the shot beat.`
      : null,
    `Apply the skill's "MODEL-FAMILY SHAPING" section for this family.`,
    buildVideoPromptMotionAssuranceDirective({
      family: params.family,
      genre: params.genre,
      establishedCharacterCount: params.establishedCharacterCount,
      supportingPresence: params.supportingPresence,
    }),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/** Frozen skill section name shared by the request fact and real-file tests. */
export const VD_MOTION_PROFILE_SKILL_SECTION_NAME = "MOTION PROFILE + MOTION CONTRACT";

/**
 * Locate where a dialogue line's text starts inside `prompt`, tolerant of
 * whitespace differences (same token-by-token escaped-regex technique
 * `appendMissingDialogueVerbatim` already uses to find/strip a compliant
 * LLM's own inline quote) — returns the character index of the FIRST token,
 * or -1 when the line isn't found at all (e.g. the compliance check for
 * dialogue-verbatim embedding already failed, or the model paraphrased it).
 */
function findQuotedLineStartIndex(prompt: string, lineTh: string): number {
  const tokens = lineTh.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return -1;
  const pattern = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const match = new RegExp(pattern, "u").exec(prompt);
  return match ? match.index : -1;
}

/** Screen-position vocabulary the skill's FRAME ANALYSIS FIRST section teaches. */
const POSITION_ANCHOR_WORDS = /\b(center[-\s]left|center[-\s]right|left|center|right)\b/i;
const POSITION_ANCHOR_MARKER = "position mismatch";
const CUSTOM_IDENTITY_POSITION_MARKER = "custom identity position conflict";
const SPEAKER_CUE_MARKER = "missing explicit speaker cue";
// A nearby character name is not sufficient to bind a quoted line to the
// correct voice.  Weak models often mention the speaker in the preceding
// sentence and then emit an un-attributed quote; treat only a name paired
// with an explicit speech verb as a deterministic speaker cue.
const SPEAKING_VERB_WORDS =
  /\b(?:say|says|said|speak|speaks|spoke|whisper|whispers|whispered|reply|replies|replied|answer|answers|answered|continue|continues|continued|state|states|stated|utter|utters|call|calls|shout|shouts|shouted|yell|yells|yelled|talk|talks)\b|พูด|กล่าว|กระซิบ|ตอบ|ตะโกน|ตะโกนเรียก/iu;
const CUSTOM_IDENTITY_POSITION_WORDS =
  /\b(?:viewer|screen)[ -](?:left|right|center(?:[ -](?:left|right))?)\b/iu;
const POSITION_AMBIGUITY_MARKER = "ambiguous screen position";
const POSITION_VIEW_SCOPE_MARKER = "view scope mismatch";
const MAX_VIDEO_PROMPT_REPAIR_ATTEMPTS = 3;

function isHardPositionIssue(issue: string): boolean {
  return issue.includes(POSITION_ANCHOR_MARKER) ||
    issue.includes(POSITION_AMBIGUITY_MARKER) ||
    issue.includes(POSITION_VIEW_SCOPE_MARKER) ||
    issue.includes(CUSTOM_IDENTITY_POSITION_MARKER) ||
    issue.includes(SPEAKER_CUE_MARKER);
}

function isStructuralPositionIssue(issue: string): boolean {
  return issue.includes(POSITION_ANCHOR_MARKER) ||
    issue.includes(POSITION_AMBIGUITY_MARKER) ||
    issue.includes(POSITION_VIEW_SCOPE_MARKER) ||
    issue.includes(CUSTOM_IDENTITY_POSITION_MARKER);
}
const POSITION_AMBIGUITY_WORDS = /\b(?:left|right)[ -]hand(?:[ -]side)?\b/i;

type VdScreenPosition = "left" | "center-left" | "center" | "center-right" | "right";
type VdFrameViewRole = "start_frame" | "barrier_reference";
type VdFramePositionEntry = {
  position: VdScreenPosition;
  viewRole?: VdFrameViewRole;
};

function normalizeSpeakerLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function hasExplicitSpeakerCue(window: string, speaker: string | undefined): boolean {
  if (!speaker?.trim()) return false;
  const normalizedWindow = normalizeSpeakerLabel(window);
  const normalizedSpeaker = normalizeSpeakerLabel(speaker);
  if (!normalizedWindow.includes(normalizedSpeaker)) return false;
  const speakerIndex = normalizedWindow.lastIndexOf(normalizedSpeaker);
  const afterSpeaker = normalizedWindow.slice(
    speakerIndex + normalizedSpeaker.length,
  );
  return SPEAKING_VERB_WORDS.test(afterSpeaker);
}

/** Normalize the weak-model position prose into the contract's five buckets. */
function normalizeScreenPosition(value: unknown): VdScreenPosition | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
  if (/\bcenter(?:-| )left\b|\bleft(?:-| )center\b/.test(normalized)) return "center-left";
  if (/\bcenter(?:-| )right\b|\bright(?:-| )center\b/.test(normalized)) return "center-right";
  if (/\b(leftmost|far left|viewer[ -]left|screen[ -]left)\b/.test(normalized)) return "left";
  if (/\b(rightmost|far right|viewer[ -]right|screen[ -]right)\b/.test(normalized)) return "right";
  if (/\b(left)\b/.test(normalized)) return "left";
  if (/\b(right)\b/.test(normalized)) return "right";
  if (/\b(center|middle|centred|centered)\b/.test(normalized)) return "center";
  return undefined;
}

function extractPromptScreenPosition(value: string): VdScreenPosition | undefined {
  const match = POSITION_ANCHOR_WORDS.exec(value);
  POSITION_ANCHOR_WORDS.lastIndex = 0;
  return match ? normalizeScreenPosition(match[0]) : undefined;
}

function normalizeFrameViewRole(value: unknown): VdFrameViewRole | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase().replace(/[ -]+/g, "_");
  if (["start_frame", "view_1", "view1", "inside"].includes(normalized)) {
    return "start_frame";
  }
  if (
    ["barrier_reference", "reference_frame", "view_2", "view2", "outside"].includes(
      normalized,
    )
  ) {
    return "barrier_reference";
  }
  return undefined;
}

function resolveDialogueFrameViewRole(
  line: { characterKey?: string },
  barrierMultiView?: VerticalDramaBarrierMultiView,
): VdFrameViewRole | undefined {
  if (!barrierMultiView || !line.characterKey) return undefined;
  const side = barrierMultiView.dialogueSideMap[line.characterKey];
  if (side === "inside") return "start_frame";
  if (side === "outside") return "barrier_reference";
  if (barrierMultiView.startView.characterRefs.includes(line.characterKey)) return "start_frame";
  if (barrierMultiView.referenceView.characterRefs.includes(line.characterKey)) {
    return "barrier_reference";
  }
  return undefined;
}

function promptWindowHasFrameViewRole(value: string, role: VdFrameViewRole): boolean {
  return role === "start_frame"
    ? /\bimage\s*1\b/iu.test(value)
    : /\bimage\s*2\b/iu.test(value);
}

function buildFrameAnalysisPositionMap(
  raw: ShotVideoPromptOutput["frame_analysis"],
): Map<string, VdFramePositionEntry[]> {
  const positions = new Map<string, VdFramePositionEntry[]>();
  for (const person of raw?.people ?? []) {
    const name = typeof person?.name === "string" ? person.name.trim() : "";
    const position = normalizeScreenPosition(person?.position);
    if (!name || !position) continue;
    const key = normalizeSpeakerLabel(name);
    positions.set(key, [
      ...(positions.get(key) ?? []),
      { position, viewRole: normalizeFrameViewRole(person?.view_role) },
    ]);
  }
  return positions;
}

function resolveFrameAnalysisSpeakerEntries(
  line: { characterKey?: string; speakerName?: string },
  positions: Map<string, VdFramePositionEntry[]>,
): VdFramePositionEntry[] {
  for (const label of [line.speakerName, line.characterKey]) {
    if (!label) continue;
    const entries = positions.get(normalizeSpeakerLabel(label));
    if (entries?.length) return entries;
  }
  return [];
}

function buildFrameAnalysisPositionLock(
  raw: ShotVideoPromptOutput["frame_analysis"],
  barrierMultiView?: VerticalDramaBarrierMultiView,
): string | undefined {
  const entries = (raw?.people ?? [])
    .map(person => {
      const name = typeof person?.name === "string" ? person.name.trim() : "";
      const position = normalizeScreenPosition(person?.position);
      const viewRole = normalizeFrameViewRole(person?.view_role);
      if (!name || !position || (barrierMultiView && !viewRole)) return null;
      const viewLabel =
        viewRole === "start_frame"
          ? "Image 1"
          : viewRole === "barrier_reference"
            ? "Image 2"
            : undefined;
      return `${viewLabel ? `${viewLabel}: ` : ""}${name}=${position}`;
    })
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(", ") : undefined;
}

function getCharacterDescriptionOverride(
  characterKey: string | undefined,
  overrides?: VerticalDramaCharacterDescriptionOverrides,
): string | undefined {
  if (!characterKey) return undefined;
  const description = overrides?.[characterKey]?.trim();
  return description || undefined;
}

function buildCharacterDescriptionOverrideBlock(
  overrides: VerticalDramaCharacterDescriptionOverrides | undefined,
  characterNameByKey?: ReadonlyMap<string, string>,
): string | undefined {
  const entries = Object.entries(overrides ?? {});
  if (entries.length === 0) return undefined;
  const lines = entries.map(([characterKey, description]) => {
    const name = characterNameByKey?.get(characterKey) ?? characterKey;
    return `${name} [characterKey=${characterKey}]: ${description}`;
  });
  return `CUSTOM CHARACTER IDENTIFICATION OVERRIDES (AUTHORITATIVE; user supplied for this shot): ${lines.join("; ")}. For every listed character, use the supplied description as the identity anchor and do NOT identify or anchor that character by viewer-left/viewer-right screen position. Do not combine the custom description with a conflicting position cue.`;
}

/**
 * Keep shot-local identity cues in the final provider prompt, not only in the
 * LLM's input facts. This makes the user-authored description durable even
 * when the model paraphrases or omits the instruction in its prose.
 */
function appendCustomCharacterIdentityLocks(
  prompt: string,
  overrides: VerticalDramaCharacterDescriptionOverrides | undefined,
  characterNameByKey: ReadonlyMap<string, string>,
): string {
  const entries = Object.entries(overrides ?? {}).filter(([, description]) =>
    description.trim().length > 0,
  );
  if (entries.length === 0) return prompt.trim();
  if (prompt.includes("CUSTOM CHARACTER IDENTITY LOCK")) return prompt.trim();
  const lock = entries
    .map(([characterKey, description]) => {
      const name = characterNameByKey.get(characterKey) ?? characterKey;
      return `${name} [characterKey=${characterKey}]: ${description.trim()}`;
    })
    .join("; ");
  return `${prompt.trim()}\nCUSTOM CHARACTER IDENTITY LOCK (AUTHORITATIVE; use instead of screen position): ${lock}. Do not identify these characters by viewer-left, viewer-right, viewer-center, or any other screen position.`;
}

function findDirectCustomIdentityPositionCue(
  value: string,
  label: string | undefined,
): string | undefined {
  if (!label?.trim()) return undefined;
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value.match(
    new RegExp(
      `${escapedLabel}.{0,40}${CUSTOM_IDENTITY_POSITION_WORDS.source}|${CUSTOM_IDENTITY_POSITION_WORDS.source}.{0,40}${escapedLabel}`,
      "iu",
    ),
  );
  return match?.[0];
}

/**
 * The authoritative custom-identity lock itself contains phrases such as
 * "do not identify ... by viewer-left".  Those are prohibitions, not a
 * position assignment.  Keep the detector from treating its own safety
 * instruction as a contradiction (the bug surfaced as Shot 6 failing after
 * the prompt had already been repaired).
 */
function isNegatedCustomIdentityPositionCue(window: string, cue: string): boolean {
  const cueIndex = window.toLocaleLowerCase().indexOf(cue.toLocaleLowerCase());
  if (cueIndex < 0) return false;
  const prefix = window.slice(0, cueIndex);
  return /(?:do\s+not|don't|never|without|instead\s+of|rather\s+than|avoid|ห้าม|อย่า|ไม่ใช้)[^.!?]{0,80}$/iu.test(
    prefix,
  );
}

/**
 * Last-resort text repair for a model that keeps repeating a viewer-relative
 * position next to a user-authored identity description.  It only removes the
 * conflicting position phrase; the exact custom description is re-appended by
 * appendCustomCharacterIdentityLocks immediately afterwards.  This is safer
 * than returning a paid-call error because the source identity is still
 * available and the contradiction is purely textual.
 */
function removeCustomIdentityPositionCues(
  prompt: string,
  overrides: VerticalDramaCharacterDescriptionOverrides | undefined,
  characterNameByKey: ReadonlyMap<string, string>,
): string {
  let repaired = prompt;
  const position = "(?:viewer|screen)[ -](?:left|right|center(?:[ -](?:left|right))?)";
  for (const [characterKey, description] of Object.entries(overrides ?? {})) {
    if (!description.trim()) continue;
    const label = characterNameByKey.get(characterKey) ?? characterKey;
    if (!label.trim()) continue;
    const escaped = label.replace(/[.*+?^${}()|[\[\]\\]/g, "\\$&");
    repaired = repaired.replace(
      new RegExp(`(${escaped}[^.!?\\n]{0,80}?)(?:on|at|from|in|อยู่ที่|ด้าน)\\s+${position}`, "giu"),
      "$1",
    );
  }
  return repaired.trim();
}

/**
 * A custom identity cue and a viewer-relative position are mutually
 * exclusive. Detect the contradiction before credit deduction/persistence so
 * a model cannot silently ship the ambiguous version shown in the UI bug.
 */
function findCustomIdentityPositionIssues(
  prompt: string,
  dialogueLines: Array<{ lineTh: string; characterKey?: string; speakerName?: string }>,
  overrides: VerticalDramaCharacterDescriptionOverrides | undefined,
  characterNameByKey: ReadonlyMap<string, string>,
): string[] {
  const entries = Object.entries(overrides ?? {}).filter(([, description]) =>
    description.trim().length > 0,
  );
  if (entries.length === 0) return [];

  const labelsByKey = new Map<string, Set<string>>(
    entries.map(([characterKey]) => [characterKey, new Set<string>()]),
  );
  for (const line of dialogueLines) {
    if (!line.characterKey || !labelsByKey.has(line.characterKey)) continue;
    if (line.speakerName?.trim()) {
      labelsByKey.get(line.characterKey)!.add(line.speakerName.trim());
    }
  }
  for (const [characterKey] of entries) {
    const name = characterNameByKey.get(characterKey);
    if (name?.trim()) labelsByKey.get(characterKey)!.add(name.trim());
    // Bare generated keys such as "character" are too generic to identify a
    // person in prose ("the character on viewer-left" is common and may refer
    // to someone else). Use them only when no human/display label is known.
    if (
      labelsByKey.get(characterKey)!.size === 0 &&
      !/^character(?:-\d+)?$/iu.test(characterKey)
    ) {
      labelsByKey.get(characterKey)!.add(characterKey);
    }
  }

  const issues: string[] = [];
  const lowerPrompt = prompt.toLocaleLowerCase();
  for (const [characterKey, labels] of labelsByKey) {
    for (const label of labels) {
      const lowerLabel = label.toLocaleLowerCase();
      let searchFrom = 0;
      while (searchFrom < lowerPrompt.length) {
        const labelIndex = lowerPrompt.indexOf(lowerLabel, searchFrom);
        if (labelIndex < 0) break;
        const window = prompt.slice(
          Math.max(0, labelIndex - 40),
          Math.min(prompt.length, labelIndex + label.length + 50),
        );
        const positionMatch = findDirectCustomIdentityPositionCue(window, label);
        if (positionMatch && !isNegatedCustomIdentityPositionCue(window, positionMatch[0])) {
          issues.push(
            `${label} [characterKey=${characterKey}] — ${CUSTOM_IDENTITY_POSITION_MARKER}: custom identity must not be combined with ${positionMatch[0]}`,
          );
          break;
        }
        searchFrom = labelIndex + lowerLabel.length;
      }
      if (issues.some(issue => issue.includes(`[characterKey=${characterKey}]`))) {
        break;
      }
    }
  }
  return issues;
}

function buildCharacterNameByKey(
  characterReferenceImages: ShotVideoPromptCharacterReferenceImage[] | undefined,
  verifiedCastPositions: readonly VerticalDramaVerifiedCastPosition[] | undefined,
  dialogueLines: Array<{ characterKey?: string; speakerName?: string }>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const ref of characterReferenceImages ?? []) {
    if (ref.name?.trim()) names.set(ref.characterKey, ref.name.trim());
  }
  for (const position of verifiedCastPositions ?? []) {
    if (position.name?.trim()) names.set(position.characterKey, position.name.trim());
  }
  for (const line of dialogueLines) {
    if (line.characterKey && line.speakerName?.trim()) {
      names.set(line.characterKey, line.speakerName.trim());
    }
  }
  return names;
}

/**
 * Position-anchor compliance check (`planning/vd-video-prompt-model-family-
 * quality/plan.md`, item C) — returns a short, human-readable issue string
 * per dialogue line whose speaker/screen-position isn't anchored near its
 * quoted text in `prompt`, per the skill's "FRAME ANALYSIS FIRST" section:
 * (1) when `hasEstablishedCharacters` is true, `frame_analysis.people` must
 * be present and non-empty; (2) each line's quoted text must be preceded
 * within ~200 chars by the speaker's name; (3) a position word
 * (left/center/right/center-left/center-right) must appear in that same
 * preceding window. Lenient by construction (VD weak-model JSON failure
 * class) — reads plain strings only, never enforces an enum shape on
 * `frame_analysis`. A line whose quote can't be located in `prompt` at all
 * is skipped here (that failure mode is what the dialogue-verbatim check
 * already governs) rather than double-reported.
 *
 * `hasEstablishedCharacters` MUST be the caller's own already-computed
 * "established character portrait attached" signal (the same one that gates
 * the `frame_analysis: REQUIRED` fact line in `buildTargetVideoModelFactBlock`)
 * — never re-derived here — so this check never flags the (1) issue for
 * shots where the skill was never asked for `frame_analysis` in the first
 * place (no established character portrait attached). Per-line name/
 * position checks (2)/(3) are unaffected by this flag and still run for
 * every dialogue line whose quote is found, established characters or not.
 */
function findPositionAnchorIssues(
  data: Pick<ShotVideoPromptOutput, "prompt" | "frame_analysis">,
  dialogueLines: Array<{ lineTh: string; characterKey?: string; speakerName?: string }>,
  hasEstablishedCharacters: boolean,
  barrierMultiView?: VerticalDramaBarrierMultiView,
  verifiedCastPositions?: readonly VerticalDramaVerifiedCastPosition[],
  characterDescriptionOverrides?: VerticalDramaCharacterDescriptionOverrides,
): string[] {
  const issues: string[] = [];
  const people = data.frame_analysis?.people;
  const framePositions = buildFrameAnalysisPositionMap(data.frame_analysis);
  if (hasEstablishedCharacters && (!Array.isArray(people) || people.length === 0)) {
    issues.push(`frame_analysis.people is missing or empty`);
  }
  for (const locked of verifiedCastPositions ?? []) {
    if (getCharacterDescriptionOverride(locked.characterKey, characterDescriptionOverrides)) {
      continue;
    }
    const entries = resolveFrameAnalysisSpeakerEntries(
      { characterKey: locked.characterKey, speakerName: locked.name },
      framePositions,
    );
    const expected = normalizeScreenPosition(locked.position);
    if (!entries.length) {
      issues.push(
        `${locked.name} (${locked.characterKey}) — ${POSITION_ANCHOR_MARKER}: verified cast lock says ${locked.position}, frame_analysis is missing this character`,
      );
    } else if (!entries.some(entry => entry.position === expected)) {
      issues.push(
        `${locked.name} (${locked.characterKey}) — ${POSITION_ANCHOR_MARKER}: verified cast lock says ${locked.position}, frame_analysis says ${entries.map(entry => entry.position).join("/")}`,
      );
    }
  }
  const prompt = data.prompt ?? "";
  const ANCHOR_WINDOW_CHARS = 200;
  for (const line of dialogueLines) {
    const speaker = line.speakerName ?? line.characterKey;
    const quoteIndex = findQuotedLineStartIndex(prompt, line.lineTh);
    if (quoteIndex < 0) continue;
    const window = prompt.slice(Math.max(0, quoteIndex - ANCHOR_WINDOW_CHARS), quoteIndex);
    const customDescription = getCharacterDescriptionOverride(
      line.characterKey,
      characterDescriptionOverrides,
    );
    if (customDescription) {
      if (speaker && !hasExplicitSpeakerCue(window, speaker)) {
        issues.push(
          `"${line.lineTh}" (${speaker}) — ${SPEAKER_CUE_MARKER}: place the speaker name and a speaking verb immediately before the quoted line`,
        );
      }
      const customPosition = findDirectCustomIdentityPositionCue(
        window,
        speaker ?? line.characterKey,
      );
      if (customPosition) {
        issues.push(
          `"${line.lineTh}"${speaker ? ` (${speaker})` : ""} — ${CUSTOM_IDENTITY_POSITION_MARKER}: custom identity must not be combined with ${customPosition[0]}`,
        );
      }
      continue;
    }
    const normalizedWindow = normalizeSpeakerLabel(window);
    const normalizedSpeaker = speaker ? normalizeSpeakerLabel(speaker) : "";
    const hasName = speaker ? normalizedWindow.includes(normalizedSpeaker) : true;
    const speakerIndex = speaker
      ? window.toLocaleLowerCase().lastIndexOf(speaker.toLocaleLowerCase())
      : -1;
    const speakerAnchorWindow =
      speakerIndex >= 0 ? window.slice(speakerIndex + (speaker?.length ?? 0)) : window;
    if (POSITION_AMBIGUITY_WORDS.test(speakerAnchorWindow)) {
      issues.push(
        `"${line.lineTh}"${speaker ? ` (${speaker})` : ""} — ${POSITION_AMBIGUITY_MARKER}: use viewer-left/viewer-right, never anatomical left/right or left/right hand`,
      );
      continue;
    }
    const promptPosition = extractPromptScreenPosition(speakerAnchorWindow);
    const expectedViewRole = resolveDialogueFrameViewRole(line, barrierMultiView);
    const speakerEntries = resolveFrameAnalysisSpeakerEntries(line, framePositions);
    const expectedEntry = expectedViewRole
      ? speakerEntries.find(entry => entry.viewRole === expectedViewRole)
      : speakerEntries[0];
    const lockedSpeaker = (verifiedCastPositions ?? []).find(locked =>
      [locked.characterKey, locked.name]
        .map(normalizeSpeakerLabel)
        .includes(normalizedSpeaker),
    );
    const expectedPosition =
      normalizeScreenPosition(lockedSpeaker?.position) ?? expectedEntry?.position;
    const hasPosition = Boolean(promptPosition);
    if (!hasName || !hasPosition) {
      const missing = [!hasName ? "speaker name" : null, !hasPosition ? "position anchor" : null]
        .filter(Boolean)
        .join(" and ");
      issues.push(`"${line.lineTh}"${speaker ? ` (${speaker})` : ""} — missing ${missing} within ~200 chars before the quote`);
      continue;
    }
    if (expectedViewRole) {
      const viewLabel =
        expectedViewRole === "start_frame"
          ? "Image 1"
          : "Image 2";
      if (!expectedEntry) {
        const observedRoles = speakerEntries
          .map(entry => entry.viewRole ?? "unscoped")
          .join(", ");
        issues.push(
          `"${line.lineTh}"${speaker ? ` (${speaker})` : ""} — ${POSITION_VIEW_SCOPE_MARKER}: expected ${viewLabel}, frame_analysis says ${observedRoles || "missing"}`,
        );
        continue;
      }
      if (!promptWindowHasFrameViewRole(window, expectedViewRole)) {
        issues.push(
          `"${line.lineTh}"${speaker ? ` (${speaker})` : ""} — ${POSITION_VIEW_SCOPE_MARKER}: prompt must anchor this cue to ${viewLabel}`,
        );
        continue;
      }
    }
    if (hasEstablishedCharacters && !expectedPosition) {
      issues.push(
        `"${line.lineTh}"${speaker ? ` (${speaker})` : ""} — frame_analysis has no usable position for this speaker`,
      );
    } else if (expectedPosition && promptPosition !== expectedPosition) {
      issues.push(
        `"${line.lineTh}"${speaker ? ` (${speaker})` : ""} — ${POSITION_ANCHOR_MARKER}: ${lockedSpeaker ? "verified cast lock" : "frame_analysis"} says ${expectedPosition}, prompt says ${promptPosition}`,
      );
    }
  }
  return issues;
}

/**
 * Repair a wrong viewer-relative anchor from the authoritative cast/frame
 * facts.  This is intentionally deterministic: the LLM may choose prose and
 * camera language, but it must not override a verified position lock.  Custom
 * identity overrides are excluded because they deliberately replace screen
 * position as the identity anchor.
 */
function repairPositionAnchorsDeterministically(
  prompt: string,
  dialogueLines: Array<{ lineTh: string; characterKey?: string; speakerName?: string }>,
  frameAnalysis: ShotVideoPromptOutput["frame_analysis"],
  hasEstablishedCharacters: boolean,
  barrierMultiView?: VerticalDramaBarrierMultiView,
  verifiedCastPositions?: readonly VerticalDramaVerifiedCastPosition[],
  characterDescriptionOverrides?: VerticalDramaCharacterDescriptionOverrides,
): string {
  if (!prompt.trim()) return prompt;
  let repaired = prompt;
  const framePositions = buildFrameAnalysisPositionMap(frameAnalysis);
  for (const line of dialogueLines) {
    if (getCharacterDescriptionOverride(line.characterKey, characterDescriptionOverrides)) continue;
    const speaker = line.speakerName ?? line.characterKey;
    if (!speaker) continue;
    const quoteIndex = findQuotedLineStartIndex(repaired, line.lineTh);
    if (quoteIndex < 0) continue;
    const windowStart = Math.max(0, quoteIndex - 200);
    const window = repaired.slice(windowStart, quoteIndex);
    const normalizedSpeaker = normalizeSpeakerLabel(speaker);
    const speakerIndex = window.toLocaleLowerCase().lastIndexOf(normalizedSpeaker);
    if (speakerIndex < 0) continue;
    const lockedSpeaker = (verifiedCastPositions ?? []).find(locked =>
      [locked.characterKey, locked.name].map(normalizeSpeakerLabel).includes(normalizedSpeaker),
    );
    const expectedViewRole = resolveDialogueFrameViewRole(line, barrierMultiView);
    const entries = resolveFrameAnalysisSpeakerEntries(line, framePositions);
    const expectedEntry = expectedViewRole
      ? entries.find(entry => entry.viewRole === expectedViewRole)
      : entries[0];
    const expectedPosition = normalizeScreenPosition(lockedSpeaker?.position) ?? expectedEntry?.position;
    if (!expectedPosition && !hasEstablishedCharacters) continue;
    const anchorStart = windowStart + speakerIndex + speaker.length;
    const anchorText = repaired.slice(anchorStart, quoteIndex);
    const positionMatch = anchorText.match(POSITION_ANCHOR_WORDS);
    const expectedLabel = `viewer-${expectedPosition ?? "center"}`;
    if (positionMatch && expectedPosition) {
      let matchIndex = anchorStart + (positionMatch.index ?? 0);
      let matchLength = positionMatch[0].length;
      const preceding = repaired.slice(Math.max(anchorStart, matchIndex - 12), matchIndex);
      const scopePrefix = preceding.match(/(?:viewer|screen)[ -]$/iu);
      if (scopePrefix) {
        matchIndex -= scopePrefix[0].length;
        matchLength += scopePrefix[0].length;
      }
      repaired = `${repaired.slice(0, matchIndex)}${expectedLabel}${repaired.slice(matchIndex + matchLength)}`;
    } else if (!positionMatch && expectedPosition) {
      const insertion = ` (${expectedLabel})`;
      repaired = `${repaired.slice(0, anchorStart)}${insertion}${repaired.slice(anchorStart)}`;
    }
    if (expectedViewRole) {
      const viewLabel = expectedViewRole === "start_frame" ? "Image 1" : "Image 2";
      const refreshedQuoteIndex = findQuotedLineStartIndex(repaired, line.lineTh);
      if (refreshedQuoteIndex >= 0) {
        const refreshedWindowStart = Math.max(0, refreshedQuoteIndex - 220);
        const refreshedWindow = repaired.slice(refreshedWindowStart, refreshedQuoteIndex);
        if (!promptWindowHasFrameViewRole(refreshedWindow, expectedViewRole)) {
          const refreshedSpeakerIndex = refreshedWindow.toLocaleLowerCase().lastIndexOf(normalizedSpeaker);
          if (refreshedSpeakerIndex >= 0) {
            const insertAt = refreshedWindowStart + refreshedSpeakerIndex;
            repaired = `${repaired.slice(0, insertAt)}${viewLabel}: ${repaired.slice(insertAt)}`;
          }
        }
      }
    }
  }
  return repaired;
}

/**
 * Repair the narrow case where the model preserved a canonical dialogue line
 * verbatim but omitted that line's explicit named-speaker cue after the one
 * allowed corrective retry. This is deterministic and text-preserving: it
 * inserts only `<canonical speaker> says:` immediately before the existing
 * opening quote. This is safe for every known speaker (not only custom
 * identity overrides): the canonical dialogue source already resolved the
 * speaker key, so adding the missing attribution cannot change the spoken
 * text or invent a new person. Identity/position contradictions remain
 * fail-closed in the normal post-repair validation below.
 */
function addMissingCanonicalSpeakerCues(
  prompt: string,
  dialogueLines: Array<{
    lineTh: string;
    characterKey?: string;
    speakerName?: string;
  }>,
  _characterDescriptionOverrides?: VerticalDramaCharacterDescriptionOverrides,
): string {
  let repaired = prompt;
  const ANCHOR_WINDOW_CHARS = 200;

  for (const line of dialogueLines) {
    const speaker = line.speakerName ?? line.characterKey;
    if (!speaker) continue;
    const lineStart = findQuotedLineStartIndex(repaired, line.lineTh);
    if (lineStart < 0) continue;
    const precedingWindow = repaired.slice(
      Math.max(0, lineStart - ANCHOR_WINDOW_CHARS),
      lineStart,
    );
    if (hasExplicitSpeakerCue(precedingWindow, speaker)) {
      continue;
    }

    const immediatePrefix = repaired.slice(
      Math.max(0, lineStart - 8),
      lineStart,
    );
    const quoteMatch = /["'“‘]\s*$/u.exec(immediatePrefix);
    const insertionIndex = quoteMatch
      ? lineStart - quoteMatch[0].length
      : lineStart;
    repaired = `${repaired.slice(0, insertionIndex)}${speaker} says: ${repaired.slice(insertionIndex)}`;
  }

  return repaired;
}

/**
 * Return the exact user-authored identity fragments that must survive every
 * provider-ready refinement pass.  Keeping this helper next to the prompt
 * composer gives the router and the paid-render boundary one canonical
 * representation instead of each reconstructing a subtly different lock.
 */
export function buildCustomCharacterIdentityLockFragments(
  overrides: VerticalDramaCharacterDescriptionOverrides | undefined,
  characterNameByKey: ReadonlyMap<string, string>,
): string[] {
  return Object.entries(overrides ?? {})
    .filter(([, description]) => description.trim().length > 0)
    .map(([characterKey, description]) => {
      const name = characterNameByKey.get(characterKey) ?? characterKey;
      return `${name} [characterKey=${characterKey}]: ${description.trim()}`;
    });
}

/**
 * Normalize the LLM's raw `frame_analysis` output into the compact shape
 * persisted on the clip (`VerticalDramaMotionPromptPack["clips"][number]
 * .frameAnalysis`, `@shared/verticalDramaSeries/contracts`) — trims each
 * name/position to <=80 chars, drops any person missing a usable name or
 * position, and caps the list at 6 people. Returns `undefined` when there's
 * nothing usable (absent, malformed, or empty after filtering) so the
 * result field is omitted entirely rather than persisting a useless empty
 * shape — mirrors this file's established "omit when there's nothing to
 * say" convention.
 */
export type VdFrameAnalysis = {
  people: Array<{
    name: string;
    position: string;
    viewRole?: VdFrameViewRole;
    action?: string;
    facing?: string;
    eyesVisible?: string;
    occlusion?: string;
    faceSize?: string;
    overlappedByOtherFace?: boolean;
  }>;
  positionSource?: string;
  facesSeparated?: boolean;
};

export function normalizeFrameAnalysis(
  raw: ShotVideoPromptOutput["frame_analysis"],
): VdFrameAnalysis | undefined {
  if (!raw || !Array.isArray(raw.people)) return undefined;
  const normalizedString = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0
      ? value.trim().toLowerCase().slice(0, 24)
      : undefined;
  const people = raw.people
    .map(p => ({
      name: typeof p?.name === "string" ? p.name.trim().slice(0, 80) : "",
      position: typeof p?.position === "string" ? p.position.trim().slice(0, 80) : "",
      viewRole: normalizeFrameViewRole(p?.view_role),
      action:
        typeof p?.action === "string"
          ? p.action.trim().slice(0, 120)
          : undefined,
      facing: normalizedString(p?.facing),
      eyesVisible: normalizedString(p?.eyes_visible),
      occlusion: normalizedString(p?.occlusion),
      faceSize: normalizedString(p?.face_size),
      overlappedByOtherFace:
        p?.overlapped_by_other_face === true
          ? true
          : p?.overlapped_by_other_face === false
            ? false
            : undefined,
    }))
    .filter(p => p.name.length > 0 && p.position.length > 0)
    .slice(0, 6);
  if (people.length === 0) return undefined;
  return {
    people,
    positionSource:
      typeof raw.position_source === "string" && raw.position_source.trim().length > 0
        ? raw.position_source.trim().slice(0, 40)
        : undefined,
    facesSeparated:
      raw.faces_separated === true
        ? true
        : raw.faces_separated === false
          ? false
          : undefined,
  };
}

/**
 * Resolve an optional wire profile into the bounded persisted form. Flag-off
 * ignores even volunteered output; flag-on preserves missing-vs-invalid
 * telemetry without inventing a low-risk profile.
 */
export function resolveShotVideoPromptMotionProfile(
  raw: unknown,
  motionContractsEnabled: boolean,
): {
  motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
  effectiveRisk?: VdIdentityRisk;
  motionContractStatus?: VdMotionContractStatus;
} {
  if (!motionContractsEnabled) return {};
  const parsed = parseMotionProfile(raw);
  if (parsed.status !== "emitted") return { motionContractStatus: parsed.status };
  const motionProfile = { ...parsed.profile, effectiveRisk: parsed.effectiveRisk };
  return {
    motionProfile,
    effectiveRisk: parsed.effectiveRisk,
    motionContractStatus: "emitted",
  };
}

export interface GenerateVerticalDramaShotVideoPromptParams {
  userId: number;
  tenantId?: string;
  publicUrl?: string | null;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  /** Enables the flag-gated frame-observability and motion-contract channel. */
  motionContractsEnabled?: boolean;
  /**
   * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W7,
   * tenant flag `verticalDramaRetentionHooks`, added 2026-07-11) — the
   * episode's total shot count, used ONLY to derive `is_retention_ending_shot`
   * (true when `shotNumber === totalShotCount`). `is_opening_shot` needs no
   * extra param — `shotNumber === 1` is already derivable from the existing
   * `shotNumber` field above. Optional; no current call site
   * (`verticalDramaEpisodes.ts`'s `generateShotVideoPrompt`) supplies this
   * yet — wiring the router is a LATER round, out of scope here per the plan.
   * Omitted, this stays `undefined` and `is_retention_ending_shot` is never
   * asserted, so every existing caller's prompt is byte-identical.
   */
  totalShotCount?: number;
  /**
   * Feature flag `verticalDramaRetentionHooks` (`planning/vertical-drama-
   * retention-hooks/plan.md` W7, added 2026-07-11) — gates whether the
   * `is_opening_shot`/`is_retention_ending_shot` facts (derived from
   * `shotNumber`/`totalShotCount` above) are rendered into the prompt at all
   * (see `buildShotVideoPromptUserPrompt`). Resolved by the CALLER from the
   * tenant feature flag — this function never calls `getTenantFeatureFlags`
   * itself, same "caller resolves, function just uses the boolean"
   * convention as `nativeAudioEnabled` below. All of the actual RULE TEXT for
   * how the model should treat an opening/ending shot's motion energy lives
   * in skill.md's "Hook + retention-ending shot motion energy" rule —
   * skill-first architecture, no creative rule text duplicated here.
   * Omitted/false preserves today's byte-identical prompt.
   */
  retentionHooksEnabled?: boolean;
  /**
   * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W7,
   * router-wiring package, added 2026-07-11) — the episode script's
   * top-level `hook` string, verbatim. Skill-first architecture (no rule
   * TEXT lives in this file) — this is purely a structured FACT the caller
   * already has loaded (the episode's persisted script artifact), passed
   * through so the "hook shot" rule above can ground itself in the ACTUAL
   * hook rather than inferring "some kind of hook" purely from this shot's
   * own `description`/`camera`/`emotion`. Only rendered when
   * `retentionHooksEnabled` is true AND this shot is the opening shot
   * (`shotNumber === 1`); omitted otherwise or when absent — every existing
   * caller (which never supplies this) gets a byte-identical prompt.
   */
  hookText?: string;
  /**
   * Retention hooks (W7, added 2026-07-11) — the episode script's
   * `retention_loop.description` string, verbatim. Same grounding-context
   * role as `hookText` above, but for the retention-ending-shot rule. Only
   * rendered when `retentionHooksEnabled` is true AND this shot is the
   * retention-ending shot (`shotNumber === totalShotCount`); omitted
   * otherwise or when absent.
   */
  retentionLoopDescription?: string;
  /** Publicly-fetchable URL of the shot's current approved main image (the start frame this clip continues from). */
  imageUrl: string;
  /** The prompt that generated `imageUrl` — always folded in as a textual proxy, see this module's vision doc comment. */
  imagePrompt?: string;
  /**
   * Multi-character reference images (multi-character disambiguation fix,
   * `polished-toasting-gadget.md`) — each entry is one required/speaking
   * character's own approved reference portrait, labeled with its name and
   * `characterKey` and attached to the vision call ALONGSIDE `imageUrl`
   * (never replacing it), so the model can visually anchor "this face in
   * the image = this name" when multiple characters share the shot — the same
   * identity-lock principle already used for start-frame IMAGE generation,
   * applied here to video-PROMPT generation for the first time. The CALLER
   * (router) resolves which characters/portraits to include (see
   * `resolveShotVideoPromptCharacterReferenceImages` in
   * `verticalDramaEpisodes.ts`) — this function only attaches whatever it
   * is given. Grouped with `imageUrl`/`imagePrompt` (image data), not
   * inside `shotContext` (narrative text facts). Omitted/empty (every
   * existing caller) preserves today's byte-identical vision-content array
   * AND byte-identical prompt text (see `buildShotVideoPromptUserPrompt`'s
   * conditional fact line) — the single most important regression bar for
   * this change.
   */
  characterReferenceImages?: ShotVideoPromptCharacterReferenceImage[];
  /**
   * Human-confirmed, asset-bound physical cast positions. When present this
   * is the independent authority: generated frame analysis and prompt prose
   * must agree with it rather than validating against each other.
   */
  verifiedCastPositions?: VerticalDramaVerifiedCastPosition[];
  /** Optional shot-local identity cues. A supplied cue replaces screen-position
   * anchoring for that character only. */
  characterDescriptionOverrides?: VerticalDramaCharacterDescriptionOverrides;
  /**
   * Location reference image (Phase E of `planning/polished-toasting-
   * gadget.md` — location visual bible) — this shot's single environment/
   * location reference image (a shot has at most ONE location, unlike
   * `characterReferenceImages`, which can be several), labeled with its name
   * and attached to the vision call ALONGSIDE `imageUrl`/
   * `characterReferenceImages` (never replacing them), so the model keeps
   * the shot's setting/architecture/lighting/props consistent with the
   * established location — the same environment-lock principle already used
   * for start-frame IMAGE generation, applied here to video-PROMPT
   * generation. The CALLER (router) resolves which location/image to include
   * (see `resolveShotVideoPromptLocationReferenceImage` in
   * `verticalDramaEpisodes.ts`) — this function only attaches whatever it is
   * given. Grouped with `imageUrl`/`imagePrompt`/`characterReferenceImages`
   * (image data), not inside `shotContext` (narrative text facts).
   * Omitted/absent (every existing caller) preserves today's byte-identical
   * vision-content array AND byte-identical prompt text (see
   * `buildShotVideoPromptUserPrompt`'s conditional fact line) — the single
   * most important regression bar for this change.
   */
  locationReferenceImage?: { url: string; name?: string };
  barrierReferenceImage?: { url: string; name?: string };
  shotContext: {
    /**
     * Synopsis grounding (`planning/vd-video-prompt-skill-first/plan.md`
     * Phase 1a) — the canonical Overview-page shot beat (the deep-drafted
     * `summary`, the same richer, user-edited synopsis already threaded into
     * the sibling start-frame prompt flow), when the caller has resolved
     * one. This is the single source of truth for WHAT VISIBLY HAPPENS in
     * the shot (e.g. "reads a message silently" vs "speaks the message
     * aloud") — far richer than the terse storyboard `description` below,
     * which is the historical (and still present) fallback fact. The
     * router resolves this from `deepDraftShotForDialogue?.summary` (only
     * populated when the `verticalDramaSeriesDeepStoryDrafts` tenant flag is
     * on AND this shot has a deep-drafted entry). Optional/omitted (every
     * caller before this fix, and any caller whose series hasn't deep-
     * drafted this shot) preserves today's byte-identical prompt — no new
     * fact line at all in that case. See `buildShotVideoPromptUserPrompt`'s
     * exact fact-line wording.
     */
    canonicalShotSummary?: string;
    /** Pre-rendered scene continuity facts; this runner never resolves scenes. */
    sceneContinuityLockBlock?: string;
    /**
     * Persistence/pin root-cause fix (`planning/vd-video-prompt-skill-first/
     * plan.md` Phase 2) — true when the caller has already determined this
     * shot is an intentionally SILENT beat (deep-drafted
     * `silence_intent` truthy). When true, both prompt builders inject a
     * MANDATORY "return dialogue as [] and do not invent speech" fact ahead
     * of the dialogue instructions, and `generateVerticalDramaShotVideoPrompt`
     * itself never lets an LLM-invented line reach the deterministic
     * dialogue-stitch/compliance-retry logic (see that function's
     * `requiredDialogue` resolution). Optional/omitted (every caller before
     * this fix) preserves today's byte-identical prompt/behavior.
     */
    beatIsSilent?: boolean;
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
      /**
       * Speaker-attributed lip-sync discipline fix — the speaker's DISPLAY
       * name, pre-resolved by the caller (router) from the series' character
       * roster (`characterKey -> name`, already loaded there for
       * `characterIdentityMap` above — no new DB query needed). Falls back
       * to `characterKey` when absent. See
       * `@shared/verticalDramaSeries/nativeDialogue.ts`.
       */
      speakerName?: string;
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
    /** Two-view physical barrier contract; never a phone/video-call role. */
    barrierMultiView?: VerticalDramaBarrierMultiView;
    /** Explicit caller refs; caller status is never inferred from synopsis. */
    screenCallerCharacterRefs?: string[];
    /** Optional canonical speaker order for caller-screen derivation. */
    speakingOrder?: string[];
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
    /** Series/shot genre used only to select the physics policy. */
    genre?: string;
    /** Explicit generic people allowed by the shot; never identity-locked. */
    supportingPresence?: VerticalDramaSupportingPresence[];
  };
  selectedVideoModelId: string;
  /**
   * The resolved video model row, so the native-audio/dialogue decision
   * below matches `verticalDramaVideoPromptFormatter.ts`'s capability logic
   * exactly. `name` (model-family-aware prompt quality upgrade,
   * `planning/vd-video-prompt-model-family-quality/plan.md`) feeds the
   * `TARGET VIDEO MODEL` fact block's `model: "<display name> (<modelId>)"`
   * line and `resolveVideoPromptTargetFamily`'s family classification —
   * kept OPTIONAL (unlike `ModelDefinition.name`, which is required) so
   * every existing caller/test that only supplies
   * `type`/`aspectRatios`/`configJson`/`provider`/`aliases`/`id` keeps
   * compiling unchanged; falls back to just the modelId in the fact block
   * when absent.
   */
  selectedVideoModel: Pick<ModelDefinition, "type" | "aspectRatios" | "configJson" | "provider" | "aliases"> & {
    id?: string;
    name?: string;
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
   *
   * Cliffhanger-bleed fix (confirmed production bug, 2026-07-11): the
   * ONLY caller of this per-shot generator (the `generateShotVideoPrompt`
   * mutation in `server/routers/verticalDramaEpisodes.ts`) deliberately
   * omits `cliffhangerLine` when building this string via
   * `formatStoryScriptEpisodePlanContext`, because this function runs once
   * PER SHOT — a single shot never needs the NEXT episode's teased theme,
   * and cheaper models did not reliably honor the "reference only, do not
   * copy" instruction below, bleeding next-episode content into unrelated
   * shots. (The sub-shot/speaker-switch path,
   * `generateAndPersistSplitShotVideoPrompt` ->
   * `generateVerticalDramaShotVideoPromptSpeakerSwitch`, is a SEPARATE function
   * that never received `episodePlanContext` in the first place — nothing
   * to fix there.) See the caller's own doc comment for the full incident.
   * Contrast with `GenerateVideoMotionPromptPackParams.episodePlanContext`, which
   * legitimately keeps the cliffhanger (whole-episode, single global block).
   */
  episodePlanContext?: string;
  /**
   * planning/`polished-toasting-gadget.md` Fix B ("ให้ AI ปรับ" AI-adjust fix
   * for video prompts) — the user's free-text repair/adjustment instruction
   * for this shot's video motion prompt, when the caller is regenerating in
   * response to that button rather than the plain "สร้างพรอมต์วิดีโอ (AI)"
   * button. An ADDITIONAL directive layered on top of every Hard Rule in
   * `vertical-drama-shot-video-prompt/skill.md` — never a replacement for
   * them (see that skill's "User repair instruction (optional)" section).
   * This skill already regenerates fresh from the shot's own facts on every
   * call, so (unlike Fix A's start-frame sibling) there is no "preserve the
   * previous prompt" nuance to add. Optional/omitted (the "สร้างพรอมต์วิดีโอ
   * (AI)" button never sends one) preserves today's byte-identical prompt —
   * no new instruction text is rendered at all when absent.
   */
  repairInstruction?: string;
  /**
   * VideoPromptAiEditDialog — optional user-supplied reference image URLs
   * (publicly accessible) that the user attached in the AI-adjust dialog for
   * additional visual context (e.g. a location shot, a pose reference).
   * Appended to `buildShotVideoPromptVisionImages` after the system-resolved
   * start frame and character/location reference images, so the model always
   * sees the start frame first. Omitted / empty when the caller is the plain
   * "สร้างพรอมต์วิดีโอ (AI)" button — byte-identical prompt in that case.
   */
  /**
   * Whether to attach the shot's start frame image (and character/location reference images)
   * to the LLM vision call (`hasVision`). Defaults to true when omitted.
   * When false (e.g. user unchecked "แนบภาพของช็อตนี้" in VideoPromptAiEditDialog),
   * vision images are not sent, and the prompt relies on text instructions/descriptions only.
   */
  attachShotImage?: boolean;
  additionalImageUrls?: string[];
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
  /**
   * Model-family-aware, vision-grounded video prompt quality upgrade
   * (`planning/vd-video-prompt-model-family-quality/plan.md`) — the video-
   * prompt-shaping family (grok/veo/seedance/other) this call's fact block
   * resolved for `params.selectedVideoModel`/`selectedVideoModelId`. Always
   * present (never throws — see `resolveShotVideoPromptModelFamily`); the
   * router stamps this onto the persisted clip's `promptModelTarget.family`
   * so the storyboard UI can show a family badge.
   */
  family: VideoPromptModelFamily;
  /**
   * Model-family-aware, vision-grounded video prompt quality upgrade — the
   * normalized `frame_analysis` reading (see `normalizeFrameAnalysis`), when
   * the skill returned one usable. `undefined` when no portrait/start-frame
   * vision bundle was attached, or the model returned nothing
   * usable — never a hard requirement.
   */
  frameAnalysis?: VdFrameAnalysis;
  motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
  effectiveRisk?: VdIdentityRisk;
  motionContractStatus?: VdMotionContractStatus;
  /**
   * Model-family-aware, vision-grounded video prompt quality upgrade — non-
   * blocking, human-readable warning(s) surfaced when the position-anchor
   * compliance check (item C) still found issues after its one corrective
   * retry. `undefined` when there is nothing to report (every call before
   * this task, and the overwhelming majority of calls after it). The router
   * records these onto the pack's existing `warnings` mechanism the same
   * way other pack warnings are recorded — this field never blocks or
   * degrades the returned `prompt` itself (fail-open by design).
   */
  warnings?: string[];
}

export function buildShotVideoPromptUserPrompt(
  params: GenerateVerticalDramaShotVideoPromptParams,
  nativeAudioDialogue: boolean,
  nativeAudioDirectionEnabled: boolean,
  targetVideoModelFactBlock: string,
): string {
  const { shotContext } = params;
  const sceneContinuityLockBlock = filterSceneContinuityLockBlockForShot(
    shotContext.sceneContinuityLockBlock,
    params.shotNumber,
  );
  const promptLanguage = params.promptLanguage ?? "en";
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];
  const dialogueLines = shotContext.dialogueLines ?? [];
  const characterDescriptionOverrides = normalizeVerticalDramaCharacterDescriptionOverrides(
    params.characterDescriptionOverrides,
  );
  const spokenCallerPolicy = deriveVerticalDramaSpokenCallerVirtualScreens({
    physicalSceneCharacterRefs: [],
    screenCallerCharacterRefs: shotContext.screenCallerCharacterRefs ?? [],
    dialogueSpeakerRefs:
      shotContext.speakingOrder ??
      dialogueLines.flatMap(line =>
        [line.characterKey, line.speakerName].filter(
          (value): value is string => Boolean(value?.trim())
        )
      ),
  });
  const spokenCallerVirtualScreenBlock =
    renderVerticalDramaSpokenCallerVirtualScreenPromptBlock(spokenCallerPolicy);
  const dialogueBlock = dialogueLines.length
    ? dialogueLines
        .map((l, i) => {
          // Speaker attribution uses the resolved DISPLAY NAME (`speakerName`,
          // pre-resolved by the router from characterKey->name) so the skill
          // attributes each line to the same name it sees on the attached
          // character reference images + CHARACTER IDENTITY MAP — never the raw
          // `characterKey`. Falls back to `characterKey` when no name resolved
          // (byte-identical to before for any line without a speakerName).
          const speaker = l.speakerName ?? l.characterKey ?? "character";
          const parts = [
            `${i + 1}. ${speaker}${l.characterKey ? ` [characterKey=${l.characterKey}]` : ""}: "${l.lineTh}"`,
          ];
          if (l.emotion) parts.push(`emotion: ${l.emotion}`);
          if (l.delivery?.tone) parts.push(`tone: ${l.delivery.tone}`);
          if (l.delivery?.pace) parts.push(`pace: ${l.delivery.pace}`);
          if (l.delivery?.pauses) parts.push(`pauses: ${l.delivery.pauses}`);
          if (l.delivery?.texture) parts.push(`voice texture: ${l.delivery.texture}`);
          if (l.subtext) parts.push(`subtext: ${l.subtext}`);
          const customDescription = getCharacterDescriptionOverride(
            l.characterKey,
            characterDescriptionOverrides,
          );
          if (customDescription) {
            parts.push(`custom visual identity (use instead of screen position): ${customDescription}`);
          }
          return parts.join(" | ");
        })
        .join("\n")
    : "(no source dialogue line was found for this shot — see the NO-SOURCE-DIALOGUE instruction below for what to do)";

  // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W7) —
  // derived purely from position facts already/optionally available on
  // `params` (see `totalShotCount`/`retentionHooksEnabled`'s doc comments
  // above); gated behind the flag so every existing caller (which never sets
  // either field) gets a byte-identical prompt. Only asserted when true —
  // omitted (not stated as `false`) when not applicable, matching this
  // builder's existing conditional-fact convention.
  const retentionHooksEnabled = params.retentionHooksEnabled === true;
  const isOpeningShot = retentionHooksEnabled && params.shotNumber === 1;
  const isRetentionEndingShot =
    retentionHooksEnabled &&
    typeof params.totalShotCount === "number" &&
    params.shotNumber === params.totalShotCount;

  // Multi-character reference images (multi-character disambiguation fix,
  // `polished-toasting-gadget.md`) — a purely FACTUAL announcement line
  // (never instructional/creative — that judgment lives entirely in
  // skill.md's Rule 1/Rule 11, skill-first architecture) naming which
  // character each attached reference image belongs to. Omitted entirely
  // when `characterReferenceImages` is empty/absent (every existing
  // caller), preserving today's byte-identical prompt.
  const characterReferenceImageNames = (params.characterReferenceImages ?? []).map(
    c => c.name ?? c.characterKey,
  );
  const characterIdentityManifest = (params.characterReferenceImages ?? [])
    .map(c => `Portrait label: name=${c.name ?? c.characterKey}, characterKey=${c.characterKey}`)
    .join("; ");
  const characterNameByKey = new Map(
    (params.characterReferenceImages ?? []).map(c => [
      c.characterKey,
      c.name ?? c.characterKey,
    ]),
  );
  for (const person of params.verifiedCastPositions ?? []) {
    characterNameByKey.set(person.characterKey, person.name);
  }
  const customCharacterDescriptionBlock = buildCharacterDescriptionOverrideBlock(
    characterDescriptionOverrides,
    characterNameByKey,
  );
  const verifiedCastPositionFacts = (params.verifiedCastPositions ?? []).filter(
    person => !getCharacterDescriptionOverride(person.characterKey, characterDescriptionOverrides),
  );
  const verifiedCastPositionLock = verifiedCastPositionFacts.length
    ? `VERIFIED CAST POSITION LOCK (AUTHORITATIVE; user confirmed against the exact attached start frame): ${verifiedCastPositionFacts
        .map(
          person =>
            `${person.name} [characterKey=${person.characterKey}]=${person.position}`,
        )
        .join(", ")}. Use these viewer/camera-relative positions exactly in both frame_analysis and prompt for characters without a custom identity description. Do not reassign identities or positions from an AI guess.`
    : null;
  const speakerFaceBindingInstruction = dialogueLines.length
    ? "SPEAKER-TO-FACE BINDING (MANDATORY): first inspect the attached start frame, then match each visible face to the labeled portrait manifest by facial identity. For every dialogue line, animate only the exact named characterKey. For a character with a CUSTOM CHARACTER IDENTIFICATION OVERRIDE, use that exact description as the identity anchor and do not add a viewer-left/right position cue. For every other character, state the observed screen position from frame_analysis using ONLY viewer-left, viewer-center-left, viewer-center, viewer-center-right, or viewer-right next to the line. These coordinates are always from the viewer/camera side, never the character's anatomical left/right or left/right hand. Never use 'left hand', 'right hand', 'left-hand side', or 'right-hand side' as a screen-position label. Never infer identity from gender, clothing, or the requested prompt layout, and keep every non-speaker's mouth closed. If a face cannot be matched confidently, flag it instead of guessing."
    : null;
  // Location reference image (Phase E of `planning/polished-toasting-
  // gadget.md` — location visual bible) — same purely FACTUAL announcement
  // convention as `characterReferenceImageNames` above (the actual
  // environmental-consistency INSTRUCTION lives in skill.md, skill-first
  // architecture). Omitted entirely when `locationReferenceImage` is absent
  // (every existing caller), preserving today's byte-identical prompt.
  const locationReferenceImageName = params.locationReferenceImage?.name ?? "location";

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
    // Synopsis grounding (`planning/vd-video-prompt-skill-first/plan.md`
    // Phase 1a) — placed BEFORE the terse `description` fact below so the
    // richer, canonical beat is read first; see `canonicalShotSummary`'s own
    // doc comment for the full rationale. Omitted entirely (byte-identical)
    // when absent.
    shotContext.canonicalShotSummary?.trim()
      ? `AUTHORITATIVE SHOT BEAT (story overview — the single source of truth for what visibly happens in this shot; ground the video motion in THIS; when it conflicts with the shorter shot description below, follow this): ${shotContext.canonicalShotSummary.trim()}`
      : null,
    shotContext.description ? `Shot description: ${shotContext.description}` : null,
    spokenCallerVirtualScreenBlock,
    shotContext.camera ? `Camera setup: ${shotContext.camera}` : null,
    shotContext.emotion ? `Shot emotion: ${shotContext.emotion}` : null,
    // Persistence/pin root-cause fix (`planning/vd-video-prompt-skill-first/
    // plan.md` Phase 2) — placed ahead of the dialogue block below so the
    // model reads the silence mandate before deciding how to handle
    // dialogue. Omitted entirely (byte-identical) when absent.
    shotContext.beatIsSilent
      ? `SILENT BEAT (MANDATORY): this shot is intentionally silent — no character speaks aloud. Express the beat purely through action, expression, and camera. Return "dialogue" as [] and do NOT write any spoken line, lip-sync direction, or verbatim dialogue block.`
      : null,
    // Retention hooks (W7) — structured facts only, see the skill's "Hook +
    // retention-ending shot motion energy" rule for the actual creative
    // instruction (skill-first; no rule text lives here).
    isOpeningShot
      ? `is_opening_shot: true — this clip is the EPISODE'S FIRST SHOT (the hook shot).`
      : null,
    isRetentionEndingShot
      ? `is_retention_ending_shot: true — this clip is the EPISODE'S FINAL SHOT (the retention-loop ending).`
      : null,
    isOpeningShot && params.hookText
      ? `Episode hook (verbatim, from the script — ground this shot's opening energy in it, do not invent a different hook): ${params.hookText}`
      : null,
    isRetentionEndingShot && params.retentionLoopDescription
      ? `Episode retention loop (verbatim, from the script — this shot must land/hold this exact unresolved beat): ${params.retentionLoopDescription}`
      : null,
    params.episodePlanContext
      ? `บริบทฉากของตอน (อ้างอิงเพื่อความสอดคล้อง ห้ามคัดลอกลง output):\n${params.episodePlanContext}`
      : null,
    params.imagePrompt && params.attachShotImage !== false
    ? `The ATTACHED IMAGE is the ACTUAL start frame and is the SINGLE SOURCE OF TRUTH for what is really on screen — who stands WHERE (viewer-left / viewer-center-left / viewer-center / viewer-center-right / viewer-right), framing, blocking, poses. The prompt text below is ONLY the REQUEST that was sent to the image model to produce that frame; image models frequently do NOT follow it exactly, and character left/right placement is the field that drifts most often. Use the text only as supporting context for intent/identity/wardrobe, and whenever it CONTRADICTS the attached image, TRUST THE ATTACHED IMAGE and describe what you actually SEE. Never restate a character's on-screen position from this text without first confirming it against the image: ${params.imagePrompt}`
      : params.imagePrompt && params.attachShotImage === false
        ? `Start frame image description (note: the start frame image itself is not attached for this run; base your adjustments on this description and user instructions): ${params.imagePrompt}`
        : null,
    shotContext.characterIdentityMap ?? null,
    customCharacterDescriptionBlock,
    verifiedCastPositionLock,
    characterReferenceImageNames.length > 0 && params.attachShotImage !== false
      ? `Character reference images attached below the start frame, each preceded by a text label naming the character: ${characterReferenceImageNames.join(", ")}.`
      : null,
    characterIdentityManifest && params.attachShotImage !== false
      ? `CHARACTER FACE IDENTITY MANIFEST (label-to-face mapping; the attached start frame remains authoritative for actual position): ${characterIdentityManifest}`
      : null,
    speakerFaceBindingInstruction,
    params.locationReferenceImage && params.attachShotImage !== false
      ? `Environment/location reference image attached below the start frame (and any character reference images), preceded by a text label naming the location: ${locationReferenceImageName}.`
      : null,
    shotContext.barrierMultiView
      ? renderVerticalDramaBarrierMultiViewFactBlock(shotContext.barrierMultiView)
      : null,
    params.barrierReferenceImage && params.attachShotImage !== false
      ? "DUAL IMAGE INPUT (MANDATORY): Image 1 is the start frame; Image 2 is the reference frame. They have independent viewer-left/right coordinate spaces. In frame_analysis, assign view_role=start_frame only to characters configured for Image 1 and view_role=barrier_reference only to characters configured for Image 2. In prompt, prefix every speaking beat with the exact Image 1 or Image 2 label before the character name and that image's viewer-relative position. Never describe an Image 2 character as absent/not_visible/tiny in Image 1; inspect Image 2 directly instead."
      : null,
    sceneContinuityLockBlock?.trim()
      ? `บริบทฉากของตอน (อ้างอิงเพื่อความสอดคล้อง ห้ามคัดลอกลง output):\n${sceneContinuityLockBlock.trim()}`
      : null,
    // reference images above; the actual creative use is in the
    // `repairInstruction` field or left to the model's own judgment).
    (params.additionalImageUrls?.length ?? 0) > 0
      ? `Additional reference image(s) attached at the end (user-supplied, ${params.additionalImageUrls!.length} image${params.additionalImageUrls!.length === 1 ? "" : "s"}): use them as supplementary visual context alongside the start frame.`
      : null,
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
    nativeAudioDialogue
      ? `SPOKEN-TEXT BOUNDARY (MANDATORY): every quoted spoken utterance in "prompt" must contain ONLY the exact source line text from the "Dialogue for this shot" facts. Keep the speaker's display name and characterKey outside the quotation as attribution immediately before it; NEVER copy either label into the quoted spoken text (for example, write ภาคิน says: "หยุด คุณไปไหนไม่ได้แล้ว", never "ภาคินหยุด คุณไปไหนไม่ได้แล้ว").`
      : null,
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
    // Model-family-aware, vision-grounded video prompt quality upgrade
    // (`planning/vd-video-prompt-model-family-quality/plan.md`) — grouped
    // with the other target-model-capability facts immediately above
    // (native-audio/NATIVE AUDIO DIRECTION), close to the end of the prompt
    // so the model reads it right before actually writing "prompt".
    targetVideoModelFactBlock,
    // planning/`polished-toasting-gadget.md` Fix B — an ADDITIONAL directive
    // layered on top of every Hard Rule above, per skill.md's "User repair
    // instruction (optional)" section; omitted entirely (byte-identical
    // prompt) when the caller doesn't supply one.
    params.repairInstruction
      ? `User repair instruction (MANDATORY — apply as an ADDITIONAL directive on top of the Hard Rules above, not a replacement for them): ${params.repairInstruction}`
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
export function promptEmbedsDialogueVerbatim(
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
 * Removes a speaker label that a weak model accidentally copied into the
 * spoken-text quote, e.g. `"ภาคินหยุด คุณไปไหนไม่ได้แล้ว"` when the canonical
 * line is `"หยุด คุณไปไหนไม่ได้แล้ว"`.
 *
 * Speaker names remain available outside the quote for face/lip-sync binding.
 * This intentionally only changes a quote whose contents begin with a known
 * speaker label immediately followed by the exact canonical line; it never
 * rewrites free-form prose or guesses at paraphrased dialogue.
 */
export function sanitizeEmbeddedDialogueSpeakerLabels(
  prompt: string,
  dialogueLines: Array<{ lineTh: string; characterKey?: string; speakerName?: string }>,
): string {
  let sanitized = prompt;
  const candidates = dialogueLines
    .flatMap(line => [line.speakerName, line.characterKey]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map(speaker => ({ speaker: speaker.trim(), lineTh: line.lineTh.trim() })))
    .filter(candidate => candidate.lineTh.length > 0)
    .sort((a, b) => b.speaker.length - a.speaker.length);

  for (const { speaker, lineTh } of candidates) {
    const speakerPattern = speaker
      .split(/\s+/)
      .filter(Boolean)
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    const linePattern = lineTh
      .split(/\s+/)
      .filter(Boolean)
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    if (!speakerPattern || !linePattern) continue;

    // Match only quoted speech. The optional punctuation/whitespace supports
    // the common weak-model variants: `NameLine`, `Name: Line`, and
    // `Name — Line`, while preserving the quote style used by the model.
    const contaminatedQuote = new RegExp(
      `(["“])\\s*${speakerPattern}\\s*(?:(?:[:：]|[-—])\\s*)?${linePattern}\\s*(["”])`,
      "gu",
    );
    sanitized = sanitized.replace(contaminatedQuote, (_match, opening, closing) =>
      `${opening}${lineTh}${closing}`,
    );
  }

  return sanitized;
}

/** Deterministic full-source block after the LLM compliance retry. */
export function appendMissingDialogueVerbatim(
  prompt: string,
  dialogueLines: Array<{ lineTh: string; characterKey?: string; speakerName?: string }>,
  options?: { dialogueLanguageName?: string; establishedCharacterCount?: number },
): string {
  const block = buildNativeDialogueVerbatimBlock(dialogueLines, options);
  if (!block) return prompt.trim();
  const markerIndex = prompt.indexOf(NATIVE_DIALOGUE_BLOCK_MARKER);
  let base = markerIndex >= 0 ? prompt.slice(0, markerIndex) : prompt;
  // The canonical block must be the sole carrier of spoken text. A compliant
  // LLM commonly embeds the exact quote in its prose; retaining that quote
  // and then appending the block makes native-audio providers speak it twice.
  // Remove every canonical line from the descriptive portion first while
  // leaving an explicit non-spoken pointer in its place.
  for (const { lineTh } of dialogueLines) {
    const tokens = lineTh.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const pattern = tokens
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    base = base.replace(
      new RegExp(`["“”'‘’\`]?[\\s]*${pattern}[\\s]*["“”'‘’\`]?`, "gu"),
      " [spoken text: use canonical dialogue below] ",
    );
  }
  base = base.replace(/\s+/g, " ").trim();
  return `${base}${base ? "\n" : ""}${block}`;
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

  const resolvedModel = await resolveShotVideoPromptModel(params.seriesId);
  const model = resolvedModel.model;
  const hasVision = params.attachShotImage === false ? false : resolvedModel.hasVision;
  const hasEstablishedCharacters = (params.characterReferenceImages?.length ?? 0) >= 1;
  const characterDescriptionOverrides = normalizeVerticalDramaCharacterDescriptionOverrides(
    params.characterDescriptionOverrides,
  );
  // Vision fallback surface (`planning/vd-video-prompt-skill-first/plan.md`
  // Phase 1b) — a visible server-log signal (instead of a silent guess) that
  // this generation ran without ever seeing the actual start-frame image, so
  // the model relied entirely on the textual `imagePrompt` proxy. No
  // behavior change beyond this one log line — see this module's own
  // vision-support doc comment for why the fallback itself is intentional.
  if (!hasVision) {
    console.warn(
      "[vd_video_prompt] generated WITHOUT vision (no vision-capable model enabled) — model relied on imagePrompt text proxy only",
      { seriesId: params.seriesId, episodeId: params.episodeId, shotNumber: params.shotNumber },
    );
  }
  assertVisionForCharacterGroundedPrompt(
    hasVision,
    hasEstablishedCharacters || Boolean(params.barrierReferenceImage),
  );
  const systemPrompt = loadShotVideoPromptSystemPrompt();

  const capabilities = resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
    type: params.selectedVideoModel.type,
    aspectRatios: params.selectedVideoModel.aspectRatios,
    configJson: params.selectedVideoModel.configJson,
  });
  const nativeAudioDialogue = capabilities.nativeAudioDialogue === true;
  // Lip-sync discipline fix — speech-language name for the deterministic
  // dialogue block appended below (see `appendMissingDialogueVerbatim`'s
  // `options` param / `@shared/verticalDramaSeries/nativeDialogue.ts`).
  // Deliberately NOT threading an `establishedCharacterCount` signal here
  // (e.g. `characterReferenceImages?.length`): this block's text must stay
  // reproducible LATER, purely from `dialogueLines` + language, by
  // `generateVideoClip`'s render-time formatter (`verticalDramaVideoPromptFormatter.ts`),
  // which re-verifies/re-embeds the SAME block from the PERSISTED clip at a
  // separate request with no established-character-count signal available —
  // an out-of-band count here that formatter can't reproduce would make its
  // idempotency check ("is the canonical block already present?") fail and
  // append a second, differently-worded dialogue clause on top. The
  // distinct-SPEAKER count derived from `dialogueLines` itself (see
  // `buildNativeDialogueVerbatimBlock`) stays the sole, always-reproducible
  // signal for the SILENT LISTENER rules gate.
  const dialogueLanguageName =
    VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[params.dialogueLanguage ?? "th"];
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

  // Model-family-aware, vision-grounded video prompt quality upgrade
  // (`planning/vd-video-prompt-model-family-quality/plan.md`) — mirrors the
  // router's OWN `characterReferenceImages.length >= 1` gate for resolving
  // reference portraits in the first place (`resolveShotVideoPromptCharacterReferenceImages`
  // call site in `verticalDramaEpisodes.ts`), so this is the exact same
  // "established characters" signal, computed once here.
  const motionContractsEnabled = params.motionContractsEnabled === true;
  const frameAnalysisRequested =
    (params.characterReferenceImages?.length ?? 0) >= 1;
  const frameObservabilityRequested = motionContractsEnabled && frameAnalysisRequested;
  const family = resolveShotVideoPromptModelFamily(
    params.selectedVideoModelId,
    params.selectedVideoModel,
  );
  const targetVideoModelFactBlock = buildTargetVideoModelFactBlock({
    family,
    modelId: params.selectedVideoModelId,
    modelName: params.selectedVideoModel.name,
    maxReferenceImages: capabilities.maxReferenceImages,
    frameAnalysisRequested,
    frameObservabilityRequested,
    motionContractsEnabled,
    genre: params.shotContext.genre,
    establishedCharacterCount: params.characterReferenceImages?.length,
    supportingPresence: params.shotContext.supportingPresence,
  });

  const userPromptText = buildShotVideoPromptUserPrompt(
    params,
    nativeAudioDialogue,
    nativeAudioDirectionEnabled,
    targetVideoModelFactBlock,
  );

  let outcome = await executeVisionAwareJsonCallWithRetry<ShotVideoPromptOutput>({
    model,
    systemPrompt,
    userPromptText,
    hasVision,
    images: buildShotVideoPromptVisionImages(
      params.imageUrl,
      params.characterReferenceImages,
      params.locationReferenceImage,
      params.barrierReferenceImage,
      params.additionalImageUrls,
    ),
    userId: params.userId,
    tenantId: params.tenantId,
    publicUrl: params.publicUrl,
    schema: shotVideoPromptOutputSchema,
    // Bumped 2000 -> 2600 (frame_analysis headroom); retry ceiling unchanged.
    firstAttemptMaxTokens: 2600,
    retryMaxTokens: 4000,
    modelFallbackPolicy: "recommended",
  });

  // The retry helper may recover with text-only mode after the selected
  // vision model fails. Character/image-grounded prompts must not persist that
  // downgraded result as if the attached frame had been inspected.
  assertVisionForCharacterGroundedPrompt(
    outcome.usedVision,
    hasEstablishedCharacters || Boolean(params.barrierReferenceImage),
  );

  // Keep the source dialogue authoritative when a weak model copies the
  // speaker label into the quoted speech. This is deliberately limited to
  // source-backed native-audio lines; it never touches inferred dialogue or
  // the separate speaker/character identity mapping.
  const sourceDialogueForSanitization = params.shotContext.beatIsSilent
    ? []
    : (params.shotContext.dialogueLines ?? []);
  if (nativeAudioDialogue && sourceDialogueForSanitization.length > 0) {
    const sanitizedPrompt = sanitizeEmbeddedDialogueSpeakerLabels(
      outcome.data.prompt,
      sourceDialogueForSanitization,
    );
    if (sanitizedPrompt !== outcome.data.prompt) {
      outcome = {
        ...outcome,
        data: { ...outcome.data, prompt: sanitizedPrompt },
      };
    }
  }

  // Verbatim-embedding compliance check (2026-07-07 fix): the model was
  // correctly instructed that the selected video model has native lip-synced
  // audio and to quote the line(s) verbatim, but weaker models (e.g. "nano"
  // tiers) sometimes ignore this and write descriptive "mouth moves in sync"
  // prose instead — see this file's bug report for a real repro. One
  // corrective retry with an explicit, unambiguous instruction before giving
  // up and returning the model's (still schema-valid) best effort.
  //
  // Silence enforcement at generation time (`planning/vd-video-prompt-
  // skill-first/plan.md` Phase 2b) — when the caller has already resolved
  // this shot as an intentionally SILENT beat, never let an LLM-invented
  // `outcome.data.dialogue` line (a hard-rule violation) reach the
  // compliance-retry/deterministic-stitch logic below — an invented line
  // must never be treated as "required" just because the source was empty.
  // The persisted `matchingClip.dialogue` is separately protected by the
  // router's own pin fix (never promotes an invented line to authoritative
  // when the resolved source was empty) — this is the generation-time half
  // of that same guarantee.
  const requiredDialogue = params.shotContext.beatIsSilent
    ? []
    : (params.shotContext.dialogueLines?.length ?? 0) > 0
      ? params.shotContext.dialogueLines!
      : outcome.data.dialogue ?? [];
  const characterNameByKey = buildCharacterNameByKey(
    params.characterReferenceImages,
    params.verifiedCastPositions,
    requiredDialogue,
  );
  const dialogueVerbatimMissing =
    nativeAudioDialogue && !promptEmbedsDialogueVerbatim(outcome.data.prompt, requiredDialogue);

  // Position-anchor compliance check (`planning/vd-video-prompt-model-
  // family-quality/plan.md`, item C) — extends the dialogue-verbatim retry
  // immediately below with a SECOND, independently-gated failure signal
  // that SHARES the same one-retry budget rather than spending an extra LLM
  // call: evaluated when this shot has an established character portrait
  // (`hasEstablishedCharacters` above), vision was actually attached, and
  // required dialogue applies. Missing generic anchors remain fail-open for
  // weak models, but an explicit contradiction between the
  // prompt and image-derived `frame_analysis` is hard-blocked after the one
  // corrective retry so a known-wrong identity cue cannot be persisted.
  const initialPositionAnchorIssues = Array.from(
    new Set([
      ...(hasEstablishedCharacters && hasVision && requiredDialogue.length > 0
        ? findPositionAnchorIssues(
            outcome.data,
            requiredDialogue,
            hasEstablishedCharacters,
            params.shotContext.barrierMultiView,
            params.verifiedCastPositions,
            characterDescriptionOverrides,
          )
        : []),
      ...findCustomIdentityPositionIssues(
        outcome.data.prompt,
        requiredDialogue,
        characterDescriptionOverrides,
        characterNameByKey,
      ),
    ]),
  );

  const warnings: string[] = [];

  if (dialogueVerbatimMissing || initialPositionAnchorIssues.length > 0) {
    let repairAttempts = 0;
    const requiresStructuralRepairLoop = initialPositionAnchorIssues.some(isStructuralPositionIssue);
    for (; repairAttempts < MAX_VIDEO_PROMPT_REPAIR_ATTEMPTS; repairAttempts += 1) {
      try {
      const dialogueForRetry = requiredDialogue;
      const correctionParts: string[] = [];
      if (dialogueVerbatimMissing) {
        const quotedLines = dialogueForRetry.map((l) => `"${l.lineTh}"`).join(", ");
        correctionParts.push(
          `COMPLIANCE CORRECTION (MANDATORY): your previous "prompt" did NOT include the dialogue line(s) verbatim in quotes — it only described mouth movement. This video model DOES support native lip-synced audio, so you MUST quote the exact spoken line(s) ${quotedLines} inside "prompt", each wrapped in quotation marks exactly as given, alongside the acting/delivery direction. Rewrite "prompt" now so it contains the verbatim quoted line(s).`,
        );
      }
      if (initialPositionAnchorIssues.length > 0) {
        const customIdentityIssues = initialPositionAnchorIssues.filter(issue =>
          issue.includes(CUSTOM_IDENTITY_POSITION_MARKER),
        );
        if (customIdentityIssues.length > 0) {
          correctionParts.push(
            `CUSTOM IDENTITY CORRECTION (MANDATORY): ${customIdentityIssues.join("; ")}. Preserve each user's custom character description as the identity anchor, include the exact supplied detail in the final "prompt", and remove every viewer-left/viewer-right/viewer-center position cue for those characters. Use screen positions only for characters without a custom identity description.`,
          );
        }
        const speakerCueIssues = initialPositionAnchorIssues.filter(issue =>
          issue.includes(SPEAKER_CUE_MARKER),
        );
        if (speakerCueIssues.length > 0) {
          correctionParts.push(
            `SPEAKER CUE CORRECTION (MANDATORY): ${speakerCueIssues.join("; ")}. Immediately precede every quoted dialogue line with the exact named speaker and a speaking verb (for example, "Name says:"). A custom identity description replaces screen position only; it never replaces the named speaker cue.`,
          );
        }
        const genericPositionIssues = initialPositionAnchorIssues.filter(
          issue =>
            !issue.includes(CUSTOM_IDENTITY_POSITION_MARKER) &&
            !issue.includes(SPEAKER_CUE_MARKER),
        );
        const positionLock = buildFrameAnalysisPositionLock(
          outcome.data.frame_analysis,
          params.shotContext.barrierMultiView,
        );
        const dualViewCorrection = params.shotContext.barrierMultiView
          ? ` This is a DUAL IMAGE shot: analyze Image 1 and Image 2 as separate coordinate spaces. Image 1 is the start frame and Image 2 is the reference frame. Return view_role=start_frame only for Image 1 characters and view_role=barrier_reference only for Image 2 characters. Prefix every spoken cue with its exact Image 1 or Image 2 label; never report an Image 2 person as not_visible/tiny inside Image 1.`
          : "";
        if (genericPositionIssues.length > 0) {
          correctionParts.push(
            `POSITION-ANCHOR CORRECTION (MANDATORY): your previous response's "frame_analysis" was missing/empty, unscoped, or these quoted line(s) were not anchored by the speaker's NAME and VIEWER SCREEN POSITION (viewer-left/viewer-center-left/viewer-center/viewer-center-right/viewer-right) close to the quote: ${genericPositionIssues.join("; ")}. Return "frame_analysis.people" with every established character's name+position read from that character's assigned ATTACHED IMAGE, and rewrite "prompt" so each of those quoted lines is preceded by its speaker's name and the EXACT matching viewer screen position. Never use anatomical left/right or left-hand/right-hand as a screen-position label.${dualViewCorrection} ${positionLock ? `${params.shotContext.barrierMultiView ? "AUTHORITATIVE POSITION LOCK FROM THE CORRECT ASSIGNED VIEW" : "AUTHORITATIVE POSITION LOCK FROM THE ATTACHED IMAGE"}: ${positionLock}. Do not use any other position for these names.` : "Re-read the assigned image; do not invent or guess a position."}`,
          );
        }
      }
      const complianceRetryText = `${userPromptText}\n\n${correctionParts.join("\n\n")}`;
      const repairImages = buildShotVideoPromptVisionImages(
        params.imageUrl,
        params.characterReferenceImages,
        params.locationReferenceImage,
        params.barrierReferenceImage,
        params.additionalImageUrls,
      );
      const agentRepair = await tryRunVideoPromptRepairAgent({
        tenantId: params.tenantId,
        userId: params.userId,
        model,
        systemPrompt,
        repairPrompt: complianceRetryText,
        referenceImages: repairImages,
        publicUrl: params.publicUrl,
      });
      const correctedOutcome = agentRepair
        ? { data: agentRepair, response: outcome.response }
        : await runVisionAwareJsonAttempt<ShotVideoPromptOutput>({
            model,
            systemPrompt,
            content: buildVisionAwareContent(complianceRetryText, hasVision, repairImages),
            userId: params.userId,
            maxTokens: 2000,
            schema: shotVideoPromptOutputSchema,
          });
      const sanitizedCorrectedPrompt = nativeAudioDialogue
        ? sanitizeEmbeddedDialogueSpeakerLabels(
            correctedOutcome.data.prompt,
            sourceDialogueForSanitization,
          )
        : correctedOutcome.data.prompt;
      const correctedData =
        sanitizedCorrectedPrompt === correctedOutcome.data.prompt
          ? correctedOutcome.data
          : { ...correctedOutcome.data, prompt: sanitizedCorrectedPrompt };
      // Dialogue-verbatim adoption stays a hard gate, unchanged from before
      // this fix: never adopt a corrected response that regresses verbatim
      // dialogue embedding, even when the SAME retry was also asked to fix
      // position anchors.
      if (
        !nativeAudioDialogue ||
        promptEmbedsDialogueVerbatim(correctedData.prompt, dialogueForRetry)
      ) {
        outcome = { ...correctedOutcome, data: correctedData, usedVision: hasVision };
      }
        // Stop as soon as the candidate satisfies the source-backed
        // compliance checks; otherwise the next bounded attempt receives the
        // same authoritative facts and gets another chance to repair it.
        const deterministicIdentityRepair = removeCustomIdentityPositionCues(
          outcome.data.prompt,
          characterDescriptionOverrides,
          characterNameByKey,
        );
        if (deterministicIdentityRepair !== outcome.data.prompt) {
          outcome = { ...outcome, data: { ...outcome.data, prompt: deterministicIdentityRepair } };
        }
        const retryIssues = findPositionAnchorIssues(
          outcome.data,
          requiredDialogue,
          hasEstablishedCharacters,
          params.shotContext.barrierMultiView,
          params.verifiedCastPositions,
          characterDescriptionOverrides,
        );
        const retryDialogueMissing =
          nativeAudioDialogue && !promptEmbedsDialogueVerbatim(outcome.data.prompt, requiredDialogue);
        if (!retryDialogueMissing && !retryIssues.some(isHardPositionIssue)) break;
        if (!requiresStructuralRepairLoop) break;
      } catch {
        // Keep the last schema-valid candidate and continue the bounded repair
        // loop. A transient model failure must not be surfaced as a user
        // error when the source facts are still repairable.
      }
    }

    // A valid prompt should not be discarded only because a weak model kept
    // the exact dialogue but missed a repeated named-speaker cue. Repair that
    // bounded omission without another LLM call, then run the same strict
    // validator again. No dialogue text or position/identity claim changes.
    const deterministicallyRepairedPrompt = addMissingCanonicalSpeakerCues(
      outcome.data.prompt,
      requiredDialogue,
      characterDescriptionOverrides,
    );
    if (deterministicallyRepairedPrompt !== outcome.data.prompt) {
      outcome = {
        ...outcome,
        data: { ...outcome.data, prompt: deterministicallyRepairedPrompt },
      };
    }

    // Re-check after the bounded repair loop. Missing generic anchors remain a
    // warning. A model that keeps a textual custom-identity contradiction is
    // repaired deterministically before we consider a user-facing block.
    if (initialPositionAnchorIssues.length > 0) {
      const anchoredPrompt = repairPositionAnchorsDeterministically(
        outcome.data.prompt,
        requiredDialogue,
        outcome.data.frame_analysis,
        hasEstablishedCharacters,
        params.shotContext.barrierMultiView,
        params.verifiedCastPositions,
        characterDescriptionOverrides,
      );
      if (anchoredPrompt !== outcome.data.prompt) {
        outcome = { ...outcome, data: { ...outcome.data, prompt: anchoredPrompt } };
      }
      let remainingIssues = findPositionAnchorIssues(
        outcome.data,
        requiredDialogue,
        hasEstablishedCharacters,
        params.shotContext.barrierMultiView,
        params.verifiedCastPositions,
        characterDescriptionOverrides,
      );
      const customIdentityRepair = removeCustomIdentityPositionCues(
        outcome.data.prompt,
        characterDescriptionOverrides,
        characterNameByKey,
      );
      if (customIdentityRepair !== outcome.data.prompt) {
        outcome = { ...outcome, data: { ...outcome.data, prompt: customIdentityRepair } };
        remainingIssues = findPositionAnchorIssues(
          outcome.data,
          requiredDialogue,
          hasEstablishedCharacters,
          params.shotContext.barrierMultiView,
          params.verifiedCastPositions,
          characterDescriptionOverrides,
        );
      }
      if (remainingIssues.length > 0) {
        warnings.push(
          `Shot ${params.shotNumber}: video-prompt position-anchor check was repaired with ${repairAttempts} bounded attempt(s); residual non-fatal findings — ${remainingIssues.join("; ")}`,
        );
      }
    }
  }

  let { data, response } = outcome;
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
      usedVision: outcome.usedVision,
      // Multi-character reference images (multi-character disambiguation
      // fix, `polished-toasting-gadget.md`) — low-cost audit-log aid, per
      // this codebase's "always read audit logs first" convention.
      characterReferenceImageCount: params.characterReferenceImages?.length ?? 0,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  const resolvedAudioDirection = nativeAudioDirectionEnabled
    ? data.audio_direction || undefined
    : undefined;

  const dialogueBlockOptions = { dialogueLanguageName };
  // Skill-first stitching gate (`planning/vd-video-prompt-skill-first/
  // plan.md` Phase 3a) — `appendMissingDialogueVerbatim` is a GATED SAFETY
  // NET for weak/non-compliant models, not an unconditional re-stitch: when
  // the model's own `data.prompt` already embeds every required dialogue
  // line verbatim (a compliant, skill-first composition — including after
  // the compliance-correction retry above succeeded), trust it and leave
  // the model's own coherent prose as-is instead of stripping its quote and
  // re-appending a second, differently-worded canonical block (the
  // double-dialogue bug this fix removes). `promptEmbedsDialogueVerbatim`
  // also returns `true` trivially when there is nothing to stitch (silent
  // beat / non-native model, `dialogueForStitch` empty), preserving today's
  // exact no-op in that case.
  const dialogueForStitch = nativeAudioDialogue ? requiredDialogue : [];
  const stitchedBasePrompt = promptEmbedsDialogueVerbatim(data.prompt, dialogueForStitch)
    ? data.prompt.trim()
    : appendMissingDialogueVerbatim(data.prompt, dialogueForStitch, dialogueBlockOptions);
  let finalPrompt = appendCustomCharacterIdentityLocks(
    stitchedBasePrompt,
    characterDescriptionOverrides,
    characterNameByKey,
  );
  let frameAnalysis = normalizeFrameAnalysis(data.frame_analysis);
  let motionResolution = resolveShotVideoPromptMotionProfile(
    data.motion_profile,
    motionContractsEnabled,
  );
  let assurance = assureVideoPromptMotion({
    prompt: finalPrompt,
    negativePrompt: data.negative_motion_prompt || undefined,
    family,
    genre: params.shotContext.genre,
    establishedCharacterNames: (params.characterReferenceImages ?? []).map(c => c.name ?? c.characterKey),
    dialogueSpeakerNames: requiredDialogue
      .map(l => ("speakerName" in l ? l.speakerName : undefined) ?? l.characterKey)
      .filter((v): v is string => Boolean(v)),
    supportingPresence: params.shotContext.supportingPresence,
    frameAnalysis,
    motionProfile: motionResolution.motionProfile,
  });
  for (let repairAttempt = 0; repairAttempt < MAX_VIDEO_PROMPT_REPAIR_ATTEMPTS && assurance.blocking.length > 0; repairAttempt += 1) {
    const repairText = `${userPromptText}\n\nMOTION/IDENTITY ASSURANCE REPAIR (MANDATORY): the current candidate prompt failed deterministic verification. Rewrite only the candidate JSON output so it satisfies every finding below while preserving all source dialogue verbatim, the established cast, custom identity descriptions, declared genre, and provider model contract. Findings: ${assurance.blocking.map(f => `${f.code}: ${f.message} Repair: ${f.repair}`).join("; ")}`;
    const repairImages = buildShotVideoPromptVisionImages(
      params.imageUrl,
      params.characterReferenceImages,
      params.locationReferenceImage,
      params.barrierReferenceImage,
      params.additionalImageUrls,
    );
    const agentRepair = await tryRunVideoPromptRepairAgent({
      tenantId: params.tenantId,
      userId: params.userId,
      model,
      systemPrompt,
      repairPrompt: repairText,
      referenceImages: repairImages,
      publicUrl: params.publicUrl,
    });
    const repairedOutcome = agentRepair
      ? { data: agentRepair, response }
      : await runVisionAwareJsonAttempt<ShotVideoPromptOutput>({
          model,
          systemPrompt,
          content: buildVisionAwareContent(repairText, hasVision, repairImages),
          userId: params.userId,
          maxTokens: 3000,
          schema: shotVideoPromptOutputSchema,
        }).catch(() => null);
    if (!repairedOutcome) break;
    outcome = { ...outcome, data: repairedOutcome.data, response: repairedOutcome.response };
    data = outcome.data;
    finalPrompt = appendCustomCharacterIdentityLocks(
      nativeAudioDialogue
        ? (promptEmbedsDialogueVerbatim(data.prompt, requiredDialogue)
            ? data.prompt.trim()
            : appendMissingDialogueVerbatim(data.prompt, requiredDialogue, dialogueBlockOptions))
        : data.prompt,
      characterDescriptionOverrides,
      characterNameByKey,
    );
    frameAnalysis = normalizeFrameAnalysis(data.frame_analysis);
    motionResolution = resolveShotVideoPromptMotionProfile(data.motion_profile, motionContractsEnabled);
    assurance = assureVideoPromptMotion({
      prompt: finalPrompt,
      negativePrompt: data.negative_motion_prompt || undefined,
      family,
      genre: params.shotContext.genre,
      establishedCharacterNames: (params.characterReferenceImages ?? []).map(c => c.name ?? c.characterKey),
      dialogueSpeakerNames: requiredDialogue
        .map(l => ("speakerName" in l ? l.speakerName : undefined) ?? l.characterKey)
        .filter((v): v is string => Boolean(v)),
      supportingPresence: params.shotContext.supportingPresence,
      frameAnalysis,
      motionProfile: motionResolution.motionProfile,
    });
  }
  if (assurance.blocking.length > 0) {
    const sourceBlockers = assurance.blocking.filter(isVideoPromptSourceBlockingFinding);
    if (sourceBlockers.length > 0) {
      throw new VdVisionRequiredError(
        `Shot ${params.shotNumber}: reference frame faces are ambiguous or not readable; replace/repair the Video-Safe reference frame before rendering`,
      );
    }
    // The LLM loop is best-effort.  A deterministic final pass closes the
    // remaining known contract failures without returning an opaque error to
    // the user (and without another paid call).
    finalPrompt = applyVideoPromptMotionSafetyFallback(finalPrompt, assurance.blocking);
    assurance = assureVideoPromptMotion({
      prompt: finalPrompt,
      negativePrompt: data.negative_motion_prompt || undefined,
      family,
      genre: params.shotContext.genre,
      establishedCharacterNames: (params.characterReferenceImages ?? []).map(c => c.name ?? c.characterKey),
      dialogueSpeakerNames: requiredDialogue
        .map(l => ("speakerName" in l ? l.speakerName : undefined) ?? l.characterKey)
        .filter((v): v is string => Boolean(v)),
      supportingPresence: params.shotContext.supportingPresence,
      frameAnalysis,
      motionProfile: motionResolution.motionProfile,
    });
    if (assurance.blocking.some(isVideoPromptSourceBlockingFinding)) {
      throw new VdVisionRequiredError(
        `Shot ${params.shotNumber}: reference frame faces are ambiguous or not readable; replace/repair the Video-Safe reference frame before rendering`,
      );
    }
  }
  const assuranceWarnings = assurance.warnings.map(
    (finding: VideoPromptAssuranceFinding) => `Shot ${params.shotNumber}: ${finding.message}`,
  );
  // Sound-direction ownership fix (recorded gap 4, 2026-07-22) — this
  // function used to fold ` SFX cues: <audioDirection>` onto the returned
  // `prompt` here (the "SFX budget-aware concat", item E of `planning/vd-
  // video-prompt-model-family-quality/plan.md`), and
  // `verticalDramaVideoPromptFormatter.ts`'s render-time formatter ALSO
  // appended `clip.audioDirection` onto the same prompt — a genuine
  // double-append bug whenever native audio was on. The updated skills
  // (`vertical-drama-shot-video-prompt[-subshots]/skill.md`, "WRITE THE
  // SOUND DIRECTION INTO `prompt` ITSELF" mandate, budget-guarded by the
  // skill's own rule 8 priority) now write the closing sound clause
  // directly into `data.prompt` themselves when `native_audio: true`, so
  // `stitchedBasePrompt` (the skill's own text, only touched by the
  // dialogue-verbatim safety net above) is returned as-is apart from the
  // deterministic custom-identity lock appended below. NEVER append a second
  // sound copy here or in the formatter (that append is removed too, see that
  // file). `audioDirection` keeps being returned/
  // persisted unchanged below — the UI "เสียง:" block and audit trail read
  // it from there, independent of what's now embedded in `prompt`.
  return {
    prompt: finalPrompt,
    negativeMotionPrompt: data.negative_motion_prompt || undefined,
    dialogue: data.dialogue,
    creditsUsed,
    model,
    usedVision: outcome.usedVision,
    requiredDisclosure: data.requiredDisclosure || undefined,
    audioDirection: resolvedAudioDirection,
    family,
    frameAnalysis,
    ...motionResolution,
    warnings: warnings.concat(assuranceWarnings).length > 0
      ? warnings.concat(assuranceWarnings)
      : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Speaker-switch consolidated prompt (2026-07-11 redesign of the             */
/* speaker-aware sub-shots task) — generates ONE combined, timed motion       */
/* prompt (and ONE consolidated clip's worth of dialogue/duration) for a shot */
/* whose dialogue requires cutting between 2-3 speakers, instead of the prior */
/* N-separate-clips design. Sibling to `generateVerticalDramaShotVideoPrompt` */
/* above (which stays completely untouched — every shot that does NOT need   */
/* splitting keeps using it exactly as before); the SPLIT DECISION itself is  */
/* made deterministically, with no LLM call, by                              */
/* `computeSpeakerSwitchSubShotPlan` (`@shared/verticalDramaSeries/           */
/* subShots.ts`) — the caller (router) computes the `subShotWindows` BEFORE   */
/* calling this function. Identity for every referenced speaker now rides    */
/* the video model's multi-reference-image support (the caller resolves one  */
/* portrait per distinct speaker and sends them all on the SAME generation   */
/* call) instead of switching the reference image per segment — see the      */
/* skill's own "no-appearance-description" rule for the full rationale.      */
/* -------------------------------------------------------------------------- */

const SHOT_VIDEO_PROMPT_SUBSHOTS_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-shot-video-prompt-subshots",
);

let cachedShotVideoPromptSubShotsSystemPrompt: string | null = null;

/** Same skill.md-loader resolution strategy as `loadShotVideoPromptSystemPrompt()` — separate cache/function because this is a distinct skill file (different framing: a timed multi-speaker narrative in one prompt, not a single-speaker shot). */
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

/** Rounds to 2 decimal places — local copy of `subShots.ts`'s file-private `round2` (not exported there), used here only to keep cumulative segment-boundary seconds tidy in the fact blocks sent to the LLM. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export interface GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams
  extends GenerateVerticalDramaShotVideoPromptParams {
  /** Speaker-anchored timed windows already decided by `computeSpeakerSwitchSubShotPlan` — this function only writes ONE combined timed-narrative prompt describing them, it never re-decides the split. */
  subShotWindows: SpeakerSwitchSubShotWindow[];
  /**
   * planning/`polished-toasting-gadget.md` Fix B — already inherited from
   * `GenerateVerticalDramaShotVideoPromptParams.repairInstruction` (see that
   * field's own doc comment for the full contract); redeclared here only so
   * it's documented at its actual point of use in this file,
   * `buildSpeakerSwitchUserPrompt`.
   */
  repairInstruction?: string;
  /**
   * Multi-character reference images — already inherited from
   * `GenerateVerticalDramaShotVideoPromptParams.characterReferenceImages`
   * (see that field's own doc comment for the full contract); redeclared
   * here only so it's documented at its actual point of use in this file,
   * `buildSpeakerSwitchUserPrompt`.
   */
  characterReferenceImages?: ShotVideoPromptCharacterReferenceImage[];
  /**
   * Location reference image — already inherited from
   * `GenerateVerticalDramaShotVideoPromptParams.locationReferenceImage`
   * (see that field's own doc comment for the full contract); redeclared
   * here only so it's documented at its actual point of use in this file,
   * `buildSpeakerSwitchUserPrompt`.
   */
  locationReferenceImage?: { url: string; name?: string };
}

export interface GenerateVerticalDramaShotVideoPromptSpeakerSwitchResult {
  prompt: string;
  negativeMotionPrompt?: string;
  /** Every window's dialogue lines flattened in chronological order. */
  dialogue: VerticalDramaMotionPromptClipDialogueLine[];
  /** Sum of every window's `durationSeconds` — always equals the full shot duration by `computeSpeakerSwitchSubShotPlan`'s own invariant. */
  durationSeconds: number;
  /** Anchor speaker (the first window's `characterKey`) first, then each subsequent NEW speaker in first-appearance order across windows. Drives the caller's reference-portrait resolution order (`startFrameAssetId` = first entry, `extraReferenceAssetIds` = the rest). */
  distinctSpeakerCharacterKeys: string[];
  creditsUsed: number;
  model: string;
  /** True when the resolved model actually received the image (vision path); false when only the textual `imagePrompt` proxy was used. */
  usedVision: boolean;
  requiredDisclosure?: string;
  audioDirection?: string;
  /** Model-family-aware, vision-grounded video prompt quality upgrade — see `GenerateVerticalDramaShotVideoPromptResult.family`'s identical doc comment. */
  family: VideoPromptModelFamily;
  /** Model-family-aware, vision-grounded video prompt quality upgrade — see `GenerateVerticalDramaShotVideoPromptResult.frameAnalysis`'s identical doc comment. */
  frameAnalysis?: VdFrameAnalysis;
  /** Feature 137 P1 — same request-gated fields as the single-shot result. */
  motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
  effectiveRisk?: VdIdentityRisk;
  motionContractStatus?: VdMotionContractStatus;
  /** Model-family-aware, vision-grounded video prompt quality upgrade — see `GenerateVerticalDramaShotVideoPromptResult.warnings`'s identical doc comment. */
  warnings?: string[];
}

/**
 * Cumulative-timestamp FACT builder — walks `subShotWindows` in order,
 * accumulating `startSeconds`/`endSeconds` (a running total of each window's
 * `durationSeconds`), and emits one structured FACT block per window: the
 * anchor `characterKey`, the `[start, end)` seconds range, and that window's
 * own dialogue lines. This is pure structured fact, never authored prose —
 * turning these facts into ONE flowing timed-cut narrative is entirely the
 * skill.md system prompt's job (skill-first architecture; no prompt-
 * construction/creative-authoring logic lives in this file).
 */
function buildSpeakerSwitchUserPrompt(
  params: GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams,
  nativeAudioDialogue: boolean,
  nativeAudioDirectionEnabled: boolean,
  targetVideoModelFactBlock: string,
): string {
  const { shotContext, subShotWindows } = params;
  const sceneContinuityLockBlock = filterSceneContinuityLockBlockForShot(
    shotContext.sceneContinuityLockBlock,
    params.shotNumber,
  );
  const promptLanguage = params.promptLanguage ?? "en";
  const dialogueLanguage = params.dialogueLanguage ?? "th";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const dialogueLanguageName = VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[dialogueLanguage];
  const allDialogueLines = shotContext.dialogueLines ?? [];
  const characterDescriptionOverrides = normalizeVerticalDramaCharacterDescriptionOverrides(
    params.characterDescriptionOverrides,
  );
  // Multi-character reference images (multi-character disambiguation fix,
  // `polished-toasting-gadget.md`) — see `buildShotVideoPromptUserPrompt`'s
  // identical `characterReferenceImageNames` doc comment.
  const characterReferenceImageNames = (params.characterReferenceImages ?? []).map(
    c => c.name ?? c.characterKey,
  );
  const characterIdentityManifest = (params.characterReferenceImages ?? [])
    .map(c => `Portrait label: name=${c.name ?? c.characterKey}, characterKey=${c.characterKey}`)
    .join("; ");
  const characterNameByKey = new Map(
    (params.characterReferenceImages ?? []).map(c => [
      c.characterKey,
      c.name ?? c.characterKey,
    ]),
  );
  for (const person of params.verifiedCastPositions ?? []) {
    characterNameByKey.set(person.characterKey, person.name);
  }
  const customCharacterDescriptionBlock = buildCharacterDescriptionOverrideBlock(
    characterDescriptionOverrides,
    characterNameByKey,
  );
  const verifiedCastPositionFacts = (params.verifiedCastPositions ?? []).filter(
    person => !getCharacterDescriptionOverride(person.characterKey, characterDescriptionOverrides),
  );
  const verifiedCastPositionLock = verifiedCastPositionFacts.length
    ? `VERIFIED CAST POSITION LOCK (AUTHORITATIVE; user confirmed against the exact attached start frame): ${verifiedCastPositionFacts
        .map(
          person =>
            `${person.name} [characterKey=${person.characterKey}]=${person.position}`,
        )
        .join(", ")}. Use these viewer/camera-relative positions exactly in both frame_analysis and every timed prompt segment for characters without a custom identity description. Do not reassign identities or positions from an AI guess.`
    : null;
  // Location reference image (Phase E of `planning/polished-toasting-
  // gadget.md` — location visual bible) — see
  // `buildShotVideoPromptUserPrompt`'s identical `locationReferenceImageName`
  // doc comment.
  const locationReferenceImageName = params.locationReferenceImage?.name ?? "location";

  // Resolve every speaker's DISPLAY NAME (from characterKey) so both the
  // per-line attribution and the segment's anchor-speaker label read as the
  // real character name the skill sees on the attached reference images +
  // CHARACTER IDENTITY MAP — never the raw `characterKey`. Falls back to the
  // key when no name resolved (byte-identical to before for keyless lines).
  const speakerNameByKey = new Map<string, string>();
  for (const l of allDialogueLines) {
    if (l.characterKey && l.speakerName) speakerNameByKey.set(l.characterKey, l.speakerName);
  }
  let cursorSeconds = 0;
  const segmentBlocks = subShotWindows
    .map((w) => {
      const startSeconds = round2(cursorSeconds);
      cursorSeconds += w.durationSeconds;
      const endSeconds = round2(cursorSeconds);
      const lines = w.lineIndexes
        .map((idx) => allDialogueLines[idx])
        .filter((l): l is NonNullable<typeof l> => Boolean(l));
      const anchorSpeaker = speakerNameByKey.get(w.characterKey) ?? w.characterKey;
      const linesText = lines.length
        ? lines
            .map((l, li) => {
              const speaker =
                l.speakerName ?? l.characterKey ?? w.characterKey;
              const parts = [
                `${li + 1}. ${speaker}${l.characterKey ? ` [characterKey=${l.characterKey}]` : ""}: "${l.lineTh}"`,
              ];
              if (l.emotion) parts.push(`emotion: ${l.emotion}`);
              if (l.delivery?.tone) parts.push(`tone: ${l.delivery.tone}`);
              if (l.delivery?.pace) parts.push(`pace: ${l.delivery.pace}`);
              if (l.delivery?.pauses) parts.push(`pauses: ${l.delivery.pauses}`);
              if (l.delivery?.texture) parts.push(`voice texture: ${l.delivery.texture}`);
              if (l.subtext) parts.push(`subtext: ${l.subtext}`);
              const customDescription = getCharacterDescriptionOverride(
                l.characterKey,
                characterDescriptionOverrides,
              );
              if (customDescription) {
                parts.push(`custom visual identity (use instead of screen position): ${customDescription}`);
              }
              return parts.join(" | ");
            })
            .join("\n")
        : "(no dialogue lines assigned to this segment)";
      return [
        `SEGMENT ${w.subShotNumber} of ${subShotWindows.length} — [${startSeconds}s, ${endSeconds}s) (${w.durationSeconds}s), anchor speaker: ${anchorSpeaker}${shotContext.barrierMultiView?.dialogueSideMap[w.characterKey] ? `, speaker_side: ${shotContext.barrierMultiView.dialogueSideMap[w.characterKey]}` : ""}`,
        `Dialogue lines in this segment:\n${linesText}`,
      ].join("\n");
    })
    .join("\n\n");
  const totalDurationSeconds = round2(cursorSeconds);

  return [
    `Shot number: ${params.shotNumber}`,
    `Total clip duration: ${totalDurationSeconds}s across ${subShotWindows.length} timed segments (this shot's dialogue requires cutting between speakers — see the segment facts below; write ONE combined "prompt" narrating all segments in order, per your instructions).`,
    // Synopsis grounding (`planning/vd-video-prompt-skill-first/plan.md`
    // Phase 1a) — see `buildShotVideoPromptUserPrompt`'s identical fact line
    // for the full rationale. Omitted entirely (byte-identical) when absent.
    shotContext.canonicalShotSummary?.trim()
      ? `AUTHORITATIVE SHOT BEAT (story overview — the single source of truth for what visibly happens in this shot; ground the video motion in THIS; when it conflicts with the shorter shot description below, follow this): ${shotContext.canonicalShotSummary.trim()}`
      : null,
    shotContext.description ? `Shot description: ${shotContext.description}` : null,
    shotContext.camera ? `Overall scene camera setup (base framing before the timed cuts): ${shotContext.camera}` : null,
    shotContext.emotion ? `Shot emotion: ${shotContext.emotion}` : null,
    // Persistence/pin root-cause fix (`planning/vd-video-prompt-skill-first/
    // plan.md` Phase 2) — see `buildShotVideoPromptUserPrompt`'s identical
    // fact line for the full rationale. This path always has real speaker
    // windows in practice (a split only happens when dialogue requires
    // cutting between speakers), so this fact line is here purely for
    // shotContext-shape symmetry/forward-compat — omitted entirely
    // (byte-identical) when absent, which is every caller today.
    shotContext.beatIsSilent
      ? `SILENT BEAT (MANDATORY): this shot is intentionally silent — no character speaks aloud. Express the beat purely through action, expression, and camera. Return "dialogue" as [] and do NOT write any spoken line, lip-sync direction, or verbatim dialogue block.`
      : null,
    params.imagePrompt && params.attachShotImage !== false
      ? `The ATTACHED IMAGE is the ACTUAL start frame and is the SINGLE SOURCE OF TRUTH for what is really on screen — who stands WHERE (viewer-left / viewer-center-left / viewer-center / viewer-center-right / viewer-right), framing, blocking, poses. The prompt text below is ONLY the REQUEST that was sent to the image model to produce that frame; image models frequently do NOT follow it exactly, and character left/right placement is the field that drifts most often. Use the text only as supporting context for intent/identity/wardrobe, and whenever it CONTRADICTS the attached image, TRUST THE ATTACHED IMAGE and describe what you actually SEE. Never restate a character's on-screen position from this text without first confirming it against the image: ${params.imagePrompt}`
      : params.imagePrompt && params.attachShotImage === false
        ? `Start frame image description (note: the start frame image itself is not attached for this run; base your adjustments on this description and user instructions): ${params.imagePrompt}`
        : null,
    shotContext.characterIdentityMap ?? null,
    customCharacterDescriptionBlock,
    verifiedCastPositionLock,
    // Multi-character reference images (multi-character disambiguation fix,
    // `polished-toasting-gadget.md`) — factual announcement only; see
    // `characterReferenceImageNames`'s doc comment above.
    characterReferenceImageNames.length > 0 && params.attachShotImage !== false
      ? `Character reference images attached below the start frame, each preceded by a text label naming the character: ${characterReferenceImageNames.join(", ")}.`
      : null,
    characterIdentityManifest && params.attachShotImage !== false
      ? `CHARACTER FACE IDENTITY MANIFEST (label-to-face mapping; the attached start frame remains authoritative for actual position): ${characterIdentityManifest}`
      : null,
    allDialogueLines.length
      ? "SPEAKER-TO-FACE BINDING (MANDATORY): inspect the attached start frame first, match every visible face to the labeled portrait manifest by facial identity, and bind each timed segment to the exact characterKey/name. For a character with a CUSTOM CHARACTER IDENTIFICATION OVERRIDE, use that exact description as the identity anchor and do not add a viewer-left/right position cue. For every other character, include the observed screen position from frame_analysis using only viewer-left, viewer-center-left, viewer-center, viewer-center-right, or viewer-right. These are always coordinates from the viewer/camera side, never the character's anatomical left/right or left/right hand. Never use 'left hand', 'right hand', 'left-hand side', or 'right-hand side' as a screen-position label. Never infer identity from gender, clothing, or requested layout; keep non-speakers' mouths closed and flag any unmatched face instead of guessing."
      : null,
    // Location reference image (Phase E of `planning/polished-toasting-
    // gadget.md` — location visual bible) — factual announcement only; see
    // `locationReferenceImageName`'s doc comment above.
    params.locationReferenceImage && params.attachShotImage !== false
      ? `Environment/location reference image attached below the start frame (and any character reference images), preceded by a text label naming the location: ${locationReferenceImageName}.`
      : null,
    shotContext.barrierMultiView
      ? renderVerticalDramaBarrierMultiViewFactBlock(shotContext.barrierMultiView)
      : null,
    params.barrierReferenceImage && params.attachShotImage !== false
      ? "DUAL IMAGE INPUT (MANDATORY): Image 1 is the start frame; Image 2 is the reference frame. They have independent viewer-left/right coordinate spaces. In frame_analysis, assign view_role=start_frame only to characters configured for Image 1 and view_role=barrier_reference only to characters configured for Image 2. In prompt, prefix every speaking beat with the exact Image 1 or Image 2 label before the character name and that image's viewer-relative position. Never describe an Image 2 character as absent/not_visible/tiny in Image 1; inspect Image 2 directly instead."
      : null,
    sceneContinuityLockBlock?.trim()
      ? `บริบทฉากของตอน (อ้างอิงเพื่อความสอดคล้อง ห้ามคัดลอกลง output):\n${sceneContinuityLockBlock.trim()}`
      : null,
    // VideoPromptAiEditDialog — factual announcement of user-supplied
    // additional images (same purely-factual convention as character/location
    // reference images above; the actual creative use is in the
    // `repairInstruction` field or left to the model's own judgment).
    (params.additionalImageUrls?.length ?? 0) > 0 && params.attachShotImage !== false
      ? `Additional reference image(s) attached at the end (user-supplied, ${params.additionalImageUrls!.length} image${params.additionalImageUrls!.length === 1 ? "" : "s"}): use them as supplementary visual context alongside the start frame.`
      : null,
    `Timed segment facts (structured facts only, in chronological order — return exactly ONE combined "prompt" for the whole shot):\n${segmentBlocks}`,
    shotContext.productContext
      ? `PRODUCT TIE-IN (MANDATORY for this shot): the tied-in product is placed in this shot (${shotContext.productContext.placementStyle ?? "in_use_moment"}). Naturally reference the product GENERICALLY (e.g. "the product", a category descriptor — NEVER the brand/product name itself, which must never appear in "prompt"/"negative_motion_prompt"/dialogue text) or its benefit${shotContext.productContext.benefitTalkingPoint ? ` (e.g. "${shotContext.productContext.benefitTalkingPoint}")` : ""} in whichever segment's dialogue/acting beat fits it best — it must sound like a real character moment, never a hard-sell or advertisement line, and must fit the scene's emotion. Brand identity comes ONLY from the attached/locked reference image, never from prompt or dialogue text. ${VD_PRODUCT_LOCK_VIDEO_INSTRUCTION}`
      : null,
    shotContext.productContext
      ? buildThaiAdComplianceInstruction(shotContext.productContext.productCategory)
      : null,
    shotContext.productContext
      ? "Public-figure/brand guard (MANDATORY): never name a real public figure, celebrity, or real company/brand anywhere in the \"prompt\", \"negative_motion_prompt\", or dialogue text."
      : null,
    `PROMPT LANGUAGE (MANDATORY): write the "prompt" and "negative_motion_prompt" fields entirely in ${promptLanguageName} — every word of the motion/acting/camera direction must be in ${promptLanguageName}, regardless of what language the dialogue is in.`,
    `SPEECH LANGUAGE (MANDATORY): the character(s) speak in ${dialogueLanguageName} in this video. Any literal quoted dialogue embedded in "prompt" (native-audio models) must be in ${dialogueLanguageName}, adapted/translated naturally into ${dialogueLanguageName} if the source line shown above is in a different language.`,
    dialogueLanguage === "th" && params.thaiAccent
      ? `SPEECH ACCENT (MANDATORY): ${VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES[params.thaiAccent]} Apply this delivery direction to every spoken line.`
      : null,
    nativeAudioDialogue
      ? `The selected video model (${params.selectedVideoModelId}) supports native lip-synced audio — at the point in "prompt" where each segment is narrated, embed that segment's dialogue line(s) VERBATIM (in the SPEECH LANGUAGE) with matching mouth/lip movement and delivery direction, and return every line again, in chronological order across all segments, in the "dialogue" array.`
      : `The selected video model (${params.selectedVideoModelId}) has NO native lip-sync/audio channel — describe mouth movement + acting direction only in "prompt" (in the PROMPT LANGUAGE, no literal transcript embedded), and return the resolved ${dialogueLanguageName} lines, in chronological order across all segments, in the "dialogue" array so the caller can route them to text-to-speech.`,
    nativeAudioDialogue
      ? `SPOKEN-TEXT BOUNDARY (MANDATORY): every quoted spoken utterance in "prompt" must contain ONLY the exact source line text from the timed segment facts. Keep each segment speaker's display name and characterKey outside the quotation as attribution immediately before it; NEVER copy a speaker label into the quoted spoken text (for example, write ภาคิน says: "หยุด คุณไปไหนไม่ได้แล้ว", never "ภาคินหยุด คุณไปไหนไม่ได้แล้ว").`
      : null,
    nativeAudioDirectionEnabled
      ? `NATIVE AUDIO DIRECTION (native_audio: true): the selected video model (${params.selectedVideoModelId}) generates synchronized audio natively as part of the clip — return an additional "audio_direction" field directing the model's own in-clip audio for this shot (ONCE for the whole shot, not per segment): SFX cues tied to this shot's visible on-screen actions FIRST (primary, always produce), then a brief ambient soundscape matched to the scene's mood/location and this shot's emotional-beat intensity SECOND (secondary enrichment). NEVER include speech/dialogue/voices/vocals (dialogue comes only from "dialogue"/text-to-speech) and NEVER include music/melody/lyrics/score (a separate background-music layer owns that) in "audio_direction".`
      : null,
    // Model-family-aware, vision-grounded video prompt quality upgrade
    // (`planning/vd-video-prompt-model-family-quality/plan.md`) — mirrors
    // `buildShotVideoPromptUserPrompt`'s identical insertion point.
    targetVideoModelFactBlock,
    // planning/`polished-toasting-gadget.md` Fix B — an ADDITIONAL directive
    // layered on top of every Hard Rule above, per skill.md's "Hard rules —
    // MANDATORY" section; omitted entirely (byte-identical prompt) when the
    // caller doesn't supply one. Mirrors `buildShotVideoPromptUserPrompt`'s
    // identical line verbatim.
    params.repairInstruction
      ? `User repair instruction (MANDATORY — apply as an ADDITIONAL directive on top of the Hard Rules above, not a replacement for them): ${params.repairInstruction}`
      : null,
    `Locale: ${params.locale}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate ONE combined, timed motion prompt for a shot whose dialogue
 * requires cutting between 2-3 speakers (2026-07-11 redesign, speaker-aware
 * sub-shots task) — sibling to `generateVerticalDramaShotVideoPrompt`,
 * reusing the SAME vision-aware retry harness
 * (`executeVisionAwareJsonCallWithRetry`), credit-check/rate-limit gating,
 * model-resolution convention, AND output schema (`shotVideoPromptOutputSchema`
 * — the contract is now IDENTICAL in shape to the single-shot skill's, so
 * there is no separate sub-shot schema to maintain). The CALLER (router) is
 * responsible for deciding whether a shot needs splitting at all
 * (`computeSpeakerSwitchSubShotPlan`) and for resolving every distinct
 * speaker's own portrait as a reference image on the SAME generation call
 * (`distinctSpeakerCharacterKeys` on the result, anchor first) — this
 * function only writes the ONE combined timed-narrative prompt for the
 * windows it's given.
 */
export async function generateVerticalDramaShotVideoPromptSpeakerSwitch(
  params: GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams,
): Promise<GenerateVerticalDramaShotVideoPromptSpeakerSwitchResult> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const resolvedModel = await resolveShotVideoPromptModel(params.seriesId);
  const model = resolvedModel.model;
  const hasVision = params.attachShotImage === false ? false : resolvedModel.hasVision;
  const hasEstablishedCharacters = (params.characterReferenceImages?.length ?? 0) >= 1;
  // Vision fallback surface (`planning/vd-video-prompt-skill-first/plan.md`
  // Phase 1b) — same signal as `generateVerticalDramaShotVideoPrompt`'s
  // identical block above.
  if (!hasVision) {
    console.warn(
      "[vd_video_prompt] generated WITHOUT vision (no vision-capable model enabled) — model relied on imagePrompt text proxy only",
      { seriesId: params.seriesId, episodeId: params.episodeId, shotNumber: params.shotNumber },
    );
  }
  assertVisionForCharacterGroundedPrompt(
    hasVision,
    hasEstablishedCharacters || Boolean(params.barrierReferenceImage),
  );
  const systemPrompt = loadShotVideoPromptSubShotsSystemPrompt();

  const capabilities = resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
    type: params.selectedVideoModel.type,
    aspectRatios: params.selectedVideoModel.aspectRatios,
    configJson: params.selectedVideoModel.configJson,
  });
  const nativeAudioDialogue = capabilities.nativeAudioDialogue === true;
  const nativeAudioDirectionEnabled =
    params.nativeAudioEnabled === true && capabilities.supportsNativeAudio === true;
  // Lip-sync discipline fix — same speech-language name signal as
  // `generateVerticalDramaShotVideoPrompt` above (deliberately no
  // `establishedCharacterCount` — see that function's identical local for
  // the full cross-mutation-parity rationale).
  const dialogueLanguageName =
    VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[params.dialogueLanguage ?? "th"];

  // Model-family-aware, vision-grounded video prompt quality upgrade
  // (`planning/vd-video-prompt-model-family-quality/plan.md`) — see
  // `generateVerticalDramaShotVideoPrompt`'s identical block above. This
  // path's `characterReferenceImages` is normally >= 2 in practice (the
  // router only reaches this function when `computeSpeakerSwitchSubShotPlan`
  // decided the shot needs cutting between 2+ speakers), but the SAME
  // structural check is used here rather than assuming that invariant, so
  // this also stays correct for a future solo caller.
  const motionContractsEnabled = params.motionContractsEnabled === true;
  const frameAnalysisRequested =
    (params.characterReferenceImages?.length ?? 0) >= 1;
  const frameObservabilityRequested = motionContractsEnabled && frameAnalysisRequested;
  const family = resolveShotVideoPromptModelFamily(
    params.selectedVideoModelId,
    params.selectedVideoModel,
  );
  const targetVideoModelFactBlock = buildTargetVideoModelFactBlock({
    family,
    modelId: params.selectedVideoModelId,
    modelName: params.selectedVideoModel.name,
    maxReferenceImages: capabilities.maxReferenceImages,
    frameAnalysisRequested,
    frameObservabilityRequested,
    motionContractsEnabled,
    genre: params.shotContext.genre,
    establishedCharacterCount: params.characterReferenceImages?.length,
    supportingPresence: params.shotContext.supportingPresence,
  });

  const userPromptText = buildSpeakerSwitchUserPrompt(
    params,
    nativeAudioDialogue,
    nativeAudioDirectionEnabled,
    targetVideoModelFactBlock,
  );

  const characterDescriptionOverrides = normalizeVerticalDramaCharacterDescriptionOverrides(
    params.characterDescriptionOverrides,
  );
  const allDialogueLines = params.shotContext.dialogueLines ?? [];
  const dialogue: VerticalDramaMotionPromptClipDialogueLine[] = params.subShotWindows.flatMap(
    (w) =>
      w.lineIndexes
        .map((idx) => allDialogueLines[idx])
        .filter((l): l is NonNullable<typeof l> => Boolean(l))
        .map((l) => ({
          characterKey: l.characterKey,
          lineTh: l.lineTh,
          emotion: l.emotion,
          delivery: l.delivery,
          subtext: l.subtext,
        })),
  );
  // Speaker-name-augmented mirror of `dialogue` above, used ONLY to build the
  // deterministic lip-sync block (`appendMissingDialogueVerbatim` below) —
  // kept separate from the returned/persisted `dialogue` array so
  // `speakerName` never leaks into the stored `VerticalDramaMotionPromptClipDialogueLine`
  // shape (no schema change requested for this fix).
  const dialogueForBlock: Array<{ lineTh: string; characterKey?: string; speakerName?: string }> =
    params.subShotWindows.flatMap((w) =>
      w.lineIndexes
        .map((idx) => allDialogueLines[idx])
        .filter((l): l is NonNullable<typeof l> => Boolean(l))
        .map((l) => ({ lineTh: l.lineTh, characterKey: l.characterKey, speakerName: l.speakerName })),
    );
  const characterNameByKey = buildCharacterNameByKey(
    params.characterReferenceImages,
    params.verifiedCastPositions,
    dialogueForBlock,
  );

  let outcome = await executeVisionAwareJsonCallWithRetry<ShotVideoPromptOutput>({
    model,
    systemPrompt,
    userPromptText,
    hasVision,
    images: buildShotVideoPromptVisionImages(
      params.imageUrl,
      params.characterReferenceImages,
      params.locationReferenceImage,
      params.barrierReferenceImage,
      params.additionalImageUrls,
    ),
    userId: params.userId,
    tenantId: params.tenantId,
    publicUrl: params.publicUrl,
    schema: shotVideoPromptOutputSchema,
    // Bumped 3000 -> 3600 (frame_analysis headroom); retry ceiling unchanged.
    firstAttemptMaxTokens: 3600,
    retryMaxTokens: 6000,
    modelFallbackPolicy: "recommended",
  });

  // Keep speaker-switch prompts fail-closed too: a text-only recovery is not
  // valid when the prompt is grounded in attached character/reference images.
  assertVisionForCharacterGroundedPrompt(
    outcome.usedVision,
    hasEstablishedCharacters || Boolean(params.barrierReferenceImage),
  );

  // Source-backed native dialogue is authoritative. Repair only the narrow
  // failure where a model prefixes a quoted line with its speaker label;
  // speaker identity remains intact in the separate dialogue/segment facts.
  if (nativeAudioDialogue && dialogueForBlock.length > 0) {
    const sanitizedPrompt = sanitizeEmbeddedDialogueSpeakerLabels(
      outcome.data.prompt,
      dialogueForBlock,
    );
    if (sanitizedPrompt !== outcome.data.prompt) {
      outcome = {
        ...outcome,
        data: { ...outcome.data, prompt: sanitizedPrompt },
      };
    }
  }

  const dialogueVerbatimMissing =
    nativeAudioDialogue && !promptEmbedsDialogueVerbatim(outcome.data.prompt, dialogue);

  // Position-anchor compliance check — see
  // `generateVerticalDramaShotVideoPrompt`'s identical block above for the
  // full rationale. `dialogueForBlock` (not the stripped `dialogue` array)
  // carries `speakerName`, needed to check the name-anchor half of the
  // check.
  const initialPositionAnchorIssues = Array.from(
    new Set([
      ...(hasEstablishedCharacters && hasVision && dialogue.length > 0
        ? findPositionAnchorIssues(
            outcome.data,
            dialogueForBlock,
            hasEstablishedCharacters,
            params.shotContext.barrierMultiView,
            params.verifiedCastPositions,
            characterDescriptionOverrides,
          )
        : []),
      ...findCustomIdentityPositionIssues(
        outcome.data.prompt,
        dialogueForBlock,
        characterDescriptionOverrides,
        characterNameByKey,
      ),
    ]),
  );

  const warnings: string[] = [];

  if (dialogueVerbatimMissing || initialPositionAnchorIssues.length > 0) {
    let repairAttempts = 0;
    const requiresStructuralRepairLoop = initialPositionAnchorIssues.some(isStructuralPositionIssue);
    for (; repairAttempts < MAX_VIDEO_PROMPT_REPAIR_ATTEMPTS; repairAttempts += 1) {
      try {
      const correctionParts: string[] = [];
      if (dialogueVerbatimMissing) {
        const quotedLines = dialogue.map(line => `"${line.lineTh}"`).join(", ");
        correctionParts.push(
          `COMPLIANCE CORRECTION (MANDATORY): quote every timed dialogue line verbatim inside "prompt": ${quotedLines}.`,
        );
      }
      if (initialPositionAnchorIssues.length > 0) {
        const customIdentityIssues = initialPositionAnchorIssues.filter(issue =>
          issue.includes(CUSTOM_IDENTITY_POSITION_MARKER),
        );
        if (customIdentityIssues.length > 0) {
          correctionParts.push(
            `CUSTOM IDENTITY CORRECTION (MANDATORY): ${customIdentityIssues.join("; ")}. Preserve each user's custom character description as the identity anchor, include the exact supplied detail in the final "prompt", and remove every viewer-left/viewer-right/viewer-center position cue for those characters. Use screen positions only for characters without a custom identity description.`,
          );
        }
        const speakerCueIssues = initialPositionAnchorIssues.filter(issue =>
          issue.includes(SPEAKER_CUE_MARKER),
        );
        if (speakerCueIssues.length > 0) {
          correctionParts.push(
            `SPEAKER CUE CORRECTION (MANDATORY): ${speakerCueIssues.join("; ")}. Immediately precede every quoted dialogue line with the exact named speaker and a speaking verb (for example, "Name says:"). A custom identity description replaces screen position only; it never replaces the named speaker cue.`,
          );
        }
        const genericPositionIssues = initialPositionAnchorIssues.filter(
          issue =>
            !issue.includes(CUSTOM_IDENTITY_POSITION_MARKER) &&
            !issue.includes(SPEAKER_CUE_MARKER),
        );
        const positionLock = buildFrameAnalysisPositionLock(
          outcome.data.frame_analysis,
          params.shotContext.barrierMultiView,
        );
        const dualViewCorrection = params.shotContext.barrierMultiView
          ? ` This is a DUAL IMAGE shot: analyze Image 1 and Image 2 as separate coordinate spaces. Image 1 is the start frame and Image 2 is the reference frame. Return view_role=start_frame only for Image 1 characters and view_role=barrier_reference only for Image 2 characters. Prefix every spoken cue with its exact Image 1 or Image 2 label; never report an Image 2 person as not_visible/tiny inside Image 1.`
          : "";
        if (genericPositionIssues.length > 0) {
          correctionParts.push(
            `POSITION-ANCHOR CORRECTION (MANDATORY): your previous response's "frame_analysis" was missing/empty, unscoped, or these quoted line(s) were not anchored by the speaker's NAME and VIEWER SCREEN POSITION (viewer-left/viewer-center-left/viewer-center/viewer-center-right/viewer-right) close to the quote: ${genericPositionIssues.join("; ")}. Return "frame_analysis.people" with every established character's name+position read from that character's assigned ATTACHED IMAGE, and rewrite "prompt" so each of those quoted lines is preceded by its speaker's name and the EXACT matching viewer screen position. Never use anatomical left/right or left-hand/right-hand as a screen-position label.${dualViewCorrection} ${positionLock ? `${params.shotContext.barrierMultiView ? "AUTHORITATIVE POSITION LOCK FROM THE CORRECT ASSIGNED VIEW" : "AUTHORITATIVE POSITION LOCK FROM THE ATTACHED IMAGE"}: ${positionLock}. Do not use any other position for these names.` : "Re-read the assigned image; do not invent or guess a position."}`,
          );
        }
      }
      const complianceRetryText = `${userPromptText}\n\n${correctionParts.join("\n\n")}`;
      const repairImages = buildShotVideoPromptVisionImages(
        params.imageUrl,
        params.characterReferenceImages,
        params.locationReferenceImage,
        params.barrierReferenceImage,
        params.additionalImageUrls,
      );
      const agentRepair = await tryRunVideoPromptRepairAgent({
        tenantId: params.tenantId,
        userId: params.userId,
        model,
        systemPrompt,
        repairPrompt: complianceRetryText,
        referenceImages: repairImages,
        publicUrl: params.publicUrl,
      });
      const correctedOutcome = agentRepair
        ? { data: agentRepair, response: outcome.response }
        : await runVisionAwareJsonAttempt<ShotVideoPromptOutput>({
            model,
            systemPrompt,
            content: buildVisionAwareContent(complianceRetryText, hasVision, repairImages),
            userId: params.userId,
            maxTokens: 3000,
            schema: shotVideoPromptOutputSchema,
          });
      const sanitizedCorrectedPrompt = nativeAudioDialogue
        ? sanitizeEmbeddedDialogueSpeakerLabels(correctedOutcome.data.prompt, dialogueForBlock)
        : correctedOutcome.data.prompt;
      const correctedData =
        sanitizedCorrectedPrompt === correctedOutcome.data.prompt
          ? correctedOutcome.data
          : { ...correctedOutcome.data, prompt: sanitizedCorrectedPrompt };
      // Dialogue-verbatim adoption stays a hard gate, unchanged from before
      // this fix — see `generateVerticalDramaShotVideoPrompt`'s identical
      // block above.
      if (
        !nativeAudioDialogue ||
        promptEmbedsDialogueVerbatim(correctedData.prompt, dialogue)
      ) {
        outcome = { ...correctedOutcome, data: correctedData, usedVision: hasVision };
      }
        const deterministicIdentityRepair = removeCustomIdentityPositionCues(
          outcome.data.prompt,
          characterDescriptionOverrides,
          characterNameByKey,
        );
        if (deterministicIdentityRepair !== outcome.data.prompt) {
          outcome = { ...outcome, data: { ...outcome.data, prompt: deterministicIdentityRepair } };
        }
        const retryIssues = findPositionAnchorIssues(
          outcome.data,
          dialogueForBlock,
          hasEstablishedCharacters,
          params.shotContext.barrierMultiView,
          params.verifiedCastPositions,
          characterDescriptionOverrides,
        );
        const retryDialogueMissing =
          nativeAudioDialogue && !promptEmbedsDialogueVerbatim(outcome.data.prompt, dialogue);
        if (!retryDialogueMissing && !retryIssues.some(isHardPositionIssue)) break;
        if (!requiresStructuralRepairLoop) break;
      } catch {
        // Continue the bounded repair loop. The last schema-valid candidate
        // remains usable while the source-backed facts are still available.
      }
    }

    if (initialPositionAnchorIssues.length > 0) {
      const anchoredPrompt = repairPositionAnchorsDeterministically(
        outcome.data.prompt,
        dialogueForBlock,
        outcome.data.frame_analysis,
        hasEstablishedCharacters,
        params.shotContext.barrierMultiView,
        params.verifiedCastPositions,
        characterDescriptionOverrides,
      );
      if (anchoredPrompt !== outcome.data.prompt) {
        outcome = { ...outcome, data: { ...outcome.data, prompt: anchoredPrompt } };
      }
      let remainingIssues = findPositionAnchorIssues(
        outcome.data,
        dialogueForBlock,
        hasEstablishedCharacters,
        params.shotContext.barrierMultiView,
        params.verifiedCastPositions,
        characterDescriptionOverrides,
      );
      const customIdentityRepair = removeCustomIdentityPositionCues(
        outcome.data.prompt,
        characterDescriptionOverrides,
        characterNameByKey,
      );
      if (customIdentityRepair !== outcome.data.prompt) {
        outcome = { ...outcome, data: { ...outcome.data, prompt: customIdentityRepair } };
        remainingIssues = findPositionAnchorIssues(
          outcome.data,
          dialogueForBlock,
          hasEstablishedCharacters,
          params.shotContext.barrierMultiView,
          params.verifiedCastPositions,
          characterDescriptionOverrides,
        );
      }
      if (remainingIssues.length > 0) {
        warnings.push(
          `Shot ${params.shotNumber}: video-prompt position-anchor check was repaired with ${repairAttempts} bounded attempt(s); residual non-fatal findings — ${remainingIssues.join("; ")}`,
        );
      }
    }
  }

  let { data, response } = outcome;

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
    description: `Vertical Drama — generate shot video prompt (speaker switch) (episode #${params.episodeId}, shot #${params.shotNumber})`,
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      shotNumber: params.shotNumber,
      usedVision: outcome.usedVision,
      segmentCount: params.subShotWindows.length,
      // Multi-character reference images (multi-character disambiguation
      // fix, `polished-toasting-gadget.md`) — low-cost audit-log aid, per
      // this codebase's "always read audit logs first" convention.
      characterReferenceImageCount: params.characterReferenceImages?.length ?? 0,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  const resolvedAudioDirection = nativeAudioDirectionEnabled
    ? data.audio_direction || undefined
    : undefined;

  // Anchor speaker (the FIRST window's characterKey) first, then each
  // subsequent NEW speaker in first-appearance order across windows —
  // extracted to the shared `deriveDistinctSpeakerCharacterKeysFromWindows`
  // (`@shared/verticalDramaSeries/subShots.ts`) so this result field and the
  // router's PRE-call reference-image resolution
  // (`resolveShotVideoPromptCharacterReferenceImages` in
  // `verticalDramaEpisodes.ts`) can never silently drift apart.
  const distinctSpeakerCharacterKeys =
    deriveDistinctSpeakerCharacterKeysFromWindows(params.subShotWindows);

  // Flatten every window's dialogue lines in chronological order (windows are
  // already chronological per `computeSpeakerSwitchSubShotPlan`'s contract).
  const durationSeconds = round2(
    params.subShotWindows.reduce((sum, w) => sum + w.durationSeconds, 0),
  );

  const dialogueBlockOptions = { dialogueLanguageName };
  // Skill-first stitching gate (`planning/vd-video-prompt-skill-first/
  // plan.md` Phase 3a) — same gated-safety-net convention as
  // `generateVerticalDramaShotVideoPrompt`'s identical block above: only
  // strip+re-append the deterministic canonical block when the model's own
  // `data.prompt` does NOT already embed every timed segment's dialogue
  // verbatim; trust (and leave untouched) an already-compliant skill-first
  // composition. Trivially a no-op (byte-identical to before this fix) when
  // there is nothing to stitch (`dialogueForStitch` empty — silent/no-dialogue
  // shot or non-native model).
  const dialogueForStitch = nativeAudioDialogue ? dialogueForBlock : [];
  const stitchedBasePrompt = promptEmbedsDialogueVerbatim(data.prompt, dialogueForStitch)
    ? data.prompt.trim()
    : appendMissingDialogueVerbatim(data.prompt, dialogueForStitch, dialogueBlockOptions);
  let finalPrompt = appendCustomCharacterIdentityLocks(
    stitchedBasePrompt,
    characterDescriptionOverrides,
    characterNameByKey,
  );
  let frameAnalysis = normalizeFrameAnalysis(data.frame_analysis);
  let motionResolution = resolveShotVideoPromptMotionProfile(
    data.motion_profile,
    motionContractsEnabled,
  );
  let assurance = assureVideoPromptMotion({
    prompt: finalPrompt,
    negativePrompt: data.negative_motion_prompt || undefined,
    family,
    genre: params.shotContext.genre,
    establishedCharacterNames: (params.characterReferenceImages ?? []).map(c => c.name ?? c.characterKey),
    dialogueSpeakerNames: dialogue
      .map(l => ("speakerName" in l ? l.speakerName : undefined) ?? l.characterKey)
      .filter((v): v is string => Boolean(v)),
    supportingPresence: params.shotContext.supportingPresence,
    frameAnalysis,
    motionProfile: motionResolution.motionProfile,
  });
  for (let repairAttempt = 0; repairAttempt < MAX_VIDEO_PROMPT_REPAIR_ATTEMPTS && assurance.blocking.length > 0; repairAttempt += 1) {
    const repairText = `${userPromptText}\n\nMOTION/IDENTITY ASSURANCE REPAIR (MANDATORY): rewrite the candidate JSON until deterministic verification passes. Preserve every timed dialogue line verbatim, each named speaker, the established cast, custom identities, declared genre, and the provider model contract. Findings: ${assurance.blocking.map(f => `${f.code}: ${f.message} Repair: ${f.repair}`).join("; ")}`;
    const repairImages = buildShotVideoPromptVisionImages(
      params.imageUrl,
      params.characterReferenceImages,
      params.locationReferenceImage,
      params.barrierReferenceImage,
      params.additionalImageUrls,
    );
    const agentRepair = await tryRunVideoPromptRepairAgent({
      tenantId: params.tenantId,
      userId: params.userId,
      model,
      systemPrompt,
      repairPrompt: repairText,
      referenceImages: repairImages,
      publicUrl: params.publicUrl,
    });
    const repairedOutcome = agentRepair
      ? { data: agentRepair, response }
      : await runVisionAwareJsonAttempt<ShotVideoPromptOutput>({
          model,
          systemPrompt,
          content: buildVisionAwareContent(repairText, hasVision, repairImages),
          userId: params.userId,
          maxTokens: 3600,
          schema: shotVideoPromptOutputSchema,
        }).catch(() => null);
    if (!repairedOutcome) break;
    outcome = { ...outcome, data: repairedOutcome.data, response: repairedOutcome.response };
    data = outcome.data;
    finalPrompt = appendCustomCharacterIdentityLocks(
      nativeAudioDialogue
        ? (promptEmbedsDialogueVerbatim(data.prompt, dialogueForBlock)
            ? data.prompt.trim()
            : appendMissingDialogueVerbatim(data.prompt, dialogueForBlock, dialogueBlockOptions))
        : data.prompt,
      characterDescriptionOverrides,
      characterNameByKey,
    );
    frameAnalysis = normalizeFrameAnalysis(data.frame_analysis);
    motionResolution = resolveShotVideoPromptMotionProfile(data.motion_profile, motionContractsEnabled);
    assurance = assureVideoPromptMotion({
      prompt: finalPrompt,
      negativePrompt: data.negative_motion_prompt || undefined,
      family,
      genre: params.shotContext.genre,
      establishedCharacterNames: (params.characterReferenceImages ?? []).map(c => c.name ?? c.characterKey),
      dialogueSpeakerNames: dialogue
        .map(l => ("speakerName" in l ? l.speakerName : undefined) ?? l.characterKey)
        .filter((v): v is string => Boolean(v)),
      supportingPresence: params.shotContext.supportingPresence,
      frameAnalysis,
      motionProfile: motionResolution.motionProfile,
    });
  }
  if (assurance.blocking.length > 0) {
    const sourceBlockers = assurance.blocking.filter(isVideoPromptSourceBlockingFinding);
    if (sourceBlockers.length > 0) {
      throw new VdVisionRequiredError(
        `Shot ${params.shotNumber}: reference frame faces are ambiguous or not readable; replace/repair the Video-Safe reference frame before rendering`,
      );
    }
    finalPrompt = applyVideoPromptMotionSafetyFallback(finalPrompt, assurance.blocking);
    assurance = assureVideoPromptMotion({
      prompt: finalPrompt,
      negativePrompt: data.negative_motion_prompt || undefined,
      family,
      genre: params.shotContext.genre,
      establishedCharacterNames: (params.characterReferenceImages ?? []).map(c => c.name ?? c.characterKey),
      dialogueSpeakerNames: dialogue
        .map(l => ("speakerName" in l ? l.speakerName : undefined) ?? l.characterKey)
        .filter((v): v is string => Boolean(v)),
      supportingPresence: params.shotContext.supportingPresence,
      frameAnalysis,
      motionProfile: motionResolution.motionProfile,
    });
    if (assurance.blocking.some(isVideoPromptSourceBlockingFinding)) {
      throw new VdVisionRequiredError(
        `Shot ${params.shotNumber}: reference frame faces are ambiguous or not readable; replace/repair the Video-Safe reference frame before rendering`,
      );
    }
  }
  const assuranceWarnings = assurance.warnings.map(
    (finding: VideoPromptAssuranceFinding) => `Shot ${params.shotNumber}: ${finding.message}`,
  );
  // Sound-direction ownership fix (recorded gap 4, 2026-07-22) — mirrors
  // `generateVerticalDramaShotVideoPrompt`'s identical fix above: this
  // function no longer folds an SFX tail onto `prompt` (the skill now
  // writes its closing sound clause directly into `data.prompt` itself, and
  // the render-time formatter no longer appends `clip.audioDirection`
  // either — see both files' updated doc comments). `stitchedBasePrompt` is
  // returned as-is apart from the deterministic custom-identity lock;
  // `audioDirection` keeps being returned/
  // persisted unchanged for the UI/audit trail.
  return {
    prompt: finalPrompt,
    negativeMotionPrompt: data.negative_motion_prompt || undefined,
    dialogue,
    durationSeconds,
    distinctSpeakerCharacterKeys,
    creditsUsed,
    model,
    usedVision: outcome.usedVision,
    requiredDisclosure: data.requiredDisclosure || undefined,
    audioDirection: resolvedAudioDirection,
    family,
    frameAnalysis,
    ...motionResolution,
    warnings: warnings.concat(assuranceWarnings).length > 0
      ? warnings.concat(assuranceWarnings)
      : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Phase 2 — Judged best-of-2 quality loop                                    */
/* (`planning/vd-video-prompt-model-family-quality/plan.md`, Phase 2)         */
/*                                                                            */
/* Generates K=2 candidates per shot in parallel via the EXISTING generator   */
/* functions above (untouched), computes a deterministic per-candidate FACT   */
/* SHEET in TS (facts only — no creative thresholds), asks the NEW            */
/* `vertical-drama-video-prompt-judge` skill to pick a winner and decide      */
/* accept/repair, and — only on `repair` — runs ONE additional regeneration   */
/* of the winner, then picks winner-vs-repaired MECHANICALLY from hard facts  */
/* alone (never a second LLM judgment). Hard call-count bound: 2 generations  */
/* (parallel) + 1 judge + <=1 repair = <=4 LLM calls per invocation, by       */
/* construction (no loop, no re-judge, no 3rd candidate).                    */
/* -------------------------------------------------------------------------- */

const JUDGE_SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-video-prompt-judge");

let cachedJudgeSystemPrompt: string | null = null;

/** Read the `vertical-drama-video-prompt-judge` skill's markdown body verbatim — same resolution strategy as every other loader in this file (lowercase `skill.md` first). */
function loadJudgeSystemPrompt(): string {
  if (cachedJudgeSystemPrompt) return cachedJudgeSystemPrompt;

  for (const dir of resolveSkillDirCandidates(JUDGE_SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedJudgeSystemPrompt = content;
        return cachedJudgeSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-video-prompt-judge" under any known skills directory`,
  );
}

/**
 * Lenient judge output schema — same VD weak-model JSON failure class
 * rationale as `shotVideoPromptOutputSchema.frame_analysis`: `verdict` is a
 * bare string (normalized to `"accept" | "repair"` downstream, any other
 * value including absence defaults to `"accept"`), `scores` is a passthrough
 * array (audit/debugging only — never used for the mechanical decision), and
 * `.passthrough()` at the top level tolerates extra fields. `winner_index`
 * is the one field callers actually branch on, so it stays a plain
 * `z.number()` — a response that can't even supply that number is not a
 * usable judge response and should fail schema validation (triggering the
 * existing JSON retry, then fail-open).
 */
const judgeOutputSchema = z
  .object({
    winner_index: z.number(),
    verdict: z.string().optional(),
    scores: z.array(z.object({}).passthrough()).optional(),
    repair_instruction: z.string().optional(),
  })
  .passthrough();

type JudgeOutput = z.infer<typeof judgeOutputSchema>;

/**
 * Candidate B's decorrelation directive (`plan.md` Phase 2 design) — an
 * ADDITIONAL directive layered on top of any user `repairInstruction`, never
 * a replacement (same "additional, not replacement" convention every other
 * `repairInstruction` use in this file already follows). Deliberately never
 * touches dialogue facts/speakers/positions/silence — those are ground
 * truth, not something a "different camera interpretation" may vary.
 */
const VD_VIDEO_PROMPT_VARIATION_DIRECTIVE =
  "VARIATION DIRECTIVE: explore a different, equally valid camera/motion interpretation of the same beat. Never change dialogue facts, speakers, positions, or the silent/speaking nature of the beat.";

/** Joins 1-2 optional instruction strings with a blank line; `undefined` when both are empty/absent. */
function combineRepairInstructions(...parts: Array<string | undefined>): string | undefined {
  const nonEmpty = parts
    .map(p => p?.trim())
    .filter((p): p is string => Boolean(p && p.length > 0));
  return nonEmpty.length > 0 ? nonEmpty.join("\n\n") : undefined;
}

/** Appends `extra` onto `existing`, returning `undefined` (not `[]`) when the combined list is empty — matches this file's "omit an empty optional array" convention. */
function appendWarnings(existing: string[] | undefined, extra: string[]): string[] | undefined {
  const combined = [...(existing ?? []), ...extra];
  return combined.length > 0 ? combined : undefined;
}

/**
 * Deterministic per-candidate FACT SHEET (`plan.md` Phase 2 design) — facts
 * only, computed by code, never a creative judgment. Reuses
 * `findPositionAnchorIssues` (item C) and the provider-aware video prompt
 * budget (item E) so
 * the judge's facts and the generator's own compliance checks can never
 * silently disagree with each other. Takes the caller's own
 * `hasEstablishedCharacters` signal and threads it straight into
 * `findPositionAnchorIssues` (never re-derives it), so a solo/no-established-
 * character candidate — where `frame_analysis` is legitimately optional —
 * never gets a false `positionAnchorIssueCount` defect from a missing
 * `frame_analysis` the skill was never asked to return.
 */
interface VdVideoPromptCandidateFactSheet {
  chars: number;
  overCap: boolean;
  musicTermHits: string[];
  /** `null` when the candidate's family isn't `veo` (fact not applicable). */
  veoSubtitleGuardPresent: boolean | null;
  /** One entry per required dialogue line — `occurrences` 0 (missing), 1 (correct), or >1 (duplicated). */
  perLineVerbatimCoverage: Array<{ lineTh: string; occurrences: number }>;
  positionAnchorIssueCount: number;
  positionAnchorIssues: string[];
  /** Reused from the candidate result; never recomputed here. */
  effectiveRisk?: VdIdentityRisk;
  /** Only people carrying at least one observability field are included. */
  faceObservability?: Array<{
    name: string;
    facing?: string;
    eyesVisible?: string;
    occlusion?: string;
    faceSize?: string;
    overlappedByOtherFace?: boolean;
  }>;
  /** Mirror of frame_analysis.facesSeparated; omitted when unavailable. */
  facesSeparated?: boolean;
}

const MUSIC_TERM_REGEX = /\b(music|soundtrack|score|melody|singing|humming|song|lyrics)\b/gi;
const VEO_SUBTITLE_GUARD_REGEX = /no subtitles|no captions|no on-screen text/i;

/** Counts every verbatim occurrence of `lineTh` in `prompt` (whitespace-tolerant) — reuses the same escaped-token-regex technique as `findQuotedLineStartIndex`/`appendMissingDialogueVerbatim`, but counts ALL matches (duplication detection) instead of just the first. */
function countVerbatimOccurrences(prompt: string, lineTh: string): number {
  const tokens = lineTh.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const pattern = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const matches = prompt.match(new RegExp(pattern, "gu"));
  return matches ? matches.length : 0;
}

function buildCandidateFactSheet(
  data: {
    prompt: string;
    audioDirection?: string;
    frameAnalysis?: VdFrameAnalysis;
    motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
  },
  requiredDialogue: Array<{ lineTh: string; characterKey?: string; speakerName?: string }>,
  family: VideoPromptModelFamily,
  /**
   * Same "established portrait attached" signal the generator itself computes
   * (`hasEstablishedCharacters`) — threaded through so the fact sheet's
   * `positionAnchorIssueCount` never flags a missing `frame_analysis` for a
   * shot where the skill was never asked to return one (no portrait/start-frame
   * vision bundle). See `findPositionAnchorIssues`'s doc comment.
   */
  hasEstablishedCharacters: boolean,
  barrierMultiView?: VerticalDramaBarrierMultiView,
  verifiedCastPositions?: readonly VerticalDramaVerifiedCastPosition[],
  characterDescriptionOverrides?: VerticalDramaCharacterDescriptionOverrides,
  promptMaxChars: number = VD_VIDEO_PROMPT_MAX,
): VdVideoPromptCandidateFactSheet {
  const chars = data.prompt.length;
  const musicHaystack = `${data.prompt} ${data.audioDirection ?? ""}`;
  const musicTermHits = Array.from(
    new Set((musicHaystack.match(MUSIC_TERM_REGEX) ?? []).map(m => m.toLowerCase())),
  );
  const positionAnchorIssues = findPositionAnchorIssues(
    { prompt: data.prompt, frame_analysis: data.frameAnalysis as ShotVideoPromptOutput["frame_analysis"] },
    requiredDialogue,
    hasEstablishedCharacters,
    barrierMultiView,
    verifiedCastPositions,
    characterDescriptionOverrides,
  );
  const faceObservability = data.frameAnalysis?.people
    .filter(person =>
      person.facing !== undefined ||
      person.eyesVisible !== undefined ||
      person.occlusion !== undefined ||
      person.faceSize !== undefined ||
      person.overlappedByOtherFace !== undefined
    )
    .map(person => ({
      name: person.name,
      ...(person.facing !== undefined ? { facing: person.facing } : {}),
      ...(person.eyesVisible !== undefined ? { eyesVisible: person.eyesVisible } : {}),
      ...(person.occlusion !== undefined ? { occlusion: person.occlusion } : {}),
      ...(person.faceSize !== undefined ? { faceSize: person.faceSize } : {}),
      ...(person.overlappedByOtherFace !== undefined
        ? { overlappedByOtherFace: person.overlappedByOtherFace }
        : {}),
    }));
  return {
    chars,
    overCap: chars > promptMaxChars,
    musicTermHits,
    veoSubtitleGuardPresent: family === "veo" ? VEO_SUBTITLE_GUARD_REGEX.test(data.prompt) : null,
    perLineVerbatimCoverage: requiredDialogue.map(line => ({
      lineTh: line.lineTh,
      occurrences: countVerbatimOccurrences(data.prompt, line.lineTh),
    })),
    positionAnchorIssueCount: positionAnchorIssues.length,
    positionAnchorIssues,
    ...(data.motionProfile ? { effectiveRisk: data.motionProfile.effectiveRisk } : {}),
    ...(faceObservability?.length ? { faceObservability } : {}),
    ...(data.frameAnalysis?.facesSeparated !== undefined
      ? { facesSeparated: data.frameAnalysis.facesSeparated }
      : {}),
  };
}

/**
 * MECHANICAL winner-vs-repaired comparison (`plan.md` Phase 2 design) — used
 * ONLY after a `repair` verdict, never for the initial A-vs-B pick (that's
 * the judge's job). Priority order, exactly as specified: (1) over-cap flag
 * — not-over-cap wins; (2) required-line verbatim coverage — more lines with
 * EXACTLY 1 occurrence wins; (3) position-anchor issue count — fewer wins;
 * tie at every step falls through to the next, and a full tie favors the
 * repaired candidate (`"b"`). No LLM call, no creative judgment.
 */
function pickBetterCandidateByHardFacts(
  original: VdVideoPromptCandidateFactSheet,
  repaired: VdVideoPromptCandidateFactSheet,
): "a" | "b" {
  if (original.overCap !== repaired.overCap) return original.overCap ? "b" : "a";
  const coverageScore = (sheet: VdVideoPromptCandidateFactSheet) =>
    sheet.perLineVerbatimCoverage.filter(l => l.occurrences === 1).length;
  const originalCoverage = coverageScore(original);
  const repairedCoverage = coverageScore(repaired);
  if (originalCoverage !== repairedCoverage) return originalCoverage > repairedCoverage ? "a" : "b";
  if (original.positionAnchorIssueCount !== repaired.positionAnchorIssueCount) {
    return original.positionAnchorIssueCount < repaired.positionAnchorIssueCount ? "a" : "b";
  }
  return "b";
}

/**
 * Shared judge user-prompt builder — used by BOTH the non-split and
 * speaker-switch judged orchestrators below. `extraFacts` carries the
 * speaker-switch path's timed-segment facts (see
 * `buildJudgeTimedSegmentFacts`); `undefined`/omitted for the non-split
 * path.
 */
function buildJudgeUserPrompt(args: {
  shotNumber: number;
  shotDurationSeconds?: number;
  beatText: string;
  cameraSetup?: string;
  characterIdentityMap?: string;
  requiredDialogue: Array<{ lineTh: string; characterKey?: string; speakerName?: string; emotion?: string }>;
  targetVideoModelFactBlock: string;
  barrierMultiView?: VerticalDramaBarrierMultiView;
  extraFacts?: string;
  candidates: Array<{
    prompt: string;
    negativeMotionPrompt?: string;
    dialogue?: Array<{ characterKey?: string; lineTh: string; emotion?: string }>;
    frameAnalysis?: {
      people?: Array<{ name: string; position: string; viewRole?: VdFrameViewRole }>;
      positionSource?: string;
    };
    motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
    factSheet: VdVideoPromptCandidateFactSheet;
  }>;
}): string {
  const dialogueBlock = args.requiredDialogue.length
    ? args.requiredDialogue
        .map((l, i) => {
          const speaker = l.speakerName ?? l.characterKey ?? "character";
          const parts = [`${i + 1}. ${speaker}: "${l.lineTh}"`];
          if (l.emotion) parts.push(`emotion: ${l.emotion}`);
          return parts.join(" | ");
        })
        .join("\n")
    : "(no required source dialogue for this shot)";

  const candidateBlocks = args.candidates
    .map((c, i) =>
      [
        `CANDIDATE ${i}:`,
        `prompt: ${JSON.stringify(c.prompt)}`,
        `negative_motion_prompt: ${JSON.stringify(c.negativeMotionPrompt ?? "")}`,
        `dialogue: ${JSON.stringify(c.dialogue ?? [])}`,
        `frame_analysis: ${JSON.stringify(c.frameAnalysis ?? null)}`,
        c.motionProfile ? `motion_profile: ${JSON.stringify(c.motionProfile)}` : null,
        `FACT SHEET (computed by code — trust for anything mechanical): ${JSON.stringify(c.factSheet)}`,
      ].filter((line): line is string => Boolean(line)).join("\n"),
    )
    .join("\n\n");

  return [
    `Shot number: ${args.shotNumber}`,
    typeof args.shotDurationSeconds === "number" ? `Clip duration: ${args.shotDurationSeconds}s` : null,
    `AUTHORITATIVE SHOT BEAT: ${args.beatText}`,
    args.cameraSetup ? `Camera setup: ${args.cameraSetup}` : null,
    args.characterIdentityMap ?? null,
    args.barrierMultiView
      ? renderVerticalDramaBarrierMultiViewFactBlock(args.barrierMultiView)
      : null,
    `Required dialogue lines (source of truth — verbatim wording + speaker + emotion):\n${dialogueBlock}`,
    args.extraFacts ?? null,
    args.targetVideoModelFactBlock,
    `--- CANDIDATES ---`,
    candidateBlocks,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

/** Timed-segment facts for the speaker-switch judged orchestrator — compact per-segment anchor/duration/line-count summary (the judge doesn't need the full cumulative-timestamp prose the GENERATION skill needs, just where the boundaries are). */
function buildJudgeTimedSegmentFacts(subShotWindows: SpeakerSwitchSubShotWindow[]): string {
  let cursorSeconds = 0;
  const lines = subShotWindows.map(w => {
    const startSeconds = round2(cursorSeconds);
    cursorSeconds += w.durationSeconds;
    const endSeconds = round2(cursorSeconds);
    return `Segment ${w.subShotNumber}: [${startSeconds}s, ${endSeconds}s) anchor speaker ${w.characterKey}, ${w.lineIndexes.length} line(s).`;
  });
  return `Timed segments (this shot cuts between speakers):\n${lines.join("\n")}`;
}

/**
 * Execute the judge LLM call end-to-end (credit check -> call -> deduct),
 * reusing `executeVisionAwareJsonCallWithRetry`'s existing
 * `VdSchemaValidationError`-triggered one-JSON-retry machinery (1200 first /
 * 2000 retry tokens). Vision receives the same ordered bundle used by the
 * candidate generators: Image 1, Image 2 for Dual View, then labeled grounding
 * images. The judge can therefore verify both environments, identity and
 * on-screen position instead of trusting candidate prose alone. Returns
 * `null` on ANY failure
 * (insufficient credits, LLM error, both JSON attempts invalid) so the
 * caller can fail-open to candidate A — this function NEVER throws.
 */
async function callVerticalDramaVideoPromptJudge(args: {
  userId: number;
  tenantId?: string;
  publicUrl?: string | null;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  imageUrl?: string;
  characterReferenceImages?: ShotVideoPromptCharacterReferenceImage[];
  locationReferenceImage?: { url: string; name?: string };
  barrierReferenceImage?: { url: string; name?: string };
  additionalImageUrls?: string[];
  attachShotImage?: boolean;
  idempotencyKey?: string;
  userPromptText: string;
}): Promise<{ data: JudgeOutput; creditsUsed: number; model: string } | null> {
  try {
    const hasCredits = await hasEnoughCredits(args.userId, 1);
    if (!hasCredits) throw new InsufficientCreditsError();

    const resolvedModel = await resolveShotVideoPromptModel(args.seriesId);
    const model = resolvedModel.model;
    const hasVision = args.attachShotImage === false ? false : resolvedModel.hasVision;
    const systemPrompt = loadJudgeSystemPrompt();

    const outcome = await executeVisionAwareJsonCallWithRetry<JudgeOutput>({
      model,
      systemPrompt,
      userPromptText: args.userPromptText,
      hasVision,
      images:
        args.imageUrl && args.attachShotImage !== false
          ? buildShotVideoPromptVisionImages(
              args.imageUrl,
              args.characterReferenceImages,
              args.locationReferenceImage,
              args.barrierReferenceImage,
              args.additionalImageUrls,
            )
          : [],
      userId: args.userId,
      tenantId: args.tenantId,
      publicUrl: args.publicUrl,
      schema: judgeOutputSchema,
      modelFallbackPolicy: "recommended",
      firstAttemptMaxTokens: 1200,
      retryMaxTokens: 2000,
    });

    const usage = outcome.response.usage;
    const creditsUsed = calculateCreditsForLLM(
      usage?.prompt_tokens ?? 0,
      usage?.completion_tokens ?? 0,
      model,
    );

    await deductCredits({
      userId: args.userId,
      tenantId: args.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — judge shot video prompt candidates (episode #${args.episodeId}, shot #${args.shotNumber})`,
      sourceType: "skill",
      idempotencyKey: args.idempotencyKey,
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: args.seriesId,
        episodeId: args.episodeId,
        shotNumber: args.shotNumber,
        usedVision: outcome.usedVision,
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    });

    return { data: outcome.data, creditsUsed, model };
  } catch {
    // Fail-open — the caller ships candidate A + a warning. Never throw.
    return null;
  }
}

export interface GenerateVerticalDramaShotVideoPromptQuality {
  mode: "judged" | "single";
  candidates: number;
  verdict?: "accept" | "repair";
  repaired: boolean;
}

export interface GenerateJudgedVerticalDramaShotVideoPromptParams
  extends GenerateVerticalDramaShotVideoPromptParams {
  /**
   * Judged best-of-2 quality loop opt-out (`plan.md` Phase 2) — defaults to
   * `true` (ON) for the paid per-shot generate/AI-adjust action. `false`
   * calls the plain single generator exactly once, byte-compatible with
   * Phase 1's result shape plus a `promptQuality: { mode: "single",
   * candidates: 1, repaired: false }` tag.
   */
  qualityLoop?: boolean;
}

export interface GenerateJudgedVerticalDramaShotVideoPromptResult
  extends GenerateVerticalDramaShotVideoPromptResult {
  promptQuality: GenerateVerticalDramaShotVideoPromptQuality;
}

/**
 * Judged best-of-2 quality loop wrapper around `generateVerticalDramaShotVideoPrompt`
 * (`plan.md` Phase 2) — see this section's own top-of-block doc comment for
 * the full design. `generateVerticalDramaShotVideoPrompt` itself is
 * completely untouched; this function only ever calls it (never reimplements
 * any of its generation logic).
 */
export async function generateJudgedVerticalDramaShotVideoPrompt(
  params: GenerateJudgedVerticalDramaShotVideoPromptParams,
): Promise<GenerateJudgedVerticalDramaShotVideoPromptResult> {
  if (params.qualityLoop === false) {
    const single = await generateVerticalDramaShotVideoPrompt(params);
    return { ...single, promptQuality: { mode: "single", candidates: 1, repaired: false } };
  }

  const candidateAParams: GenerateVerticalDramaShotVideoPromptParams = {
    ...params,
    idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:candidate-a` : undefined,
  };
  const candidateBParams: GenerateVerticalDramaShotVideoPromptParams = {
    ...params,
    repairInstruction: combineRepairInstructions(params.repairInstruction, VD_VIDEO_PROMPT_VARIATION_DIRECTIVE),
    idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:candidate-b` : undefined,
  };

  const [settledA, settledB] = await Promise.allSettled([
    generateVerticalDramaShotVideoPrompt(candidateAParams),
    generateVerticalDramaShotVideoPrompt(candidateBParams),
  ]);

  if (settledA.status === "rejected" && settledB.status === "rejected") {
    throw settledA.reason;
  }
  if (settledA.status === "rejected" || settledB.status === "rejected") {
    const survivor = (
      settledA.status === "fulfilled" ? settledA : (settledB as PromiseFulfilledResult<GenerateVerticalDramaShotVideoPromptResult>)
    ).value;
    return {
      ...survivor,
      warnings: appendWarnings(survivor.warnings, [
        `Shot ${params.shotNumber}: quality loop — one candidate failed to generate; shipped the survivor without judging.`,
      ]),
      promptQuality: { mode: "single", candidates: 1, repaired: false },
    };
  }

  const candidateA = settledA.value;
  const candidateB = settledB.value;
  const candidates = [candidateA, candidateB];

  const requiredDialogue = params.shotContext.beatIsSilent ? [] : (params.shotContext.dialogueLines ?? []);
  const capabilities = resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
    type: params.selectedVideoModel.type,
    aspectRatios: params.selectedVideoModel.aspectRatios,
    configJson: params.selectedVideoModel.configJson,
  });
  const family = resolveShotVideoPromptModelFamily(params.selectedVideoModelId, params.selectedVideoModel);
  const videoPromptMaxChars = resolveVdVideoPromptBudgetForCatalogModel({
    provider: params.selectedVideoModel.provider,
    configJson: params.selectedVideoModel.configJson,
  });
  const hasEstablishedCharacters = (params.characterReferenceImages?.length ?? 0) >= 1;
  const motionContractsEnabled = params.motionContractsEnabled === true;
  const frameAnalysisRequested =
    (params.characterReferenceImages?.length ?? 0) >= 1;
  const frameObservabilityRequested = motionContractsEnabled && frameAnalysisRequested;
  const targetVideoModelFactBlock = buildTargetVideoModelFactBlock({
    family,
    modelId: params.selectedVideoModelId,
    modelName: params.selectedVideoModel.name,
    maxReferenceImages: capabilities.maxReferenceImages,
    frameAnalysisRequested,
    frameObservabilityRequested,
    motionContractsEnabled,
    genre: params.shotContext.genre,
    establishedCharacterCount: params.characterReferenceImages?.length,
    supportingPresence: params.shotContext.supportingPresence,
  });

  const factSheetA = buildCandidateFactSheet(
    { prompt: candidateA.prompt, audioDirection: candidateA.audioDirection, frameAnalysis: candidateA.frameAnalysis, motionProfile: candidateA.motionProfile },
    requiredDialogue,
    family,
    hasEstablishedCharacters,
    params.shotContext.barrierMultiView,
    params.verifiedCastPositions,
    params.characterDescriptionOverrides,
    videoPromptMaxChars,
  );
  const factSheetB = buildCandidateFactSheet(
    { prompt: candidateB.prompt, audioDirection: candidateB.audioDirection, frameAnalysis: candidateB.frameAnalysis, motionProfile: candidateB.motionProfile },
    requiredDialogue,
    family,
    hasEstablishedCharacters,
    params.shotContext.barrierMultiView,
    params.verifiedCastPositions,
    params.characterDescriptionOverrides,
    videoPromptMaxChars,
  );

  const judgeUserPromptText = buildJudgeUserPrompt({
    shotNumber: params.shotNumber,
    shotDurationSeconds: params.shotDurationSeconds,
    beatText:
      params.shotContext.canonicalShotSummary?.trim() || params.shotContext.description || "(no beat/description supplied)",
    cameraSetup: params.shotContext.camera,
    characterIdentityMap: params.shotContext.characterIdentityMap,
    requiredDialogue,
    targetVideoModelFactBlock,
    barrierMultiView: params.shotContext.barrierMultiView,
    candidates: [
      {
        prompt: candidateA.prompt,
        negativeMotionPrompt: candidateA.negativeMotionPrompt,
        dialogue: candidateA.dialogue,
        frameAnalysis: candidateA.frameAnalysis,
        motionProfile: candidateA.motionProfile,
        factSheet: factSheetA,
      },
      {
        prompt: candidateB.prompt,
        negativeMotionPrompt: candidateB.negativeMotionPrompt,
        dialogue: candidateB.dialogue,
        frameAnalysis: candidateB.frameAnalysis,
        motionProfile: candidateB.motionProfile,
        factSheet: factSheetB,
      },
    ],
  });

  const judgeOutcome = await callVerticalDramaVideoPromptJudge({
    userId: params.userId,
    tenantId: params.tenantId,
    publicUrl: params.publicUrl,
    seriesId: params.seriesId,
    episodeId: params.episodeId,
    shotNumber: params.shotNumber,
    imageUrl: params.imageUrl,
    characterReferenceImages: params.characterReferenceImages,
    locationReferenceImage: params.locationReferenceImage,
    barrierReferenceImage: params.barrierReferenceImage,
    additionalImageUrls: params.additionalImageUrls,
    attachShotImage: params.attachShotImage,
    idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:judge` : undefined,
    userPromptText: judgeUserPromptText,
  });

  if (!judgeOutcome) {
    const fallbackCandidate =
      motionContractsEnabled
        ? candidates.find(candidate => candidate.motionContractStatus === "emitted") ?? candidateA
        : candidateA;
    const fallbackWarning =
      fallbackCandidate === candidateA
        ? `Shot ${params.shotNumber}: quality-loop judge unavailable — shipped candidate A without judging.`
        : `Shot ${params.shotNumber}: quality-loop judge unavailable — shipped the contract-compliant fallback candidate without judging.`;
    return {
      ...fallbackCandidate,
      creditsUsed: candidateA.creditsUsed + candidateB.creditsUsed,
      warnings: appendWarnings(fallbackCandidate.warnings, [fallbackWarning]),
      promptQuality: { mode: "judged", candidates: 2, repaired: false },
    };
  }

  const judgedWinnerIndex = Math.round(judgeOutcome.data.winner_index) === 1 ? 1 : 0;
  const emittedCandidateIndex = motionContractsEnabled
    ? candidates.findIndex(candidate => candidate.motionContractStatus === "emitted")
    : -1;
  const winnerIndex =
    emittedCandidateIndex >= 0 && candidates[judgedWinnerIndex].motionContractStatus !== "emitted"
      ? emittedCandidateIndex
      : judgedWinnerIndex;
  const winner = candidates[winnerIndex];
  const winnerFactSheet = winnerIndex === 0 ? factSheetA : factSheetB;
  const normalizedVerdict: "accept" | "repair" =
    judgeOutcome.data.verdict?.trim().toLowerCase() === "repair" ? "repair" : "accept";
  const totalCreditsAfterJudge = candidateA.creditsUsed + candidateB.creditsUsed + judgeOutcome.creditsUsed;

  if (normalizedVerdict === "accept") {
    return {
      ...winner,
      creditsUsed: totalCreditsAfterJudge,
      promptQuality: { mode: "judged", candidates: 2, verdict: "accept", repaired: false },
    };
  }

  // verdict === "repair" — ONE repair regeneration of the winner, then a
  // MECHANICAL (never LLM) hard-fact comparison decides winner vs repaired.
  let repairedResult: GenerateVerticalDramaShotVideoPromptResult | null = null;
  try {
    repairedResult = await generateVerticalDramaShotVideoPrompt({
      ...params,
      repairInstruction: combineRepairInstructions(params.repairInstruction, judgeOutcome.data.repair_instruction),
      idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:repair` : undefined,
    });
  } catch {
    repairedResult = null;
  }

  if (!repairedResult) {
    return {
      ...winner,
      creditsUsed: totalCreditsAfterJudge,
      warnings: appendWarnings(winner.warnings, [
        `Shot ${params.shotNumber}: quality-loop repair attempt failed — shipped the judge's winning candidate as-is.`,
      ]),
      promptQuality: { mode: "judged", candidates: 2, verdict: "repair", repaired: false },
    };
  }

  const totalCreditsAfterRepair = totalCreditsAfterJudge + repairedResult.creditsUsed;
  const repairedFactSheet = buildCandidateFactSheet(
    { prompt: repairedResult.prompt, audioDirection: repairedResult.audioDirection, frameAnalysis: repairedResult.frameAnalysis, motionProfile: repairedResult.motionProfile },
    requiredDialogue,
    family,
    hasEstablishedCharacters,
    params.shotContext.barrierMultiView,
    params.verifiedCastPositions,
    params.characterDescriptionOverrides,
    videoPromptMaxChars,
  );

  const repairedImprovesContract =
    motionContractsEnabled &&
    repairedResult.motionContractStatus === "emitted" &&
    winner.motionContractStatus !== "emitted";
  const repairedDegradesContract =
    motionContractsEnabled &&
    winner.motionContractStatus === "emitted" &&
    repairedResult.motionContractStatus !== "emitted";
  if (
    repairedImprovesContract ||
    (!repairedDegradesContract &&
      pickBetterCandidateByHardFacts(winnerFactSheet, repairedFactSheet) === "b")
  ) {
    return {
      ...repairedResult,
      creditsUsed: totalCreditsAfterRepair,
      promptQuality: { mode: "judged", candidates: 2, verdict: "repair", repaired: true },
    };
  }

  return {
    ...winner,
    creditsUsed: totalCreditsAfterRepair,
    warnings: appendWarnings(winner.warnings, [
      `Shot ${params.shotNumber}: quality-loop repair did not improve on hard facts (cap/coverage/position-anchor) — shipped the original winner instead.`,
    ]),
    promptQuality: { mode: "judged", candidates: 2, verdict: "repair", repaired: false },
  };
}

export interface GenerateJudgedVerticalDramaShotVideoPromptSpeakerSwitchParams
  extends GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams {
  /** Same opt-out as `GenerateJudgedVerticalDramaShotVideoPromptParams.qualityLoop`. */
  qualityLoop?: boolean;
}

export interface GenerateJudgedVerticalDramaShotVideoPromptSpeakerSwitchResult
  extends GenerateVerticalDramaShotVideoPromptSpeakerSwitchResult {
  promptQuality: GenerateVerticalDramaShotVideoPromptQuality;
}

/**
 * Judged best-of-2 quality loop wrapper around
 * `generateVerticalDramaShotVideoPromptSpeakerSwitch` — sibling to
 * `generateJudgedVerticalDramaShotVideoPrompt` above (same design, see that
 * function's doc comment); the only differences are the underlying
 * generator, its distinct result shape (`dialogue`/`durationSeconds`/
 * `distinctSpeakerCharacterKeys`), and the extra timed-segment facts in the
 * judge's user prompt (`buildJudgeTimedSegmentFacts`).
 */
export async function generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch(
  params: GenerateJudgedVerticalDramaShotVideoPromptSpeakerSwitchParams,
): Promise<GenerateJudgedVerticalDramaShotVideoPromptSpeakerSwitchResult> {
  if (params.qualityLoop === false) {
    const single = await generateVerticalDramaShotVideoPromptSpeakerSwitch(params);
    return { ...single, promptQuality: { mode: "single", candidates: 1, repaired: false } };
  }

  const candidateAParams: GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams = {
    ...params,
    idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:candidate-a` : undefined,
  };
  const candidateBParams: GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams = {
    ...params,
    repairInstruction: combineRepairInstructions(params.repairInstruction, VD_VIDEO_PROMPT_VARIATION_DIRECTIVE),
    idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:candidate-b` : undefined,
  };

  const [settledA, settledB] = await Promise.allSettled([
    generateVerticalDramaShotVideoPromptSpeakerSwitch(candidateAParams),
    generateVerticalDramaShotVideoPromptSpeakerSwitch(candidateBParams),
  ]);

  if (settledA.status === "rejected" && settledB.status === "rejected") {
    throw settledA.reason;
  }
  if (settledA.status === "rejected" || settledB.status === "rejected") {
    const survivor = (
      settledA.status === "fulfilled"
        ? settledA
        : (settledB as PromiseFulfilledResult<GenerateVerticalDramaShotVideoPromptSpeakerSwitchResult>)
    ).value;
    return {
      ...survivor,
      warnings: appendWarnings(survivor.warnings, [
        `Shot ${params.shotNumber}: quality loop — one candidate failed to generate; shipped the survivor without judging.`,
      ]),
      promptQuality: { mode: "single", candidates: 1, repaired: false },
    };
  }

  const candidateA = settledA.value;
  const candidateB = settledB.value;
  const candidates = [candidateA, candidateB];

  const requiredDialogue = params.shotContext.beatIsSilent ? [] : (params.shotContext.dialogueLines ?? []);
  const capabilities = resolveVerticalDramaCapabilities(params.selectedVideoModelId, {
    type: params.selectedVideoModel.type,
    aspectRatios: params.selectedVideoModel.aspectRatios,
    configJson: params.selectedVideoModel.configJson,
  });
  const family = resolveShotVideoPromptModelFamily(params.selectedVideoModelId, params.selectedVideoModel);
  const videoPromptMaxChars = resolveVdVideoPromptBudgetForCatalogModel({
    provider: params.selectedVideoModel.provider,
    configJson: params.selectedVideoModel.configJson,
  });
  const hasEstablishedCharacters = (params.characterReferenceImages?.length ?? 0) >= 1;
  const motionContractsEnabled = params.motionContractsEnabled === true;
  const frameAnalysisRequested =
    (params.characterReferenceImages?.length ?? 0) >= 1;
  const frameObservabilityRequested = motionContractsEnabled && frameAnalysisRequested;
  const targetVideoModelFactBlock = buildTargetVideoModelFactBlock({
    family,
    modelId: params.selectedVideoModelId,
    modelName: params.selectedVideoModel.name,
    maxReferenceImages: capabilities.maxReferenceImages,
    frameAnalysisRequested,
    frameObservabilityRequested,
    motionContractsEnabled,
    genre: params.shotContext.genre,
    establishedCharacterCount: params.characterReferenceImages?.length,
    supportingPresence: params.shotContext.supportingPresence,
  });

  const factSheetA = buildCandidateFactSheet(
    { prompt: candidateA.prompt, audioDirection: candidateA.audioDirection, frameAnalysis: candidateA.frameAnalysis, motionProfile: candidateA.motionProfile },
    requiredDialogue,
    family,
    hasEstablishedCharacters,
    params.shotContext.barrierMultiView,
    params.verifiedCastPositions,
    params.characterDescriptionOverrides,
    videoPromptMaxChars,
  );
  const factSheetB = buildCandidateFactSheet(
    { prompt: candidateB.prompt, audioDirection: candidateB.audioDirection, frameAnalysis: candidateB.frameAnalysis, motionProfile: candidateB.motionProfile },
    requiredDialogue,
    family,
    hasEstablishedCharacters,
    params.shotContext.barrierMultiView,
    params.verifiedCastPositions,
    params.characterDescriptionOverrides,
    videoPromptMaxChars,
  );

  const judgeUserPromptText = buildJudgeUserPrompt({
    shotNumber: params.shotNumber,
    shotDurationSeconds: params.shotDurationSeconds,
    beatText:
      params.shotContext.canonicalShotSummary?.trim() || params.shotContext.description || "(no beat/description supplied)",
    cameraSetup: params.shotContext.camera,
    characterIdentityMap: params.shotContext.characterIdentityMap,
    requiredDialogue,
    targetVideoModelFactBlock,
    barrierMultiView: params.shotContext.barrierMultiView,
    extraFacts: buildJudgeTimedSegmentFacts(params.subShotWindows),
    candidates: [
      {
        prompt: candidateA.prompt,
        negativeMotionPrompt: candidateA.negativeMotionPrompt,
        dialogue: candidateA.dialogue,
        frameAnalysis: candidateA.frameAnalysis,
        motionProfile: candidateA.motionProfile,
        factSheet: factSheetA,
      },
      {
        prompt: candidateB.prompt,
        negativeMotionPrompt: candidateB.negativeMotionPrompt,
        dialogue: candidateB.dialogue,
        frameAnalysis: candidateB.frameAnalysis,
        motionProfile: candidateB.motionProfile,
        factSheet: factSheetB,
      },
    ],
  });

  const judgeOutcome = await callVerticalDramaVideoPromptJudge({
    userId: params.userId,
    tenantId: params.tenantId,
    publicUrl: params.publicUrl,
    seriesId: params.seriesId,
    episodeId: params.episodeId,
    shotNumber: params.shotNumber,
    imageUrl: params.imageUrl,
    characterReferenceImages: params.characterReferenceImages,
    locationReferenceImage: params.locationReferenceImage,
    barrierReferenceImage: params.barrierReferenceImage,
    additionalImageUrls: params.additionalImageUrls,
    attachShotImage: params.attachShotImage,
    idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:judge` : undefined,
    userPromptText: judgeUserPromptText,
  });

  if (!judgeOutcome) {
    const fallbackCandidate =
      motionContractsEnabled
        ? candidates.find(candidate => candidate.motionContractStatus === "emitted") ?? candidateA
        : candidateA;
    const fallbackWarning =
      fallbackCandidate === candidateA
        ? `Shot ${params.shotNumber}: quality-loop judge unavailable — shipped candidate A without judging.`
        : `Shot ${params.shotNumber}: quality-loop judge unavailable — shipped the contract-compliant fallback candidate without judging.`;
    return {
      ...fallbackCandidate,
      creditsUsed: candidateA.creditsUsed + candidateB.creditsUsed,
      warnings: appendWarnings(fallbackCandidate.warnings, [fallbackWarning]),
      promptQuality: { mode: "judged", candidates: 2, repaired: false },
    };
  }

  const judgedWinnerIndex = Math.round(judgeOutcome.data.winner_index) === 1 ? 1 : 0;
  const emittedCandidateIndex = motionContractsEnabled
    ? candidates.findIndex(candidate => candidate.motionContractStatus === "emitted")
    : -1;
  const winnerIndex =
    emittedCandidateIndex >= 0 && candidates[judgedWinnerIndex].motionContractStatus !== "emitted"
      ? emittedCandidateIndex
      : judgedWinnerIndex;
  const winner = candidates[winnerIndex];
  const winnerFactSheet = winnerIndex === 0 ? factSheetA : factSheetB;
  const normalizedVerdict: "accept" | "repair" =
    judgeOutcome.data.verdict?.trim().toLowerCase() === "repair" ? "repair" : "accept";
  const totalCreditsAfterJudge = candidateA.creditsUsed + candidateB.creditsUsed + judgeOutcome.creditsUsed;

  if (normalizedVerdict === "accept") {
    return {
      ...winner,
      creditsUsed: totalCreditsAfterJudge,
      promptQuality: { mode: "judged", candidates: 2, verdict: "accept", repaired: false },
    };
  }

  let repairedResult: GenerateVerticalDramaShotVideoPromptSpeakerSwitchResult | null = null;
  try {
    repairedResult = await generateVerticalDramaShotVideoPromptSpeakerSwitch({
      ...params,
      repairInstruction: combineRepairInstructions(params.repairInstruction, judgeOutcome.data.repair_instruction),
      idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:repair` : undefined,
    });
  } catch {
    repairedResult = null;
  }

  if (!repairedResult) {
    return {
      ...winner,
      creditsUsed: totalCreditsAfterJudge,
      warnings: appendWarnings(winner.warnings, [
        `Shot ${params.shotNumber}: quality-loop repair attempt failed — shipped the judge's winning candidate as-is.`,
      ]),
      promptQuality: { mode: "judged", candidates: 2, verdict: "repair", repaired: false },
    };
  }

  const totalCreditsAfterRepair = totalCreditsAfterJudge + repairedResult.creditsUsed;
  const repairedFactSheet = buildCandidateFactSheet(
    { prompt: repairedResult.prompt, audioDirection: repairedResult.audioDirection, frameAnalysis: repairedResult.frameAnalysis, motionProfile: repairedResult.motionProfile },
    requiredDialogue,
    family,
    hasEstablishedCharacters,
    params.shotContext.barrierMultiView,
    params.verifiedCastPositions,
    params.characterDescriptionOverrides,
    videoPromptMaxChars,
  );

  const repairedImprovesContract =
    motionContractsEnabled &&
    repairedResult.motionContractStatus === "emitted" &&
    winner.motionContractStatus !== "emitted";
  const repairedDegradesContract =
    motionContractsEnabled &&
    winner.motionContractStatus === "emitted" &&
    repairedResult.motionContractStatus !== "emitted";
  if (
    repairedImprovesContract ||
    (!repairedDegradesContract &&
      pickBetterCandidateByHardFacts(winnerFactSheet, repairedFactSheet) === "b")
  ) {
    return {
      ...repairedResult,
      creditsUsed: totalCreditsAfterRepair,
      promptQuality: { mode: "judged", candidates: 2, verdict: "repair", repaired: true },
    };
  }

  return {
    ...winner,
    creditsUsed: totalCreditsAfterRepair,
    warnings: appendWarnings(winner.warnings, [
      `Shot ${params.shotNumber}: quality-loop repair did not improve on hard facts (cap/coverage/position-anchor) — shipped the original winner instead.`,
    ]),
    promptQuality: { mode: "judged", candidates: 2, verdict: "repair", repaired: false },
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
