/**
 * Vertical Drama Series — location reference-image PROMPT generation
 * (`planning/polished-toasting-gadget.md` Phase 2).
 *
 * Location-side companion to `verticalDramaCharacterImageGeneration.ts`:
 * wraps the `vertical-drama-location-visual-bible` skill (an `execution_mode:
 * llm-only` skill whose markdown body is a system prompt, not a chat-flow
 * skill) into a direct, credit-gated LLM call — mirrors
 * `generateCharacterVisualPrompts`'s check-credits -> resolve-model -> call
 * -> validate -> deduct-credits convention exactly (see that function's own
 * doc comment for the canonical pattern this replicates).
 *
 * Deliberately has NO internal rate-limit check — verified by reading
 * `verticalDramaCharacterImageGeneration.ts` in full: `generateCharacterVisualPrompts`
 * does not call `mediaGenerationLimiter` itself, unlike
 * `generateStartFrameRenderPlan`/`generateStartFrameShotPrompt` in
 * `verticalDramaStartFrameGeneration.ts`, which DO rate-limit internally.
 * This module mirrors the character visual-bible function's convention
 * (no internal check) rather than the start-frame one; whether/where the
 * eventual router wiring adds a rate-limit check is that dispatch's decision.
 *
 * This module only produces an IMAGE-GENERATION PROMPT (an establishing-plate
 * prompt + negative prompt, plus the full validated payload for storage/
 * audit). It does NOT call the image-rendering pipeline — that is a
 * separate, separately-credited call the caller (a future router) makes
 * against `mediaGenerationService`.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  InsufficientCreditsError,
  VdSchemaValidationError,
  executeJsonPlanningCallWithRetry,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import { renderCriteriaVersionMarker } from "./verticalDramaQualityCriteria";
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
import type { VerticalDramaLocationCoverageRole } from "@shared/verticalDramaSeries/locationAssets";

export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-location-visual-bible");

/* -------------------------------------------------------------------------- */
/* System prompt loading — the skill.md body (after frontmatter), verbatim.   */
/* -------------------------------------------------------------------------- */

let cachedLocationVisualBibleSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-location-visual-bible` skill's markdown body
 * (everything after the YAML frontmatter) verbatim, to use as the LLM system
 * prompt. Resolves the skill folder via `resolveSkillDirCandidates` +
 * `resolveSkillManifestPath` — the same, more-recent resolution-loop idiom
 * `verticalDramaStartFrameGeneration.ts`'s `loadShotStartFramePromptSystemPrompt`
 * and `verticalDramaCharacterVariantPlanner.ts`'s `loadSkillSystemPrompt` use
 * (rather than `verticalDramaCharacterImageGeneration.ts`'s older hand-rolled
 * 2-candidate array) — both are "resolution loop over candidate paths,
 * cached after first successful read" patterns; this one also tolerates a
 * native-bundle-wrapped skill folder via `resolveSkillManifestPath`'s own
 * bundle-dir fallback.
 */
function loadLocationVisualBibleSystemPrompt(): string {
  if (cachedLocationVisualBibleSystemPrompt) return cachedLocationVisualBibleSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedLocationVisualBibleSystemPrompt = content;
        return cachedLocationVisualBibleSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-location-visual-bible" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — matches skill.md's own JSON contract exactly.              */
/* -------------------------------------------------------------------------- */

const locationVisualBibleOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    establishing_plate_prompt: z.string().min(1),
    negative_prompt: z.string().optional().default(""),
  })
  .passthrough();

export type LocationVisualBibleOutput = z.infer<typeof locationVisualBibleOutputSchema>;

/* -------------------------------------------------------------------------- */
/* User-prompt construction — matches skill.md's worked-example input shape   */
/* (`location_key` / `location_name` / `description` / `aggregated_facts` /   */
/* `series_context` / `preset_visual_identity` / `has_own_reference_image`).  */
/* -------------------------------------------------------------------------- */

export interface GenerateLocationVisualPromptsParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  /** Stable app-level location key (`verticalDramaLocations.locationKey`) — sent as the skill's `location_key`. */
  locationKey: string;
  locationName: string;
  description: string;
  /**
   * Aggregated dialogue/action/props facts gathered from every shot in the
   * episode grouped under this location (skill.md's "Ground the environment
   * in the aggregated shot facts" section) — the PRIMARY grounding source
   * when present. Omitted/empty falls back to `description` alone (a
   * location that hasn't accumulated any shot facts yet) — the skill itself
   * handles that fallback; this module just passes through what it's given.
   */
  aggregatedFacts?: string[];
  /**
   * Pre-formatted series-context line (e.g. "Series title: ... | Genre: ... |
   * Tone: ..."), already built by the caller — unlike the character system's
   * `buildStoryContextString`, this module receives the string ready-made
   * rather than a `{title, genre, tone}` object to format itself, since the
   * caller (episode pipeline) has no per-call reason to vary the format.
   */
  seriesContext?: string;
  /**
   * Series-level structured visual identity flow-through (spec §8.2.2), same
   * source object as the character system's `presetVisualIdentity` param —
   * rendered here via `buildLocationPresetVisualIdentityFacts` using the FACT
   * SHAPE skill.md's own "Preset visual identity" section documents
   * (`style_name`/`palette`/`lighting`/`environment_motifs`/`camera_grammar`),
   * which is a DIFFERENT fact shape than the character skill consumes
   * (`style_name`/`palette`/`wardrobe_grammar`/`matched_archetype_look`) —
   * wardrobe-grammar and character-archetype facets don't apply to an empty,
   * people-free environment shot (skill.md says so explicitly).
   */
  presetVisualIdentity?: VerticalDramaPresetVisualIdentity;
  /**
   * Whether an existing, already-approved establishing-plate image of this
   * EXACT location will be attached as a render-time reference (skill.md's
   * "Own reference image locking" section). Sent to the skill as
   * `has_own_reference_image: true` only when true (omitted entirely when
   * false/absent) — same "facts in, natural prose out" convention as the
   * character system's `hasOwnReferenceImage`.
   */
  hasOwnReferenceImage?: boolean;
  /** Feature 138 P2 — optional coverage-pack angle directive. */
  coverageRole?: VerticalDramaLocationCoverageRole;
  /** Feature 138 P2 — a concrete planner-reported coverage gap to ground. */
  gapDescription?: string;
  /** Effective prompt budget for the selected output image model. */
  imagePromptMaxChars?: number;
  idempotencyKey?: string;
}

/**
 * Builds the `preset_visual_identity` FACT object skill.md's own "Preset
 * visual identity" section expects — raw facts only
 * (`style_name`/`palette`/`lighting`/`environment_motifs`/`camera_grammar`),
 * never an authored connective sentence (same "facts in, natural prose out"
 * convention as `buildPresetVisualIdentityFacts` in
 * `verticalDramaCharacterImageGeneration.ts`). No archetype-matching lookup
 * here (unlike the character version's `matched_archetype_look`) — a
 * location has no role/description to match an archetype against, and
 * skill.md says wardrobe/archetype facets don't apply to it anyway.
 */
function buildLocationPresetVisualIdentityFacts(identity: VerticalDramaPresetVisualIdentity): {
  style_name: string;
  palette: string[];
  lighting: string;
  environment_motifs: string[];
  camera_grammar: string;
} {
  return {
    style_name: identity.styleName,
    palette: identity.palette,
    lighting: identity.lighting,
    environment_motifs: identity.environmentMotifs,
    camera_grammar: identity.cameraGrammar,
  };
}

export function buildLocationVisualPromptsUserPrompt(params: GenerateLocationVisualPromptsParams): string {
  const inputPayload = {
    location_key: params.locationKey,
    location_name: params.locationName,
    description: params.description,
    ...(params.aggregatedFacts && params.aggregatedFacts.length > 0
      ? { aggregated_facts: params.aggregatedFacts }
      : {}),
    ...(params.seriesContext ? { series_context: params.seriesContext } : {}),
    ...(params.presetVisualIdentity
      ? { preset_visual_identity: buildLocationPresetVisualIdentityFacts(params.presetVisualIdentity) }
      : {}),
    ...(params.hasOwnReferenceImage ? { has_own_reference_image: true } : {}),
    ...(params.coverageRole ? { coverage_role: params.coverageRole } : {}),
    ...(params.gapDescription ? { coverage_gap: params.gapDescription } : {}),
    ...(params.imagePromptMaxChars
      ? { prompt_max_chars: Math.min(20_000, Math.max(3_800, Math.floor(params.imagePromptMaxChars))) }
      : {}),
  };

  return [
    renderCriteriaVersionMarker(),
    "Generate the location visual bible (establishing plate prompt) for exactly ONE location using",
    "the following input (matches this skill's own JSON contract). Derive every environmental,",
    "no-people, preset-identity, and reference-lock directive from your own instructions — the input",
    "below carries only facts, no pre-authored appearance directive:",
    JSON.stringify(inputPayload, null, 2),
    "Return ONLY the JSON object described in your instructions — no markdown fences, no commentary.",
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Model resolution — reuses the same quality large-context resolver tier as  */
/* the character visual bible, routed through the centralized per-series      */
/* override resolver first (same convention as                                */
/* `resolveCharacterVisualBibleModel` in the character sibling module).       */
/* -------------------------------------------------------------------------- */

export async function resolveLocationVisualBibleModel(seriesId: number): Promise<string> {
  return resolveVerticalDramaSeriesModel(seriesId, resolveQualityLargeContextModelId);
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

export interface GenerateLocationVisualPromptsResult {
  establishingPlatePrompt: string;
  negativePrompt: string;
  /** Full validated payload, for storage/audit — same rationale as `GenerateCharacterVisualPromptsResult.raw`. */
  raw: LocationVisualBibleOutput;
  creditsUsed: number;
  model: string;
}

/**
 * Generate a location's establishing-plate image-generation prompt pack
 * (prompt + negative prompt, plus the full validated payload) via a real LLM
 * call using the `vertical-drama-location-visual-bible` skill's markdown body
 * as the system prompt. Credit-gated (throws `InsufficientCreditsError`
 * before calling out) and schema-validated (throws `VdSchemaValidationError`
 * on a malformed LLM response) — mirrors `generateCharacterVisualPrompts`'s
 * check-credits -> call -> deduct-credits convention exactly, INCLUDING its
 * lack of an internal rate-limit check (see this file's doc comment).
 *
 * This does NOT render an image — it only produces the prompt. Image
 * rendering (and its own separate credit charge) is the caller's
 * responsibility via `mediaGenerationService`.
 */
export async function generateLocationVisualPrompts(
  params: GenerateLocationVisualPromptsParams,
): Promise<GenerateLocationVisualPromptsResult> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveLocationVisualBibleModel(params.seriesId);
  const systemPrompt = loadLocationVisualBibleSystemPrompt();
  const userPrompt = buildLocationVisualPromptsUserPrompt(params);

  // Single establishing-plate payload (one prompt + one negative prompt) —
  // much smaller than the multi-field character visual bible, but shares the
  // same fragile executeWithFallback+extractJson pattern, so it gets the same
  // one-retry-on-truncated/invalid-JSON safety net.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    userId: params.userId,
    maxTokens: 2000,
    schema: locationVisualBibleOutputSchema,
    label: "Location visual bible",
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
    description: `Vertical Drama — generate location visual prompts (${params.locationKey})`,
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_location_visual_bible",
      seriesId: params.seriesId,
      locationKey: params.locationKey,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return {
    establishingPlatePrompt: validatedData.establishing_plate_prompt,
    negativePrompt: validatedData.negative_prompt ?? "",
    raw: validatedData,
    creditsUsed,
    model,
  };
}
