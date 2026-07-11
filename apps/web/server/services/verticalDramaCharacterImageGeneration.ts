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
import { renderCriteriaVersionMarker } from "./verticalDramaQualityCriteria";
import {
  buildTargetAudienceRegionInstruction,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import { VD_CHARACTER_LOCK_INSTRUCTION } from "@shared/verticalDramaSeries/characterLock";
// Preset visual identity flow-through (spec §8.2.2 flow-through rule,
// section-15 change D, added 2026-07-07) — imported DIRECTLY from the
// submodule (not the shared barrel, which does not yet re-export it), same
// convention as `verticalDramaPresetSynthesis.ts`. This module never
// re-decides the flag — the router resolves `presetVisualIdentity` (undefined
// when the tenant's `verticalDramaSeriesPresetMixV2` flag is off) and passes
// it straight through; this file only threads it into the prompt when present.
import {
  verticalDramaPresetVisualIdentitySchema,
  type VerticalDramaPresetCharacterArchetype,
  type VerticalDramaPresetVisualIdentity,
} from "@shared/verticalDramaSeries/presetVisualIdentity";
// Face reference locking (planning/vertical-drama-character-variants/plan.md
// Phase C) — reuses the SAME `getPrimaryPortraitUrl` resolution every other
// consumer (storyboard, start-frame) already goes through; no new resolution
// path. `verticalDramaCharacterStock.ts` does not import this module, so this
// is a one-directional dependency — no circular-import risk.
import {
  verticalDramaCharacterStockService,
  type VerticalDramaCharacterStockOwner,
} from "./verticalDramaCharacterStock";

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
    // REQUIRED (matches schemas/output.schema.json's own `required` list,
    // and skill.md's "Required prompt fields" section) — these four used to
    // be `.optional()` with a code-authored fallback (`${primary_portrait_prompt},
    // <hardcoded suffix>`) whenever the LLM omitted them, the same
    // "code invents a fallback for an unreliable skill" anti-pattern the
    // `repair_queue`/`storyboard_handoff_json` incidents this session
    // already fixed via a better skill.md example rather than a code
    // fallback (vertical-drama-skill-first-architecture plan, Phase 2, item
    // 3). skill.md's own worked example has always shown all four populated
    // with concrete, non-empty prompts; the fix here is enforcing that via
    // schema + an explicit "never omit" instruction, not inventing text in
    // code when the model under-delivers.
    turnaround_prompt: z.string().min(1),
    full_body_prompt: z.string().min(1),
    expression_sheet_prompt: z.string().min(1),
    outfit_sheet_prompt: z.string().min(1),
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
/* Role-tier classification — kept as a pure, exported, unit-tested keyword    */
/* classifier for callers that need a role-tier LABEL for non-prompt purposes  */
/* (e.g. UI display, analytics). As of the vertical-drama-skill-first-        */
/* architecture plan (Phase 2, item 1), this module no longer feeds the       */
/* result into the LLM prompt as a "MANDATORY... authoritative" directive —    */
/* `skills/vertical-drama-character-visual-bible/skill.md`'s own role-tier    */
/* archetype table (including the same child-precedence rule) is now the      */
/* SOLE author of that appearance guidance. The removed `ROLE_TIER_DIRECTIVES`/ */
/* `ROLE_TIER_NEGATIVE_TERMS` code constants used to duplicate — and override  */
/* — the skill's own judgment; see the plan doc for the full incident.        */
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
  if (LEAD_GENERIC_KEYWORDS.some((kw) => normalizedRole.includes(kw))) {
    const isFemale = [
      "หญิง",
      "แม่",
      "สาว",
      "นาง",
      "woman",
      "female",
      "mother",
      "lady",
      "girl",
    ].some((kw) => combined.includes(kw));
    const isMale = [
      "ชาย",
      "พ่อ",
      "หนุ่ม",
      "นาย",
      "man",
      "male",
      "father",
      "guy",
      "boy",
    ].some((kw) => combined.includes(kw));
    if (isFemale && !isMale) return "lead_female";
    if (isMale && !isFemale) return "lead_male";
    return "lead";
  }
  if (VILLAIN_FEMALE_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "villain_female";
  if (VILLAIN_MALE_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "villain_male";
  if (VILLAIN_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "villain";
  if (SUPPORT_KEYWORDS.some((kw) => normalizedRole.includes(kw))) return "support";
  return "other";
}

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
  /**
   * Preset visual identity flow-through (spec §8.2.2 flow-through rule,
   * section-15 change D) — the series' STAMPED `bible.presetVisualIdentity`
   * (see `readPresetVisualIdentityFromBible` / `verticalDramaSeries.ts`'s
   * `create`), already flag-gated by the caller (undefined when the
   * tenant's `verticalDramaSeriesPresetMixV2` flag is off, or the series
   * carries no preset identity — legacy tolerant). When present, the raw
   * facts (`styleName`/`palette`/`wardrobeGrammar`/matched archetype `look`)
   * are sent to the skill as a `preset_visual_identity` input field — the
   * skill itself (not this module) weaves them into every generated prompt
   * (portrait/turnaround/full-body/expression/outfit); see skill.md's
   * "Preset visual identity" section.
   */
  presetVisualIdentity?: VerticalDramaPresetVisualIdentity;
  /**
   * Face-reference input for a variant/twin character row
   * (planning/vertical-drama-character-variants/plan.md Phase C) — resolved
   * by the caller via `resolveFaceSourceReferenceForCharacter` (below) from
   * the character row's `parentCharacterId`/`sharesFaceWithCharacterId`.
   * Sent to the skill as a `face_source_reference` FACT object (raw facts
   * only — the skill's own "Face reference locking" section in skill.md is
   * the sole author of how these facts get woven into prose, same
   * "code supplies facts, never authored instruction text" convention as
   * `presetVisualIdentity` above). `undefined`/`null` for a standalone
   * character (today's default, unchanged) — the vast majority of rows.
   */
  faceSourceReference?: {
    imageUrl: string;
    lockStrength: "hard" | "loose";
    relationshipNote: string;
  } | null;
}

/**
 * Reads `bible.presetVisualIdentity` (stamped by `verticalDramaSeries.ts`'s
 * `create` — spec §8.2.2 flow-through rule, section-15 change C) off an
 * already-loaded series bible. Best-effort: returns `undefined` for a
 * legacy/non-preset series (key absent) or a malformed value — never
 * throws, this is an enrichment, never a required field.
 */
export function readPresetVisualIdentityFromBible(
  bible: Record<string, unknown> | null | undefined,
): VerticalDramaPresetVisualIdentity | undefined {
  const raw = (bible as { presetVisualIdentity?: unknown } | null | undefined)?.presetVisualIdentity;
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = verticalDramaPresetVisualIdentitySchema.safeParse(raw);
  return parsed.success ? (parsed.data as VerticalDramaPresetVisualIdentity) : undefined;
}

/**
 * Minimal shape this resolver needs off a `vertical_drama_characters` row —
 * a `Pick` of `drizzle/schema.ts`'s `VerticalDramaCharacterRow` rather than
 * importing the full row type, so this module stays decoupled from the
 * Drizzle schema import graph (callers pass their already-loaded row
 * straight through; any object with these four fields satisfies this type).
 */
export interface VerticalDramaCharacterVariantFields {
  parentCharacterId: number | null;
  variantType: string | null;
  sharesFaceWithCharacterId: number | null;
}

/** Result shape returned by `resolveFaceSourceReferenceForCharacter`, and the
 *  same shape `GenerateCharacterVisualPromptsParams.faceSourceReference`
 *  expects — kept as a named type so callers (the router) can type a local
 *  variable without re-declaring the inline object type. */
export type VerticalDramaFaceSourceReference = NonNullable<
  GenerateCharacterVisualPromptsParams["faceSourceReference"]
>;

/**
 * Resolves the face-reference input for a character row that is a variant
 * or twin of another character (planning/vertical-drama-character-variants/
 * plan.md Phase C). Reuses `getPrimaryPortraitUrl` — the SAME identity-lock
 * resolution point every other consumer (storyboard, start-frame) already
 * goes through — never a new/parallel resolution path.
 *
 * Three cases, checked in this order:
 * 1. `sharesFaceWithCharacterId` set (a twin) — resolve THAT character's
 *    approved portrait, `lockStrength: "hard"`, twin-flavored
 *    `relationshipNote`.
 * 2. `parentCharacterId` set (a variant) — resolve the PARENT's approved
 *    portrait; `lockStrength` follows `variantType`: `"outfit"` → `"hard"`,
 *    `"age_stage"` → `"loose"` (any other/missing `variantType` on a variant
 *    row falls back to `"hard"`, the safer/stricter default).
 * 3. Neither set (a standalone character or a parent itself — today's
 *    default, the vast majority of rows) — returns `null`, meaning
 *    `generateCharacterVisualPrompts` gets no `faceSourceReference` and
 *    produces byte-identical prompts to before this feature existed.
 *
 * Also returns `null` (rather than throwing) when the referenced
 * character has no approved portrait yet (e.g. the parent/twin-source row's
 * own portrait hasn't been generated first) — this is a legitimate ordering
 * case (the caller may generate the source portrait after the variant row is
 * created), not an error; the variant's portrait generation simply proceeds
 * without a face reference that round, same as a standalone character.
 */
export async function resolveFaceSourceReferenceForCharacter(
  owner: VerticalDramaCharacterStockOwner,
  characterRow: VerticalDramaCharacterVariantFields,
): Promise<VerticalDramaFaceSourceReference | null> {
  if (characterRow.sharesFaceWithCharacterId != null) {
    const imageUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
      owner,
      characterRow.sharesFaceWithCharacterId,
    );
    if (!imageUrl) return null;
    return {
      imageUrl,
      lockStrength: "hard",
      relationshipNote: "twin sibling — face must match exactly, styling must be clearly distinct",
    };
  }

  if (characterRow.parentCharacterId != null) {
    const imageUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
      owner,
      characterRow.parentCharacterId,
    );
    if (!imageUrl) return null;
    if (characterRow.variantType === "age_stage") {
      return {
        imageUrl,
        lockStrength: "loose",
        relationshipNote: "age-stage variant of the same person, different life stage",
      };
    }
    // "outfit" (or any other/missing variantType on a variant row — the
    // safer/stricter default) — same-age outfit variant, hard face lock.
    return {
      imageUrl,
      lockStrength: "hard",
      relationshipNote: "outfit variant of the same person, different scene context",
    };
  }

  return null;
}

