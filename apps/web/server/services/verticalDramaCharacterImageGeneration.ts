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
import {
  VD_CHARACTER_LOCK_INSTRUCTION,
  VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT,
} from "@shared/verticalDramaSeries/characterLock";

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
    // Optional — same rationale as the sibling prompt fields above: nothing
    // in `generateCharacterVisualPrompts` reads `attachment_package` (it is
    // pass-through-only bookkeeping data for the storyboard handoff), yet it
    // was required (`.min(1)`, no `.optional()`). Under the heavier prompt
    // added across the star-quality/solo-portrait/cinematic-language/
    // region/character-lock instructions, the LLM (openai/gpt-5.4-nano)
    // reliably omits this array on both the first attempt and the retry
    // (5/5 repro runs failed schema validation, 2/5 specifically for a
    // missing/empty `attachment_package`), taking down the whole call for a
    // field the caller never consumes. Making it optional (like its unused
    // siblings) removes that failure mode without loosening validation of
    // any field actually used downstream.
    attachment_package: z.array(z.record(z.string(), z.unknown())).min(1).optional(),
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

export type CharacterRoleTier =
  | "child"
  | "lead_female"
  | "lead_male"
  | "lead"
  | "villain_female"
  | "villain_male"
  | "villain"
  | "support"
  | "other";

/** Keyword lists, lower-cased, Thai + English. Order matters: the gendered
 *  lead keywords are checked before the generic lead keywords so e.g.
 *  "female lead / antagonist" combos resolve to the more specific tier
 *  first, and gendered leads resolve before the ungendered "lead" fallback. */
const LEAD_FEMALE_KEYWORDS = [
  "นางเอก",
  "female lead",
  "leading lady",
  "heroine",
];
const LEAD_MALE_KEYWORDS = [
  "พระเอก",
  "male lead",
  "leading man",
];
const LEAD_GENERIC_KEYWORDS = [
  "คู่หลัก",
  "ตัวหลัก",
  "ตัวเอก",
  "protagonist",
  "lead role",
];
/** Gendered villain keywords, checked before the generic villain fallback —
 *  same precedence convention as the gendered lead keywords above. */
const VILLAIN_FEMALE_KEYWORDS = [
  "ตัวร้ายหญิง",
  "นางร้าย",
  "female antagonist",
  "female villain",
];
const VILLAIN_MALE_KEYWORDS = [
  "ตัวร้ายชาย",
  "วายร้ายชาย",
  "male antagonist",
  "male villain",
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

/** Thai + English child-role keywords. Checked against BOTH the role string
 *  and the character's description (age is more often stated in the
 *  description than the role field) — see `resolveCharacterRoleTier`. */
const CHILD_KEYWORDS = [
  "เด็กชาย",
  "เด็กหญิง",
  "เด็ก",
  "child",
  "kid",
];
/** Gendered child-description keywords, used only to pick a gender-aware
 *  pronoun/wording hint for the child directive — detection of the child
 *  tier itself never depends on gender. */
const CHILD_MALE_KEYWORDS = ["เด็กชาย", "boy"];
const CHILD_FEMALE_KEYWORDS = ["เด็กหญิง", "girl"];

/** A role/description string mentions a child-with-age pattern like
 *  "boy, age 8" or "girl age 9" — used by `CHILD_KEYWORDS` age-adjacent
 *  matching alongside the explicit Thai/English child nouns above. */
const CHILD_AGE_ADJACENT_PATTERN = /\b(boy|girl)\b[^.]{0,20}\b\d{1,2}\b/i;

/* -------------------------------------------------------------------------- */
/* Age extraction — child-safety detection (2026-07 archetype extension).     */
/* -------------------------------------------------------------------------- */

/** Thai digit → Arabic digit map, for descriptions that spell ages with Thai
 *  numerals (๐-๙) instead of Arabic ones. */
const THAI_DIGIT_MAP: Record<string, string> = {
  "๐": "0",
  "๑": "1",
  "๒": "2",
  "๓": "3",
  "๔": "4",
  "๕": "5",
  "๖": "6",
  "๗": "7",
  "๘": "8",
  "๙": "9",
};

/** Thai number-words 1-19 (the range that matters for child-age detection —
 *  no vertical-drama character description spells out a two-digit compound
 *  above "สิบเก้า" (19) in prose; ages 20+ are always adults anyway so a
 *  missed higher compound word never causes a false negative for the child
 *  tier). Longest-key-first iteration avoids "สิบ" (10) matching inside
 *  "สิบสอง" (12) before the more specific compound is tried. */
const THAI_NUMBER_WORDS: Record<string, number> = {
  "สิบเก้า": 19,
  "สิบแปด": 18,
  "สิบเจ็ด": 17,
  "สิบหก": 16,
  "สิบห้า": 15,
  "สิบสี่": 14,
  "สิบสาม": 13,
  "สิบสอง": 12,
  "สิบเอ็ด": 11,
  "สิบ": 10,
  "เก้า": 9,
  "แปด": 8,
  "เจ็ด": 7,
  "หก": 6,
  "ห้า": 5,
  "สี่": 4,
  "สาม": 3,
  "สอง": 2,
  "หนึ่ง": 1,
};

function normalizeThaiDigits(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => THAI_DIGIT_MAP[d] ?? d);
}

