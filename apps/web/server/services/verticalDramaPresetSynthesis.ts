/**
 * Vertical Drama Series — AI-assisted Mix and Match preset synthesis.
 *
 * Takes several selected preset/category "flavors" and returns one coherent
 * editable draft in the same shape the Create Series wizard already applies.
 * No database writes happen here; callers decide whether to apply the draft.
 */

import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "node:crypto";
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
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
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
  roleTierToNarrativeRole,
  type NarrativeRole,
  type RoleTier,
} from "@shared/verticalDramaSeries/narrativeRole";
import {
  renderAudienceAgeRatingBlock,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
import type { VerticalDramaSeriesLineage } from "@shared/verticalDramaSeries/lineage";
import {
  buildVerticalDramaDialogueLanguageProfilePrompt,
  type VerticalDramaDialogueLanguageProfile,
} from "@shared/verticalDramaSeries/dialogueLanguageProfile";
import { buildVerticalDramaDraftLanguageContractPrompt } from "@shared/verticalDramaSeries/draftLanguageContract";
import {
  buildVerticalDramaDraftStoryContextPrompt,
  readVerticalDramaDraftDiagnostics,
  readVerticalDramaDraftStoryContext,
  type VerticalDramaDraftDiagnostic,
} from "@shared/verticalDramaSeries/draftStoryContext";
import {
  buildVerticalDramaDraftStoryDesignPrompt,
  readVerticalDramaDraftStoryDesign,
} from "@shared/verticalDramaSeries/draftStoryDesign";
import {
  evaluateVerticalDramaStoryArchitecture,
  readVerticalDramaStoryArchitecture,
  renderVerticalDramaStoryArchitectureBlock,
  type VerticalDramaStoryArchitectureContract,
  type VerticalDramaStoryArchitectureDiagnostic,
} from "@shared/verticalDramaSeries/storyArchitecture";
import { readVerticalDramaStoryControlSeed } from "@shared/verticalDramaSeries/storyControl";
import { verticalDramaVisualNarrativeProfileSchema } from "@shared/verticalDramaSeries/visualNarrativeProfile";
import { renderSourcePackDigestPromptBlock } from "@shared/verticalDramaSeries/sourcePack";

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-preset-synthesizer"
);
const MIN_SELECTIONS = 2;
const MAX_SELECTIONS = 5;
/**
 * Single source of truth for how long the LLM is told/allowed to make
 * `title` (and each `titleOptions` candidate) — shared by the Zod schema
 * bound below AND the "MUST be at most N characters" prompt instruction in
 * `buildUserPrompt`/`buildUserPromptV2`, so the advisory text the model
 * receives and the bound that actually forces a schema-validation retry can
 * never drift apart (planning/vd-character-prompt-followups/plan.md Item 3).
 * Deliberately independent of `CREATE_SERIES_FIELD_LIMITS.title` (255, the
 * downstream Create Series TITLE field/DB limit — see
 * `clampDraftForCreateSeries`/`clampTitleAndToneForCreateSeries`'s own belt
 * clamp) and `CREATE_SERIES_FIELD_LIMITS.genre` (100, an unrelated field —
 * `title` never feeds genre, see those functions' doc comments): a punchy
 * series title is intentionally shorter than the hard transport ceiling.
 */
const SYNTHESIZED_TITLE_MAX_LENGTH = 150;
const V2_SKILL_CONTRACT_MARKERS = [
  "Mix and Match v2",
  "contract_version",
  "blendFacets",
  "presetId",
  "kept",
] as const;
const VISUAL_NARRATIVE_SKILL_CONTRACT_MARKERS = [
  "VISUAL NARRATIVE DNA",
  "visualNarrativeProfile",
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
    `Could not locate skill.md for "vertical-drama-preset-synthesizer" under any known skills directory`
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
    "Creator-facing copy must not expose synthesis metadata"
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

const synthesizedDiagnosticSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error", "blocking"]),
  message: z.string().min(1),
  messageEn: z.string().optional(),
  paths: z.array(z.string().min(1)).optional(),
  repairable: z.boolean().optional(),
});

/**
 * `locations` entry (skill.md "Locations" section, added alongside
 * `titleOptions` below). Deliberately mirrors `characters`' minimal shape
 * (name + prose description) rather than inventing a location taxonomy in
 * TS — the skill decides what makes a good recurring location; this schema
 * only bounds the two fields' lengths.
 */
const synthesizedLocationSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
});

const synthesizedVisualNarrativeProfileSchema =
  verticalDramaVisualNarrativeProfileSchema;

const synthesizedPresetDraftSchema = z.object({
  contract_version: z.literal(1),
  title: z.string().min(1).max(SYNTHESIZED_TITLE_MAX_LENGTH),
  // 4-5 candidate SERIES titles (skill.md "Title Options" section). `title`
  // above remains the recommended default and, per the skill contract, MUST
  // be one of these entries — that consistency rule lives in the skill
  // prose, not as a Zod cross-field refinement, so a model that gets it
  // slightly wrong degrades to "just show the options" rather than failing
  // the whole draft. `.optional()` keeps this additive: a model response
  // that omits it (older skill version, or the model simply didn't return
  // it) still parses exactly as before.
  titleOptions: z
    .array(z.string().trim().min(1).max(SYNTHESIZED_TITLE_MAX_LENGTH))
    .min(4)
    .max(5)
    .optional(),
  category: z.string().min(1).max(60),
  logline: z.string().min(1),
  mainPlot: z.string().min(1),
  seasonArc: z.string().min(1),
  tone: z.string().min(1).max(160),
  cliffhangerStyle: z.string().min(1).max(200),
  creatorSummary: creatorSummarySchema,
  characters: z.array(synthesizedCharacterSchema).min(3).max(8),
  visualBible: z.string().min(1),
  /** Optional story-facing interpretation of the selected visual direction. */
  visualNarrativeProfile: synthesizedVisualNarrativeProfileSchema.optional(),
  // 3-6 recurring locations (skill.md "Locations" section) — optional,
  // additive, same backward-compatibility contract as `titleOptions` above.
  locations: z.array(synthesizedLocationSchema).min(3).max(6).optional(),
  mixRecipe: z
    .object({
      primaryFlavor: z.string().min(1),
      // Phase 2 (`planning/vd-premise-first-wizard/plan.md` §2.3) relaxed
      // this from `.min(1)`: with a premise and ZERO selected presets there
      // is genuinely no second flavor to name, and requiring one forced the
      // model to fabricate a nonexistent preset just to pass validation.
      // Every pre-Phase-2 caller (>=2 selections) still has real presets to
      // name, so this only ever ACCEPTS a superset of previously-valid
      // responses — no existing caller's behavior changes.
      supportingFlavors: z.array(z.string().min(1)),
      rationale: z.string().min(1),
    })
    .passthrough(),
  warnings: z.array(synthesizedWarningSchema),
  /** Additive identity facts. Legacy drafts remain valid when omitted. */
  storyContext: z.unknown().optional(),
  /** Additive story-engine/continuity plan. Legacy drafts remain valid when omitted. */
  storyDesign: z.unknown().optional(),
  /** Additive authoritative story architecture. Legacy drafts remain valid when omitted. */
  storyContract: z.unknown().optional(),
  /** Server-created structural diagnostics; creator-facing warnings stay separate. */
  diagnostics: z.array(synthesizedDiagnosticSchema).max(32).optional(),
});

export type SynthesizedGenrePresetDraft = z.infer<
  typeof synthesizedPresetDraftSchema
>;

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
  /** Optional structured look carried by newer preset rows. */
  visualIdentityJson?: VerticalDramaPresetVisualIdentity | null;
}

export interface SynthesizeVerticalDramaPresetParams {
  userId: number;
  /** Stable composition-job identity for ledger idempotency. */
  idempotencyKey?: string;
  /** Server-approved LLM Recommend model for the Draft pipeline. */
  model?: string;
  tenantId?: string;
  locale: VerticalDramaSeriesLocale;
  selectedPresets: PresetSynthesisPresetInput[];
  selectedCategories: string[];
  primarySelectionId?: string;
  businessContext?: string;
  productContext?: string;
  targetEpisodeCount?: number;
  toneHint?: string;
  /** Optional Create-Series basics used when no preset/premise is supplied. */
  seriesTitleHint?: string;
  genreHint?: string;
  audienceAgeRating?: AudienceAgeRating;
  /** Bounded pre-create continuity snapshot for sequel/special-edition drafts. */
  lineageContext?: VerticalDramaSeriesLineage;
  /**
   * Feature 132 §4 (F132A) — free-form "โจทย์เรื่องที่อยากได้" creative-intent
   * input. When present (non-empty after trim), it becomes the PRIMARY story
   * spine for original series. For sequel/special-edition requests, lineage
   * remains primary canon and this premise is the requested new-season
   * direction. Selected preset(s) remain supporting flavor (spec §4.3).
   * Absent/empty reproduces today's behavior byte-for-byte. The router is
   * responsible for tenant-flag gating (`verticalDramaUserPremise`) — this
   * service performs no flag check of its own, mirroring every other
   * flag-gated service in this codebase.
   */
  userPremise?: string;
  /** Additive spoken-language contract; narrative output still follows `locale`. */
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile;
  /** Additive opt-in: translate the selected look into soft story guidance. */
  visualNarrativeEnabled?: boolean;
  /** A wizard-selected series look, used only when explicitly opted in. */
  visualNarrativeIdentity?: VerticalDramaPresetVisualIdentity;
  /** Server-approved foundation created by the durable wizard composition job. */
  storyArchitecture?: VerticalDramaStoryArchitectureContract;
  /** Bounded, owner-scoped evidence snapshot for documentary/review profiles. */
  sourcePackDigest?: Record<string, unknown>;
  seriesProfileId?: string;
}

type PresetSynthesisBasicSeedParams = Pick<
  SynthesizeVerticalDramaPresetParams,
  | "selectedCategories"
  | "businessContext"
  | "productContext"
  | "targetEpisodeCount"
  | "toneHint"
  | "seriesTitleHint"
  | "genreHint"
  | "audienceAgeRating"
  | "lineageContext"
