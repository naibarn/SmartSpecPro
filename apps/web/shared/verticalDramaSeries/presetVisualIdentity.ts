/**
 * Vertical Drama Series — genre preset structured visual identity and
 * verifiable "real mix" blending contracts (spec §8.2.2, added 2026-07-07;
 * section-15-genre-preset-visual-identity-and-mix).
 *
 * Pure, deterministic, provider-free contracts + helpers — no server/db
 * imports, safe for both client and server. The deterministic merge/coverage
 * helpers here are the code-computed half of the "real mix" contract (spec
 * §8.2.2 hard rule 2): the LLM only ever writes the blended `styleName` and a
 * coherence pass on top of what this module already merged.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Preset structured visual identity (spec §8.2.2.A)                          */
/* -------------------------------------------------------------------------- */

export type VerticalDramaPresetCharacterArchetype = {
  role: string;
  look: string;
};

export type VerticalDramaPresetImagePromptFragments = {
  /** Reusable tokens appended to image prompts. */
  positive: string[];
  /** Style-breaking tokens to suppress. */
  negative: string[];
};

/**
 * Render-time color grade parameters (task #35, `planning/vertical-drama-
 * standout-suite/plan.md` §3) tied to a genre preset's `visualIdentityJson`.
 * Applied by the final render engine (`verticalDramaFinalRenderGraph.ts`'s
 * `buildColorGradeFilterFragment`) directly to the base footage, BEFORE any
 * banner/subtitle/watermark overlay — never at generate-time (free, always
 * reversible, whole-series-consistent since it is one deterministic filter
 * chain per render).
 *
 * Ranges (plan.md, hard-pinned): `temperature`/`tint` -100..100 (0 = neutral;
 * positive temperature = warmer/orange, negative = cooler/blue — see
 * `buildColorGradeFilterFragment`'s doc comment for the exact Kelvin mapping),
 * `saturation` 0.5..1.5 (1 = neutral), `contrast` 0.8..1.3 (1 = neutral),
 * `brightness` -0.1..0.1 (0 = neutral), `vignette` 0..0.3 (0 = none).
 */
export type VerticalDramaPresetColorGrade = {
  temperature: number;
  tint: number;
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
};

export const VD_COLOR_GRADE_BOUNDS = {
  temperature: { min: -100, max: 100 },
  tint: { min: -100, max: 100 },
  saturation: { min: 0.5, max: 1.5 },
  contrast: { min: 0.8, max: 1.3 },
  brightness: { min: -0.1, max: 0.1 },
  vignette: { min: 0, max: 0.3 },
} as const;

/** The "no-op" grade — every field at its neutral value. Scaling ANY grade by
 *  `intensityPct: 0` (`scaleColorGrade`) returns this exact object, and
 *  `buildColorGradeFilterFragment` treats it as "skip the grade filters
 *  entirely" (same "absent input -> byte-identical output" convention as
 *  every other additive input in this feature's render engine). */
export const VD_NEUTRAL_COLOR_GRADE: VerticalDramaPresetColorGrade = {
  temperature: 0,
  tint: 0,
  saturation: 1,
  contrast: 1,
  brightness: 0,
  vignette: 0,
};

export const verticalDramaPresetColorGradeSchema = z.object({
  temperature: z
    .number()
    .min(VD_COLOR_GRADE_BOUNDS.temperature.min)
    .max(VD_COLOR_GRADE_BOUNDS.temperature.max),
  tint: z
    .number()
    .min(VD_COLOR_GRADE_BOUNDS.tint.min)
    .max(VD_COLOR_GRADE_BOUNDS.tint.max),
  saturation: z
    .number()
    .min(VD_COLOR_GRADE_BOUNDS.saturation.min)
    .max(VD_COLOR_GRADE_BOUNDS.saturation.max),
  contrast: z
    .number()
    .min(VD_COLOR_GRADE_BOUNDS.contrast.min)
    .max(VD_COLOR_GRADE_BOUNDS.contrast.max),
  brightness: z
    .number()
    .min(VD_COLOR_GRADE_BOUNDS.brightness.min)
    .max(VD_COLOR_GRADE_BOUNDS.brightness.max),
  vignette: z
    .number()
    .min(VD_COLOR_GRADE_BOUNDS.vignette.min)
    .max(VD_COLOR_GRADE_BOUNDS.vignette.max),
});

