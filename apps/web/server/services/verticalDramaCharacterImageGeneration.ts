/**
 * Vertical Drama Series — character reference-image PROMPT generation
 * (spec feature 131, section-05/section-11 follow-up).
 *
 * Wraps the already-installed, already-adapted
 * `apps/web/skills/vertical-drama-character-visual-bible` skill (an
 * `execution_mode: llm-only` skill whose markdown body is a system prompt,
 * not a chat-flow skill) into a direct, credit-gated LLM call — mirroring
 * `verticalDramaStoryBible.ts`'s check-credits -> call -> deduct-credits
 * convention exactly (that file is the canonical pattern for a real backend
 * LLM call in this codebase; `skillExecutor.ts`'s `llm-only` branch is
 * chat-flow-only and does NOT actually call an LLM here).
 *
 * This module only produces IMAGE-GENERATION PROMPTS (a portrait prompt +
 * negative prompt, plus the full validated visual-bible payload for
 * storage/audit). It does NOT call the image-rendering pipeline — that is
 * a separate, separately-credited call the caller (the tRPC router) makes
 * against `mediaGenerationService`.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  InsufficientCreditsError,
  VdSchemaValidationError,
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import {
  buildTargetAudienceRegionInstruction,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import { VD_CHARACTER_LOCK_INSTRUCTION } from "@shared/verticalDramaSeries/characterLock";

export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_SLUG = "vertical-drama-character-visual-bible";

/* -------------------------------------------------------------------------- */
/* System prompt loading — the skill.md body (after frontmatter), verbatim.   */
/* -------------------------------------------------------------------------- */

let cachedSystemPrompt: string | null = null;

/**
 * Load the `vertical-drama-character-visual-bible` skill's markdown body
 * (everything after the YAML frontmatter) to use verbatim as the system
 * prompt. Tries both possible working-directory roots (repo root vs
 * `apps/web`), matching the fallback-path convention already used in
 * `server/routers/skills.ts` for disk-sourced skill content. Cached after
 * first successful read.
 */
function loadCharacterVisualBibleSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  const candidates = [
    path.resolve(process.cwd(), "skills", SKILL_SLUG, "skill.md"),
    path.resolve(process.cwd(), "apps/web/skills", SKILL_SLUG, "skill.md"),
  ];
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) {
    throw new Error(
      `Vertical Drama character visual bible skill.md not found (checked: ${candidates.join(", ")})`,
    );
  }

  const raw = fs.readFileSync(sourcePath, "utf-8");
  const { content } = parseSkillFile(raw);
  if (!content || !content.trim()) {
    throw new Error(`Vertical Drama character visual bible skill.md at ${sourcePath} has no content body`);
  }
  cachedSystemPrompt = content;
  return cachedSystemPrompt;
}

/* -------------------------------------------------------------------------- */
/* Output schema — minimum viable validation (required fields only).         */
/* -------------------------------------------------------------------------- */

const characterVisualBibleCharacterSchema = z
  .object({
    character_id: z.string().min(1),
    name: z.string().min(1),
    visual_identity_summary: z.string().min(1),
    primary_portrait_prompt: z.string().min(1),
    negative_prompt: z.string().optional(),
    // Optional — read from the same LLM response as `primary_portrait_prompt`
    // (see skill.md's own example output) but not present in every provider
    // response, so it must not fail the whole call when omitted. Falls back
    // to a portrait-derived turnaround instruction (see `generateCharacterVisualPrompts`).
    turnaround_prompt: z.string().min(1).optional(),
    // The skill's schema has always computed these three (see
    // schemas/output.schema.json), but until now nothing in this module
    // extracted them past `.passthrough()` — the LLM produced them and they
    // were silently discarded. Surfaced now for the full-spec Character
    // Sheet generation mode (combines portrait + turnaround + expressions +
    // outfit into one multi-panel image).
    full_body_prompt: z.string().min(1).optional(),
    expression_sheet_prompt: z.string().min(1).optional(),
    outfit_sheet_prompt: z.string().min(1).optional(),
    attachment_package: z.array(z.record(z.string(), z.unknown())).min(1),
  })
  .passthrough();

