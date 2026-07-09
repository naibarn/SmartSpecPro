/**
 * Vertical Drama Series — real episode-script generation for the
 * `plan_episode_script` pipeline stage (spec feature 131 §11.5).
 *
 * Invokes the already-installed `vertical-drama-script-builder` skill
 * (`apps/web/skills/vertical-drama-script-builder/`) via a direct
 * `executeWithFallback` LLM call — mirrors
 * `verticalDramaStoryboardGeneration.ts`'s check-credits -> resolve-model ->
 * call -> validate -> deduct-credits convention exactly (same skill-loading
 * helper shape, same error classes reused from `verticalDramaStoryBible.ts`).
 *
 * Before this file existed, `plan_episode_script` had NO real-generation path
 * at all — `buildStagePayload`'s placeholder ("Dry-run hook" / camelCase
 * `episodeTitle`/`sceneDialogueSummary`/etc., not even matching the skill's
 * real snake_case output shape) was returned unconditionally for every
 * runner mode. `verticalDramaEpisodePipeline.ts`'s `runStage` is the only
 * caller, and only invokes this for non-dry-run/non-plan-only modes.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import {
  verticalDramaLocaleEnglishName,
  VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
// Story-density reform (spec §7.7, section-13, added 2026-07-07) — imported
// DIRECTLY from the submodule (not the shared barrel), per section-13: these
// are the ONE canonical content-budget contracts and the ONE canonical
// speech-budget module. Never re-declare a rate/ratio/type from either.
import {
  derivePerShotSpeechBudgets,
  type VerticalDramaEpisodeContentBudget,
  // Task #31 (tie-in defer -> real arc re-plan proposal, spec §7.7.2/§7.7.3,
  // added 2026-07-09) — the season-plan tie-in decision type, see
  // `GenerateEpisodeScriptParams.episodeTieInPlacement`'s doc comment.
  type VerticalDramaEpisodeTieInPlacement,
} from "@shared/verticalDramaSeries/contentBudget";
import {
  MIN_EPISODE_COVERAGE_RATIO,
  ERROR_EPISODE_COVERAGE_RATIO,
  estimateVerticalDramaSpeechSeconds,
} from "@shared/verticalDramaSeries/dialogueQuality";
import {
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
  // Deep story drafts hydration (W10-B, added 2026-07-08) — TYPE-ONLY (erased
  // at compile time, zero runtime import), safe regardless of any test's
  // mocking of this module: this file already has a REAL, static VALUE
  // dependency on `verticalDramaStoryBible.ts` (the imports above), so its
  // transitive chain is already loaded by every test of this file.
  type VdDeepDraftShotDraft,
} from "./verticalDramaStoryBible";

export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-script-builder");

let cachedSystemPrompt: string | null = null;

/** Mirrors `verticalDramaStoryboardGeneration.ts`'s `loadSkillSystemPrompt`. */
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
    `Could not locate skill.md for "vertical-drama-script-builder" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — mirrors schemas/output.schema.json's REQUIRED fields        */
/* -------------------------------------------------------------------------- */

/**
 * Optional narrative-quality superset (Phase 3B) — a beat MAY carry a
 * `power_shift` (who has the advantage before/after, and how it changed),
 * an `is_reversal` marker, and an `intensity` 1-10 rating for the escalation
 * curve. All optional so scripts generated before this rule existed (and any
 * fixture/test payload that omits them) still validate unchanged.
 */
const scriptBeatPowerShiftSchema = z
  .object({
    holder_before: z.string().optional(),
    holder_after: z.string().optional(),
    how: z.string().optional(),
  })
  .passthrough();

/**
 * A single dialogue-complete line within a beat (spec §7.7.2 Layer 2,
 * section-13, added 2026-07-07) — matches the shipped
 * `vertical-drama-script-builder` skill's `schemas/output.schema.json`
 * `dialogue_lines[]` item shape exactly (`speaker`/`line` required,
 * `delivery`/`subtext`/`estimated_speech_seconds` optional). `line` is the
 * spoken text sized by the canonical `estimateVerticalDramaSpeechSeconds`
 * estimator — never a second speech-rate model (spec §7.7.1 hard rule 1).
 */
const scriptDialogueLineSchema = z
  .object({
    speaker: z.string(),
    line: z.string(),
    delivery: z.string().optional(),
    subtext: z.string().optional(),
    estimated_speech_seconds: z.number().nonnegative().optional(),
  })
  .passthrough();

const scriptBeatSchema = z
  .object({
    beat: z.number().optional(),
    summary: z.string().optional(),
    power_shift: scriptBeatPowerShiftSchema.optional(),
    is_reversal: z.boolean().optional(),
    intensity: z.number().int().min(1).max(10).optional(),
    /**
     * Story-density reform (spec §7.7.2 Layer 2, section-13, added
     * 2026-07-07) — optional superset so scripts generated before this
     * field existed (and any fixture/test payload that omits it) still
     * validate unchanged; see `scriptDialogueLineSchema` above.
     */
    dialogue_lines: z.array(scriptDialogueLineSchema).optional(),
    /**
     * Beat-level total estimated speech seconds — sum of this beat's
     * `dialogue_lines[].estimated_speech_seconds` per the skill's own
     * convention; optional superset, same rationale as `dialogue_lines`.
     */
    estimated_speech_seconds: z.number().nonnegative().optional(),
  })
  .passthrough();

const scriptStructureSchema = z
  .object({
    mode: z.string().optional(),
    acts: z.array(z.object({}).passthrough()).optional(),
    beats: z.array(scriptBeatSchema).optional(),
  })
  .passthrough();

/** Optional per-character emotional arc (Phase 3B narrative-quality superset). */
const characterEmotionalArcSchema = z
  .object({
    character_id: z.string().optional(),
    start_emotion: z.string().optional(),
    turning_beat: z.number().optional(),
    end_emotion: z.string().optional(),
  })
  .passthrough();

export const scriptBuilderOutputSchema = z
  .object({
    contract_version: z.literal(1),
    episode_title: z.string().min(1),
    hook: z.string().min(1),
    structure: scriptStructureSchema,
    scene_dialogue_summary: z.array(z.object({}).passthrough()),
    cliffhanger: z.string(),
    character_state_deltas: z.array(z.object({}).passthrough()),
    product_tie_in_plan: z.object({}).passthrough(),
    continuity_notes: z.array(z.string()),
    warnings: z.array(z.object({}).passthrough()),
    repair_queue: z.array(z.object({}).passthrough()),
    /** Optional narrative-quality superset — see skill.md §Narrative grammar. */
    character_emotional_arcs: z.array(characterEmotionalArcSchema).optional(),
  })
  .passthrough();

export type ScriptBuilderOutput = z.infer<typeof scriptBuilderOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface GenerateEpisodeScriptParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  episodeNumber: number;
  locale: VerticalDramaSeriesLocale;
  durationSeconds: number;
  storySource: {
    logline?: string;
    keyBeats?: string[];
    mainPlot?: string;
    seasonArc?: string;
    tone?: string;
  };
  characters: Array<{
    characterId: string;
    name: string;
    role: string | null;
  }>;
  /**
   * Series long-memory retrieval bundle (spec §7.6), built by
   * `VerticalDramaSeriesMemoryService.buildEpisodeMemoryBundle`. Optional so
   * callers/tests that predate this field (or a series with no memory yet)
   * still work unchanged — when present, it is rendered into the LLM user
   * payload under the `memory_state` key, matching the key name the
   * `vertical-drama-script-builder` skill's brief ("... prior recap, memory
   * state, character roster ...") expects.
   */
  memoryBundle?: unknown;
  /**
   * Product tie-in policy (spec §13) — when the series has tie-in enabled,
   * this is rendered into the prompt under the `product_tie_in_policy` key
   * (matching the skill's `schemas/input.schema.json`) with an EXPLICIT
   * instruction to emit a structured, shot-numbered placement in
   * `product_tie_in_plan.tie_ins[]` (previously this key was never sent at
   * all, so the LLM had no product to weave in and always emitted the empty
   * `{ tie_ins: [], note: "no product this episode" }` placeholder — see
   * `verticalDramaProductTieIn.ts`'s `extractShotProductPlacements` for the
   * normalized shape this output is parsed into downstream). Absent/disabled
   * tie-in omits the section entirely, unchanged from prior behavior.
   */
  productTieIn?: {
    enabled: boolean;
    productName?: string;
    productDescription?: string;
    allowedStoryFunctions?: string[];
    forbiddenClaims?: string[];
  };
  /**
   * Season-plan tie-in decision for THIS episode (task #31, spec
   * §7.7.2/§7.7.3, added 2026-07-09) — the active breakdown item's `tieIn`
   * field, distinct from `productTieIn` above (the SERIES-level policy/
   * product identity). Optional/additive — every existing caller omits it,
   * so the prompt stays byte-identical unless a caller explicitly supplies
   * it (the `verticalDramaEpisodePipeline.ts` `plan_episode_script` call
   * site does not yet — tracked as F131Y follow-up wiring, see
   * `VD_TIE_IN_REPLAN_ROLLOUT` in `@shared/verticalDramaSeries/contentBudget`).
   * Only meaningful when `productTieIn?.enabled` is also true (a season
   * plan cannot force a product that doesn't exist at the series level).
   * Drives a 3-way branch in `buildUserPrompt` (spec §7.7.3 consumer rule):
   *   - `planned === true` -> FORCE the tie-in section (removes the "if it
   *     cannot be placed naturally, return empty tie_ins" escape hatch) and
   *     injects `benefitFocus`/`intensity` as extra guidance;
   *   - `planned === false` -> OMITS the tie-in section entirely, even
   *     though `productTieIn.enabled` is true, so the LLM never introduces
   *     one this episode;
   *   - absent (grandfather) -> today's `productTieIn?.enabled`-only
   *     behavior, byte-identical.
   */
  episodeTieInPlacement?: VerticalDramaEpisodeTieInPlacement;
  /**
   * Story-density reform inputs (spec §7.7, section-13, added 2026-07-07) —
   * additive/optional; only rendered into the prompt (as `speech_budget` /
   * `content_budget`, matching the shipped `vertical-drama-script-builder`
   * skill's `schemas/input.schema.json` key names exactly) when
   * `opts.speechBudgetEnabled` is true. Ignored entirely when the flag is
   * off/omitted, so existing callers/tests are byte-identical.
   */
  speechBudget?: {
    /**
     * Duration-profile clip durations for this episode — used ONLY to
     * derive `speech_budget.per_shot_band` via the canonical
     * `derivePerShotSpeechBudgets` (never a second speech-rate model).
     * Defaults to the shipped 8-clip bridge profile
     * (`VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.clipDurationsSeconds`,
     * `[8,8,8,8,8,8,8,4]`) when omitted — the script stage runs BEFORE
     * storyboard allocation, so the real per-episode profile may not be
     * known yet; a caller that already knows a non-default profile can
     * override it here.
     */
    clipDurationsSeconds?: number[];
    /**
     * The active breakdown item's content budget (spec §7.7.2 Layer 1),
     * rendered verbatim into the prompt's `content_budget` key. Omitted
     * (and the `content_budget` prompt section skipped) for a legacy
     * series that has not yet adopted Layer-1 planning — see
     * `verticalDramaStoryBible.ts`'s `deriveLegacyContentBudget`.
     */
    contentBudget?: VerticalDramaEpisodeContentBudget;
  };
  /**
   * Deep story drafts hydration (W10-B, spec/section-16 refine-mode, added
   * 2026-07-08) — when the episode's active breakdown item already carries
   * a vetted W10-A per-shot draft (`shotDrafts`/`cliffhanger_line`), this is
   * rendered into the prompt as `episode_draft` — see `buildUserPrompt`'s
   * `episodeDraftSection`. Optional/additive, same decoupled-payload-vs-flag
   * convention as `speechBudget` above: only rendered when BOTH this is
   * present AND `opts.episodeDraftHydrationEnabled` is true, so a caller
   * that supplies this without the flag (or omits it entirely) gets today's
   * byte-identical prompt. Hydration only changes the prompt's STARTING
   * material — the dialogue-complete output schema and the post-generation
   * coverage gate below are completely unchanged by this field (owner
   * intent: "การปรับแต่งภายหลังเป็นเพียงปรับให้คุณภาพดีขึ้น" — refine quality,
   * never skip or shortcut generation).
   */
  episodeDraft?: {
    shots: VdDeepDraftShotDraft[];
    cliffhanger_line?: string;
  };
  /**
   * Repair-mode override (added so `verticalDramaEpisodePipeline.ts`'s
   * `repairStage` can drive a REAL, targeted repair of an existing script
   * instead of the deterministic placeholder it used to always return —
   * before this field existed, `repairStage` never called this function at
   * all for ANY stage). When present, `buildUserPrompt` reframes the whole
   * prompt as a REPAIR of an already-generated script rather than a fresh
   * generation: `currentScript` (the episode's own persisted `script`
   * column) is included verbatim as the base, and `instruction` is the
   * user/loop-composed repair instruction (which, when W11.6 "Story Lock"
   * is on, already carries the execution-only hard-constraint block — see
   * `verticalDramaQualityReviewApply.ts`'s
   * `appendVerticalDramaStoryLockRepairConstraint`). The model is told to
   * apply ONLY the targeted change the instruction calls for and preserve
   * everything else. Every existing (fresh-generation) call site omits this
   * field, so the prompt it produces is byte-identical to before this field
   * existed whenever `repairContext` is absent — same decoupled-payload
   * convention as `episodeDraft`/`speechBudget` above. The post-generation
   * coverage gate and credit-check/deduct flow below are completely
   * unaffected by this field — a repair is charged and gated exactly like a
   * fresh generation.
   */
  repairContext?: {
    currentScript: Record<string, unknown>;
    instruction: string;
  };
  /**
   * Additive feature-flag bag (spec §7.7, section-13). Every flag defaults
   * to falsy/undefined, which preserves today's byte-identical prompt,
   * schema, and control flow — see section-13's "flags off" acceptance
   * test.
   */
  opts?: {
    /**
     * Feature flag `verticalDramaSeriesSpeechBudget` — injects
     * `speech_budget`/`content_budget` into the prompt and runs the
     * post-generation coverage gate (`evaluateScriptSpeechCoverage`),
     * throwing `VdEpisodeUnderfilledError` when the episode is critically
     * underfilled.
     */
    speechBudgetEnabled?: boolean;
    /**
     * Feature flag `verticalDramaSeriesDeepStoryDrafts` (W10-B, added
     * 2026-07-08) — renders `episodeDraft` (when present) into the prompt
     * as a REFINE base. See `episodeDraft` above.
     */
    episodeDraftHydrationEnabled?: boolean;
  };
}

/** Shipped 8-clip bridge duration profile — see `assembly.ts`'s doc comment. */
const DEFAULT_SCRIPT_CLIP_DURATIONS_SECONDS: readonly number[] =
  VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.clipDurationsSeconds;

/**
 * Builds the `speech_budget` object injected into the script-builder
 * skill's user prompt (spec §7.7.2 Layer 2) — matches
 * `vertical-drama-script-builder/schemas/input.schema.json`'s
 * `speech_budget` shape exactly. Every number is derived from the
 * canonical `dialogueQuality.ts`/`contentBudget.ts` exports
 * (`MIN_EPISODE_COVERAGE_RATIO`, `derivePerShotSpeechBudgets` ->
 * `targetVerticalDramaSpeechSeconds`) — no second speech-rate model is
 * introduced (spec §7.7.1 hard rule 1).
 *
 * `target_speech_seconds_min` uses the canonical episode-level floor
 * (`MIN_EPISODE_COVERAGE_RATIO * durationSeconds`); `target_speech_seconds_max`
 * sums the canonical PER-SHOT target across the full duration profile (the
 * per-clip target ratio, obtained ONLY via the exported
 * `derivePerShotSpeechBudgets` -> `targetSpeechSeconds`, since that ratio
 * constant itself is not exported from `dialogueQuality.ts`) — for the
 * default 60s/8-clip profile this yields ~34.8s-40.8s, matching spec
 * §7.7.1's "roughly 35-50 seconds" operating-band description.
 *
 * `per_shot_band` deduplicates by clip duration — the skill's own schema
 * describes this field as "the target/minimum speech seconds for each
 * DISTINCT clip-duration band" (e.g. the seven ~8s shots vs. the one
 * trailing ~4s shot), not one entry repeated per shot.
 */
function buildSpeechBudgetPromptPayload(params: GenerateEpisodeScriptParams): {
  target_speech_seconds_min: number;
  target_speech_seconds_max: number;
  per_shot_band: Array<{
    clip_duration_seconds: number;
    target_speech_seconds: number;
    min_speech_seconds: number;
  }>;
  locale: string;
} {
  const clipDurationsSeconds =
    params.speechBudget?.clipDurationsSeconds ?? DEFAULT_SCRIPT_CLIP_DURATIONS_SECONDS;
  const perShotBudgets = derivePerShotSpeechBudgets([...clipDurationsSeconds]);

  const seenDurations = new Set<number>();
  const perShotBand: Array<{
    clip_duration_seconds: number;
    target_speech_seconds: number;
    min_speech_seconds: number;
  }> = [];
  for (const budget of perShotBudgets) {
    if (seenDurations.has(budget.clipDurationSeconds)) continue;
    seenDurations.add(budget.clipDurationSeconds);
    perShotBand.push({
      clip_duration_seconds: budget.clipDurationSeconds,
      target_speech_seconds: budget.targetSpeechSeconds,
      min_speech_seconds: budget.minSpeechSeconds,
    });
  }

  return {
    target_speech_seconds_min: MIN_EPISODE_COVERAGE_RATIO * params.durationSeconds,
    target_speech_seconds_max: perShotBudgets.reduce((sum, b) => sum + b.targetSpeechSeconds, 0),
    per_shot_band: perShotBand,
    locale: params.locale,
  };
}

function buildUserPrompt(params: GenerateEpisodeScriptParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all human-readable string values (hook, scene summaries, dialogue lines, cliffhanger, continuity_notes) in natural Thai."
      : `Write all human-readable string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const { storySource } = params;
  const characterLines = params.characters.length
    ? params.characters
        .map(c => `- ${c.characterId}: ${c.name}${c.role ? ` (${c.role})` : ""}`)
        .join("\n")
    : "(no characters registered yet — invent minimal placeholder character ids consistent with the story context)";

  const storyBrief = [
    storySource.logline ? `Logline: ${storySource.logline}` : null,
    storySource.mainPlot ? `Main plot: ${storySource.mainPlot}` : null,
    storySource.seasonArc ? `Season arc: ${storySource.seasonArc}` : null,
    storySource.tone ? `Tone: ${storySource.tone}` : null,
    storySource.keyBeats?.length
      ? `Key beats:\n${storySource.keyBeats.map(b => `- ${b}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // memory_state (spec §7.6 retrieval bundle) — matches the
  // `vertical-drama-script-builder` skill's `schemas/input.schema.json`
  // `memory_state` key exactly. Omitted entirely when no bundle is available
  // (episode 1 of a brand-new series, or a caller/test that predates this
  // field) so the prompt shape is unchanged for those cases.
  const memorySection = params.memoryBundle
    ? `memory_state (series long-memory retrieval bundle — canonical facts, recent episode summaries, open/resolved hooks, continuity warnings, product tie-in fatigue; respect it for continuity and do not repeat resolved hooks or fatigued tie-ins):\n${JSON.stringify(params.memoryBundle)}`
    : null;

  // Product tie-in policy (spec §13) — only sent when the series has tie-in
  // enabled. Requires a STRUCTURED, shot-numbered placement so downstream
  // stages (start-frame image generation, dialogue) can reliably wire the
  // product into concrete shots instead of a vague freeform mention.
  //
  // Task #31 (spec §7.7.2/§7.7.3, added 2026-07-09) — `episodeTieInPlacement`
  // (see this param's own doc comment above) narrows this from a purely
  // series-level MANDATORY-when-enabled instruction into a 3-way,
  // episode-specific decision. `episodeTieInPlan` below is read exactly
  // once so both branches share the identical resolved value.
  const tieIn = params.productTieIn;
  const episodeTieInPlan = params.episodeTieInPlacement;
  let tieInSection: string | null;
  if (!tieIn?.enabled) {
    tieInSection = null;
  } else if (episodeTieInPlan?.planned === false) {
    // Season plan explicitly excludes this episode — omit the section
    // entirely so the LLM never introduces a placement, even though the
    // series-level policy is enabled (spec §7.7.3 consumer rule).
    tieInSection = null;
  } else {
    const forced = episodeTieInPlan?.planned === true;
    const planGuidanceLine = forced
      ? [
          episodeTieInPlan?.benefitFocus
            ? `This episode's season plan asks the placement to foreground this benefit/talking point: "${episodeTieInPlan.benefitFocus}".`
            : null,
          episodeTieInPlan?.intensity
            ? `Planned on-screen presence for this episode: "${episodeTieInPlan.intensity}" (${
                episodeTieInPlan.intensity === "featured"
                  ? "give the product a more prominent, hero-prop moment"
                  : "keep it naturally in the background/daily-use register"
              }).`
            : null,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n") || null
      : null;

    tieInSection = [
      `product_tie_in_policy: ${JSON.stringify({
        enabled: true,
        product_name: tieIn.productName,
        product_description: tieIn.productDescription,
        allowed_story_functions: tieIn.allowedStoryFunctions,
        forbidden_claims: tieIn.forbiddenClaims,
      })}`,
      forced
        ? `PRODUCT TIE-IN (REQUIRED this episode — the season plan assigns this episode a placement): weave "${tieIn.productName ?? "the product"}" naturally into this episode like real TV-drama product placement — it must serve an explicit story function (never unrealistically resolve the main conflict), and must NEVER use any forbidden claim listed above. Unlike a routine/opportunistic placement, this episode's plan requires the placement to appear — do NOT return an empty "tie_ins" citing "no product this episode".`
        : `PRODUCT TIE-IN (MANDATORY when enabled): weave "${tieIn.productName ?? "the product"}" naturally into this episode like real TV-drama product placement — it must serve an explicit story function (never unrealistically resolve the main conflict), and must NEVER use any forbidden claim listed above.`,
      planGuidanceLine,
      `Populate "product_tie_in_plan.tie_ins" as an array of 1 or more objects, each with EXACTLY these fields: "shot_numbers" (array of integers 1-9, the specific storyboard shots that carry this placement), "story_function" (one of ${JSON.stringify(tieIn.allowedStoryFunctions ?? ["daily_use"])}, required, never empty), "placement_style" (one of "hero_prop", "background", "in_use_moment" — how the product physically appears in the shot), and "benefit_talking_point" (a short, natural benefit the dialogue in that shot can reference — never hard-sell copy, must fit the scene's emotion).`,
      forced
        ? null
        : `If tie-in cannot be placed naturally this episode, return "product_tie_in_plan": { "tie_ins": [], "note": "<reason>" } instead of forcing an unnatural placement.`,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }

  // Story-density reform (spec §7.7.2 Layer 2, section-13, added
  // 2026-07-07) — additive; only sent when `verticalDramaSeriesSpeechBudget`
  // is enabled, so the flag-off prompt is byte-identical to before this
  // change (section-13 acceptance: "flags off — ... byte-compatible").
  const speechBudgetEnabled = params.opts?.speechBudgetEnabled === true;
  const speechBudgetSection = speechBudgetEnabled
    ? `speech_budget: ${JSON.stringify(buildSpeechBudgetPromptPayload(params))}`
    : null;
  const contentBudgetSection =
    speechBudgetEnabled && params.speechBudget?.contentBudget
      ? `content_budget: ${JSON.stringify(params.speechBudget.contentBudget)}`
      : null;

  // Deep story drafts hydration (W10-B, spec/section-16 refine-mode, added
  // 2026-07-08) — additive; only sent when `verticalDramaSeriesDeepStoryDrafts`
  // is enabled AND an `episodeDraft` was actually resolved for this episode,
  // so the flag-off (or no-draft) prompt is byte-identical to before this
  // change. The instruction sentence is repeated here (not left solely to
  // the skill's own system-prompt brief) so it travels with the actual
  // `episode_draft` data in the same message and is directly verifiable by
  // this function's own unit tests.
  const episodeDraftEnabled = params.opts?.episodeDraftHydrationEnabled === true;
  const episodeDraftSection =
    episodeDraftEnabled && params.episodeDraft
      ? [
          "A vetted per-shot draft exists — REFINE it into the full script schema: keep the shot-to-story structure and dialogue intent, improve flow/spoken register, preserve speakability rules; do NOT invent a divergent plot.",
          `episode_draft: ${JSON.stringify(params.episodeDraft)}`,
        ].join("\n")
      : null;

  // Repair-mode framing (see `GenerateEpisodeScriptParams.repairContext`'s
  // doc comment) — additive; only rendered when a caller explicitly supplies
  // `repairContext` (only `repairStage`'s real-repair path does), so every
  // fresh-generation call site's prompt is byte-identical to before this
  // section existed.
  const repairSection = params.repairContext
    ? [
        "REPAIR MODE: You are REPAIRING an existing episode script that was already generated — you are NOT writing a new one from scratch.",
        "Apply ONLY the targeted change(s) the instruction below calls for. Preserve every other beat, dialogue line, hook, cliffhanger, and field from the CURRENT script exactly as-is unless the instruction specifically requires changing it — do not rewrite unrelated content.",
        `current_script: ${JSON.stringify(params.repairContext.currentScript)}`,
        `repair_instruction: ${params.repairContext.instruction}`,
      ].join("\n")
    : null;

  return [
    `story_title: ${params.episodeTitle}`,
    `story_brief:\n${storyBrief || "(no series bible detail available yet — invent a reasonable brief consistent with the episode title)"}`,
    `episode_number: ${params.episodeNumber}`,
    `duration_seconds: ${params.durationSeconds}`,
    langInstruction,
    `characters:\n${characterLines}`,
    memorySection,
    tieInSection,
    speechBudgetSection,
    contentBudgetSection,
    episodeDraftSection,
    repairSection,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Coverage validation (spec §7.7.2 Layer 2, section-13, added 2026-07-07)     */
/* -------------------------------------------------------------------------- */

export type ScriptSpeechCoverageStatus =
  | "in_range"
  | "underfilled_warning"
  | "underfilled_error"
  /**
   * 2026-07-08 fix (spec §17 grandfathering) — distinct from
   * `underfilled_error`: NEITHER dialogue source below (beat-level
   * `dialogue_lines[]` nor the legacy `scene_dialogue_summary[]` freeform
   * shape) has a single usable line. A LEGACY script predating the
   * speechBudget flag would previously always sum beat-level lines to `0`
   * and get misclassified as `underfilled_error` even when it actually had
   * real dialogue in the legacy shape — this status is reserved for the
   * genuine "nothing to measure at all" case, so a caller (the Production
   * Wizard) can grandfather it instead of falsely blocking storyboard.
   */
  | "no_dialogue_data";

export interface ScriptSpeechCoverageResult {
  estimatedSpeechSeconds: number;
  coverageRatio: number;
  status: ScriptSpeechCoverageStatus;
  /**
   * Canonical episode-level speech-target band (spec §7.7.1's "roughly
   * 35-50 seconds" operating description), 2026-07-08 fix — ALWAYS
   * populated (even for `no_dialogue_data`, where there is nothing yet to
   * compare against) so a caller that wants to DISPLAY the band (e.g. the
   * Production Wizard's evidence row) never has to re-derive it itself.
   * Reuses the SAME two canonical building blocks
   * `buildSpeechBudgetPromptPayload` already computes for the
   * script-builder prompt — never a second formula (spec §7.7.1 hard rule
   * 1). See `deriveScriptSpeechCoverageBand`.
   */
  targetSpeechSecondsMin: number;
  targetSpeechSecondsMax: number;
}

/**
 * Whole-episode ERROR coverage floor — re-exported from the canonical
 * `dialogueQuality.ts` (spec §7.7.1's pinned contract value
 * `ERROR_EPISODE_COVERAGE_RATIO = 0.33 // whole-episode error floor (~20s
 * of 60s)`, exported 2026-07-07 section-13 specifically so this file no
 * longer needs to restate it), aliased under this file's existing local
 * name so every call site below is unchanged. This gate still cannot
 * delegate its classification decision to
 * `analyzeVerticalDramaEpisodeDialogueQuality` (that function always
 * RE-DERIVES speech-seconds from raw line text and has no way to honor a
 * script's own per-line `estimated_speech_seconds` — spec §7.7.2: "compute
 * episode estimatedSpeechSeconds by summing per-line estimates (use
 * estimateVerticalDramaSpeechSeconds when line lacks
 * estimated_speech_seconds)"), so the ratio itself is imported directly
 * instead. This is NOT a second speech-RATE model (spec §7.7.1 hard rule 1
 * concerns the chars/words-per-second estimator itself, which is never
 * re-declared anywhere in this file — every second below is either taken
 * verbatim from a line's own `estimated_speech_seconds` or computed via the
 * imported `estimateVerticalDramaSpeechSeconds`); it is the SAME
 * spec-pinned classification threshold, now imported rather than restated.
 */
const EPISODE_UNDERFILLED_ERROR_COVERAGE_RATIO = ERROR_EPISODE_COVERAGE_RATIO;

/**
 * Canonical episode-level speech-target band for a given target episode
 * duration (2026-07-08 fix) — reuses the SAME two building blocks
 * `buildSpeechBudgetPromptPayload` above already computes for the
 * script-builder prompt (`MIN_EPISODE_COVERAGE_RATIO` for the floor,
 * `derivePerShotSpeechBudgets` summed across the DEFAULT 8-clip bridge
 * profile for the ceiling). None of `evaluateScriptSpeechCoverage`'s three
 * call sites know the episode's real duration-profile clip durations at
 * evaluation time, so this always uses the same default profile the prompt
 * itself falls back to — keeping the DISPLAYED band consistent with
 * whatever the LLM was actually prompted with unless a caller explicitly
 * overrode it there too. Never a second formula (spec §7.7.1 hard rule 1).
 */
function deriveScriptSpeechCoverageBand(
  targetDurationSeconds: number,
): { min: number; max: number } {
  const durationSeconds = Math.max(0, targetDurationSeconds);
  const perShotBudgets = derivePerShotSpeechBudgets([...DEFAULT_SCRIPT_CLIP_DURATIONS_SECONDS]);
  return {
    min: MIN_EPISODE_COVERAGE_RATIO * durationSeconds,
    max: perShotBudgets.reduce((sum, b) => sum + b.targetSpeechSeconds, 0),
  };
}

/**
 * Mirrors the TEXT-level half of `resolveShotDialogueLines`'s source-3b
 * junk-fragment filter (`isDroppableScriptDialogueFragment`,
 * `verticalDramaEpisodes.ts`) — specifically its behavior when
 * `knownSpeakerKeys` is `undefined`: this pure, DB-free service has no
 * access to a series' character roster and can never resolve that
 * function's "known speaker" bypass, and with no known-speaker set that
 * bypass's `hasKnownSpeaker` branch is always `false` — so passing
 * `undefined` there degrades to EXACTLY the speaker-agnostic sound/junk
 * checks reproduced below. Duplicated rather than imported —
 * `verticalDramaEpisodes.ts` is a router file; a static import FROM it
 * INTO this service would go the opposite direction of the existing
 * dynamic `import()`s this file is loaded through (see
 * `buildProductionWizardInput`'s doc comment there) and would drag that
 * router's admin-procedure-heavy transitive dependency graph into every
 * test that imports this service. If either copy's rule changes, keep
 * both in sync.
 */
const LEGACY_SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN =
  /^(?:เสียง(?=$|[\s:.…])|sfx\b|sound effect\b|\(sfx\))[\s:.…]*[…]?/i;
const LEGACY_SCRIPT_DIALOGUE_SOUND_SPEAKER_PATTERN =
  /^(?:เสียง|sfx\b|sound effect\b|\(sfx\))/i;
const LEGACY_SCRIPT_DIALOGUE_MIN_MEANINGFUL_LENGTH = 4;

function isLegacyScriptDialogueJunkFragment(
  speaker: string | undefined,
  text: string,
): boolean {
  if (LEGACY_SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN.test(text)) return true;

  const speakerLooksLikeSoundCue = Boolean(
    speaker && LEGACY_SCRIPT_DIALOGUE_SOUND_SPEAKER_PATTERN.test(speaker),
  );
  const strippedOfMarker = text.replace(LEGACY_SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN, "").trim();
  const strippedOfPunctuation = strippedOfMarker.replace(/[.…\s]+/g, "");

  return (
    speakerLooksLikeSoundCue ||
    strippedOfPunctuation.length === 0 ||
    strippedOfMarker.length < LEGACY_SCRIPT_DIALOGUE_MIN_MEANINGFUL_LENGTH
  );
}

/**
 * Parses every usable spoken line's TEXT out of a legacy script's
 * `scene_dialogue_summary[].dialogue_lines[]` (freeform strings, spec
 * §7.7.2's "legacy-with-warning" source) — the SAME colon-split
 * speaker-extraction + junk-fragment-filter convention
 * `resolveShotDialogueLines`'s source-3b uses (`verticalDramaEpisodes.ts`),
 * but walking EVERY scene (not one shot's proportionally-mapped scene)
 * since this is a whole-episode coverage estimate, not a per-shot
 * resolution. Returns line TEXT only — speaker labels only matter for the
 * junk-fragment filter above, not for a seconds estimate.
 */
function parseLegacyScriptDialogueLineTexts(sceneDialogueSummary: unknown): string[] {
  // Defensive (2026-07-08 prod hotfix): a regenerated/legacy script can carry
  // `scene_dialogue_summary` as a non-array (object/string/null) — iterating
  // it directly crashed `getEpisodeDetail` ("sceneDialogueSummary is not
  // iterable"). Treat any non-array shape as "no legacy dialogue data".
  if (!Array.isArray(sceneDialogueSummary)) return [];
  const texts: string[] = [];
  for (const rawScene of sceneDialogueSummary) {
    const scene = (rawScene && typeof rawScene === "object" ? rawScene : {}) as Record<
      string,
      unknown
    >;
    const rawLines = Array.isArray(scene.dialogue_lines)
      ? (scene.dialogue_lines as unknown[])
      : [];
    for (const raw of rawLines) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const colonIndex = raw.indexOf(":");
      const hasSpeakerLabel = colonIndex > 0 && colonIndex < 40;
      const speaker = hasSpeakerLabel ? raw.slice(0, colonIndex).trim() : undefined;
      const text = (hasSpeakerLabel ? raw.slice(colonIndex + 1) : raw)
        .trim()
        .replace(/^[""]|[""]$/g, "");
      if (!text || isLegacyScriptDialogueJunkFragment(speaker, text)) continue;
      texts.push(text);
    }
  }
  return texts;
}

/**
 * Post-generation coverage validation (spec §7.7.2 Layer 2, section-13):
 * sums estimated speech seconds across every beat's `dialogue_lines[]`,
 * using EACH line's own `estimated_speech_seconds` when present and falling
 * back to the canonical `estimateVerticalDramaSpeechSeconds` (imported from
 * `dialogueQuality.ts` — never re-declared) only when a line lacks one.
 * Classifies the result against the canonical `MIN_EPISODE_COVERAGE_RATIO`
 * (exported) and the spec-pinned `EPISODE_UNDERFILLED_ERROR_COVERAGE_RATIO`
 * above.
 *
 * `locale` is accepted for forward-compatible parity with
 * `deriveDefaultContentBudget`'s call-site convention (a series' locale is
 * always known at the call site) — the canonical estimator itself is
 * text-driven (detects Thai characters directly), not locale-config-driven,
 * so this parameter does not currently change the computed numbers.
 *
 * 2026-07-08 fix (spec §17 grandfathering): beat-level `dialogue_lines[]`
 * (source 1) is the ONLY source this function originally summed — a LEGACY
 * script generated before the speechBudget flag existed has NO beat-level
 * `dialogue_lines[]` anywhere, so source 1 always summed to exactly `0`,
 * which unconditionally classified as `underfilled_error` even when the
 * SAME script has real dialogue in its legacy `scene_dialogue_summary[]`
 * shape — the shape every OTHER dialogue-resolution path in this codebase
 * already falls back to (`resolveShotDialogueLines`'s source-3b,
 * `verticalDramaEpisodes.ts`). Source 1 still wins whenever it has ANY
 * entry at all (exact, unchanged arithmetic — a dialogue-complete script's
 * result is byte-identical to before); only when source 1 is completely
 * empty does this function now fall back to
 * `parseLegacyScriptDialogueLineTexts`. When BOTH sources are empty, the
 * result is the distinct `no_dialogue_data` status — never
 * `underfilled_error` — so a legacy script is never falsely reported as
 * critically underfilled purely from the absence of beat-level data.
 */
export function evaluateScriptSpeechCoverage(
  script: ScriptBuilderOutput,
  targetDurationSeconds: number,
  locale?: VerticalDramaSeriesLocale,
): ScriptSpeechCoverageResult {
  void locale;

  const durationSeconds = Math.max(0, targetDurationSeconds);
  const { min: targetSpeechSecondsMin, max: targetSpeechSecondsMax } =
    deriveScriptSpeechCoverageBand(durationSeconds);

  const beats = script.structure?.beats ?? [];
  const beatLines = beats.flatMap(beat => beat.dialogue_lines ?? []);

  let estimatedSpeechSeconds: number;
  let hasDialogueData: boolean;

  if (beatLines.length > 0) {
    // Layer-2 dialogue-complete script (spec §7.7.2) — unchanged, exact sum.
    hasDialogueData = true;
    estimatedSpeechSeconds = beatLines.reduce(
      (sum, line) =>
        sum + (line.estimated_speech_seconds ?? estimateVerticalDramaSpeechSeconds(line.line)),
      0,
    );
  } else {
    const legacyLineTexts = parseLegacyScriptDialogueLineTexts(script.scene_dialogue_summary);
    hasDialogueData = legacyLineTexts.length > 0;
    estimatedSpeechSeconds = legacyLineTexts.reduce(
      (sum, text) => sum + estimateVerticalDramaSpeechSeconds(text),
      0,
    );
  }

  if (!hasDialogueData) {
    return {
      estimatedSpeechSeconds: 0,
      coverageRatio: 0,
      status: "no_dialogue_data",
      targetSpeechSecondsMin,
      targetSpeechSecondsMax,
    };
  }

  const coverageRatio = durationSeconds > 0 ? estimatedSpeechSeconds / durationSeconds : 0;

  const status: ScriptSpeechCoverageStatus =
    coverageRatio >= MIN_EPISODE_COVERAGE_RATIO
      ? "in_range"
      : coverageRatio < EPISODE_UNDERFILLED_ERROR_COVERAGE_RATIO
        ? "underfilled_error"
        : "underfilled_warning";

  return {
    estimatedSpeechSeconds,
    coverageRatio,
    status,
    targetSpeechSecondsMin,
    targetSpeechSecondsMax,
  };
}

/**
 * Thrown when the flag-gated post-generation coverage check
 * (`evaluateScriptSpeechCoverage`) determines the WHOLE episode is
 * critically underfilled (`status: "underfilled_error"`) OR has NO usable
 * dialogue data at all (`status: "no_dialogue_data"`, 2026-07-08 fix) —
 * mirrors `VdSchemaValidationError`'s shape (an `Error` subclass carrying a
 * stable machine-readable `code`) rather than inventing a new error
 * transport, so the pipeline runner's existing `instanceof`-based
 * error-mapping convention (see `verticalDramaEpisodePipeline.ts`'s
 * `mapScriptGenerationError`) can be extended to recognize this class the
 * same way it already recognizes `VdSchemaValidationError`, and surface the
 * STABLE code `VD_DIALOGUE_EPISODE_UNDERFILLED` (spec §7.7.2) instead of
 * the generic `VD_SCHEMA_VALIDATION_FAILED`. `no_dialogue_data` is only
 * ever grandfathered for a script the wizard reads back AFTER the fact
 * (`buildProductionWizardInput`, `verticalDramaEpisodes.ts`) — a BRAND NEW
 * generation call that produces literally no dialogue anywhere (neither
 * beat-level nor legacy scene-summary) is still a failed generation and
 * must still block here, exactly like a genuine `underfilled_error`.
 */
export class VdEpisodeUnderfilledError extends Error {
  code = "VD_DIALOGUE_EPISODE_UNDERFILLED" as const;
  constructor(
    message: string,
    public coverage: ScriptSpeechCoverageResult,
  ) {
    super(message);
    this.name = "VdEpisodeUnderfilledError";
  }
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate the `plan_episode_script` stage's real content via the
 * `vertical-drama-script-builder` skill, using a direct `executeWithFallback`
 * LLM call. Credit-gated and schema-validated — mirrors
 * `generateStoryboardShotgrid`'s convention exactly.
 */
export async function generateEpisodeScript(
  params: GenerateEpisodeScriptParams
): Promise<{
  script: ScriptBuilderOutput;
  creditsUsed: number;
  model: string;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new Error(
      `Rate limit exceeded for script generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`
    );
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Same shared retry wrapper as the start-frame/motion-prompt/storyboard
  // generators. Base ceiling raised from 4000 to 12000 — a single script
  // structure has no fixed shot count, but Phase 3B added per-beat
  // power_shift/is_reversal/intensity plus per-character emotional-arc
  // fields on top of the existing structure/scene_dialogue_summary/
  // character_state_deltas/product_tie_in_plan/continuity_notes payload,
  // which is large enough to risk the same truncation class already seen in
  // the sibling storyboard/start-frame/motion-prompt generators. The retry's
  // own doubling (`Math.max(maxTokens * 2, 16000)`) comfortably covers any
  // remaining outlier.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    userId: params.userId,
    maxTokens: 12000,
    schema: scriptBuilderOutputSchema,
    label: "Episode script",
  });

  // Story-density reform (spec §7.7.2 Layer 2, section-13, added
  // 2026-07-07) — flag-gated post-generation coverage gate. Runs BEFORE
  // credits are computed/deducted (same position as a schema-validation
  // failure above), so a critically underfilled episode does not charge the
  // user credits for a script that cannot proceed to storyboard in guided
  // mode. Flag-off (or omitted) preserves today's byte-identical behavior:
  // no coverage check at all.
  if (params.opts?.speechBudgetEnabled) {
    const coverage = evaluateScriptSpeechCoverage(
      validatedData,
      params.durationSeconds,
      params.locale,
    );
    if (coverage.status === "underfilled_error" || coverage.status === "no_dialogue_data") {
      // `no_dialogue_data` (2026-07-08 fix) is only ever grandfathered on
      // the WIZARD's read-back of an existing script — a fresh generation
      // that produced no dialogue anywhere is a failed generation and must
      // still block here.
      throw new VdEpisodeUnderfilledError(
        coverage.status === "no_dialogue_data"
          ? `Episode script has no usable dialogue data at all (no beat-level dialogue_lines and no legacy scene_dialogue_summary lines) for a ${params.durationSeconds}s episode — needs repair before the storyboard stage.`
          : `Episode script is critically underfilled: ~${coverage.estimatedSpeechSeconds.toFixed(1)}s of estimated speech for a ${params.durationSeconds}s episode (${Math.round(coverage.coverageRatio * 100)}% coverage) — needs repair before the storyboard stage.`,
        coverage,
      );
    }
  }

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate episode script (episode #${params.episodeId})`,
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

  return { script: validatedData, creditsUsed, model };
}