/**
 * Structured look a genre preset can carry so it REPRODUCES a specific
 * aesthetic end-to-end (bible -> character refs -> start frames -> motion
 * prompts), instead of degrading into paraphrased prose (spec §8.2.2.A).
 * Persists as the nullable `visualIdentityJson` jsonb column on
 * `vertical_drama_genre_presets`.
 */
export type VerticalDramaPresetVisualIdentity = {
  styleName: string;
  /** 3-6 dominant colors (names or hex). */
  palette: string[];
  lighting: string;
  environmentMotifs: string[];
  wardrobeGrammar: string[];
  signaturePropsAndCompanions: string[];
  cameraGrammar: string;
  characterArchetypes: VerticalDramaPresetCharacterArchetype[];
  imagePromptFragments: VerticalDramaPresetImagePromptFragments;
  /** Optional curated reference images (tenant-owned). */
  referenceAssetIds?: string[];
  /** Task #35, Standout Suite §3 — render-time color grade tied to this
   *  preset's personality. Optional/nullable-absent for presets seeded
   *  before this field existed (see `resolvePresetColorGrade`'s category
   *  fallback for those). */
  colorGrade?: VerticalDramaPresetColorGrade;
};

export const verticalDramaPresetCharacterArchetypeSchema = z.object({
  role: z.string().min(1),
  look: z.string().min(1),
});

export const verticalDramaPresetImagePromptFragmentsSchema = z.object({
  positive: z.array(z.string().min(1)),
  negative: z.array(z.string().min(1)),
});

/**
 * Strict on a present identity object: `palette` must be 3-6 items (spec
 * §8.2.2.A) — enforced when parsing NEW/authored data. `.passthrough()` for
 * forward-compat. Legacy-null tolerance (the column itself may be absent)
 * is handled by `verticalDramaPresetVisualIdentityColumnSchema` below rather
 * than by loosening this object's own required fields.
 */
export const verticalDramaPresetVisualIdentitySchema = z
  .object({
    styleName: z.string().min(1),
    palette: z.array(z.string().min(1)).min(3).max(6),
    lighting: z.string().min(1),
    environmentMotifs: z.array(z.string().min(1)),
    wardrobeGrammar: z.array(z.string().min(1)),
    signaturePropsAndCompanions: z.array(z.string().min(1)),
    cameraGrammar: z.string().min(1),
    characterArchetypes: z.array(verticalDramaPresetCharacterArchetypeSchema),
    imagePromptFragments: verticalDramaPresetImagePromptFragmentsSchema,
    referenceAssetIds: z.array(z.string().min(1)).optional(),
    colorGrade: verticalDramaPresetColorGradeSchema.optional(),
  })
  .passthrough();

/** Nullable-column convenience — legacy presets carry `visualIdentityJson: null`. */
export const verticalDramaPresetVisualIdentityColumnSchema =
  verticalDramaPresetVisualIdentitySchema.nullable();

/* -------------------------------------------------------------------------- */
/* Color grade derivation (task #35, Standout Suite) — see the type + zod     */
/* schema declared above (needed before `verticalDramaPresetVisualIdentitySchema`) */
/* -------------------------------------------------------------------------- */

/** Linearly scale `grade` toward `VD_NEUTRAL_COLOR_GRADE` by `intensityPct`
 *  (0-100; clamped). `intensityPct: 100` returns `grade` unchanged (rounded);
 *  `intensityPct: 0` returns the exact neutral grade object. Every field
 *  scales independently and linearly from its OWN neutral value (1 for
 *  saturation/contrast, 0 for the rest) — matches plan.md §3 "scale
 *  พารามิเตอร์เชิงเส้น". Values are rounded to 4 decimal places for
 *  deterministic, testable string formatting downstream. */
export function scaleColorGrade(
  grade: VerticalDramaPresetColorGrade,
  intensityPct: number
): VerticalDramaPresetColorGrade {
  const pct = Math.min(100, Math.max(0, intensityPct)) / 100;
  const lerp = (neutral: number, full: number) =>
    Math.round((neutral + (full - neutral) * pct) * 10_000) / 10_000;
  return {
    temperature: lerp(VD_NEUTRAL_COLOR_GRADE.temperature, grade.temperature),
    tint: lerp(VD_NEUTRAL_COLOR_GRADE.tint, grade.tint),
    saturation: lerp(VD_NEUTRAL_COLOR_GRADE.saturation, grade.saturation),
    contrast: lerp(VD_NEUTRAL_COLOR_GRADE.contrast, grade.contrast),
    brightness: lerp(VD_NEUTRAL_COLOR_GRADE.brightness, grade.brightness),
    vignette: lerp(VD_NEUTRAL_COLOR_GRADE.vignette, grade.vignette),
  };
}

