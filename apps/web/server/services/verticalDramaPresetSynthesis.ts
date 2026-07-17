/**
 * Vertical Drama Series — AI-assisted Mix and Match preset synthesis.
 *
 * Takes several selected preset/category "flavors" and returns one coherent
 * editable draft in the same shape the Create Series wizard already applies.
 * No database writes happen here; callers decide whether to apply the draft.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  genrePresetCategoryLabel,
  verticalDramaLocaleEnglishName,
  clampToCreateSeriesLimit,
  CREATE_SERIES_FIELD_LIMITS,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
// Preset Mix v2 (spec §8.2.2.C / section-15, added 2026-07-07) — imported
// DIRECTLY from the submodule (not the shared barrel, which does not yet
// re-export it), per section-15: this is the ONE canonical source for the
// structured visual-identity + verifiable-blend contracts and the
// deterministic merge/coverage math. Never reimplement any of this here.
import {
  VERTICAL_DRAMA_BLEND_FACETS,
  DEFAULT_MIN_FACETS_PER_PRESET,
  mergeVisualIdentities,
  computeBlendCoverage,
  findUnderBlended,
  verticalDramaBlendFacetEntrySchema,
  verticalDramaPresetCharacterArchetypeSchema,
  type VerticalDramaBlendFacet,
  type VerticalDramaBlendFacetEntry,
  type VerticalDramaBlendReport,
  type VerticalDramaMergedVisualIdentity,
  type VerticalDramaPresetMixSelection,
  type VerticalDramaPresetMixWeight,
  type VerticalDramaPresetVisualIdentity,
  type VerticalDramaVisualIdentitySelection,
} from "@shared/verticalDramaSeries/presetVisualIdentity";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  resolveStoryBibleModel,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { debugError } from "../_core/logger";
// Feature 132 §11 "Unified Criteria Application" (plan section-01 /
// section-02 Finding 8) — every §11 consumer prompt must embed this greppable
// marker; `verticalDramaQualityCriteria.agreement.test.ts` checks for it.
import { renderCriteriaVersionMarker } from "./verticalDramaQualityCriteria";
import {
  normalizeLegacyRole,
  lenientNarrativeRoleSchema,
  lenientRoleTierSchema,
  NARRATIVE_ROLE_VALUES,
  ROLE_TIER_VALUES,
  type NarrativeRole,
  type RoleTier,
} from "@shared/verticalDramaSeries/narrativeRole";

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-preset-synthesizer");
const MIN_SELECTIONS = 2;
const MAX_SELECTIONS = 5;
const V2_SKILL_CONTRACT_MARKERS = [
  "Mix and Match v2",
  "contract_version",
  "blendFacets",
  "presetId",
  "kept",
] as const;

let cachedSystemPrompt: string | null = null;

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
    `Could not locate skill.md for "vertical-drama-preset-synthesizer" under any known skills directory`,
  );
}

// `narrativeRole`/`roleTier` use the shared LLM-response-lenient schemas
// (`@shared/verticalDramaSeries/narrativeRole`) rather than hard-required
// enums. Root cause (2026-07-14 recurring preset synthesis failure): the
// model was never told the allowed enum values (see the `rules` entries
// added in `buildUserPrompt`/`buildUserPromptV2` below), so it regularly
// guessed unrecognized/miscased labels (e.g. "second_lead", "Protagonist",
// "love_interest") and failed the whole draft on both the first attempt AND
// the schema-retry. A pure-casing miss now still parses (lowercase
// preprocess); anything else degrades to `undefined` instead of throwing —
// `normalizeSynthesizedCharacters` already backfills it from the free-text
// `role` via `normalizeLegacyRole`.
const synthesizedCharacterSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
  narrativeRole: lenientNarrativeRoleSchema,
  roleTier: lenientRoleTierSchema,
  occupation: z.string().min(1),
});

const creatorFacingCopySchema = z
  .string()
  .trim()
  .min(1)
  .max(700)
  .refine(
    value =>
      !/(?:blendFacets|facetAssignments|primaryFlavor|supportingFlavors|contract_version|preset[_ -]?id|json|snake[_ -]?case)/i.test(
        value
      ),
    "Creator-facing copy must not expose synthesis metadata",
  );

const creatorSummarySchema = z.object({
  whatItIsAbout: creatorFacingCopySchema,
  protagonistAndGoal: creatorFacingCopySchema,
  conflictAndDiscovery: creatorFacingCopySchema,
  centralMystery: creatorFacingCopySchema,
  decisionNotes: z.array(creatorFacingCopySchema).min(1).max(4),
});

const synthesizedWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

const synthesizedPresetDraftSchema = z.object({
  contract_version: z.literal(1),
  title: z.string().min(1).max(150),
  category: z.string().min(1).max(60),
  logline: z.string().min(1),
  mainPlot: z.string().min(1),
  seasonArc: z.string().min(1),
  tone: z.string().min(1).max(160),
  cliffhangerStyle: z.string().min(1).max(200),
  creatorSummary: creatorSummarySchema,
  characters: z.array(synthesizedCharacterSchema).min(3).max(8),
  visualBible: z.string().min(1),
  mixRecipe: z
    .object({
      primaryFlavor: z.string().min(1),
      supportingFlavors: z.array(z.string().min(1)).min(1),
      rationale: z.string().min(1),
    })
    .passthrough(),
  warnings: z.array(synthesizedWarningSchema),
});

export type SynthesizedGenrePresetDraft = z.infer<typeof synthesizedPresetDraftSchema>;

export interface PresetSynthesisPresetInput {
  id: string;
  title: string;
  category: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: Array<{
    name: string;
    role: string;
    description: string;
    narrativeRole?: NarrativeRole | null;
    roleTier?: RoleTier | null;
    occupation?: string | null;
  }>;
  visualBible: string;
}

export interface SynthesizeVerticalDramaPresetParams {
  userId: number;
  tenantId?: string;
  locale: VerticalDramaSeriesLocale;
  selectedPresets: PresetSynthesisPresetInput[];
  selectedCategories: string[];
  primarySelectionId?: string;
  businessContext?: string;
  productContext?: string;
  targetEpisodeCount?: number;
  toneHint?: string;
  /**
   * Feature 132 §4 (F132A) — free-form "โจทย์เรื่องที่อยากได้" creative-intent
   * input. When present (non-empty after trim), it becomes the PRIMARY story
   * spine and the selected preset(s) become supporting flavor (spec §4.3).
   * Absent/empty reproduces today's behavior byte-for-byte. The router is
   * responsible for tenant-flag gating (`verticalDramaUserPremise`) — this
   * service performs no flag check of its own, mirroring every other
   * flag-gated service in this codebase.
   */
  userPremise?: string;
}