/**
 * Extract the youngest plausible age (in years) mentioned in a free-text
 * role/description string, or `undefined` if no age is found. Understands:
 *  - Arabic numerals: "12 ปี", "อายุ 12", "12-year-old", "age 12", "12 years old"
 *  - Thai numerals (๐-๙): normalized to Arabic before matching
 *  - Thai number-words: "สิบสองปี" (twelve years), "อายุสิบขวบ" (age ten)
 *
 * Deliberately conservative/best-effort — this only needs to reliably catch
 * ages under ~15 for the child-safety tier (see `resolveCharacterRoleTier`);
 * it is not a general-purpose NLP age parser. Returns the smallest match when
 * multiple age-like numbers appear (favors the safer/younger interpretation).
 */
export function extractAgeFromDescription(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const normalized = normalizeThaiDigits(text);
  const candidates: number[] = [];

  // Arabic-numeral patterns: "12 ปี", "อายุ 12", "12-year-old", "age 12", "12 years old", "12 ขวบ".
  // NOTE: no trailing `\b` after a Thai-script suffix (ปี/ขวบ) — `\b` relies on
  // JS regex's ASCII-only `\w` definition, which does not treat Thai
  // characters as word characters, so "\b" directly after Thai script does
  // not reliably assert a boundary the way it does after Latin letters.
  const arabicPatterns = [
    /(\d{1,2})\s*(?:ปี|ขวบ)/g,
    /อายุ\s*(\d{1,2})(?!\d)/g,
    /\b(\d{1,2})[\s-]*year(?:s)?[\s-]*old\b/gi,
    /\bage[d]?\s*[:\-]?\s*(\d{1,2})\b/gi,
  ];
  for (const pattern of arabicPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 99) candidates.push(value);
    }
  }

  // Thai number-words: "สิบสองปี" (twelve years), "อายุสิบขวบ" (age ten). Built
  // as a SINGLE alternation (longest keys first, per THAI_NUMBER_WORDS'
  // declaration order) so the regex engine's leftmost-longest-alternative
  // behavior picks "สิบสอง" over the shorter "สอง" substring it contains,
  // rather than each word being tested independently (which would let both
  // match and the wrong/smaller number win via `Math.min`).
  const numberWordKeys = Object.keys(THAI_NUMBER_WORDS);
  const numberWordPattern = new RegExp(`(${numberWordKeys.join("|")})\\s*(?:ปี|ขวบ)`, "g");
  for (const match of normalized.matchAll(numberWordPattern)) {
    const value = THAI_NUMBER_WORDS[match[1]];
    if (value !== undefined) candidates.push(value);
  }

  if (candidates.length === 0) return undefined;
  return Math.min(...candidates);
}

/** Age (in years, exclusive upper bound) at/above which a character is no
 *  longer routed to the child-safety tier purely on age grounds. */
const CHILD_AGE_THRESHOLD = 15;

/**
 * True when `text` (role and/or description, already lower-cased by the
 * caller) contains an explicit child-role keyword (เด็ก, เด็กชาย, เด็กหญิง,
 * child, kid) or a "boy/girl + nearby number" pattern.
 */
function containsChildKeyword(normalizedText: string): boolean {
  if (CHILD_KEYWORDS.some((kw) => normalizedText.includes(kw))) return true;
  return CHILD_AGE_ADJACENT_PATTERN.test(normalizedText);
}

/**
 * Detect a gender hint for a child character from description/role text —
 * used only to word the child directive naturally (e.g. "boy"/"girl"), never
 * to decide whether the child tier applies at all.
 */