/**
 * Category -> color-grade personality fallback (plan.md §3 "ตั้งจากบุคลิก
 * แนวเรื่อง" for "preset หลักอื่น" — presets WITHOUT a hand-authored
 * `visualIdentityJson.colorGrade`, which today is every preset outside the
 * 8 `sci_fi_mecha` ones seeded in `scripts/seed-vertical-drama-genre-presets.ts`).
 * Hand-authoring a full `visualIdentityJson` block for all ~90 categories is a
 * separate, much larger content project (spec §8.2.2.A / section-15, out of
 * this task's scope) — this deterministic, pattern-matched fallback is the
 * pragmatic alternative that still ties grade to genre personality for every
 * preset, present AND future, without a combinatorial hand-authoring pass.
 * Order matters: first matching pattern wins, so more specific patterns are
 * listed before their broader neighbors.
 */
const VD_COLOR_GRADE_CATEGORY_FALLBACKS: Array<{
  pattern: RegExp;
  grade: VerticalDramaPresetColorGrade;
}> = [
  // Sci-fi / mecha / cyber / dystopian — cool + higher contrast (mirrors the
  // hand-authored sci_fi_mecha presets below).
  {
    pattern: /sci.?fi|mecha|cyber|dystop|robot|futuristic|near-future|space-/i,
    grade: { temperature: -35, tint: -5, saturation: 0.95, contrast: 1.18, brightness: -0.02, vignette: 0.14 },
  },
  // Romance / love / wedding / matchmaking — warm + soft.
  {
    pattern: /romance|love|wedding|matchmak|fake-dating|fake-marriage|second-chance/i,
    grade: { temperature: 28, tint: 4, saturation: 1.08, contrast: 0.94, brightness: 0.03, vignette: 0.06 },
  },
  // Horror / ghost / curse / thriller — cool, desaturated, higher contrast.
  {
    pattern: /horror|ghost|curse|thriller|mystery|amnesia|conspiracy/i,
    grade: { temperature: -20, tint: -8, saturation: 0.82, contrast: 1.22, brightness: -0.04, vignette: 0.24 },
  },
  // Revenge / inheritance / crime / royal intrigue — cool-neutral, punchy contrast.
  {
    pattern: /revenge|inherit|feud|crime|royal|underworld|mafia|heir|villain/i,
    grade: { temperature: -8, tint: 0, saturation: 0.98, contrast: 1.14, brightness: -0.01, vignette: 0.12 },
  },
  // Kids / animated / cozy / preschool — warm, bright, high saturation, no vignette.
  {
    pattern: /kids|kid-|preschool|cozy|claymation|storybook|chibi|cartoon|animated|animation/i,
    grade: { temperature: 14, tint: 2, saturation: 1.22, contrast: 0.96, brightness: 0.04, vignette: 0 },
  },
  // Education / knowledge / documentary / career drama — neutral, clean, minimal grade.
  {
    pattern: /knowledge|education|documentary|career-drama|science|research|physics|repair|tie-in|tie_in|comedy|skit/i,
    grade: { temperature: 4, tint: 0, saturation: 1.02, contrast: 1.02, brightness: 0.01, vignette: 0.04 },
  },
  // Historical / period / xianxia / palace — warm, filmic, soft vignette.
  {
    pattern: /historical|period|xianxia|palace|epic|costume/i,
    grade: { temperature: 18, tint: 3, saturation: 0.96, contrast: 1.08, brightness: -0.01, vignette: 0.16 },
  },
];

/** Neutral, near-imperceptible default for any category that matches none of
 *  `VD_COLOR_GRADE_CATEGORY_FALLBACKS` — a gentle, safe "always-on" personality
 *  rather than a fully-inert 0/1 grade, so enabling color grade for an
 *  un-mapped preset still reads as an intentional, subtle look. */
const VD_COLOR_GRADE_DEFAULT_FALLBACK: VerticalDramaPresetColorGrade = {
  temperature: 3,
  tint: 0,
  saturation: 1.04,
  contrast: 1.04,
  brightness: 0,
  vignette: 0.06,
};

/** Deterministic category -> color-grade personality lookup (see
 *  `VD_COLOR_GRADE_CATEGORY_FALLBACKS`'s doc comment). Pure string matching —
 *  same category always resolves to the same grade. */