export class PresetSynthesisInputError extends Error {
  code = "PRESET_SYNTHESIS_INPUT_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "PresetSynthesisInputError";
  }
}

/**
 * Guards the skill-first boundary for the v2 branch. The v2 request contract
 * must live in the loaded skill bundle; a user-prompt-only v2 addition is not
 * sufficient because the skill's v1 instructions would otherwise conflict
 * with it and repeatedly produce a v1-shaped response.
 */
export function assertPresetSynthesizerSkillSupportsV2(systemPrompt: string): void {
  const missing = V2_SKILL_CONTRACT_MARKERS.filter(marker => !systemPrompt.includes(marker));
  if (missing.length > 0) {
    throw new Error(
      `vertical-drama-preset-synthesizer skill is missing its v2 output contract markers: ${missing.join(", ")}`,
    );
  }
}

function clampText(value: string | undefined, maxLength: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeSynthesizedCharacters(
  characters: SynthesizedGenrePresetDraft["characters"],
): SynthesizedGenrePresetDraft["characters"] {
  return characters.map((character) => {
    const legacy = normalizeLegacyRole(character.role);
    const narrativeRole = character.narrativeRole ?? legacy.narrativeRole ?? undefined;
    const roleTier = character.roleTier ?? legacy.roleTier ?? undefined;
    return {
      ...character,
      narrativeRole,
      roleTier,
      occupation: character.occupation ?? character.role,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* User Premise & Premise-Primary Preset Mix (F132A, spec §4.3)               */
/* -------------------------------------------------------------------------- */

/**
 * Builds the conditional "USER PREMISE (PRIMARY SPINE)" instruction block
 * (spec.md §4.3, verbatim), rendered only when `userPremise` is a non-empty
 * trimmed string. Returns `null` for an absent/blank premise so callers can
 * use the `.filter(Boolean).join("\n")` idiom already used throughout the
 * vertical-drama prompt builders — an absent premise must never append
 * anything to the prompt (spec §16.1 byte-identical acceptance criterion).
 */
function buildUserPremisePrimaryBlock(userPremise: string | undefined): string | null {
  const trimmed = userPremise?.trim();
  if (!trimmed) return null;

  return [
    "USER PREMISE (PRIMARY SPINE):",
    trimmed,
    "",
    "Blending rules when a user premise is present:",
    "- The user premise is the primary story spine. Setting, protagonist, core",
    "  conflict, and direction stated by the user are non-negotiable.",
    "- The selected presets (1-5) are supporting flavor: use them to intensify",
    "  drama, sharpen tropes, add contemporary texture, and fill gaps the user",
    "  left open. Do not let any preset displace a premise-stated element.",
    "- primarySelectionId, when also provided, selects which preset contributes",
    "  the strongest *flavor*, not the spine.",
    "- If a preset directly conflicts with the premise, keep the premise and",
    "  record the dropped preset element in `warnings`.",
    "- The synthesized draft's logline and mainPlot must be traceable to the",
    "  premise: a reader comparing them side by side must see the user's story.",
  ].join("\n");
}

/** Stopwords excluded from `evaluatePremiseCoverage`'s tokenizer (Thai particles/connectives + common English function words) — purely a precision aid, not a correctness requirement. */
const PREMISE_COVERAGE_STOPWORDS = new Set([
  "และ",
  "หรือ",
  "ที่",
  "ใน",
  "กับ",
  "ของ",
  "เป็น",
  "ให้",
  "ไป",
  "มา",
  "จะ",
  "ได้",
  "แล้ว",
  "ก็",
  "ไม่",
  "อยาก",
  "อยากได้",
  "เรื่อง",
  "เกี่ยวกับ",
  "แนว",
  "ไหน",
  "เกิด",
  "ใคร",
  "คือ",
  "ระบุ",
  "เท่าที่",
  "กำหนด",
  "เหลือ",
  "ช่วย",
  "เติม",
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "and",
  "or",
  "to",
  "is",
  "are",
  "for",
  "with",
  "that",
  "this",
  "it",
  "as",
  "at",
  "by",
  "from",
  "be",
  "was",
  "were",
]);

/** Character run considered "Thai script" if at least this fraction of its characters fall in the Thai Unicode block. */
const THAI_SCRIPT_RANGE = /^[฀-๿]+$/;
/** Character n-gram size used to make coverage matching meaningful for Thai (a script written without spaces between words, so whole runs would otherwise tokenize as one giant "word"). */
const THAI_NGRAM_SIZE = 4;
/** Only n-gram a Thai run once it is longer than the n-gram size itself (otherwise a short Thai word would produce zero n-grams). */
const THAI_NGRAM_MIN_RUN_LENGTH = THAI_NGRAM_SIZE + 2;

/**
 * Splits free text into lowercase comparison tokens for `evaluatePremiseCoverage`.
 * Latin/other-script "words" (space/punctuation-delimited) are used as-is;
 * long, unbroken Thai script runs (Thai has no spaces between words) are
 * additionally broken into overlapping character n-grams so overlap
 * comparison is still meaningful without a full Thai word-segmentation
 * dependency. Stopwords and very short tokens are dropped.
 */
function tokenizePremiseText(text: string): string[] {
  const rawRuns = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens: string[] = [];

  for (const run of rawRuns) {
    if (run.length >= THAI_NGRAM_MIN_RUN_LENGTH && THAI_SCRIPT_RANGE.test(run)) {
      for (let i = 0; i <= run.length - THAI_NGRAM_SIZE; i++) {
        tokens.push(run.slice(i, i + THAI_NGRAM_SIZE));
      }
    } else {
      tokens.push(run);
    }
  }

  return tokens.filter((token) => token.length >= 2 && !PREMISE_COVERAGE_STOPWORDS.has(token));
}

/** Minimum fraction of premise tokens that must reappear in the draft text for the draft to count as "covered" — deliberately conservative (spec §4.3 open question: "pick a conservative default that only warns on clear drift"). */
const PREMISE_COVERAGE_MIN_RATIO = 0.15;

export interface EvaluatePremiseCoverageResult {
  covered: boolean;
  warning?: { code: string; message: string };
}

/**
 * Deterministic, keyword/entity-overlap heuristic guard (spec §4.3) — no LLM
 * call, never blocks, only warns. Compares tokens derived from `premise`
 * against tokens derived from the synthesized draft's `logline` + `mainPlot`
 * + `seasonArc`; when overlap falls below a conservative threshold, returns a
 * stable-coded warning the caller appends to `draft.warnings` (never throws).
 * Empty/whitespace-only `premise` short-circuits to `covered: true` — this
 * function is defensive even though callers should only invoke it when a
 * premise is actually present.
 *
 * Exported for direct unit testing (mirrors `clampDraftForCreateSeries`).
 * Reused as-is by Section 06's later `premise_drifted` season-critique
 * finding (spec §4.3 Finding 9) — this section only calls it once, at
 * synthesis time.
 */
export function evaluatePremiseCoverage(
  premise: string,
  draft: { logline: string; mainPlot: string; seasonArc: string },
): EvaluatePremiseCoverageResult {
  const trimmedPremise = premise?.trim() ?? "";
  if (!trimmedPremise) {
    return { covered: true };
  }

  const premiseTokens = Array.from(new Set(tokenizePremiseText(trimmedPremise)));
  if (premiseTokens.length === 0) {
    return { covered: true };
  }

  const draftTokens = new Set(
    tokenizePremiseText(`${draft.logline}\n${draft.mainPlot}\n${draft.seasonArc}`),
  );

  const matchedCount = premiseTokens.filter((token) => draftTokens.has(token)).length;
  const coverageRatio = matchedCount / premiseTokens.length;

  if (coverageRatio >= PREMISE_COVERAGE_MIN_RATIO) {
    return { covered: true };
  }

  return {
    covered: false,
    warning: {
      code: "premise_coverage_low",
      message:
        "The synthesized draft may not sufficiently reflect the user-provided premise — review the logline/mainPlot/seasonArc against the premise.",
    },
  };
}

/**
 * Appends `evaluatePremiseCoverage`'s warning (if any) to `draft.warnings`
 * when `userPremise` is a non-empty trimmed string. No-op (returns `draft`
 * unchanged, same reference) when `userPremise` is absent/blank, or when
 * coverage is fine — mirrors `clampDraftForCreateSeries`/
 * `clampTitleAndToneForCreateSeries`'s "only touch warnings when needed"
 * shape. Generic so it works for both the v1 and v2 draft shapes.
 */
function appendPremiseCoverageWarning<
  T extends {
    logline: string;
    mainPlot: string;
    seasonArc: string;
    warnings: Array<{ code: string; message: string }>;
  },
>(draft: T, userPremise: string | undefined): T {
  const trimmed = userPremise?.trim();
  if (!trimmed) return draft;

  const coverage = evaluatePremiseCoverage(trimmed, draft);
  if (coverage.covered || !coverage.warning) return draft;

  return {
    ...draft,
    warnings: [...draft.warnings, coverage.warning],
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/**
 * The Create Series wizard maps `draft.title` -> `genre` and `draft.tone` ->
 * `tone` verbatim (see CreateSeriesWizard.tsx `applyPresetDraft`). Those two
 * create-series input fields have stricter length limits than this schema's
 * own `title`/`tone` bounds, so an LLM output that is valid here can still be
 * too long for `verticalDramaSeriesRouter.create`. Clamp to the shared
 * create-series limits (belt) in addition to the skill prompt guidance
 * (suspenders) so the wizard never receives an unusable draft.
 */
export function clampDraftForCreateSeries(
  draft: SynthesizedGenrePresetDraft,
): { draft: SynthesizedGenrePresetDraft; clamped: boolean } {
  const clampedTitle = clampToCreateSeriesLimit(draft.title, "genre") ?? draft.title;
  const clampedTone = clampToCreateSeriesLimit(draft.tone, "tone") ?? draft.tone;
  const clamped = clampedTitle !== draft.title || clampedTone !== draft.tone;

  if (!clamped) {
    return { draft, clamped: false };
  }

  return {
    draft: {
      ...draft,
      title: clampedTitle,
      tone: clampedTone,
      warnings: [
        ...draft.warnings,
        {
          code: "preset_field_length_clamped",
          message:
            "AI output exceeded the Create Series field limits and was automatically shortened.",
        },
      ],
    },
    clamped: true,
  };
}

function buildUserPrompt(params: SynthesizeVerticalDramaPresetParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write ALL user-facing string values in natural Thai."
      : `Write all user-facing string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const selectedPresetSummaries = params.selectedPresets.map((preset) => ({
    id: preset.id,
    title: preset.title,
    category: preset.category,
    categoryLabel: genrePresetCategoryLabel(preset.category, params.locale === "th" ? "th" : "en"),
    logline: preset.logline,
    tone: preset.tone,
    cliffhangerStyle: preset.cliffhangerStyle,
    mainPlot: preset.mainPlot.slice(0, 1200),
    seasonArc: preset.seasonArc.slice(0, 900),
    visualBible: preset.visualBible.slice(0, 700),
    characterSeeds: preset.characters.slice(0, 5),
  }));

  const selectedCategories = params.selectedCategories.map((category) => ({
    category,
    label: genrePresetCategoryLabel(category, params.locale === "th" ? "th" : "en"),
  }));

  const primarySelectionId =
    params.primarySelectionId ||
    params.selectedPresets[0]?.id ||
    params.selectedCategories[0] ||
    "auto";

  const payload = {
    language: params.locale,
    selectedPresets: selectedPresetSummaries,
    selectedCategories,
    primarySelectionId,
    businessContext: clampText(params.businessContext, 600),
    productContext: clampText(params.productContext, 600),
    targetEpisodeCount: params.targetEpisodeCount ?? 10,
    toneHint: clampText(params.toneHint, 180),
    rules: [
      "Create one coherent preset draft, not a collage.",
      "Use one primary story spine and supporting flavors for situations, tone, and scene texture.",
      "Keep the result easy for a non-technical creator to edit.",
      "Product or service tie-in may help a scene, but must not magically solve the main conflict.",
      "Use compact JSON only.",
      `"title" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.genre} characters (it fills the series genre field) — keep it short and punchy.`,
      `"tone" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.tone} characters — a brief phrase, not a sentence.`,
      `Every character's "narrativeRole" MUST be exactly one of: ${NARRATIVE_ROLE_VALUES.join(", ")}.`,
      `Every character's "roleTier" MUST be exactly one of: ${ROLE_TIER_VALUES.join(", ")}. Copy one value verbatim — never invent a new label.`,
    ],
  };

  return [
    renderCriteriaVersionMarker(),
    langInstruction,
    buildUserPremisePrimaryBlock(params.userPremise),
    "Synthesize a new Vertical Drama Series genre preset from this payload:",
    JSON.stringify(payload),
    "Return exactly this JSON shape:",
    '{"contract_version":1,"title":string,"category":string,"logline":string,"mainPlot":string,"seasonArc":string,"tone":string,"cliffhangerStyle":string,"creatorSummary":{"whatItIsAbout":string,"protagonistAndGoal":string,"conflictAndDiscovery":string,"centralMystery":string,"decisionNotes":[string]},"characters":[{"name":string,"role":string,"narrativeRole":string,"roleTier":string,"occupation":string,"description":string}],"visualBible":string,"mixRecipe":{"primaryFlavor":string,"supportingFlavors":[string],"rationale":string},"warnings":[{"code":string,"message":string}]}',
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

export function validatePresetSynthesisSelection(params: {
  selectedPresets: unknown[];
  selectedCategories: string[];
}) {
  const total = params.selectedPresets.length + uniqueStrings(params.selectedCategories).length;
  if (total < MIN_SELECTIONS) {
    throw new PresetSynthesisInputError("Select at least 2 story flavors for Mix and Match");
  }
  if (total > MAX_SELECTIONS) {
    throw new PresetSynthesisInputError("Select up to 5 story flavors for Mix and Match");
  }
}

export async function synthesizeVerticalDramaPreset(
  params: SynthesizeVerticalDramaPresetParams,
): Promise<{ draft: SynthesizedGenrePresetDraft; creditsUsed: number; model: string }> {
  const selectedCategories = uniqueStrings(params.selectedCategories);
  validatePresetSynthesisSelection({
    selectedPresets: params.selectedPresets,
    selectedCategories,
  });

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt({ ...params, selectedCategories });

  const { data: synthesizedDraft, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.75,
    userId: params.userId,
    maxTokens: 4500,
    schema: synthesizedPresetDraftSchema,
    label: "Preset synthesis",
  });

  const normalizedDraft = {
    ...synthesizedDraft,
    characters: normalizeSynthesizedCharacters(synthesizedDraft.characters),
  };
  const { draft: clampedDraft } = clampDraftForCreateSeries(normalizedDraft);
  const draft = appendPremiseCoverageWarning(clampedDraft, params.userPremise);

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
    description: "Vertical Drama — synthesize mix-and-match preset",
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_preset_synthesis",
      selectedPresetIds: params.selectedPresets.map((preset) => preset.id),
      selectedCategories,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { draft, creditsUsed, model };
}

/* -------------------------------------------------------------------------- */
/* Mix and Match v2 — verifiable blend (spec §8.2.2.C, section-15)            */
/*                                                                            */
/* Additive: `synthesizeVerticalDramaPreset` (v1) above is completely         */
/* untouched by everything below — flag-off callers keep calling it and get  */
/* byte-identical behavior. `synthesizeVerticalDramaPresetV2` is a SEPARATE   */
/* entry point the router only calls when `verticalDramaSeriesPresetMixV2`   */
/* is enabled for the tenant.                                                */
/* -------------------------------------------------------------------------- */

/** Equal-weight default used when a caller supplies legacy `selectedPresetIds` with no explicit weights. */
const DEFAULT_MIX_WEIGHT: VerticalDramaPresetMixWeight = 3;

/**
 * Resolves the effective weighted selection list (spec §8.2.2.C.1 back-compat:
 * "selectedPresetIds (no weights) still works with equal default weights").
 * Explicit `selections` always win when non-empty; otherwise every id in
 * `selectedPresetIds` gets the same neutral `DEFAULT_MIX_WEIGHT`. Pure/
 * deterministic — exported for direct unit testing.
 */
export function resolveMixSelections(params: {
  selectedPresetIds?: string[];
  selections?: VerticalDramaPresetMixSelection[];
}): VerticalDramaPresetMixSelection[] {
  if (params.selections && params.selections.length > 0) {
    return params.selections;
  }
  return (params.selectedPresetIds ?? []).map((presetId) => ({
    presetId,
    weight: DEFAULT_MIX_WEIGHT,
  }));
}

/** The 7 facets every non-primary preset competes for coverage in (everything except `story_spine`, which the primary owns exclusively — spec §8.2.2.C.1). */
const NON_SPINE_BLEND_FACETS: VerticalDramaBlendFacet[] = VERTICAL_DRAMA_BLEND_FACETS.filter(
  (facet) => facet !== "story_spine",
);

export interface VerticalDramaFacetAssignmentEntry {
  facet: VerticalDramaBlendFacet;
  /** Preset ids assigned to contribute a concrete element to this facet (primary-first when present). */
  presetIds: string[];
}

/**
 * Deterministic pre-pass (spec §8.2.2.C.2 / section-15 change A.2), run
 * BEFORE the LLM call: builds the `facetAssignments` table the LLM prompt
 * embeds so it cannot silently drop a selected preset.
 *
 *  - `story_spine` is owned EXCLUSIVELY by `primarySelectionId` (hard rule 1).
 *  - The primary ALSO seeds every other facet (it is the dominant flavor
 *    driving the whole blend) — but unlike every other selected preset, it is
 *    NEVER subject to `minFacetsPerPreset` (see the QC-gate exemption in
 *    `synthesizeVerticalDramaPresetV2`; it already owns story_spine
 *    unconditionally).
 *  - Every OTHER selected preset is deterministically rotated across the 7
 *    non-spine facets — starting at an offset unique to its position among
 *    the non-primary selections (so different presets don't all land on the
 *    same two facets) — for `minFacetsPerPreset + (weight - 1)` facets,
 *    capped at the 7 available (weight-scaled per spec §8.2.2.C.1).
 *
 * `presets` narrows `selections` to KNOWN ids only (defensive — a stray/
 * unmatched presetId is silently dropped from the assignment table rather
 * than corrupting it). Exported + unit-tested directly.
 */
export function buildFacetAssignments(
  selections: VerticalDramaPresetMixSelection[],
  presets: PresetSynthesisPresetInput[],
  primarySelectionId: string,
  minFacetsPerPreset: number = DEFAULT_MIN_FACETS_PER_PRESET,
): VerticalDramaFacetAssignmentEntry[] {
  const knownIds = new Set(presets.map((preset) => preset.id));
  const relevantSelections = selections.filter((selection) => knownIds.has(selection.presetId));
  const nonPrimarySelections = relevantSelections.filter(
    (selection) => selection.presetId !== primarySelectionId,
  );

  const byFacet = new Map<VerticalDramaBlendFacet, string[]>(
    VERTICAL_DRAMA_BLEND_FACETS.map((facet) => [facet, [] as string[]]),
  );

  byFacet.set("story_spine", [primarySelectionId]);
  for (const facet of NON_SPINE_BLEND_FACETS) {
    byFacet.get(facet)!.push(primarySelectionId);
  }

  nonPrimarySelections.forEach((selection, index) => {
    const facetCount = Math.min(
      minFacetsPerPreset + (selection.weight - 1),
      NON_SPINE_BLEND_FACETS.length,
    );
    for (let i = 0; i < facetCount; i++) {
      const facet = NON_SPINE_BLEND_FACETS[(index + i) % NON_SPINE_BLEND_FACETS.length];
      byFacet.get(facet)!.push(selection.presetId);
    }
  });

  return VERTICAL_DRAMA_BLEND_FACETS.map((facet) => ({
    facet,
    presetIds: byFacet.get(facet)!,
  }));
}

/** `PresetSynthesisPresetInput`, extended with the preset's structured visual identity (null/absent for legacy presets — spec §8.2.2.C.4: "presets lacking visualIdentityJson contribute nothing to identity merge"). */
export interface PresetSynthesisPresetInputV2 extends PresetSynthesisPresetInput {
  visualIdentityJson?: VerticalDramaPresetVisualIdentity | null;
}

/**
 * Builds the `VerticalDramaVisualIdentitySelection[]` input `mergeVisualIdentities`
 * expects, skipping any preset without a `visualIdentityJson` (legacy
 * tolerant — spec §8.2.2.C.4). Returns `[]` when NO selected preset carries
 * an identity, in which case the caller skips the merge entirely.
 */
function buildVisualIdentitySelections(
  selections: VerticalDramaPresetMixSelection[],
  presets: PresetSynthesisPresetInputV2[],
  primarySelectionId: string,
): VerticalDramaVisualIdentitySelection[] {
  const presetById = new Map(presets.map((preset) => [preset.id, preset]));
  const result: VerticalDramaVisualIdentitySelection[] = [];
  for (const selection of selections) {
    const preset = presetById.get(selection.presetId);
    if (!preset?.visualIdentityJson) continue;
    result.push({
      identity: preset.visualIdentityJson,
      weight: selection.weight,
      isPrimary: selection.presetId === primarySelectionId,
    });
  }
  return result;
}

/**
 * Assembles the FULL `VerticalDramaBlendReport` (spec §8.2.2.C.4) from the
 * LLM's raw `blendFacets` — `contributionCoverage` and `underBlended` are
 * SERVER-COMPUTED (never trust the LLM's own counting), via the shared
 * `computeBlendCoverage`/`findUnderBlended` helpers. The primary selection is
 * exempt from the `underBlended` floor (hard rule 1 — it already owns
 * `story_spine` unconditionally and is never one of the "OTHER selected
 * presets" the floor applies to), so it is filtered out of the raw result
 * here even though `findUnderBlended` itself has no concept of "primary".
 */
function assembleBlendReport(
  blendFacets: VerticalDramaBlendFacetEntry[],
  minFacetsPerPreset: number,
  primarySelectionId: string,
): VerticalDramaBlendReport {
  const contributionCoverage = computeBlendCoverage({ facets: blendFacets });
  const rawUnderBlended = findUnderBlended({ facets: blendFacets }, minFacetsPerPreset);
  const underBlended = rawUnderBlended.filter((presetId) => presetId !== primarySelectionId);
  return {
    contractVersion: 2,
    facets: blendFacets,
    contributionCoverage,
    minFacetsPerPreset,
    underBlended,
  };
}

const synthesizedVisualIdentityDraftSchema = z.object({
  styleName: z.string().min(1),
  lighting: z.string().min(1),
  cameraGrammar: z.string().min(1),
  characterArchetypes: z.array(verticalDramaPresetCharacterArchetypeSchema).min(1),
  positiveFragments: z.array(z.string().min(1)),
});

/**
 * Superset of the v1 draft schema (spec §8.2.2.C.6 — "v1 outputs stay
 * parseable wherever v2 is consumed"): same base fields, `contract_version`
 * overridden to `2`, plus the RAW LLM-authored blend facets + partial visual
 * identity (styleName/lighting/cameraGrammar/characterArchetypes/positive
 * fragments only — palette/motifs/wardrobe/props/negative are code-merged,
 * never LLM-authored, per hard rule 2).
 */
const synthesizedPresetDraftV2Schema = synthesizedPresetDraftSchema.extend({
  contract_version: z.literal(2),
  blendFacets: z.array(verticalDramaBlendFacetEntrySchema).min(1),
  // Secondary cause of the 2026-07-14 recurring failure: the "Return exactly
  // this JSON shape" contract string always included `visualIdentity`, which
  // contradicted the rule above telling the model to omit it when no preset
  // supplies visual-identity context — the model then emitted an empty-string
  // `visualIdentity` object that failed `.min(1)`. The shape line is now
  // conditional (see `buildUserPromptV2`), but this field stays lenient too:
  // a malformed/empty `visualIdentity` degrades to absent rather than failing
  // the whole draft (`assembleFinalVisualIdentity` already returns `undefined`
  // when either side is missing).
  visualIdentity: synthesizedVisualIdentityDraftSchema.optional().catch(undefined),
});

type SynthesizedGenrePresetDraftV2Raw = z.infer<typeof synthesizedPresetDraftV2Schema>;

/** The FINAL v2 draft returned to callers: `blendFacets` replaced by the fully-assembled `blendReport`, `visualIdentity` (if any) replaced by the fully-merged identity object. */
export type SynthesizedGenrePresetDraftV2 = Omit<
  SynthesizedGenrePresetDraftV2Raw,
  "blendFacets" | "visualIdentity"
> & {
  blendReport: VerticalDramaBlendReport;
  visualIdentity?: VerticalDramaPresetVisualIdentity;
};

export interface SynthesizeVerticalDramaPresetV2Params {
  userId: number;
  tenantId?: string;
  locale: VerticalDramaSeriesLocale;
  /** Explicit weighted selections (spec §8.2.2.C.1) — optional; falls back to equal-weight from `selectedPresetIds` when absent (back-compat, see `resolveMixSelections`). */
  selections?: VerticalDramaPresetMixSelection[];
  /** Legacy-shaped ids, used ONLY to derive equal-weight `selections` when the caller doesn't supply explicit weights. */
  selectedPresetIds?: string[];
  selectedPresets: PresetSynthesisPresetInputV2[];
  selectedCategories: string[];
  primarySelectionId?: string;
  businessContext?: string;
  productContext?: string;
  targetEpisodeCount?: number;
  toneHint?: string;
  /** Default `DEFAULT_MIN_FACETS_PER_PRESET` (2). */
  minFacetsPerPreset?: number;
  /** See `SynthesizeVerticalDramaPresetParams.userPremise` (Feature 132 §4, F132A) — same contract, v2 counterpart. */
  userPremise?: string;
}

/** Generic sibling of `clampDraftForCreateSeries` (v1) — kept SEPARATE (not shared) so v1's own code path/behavior is never touched by this file's v2 additions. */
function clampTitleAndToneForCreateSeries<
  T extends { title: string; tone: string; warnings: Array<{ code: string; message: string }> },
>(draft: T): { draft: T; clamped: boolean } {
  const clampedTitle = clampToCreateSeriesLimit(draft.title, "genre") ?? draft.title;
  const clampedTone = clampToCreateSeriesLimit(draft.tone, "tone") ?? draft.tone;
  const clamped = clampedTitle !== draft.title || clampedTone !== draft.tone;

  if (!clamped) {
    return { draft, clamped: false };
  }

  return {
    draft: {
      ...draft,
      title: clampedTitle,
      tone: clampedTone,
      warnings: [
        ...draft.warnings,
        {
          code: "preset_field_length_clamped",
          message: "AI output exceeded the Create Series field limits and was automatically shortened.",
        },
      ],
    },
    clamped: true,
  };
}

function buildFacetAssignmentsPromptPayload(
  facetAssignments: VerticalDramaFacetAssignmentEntry[],
  presetTitleById: Map<string, string>,
) {
  return facetAssignments.map((entry) => ({
    facet: entry.facet,
    assignedPresets: entry.presetIds.map((presetId) => ({
      presetId,
      title: presetTitleById.get(presetId) ?? presetId,
    })),
  }));
}

function buildUserPromptV2(args: {
  params: SynthesizeVerticalDramaPresetV2Params;
  selections: VerticalDramaPresetMixSelection[];
  selectedCategories: string[];
  primarySelectionId: string;
  facetAssignments: VerticalDramaFacetAssignmentEntry[];
  mergedVisualIdentity: VerticalDramaMergedVisualIdentity | null;
  presetTitleById: Map<string, string>;
}): string {
  const {
    params,
    selections,
    selectedCategories,
    primarySelectionId,
    facetAssignments,
    mergedVisualIdentity,
    presetTitleById,
  } = args;

  const langInstruction =
    params.locale === "th"
      ? "Write ALL user-facing string values in natural Thai."
      : `Write all user-facing string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const weightBySelectionPresetId = new Map(selections.map((s) => [s.presetId, s.weight]));
  const selectedPresetSummaries = params.selectedPresets.map((preset) => ({
    id: preset.id,
    title: preset.title,
    category: preset.category,
    categoryLabel: genrePresetCategoryLabel(preset.category, params.locale === "th" ? "th" : "en"),
    weight: weightBySelectionPresetId.get(preset.id) ?? DEFAULT_MIX_WEIGHT,
    isPrimary: preset.id === primarySelectionId,
    logline: preset.logline,
    tone: preset.tone,
    cliffhangerStyle: preset.cliffhangerStyle,
    mainPlot: preset.mainPlot.slice(0, 1200),
    seasonArc: preset.seasonArc.slice(0, 900),
    visualBible: preset.visualBible.slice(0, 700),
    characterSeeds: preset.characters.slice(0, 5),
  }));

  const selectedCategoriesPayload = selectedCategories.map((category) => ({
    category,
    label: genrePresetCategoryLabel(category, params.locale === "th" ? "th" : "en"),
  }));

  const payload = {
    language: params.locale,
    selectedPresets: selectedPresetSummaries,
    selectedCategories: selectedCategoriesPayload,
    primarySelectionId,
    facetAssignments: buildFacetAssignmentsPromptPayload(facetAssignments, presetTitleById),
    visualIdentityContext: mergedVisualIdentity
      ? {
          palette: mergedVisualIdentity.palette,
          environmentMotifs: mergedVisualIdentity.environmentMotifs,
          wardrobeGrammar: mergedVisualIdentity.wardrobeGrammar,
          signaturePropsAndCompanions: mergedVisualIdentity.signaturePropsAndCompanions,
          alreadyMergedNegativeFragments: mergedVisualIdentity.imagePromptFragments.negative,
        }
      : null,
    businessContext: clampText(params.businessContext, 600),
    productContext: clampText(params.productContext, 600),
    targetEpisodeCount: params.targetEpisodeCount ?? 10,
    toneHint: clampText(params.toneHint, 180),
    rules: [
      "Create one coherent preset draft that VERIFIABLY blends every selected preset — not a collage, and never let a non-primary preset silently vanish into unverifiable flavor.",
      'The PRIMARY selection\'s story spine (mainPlot/seasonArc skeleton) drives the main plot; every OTHER selected preset must still land concrete, genuine ("kept": true) contributions in its assigned facets below — fill EVERY facet slot assigned to it in "facetAssignments".',
      `"blendFacets" must cover every facet in this exact set: ${VERTICAL_DRAMA_BLEND_FACETS.join(", ")}. For each facet, return one "contributions" entry per preset assigned to it in "facetAssignments", each with a concrete "element" string and "kept": true only when you genuinely used that element in the draft (mark it false instead of omitting it when you decided not to use it — never drop an assigned preset's entry).`,
      mergedVisualIdentity
        ? 'For the "visual_identity" facet, do NOT re-list the palette/motifs/wardrobe/props/negative fragments given in "visualIdentityContext" (already fixed) — only contribute a short "element" noting how each identity-bearing preset\'s style shaped the blended look, and "kept": true when it genuinely did.'
        : 'No selected preset carries a structured visual identity — you may leave "visual_identity" contributions minimal or empty.',
      mergedVisualIdentity
        ? 'Also return a "visualIdentity" object with a NEW blended "styleName", a "lighting" description, a "cameraGrammar" line, 2-4 "characterArchetypes" ({role, look}), and 3-6 "positiveFragments" (reusable image-prompt tokens) — all CONSISTENT with the fixed palette/motifs/wardrobe/props/negative fragments in "visualIdentityContext".'
        : 'Omit "visualIdentity" entirely (no preset supplied a structured visual identity to build from).',
      "Keep the result easy for a non-technical creator to edit.",
      "Product or service tie-in may help a scene, but must not magically solve the main conflict.",
      "Use compact JSON only.",
      `"title" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.genre} characters (it fills the series genre field) — keep it short and punchy.`,
      `"tone" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.tone} characters — a brief phrase, not a sentence.`,
      `Every character's "narrativeRole" MUST be exactly one of: ${NARRATIVE_ROLE_VALUES.join(", ")}.`,
      `Every character's "roleTier" MUST be exactly one of: ${ROLE_TIER_VALUES.join(", ")}. Copy one value verbatim — never invent a new label.`,
    ],
  };

  // The "Return exactly this JSON shape" contract line must never advertise a
  // "visualIdentity" member when there is no merged visual-identity context
  // to build it from — the rules above already tell the model to omit it in
  // that case, and a shape line that still lists it caused the model to emit
  // an empty-string `visualIdentity` object that failed schema validation.
  const jsonShape = mergedVisualIdentity
    ? '{"contract_version":2,"title":string,"category":string,"logline":string,"mainPlot":string,"seasonArc":string,"tone":string,"cliffhangerStyle":string,"creatorSummary":{"whatItIsAbout":string,"protagonistAndGoal":string,"conflictAndDiscovery":string,"centralMystery":string,"decisionNotes":[string]},"characters":[{"name":string,"role":string,"narrativeRole":string,"roleTier":string,"occupation":string,"description":string}],"visualBible":string,"mixRecipe":{"primaryFlavor":string,"supportingFlavors":[string],"rationale":string},"warnings":[{"code":string,"message":string}],"blendFacets":[{"facet":string,"contributions":[{"presetId":string,"element":string,"kept":boolean}]}],"visualIdentity":{"styleName":string,"lighting":string,"cameraGrammar":string,"characterArchetypes":[{"role":string,"look":string}],"positiveFragments":[string]}}'
    : '{"contract_version":2,"title":string,"category":string,"logline":string,"mainPlot":string,"seasonArc":string,"tone":string,"cliffhangerStyle":string,"creatorSummary":{"whatItIsAbout":string,"protagonistAndGoal":string,"conflictAndDiscovery":string,"centralMystery":string,"decisionNotes":[string]},"characters":[{"name":string,"role":string,"narrativeRole":string,"roleTier":string,"occupation":string,"description":string}],"visualBible":string,"mixRecipe":{"primaryFlavor":string,"supportingFlavors":[string],"rationale":string},"warnings":[{"code":string,"message":string}],"blendFacets":[{"facet":string,"contributions":[{"presetId":string,"element":string,"kept":boolean}]}]}';

  return [
    renderCriteriaVersionMarker(),
    langInstruction,
    buildUserPremisePrimaryBlock(params.userPremise),
    "Synthesize a new Vertical Drama Series genre preset (Mix and Match v2 — verifiable blend) from this payload:",
    JSON.stringify(payload),
    "Return exactly this JSON shape:",
    jsonShape,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCorrectiveInstruction(
  underBlendedPresetIds: string[],
  presetTitleById: Map<string, string>,
  minFacetsPerPreset: number,
): string {
  const names = underBlendedPresetIds.map((id) => presetTitleById.get(id) ?? id).join(", ");
  return [
    `Your previous response did not sufficiently blend the following preset(s): ${names}.`,
    `Revise "blendFacets" so EACH of these presets has at least ${minFacetsPerPreset} facets with a genuine "kept": true contribution (choose from their assigned facet slots in "facetAssignments" above), WITHOUT removing or weakening any other preset's existing kept contributions.`,
  ].join(" ");
}

function assembleFinalVisualIdentity(
  merged: VerticalDramaMergedVisualIdentity | null,
  llmWritten: SynthesizedGenrePresetDraftV2Raw["visualIdentity"],
): VerticalDramaPresetVisualIdentity | undefined {
  if (!merged || !llmWritten) return undefined;
  return {
    styleName: llmWritten.styleName,
    palette: merged.palette,
    lighting: llmWritten.lighting,
    environmentMotifs: merged.environmentMotifs,
    wardrobeGrammar: merged.wardrobeGrammar,
    signaturePropsAndCompanions: merged.signaturePropsAndCompanions,
    cameraGrammar: llmWritten.cameraGrammar,
    characterArchetypes: llmWritten.characterArchetypes,
    imagePromptFragments: {
      positive: llmWritten.positiveFragments,
      negative: merged.imagePromptFragments.negative,
    },
  };
}

/**
 * Mix and Match v2 — verifiable blend (spec §8.2.2.C, section-15). Router
 * callers gate this behind the `verticalDramaSeriesPresetMixV2` tenant flag;
 * this function itself performs no flag check (mirrors every other service
 * in this codebase — flag gating is the router's job).
 *
 * Flow: resolve weighted selections (back-compat) -> deterministic
 * `buildFacetAssignments` pre-pass -> deterministic `mergeVisualIdentities`
 * (code, not LLM) -> LLM call -> assemble `blendReport` (server-computed
 * coverage) -> blend QC gate: under-blended (excluding the exempt primary)
 * triggers exactly ONE corrective retry naming the offending preset(s) ->
 * still under-blended (or the retry itself errors) -> proceed anyway with
 * `underBlended` populated + a warning entry (NEVER throw for under-blend,
 * spec §8.2.2.C.5).
 */
export async function synthesizeVerticalDramaPresetV2(
  params: SynthesizeVerticalDramaPresetV2Params,
): Promise<{ draft: SynthesizedGenrePresetDraftV2; creditsUsed: number; model: string }> {
  const selectedCategories = uniqueStrings(params.selectedCategories);
  const selections = resolveMixSelections({
    selectedPresetIds: params.selectedPresetIds,
    selections: params.selections,
  });

  validatePresetSynthesisSelection({
    selectedPresets: selections,
    selectedCategories,
  });

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const primarySelectionId =
    params.primarySelectionId || selections[0]?.presetId || selectedCategories[0] || "auto";
  const minFacetsPerPreset = params.minFacetsPerPreset ?? DEFAULT_MIN_FACETS_PER_PRESET;

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  assertPresetSynthesizerSkillSupportsV2(systemPrompt);

  const facetAssignments = buildFacetAssignments(
    selections,
    params.selectedPresets,
    primarySelectionId,
    minFacetsPerPreset,
  );

  const visualIdentitySelections = buildVisualIdentitySelections(
    selections,
    params.selectedPresets,
    primarySelectionId,
  );
  const mergedVisualIdentity =
    visualIdentitySelections.length > 0 ? mergeVisualIdentities(visualIdentitySelections) : null;

  const presetTitleById = new Map(params.selectedPresets.map((preset) => [preset.id, preset.title]));

  const basePrompt = buildUserPromptV2({
    params,
    selections,
    selectedCategories,
    primarySelectionId,
    facetAssignments,
    mergedVisualIdentity,
    presetTitleById,
  });

  // Base ceiling raised over v1's 4500 — v2 additionally carries the
  // per-facet `blendFacets` contributions table (up to 8 facets × every
  // assigned preset) plus the optional `visualIdentity` sub-object.
  const V2_MAX_TOKENS = 6000;

  const firstAttempt = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt: basePrompt,
    temperature: 0.75,
    userId: params.userId,
    maxTokens: V2_MAX_TOKENS,
    schema: synthesizedPresetDraftV2Schema,
    label: "Preset synthesis v2",
  });

  let finalRawDraft = firstAttempt.data;
  let totalPromptTokens = firstAttempt.response.usage?.prompt_tokens ?? 0;
  let totalCompletionTokens = firstAttempt.response.usage?.completion_tokens ?? 0;
  let blendReport = assembleBlendReport(finalRawDraft.blendFacets, minFacetsPerPreset, primarySelectionId);

  // Blend QC gate (spec §8.2.2.C.5): coverage below floor -> ONE corrective
  // retry naming the under-blended preset(s) -> still failing (or the retry
  // call itself throws) -> keep going with `underBlended` populated + a
  // warning entry. NEVER a silent collapse, NEVER a throw for this reason.
  if (blendReport.underBlended.length > 0) {
    const correctiveInstruction = buildCorrectiveInstruction(
      blendReport.underBlended,
      presetTitleById,
      minFacetsPerPreset,
    );
    try {
      const retryAttempt = await executeJsonPlanningCallWithRetry({
        model,
        systemPrompt,
        userPrompt: `${basePrompt}\n\n${correctiveInstruction}`,
        temperature: 0.75,
        userId: params.userId,
        maxTokens: V2_MAX_TOKENS,
        schema: synthesizedPresetDraftV2Schema,
        label: "Preset synthesis v2 (blend corrective retry)",
      });
      finalRawDraft = retryAttempt.data;
      totalPromptTokens += retryAttempt.response.usage?.prompt_tokens ?? 0;
      totalCompletionTokens += retryAttempt.response.usage?.completion_tokens ?? 0;
      blendReport = assembleBlendReport(finalRawDraft.blendFacets, minFacetsPerPreset, primarySelectionId);
    } catch (retryError) {
      debugError(
        "vd_preset_mix_v2_retry",
        "Preset synthesis v2 corrective retry failed — keeping the first attempt's (under-blended) result",
        { message: retryError instanceof Error ? retryError.message : String(retryError) },
      );
      // Keep the FIRST attempt's draft/report — never throw for under-blend.
    }
  }

  finalRawDraft = {
    ...finalRawDraft,
    characters: normalizeSynthesizedCharacters(finalRawDraft.characters),
  };
  const warnings = [...finalRawDraft.warnings];
  if (blendReport.underBlended.length > 0) {
    const names = blendReport.underBlended.map((id) => presetTitleById.get(id) ?? id).join(", ");
    warnings.push({
      code: "preset_under_blended",
      message: `preset(s) ${names} ยังไม่ถูกผสมจริง (ครอบคลุมต่ำกว่า ${minFacetsPerPreset} ด้าน)`,
    });
  }

  const visualIdentity = assembleFinalVisualIdentity(mergedVisualIdentity, finalRawDraft.visualIdentity);

  const { blendFacets: _blendFacets, visualIdentity: _rawVisualIdentity, ...rest } = finalRawDraft;
  const mergedDraft: SynthesizedGenrePresetDraftV2 = {
    ...rest,
    warnings,
    blendReport,
    ...(visualIdentity ? { visualIdentity } : {}),
  };

  const { draft: clampedDraft } = clampTitleAndToneForCreateSeries(mergedDraft);
  const draft = appendPremiseCoverageWarning(clampedDraft, params.userPremise);

  const creditsUsed = calculateCreditsForLLM(totalPromptTokens, totalCompletionTokens, model);

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: "Vertical Drama — synthesize mix-and-match preset (v2, verifiable blend)",
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_preset_synthesis_v2",
      selectedPresetIds: selections.map((s) => s.presetId),
      selectedCategories,
      primarySelectionId,
      underBlended: blendReport.underBlended,
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
    },
  });

  return { draft, creditsUsed, model };
}