>;

/** Defaults such as target count/audience tier are valid planning facts. */
function hasPresetSynthesisBasicSeed(
  params: PresetSynthesisBasicSeedParams
): boolean {
  return Boolean(
    params.selectedCategories.length > 0 ||
    params.businessContext?.trim() ||
    params.productContext?.trim() ||
    params.targetEpisodeCount ||
    params.toneHint?.trim() ||
    params.seriesTitleHint?.trim() ||
    params.genreHint?.trim() ||
    params.audienceAgeRating ||
    params.lineageContext
  );
}

function buildGenerateFromBasicsBlock(params: {
  hasPresetSelections: boolean;
  userPremise?: string;
}): string {
  if (params.hasPresetSelections || params.userPremise?.trim()) return "";
  return [
    "GENERATE FROM BASICS:",
    "No preset and no user premise were supplied. Invent one coherent, original Vertical Drama story from the basic setup facts in the payload.",
    "Treat title/genre/tone/business/product/audience/episode-count/lineage facts as constraints. Fill every missing creative decision yourself.",
    "For sequel or special-edition lineage, continuity facts are non-negotiable and must remain recognizable in the resulting plot, cast, and season arc.",
  ].join("\n");
}

function buildPartialInputCompletionBlock(): string {
  return [
    "PARTIAL INPUT COMPLETION:",
    "Every creator-facing input is optional unless the request explicitly marks it as a hard operational constraint.",
    "Use every non-empty user-provided value as a meaningful creative constraint, preserve its intent, and never silently replace it with a generic invention.",
    "A blank, omitted, or default-only field is permission to decide that detail yourself; do not ask the creator to fill it in and do not describe the missing field as an error.",
    "Complete the missing creative decisions coherently across title, genre, logline, main plot, season arc, tone, cliffhanger, characters, locations, and visual bible.",
    "When no creator title hint is supplied, return 4 or 5 distinct titleOptions and include the recommended title verbatim in that list; when a title hint is supplied, keep it authoritative.",
    "Do not copy instructional examples, placeholder text, JSON keys, or field labels into the creator-facing story.",
  ].join("\n");
}

function buildLineageContinuityBlock(
  lineageContext: VerticalDramaSeriesLineage | undefined
): string {
  if (!lineageContext) return "";

  return [
    "SEQUEL CONTINUITY (PRIMARY CANON):",
    "This is a continuation, not a reboot.",
    "- Treat the lineageContext payload as non-negotiable canon: preserve the parent series identity, prior-season events, returning characters, established relationships, world, and unresolved threads.",
    "- Advance those existing characters and conflicts into the new installment. Never replace them with an unrelated protagonist, business, community, setting, or story premise.",
    "- Any user premise is a NEW-SEASON DIRECTION layered onto this canon. Use it to evolve the existing story; it must not erase, contradict, or displace continuity.",
    "- If a requested detail conflicts with canon, preserve canon and record the conflict in `warnings`.",
    "- The title/logline/mainPlot/seasonArc/characters/visualBible must remain visibly traceable to the parent series.",
  ].join("\n");
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
export function assertPresetSynthesizerSkillSupportsV2(
  systemPrompt: string
): void {
  const missing = V2_SKILL_CONTRACT_MARKERS.filter(
    marker => !systemPrompt.includes(marker)
  );
  if (missing.length > 0) {
    throw new Error(
      `vertical-drama-preset-synthesizer skill is missing its v2 output contract markers: ${missing.join(", ")}`
    );
  }
}

function assertPresetSynthesizerSkillSupportsVisualNarrative(
  systemPrompt: string
): void {
  const missing = VISUAL_NARRATIVE_SKILL_CONTRACT_MARKERS.filter(
    marker => !systemPrompt.includes(marker)
  );
  if (missing.length > 0) {
    throw new Error(
      `vertical-drama-preset-synthesizer skill is missing its visual narrative contract markers: ${missing.join(", ")}`
    );
  }
}

function clampText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeSynthesizedCharacters(
  characters: SynthesizedGenrePresetDraft["characters"]
): SynthesizedGenrePresetDraft["characters"] {
  return characters.map(character => {
    const legacy = normalizeLegacyRole(character.role);
    const narrativeRole =
      character.narrativeRole ??
      legacy.narrativeRole ??
      (character.roleTier
        ? roleTierToNarrativeRole(character.roleTier)
        : undefined);
    const roleTier = character.roleTier ?? legacy.roleTier ?? undefined;
    return {
      ...character,
      narrativeRole,
      roleTier,
      occupation: character.occupation ?? character.role,
    };
  });
}

function buildDraftStructuralDiagnostics(params: {
  draft: Pick<
    SynthesizedGenrePresetDraft,
    | "characters"
    | "storyContext"
    | "storyDesign"
    | "storyContract"
    | "diagnostics"
  >;
  targetEpisodeCount?: number;
  genre?: string;
  userPremise?: string;
}): VerticalDramaDraftDiagnostic[] {
  const diagnostics = readVerticalDramaDraftDiagnostics(
    params.draft.diagnostics
  );
  const characters = params.draft.characters;
  for (const [index, character] of characters.entries()) {
    if (!character.narrativeRole || !character.roleTier) {
      diagnostics.push({
        code: "character_role_contract_incomplete",
        severity: "blocking",
        message: `Character ${character.name} is missing a valid narrativeRole or roleTier. Repair the draft before applying it.`,
        messageEn: `Character ${character.name} is missing a valid narrativeRole or roleTier. Repair the draft before applying it.`,
        paths: [`characters[${index}]`],
        repairable: true,
      });
    }
  }

  if (!readVerticalDramaDraftStoryContext(params.draft.storyContext)) {
    diagnostics.push({
      code: "story_context_missing",
      severity: "warning",
      message:
        "Draft ยังไม่มีการแยกตลาด เรื่องราว สัญชาติ/พื้นหลังตัวละคร และภาษาพูดอย่างชัดเจน ระบบจะใช้ค่า legacy ชั่วคราวและควรตรวจสอบก่อนสร้างจริง",
      messageEn:
        "The draft does not include separated market, setting, character background, and spoken-language facts. Legacy defaults will be used; review before creation.",
      paths: ["storyContext"],
      repairable: true,
    });
  }

  const architecture = evaluateVerticalDramaStoryArchitecture({
    contract: params.draft.storyContract,
    genre: params.genre,
    userPremise: params.userPremise,
    targetEpisodeCount: params.targetEpisodeCount,
  });
  for (const diagnostic of architecture.diagnostics) {
    diagnostics.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      messageEn: diagnostic.messageEn,
      paths: diagnostic.paths,
      repairable: diagnostic.repairable,
    });
  }

  if (!readVerticalDramaDraftStoryDesign(params.draft.storyDesign)) {
    diagnostics.push({
      code: "story_design_missing",
      severity: "warning",
      message:
        "Draft ยังไม่มี story design แบบมีแกนเรื่อง แรงกดดัน จุด payoff และลำดับ romance ครบถ้วน ระบบจะให้ Story Bible เติมต่อจาก premise",
      messageEn:
        "The draft does not include the bounded story design yet. Story Bible will continue from the premise, but review the story spine before creation.",
      paths: ["storyDesign"],
      repairable: true,
    });
  }

  const storyDesign = readVerticalDramaDraftStoryDesign(
    params.draft.storyDesign
  );
  if (storyDesign && !storyDesign.storyControlSeed) {
    diagnostics.push({
      code: "story_control_seed_missing",
      severity: "warning",
      message:
        "Draft มี story design แต่ยังไม่มี Story Control Seed ระบบจะสร้าง seed ต่อใน Story Bible และควรตรวจสอบความต่อเนื่องก่อนสร้างเต็ม",
      messageEn:
        "The draft has a story design but no Story Control Seed yet. Story Bible will create the continuity seed; review continuity before full generation.",
      paths: ["storyDesign.storyControlSeed"],
      repairable: true,
    });
  }
  if (storyDesign?.storyControlSeed) {
    const seed = readVerticalDramaStoryControlSeed(
      storyDesign.storyControlSeed,
      {
        totalEpisodeCount: params.targetEpisodeCount,
      }
    );
    const characterNames = new Set(
      characters.map(character => character.name.trim()).filter(Boolean)
    );
    const unknownCanonicalCharacters = seed
      ? seed.canonicalCharacterKeys.filter(key => !characterNames.has(key))
      : [];
    if (!seed || unknownCanonicalCharacters.length > 0) {
      diagnostics.push({
        code: "story_control_seed_invalid",
        severity: "blocking",
        message:
          "Story Control Seed ไม่สอดคล้องกับชื่อตัวละครหรือจำนวนตอนที่กำหนด จึงยังใช้ draft นี้ไม่ได้",
        messageEn:
          "The Story Control Seed is inconsistent with canonical character names or the planned episode count, so this draft cannot be applied yet.",
        paths: ["storyDesign.storyControlSeed"],
        repairable: true,
      });
    }
  }
  return diagnostics;
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
/**
 * `hasPresetSelections` (Phase 2, `planning/vd-premise-first-wizard/plan.md`
 * §2.3) — true when the caller selected at least one preset/category flavor
 * alongside the premise. Before Phase 2, a premise could never reach this
 * function with ZERO presets selected (the `MIN_SELECTIONS=2` gate blocked
 * it upstream), so the "selected presets (1-5) are supporting flavor" line
 * below was always true. Phase 2 lifts that gate when a premise is present
 * (see `validatePresetSynthesisSelection`'s `hasUserPremise` param), so this
 * block must now render DIFFERENT guidance for the genuinely-zero-selection
 * case — otherwise the prompt tells the model to treat nonexistent presets
 * as supporting flavor and to consult a `primarySelectionId` that (per the
 * `buildFacetAssignments` fix below) no longer names a real preset, exactly
 * the "dangling primary" incoherence flagged in the task brief. The
 * with-selections branch is worded identically to before Phase 2 (still
 * "(1-5)", since 1 is now also a valid non-zero count) — byte-identical
 * prompt for every caller that already had >=1 selection.
 */