export function resolveColorGradeForCategory(
  category: string | null | undefined
): VerticalDramaPresetColorGrade {
  const value = (category ?? "").trim();
  if (!value) return VD_COLOR_GRADE_DEFAULT_FALLBACK;
  const match = VD_COLOR_GRADE_CATEGORY_FALLBACKS.find(entry =>
    entry.pattern.test(value)
  );
  return match ? match.grade : VD_COLOR_GRADE_DEFAULT_FALLBACK;
}

/**
 * Resolve the color grade a genre preset should render with: the preset's
 * OWN hand-authored `visualIdentityJson.colorGrade` when present, else the
 * deterministic category fallback (`resolveColorGradeForCategory`). Mix v2
 * (spec §8.2.2.C) is intentionally NOT consulted here — per plan.md §3
 * "preset ผสม (preset mix): v1 ใช้ grade ของ preset หลักตัวเดียว" (averaging
 * color parameters across a blend produces unpredictable results), so the
 * CALLER is responsible for resolving to the mix's `primarySelectionId`
 * preset before calling this function; this function only ever looks at ONE
 * preset's identity/category.
 */
export function resolvePresetColorGrade(params: {
  visualIdentityJson?: Pick<VerticalDramaPresetVisualIdentity, "colorGrade"> | null;
  category?: string | null;
}): VerticalDramaPresetColorGrade {
  return (
    params.visualIdentityJson?.colorGrade ??
    resolveColorGradeForCategory(params.category)
  );
}

/* -------------------------------------------------------------------------- */
/* Mix and Match v2 — weights, facets, blend report (spec §8.2.2.C)           */
/* -------------------------------------------------------------------------- */

export type VerticalDramaPresetMixWeight = 1 | 2 | 3 | 4 | 5;

export const verticalDramaPresetMixWeightSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export type VerticalDramaPresetMixSelection = {
  presetId: string;
  weight: VerticalDramaPresetMixWeight;
};

export const verticalDramaPresetMixSelectionSchema = z.object({
  presetId: z.string().min(1),
  weight: verticalDramaPresetMixWeightSchema,
});

export const VERTICAL_DRAMA_BLEND_FACETS = [
  "story_spine",
  "situations",
  "characters",
  "tone",
  "cliffhanger_style",
  "world_texture",
  "visual_identity",
  "product_fit",
] as const;

export type VerticalDramaBlendFacet =
  (typeof VERTICAL_DRAMA_BLEND_FACETS)[number];

export type VerticalDramaBlendFacetContribution = {
  presetId: string;
  element: string;
  kept: boolean;
};

export type VerticalDramaBlendFacetEntry = {
  facet: VerticalDramaBlendFacet;
  contributions: VerticalDramaBlendFacetContribution[];
};

/** Blend provenance report (spec §8.2.2.C) — proves every selection contributed. */
export type VerticalDramaBlendReport = {
  contractVersion: 2;
  facets: VerticalDramaBlendFacetEntry[];
  /** presetId -> facet count with a KEPT contribution. */
  contributionCoverage: Record<string, number>;
  /** Default 2. */
  minFacetsPerPreset: number;
  /** presetIds below the floor after the one corrective retry. */
  underBlended: string[];
};

export const verticalDramaBlendFacetContributionSchema = z.object({
  presetId: z.string().min(1),
  element: z.string().min(1),
  kept: z.boolean(),
});

export const verticalDramaBlendFacetEntrySchema = z.object({
  facet: z.enum(VERTICAL_DRAMA_BLEND_FACETS),
  contributions: z.array(verticalDramaBlendFacetContributionSchema),
});

export const verticalDramaBlendReportSchema = z
  .object({
    contractVersion: z.literal(2),
    facets: z.array(verticalDramaBlendFacetEntrySchema),
    contributionCoverage: z.record(z.string(), z.number().int().nonnegative()),
    minFacetsPerPreset: z.number().int().positive(),
    underBlended: z.array(z.string()),
  })
  .passthrough();

/* -------------------------------------------------------------------------- */
/* Deterministic merge + coverage helpers (spec §8.2.2.C hard rules 2-3)      */
/* -------------------------------------------------------------------------- */

const MERGED_PALETTE_CAP = 6;
export const DEFAULT_MIN_FACETS_PER_PRESET = 2;

/** Trim + case-insensitive dedupe, keeping the FIRST literal string seen (order-stable). */
function dedupeOrderedStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export type VerticalDramaVisualIdentitySelection = {
  identity: VerticalDramaPresetVisualIdentity;
  weight: VerticalDramaPresetMixWeight;
  /** Expected true for exactly one selection (the mix's `primarySelectionId`). */
  isPrimary: boolean;
};