export function detectChildGenderHint(text: string | null | undefined): "male" | "female" | undefined {
  if (!text) return undefined;
  const normalized = text.toLowerCase();
  if (CHILD_FEMALE_KEYWORDS.some((kw) => normalized.includes(kw))) return "female";
  if (CHILD_MALE_KEYWORDS.some((kw) => normalized.includes(kw))) return "male";
  return undefined;
}

/**
 * Map a free-text role string (Thai or English, whatever ops/writers typed
 * into `verticalDramaCharacters.role`) — plus, optionally, the character's
 * free-text `description` — to a coarse tier that drives how much "star
 * quality"/archetype styling the portrait-prompt directive demands.
 * Keyword-based, case-insensitive, whitespace-tolerant — matches on
 * substrings so "พระเอกวัยรุ่น" or "Male Lead (age 20s)" both resolve
 * correctly.
 *
 * Tier precedence (highest first): **`child`** — detected from either an
 * explicit child keyword (เด็ก/เด็กชาย/เด็กหญิง/child/kid, in role OR
 * description) or a description-stated age under `CHILD_AGE_THRESHOLD` (15) —
 * ALWAYS wins, even over an explicit ตัวเอก/นางเอก/พระเอก role label, because a
 * character being a story's lead never overrides age-appropriate depiction.
 * After that: `lead_female` / `lead_male` → `lead` → `villain_female` /
 * `villain_male` → `villain` → `support` → `other`.
 *
 * Lead roles are split into `lead_female` (นางเอก / heroine / female lead) and
 * `lead_male` (พระเอก / male lead) so each gets its own modern
 * vertical-drama archetype directive instead of a single unisex "idol" look.
 * Gender-ambiguous lead phrasing (คู่หลัก, ตัวเอก, protagonist, "lead role")
 * falls back to the neutral `lead` tier. Villains follow the same
 * gendered/neutral pattern (`villain_female` / `villain_male` / `villain`).
 *
 * Exported + unit-tested directly (see
 * `__tests__/verticalDramaCharacterImageGeneration.test.ts`).
 */