const characterVisualBibleOutputSchema = z
  .object({
    visual_bible_summary: z.record(z.string(), z.unknown()),
    characters: z.array(characterVisualBibleCharacterSchema).min(1),
    plain_text_summary: z.string().min(1),
    storyboard_attachment_manifest: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type CharacterVisualBibleOutput = z.infer<typeof characterVisualBibleOutputSchema>;
export type CharacterVisualBibleCharacter = z.infer<typeof characterVisualBibleCharacterSchema>;

/* -------------------------------------------------------------------------- */
/* Role-tier mapping — leads get star-quality directives, villains get        */
/* attractive-but-sharp directives, everyone else stays natural.              */
/* -------------------------------------------------------------------------- */

export type CharacterRoleTier = "lead" | "villain" | "support" | "other";

/** Keyword lists, lower-cased, Thai + English. Order matters: lead/villain are
 *  checked before support so e.g. "female lead / antagonist" combos resolve
 *  to the more specific tier first. */
const LEAD_KEYWORDS = [
  "พระเอก",
  "นางเอก",
  "คู่หลัก",
  "ตัวหลัก",
  "male lead",
  "female lead",
  "leading man",
  "leading lady",
  "protagonist",
  "lead role",
];
const VILLAIN_KEYWORDS = [
  "ตัวร้าย",
  "วายร้าย",
  "ผู้ร้าย",
  "villain",
  "antagonist",
];
const SUPPORT_KEYWORDS = [
  "ตัวประกอบ",
  "สมทบ",
  "supporting",
  "support",
  "extra",
  "background",
];

/**
 * Map a free-text role string (Thai or English, whatever ops/writers typed
 * into `verticalDramaCharacters.role`) to a coarse tier that drives how much
 * "star quality" the portrait-prompt directive demands. Keyword-based,
 * case-insensitive, whitespace-tolerant — matches on substrings so
 * "พระเอกวัยรุ่น" or "Male Lead (age 20s)" both resolve correctly.
 *
 * Exported + unit-tested directly (see
 * `__tests__/verticalDramaCharacterImageGeneration.test.ts`).
 */
export function resolveCharacterRoleTier(role: string | null | undefined): CharacterRoleTier {
  if (!role) return "other";
  const normalized = role.trim().toLowerCase();
  if (!normalized) return "other";

  if (LEAD_KEYWORDS.some((kw) => normalized.includes(kw))) return "lead";
  if (VILLAIN_KEYWORDS.some((kw) => normalized.includes(kw))) return "villain";
  if (SUPPORT_KEYWORDS.some((kw) => normalized.includes(kw))) return "support";
  return "other";
}

/**
 * Concise (prompt-budget-friendly — see the 3500-char image-prompt cap)
 * appearance directive per role tier. Injected into the visual-bible LLM
 * user-prompt payload as `appearance_directive` so the skill's system prompt
 * (which already builds `primary_portrait_prompt` etc.) carries it straight
 * through into every generated prompt (portrait, turnaround, full-body,
 * expression sheet, outfit sheet — they all derive from the same LLM call).
 *
 * IMPORTANT: this directive must never override the character's stored
 * `description` (age, e.g. a child character) — it only shapes attractiveness
 * within whatever age/identity the description already establishes. The
 * wording below says so explicitly so the LLM does not "age up" a minor.
 */
const ROLE_TIER_DIRECTIVES: Record<CharacterRoleTier, string | undefined> = {
  lead: (
    "Star-quality lead: exceptionally attractive, idol/leading-actor-grade features, " +
    "photogenic symmetrical face, flawless camera-ready skin with realistic texture, " +
    "expressive charismatic eyes, well-styled hair, premium wardrobe and grooming. " +
    "Apply this attractiveness WITHIN the age and identity already given in the " +
    "character's description — never change or imply an older/younger age than described."
  ),
  villain: (
    "Striking antagonist: strikingly attractive but with a sharp, cold, dangerous aura " +
    "(elegant menace, not cartoonish evil) — magnetic and photogenic, not merely attractive-neutral."
  ),
  support: undefined,
  other: undefined,
};

/** Returns the directive string for a role, or `undefined` when the tier has
 *  no special directive (support/other) — callers should omit the field. */
export function getRoleTierAppearanceDirective(role: string | null | undefined): string | undefined {
  const tier = resolveCharacterRoleTier(role);
  return ROLE_TIER_DIRECTIVES[tier];
}

/* -------------------------------------------------------------------------- */
/* Solo-portrait rule — MANDATORY (2026-07-06 quality fix).                   */
/*                                                                            */
/* Live evidence: a generated นางเอก portrait came out with a CHILD in frame  */
/* because the visual-bible prompt narrated "single mother sacrificing for   */
/* her child" straight from the character's backstory. Portrait/turnaround/  */
/* sheet prompts are IDENTITY REFERENCES — they must contain exactly ONE     */
/* person, no matter what the backstory mentions. The backstory may still    */
/* shape mood/expression, it must never add people to the frame.            */
/* -------------------------------------------------------------------------- */

/** Appended to every visual-bible user prompt (all three generation paths —
 *  portrait/turnaround/full-body/expression/outfit sheet share this one LLM
 *  call, so one instruction here covers all of them). */
export const VD_SOLO_PORTRAIT_INSTRUCTION =
  "MANDATORY solo-portrait rule: every generated prompt (primary_portrait_prompt, " +
  "turnaround_prompt, full_body_prompt, expression_sheet_prompt, outfit_sheet_prompt) is an " +
  "IDENTITY REFERENCE and must depict EXACTLY ONE person — solo portrait, exactly one person " +
  "in frame, no other people, no children, no second person, no hands of others, no crowd, no " +
  "background figures. If the character's backstory or personality mentions other people " +
  "(e.g. a child, a spouse, a rival), use that ONLY to inform this one character's mood, " +
  "expression, or emotional state — NEVER render, imply, or add another person, body part of " +
  "another person, or silhouette of another person into the frame.";

/** Appended to the negative_prompt field for every generated prompt. */
export const VD_SOLO_PORTRAIT_NEGATIVE_TERMS =
  "no other people, no second person, no children, no extra person, no crowd, " +
  "no background figures, no hands of others";

/**
 * Concise cinematic-language guidance (portrait lens spec, color grade, film
 * grain/texture, key/rim lighting, out-of-focus storytelling background) —
 * kept short enough to fit the shared 3500-char image-prompt cap alongside
 * everything else already injected into this same LLM call.
 */
export const VD_CINEMATIC_LANGUAGE_INSTRUCTION =
  "Render every portrait/turnaround/sheet prompt with full cinematic language: a portrait " +
  "lens look (e.g. 85mm f/1.8, shallow depth of field), a cinematic color grade matching the " +
  "series' tone/genre, subtle film grain and skin texture (not overly smooth/plastic), " +
  "professional key light with a soft rim/edge light for separation, and a background that " +
  "hints at story/location but stays clearly out of focus (bokeh) so it never competes with " +
  "the subject.";

/* -------------------------------------------------------------------------- */
/* User-prompt construction — matches schemas/input.schema.json's shape       */
/* (`story_context` is a STRING per that schema, not an object).              */
/* -------------------------------------------------------------------------- */

interface StoryContextFields {
  title?: string;
  genre?: string;
  tone?: string;
}

function buildStoryContextString(ctx?: StoryContextFields): string {
  if (!ctx) return "No additional story context provided.";
  const parts = [
    ctx.title ? `Series title: ${ctx.title}` : null,
    ctx.genre ? `Genre: ${ctx.genre}` : null,
    ctx.tone ? `Tone: ${ctx.tone}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" | ") : "No additional story context provided.";
}

export interface GenerateCharacterVisualPromptsParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  /** Numeric `verticalDramaCharacters.id` row id (credit-transaction / audit metadata only). */
  characterId: number;
  /** Stable app-level character key (`verticalDramaCharacters.characterKey`) — sent as the
   *  skill's `character_id` so the returned character can be correlated back. */
  characterKey: string;
  name: string;
  role: string | null;
  description?: string | null;
  storyContext?: StoryContextFields;
  /**
   * Series-level default region/ethnicity look (see
   * `@shared/verticalDramaSeries/targetAudienceRegion.ts`). Optional —
   * omitted/undefined normalizes to the shared default ("thai") inside
   * `buildTargetAudienceRegionInstruction`. A character's own `description`
   * (when it states an explicit ethnicity/nationality) always takes
   * precedence over this default — the injected instruction says so
   * explicitly.
   */
  targetAudienceRegion?: VerticalDramaTargetAudienceRegion;
}

function buildUserPrompt(params: GenerateCharacterVisualPromptsParams): string {
  const appearanceDirective = getRoleTierAppearanceDirective(params.role);
  const inputPayload = {
    characters: [
      {
        character_id: params.characterKey,
        name: params.name,
        role: params.role ?? "supporting",
        ...(params.description ? { description: params.description } : {}),
        ...(appearanceDirective ? { appearance_directive: appearanceDirective } : {}),
      },
    ],
    story_context: buildStoryContextString(params.storyContext),
    output_options: {
      include_image_generation_prompts: true,
      include_plain_text_summary: true,
      include_storyboard_attachment_manifest: true,
      generate_primary_portrait_prompt: true,
    },
  };

  return [
    "Generate the character visual bible for exactly ONE character using the following input",
    "(matches this skill's schemas/input.schema.json shape):",
    JSON.stringify(inputPayload, null, 2),
    ...(appearanceDirective
      ? [
          `MANDATORY appearance directive for this character's role: ${appearanceDirective} ` +
            "Weave this into primary_portrait_prompt, turnaround_prompt, full_body_prompt, " +
            "expression_sheet_prompt, and outfit_sheet_prompt — every generated prompt for this " +
            "character must reflect it.",
        ]
      : []),
    VD_SOLO_PORTRAIT_INSTRUCTION,
    `Also append these solo-portrait negative terms to every generated negative_prompt: "${VD_SOLO_PORTRAIT_NEGATIVE_TERMS}".`,
    VD_CINEMATIC_LANGUAGE_INSTRUCTION,
    // Two-tier identity lock (2026-07-06 prompt-safety upgrade): this
    // character's portrait/turnaround/full-body/expression/outfit prompts are
    // the CANONICAL identity reference every downstream generation (start
    // frames, angle grids, repairs) will lock onto — this instruction keeps
    // every one of these initial prompts internally consistent about which
    // traits are the persistent identity anchor vs. the free-to-vary staging.
    VD_CHARACTER_LOCK_INSTRUCTION,
    buildTargetAudienceRegionInstruction(params.targetAudienceRegion),
    "Return ONLY the JSON object described in your instructions — no markdown fences, no commentary.",
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Model resolution — reuse the story-bible resolver (generic "best model     */
/* with structured-output support" selection, not story-bible-specific).     */
/* -------------------------------------------------------------------------- */

export const resolveCharacterVisualBibleModel = resolveStoryBibleModel;

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

export interface GenerateCharacterVisualPromptsResult {
  portraitPrompt: string;
  negativePrompt: string | undefined;
  /**
   * 360/multi-angle "character sheet" turnaround prompt, for reference imagery
   * that prevents likeness drift across scenes. Read from the same LLM
   * response as `portraitPrompt` (`turnaround_prompt`, see skill.md's own
   * example output). Falls back to a portrait-derived turnaround instruction
   * when the LLM response omits the field, so this degrades gracefully
   * instead of failing the whole call.
   */
  turnaroundPrompt: string;
  /** Full-body pose prompt — for the full-spec Character Sheet. Falls back to
   *  a portrait-derived instruction when the LLM omits it. */
  fullBodyPrompt: string;
  /** Facial-expression grid prompt — for the full-spec Character Sheet. */
  expressionSheetPrompt: string;
  /** Outfit-variation prompt — for the full-spec Character Sheet. */
  outfitSheetPrompt: string;
  raw: CharacterVisualBibleOutput;
  creditsUsed: number;
  model: string;
}

/**
 * Generate a character's image-generation prompt pack (primary portrait
 * prompt + negative prompt, plus the full validated visual-bible payload)
 * via a real LLM call using the `vertical-drama-character-visual-bible`
 * skill's markdown body as the system prompt. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateStoryBible`'s check-credits -> call -> deduct-credits convention.
 *
 * This does NOT render an image — it only produces the prompt. Image
 * rendering (and its own separate credit charge) is the caller's
 * responsibility via `mediaGenerationService`.
 */
export async function generateCharacterVisualPrompts(
  params: GenerateCharacterVisualPromptsParams,
): Promise<GenerateCharacterVisualPromptsResult> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveCharacterVisualBibleModel();
  const systemPrompt = loadCharacterVisualBibleSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Single-character payload (portrait/turnaround/full-body/expression/
  // outfit prompts + attachment_package) — smaller than the multi-shot
  // storyboard/start-frame planners, but shares the same fragile
  // executeWithFallback+extractJson pattern, so it gets the same
  // one-retry-on-truncated/invalid-JSON safety net.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    userId: params.userId,
    maxTokens: 3500,
    schema: characterVisualBibleOutputSchema,
    label: "Character visual bible",
  });

  const characters = validatedData.characters;
  const matched =
    characters.find((c) => c.character_id === params.characterKey) ?? characters[0];

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
    description: `Vertical Drama — generate character visual prompts (character #${params.characterId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_character_visual_bible",
      seriesId: params.seriesId,
      characterId: params.characterId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  const turnaroundPrompt =
    matched.turnaround_prompt ??
    `${matched.primary_portrait_prompt}, 360 degree turnaround, multiple angles, consistent identity`;
  const fullBodyPrompt =
    matched.full_body_prompt ??
    `${matched.primary_portrait_prompt}, full body, standing pose, head to toe visible`;
  const expressionSheetPrompt =
    matched.expression_sheet_prompt ??
    `${matched.primary_portrait_prompt}, grid of facial expressions: neutral, happy, surprised, sad, thinking`;
  const outfitSheetPrompt =
    matched.outfit_sheet_prompt ??
    `${matched.primary_portrait_prompt}, wearing their signature outfit, full body`;

  // Defensive merge (belt-and-suspenders alongside the system/user-prompt
  // instructions above): guarantee the solo-portrait negative terms are
  // present even if the LLM response omits them, for every one of the three
  // generation paths (portrait/turnaround/sheet) that read this single
  // `negative_prompt` field.
  const negativePrompt = [matched.negative_prompt, VD_SOLO_PORTRAIT_NEGATIVE_TERMS]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");

  return {
    portraitPrompt: matched.primary_portrait_prompt,
    negativePrompt,
    turnaroundPrompt,
    fullBodyPrompt,
    expressionSheetPrompt,
    outfitSheetPrompt,
    raw: validatedData,
    creditsUsed,
    model,
  };
}