function buildUserPremisePrimaryBlock(
  userPremise: string | undefined,
  hasPresetSelections: boolean,
  hasLineageContext = false
): string | null {
  const trimmed = userPremise?.trim();
  if (!trimmed) return null;

  if (hasLineageContext) {
    return [
      "USER PREMISE (NEW-SEASON DIRECTION):",
      trimmed,
      "",
      "Blending rules when lineage and a user premise are present:",
      "- The series lineage is the primary story spine and canon.",
      "- Apply the premise as the requested evolution of the existing cast,",
      "  relationships, world, and unresolved threads — never as a replacement story.",
      ...(hasPresetSelections
        ? [
            "- Selected presets are supporting flavor only. They may intensify",
            "  drama or texture but cannot displace lineage or the requested evolution.",
          ]
        : [
            "- No preset or category was selected. Do not invent or reference one;",
            "  synthesize directly from lineage plus this new-season direction.",
          ]),
      "- The synthesized draft's logline and mainPlot must visibly continue the",
      "  parent story while incorporating the premise.",
    ].join("\n");
  }

  const blendingRules = hasPresetSelections
    ? [
        "- The selected presets (1-5) are supporting flavor: use them to intensify",
        "  drama, sharpen tropes, add contemporary texture, and fill gaps the user",
        "  left open. Do not let any preset displace a premise-stated element.",
        "- primarySelectionId, when also provided, selects which preset contributes",
        "  the strongest *flavor*, not the spine.",
        "- If a preset directly conflicts with the premise, keep the premise and",
        "  record the dropped preset element in `warnings`.",
      ]
    : [
        "- No preset or category was selected — build the ENTIRE draft from the",
        "  premise alone. Do not invent or reference a preset that was not",
        "  selected; ignore any `primarySelectionId`/preset-blend framing",
        "  elsewhere in this prompt and set `mixRecipe.primaryFlavor` to",
        '  "user_premise", leave `mixRecipe.supportingFlavors` empty, and use',
        "  `mixRecipe.rationale` to note the draft is synthesized purely from",
        "  the user's premise.",
      ];

  return [
    "USER PREMISE (PRIMARY SPINE):",
    trimmed,
    "",
    "Blending rules when a user premise is present:",
    "- The user premise is the primary story spine. Setting, protagonist, core",
    "  conflict, and direction stated by the user are non-negotiable.",
    ...blendingRules,
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
    if (
      run.length >= THAI_NGRAM_MIN_RUN_LENGTH &&
      THAI_SCRIPT_RANGE.test(run)
    ) {
      for (let i = 0; i <= run.length - THAI_NGRAM_SIZE; i++) {
        tokens.push(run.slice(i, i + THAI_NGRAM_SIZE));
      }
    } else {
      tokens.push(run);
    }
  }

  return tokens.filter(
    token => token.length >= 2 && !PREMISE_COVERAGE_STOPWORDS.has(token)
  );
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
  draft: { logline: string; mainPlot: string; seasonArc: string }
): EvaluatePremiseCoverageResult {
  const trimmedPremise = premise?.trim() ?? "";
  if (!trimmedPremise) {
    return { covered: true };
  }

  const premiseTokens = Array.from(
    new Set(tokenizePremiseText(trimmedPremise))
  );
  if (premiseTokens.length === 0) {
    return { covered: true };
  }

  const draftTokens = new Set(
    tokenizePremiseText(
      `${draft.logline}\n${draft.mainPlot}\n${draft.seasonArc}`
    )
  );

  const matchedCount = premiseTokens.filter(token =>
    draftTokens.has(token)
  ).length;
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
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

/**
 * Clamps every `titleOptions` candidate to the same `"title"` create-series
 * limit (255 — `CREATE_SERIES_FIELD_LIMITS.title`) that
 * `clampDraftForCreateSeries`/`clampTitleAndToneForCreateSeries` apply to
 * `title` itself — any candidate may later be picked as the recommended
 * `title` (see CreateSeriesWizard.tsx's title-picker, which writes a chosen
 * `titleOptions` entry straight into `form.title`), so it must satisfy the
 * same bound `title` does. Previously this (and `clampDraftForCreateSeries`/
 * `clampTitleAndToneForCreateSeries`) clamped against the unrelated
 * `"genre"` limit (100) — `title` never feeds the genre field (see those
 * functions' doc comments below) — so it needlessly truncated candidates
 * that were already valid up to the schema's own 150-char ceiling
 * (`SYNTHESIZED_TITLE_MAX_LENGTH`).
 * Fixed: planning/vd-character-prompt-followups/plan.md Item 3. Pure/
 * side-effect-free; `undefined` in, `undefined` out (the field is
 * optional/additive).
 */
function clampTitleOptionsForCreateSeries(titleOptions: string[] | undefined): {
  titleOptions: string[] | undefined;
  changed: boolean;
} {
  if (!titleOptions) return { titleOptions: undefined, changed: false };
  const clamped = titleOptions.map(
    option => clampToCreateSeriesLimit(option, "title") ?? option
  );
  const changed = clamped.some((value, index) => value !== titleOptions[index]);
  return { titleOptions: clamped, changed };
}

/**
 * The Create Series wizard maps `draft.title` -> the series TITLE field and
 * `draft.tone` -> `tone` (see CreateSeriesWizard.tsx `applyPresetDraft`);
 * `draft.category` — NEVER `draft.title` — separately maps to `genre` via
 * `resolveGenreAfterPresetDraft(prev.genre, draft.category, resolvedTitle)`,
 * which clamps `draft.category` against `"genre"` (100) itself and only
 * consults the resolved title for its `detectGenrePollution` similarity
 * check, never assigns it into `genre`. `category` is additionally bounded
 * to 60 chars by this schema's own `.max(60)`, well inside the genre limit
 * regardless of how long `title` is. So `draft.title` below is clamped
 * against the `"title"` create-series limit (255,
 * `CREATE_SERIES_FIELD_LIMITS.title`) — its own field's real limit — not
 * `"genre"` (100), which a prior version of this function mistakenly
 * reused and which needlessly truncated titles between the skill's
 * ~100-150-char guidance and the 255-char hard cap
 * (planning/vd-character-prompt-followups/plan.md Item 3). Clamp to the
 * shared create-series limits (belt) in addition to the skill prompt
 * guidance / `SYNTHESIZED_TITLE_MAX_LENGTH` schema bound (suspenders) so the
 * wizard never receives an unusable draft — in practice this clamp is a
 * near-no-op because the Zod schema already rejects (forces a retry on) any
 * `title` over `SYNTHESIZED_TITLE_MAX_LENGTH` (150), well under 255.
 * `titleOptions` (when present) is clamped the same way, entry by entry,
 * since any candidate may eventually be picked as `title`.
 */
export function clampDraftForCreateSeries(draft: SynthesizedGenrePresetDraft): {
  draft: SynthesizedGenrePresetDraft;
  clamped: boolean;
} {
  const clampedTitle =
    clampToCreateSeriesLimit(draft.title, "title") ?? draft.title;
  const clampedTone =
    clampToCreateSeriesLimit(draft.tone, "tone") ?? draft.tone;
  const { titleOptions: clampedTitleOptions, changed: titleOptionsChanged } =
    clampTitleOptionsForCreateSeries(draft.titleOptions);
  const clamped =
    clampedTitle !== draft.title ||
    clampedTone !== draft.tone ||
    titleOptionsChanged;

  if (!clamped) {
    return { draft, clamped: false };
  }

  return {
    draft: {
      ...draft,
      title: clampedTitle,
      tone: clampedTone,
      ...(clampedTitleOptions ? { titleOptions: clampedTitleOptions } : {}),
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

function buildSinglePresetVariationBlock(
  selectedPresetCount: number,
  variationNonce: string
): string {
  if (selectedPresetCount !== 1) return "";
  return [
    "SINGLE-PRESET VARIATION MODE:",
    `This is a one-preset inspiration request. Variation nonce: ${variationNonce}.`,
    "Treat the selected preset as genre flavor and creative inspiration only, never as a template to copy.",
    "Create a distinctly reinterpreted story with new premise, conflict, setting, cast dynamics, season arc, visual bible, and title options.",
    "Do not repeat the selected preset title, logline, main plot, season arc, character names/descriptions, or visual-bible wording verbatim.",
    "Preserve only the useful genre flavor and explicit creator constraints; the final draft must stand on its own as a new series idea.",
  ].join("\n");
}

type VisualNarrativePromptContext = {
  styleName?: string;
  palette: string[];
  lighting?: string;
  environmentMotifs: string[];
  wardrobeGrammar: string[];
  signaturePropsAndCompanions: string[];
  cameraGrammar?: string;
};

function toVisualNarrativePromptContext(
  identity:
    | VerticalDramaPresetVisualIdentity
    | VerticalDramaMergedVisualIdentity
    | null
    | undefined
): VisualNarrativePromptContext | null {
  if (!identity) return null;
  return {
    ...("styleName" in identity ? { styleName: identity.styleName } : {}),
    palette: identity.palette,
    ...("lighting" in identity ? { lighting: identity.lighting } : {}),
    environmentMotifs: identity.environmentMotifs,
    wardrobeGrammar: identity.wardrobeGrammar,
    signaturePropsAndCompanions: identity.signaturePropsAndCompanions,
    ...("cameraGrammar" in identity
      ? { cameraGrammar: identity.cameraGrammar }
      : {}),
  };
}

function resolveVisualNarrativePromptContext(
  params: Pick<
    SynthesizeVerticalDramaPresetParams,
    "selectedPresets" | "primarySelectionId" | "visualNarrativeIdentity"
  >
): VisualNarrativePromptContext | null {
  const explicit = toVisualNarrativePromptContext(
    params.visualNarrativeIdentity
  );
  if (explicit) return explicit;

  const selectedIdentity =
    params.selectedPresets.find(
      preset => preset.id === params.primarySelectionId
    )?.visualIdentityJson ??
    params.selectedPresets.find(preset => preset.visualIdentityJson)
      ?.visualIdentityJson ??
    undefined;
  return toVisualNarrativePromptContext(selectedIdentity ?? undefined);
}

function buildVisualNarrativeDraftBlock(
  context: VisualNarrativePromptContext | null
): string | null {
  if (!context) return null;
  return [
    "VISUAL NARRATIVE DNA (SOFT STORY GUIDANCE):",
    JSON.stringify(context),
    "Translate these production-look facts into a short creator-readable visualNarrativeProfile.",
    "The profile may enrich locations, recurring motifs, emotional staging, wardrobe meaning, and relationship visual language, but it is NOT a plot spine.",
    "Never invent, remove, resolve, or contradict the user premise, lineage canon, character facts, relationship states, story-control seed, audience constraints, or selected language.",
    "Use 1-5 motifs with a concrete narrativeFunction, 0-6 relationshipVisualLanguage entries, 0-6 sceneOpportunities, and at least one constraint. Use motifs selectively; do not make every episode or shot use every motif.",
    "Return visualNarrativeProfile.version as 1 and write every profile string in the narrative/content language, not the spoken language.",
  ].join("\n");
}

const VISUAL_NARRATIVE_PROFILE_JSON_SHAPE =
  '"visualNarrativeProfile":{"version":1,"emotionalRegister":string,"worldTexture":string,"recurringMotifs":[{"motif":string,"narrativeFunction":string}],"relationshipVisualLanguage":[{"phase":string,"visualExpression":string}],"sceneOpportunities":[string],"constraints":[string]}';

function buildUserPrompt(
  params: SynthesizeVerticalDramaPresetParams,
  variationNonce: string,
  storyArchitecture?: VerticalDramaStoryArchitectureContract | null
): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all narrative/content fields in natural Thai; title and titleOptions follow the DRAFT LANGUAGE CONTRACT below."
      : `Write all narrative/content fields in ${verticalDramaLocaleEnglishName(params.locale)}; title and titleOptions follow the DRAFT LANGUAGE CONTRACT below.`;
  const sourcePackBlock = renderSourcePackDigestPromptBlock(
    params.sourcePackDigest
  );

  const selectedPresetSummaries = params.selectedPresets.map(preset => ({
    id: preset.id,
    title: preset.title,
    category: preset.category,
    categoryLabel: genrePresetCategoryLabel(
      preset.category,
      params.locale === "th" ? "th" : "en"
    ),
    logline: preset.logline,
    tone: preset.tone,
    cliffhangerStyle: preset.cliffhangerStyle,
    mainPlot: preset.mainPlot.slice(0, 1200),
    seasonArc: preset.seasonArc.slice(0, 900),
    visualBible: preset.visualBible.slice(0, 700),
    characterSeeds: preset.characters.slice(0, 5),
  }));

  const selectedCategories = params.selectedCategories.map(category => ({
    category,
    label: genrePresetCategoryLabel(
      category,
      params.locale === "th" ? "th" : "en"
    ),
  }));

  // Phase 2 (`planning/vd-premise-first-wizard/plan.md` §2.3) — whether the
  // caller selected ANY preset/category flavor at all. Before Phase 2 this
  // was always true whenever `buildUserPrompt` ran (either the premise flag
  // was off, so `MIN_SELECTIONS=2` still gated the caller, or a premise was
  // present alongside >=2 selections). Threaded into `primarySelectionId`'s
  // "auto" fallback below and `buildUserPremisePrimaryBlock`/`rules` so a
  // genuinely-zero-selection prompt never asks the model to consult a
  // "primary" or "supporting flavor" that does not exist.
  const hasPresetSelections =
    params.selectedPresets.length > 0 || params.selectedCategories.length > 0;
  const hasUserPremise = Boolean(params.userPremise?.trim());
  const hasLineageContext = Boolean(params.lineageContext);
  const visualNarrativeContext = params.visualNarrativeEnabled
    ? resolveVisualNarrativePromptContext(params)
    : null;

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
    ...(params.seriesTitleHint
      ? {
          seriesTitleHint: clampText(
            params.seriesTitleHint,
            CREATE_SERIES_FIELD_LIMITS.title
          ),
        }
      : {}),
    ...(params.genreHint
      ? {
          genreHint: clampText(
            params.genreHint,
            CREATE_SERIES_FIELD_LIMITS.genre
          ),
        }
      : {}),
    ...(params.lineageContext ? { lineageContext: params.lineageContext } : {}),
    ...(visualNarrativeContext ? { visualNarrativeContext } : {}),
    ...(storyArchitecture ? { storyArchitecture } : {}),
    ...(params.seriesProfileId
      ? { seriesProfileId: params.seriesProfileId }
      : {}),
    ...(params.sourcePackDigest
      ? { sourcePackDigest: params.sourcePackDigest }
      : {}),
    rules: [
      "Create one coherent preset draft, not a collage.",
      hasPresetSelections
        ? "Use one primary story spine and supporting flavors for situations, tone, and scene texture."
        : hasUserPremise
          ? hasLineageContext
            ? "No preset or category was selected — build the continuation from lineage canon and use the user premise only as its new-season direction."
            : "No preset or category was selected — build the entire draft from the user premise alone; ignore `primarySelectionId` (it is a placeholder, not a real preset)."
          : "No preset, category, or premise was selected — build the entire draft from the basic setup facts and make strong original choices for every missing detail.",
      "Keep the result easy for a non-technical creator to edit.",
      "Product or service tie-in may help a scene, but must not magically solve the main conflict.",
      ...(sourcePackBlock
        ? [
            "Treat SOURCE PACK GROUNDING as authoritative evidence for the selected documentary/review profile and keep unsupported claims out of the draft.",
          ]
        : []),
      hasPresetSelections
        ? 'Use "mixRecipe.primaryFlavor" to name the dominant preset/category flavor and "mixRecipe.supportingFlavors" for the rest.'
        : `Set "mixRecipe.primaryFlavor" to "${hasLineageContext && hasUserPremise ? "series_lineage" : hasUserPremise ? "user_premise" : "ai_original"}" and leave "mixRecipe.supportingFlavors" as an empty array — there is no preset to name.`,
      "Use compact JSON only.",
      `"title" MUST be at most ${SYNTHESIZED_TITLE_MAX_LENGTH} characters (it fills the series TITLE field — "category" is what fills the genre field) — keep it short and punchy.`,
      `"tone" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.tone} characters — a brief phrase, not a sentence.`,
      `Every character's "narrativeRole" MUST be exactly one of: ${NARRATIVE_ROLE_VALUES.join(", ")}.`,
      `Every character's "roleTier" MUST be exactly one of: ${ROLE_TIER_VALUES.join(", ")}. Copy one value verbatim — never invent a new label.`,
      "If a character role is uncertain, use the closest allowed roleTier and include a creator-facing warning; never omit roleTier or invent an enum value.",
      "Use storyContext to separate targetMarket, storySetting, leadBackground, leadOrigin, spokenDialogue, and namingPolicy. Use storyDesign to keep one primary engine, bounded pressure threads, an early payoff, romance progression, advantage beats, and a valid storyControlSeed. Use the exact generated character names as storyControlSeed.canonicalCharacterKeys.",
      storyArchitecture
        ? "Use the APPROVED STORY ARCHITECTURE as the authoritative source for destination, transformation, required arcs, failure model, and final payoff. Derive storyDesign, creatorSummary, mainPlot, and seasonArc from it without changing its meaning."
        : "No pre-approved Story Architecture was supplied. Generate a complete Story Architecture Contract in this same response before deriving storyDesign, creatorSummary, mainPlot, and seasonArc from it. Return the contract in storyContract; do not omit it or replace it with a diagnostic.",
      params.seriesTitleHint?.trim()
        ? 'If you return "titleOptions", it MUST have 4 or 5 entries and MUST include "title" verbatim as one of them.'
        : 'No creator title was supplied: "titleOptions" is required and MUST have 4 or 5 distinct entries including "title" verbatim as one of them.',
      'If you return "locations", it MUST have 3 to 6 entries, each with "name" and "description".',
      ...(visualNarrativeContext
        ? [
            'Return "visualNarrativeProfile" using the exact bounded shape requested below. It is soft story guidance, not a second plot spine.',
          ]
        : []),
    ],
  };

  const jsonShape = [
    '{"contract_version":1,"title":string,"titleOptions":[string],"category":string,"logline":string,"mainPlot":string,"seasonArc":string,"tone":string,"cliffhangerStyle":string,"creatorSummary":{"whatItIsAbout":string,"protagonistAndGoal":string,"conflictAndDiscovery":string,"centralMystery":string,"decisionNotes":[string]},"characters":[{"name":string,"role":string,"narrativeRole":string,"roleTier":string,"occupation":string,"description":string}],"visualBible":string,"locations":[{"name":string,"description":string}],"mixRecipe":{"primaryFlavor":string,"supportingFlavors":[string],"rationale":string},"warnings":[{"code":string,"message":string}]',
    ',"storyContract":object,"storyContext":object,"storyDesign":object,"diagnostics":[{"code":string,"severity":string,"message":string}]',
    visualNarrativeContext ? `,${VISUAL_NARRATIVE_PROFILE_JSON_SHAPE}` : "",
    "}",
  ].join("");

  return [
    renderCriteriaVersionMarker(),
    langInstruction,
    buildVerticalDramaDraftLanguageContractPrompt({
      narrativeLocale: params.locale,
      dialogueLanguageProfile: params.dialogueLanguageProfile,
    }),
    buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: params.locale,
      profile: params.dialogueLanguageProfile,
    }),
    buildVerticalDramaDraftStoryContextPrompt({
      locale: params.locale,
      dialogueLanguageProfile: params.dialogueLanguageProfile,
    }),
    buildVerticalDramaDraftStoryDesignPrompt({
      targetEpisodeCount: params.targetEpisodeCount,
    }),
    renderVerticalDramaStoryArchitectureBlock(storyArchitecture),
    buildPartialInputCompletionBlock(),
    params.audienceAgeRating
      ? renderAudienceAgeRatingBlock(params.audienceAgeRating)
      : "",
    buildLineageContinuityBlock(params.lineageContext),
    buildSinglePresetVariationBlock(
      params.selectedPresets.length,
      variationNonce
    ),
    buildVisualNarrativeDraftBlock(visualNarrativeContext),
    sourcePackBlock,
    buildUserPremisePrimaryBlock(
      params.userPremise,
      hasPresetSelections,
      hasLineageContext
    ),
    buildGenerateFromBasicsBlock({
      hasPresetSelections,
      userPremise: params.userPremise,
    }),
    "Synthesize a new Vertical Drama Series genre preset from this payload:",
    JSON.stringify(payload),
    "Return exactly this JSON shape:",
    jsonShape,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

export function validatePresetSynthesisSelection(params: {
  selectedPresets: unknown[];
  selectedCategories: string[];
  /**
   * Phase 2 (`planning/vd-premise-first-wizard/plan.md` §2.1) — true only
   * when the SERVICE actually received a non-empty, tenant-flag-gated user
   * premise (see `SynthesizeVerticalDramaPresetParams.userPremise` /
   * `SynthesizeVerticalDramaPresetV2Params.userPremise`: the router already
   * forces this to `undefined` when `verticalDramaUserPremise` is off, so
   * both call sites below derive this fact from their OWN gated `params`,
   * never from raw client input). When true, the premise itself is a
   * sufficient story spine, so the "at least 2 flavors" floor is lifted to
   * 0. Omitted/false reproduces today's `MIN_SELECTIONS` behavior
   * byte-for-byte — every existing caller (no premise, or premise support
   * not yet threaded through) is unaffected. `MAX_SELECTIONS` (5) applies
   * unconditionally either way — this flag only ever lowers the floor, never
   * raises the ceiling.
   */
  hasUserPremise?: boolean;
  /** Wizard basics (including defaults) may stand in for preset/premise seed. */
  hasBasicSeed?: boolean;
}) {
  const total =
    params.selectedPresets.length +
    uniqueStrings(params.selectedCategories).length;
  const minSelections =
    params.hasUserPremise || params.hasBasicSeed ? 0 : MIN_SELECTIONS;
  if (total < minSelections) {
    throw new PresetSynthesisInputError(
      "Select at least 2 story flavors for Mix and Match"
    );
  }
  if (total > MAX_SELECTIONS) {
    throw new PresetSynthesisInputError(
      "Select up to 5 story flavors for Mix and Match"
    );
  }
}

export async function synthesizeVerticalDramaPreset(
  params: SynthesizeVerticalDramaPresetParams
): Promise<{
  draft: SynthesizedGenrePresetDraft;
  creditsUsed: number;
  model: string;
}> {
  const selectedCategories = uniqueStrings(params.selectedCategories);
  // Derived from `params.userPremise` — the value THIS function actually
  // received, which the router already forced to `undefined` when the
  // `verticalDramaUserPremise` tenant flag is off (see the param's own
  // doc-comment). Never derive this from anything else, or a flag-off
  // tenant could synthesize a draft the prompt then silently ignores.
  const hasUserPremise = Boolean(params.userPremise?.trim());
  const hasBasicSeed = hasPresetSynthesisBasicSeed({
    ...params,
    selectedCategories,
  });
  const logicalRunKey =
    params.idempotencyKey ??
    `vd-preset-synthesis:${createHash("sha256")
      .update(
        JSON.stringify({
          selectedPresetIds: params.selectedPresets.map(preset => preset.id),
          selectedCategories,
          primarySelectionId: params.primarySelectionId ?? null,
          targetEpisodeCount: params.targetEpisodeCount ?? null,
          userPremise: params.userPremise ?? null,
        }),
      )
      .digest("hex")
      .slice(0, 24)}`;
  validatePresetSynthesisSelection({
    selectedPresets: params.selectedPresets,
    selectedCategories,
    hasUserPremise,
    hasBasicSeed,
  });

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model =
    params.model ??
    (await (
      await import("./verticalDramaLlmModelPolicy")
    ).resolveVerticalDramaRecommendedDraftModel());
  const systemPrompt = loadSkillSystemPrompt();
  const variationNonce = randomUUID();
  const visualNarrativeContext = params.visualNarrativeEnabled
    ? resolveVisualNarrativePromptContext(params)
    : null;
  if (visualNarrativeContext) {
    assertPresetSynthesizerSkillSupportsVisualNarrative(systemPrompt);
  }
  const userPrompt = buildUserPrompt(
    { ...params, selectedCategories },
    variationNonce,
    params.storyArchitecture
  );

  const {
    data: synthesizedDraft,
    response,
    model: effectiveModel,
  } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.75,
    userId: params.userId,
    maxTokens: 4500,
    schema: synthesizedPresetDraftSchema,
    disableProviderFallbacks: true,
    maxTransientRetries: 0,
    label: "Preset synthesis",
  });
  const usedModel = effectiveModel ?? model;

  const {
    visualNarrativeProfile: rawVisualNarrativeProfile,
    storyContract: rawStoryContract,
    ...draftWithoutVisualNarrativeProfile
  } = synthesizedDraft;
  // Story Architecture is a server-approved foundation.  Do not depend on
  // the synthesizer echoing it back: providers/models are allowed to omit
  // additive fields even when the prompt asks for them.  Re-bind the exact
  // foundation here so it cannot disappear between architecture and Draft
  // completion.
  const storyContract =
    readVerticalDramaStoryArchitecture(params.storyArchitecture) ??
    readVerticalDramaStoryArchitecture(rawStoryContract);
  const normalizedDraft = {
    ...draftWithoutVisualNarrativeProfile,
    characters: normalizeSynthesizedCharacters(synthesizedDraft.characters),
    ...(storyContract ? { storyContract } : {}),
    ...(readVerticalDramaDraftStoryContext(synthesizedDraft.storyContext)
      ? {
          storyContext: readVerticalDramaDraftStoryContext(
            synthesizedDraft.storyContext
          ),
        }
      : {}),
    ...(readVerticalDramaDraftStoryDesign(synthesizedDraft.storyDesign)
      ? {
          storyDesign: readVerticalDramaDraftStoryDesign(
            synthesizedDraft.storyDesign
          ),
        }
      : {}),
    ...(visualNarrativeContext && rawVisualNarrativeProfile
      ? { visualNarrativeProfile: rawVisualNarrativeProfile }
      : {}),
  };
  const structuralDiagnostics = buildDraftStructuralDiagnostics({
    draft: normalizedDraft,
    targetEpisodeCount: params.targetEpisodeCount,
    genre: params.genreHint,
    userPremise: params.userPremise,
  });
  const normalizedDraftWithDiagnostics = {
    ...normalizedDraft,
    ...(structuralDiagnostics.length
      ? { diagnostics: structuralDiagnostics }
      : {}),
  };
  const { draft: clampedDraft } = clampDraftForCreateSeries(
    normalizedDraftWithDiagnostics
  );
  const draft = appendPremiseCoverageWarning(clampedDraft, params.userPremise);

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    usedModel
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: "Vertical Drama — synthesize mix-and-match preset",
    idempotencyKey: `${logicalRunKey}:preset-synthesis`,
    skillRunId: `vd-preset-synthesis:${logicalRunKey}`,
    skillSlug: "vertical-drama-preset-synthesizer",
    sourceType: "skill",
    metadata: {
      model: usedModel,
      llmModel: usedModel,
      feature: "vertical_drama_preset_synthesis",
      selectedPresetIds: params.selectedPresets.map(preset => preset.id),
      selectedCategories,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      logicalRunKey,
    },
  });

  return { draft, creditsUsed, model: usedModel };
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
  return (params.selectedPresetIds ?? []).map(presetId => ({
    presetId,
    weight: DEFAULT_MIX_WEIGHT,
  }));
}