export function resolveCharacterRoleTier(
  role: string | null | undefined,
  description?: string | null,
): CharacterRoleTier {
  const normalizedRole = (role ?? "").trim().toLowerCase();
  const normalizedDescription = (description ?? "").trim().toLowerCase();
  const combined = `${normalizedRole} ${normalizedDescription}`.trim();

  // Child-safety tier — highest precedence, checked first, wins even over an
  // explicit lead/villain role label.
  if (combined) {
    if (containsChildKeyword(combined)) return "child";
    const age = extractAgeFromDescription(combined);
    if (age !== undefined && age < CHILD_AGE_THRESHOLD) return "child";
  }

  if (!normalizedRole) return "other";

  if (LEAD_FEMALE_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "lead_female";
  if (LEAD_MALE_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "lead_male";
  if (LEAD_GENERIC_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "lead";
  if (VILLAIN_FEMALE_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "villain_female";
  if (VILLAIN_MALE_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "villain_male";
  if (VILLAIN_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "villain";
  if (SUPPORT_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "support";
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
  child: (
    "Age-appropriate and memorable child character: expressive eyes, curious gaze, natural " +
    "childlike charm, brave but vulnerable expression, clever observant personality, simple " +
    "modest everyday outfit, natural hairstyle; realistic skin. This character MUST be depicted " +
    "strictly age-appropriately — no adult styling, no glamour, no romantic framing — " +
    "REGARDLESS of any 'lead'/'ตัวเอก'/'นางเอก'/'พระเอก' role label; the described child age " +
    "always wins and is never changed or aged up."
  ),
  lead_female: (
    "Modern vertical-drama heroine (นางเอก): emotionally magnetic, natural beauty with strong " +
    "screen presence, expressive eyes capable of tears, vulnerable yet determined expression, " +
    "soft delicate features, relatable but unforgettable, quiet strength, romantic-drama " +
    "tension; simple elegant outfit; realistic skin texture. Apply this WITHIN the age and " +
    "identity already given in the character's description — never change or imply an " +
    "older/younger age than described."
  ),
  lead_male: (
    "Modern vertical-drama male lead (พระเอก): magnetic and intense, cold-CEO energy, sharp " +
    "realistic facial structure, intense eyes, quiet dominance, protective yet intimidating, " +
    "emotionally restrained with hidden pain; dark elegant outfit; realistic skin texture. " +
    "Apply this WITHIN the age and identity already given in the character's description — " +
    "never change or imply an older/younger age than described."
  ),
  lead: (
    "Modern vertical-drama lead (gender-neutral): emotionally magnetic with strong screen " +
    "presence, natural realistic features with quiet intensity, expressive eyes, relatable but " +
    "unforgettable, understated elegant styling; realistic skin texture. Apply this WITHIN the " +
    "age and identity already given in the character's description — never change or imply an " +
    "older/younger age than described."
  ),
  villain_female: (
    "Modern vertical-drama female antagonist (ตัวร้ายหญิง/นางร้าย): beautiful and sharp-featured, " +
    "elegant high-status aura, refined features, confident gaze, subtle half-smile, emotionally " +
    "controlled expression, hidden agenda, quiet calculation, polished high-society rival " +
    "energy, elegant tension; realistic skin."
  ),
  villain_male: (
    "Modern vertical-drama male antagonist (ตัวร้ายชาย): dangerously attractive, sharp predatory " +
    "gaze, calm but threatening presence, faint manipulative smile, elegant menace, quiet " +
    "intimidation, luxury villain energy, dark tailored suit, controlled dominant posture; " +
    "realistic skin."
  ),
  villain: (
    "Striking antagonist: strikingly attractive but with a sharp, cold, dangerous aura " +
    "(elegant menace, not cartoonish evil) — magnetic and photogenic, not merely attractive-neutral."
  ),
  support: undefined,
  other: undefined,
};

/** Negative-prompt terms to merge in for tiers that need to actively steer
 *  the image model away from the wrong look — a "fashion model / corporate
 *  portrait" look for star-quality tiers, a "cartoon villain" look for
 *  antagonist tiers, or (for `child`) any adult/glamour styling at all. The
 *  neutral `villain` fallback and support/other tiers have no special
 *  negatives (`undefined`). */
const ROLE_TIER_NEGATIVE_TERMS: Record<CharacterRoleTier, string | undefined> = {
  child: VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT,
  lead_female: "fashion model look, corporate portrait, over-glam makeup, plastic skin, generic pretty face",
  lead_male: "model photoshoot, corporate portrait, influencer smile, boyband look, generic handsome face",
  lead: "fashion model look, corporate portrait, over-glam makeup, plastic skin, generic pretty/handsome face",
  villain_female:
    "exaggerated evil face, fantasy villain styling, overly seductive styling, revealing outfit, " +
    "beauty pageant pose, generic influencer look, plastic skin",
  villain_male:
    "cartoon villain, exaggerated anger, fantasy costume, generic handsome model, corporate portrait, " +
    "plastic skin",
  villain: undefined,
  support: undefined,
  other: undefined,
};

/** Returns the directive string for a role (and optional description, used
 *  for child-safety/gender-aware tier detection — see
 *  `resolveCharacterRoleTier`), or `undefined` when the tier has no special
 *  directive (support/other) — callers should omit the field. */
export function getRoleTierAppearanceDirective(
  role: string | null | undefined,
  description?: string | null,
): string | undefined {
  const tier = resolveCharacterRoleTier(role, description);
  return ROLE_TIER_DIRECTIVES[tier];
}

/** Returns the tier-specific negative-prompt terms to merge for a role (and
 *  optional description), or `undefined` when the tier has no special
 *  negatives (support/other/neutral-villain). */
export function getRoleTierNegativeTerms(
  role: string | null | undefined,
  description?: string | null,
): string | undefined {
  const tier = resolveCharacterRoleTier(role, description);
  return ROLE_TIER_NEGATIVE_TERMS[tier];
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
  const appearanceDirective = getRoleTierAppearanceDirective(params.role, params.description);
  const tierNegativeTerms = getRoleTierNegativeTerms(params.role, params.description);
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
    ...(tierNegativeTerms
      ? [
          `Also append these role-appearance negative terms to every generated negative_prompt: "${tierNegativeTerms}".`,
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
  // instructions above): guarantee the solo-portrait negative terms AND the
  // role-tier appearance negatives (e.g. "fashion model look, corporate
  // portrait" for leads) are present even if the LLM response omits them,
  // for every one of the three generation paths (portrait/turnaround/sheet)
  // that read this single `negative_prompt` field.
  const negativePrompt = [
    matched.negative_prompt,
    getRoleTierNegativeTerms(params.role, params.description),
    VD_SOLO_PORTRAIT_NEGATIVE_TERMS,
  ]
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