/**
 * The subset of `VerticalDramaPresetVisualIdentity` that merges
 * DETERMINISTICALLY in code (spec §8.2.2.C hard rule 2). `styleName`,
 * `lighting`, `cameraGrammar`, `characterArchetypes`, and
 * `imagePromptFragments.positive` are intentionally NOT part of this merge —
 * per spec, those are the LLM's "blended styleName + coherence pass" on top
 * of this deterministic base.
 */
export type VerticalDramaMergedVisualIdentity = {
  /** Weighted-merge, primary-heavy, capped at 6 (spec §8.2.2.C). */
  palette: string[];
  /** Union + dedupe, order-stable (input selection order). */
  environmentMotifs: string[];
  wardrobeGrammar: string[];
  signaturePropsAndCompanions: string[];
  imagePromptFragments: {
    /** Union + dedupe, order-stable (input selection order). */
    negative: string[];
  };
};

/**
 * Deterministic visual-identity merge for Mix and Match v2 (spec §8.2.2.C /
 * section-15 hard rule 2). Only the facets spec pins to code are merged
 * here — palette (primary-heavy, capped 6) and the motif/wardrobe/prop/
 * negative-fragment unions (plain input order, deduped). Same input always
 * produces identical output (stable sort, stable dedupe).
 */
export function mergeVisualIdentities(
  selections: VerticalDramaVisualIdentitySelection[]
): VerticalDramaMergedVisualIdentity {
  const indexed = selections.map((selection, index) => ({ selection, index }));
  const primaryFirst = [
    ...indexed.filter(entry => entry.selection.isPrimary),
    ...indexed
      .filter(entry => !entry.selection.isPrimary)
      // Stable sort: higher weight contributes earlier (survives the cap);
      // ties keep original selection order.
      .sort(
        (a, b) => b.selection.weight - a.selection.weight || a.index - b.index
      ),
  ].map(entry => entry.selection);

  const palette = dedupeOrderedStrings(
    primaryFirst.flatMap(selection => selection.identity.palette)
  ).slice(0, MERGED_PALETTE_CAP);

  const environmentMotifs = dedupeOrderedStrings(
    selections.flatMap(selection => selection.identity.environmentMotifs)
  );
  const wardrobeGrammar = dedupeOrderedStrings(
    selections.flatMap(selection => selection.identity.wardrobeGrammar)
  );
  const signaturePropsAndCompanions = dedupeOrderedStrings(
    selections.flatMap(
      selection => selection.identity.signaturePropsAndCompanions
    )
  );
  const negative = dedupeOrderedStrings(
    selections.flatMap(
      selection => selection.identity.imagePromptFragments.negative
    )
  );

  return {
    palette,
    environmentMotifs,
    wardrobeGrammar,
    signaturePropsAndCompanions,
    imagePromptFragments: { negative },
  };
}

/**
 * Recomputes `contributionCoverage` from `report.facets` (spec §8.2.2.C hard
 * rule 4 / section-15 test: counts only `kept: true` contributions). Every
 * presetId that appears in ANY contribution (kept or not) gets an entry, so
 * a preset with zero kept contributions still shows an explicit `0` rather
 * than being silently omitted. At most one kept contribution per preset is
 * counted per facet (a facet's coverage is a boolean "did this preset land
 * here", not a count of individual contribution rows).
 */
export function computeBlendCoverage(
  report: Pick<VerticalDramaBlendReport, "facets">
): Record<string, number> {
  const coverage: Record<string, number> = {};

  for (const facetEntry of report.facets) {
    const keptPresetsInFacet = new Set<string>();
    for (const contribution of facetEntry.contributions) {
      coverage[contribution.presetId] = coverage[contribution.presetId] ?? 0;
      if (contribution.kept) {
        keptPresetsInFacet.add(contribution.presetId);
      }
    }
    for (const presetId of keptPresetsInFacet) {
      coverage[presetId] += 1;
    }
  }

  return coverage;
}

/**
 * Presets whose kept-facet coverage falls below `minFacetsPerPreset` (spec
 * §8.2.2.C hard rule 5 — the blend QC gate). Result is sorted for
 * deterministic, order-independent output.
 */
export function findUnderBlended(
  report: Pick<VerticalDramaBlendReport, "facets">,
  minFacetsPerPreset: number = DEFAULT_MIN_FACETS_PER_PRESET
): string[] {
  const coverage = computeBlendCoverage(report);
  return Object.keys(coverage)
    .filter(presetId => coverage[presetId] < minFacetsPerPreset)
    .sort();
}