/** The 7 facets every non-primary preset competes for coverage in (everything except `story_spine`, which the primary owns exclusively — spec §8.2.2.C.1). */
const NON_SPINE_BLEND_FACETS: VerticalDramaBlendFacet[] =
  VERTICAL_DRAMA_BLEND_FACETS.filter(facet => facet !== "story_spine");

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
 *
 * Phase 2 (`planning/vd-premise-first-wizard/plan.md` §2.3) hardening: the
 * SAME "known ids only" guard now ALSO applies to `primarySelectionId`
 * itself. Previously it was seeded into every facet unconditionally, even
 * when it did not match any preset in `presets` — harmless before Phase 2,
 * because a `primarySelectionId` only ever reached here derived from a real
 * selection (`MIN_SELECTIONS=2` guaranteed at least one). Phase 2 lets a
 * premise-only caller reach this with ZERO presets, whose callers fall back
 * to a placeholder id (`"auto"`, see `synthesizeVerticalDramaPresetV2`) that
 * names no real preset — seeding it in would render a `facetAssignments`
 * table telling the model to blend a preset that does not exist. Skipping
 * the seed when `primarySelectionId` is unknown leaves every facet's
 * `presetIds` at its already-initialized `[]`, which is exactly correct:
 * nothing was selected, so nothing is assigned.
 */