/**
 * Picks the `characterArchetypes` entry whose `role` best matches this
 * character's own `role`/`description` (bidirectional, case-insensitive
 * substring containment — archetype roles are often compound, e.g.
 * "นางเอก/องครักษ์ป่า", so each `/`-or-`,`-separated part is checked
 * individually). Falls back to the FIRST archetype when nothing matches —
 * a generic "this preset's dominant look" anchor is still better than none
 * — and to `undefined` only when the identity has no archetypes at all.
 */
export function pickMatchingCharacterArchetype(
  identity: VerticalDramaPresetVisualIdentity,
  role: string | null | undefined,
  description?: string | null,
): VerticalDramaPresetCharacterArchetype | undefined {
  if (identity.characterArchetypes.length === 0) return undefined;
  const haystack = `${role ?? ""} ${description ?? ""}`.trim().toLowerCase();
  if (haystack) {
    const matched = identity.characterArchetypes.find((archetype) =>
      archetype.role
        .toLowerCase()
        .split(/[/,]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .some((part) => haystack.includes(part) || part.includes(haystack)),
    );
    if (matched) return matched;
  }
  return identity.characterArchetypes[0];
}

/**
 * Builds the preset-visual-identity FACT object added to the skill's input
 * payload (spec §8.2.2 flow-through rule, section-15 change D) — raw facts
 * only (`style_name`/`palette`/`wardrobe_grammar`/`matched_archetype_look`),
 * never an authored connective sentence. `skill.md`'s "Preset visual
 * identity" section is the sole author of how these facts get woven into
 * prose (vertical-drama-skill-first-architecture plan, Phase 2, item 4 — this
 * function used to return a pre-written instruction string; the code cannot
 * invent that prose, only supply the ground-truth facts the LLM can't know
 * on its own). Only called when `identity` is supplied (caller omits the
 * field entirely when the flag is off or the series carries no preset
 * identity).
 */
function buildPresetVisualIdentityFacts(
  identity: VerticalDramaPresetVisualIdentity,
  role: string | null | undefined,
  description?: string | null,
): {
  style_name: string;
  palette: string[];
  wardrobe_grammar: string[];
  matched_archetype_look?: string;
} {
  const archetype = pickMatchingCharacterArchetype(identity, role, description);
  return {
    style_name: identity.styleName,
    palette: identity.palette,
    wardrobe_grammar: identity.wardrobeGrammar,
    ...(archetype ? { matched_archetype_look: archetype.look } : {}),
  };
}

export function buildCharacterVisualPromptsUserPrompt(params: GenerateCharacterVisualPromptsParams): string {
  const inputPayload = {
    characters: [
      {
        character_id: params.characterKey,
        name: params.name,
        role: params.role ?? "supporting",
        ...(params.description ? { description: params.description } : {}),
      },
    ],
    story_context: buildStoryContextString(params.storyContext),
    output_options: {
      include_image_generation_prompts: true,
      include_plain_text_summary: true,
      include_storyboard_attachment_manifest: true,
      generate_primary_portrait_prompt: true,
    },
    ...(params.presetVisualIdentity
      ? {
          preset_visual_identity: buildPresetVisualIdentityFacts(
            params.presetVisualIdentity,
            params.role,
            params.description,
          ),
        }
      : {}),
    ...(params.faceSourceReference
      ? {
          face_source_reference: {
            image_url: params.faceSourceReference.imageUrl,
            lock_strength: params.faceSourceReference.lockStrength,
            relationship_note: params.faceSourceReference.relationshipNote,
          },
        }
      : {}),
  };

  return [
    renderCriteriaVersionMarker(),
    "Generate the character visual bible for exactly ONE character using the following input",
    "(matches this skill's schemas/input.schema.json shape). Derive this character's role",
    "tier (child/lead/villain/support) and every appearance/negative-prompt directive from",
    "your own role-tier archetype table and instructions — the input below carries only facts,",
    "no pre-authored appearance directive:",
    JSON.stringify(inputPayload, null, 2),
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
   * that prevents likeness drift across scenes. Read directly from the LLM
   * response (`turnaround_prompt`, REQUIRED per `schemas/output.schema.json`
   * and skill.md's own "Required prompt fields" section — a schema-validation
   * failure now surfaces as `VdSchemaValidationError` if the model omits it,
   * rather than the code silently inventing a fallback value).
   */
  turnaroundPrompt: string;
  /** Full-body pose prompt — for the full-spec Character Sheet. Required;
   *  see `turnaroundPrompt`'s doc comment. */
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
  const userPrompt = buildCharacterVisualPromptsUserPrompt(params);

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

  // Read directly from the LLM response — no code-authored fallback. These
  // four fields are REQUIRED by `characterVisualBibleCharacterSchema` (see
  // above), so `matched.turnaround_prompt` etc. are already guaranteed
  // non-empty strings by the time execution reaches here; a model that omits
  // them fails schema validation (`VdSchemaValidationError`) upstream instead
  // of silently receiving a code-invented prompt (vertical-drama-skill-first-
  // architecture plan, Phase 2, item 3).
  const turnaroundPrompt = matched.turnaround_prompt;
  const fullBodyPrompt = matched.full_body_prompt;
  const expressionSheetPrompt = matched.expression_sheet_prompt;
  const outfitSheetPrompt = matched.outfit_sheet_prompt;

  // Merge in the preset visual identity's own `imagePromptFragments.negative`
  // (spec §8.2.2 flow-through rule, section-15 change D) — this is a
  // ground-truth data flow-through (the raw fact array the LLM was given as
  // input), not code-authored text, so it stays. The role-tier negative
  // terms and solo-portrait negative terms that used to be force-merged here
  // are now solely the skill's responsibility (skill.md's role-tier table and
  // "Solo-portrait identity reference" section instruct it to include them in
  // `negative_prompt` itself) — trust the skill's own output.
  const negativePrompt = [
    matched.negative_prompt,
    params.presetVisualIdentity?.imagePromptFragments.negative.join(", "),
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