export function buildFacetAssignments(
  selections: VerticalDramaPresetMixSelection[],
  presets: PresetSynthesisPresetInput[],
  primarySelectionId: string,
  minFacetsPerPreset: number = DEFAULT_MIN_FACETS_PER_PRESET
): VerticalDramaFacetAssignmentEntry[] {
  const knownIds = new Set(presets.map(preset => preset.id));
  const relevantSelections = selections.filter(selection =>
    knownIds.has(selection.presetId)
  );
  const nonPrimarySelections = relevantSelections.filter(
    selection => selection.presetId !== primarySelectionId
  );

  const byFacet = new Map<VerticalDramaBlendFacet, string[]>(
    VERTICAL_DRAMA_BLEND_FACETS.map(facet => [facet, [] as string[]])
  );

  if (knownIds.has(primarySelectionId)) {
    byFacet.set("story_spine", [primarySelectionId]);
    for (const facet of NON_SPINE_BLEND_FACETS) {
      byFacet.get(facet)!.push(primarySelectionId);
    }
  }

  nonPrimarySelections.forEach((selection, index) => {
    const facetCount = Math.min(
      minFacetsPerPreset + (selection.weight - 1),
      NON_SPINE_BLEND_FACETS.length
    );
    for (let i = 0; i < facetCount; i++) {
      const facet =
        NON_SPINE_BLEND_FACETS[(index + i) % NON_SPINE_BLEND_FACETS.length];
      byFacet.get(facet)!.push(selection.presetId);
    }
  });

  return VERTICAL_DRAMA_BLEND_FACETS.map(facet => ({
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
  primarySelectionId: string
): VerticalDramaVisualIdentitySelection[] {
  const presetById = new Map(presets.map(preset => [preset.id, preset]));
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
 * `computeBlendCoverage` helper. The primary selection is
 * exempt from the `underBlended` floor (hard rule 1 — it already owns
 * `story_spine` unconditionally and is never one of the "OTHER selected
 * presets" the floor applies to), so it is filtered out of the raw result
 * here so a missing contribution is represented as an explicit zero.
 */
function assembleBlendReport(
  blendFacets: VerticalDramaBlendFacetEntry[],
  minFacetsPerPreset: number,
  primarySelectionId: string,
  params: {
    sourceIds: string[];
    hasUserPremise: boolean;
  }
): VerticalDramaBlendReport {
  const computedCoverage = computeBlendCoverage({ facets: blendFacets });
  // Keep a deterministic zero for every selected source. Without this, a
  // preset that the model forgot to mention disappears from the report and
  // the UI cannot distinguish "not selected" from "not blended".
  const contributionCoverage = Object.fromEntries(
    params.sourceIds.map(sourceId => [
      sourceId,
      computedCoverage[sourceId] ?? 0,
    ])
  );
  const rawUnderBlended = params.sourceIds.filter(
    sourceId => contributionCoverage[sourceId] < minFacetsPerPreset
  );
  const underBlended = rawUnderBlended.filter(
    presetId => presetId !== primarySelectionId
  );
  const presetSourceCount = params.sourceIds.length;
  const sourceCount = presetSourceCount + (params.hasUserPremise ? 1 : 0);
  const blendMode = params.hasUserPremise
    ? presetSourceCount > 0
      ? "premise_plus_presets"
      : "premise_only"
    : presetSourceCount === 0
      ? "no_sources"
      : presetSourceCount === 1
        ? "single_source"
        : "multi_source";
  const status =
    sourceCount <= 1
      ? "not_applicable"
      : underBlended.length === 0 && blendFacets.length > 0
        ? "complete"
        : "incomplete";
  return {
    contractVersion: 2,
    facets: blendFacets,
    contributionCoverage,
    minFacetsPerPreset,
    underBlended,
    blendMode,
    status,
    sourceIds: params.sourceIds,
    sourceCount,
    ...(blendFacets.length === 0
      ? {
          emptyReason:
            sourceCount >= 2
              ? "multi_source_report_incomplete"
              : blendMode === "single_source"
                ? "single_source_no_blend"
                : blendMode === "premise_only"
                  ? "premise_only_no_preset"
                  : "no_blendable_sources",
        }
      : {}),
  };
}

const synthesizedVisualIdentityDraftSchema = z.object({
  styleName: z.string().min(1),
  lighting: z.string().min(1),
  cameraGrammar: z.string().min(1),
  characterArchetypes: z
    .array(verticalDramaPresetCharacterArchetypeSchema)
    .min(1),
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
  visualIdentity: synthesizedVisualIdentityDraftSchema
    .optional()
    .catch(undefined),
});

type SynthesizedGenrePresetDraftV2Raw = z.infer<
  typeof synthesizedPresetDraftV2Schema
>;

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
  /** Stable composition-job identity for ledger idempotency. */
  idempotencyKey?: string;
  /** Server-approved LLM Recommend model for the Draft pipeline. */
  model?: string;
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
  seriesTitleHint?: string;
  genreHint?: string;
  audienceAgeRating?: AudienceAgeRating;
  lineageContext?: VerticalDramaSeriesLineage;
  /** Default `DEFAULT_MIN_FACETS_PER_PRESET` (2). */
  minFacetsPerPreset?: number;
  /** See `SynthesizeVerticalDramaPresetParams.userPremise` (Feature 132 §4, F132A) — same contract, v2 counterpart. */
  userPremise?: string;
  /** Additive spoken-language contract; narrative output still follows `locale`. */
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile;
  /** Additive opt-in: translate the selected look into soft story guidance. */
  visualNarrativeEnabled?: boolean;
  /** A wizard-selected series look, used only when explicitly opted in. */
  visualNarrativeIdentity?: VerticalDramaPresetVisualIdentity;
  /** Server-approved foundation created by the durable wizard composition job. */
  storyArchitecture?: VerticalDramaStoryArchitectureContract;
  /** Bounded, owner-scoped evidence snapshot for documentary/review profiles. */
  sourcePackDigest?: Record<string, unknown>;
  seriesProfileId?: string;
}

/**
 * Generic sibling of `clampDraftForCreateSeries` (v1) — kept SEPARATE (not
 * shared) so v1's own code path/behavior is never touched by this file's v2
 * additions. `titleOptions` is optional on `T` and clamped the same way
 * `clampDraftForCreateSeries` clamps it (see `clampTitleOptionsForCreateSeries`).
 * `title` is clamped against the `"title"` create-series limit (255), not
 * `"genre"` (100) — see `clampDraftForCreateSeries`'s doc comment for the
 * full trace of why `title` never feeds the genre field
 * (planning/vd-character-prompt-followups/plan.md Item 3).
 */
function clampTitleAndToneForCreateSeries<
  T extends {
    title: string;
    tone: string;
    titleOptions?: string[];
    warnings: Array<{ code: string; message: string }>;
  },
>(draft: T): { draft: T; clamped: boolean } {
  const clampedTitle =
    clampToCreateSeriesLimit(draft.title, "title") ?? draft.title;
  const clampedTone =
    clampToCreateSeriesLimit(draft.tone, "tone") ?? draft.tone;
  const { titleOptions: clampedTitleOptions, changed: titleOptionsChanged } =
    clampTitleOptionsForCreateSeries(draft.titleOptions);
  const clamped =
    clampedTitle !== draft.title ||
    clampedTone !== draft.tone ||
    titleOptionsChanged;

  if (!clamped) {
    return { draft, clamped: false };
  }

  return {
    draft: {
      ...draft,
      title: clampedTitle,
      tone: clampedTone,
      ...(clampedTitleOptions ? { titleOptions: clampedTitleOptions } : {}),
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

function buildFacetAssignmentsPromptPayload(
  facetAssignments: VerticalDramaFacetAssignmentEntry[],
  presetTitleById: Map<string, string>
) {
  return facetAssignments.map(entry => ({
    facet: entry.facet,
    assignedPresets: entry.presetIds.map(presetId => ({
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
  variationNonce: string;
  storyArchitecture?: VerticalDramaStoryArchitectureContract | null;
}): string {
  const {
    params,
    selections,
    selectedCategories,
    primarySelectionId,
    facetAssignments,
    mergedVisualIdentity,
    presetTitleById,
    variationNonce,
    storyArchitecture,
  } = args;

  const langInstruction =
    params.locale === "th"
      ? "Write all narrative/content fields in natural Thai; title and titleOptions follow the DRAFT LANGUAGE CONTRACT below."
      : `Write all narrative/content fields in ${verticalDramaLocaleEnglishName(params.locale)}; title and titleOptions follow the DRAFT LANGUAGE CONTRACT below.`;
  const sourcePackBlock = renderSourcePackDigestPromptBlock(
    params.sourcePackDigest
  );

  const weightBySelectionPresetId = new Map(
    selections.map(s => [s.presetId, s.weight])
  );
  const selectedPresetSummaries = params.selectedPresets.map(preset => ({
    id: preset.id,
    title: preset.title,
    category: preset.category,
    categoryLabel: genrePresetCategoryLabel(
      preset.category,
      params.locale === "th" ? "th" : "en"
    ),
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

  const selectedCategoriesPayload = selectedCategories.map(category => ({
    category,
    label: genrePresetCategoryLabel(
      category,
      params.locale === "th" ? "th" : "en"
    ),
  }));

  // Phase 2 (`planning/vd-premise-first-wizard/plan.md` §2.3) — same fact as
  // `buildUserPrompt`'s (v1) `hasPresetSelections`, computed from the SAME
  // resolved `selections`/`selectedCategories` this function already
  // received (not raw client input). When false, `facetAssignments` above
  // is already all-empty (see `buildFacetAssignments`'s "known ids only"
  // guard), so the "verifiable blend" rules below must not ask the model to
  // fill facet slots or name a PRIMARY preset that does not exist.
  const hasPresetSelections =
    selections.length > 0 || selectedCategories.length > 0;
  const hasUserPremise = Boolean(params.userPremise?.trim());
  const hasLineageContext = Boolean(params.lineageContext);
  const visualNarrativeContext = params.visualNarrativeEnabled
    ? (toVisualNarrativePromptContext(params.visualNarrativeIdentity) ??
      toVisualNarrativePromptContext(mergedVisualIdentity))
    : null;

  const blendCoreRules = hasPresetSelections
    ? [
        "Create one coherent preset draft that VERIFIABLY blends every selected preset — not a collage, and never let a non-primary preset silently vanish into unverifiable flavor.",
        'The PRIMARY selection\'s story spine (mainPlot/seasonArc skeleton) drives the main plot; every OTHER selected preset must still land concrete, genuine ("kept": true) contributions in its assigned facets below — fill EVERY facet slot assigned to it in "facetAssignments".',
      ]
    : [
        hasUserPremise
          ? hasLineageContext
            ? "No preset or category was selected — the sequel lineage is the sole story spine; the user premise is a new-season direction layered onto that canon. Do not invent, reference, or blend a preset that was not selected."
            : "No preset or category was selected — the user premise above is the sole story spine. Do not invent, reference, or blend a preset that was not selected."
          : "No preset, category, or premise was selected — the basic setup facts are the story spine. Invent a coherent original story and do not reference a preset that was not selected.",
        'Every facet in "facetAssignments" below intentionally has an empty "assignedPresets" — return "blendFacets" covering every facet with an empty "contributions" array for each (there is nothing to blend).',
      ];

  const payload = {
    language: params.locale,
    selectedPresets: selectedPresetSummaries,
    selectedCategories: selectedCategoriesPayload,
    primarySelectionId,
    facetAssignments: buildFacetAssignmentsPromptPayload(
      facetAssignments,
      presetTitleById
    ),
    visualIdentityContext: mergedVisualIdentity
      ? {
          palette: mergedVisualIdentity.palette,
          environmentMotifs: mergedVisualIdentity.environmentMotifs,
          wardrobeGrammar: mergedVisualIdentity.wardrobeGrammar,
          signaturePropsAndCompanions:
            mergedVisualIdentity.signaturePropsAndCompanions,
          alreadyMergedNegativeFragments:
            mergedVisualIdentity.imagePromptFragments.negative,
        }
      : null,
    ...(visualNarrativeContext ? { visualNarrativeContext } : {}),
    ...(storyArchitecture ? { storyArchitecture } : {}),
    ...(params.seriesProfileId
      ? { seriesProfileId: params.seriesProfileId }
      : {}),
    ...(params.sourcePackDigest
      ? { sourcePackDigest: params.sourcePackDigest }
      : {}),
    businessContext: clampText(params.businessContext, 600),
    productContext: clampText(params.productContext, 600),
    targetEpisodeCount: params.targetEpisodeCount ?? 10,
    toneHint: clampText(params.toneHint, 180),
    ...(params.seriesTitleHint
      ? {
          seriesTitleHint: clampText(
            params.seriesTitleHint,
            CREATE_SERIES_FIELD_LIMITS.title
          ),
        }
      : {}),
    ...(params.genreHint
      ? {
          genreHint: clampText(
            params.genreHint,
            CREATE_SERIES_FIELD_LIMITS.genre
          ),
        }
      : {}),
    ...(params.lineageContext ? { lineageContext: params.lineageContext } : {}),
    rules: [
      ...blendCoreRules,
      `"blendFacets" must cover every facet in this exact set: ${VERTICAL_DRAMA_BLEND_FACETS.join(", ")}.${
        hasPresetSelections
          ? ' For each facet, return one "contributions" entry per preset assigned to it in "facetAssignments", each with a concrete "element" string and "kept": true only when you genuinely used that element in the draft (mark it false instead of omitting it when you decided not to use it — never drop an assigned preset\'s entry).'
          : ""
      }`,
      mergedVisualIdentity
        ? 'For the "visual_identity" facet, do NOT re-list the palette/motifs/wardrobe/props/negative fragments given in "visualIdentityContext" (already fixed) — only contribute a short "element" noting how each identity-bearing preset\'s style shaped the blended look, and "kept": true when it genuinely did.'
        : 'No selected preset carries a structured visual identity — you may leave "visual_identity" contributions minimal or empty.',
      mergedVisualIdentity
        ? 'Also return a "visualIdentity" object with a NEW blended "styleName", a "lighting" description, a "cameraGrammar" line, 2-4 "characterArchetypes" ({role, look}), and 3-6 "positiveFragments" (reusable image-prompt tokens) — all CONSISTENT with the fixed palette/motifs/wardrobe/props/negative fragments in "visualIdentityContext".'
        : 'Omit "visualIdentity" entirely (no preset supplied a structured visual identity to build from).',
      ...(visualNarrativeContext
        ? [
            'Return "visualNarrativeProfile" using the exact bounded shape requested below. It is soft story guidance, not a second plot spine, and all profile strings must use the narrative/content language.',
          ]
        : []),
      "Keep the result easy for a non-technical creator to edit.",
      "Product or service tie-in may help a scene, but must not magically solve the main conflict.",
      ...(sourcePackBlock
        ? [
            "Treat SOURCE PACK GROUNDING as authoritative evidence for the selected documentary/review profile and keep unsupported claims out of the draft.",
          ]
        : []),
      hasPresetSelections
        ? 'Use "mixRecipe.primaryFlavor" to name the dominant preset/category flavor and "mixRecipe.supportingFlavors" for the rest.'
        : `Set "mixRecipe.primaryFlavor" to "${hasLineageContext && hasUserPremise ? "series_lineage" : hasUserPremise ? "user_premise" : "ai_original"}" and leave "mixRecipe.supportingFlavors" as an empty array — there is no preset to name.`,
      "Use compact JSON only.",
      `"title" MUST be at most ${SYNTHESIZED_TITLE_MAX_LENGTH} characters (it fills the series TITLE field — "category" is what fills the genre field) — keep it short and punchy.`,
      `"tone" MUST be at most ${CREATE_SERIES_FIELD_LIMITS.tone} characters — a brief phrase, not a sentence.`,
      `Every character's "narrativeRole" MUST be exactly one of: ${NARRATIVE_ROLE_VALUES.join(", ")}.`,
      `Every character's "roleTier" MUST be exactly one of: ${ROLE_TIER_VALUES.join(", ")}. Copy one value verbatim — never invent a new label.`,
      "If a character role is uncertain, use the closest allowed roleTier and include a creator-facing warning; never omit roleTier or invent an enum value.",
      "Use storyContext to separate targetMarket, storySetting, leadBackground, leadOrigin, spokenDialogue, and namingPolicy. Use storyDesign to keep one primary engine, bounded pressure threads, an early payoff, romance progression, advantage beats, and a valid storyControlSeed. Use the exact generated character names as storyControlSeed.canonicalCharacterKeys.",
      storyArchitecture
        ? "Use the APPROVED STORY ARCHITECTURE as the authoritative source for destination, transformation, required arcs, failure model, and final payoff. Derive storyDesign, creatorSummary, mainPlot, and seasonArc from it without changing its meaning."
        : "If storyArchitecture is absent, return a draft diagnostic and do not invent a false long-term destination.",
      params.seriesTitleHint?.trim()
        ? 'If you return "titleOptions", it MUST have 4 or 5 entries and MUST include "title" verbatim as one of them.'
        : 'No creator title was supplied: "titleOptions" is required and MUST have 4 or 5 distinct entries including "title" verbatim as one of them.',
      'If you return "locations", it MUST have 3 to 6 entries, each with "name" and "description".',
    ],
  };

  // The "Return exactly this JSON shape" contract line must never advertise a
  // "visualIdentity" member when there is no merged visual-identity context
  // to build it from — the rules above already tell the model to omit it in
  // that case, and a shape line that still lists it caused the model to emit
  // an empty-string `visualIdentity` object that failed schema validation.
  const jsonShape = [
    mergedVisualIdentity
      ? '{"contract_version":2,"title":string,"titleOptions":[string],"category":string,"logline":string,"mainPlot":string,"seasonArc":string,"tone":string,"cliffhangerStyle":string,"creatorSummary":{"whatItIsAbout":string,"protagonistAndGoal":string,"conflictAndDiscovery":string,"centralMystery":string,"decisionNotes":[string]},"characters":[{"name":string,"role":string,"narrativeRole":string,"roleTier":string,"occupation":string,"description":string}],"visualBible":string,"locations":[{"name":string,"description":string}],"mixRecipe":{"primaryFlavor":string,"supportingFlavors":[string],"rationale":string},"warnings":[{"code":string,"message":string}],"blendFacets":[{"facet":string,"contributions":[{"presetId":string,"element":string,"kept":boolean}]}],"visualIdentity":{"styleName":string,"lighting":string,"cameraGrammar":string,"characterArchetypes":[{"role":string,"look":string}],"positiveFragments":[string]}'
      : '{"contract_version":2,"title":string,"titleOptions":[string],"category":string,"logline":string,"mainPlot":string,"seasonArc":string,"tone":string,"cliffhangerStyle":string,"creatorSummary":{"whatItIsAbout":string,"protagonistAndGoal":string,"conflictAndDiscovery":string,"centralMystery":string,"decisionNotes":[string]},"characters":[{"name":string,"role":string,"narrativeRole":string,"roleTier":string,"occupation":string,"description":string}],"visualBible":string,"locations":[{"name":string,"description":string}],"mixRecipe":{"primaryFlavor":string,"supportingFlavors":[string],"rationale":string},"warnings":[{"code":string,"message":string}],"blendFacets":[{"facet":string,"contributions":[{"presetId":string,"element":string,"kept":boolean}]}]',
    ',"storyContract":object,"storyContext":object,"storyDesign":object,"diagnostics":[{"code":string,"severity":string,"message":string}]',
    visualNarrativeContext ? `,${VISUAL_NARRATIVE_PROFILE_JSON_SHAPE}` : "",
    "}",
  ].join("");

  return [
    renderCriteriaVersionMarker(),
    langInstruction,
    buildVerticalDramaDraftLanguageContractPrompt({
      narrativeLocale: params.locale,
      dialogueLanguageProfile: params.dialogueLanguageProfile,
    }),
    buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: params.locale,
      profile: params.dialogueLanguageProfile,
    }),
    buildVerticalDramaDraftStoryContextPrompt({
      locale: params.locale,
      dialogueLanguageProfile: params.dialogueLanguageProfile,
    }),
    buildVerticalDramaDraftStoryDesignPrompt({
      targetEpisodeCount: params.targetEpisodeCount,
    }),
    renderVerticalDramaStoryArchitectureBlock(storyArchitecture),
    buildPartialInputCompletionBlock(),
    params.audienceAgeRating
      ? renderAudienceAgeRatingBlock(params.audienceAgeRating)
      : "",
    buildLineageContinuityBlock(params.lineageContext),
    buildSinglePresetVariationBlock(
      params.selectedPresets.length,
      variationNonce
    ),
    buildVisualNarrativeDraftBlock(visualNarrativeContext),
    sourcePackBlock,
    buildUserPremisePrimaryBlock(
      params.userPremise,
      hasPresetSelections,
      hasLineageContext
    ),
    buildGenerateFromBasicsBlock({
      hasPresetSelections,
      userPremise: params.userPremise,
    }),
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
  minFacetsPerPreset: number
): string {
  const names = underBlendedPresetIds
    .map(id => presetTitleById.get(id) ?? id)
    .join(", ");
  return [
    `Your previous response did not sufficiently blend the following preset(s): ${names}.`,
    `Revise "blendFacets" so EACH of these presets has at least ${minFacetsPerPreset} facets with a genuine "kept": true contribution (choose from their assigned facet slots in "facetAssignments" above), WITHOUT removing or weakening any other preset's existing kept contributions.`,
  ].join(" ");
}

function assembleFinalVisualIdentity(
  merged: VerticalDramaMergedVisualIdentity | null,
  llmWritten: SynthesizedGenrePresetDraftV2Raw["visualIdentity"]
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
  params: SynthesizeVerticalDramaPresetV2Params
): Promise<{
  draft: SynthesizedGenrePresetDraftV2;
  creditsUsed: number;
  model: string;
}> {
  const selectedCategories = uniqueStrings(params.selectedCategories);
  const selections = resolveMixSelections({
    selectedPresetIds: params.selectedPresetIds,
    selections: params.selections,
  });

  // See `synthesizeVerticalDramaPreset`'s identical comment — derived from
  // THIS function's own already-gated `params.userPremise`, never raw
  // client input.
  const hasUserPremise = Boolean(params.userPremise?.trim());
  const hasBasicSeed = hasPresetSynthesisBasicSeed({
    ...params,
    selectedCategories,
  });
  const logicalRunKey =
    params.idempotencyKey ??
    `vd-preset-synthesis-v2:${createHash("sha256")
      .update(
        JSON.stringify({
          selections,
          selectedCategories,
          primarySelectionId: params.primarySelectionId ?? null,
          targetEpisodeCount: params.targetEpisodeCount ?? null,
          userPremise: params.userPremise ?? null,
        }),
      )
      .digest("hex")
      .slice(0, 24)}`;
  validatePresetSynthesisSelection({
    selectedPresets: selections,
    selectedCategories,
    hasUserPremise,
    hasBasicSeed,
  });

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const primarySelectionId =
    params.primarySelectionId ||
    selections[0]?.presetId ||
    selectedCategories[0] ||
    "auto";
  const minFacetsPerPreset =
    params.minFacetsPerPreset ?? DEFAULT_MIN_FACETS_PER_PRESET;

  const model =
    params.model ??
    (await (
      await import("./verticalDramaLlmModelPolicy")
    ).resolveVerticalDramaRecommendedDraftModel());
  const systemPrompt = loadSkillSystemPrompt();
  assertPresetSynthesizerSkillSupportsV2(systemPrompt);

  const facetAssignments = buildFacetAssignments(
    selections,
    params.selectedPresets,
    primarySelectionId,
    minFacetsPerPreset
  );

  const visualIdentitySelections = buildVisualIdentitySelections(
    selections,
    params.selectedPresets,
    primarySelectionId
  );
  const mergedVisualIdentity =
    visualIdentitySelections.length > 0
      ? mergeVisualIdentities(visualIdentitySelections)
      : null;
  const visualNarrativeContext = params.visualNarrativeEnabled
    ? (toVisualNarrativePromptContext(params.visualNarrativeIdentity) ??
      toVisualNarrativePromptContext(mergedVisualIdentity))
    : null;
  if (visualNarrativeContext) {
    assertPresetSynthesizerSkillSupportsVisualNarrative(systemPrompt);
  }

  const presetTitleById = new Map(
    params.selectedPresets.map(preset => [preset.id, preset.title])
  );
  const variationNonce = randomUUID();

  const basePrompt = buildUserPromptV2({
    params,
    selections,
    selectedCategories,
    primarySelectionId,
    facetAssignments,
    mergedVisualIdentity,
    presetTitleById,
    variationNonce,
    storyArchitecture: params.storyArchitecture,
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
    disableProviderFallbacks: true,
    maxTransientRetries: 0,
    label: "Preset synthesis v2",
  });

  const chargeSynthesisCall = async (
    call: typeof firstAttempt,
    callKey: string,
    stage: string,
  ): Promise<number> => {
    const actualModel = call.model ?? model;
    const inputTokens = call.response.usage?.prompt_tokens ?? 0;
    const outputTokens = call.response.usage?.completion_tokens ?? 0;
    const credits = calculateCreditsForLLM(
      inputTokens,
      outputTokens,
      actualModel,
    );
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: credits,
      description: `Skill run: vertical-drama-preset-synthesizer (${stage})`,
      idempotencyKey: `${logicalRunKey}:preset-synthesis-v2:${callKey}`,
      skillRunId: `vd-preset-synthesis-v2:${logicalRunKey}:${callKey}`,
      skillSlug: "vertical-drama-preset-synthesizer",
      sourceType: "skill",
      metadata: {
        feature: "vertical_drama_preset_synthesis_v2",
        stage,
        model: actualModel,
        llmModel: actualModel,
        inputTokens,
        outputTokens,
        logicalRunKey,
        selectedPresetIds: selections.map(selection => selection.presetId),
        selectedCategories,
        primarySelectionId,
      },
    });
    return credits;
  };

  let activeModel = firstAttempt.model ?? model;
  let finalRawDraft = firstAttempt.data;
  let creditsUsed = await chargeSynthesisCall(
    firstAttempt,
    "primary",
    "primary",
  );
  const sourceIds = selections.map(selection => selection.presetId);
  let blendReport = assembleBlendReport(
    finalRawDraft.blendFacets,
    minFacetsPerPreset,
    primarySelectionId,
    { sourceIds, hasUserPremise }
  );

  // Blend QC gate (spec §8.2.2.C.5): coverage below floor -> ONE corrective
  // retry naming the under-blended preset(s) -> still failing (or the retry
  // call itself throws) -> keep going with `underBlended` populated + a
  // warning entry. NEVER a silent collapse, NEVER a throw for this reason.
  if (blendReport.underBlended.length > 0) {
    const correctiveInstruction = buildCorrectiveInstruction(
      blendReport.underBlended,
      presetTitleById,
      minFacetsPerPreset
    );
    try {
      const retryAttempt = await executeJsonPlanningCallWithRetry({
        model: activeModel,
        systemPrompt,
        userPrompt: `${basePrompt}\n\n${correctiveInstruction}`,
        temperature: 0.75,
        userId: params.userId,
        maxTokens: V2_MAX_TOKENS,
        schema: synthesizedPresetDraftV2Schema,
        disableProviderFallbacks: true,
        maxTransientRetries: 0,
        label: "Preset synthesis v2 (blend corrective retry)",
      });
      activeModel = retryAttempt.model ?? activeModel;
      finalRawDraft = retryAttempt.data;
      creditsUsed += await chargeSynthesisCall(
        retryAttempt,
        "blend-corrective-retry",
        "blend_corrective_retry",
      );
      blendReport = assembleBlendReport(
        finalRawDraft.blendFacets,
        minFacetsPerPreset,
        primarySelectionId,
        { sourceIds, hasUserPremise }
      );
    } catch (retryError) {
      debugError(
        "vd_preset_mix_v2_retry",
        "Preset synthesis v2 corrective retry failed — keeping the first attempt's (under-blended) result",
        {
          message:
            retryError instanceof Error
              ? retryError.message
              : String(retryError),
        }
      );
      // Keep the FIRST attempt's draft/report — never throw for under-blend.
    }
  }

  const { storyContract: rawStoryContract, ...draftWithoutStoryContract } =
    finalRawDraft;
  const storyContract =
    readVerticalDramaStoryArchitecture(params.storyArchitecture) ??
    readVerticalDramaStoryArchitecture(rawStoryContract);
  finalRawDraft = {
    ...draftWithoutStoryContract,
    ...(storyContract ? { storyContract } : {}),
    characters: normalizeSynthesizedCharacters(finalRawDraft.characters),
    ...(readVerticalDramaDraftStoryContext(finalRawDraft.storyContext)
      ? {
          storyContext: readVerticalDramaDraftStoryContext(
            finalRawDraft.storyContext
          ),
        }
      : {}),
    ...(readVerticalDramaDraftStoryDesign(finalRawDraft.storyDesign)
      ? {
          storyDesign: readVerticalDramaDraftStoryDesign(
            finalRawDraft.storyDesign
          ),
        }
      : {}),
  };
  const structuralDiagnostics = buildDraftStructuralDiagnostics({
    draft: finalRawDraft,
    targetEpisodeCount: params.targetEpisodeCount,
    genre: params.genreHint,
    userPremise: params.userPremise,
  });
  finalRawDraft = {
    ...finalRawDraft,
    ...(structuralDiagnostics.length
      ? { diagnostics: structuralDiagnostics }
      : {}),
  };
  const warnings = [...finalRawDraft.warnings];
  if (blendReport.underBlended.length > 0) {
    const names = blendReport.underBlended
      .map(id => presetTitleById.get(id) ?? id)
      .join(", ");
    warnings.push({
      code: "preset_under_blended",
      message: `preset(s) ${names} ยังไม่ถูกผสมจริง (ครอบคลุมต่ำกว่า ${minFacetsPerPreset} ด้าน)`,
    });
  }

  const visualIdentity = assembleFinalVisualIdentity(
    mergedVisualIdentity,
    finalRawDraft.visualIdentity
  );

  const {
    blendFacets: _blendFacets,
    visualIdentity: _rawVisualIdentity,
    visualNarrativeProfile: rawVisualNarrativeProfile,
    ...rest
  } = finalRawDraft;
  const mergedDraft: SynthesizedGenrePresetDraftV2 = {
    ...rest,
    warnings,
    blendReport,
    ...(visualIdentity ? { visualIdentity } : {}),
    ...(visualNarrativeContext && rawVisualNarrativeProfile
      ? { visualNarrativeProfile: rawVisualNarrativeProfile }
      : {}),
  };

  const { draft: clampedDraft } = clampTitleAndToneForCreateSeries(mergedDraft);
  const draft = appendPremiseCoverageWarning(clampedDraft, params.userPremise);

  return { draft, creditsUsed, model: activeModel };
}
