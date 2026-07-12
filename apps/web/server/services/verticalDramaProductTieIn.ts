/**
 * Vertical Drama Series — product tie-in planner + compliance service
 * (spec feature 131, section-08, §13).
 *
 * Plans per-episode product tie-in usage with compliance guards:
 *   - a product can NEVER unrealistically solve the main conflict;
 *   - every placement requires an explicit `story_function`;
 *   - regulated-category claims produce warnings or hard blocks;
 *   - product visuals must use approved product references when available;
 *   - placement history enforces fatigue/diversity (no repetitive use);
 *   - disclosure copy (`disclosureText`) is stored SEPARATELY from the video
 *     prompt — it must never be merged into the motion/video prompt payload;
 *   - tie-in approval is MANDATORY (MVP + beta), regulated categories require
 *     manual review BEFORE any paid generation, and the approving user is
 *     recorded as `approvedByUserId`;
 *   - `productSource` provenance is retained for audit + Library/marketplace;
 *   - tie-in metadata is auditable and removable.
 *
 * Pure planners/guards live at module scope (unit-testable without a DB). The
 * caller (router) persists the resulting usage to the run-artifact ledger and
 * audit-logs any approval/removal.
 */

import type {
  VerticalDramaProductTieInConfig,
  VerticalDramaTieInUsage,
  VerticalDramaWarning,
} from "@shared/verticalDramaSeries";
import {
  resolveRequiredDisclosureForCategory,
  screenThaiAdCompliance,
} from "@shared/verticalDramaSeries/thaiAdCompliance";
// Wave-4A (spec §13.1 / §16.1, section-08 extension, added 2026-07-07) —
// `buildTieInQualityReport` below needs the resolved policy's
// `tieInMinNaturalnessScore` floor to compute `passed`; import type-only
// (pure/shared, no server/db imports) from the already-shipped policy
// module rather than reimplementing floor resolution here.
import type { VerticalDramaQualityPolicy } from "@shared/verticalDramaSeries/qualityPolicy";

// Re-exported so callers of this service don't need a second import for the
// Thai-law-specific compliance screen alongside the generic `screenClaims`
// gate below.
export { screenThaiAdCompliance, resolveRequiredDisclosureForCategory };

/* -------------------------------------------------------------------------- */
/* Regulated categories (spec §13)                                             */
/* -------------------------------------------------------------------------- */

export const VERTICAL_DRAMA_REGULATED_CATEGORIES = [
  "health",
  "beauty",
  "finance",
  "medical",
  "baby_kids",
  "other",
] as const;
export type VerticalDramaRegulatedCategory = (typeof VERTICAL_DRAMA_REGULATED_CATEGORIES)[number];

/** True when a category requires manual review before paid generation. */
export function isRegulatedCategory(category: string | undefined): boolean {
  if (!category || category === "none") return false;
  return (VERTICAL_DRAMA_REGULATED_CATEGORIES as readonly string[]).includes(category);
}

/** Sliding window for fatigue: no more than N tie-in episodes per 10 (spec §13). */
export const VERTICAL_DRAMA_TIE_IN_FATIGUE_WINDOW = 10 as const;

/**
 * Claim patterns that are inherently unsupported for regulated categories and
 * always produce a warning/block (spec §13). Case-insensitive substring match.
 */
export const VERTICAL_DRAMA_REGULATED_CLAIM_PATTERNS = [
  "cure",
  "guaranteed",
  "clinically proven",
  "100%",
  "lose weight",
  "risk-free",
  "no side effects",
  "double your money",
  "instant results",
];

/* -------------------------------------------------------------------------- */
/* Tie-in planning (spec §13)                                                  */
/* -------------------------------------------------------------------------- */

export interface PlanTieInInput {
  config: VerticalDramaProductTieInConfig;
  episodeNumber: number;
  /** Shots that carry the placement (must be non-empty when enabled). */
  shotNumbers: number[];
  /** Explicit narrative function for the placement (required). */
  storyFunction: string;
  /** Claims the placement makes about the product (screened for compliance). */
  proposedClaims?: string[];
  /** Does the product unrealistically resolve the main conflict? (blocks). */
  resolvesMainConflict?: boolean;
  /** Placement history for the last ~10 episodes (fatigue/diversity). */
  placementHistory?: Array<{ episodeNumber: number; hadTieIn: boolean }>;
  /** Disclosure copy — stored separately, never merged into the prompt. */
  disclosureText?: string;
  /** Whether approved product reference assets exist for the product visuals. */
  hasApprovedProductReferences?: boolean;
  /** Naturalness score in [0,1] from the placement planner. */
  placementNaturalnessScore?: number;
}

export interface TieInPlanResult {
  usage: VerticalDramaTieInUsage;
  warnings: VerticalDramaWarning[];
  /** True when the tie-in is hard-blocked and cannot proceed to paid generation. */
  blocked: boolean;
  /** True when explicit human approval is required before paid generation. */
  requiresHumanApproval: boolean;
  /** True when a regulated-category manual review is required first. */
  requiresRegulatedManualReview: boolean;
  /** Retained provenance for audit / Library / marketplace workflows. */
  productSource: NonNullable<VerticalDramaProductTieInConfig["productSource"]>;
}

/**
 * Plan a per-episode tie-in usage with all compliance guards applied. Pure — no
 * DB, no side effects. Returns the `VerticalDramaTieInUsage` plus warnings and
 * hard-block / approval flags.
 */
export function planTieIn(input: PlanTieInInput): TieInPlanResult {
  const { config } = input;
  const warnings: VerticalDramaWarning[] = [];
  let blocked = false;

  const productSource = config.productSource ?? "manual";

  // Disabled tie-in short-circuits to an inert usage record.
  if (!config.enabled) {
    return {
      usage: {
        enabled: false,
        episodeHasTieIn: false,
        shotNumbers: [],
        storyFunction: "",
        placementNaturalnessScore: 0,
        claimsReview: { unsupportedClaimsDetected: false, warnings: [] },
        disclosureRequired: false,
      },
      warnings,
      blocked: false,
      requiresHumanApproval: false,
      requiresRegulatedManualReview: false,
      productSource,
    };
  }

  // 1) Product cannot unrealistically solve the main conflict.
  if (input.resolvesMainConflict) {
    blocked = true;
    warnings.push({
      code: "VD_TIE_IN_RESOLVES_MAIN_CONFLICT",
      severity: "blocking",
      message: "The product cannot unrealistically solve the main conflict.",
      repairable: true,
    });
  }

  // 2) Every placement needs an explicit story_function.
  if (!input.storyFunction || input.storyFunction.trim().length === 0) {
    blocked = true;
    warnings.push({
      code: "VD_TIE_IN_MISSING_STORY_FUNCTION",
      severity: "blocking",
      message: "Every product placement requires an explicit story function.",
      repairable: true,
    });
  }

  // 3) Regulated / unsupported claim screening.
  const claimReview = screenClaims(config, input.proposedClaims ?? []);
  for (const w of claimReview.warnings) {
    warnings.push({
      code: "VD_TIE_IN_UNSUPPORTED_CLAIM",
      severity: claimReview.hardBlock ? "blocking" : "warning",
      message: w,
      repairable: true,
    });
  }
  if (claimReview.hardBlock) blocked = true;

  // 3b) Thai advertising-law-specific prohibited-claim screening (additive,
  // separate pattern list from the generic regulated-claim check above —
  // always hard-blocks, since these are legal-compliance violations, not
  // just unsupported marketing claims).
  const thaiAdReview = screenThaiAdCompliance(input.proposedClaims ?? []);
  if (thaiAdReview.hasViolations) {
    blocked = true;
    for (const v of thaiAdReview.violations) {
      warnings.push({
        code: "VD_TIE_IN_THAI_AD_LAW_VIOLATION",
        severity: "blocking",
        message: `Thai advertising law prohibited claim ("${v.matchedPattern}") detected in: "${v.claim}".`,
        repairable: true,
      });
    }
  }

  // 4) Approved product references for product visuals when available.
  if (config.referenceAssetIds.length > 0 && input.hasApprovedProductReferences === false) {
    warnings.push({
      code: "VD_TIE_IN_UNAPPROVED_PRODUCT_REFERENCE",
      severity: "warning",
      message: "Product visuals should use approved product references before generation.",
      repairable: true,
    });
  }

  // 5) Fatigue / diversity — prevent repetitive placement.
  const fatigue = evaluateFatigue(input.placementHistory ?? [], config.maxEpisodesWithTieInPerTenEpisodes);
  if (fatigue.exceeded) {
    warnings.push({
      code: "VD_TIE_IN_PLACEMENT_FATIGUE",
      severity: "warning",
      message: `Tie-in used in ${fatigue.tieInEpisodes} of the last ${VERTICAL_DRAMA_TIE_IN_FATIGUE_WINDOW} episodes (limit ${config.maxEpisodesWithTieInPerTenEpisodes}).`,
      repairable: true,
    });
  }

  // 6) Disclosure — required when policy is not `not_required`; text is kept
  //    separate from the prompt payload (never merged).
  const disclosureRequired = config.disclosurePolicy !== "not_required";

  // 7) Approval gate — mandatory for MVP + beta; regulated categories require a
  //    manual review before ANY paid generation.
  const requiresHumanApproval = config.requireHumanApproval || true;
  const requiresRegulatedManualReview = isRegulatedCategory(config.regulatedCategory);

  const usage: VerticalDramaTieInUsage = {
    enabled: true,
    episodeHasTieIn: input.shotNumbers.length > 0,
    shotNumbers: [...input.shotNumbers].sort((a, b) => a - b),
    storyFunction: input.storyFunction,
    placementNaturalnessScore: input.placementNaturalnessScore ?? 0.5,
    claimsReview: {
      unsupportedClaimsDetected: claimReview.warnings.length > 0,
      warnings: claimReview.warnings,
    },
    disclosureRequired,
    disclosureText: disclosureRequired ? input.disclosureText : undefined,
    // Category-mandated Thai-law disclosure line (spec §13 extension) —
    // surfaced independently of `disclosurePolicy`/`disclosureText` above so
    // it always appears when the category requires one, even if the general
    // disclosure policy is `"not_required"`.
    requiredDisclosure: resolveRequiredDisclosureForCategory(config.productCategory),
    // approvedByUserId is set only on explicit approval (see approveTieIn).
  };

  return {
    usage,
    warnings,
    blocked,
    requiresHumanApproval,
    requiresRegulatedManualReview,
    productSource,
  };
}

/* -------------------------------------------------------------------------- */
/* Claim screening                                                             */
/* -------------------------------------------------------------------------- */

export interface ClaimScreenResult {
  warnings: string[];
  hardBlock: boolean;
}

/**
 * Screen proposed claims against the config's forbidden list + the built-in
 * regulated-claim patterns. Forbidden-list hits hard-block; pattern hits on a
 * regulated category warn (and block for medical/health).
 */
export function screenClaims(
  config: VerticalDramaProductTieInConfig,
  proposedClaims: string[],
): ClaimScreenResult {
  const warnings: string[] = [];
  let hardBlock = false;
  const regulated = isRegulatedCategory(config.regulatedCategory);
  const forbidden = config.forbiddenClaims.map((c) => c.toLowerCase());

  for (const claim of proposedClaims) {
    const lower = claim.toLowerCase();
    // Explicitly forbidden claims always hard-block.
    if (forbidden.some((f) => f && lower.includes(f))) {
      warnings.push(`Forbidden claim detected: "${claim}".`);
      hardBlock = true;
      continue;
    }
    // Regulated-claim patterns warn (and block for medical/health categories).
    const matched = VERTICAL_DRAMA_REGULATED_CLAIM_PATTERNS.find((p) => lower.includes(p));
    if (matched) {
      warnings.push(`Regulated/unsupported claim pattern "${matched}" in: "${claim}".`);
      if (config.regulatedCategory === "medical" || config.regulatedCategory === "health") {
        hardBlock = true;
      } else if (!regulated) {
        // Non-regulated category still warns but does not block.
      }
    }
  }

  return { warnings, hardBlock };
}

/* -------------------------------------------------------------------------- */
/* Fatigue / diversity                                                         */
/* -------------------------------------------------------------------------- */

export interface FatigueResult {
  tieInEpisodes: number;
  exceeded: boolean;
}

/** Count tie-in episodes within the sliding window and flag over-limit use. */
export function evaluateFatigue(
  history: Array<{ episodeNumber: number; hadTieIn: boolean }>,
  maxPerTen: number,
): FatigueResult {
  const window = [...history]
    .sort((a, b) => b.episodeNumber - a.episodeNumber)
    .slice(0, VERTICAL_DRAMA_TIE_IN_FATIGUE_WINDOW);
  const tieInEpisodes = window.filter((h) => h.hadTieIn).length;
  // The current episode would add one more placement.
  const exceeded = tieInEpisodes + 1 > maxPerTen;
  return { tieInEpisodes, exceeded };
}

/* -------------------------------------------------------------------------- */
/* Disclosure separation guard (spec §13)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Assert disclosure copy is NOT present in the video/motion prompt payload.
 * Returns `true` when the prompt is clean (disclosure kept separate).
 */
export function isDisclosureSeparateFromPrompt(
  promptPayload: unknown,
  disclosureText: string | undefined,
): boolean {
  if (!disclosureText) return true;
  const serialized = JSON.stringify(promptPayload ?? "").toLowerCase();
  return !serialized.includes(disclosureText.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* Approval / removal (spec §13)                                               */
/* -------------------------------------------------------------------------- */

/** Whether a planned tie-in may proceed to PAID generation. */
export function canRunPaidGeneration(
  plan: TieInPlanResult,
  usage: VerticalDramaTieInUsage,
): boolean {
  if (plan.blocked) return false;
  if (!usage.enabled) return true;
  // Mandatory approval — approvedByUserId must be present.
  return Boolean(usage.approvedByUserId);
}

/** Approve a tie-in usage, recording the approving user (spec §13). */
export function approveTieIn(
  usage: VerticalDramaTieInUsage,
  approvedByUserId: string,
): VerticalDramaTieInUsage {
  return { ...usage, approvedByUserId };
}

/** Remove a tie-in (removable + auditable): returns an inert, unapproved usage. */
export function removeTieIn(usage: VerticalDramaTieInUsage): VerticalDramaTieInUsage {
  return {
    enabled: false,
    episodeHasTieIn: false,
    shotNumbers: [],
    storyFunction: "",
    placementNaturalnessScore: 0,
    claimsReview: { unsupportedClaimsDetected: false, warnings: [] },
    disclosureRequired: false,
    disclosureText: undefined,
    approvedByUserId: undefined,
  };
}

/**
 * Build the auditable provenance record retained for a tie-in (spec §13). Never
 * includes secrets — only provenance + approval metadata.
 */
export interface TieInProvenanceRecord {
  productSource: NonNullable<VerticalDramaProductTieInConfig["productSource"]>;
  productName?: string;
  regulatedCategory: VerticalDramaProductTieInConfig["regulatedCategory"];
  referenceAssetIds: string[];
  approvedByUserId?: string;
  disclosurePolicy: VerticalDramaProductTieInConfig["disclosurePolicy"];
  recordedAt: string;
}

export function buildTieInProvenance(
  config: VerticalDramaProductTieInConfig,
  usage: VerticalDramaTieInUsage,
): TieInProvenanceRecord {
  return {
    productSource: config.productSource ?? "manual",
    productName: config.productName,
    regulatedCategory: config.regulatedCategory,
    referenceAssetIds: [...config.referenceAssetIds],
    approvedByUserId: usage.approvedByUserId,
    disclosurePolicy: config.disclosurePolicy,
    recordedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Shot-level tie-in mapping (production-grade end-to-end wiring)             */
/*                                                                            */
/* The `vertical-drama-script-builder` skill emits a freeform                */
/* `product_tie_in_plan.tie_ins[]` array (see skill.md / examples) — never    */
/* strictly typed beyond "an object", so this module treats every field as    */
/* best-effort/optional and normalizes whatever shape the LLM produced into   */
/* the strict `VerticalDramaShotProductPlacement[]` the rest of the pipeline  */
/* (start-frame plan projection, per-shot image/video generation, UI chip)    */
/* can rely on. Never throws on malformed entries — skips them instead, so a  */
/* single bad LLM entry never fails the whole stage.                         */
/* -------------------------------------------------------------------------- */

/** One normalized product placement, mapped onto concrete shot numbers. */
export interface VerticalDramaShotProductPlacement {
  shotNumbers: number[];
  /** Narrative function for this placement (spec §13 — required for compliance). */
  storyFunction: string;
  /** How the product appears in the shot — never a hard "ad" look. */
  placementStyle: "hero_prop" | "background" | "in_use_moment";
  /** Short benefit talking point the dialogue can naturally reference. */
  benefitTalkingPoint?: string;
}

/** Loosely-typed shape of one raw `product_tie_in_plan.tie_ins[]` entry. */
interface RawTieInPlanEntry {
  shot_numbers?: unknown;
  shot_number?: unknown;
  story_function?: unknown;
  placement_style?: unknown;
  benefit_talking_point?: unknown;
  benefit?: unknown;
}

const PLACEMENT_STYLES = ["hero_prop", "background", "in_use_moment"] as const;

function normalizePlacementStyle(value: unknown): VerticalDramaShotProductPlacement["placementStyle"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if ((PLACEMENT_STYLES as readonly string[]).includes(normalized)) {
      return normalized as VerticalDramaShotProductPlacement["placementStyle"];
    }
  }
  return "in_use_moment";
}

function normalizeShotNumbers(entry: RawTieInPlanEntry): number[] {
  const raw = Array.isArray(entry.shot_numbers)
    ? entry.shot_numbers
    : entry.shot_number !== undefined
      ? [entry.shot_number]
      : [];
  const nums = raw
    .map((n) => (typeof n === "number" ? n : Number(n)))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 9);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

/**
 * Extract + normalize the shot-level product placements from the script
 * stage's raw `product_tie_in_plan` blob (whatever shape the LLM produced).
 * Returns `[]` when tie-in is disabled, absent, or every entry is malformed
 * (no shot numbers, e.g. the `{ tie_ins: [], note: "no product this episode" }`
 * placeholder the skill emits when there's nothing to place).
 */
export function extractShotProductPlacements(
  productTieInPlan: unknown,
): VerticalDramaShotProductPlacement[] {
  if (!productTieInPlan || typeof productTieInPlan !== "object") return [];
  const tieIns = (productTieInPlan as Record<string, unknown>).tie_ins;
  if (!Array.isArray(tieIns)) return [];

  const placements: VerticalDramaShotProductPlacement[] = [];
  for (const raw of tieIns) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as RawTieInPlanEntry;
    const shotNumbers = normalizeShotNumbers(entry);
    if (shotNumbers.length === 0) continue;
    const storyFunction =
      typeof entry.story_function === "string" && entry.story_function.trim()
        ? entry.story_function.trim()
        : "";
    if (!storyFunction) continue; // spec §13 — story function is mandatory.
    placements.push({
      shotNumbers,
      storyFunction,
      placementStyle: normalizePlacementStyle(entry.placement_style),
      benefitTalkingPoint:
        typeof entry.benefit_talking_point === "string" && entry.benefit_talking_point.trim()
          ? entry.benefit_talking_point.trim()
          : typeof entry.benefit === "string" && entry.benefit.trim()
            ? entry.benefit.trim()
            : undefined,
    });
  }
  return placements;
}

/** Flattened set of every shot number carrying a product placement. */
export function tieInShotNumberSet(placements: VerticalDramaShotProductPlacement[]): Set<number> {
  const set = new Set<number>();
  for (const p of placements) for (const n of p.shotNumbers) set.add(n);
  return set;
}

/** Look up the placement (if any) covering a given shot number. */
export function findPlacementForShot(
  placements: VerticalDramaShotProductPlacement[],
  shotNumber: number,
): VerticalDramaShotProductPlacement | undefined {
  return placements.find((p) => p.shotNumbers.includes(shotNumber));
}

const PLACEMENT_STYLE_DIRECTIVE: Record<VerticalDramaShotProductPlacement["placementStyle"], string> = {
  hero_prop:
    "the product is a hero prop the character is actively holding/handling in frame",
  background:
    "the product is naturally visible in the background of the scene (on a shelf, desk, or table), not the focal point",
  in_use_moment:
    "the character is naturally using the product in this exact moment, integrated into the action",
};

/* -------------------------------------------------------------------------- */
/* Product lock (hard visual-identity guard for tie-in generation)            */
/*                                                                            */
/* Whenever a product reference image is attached to a generation call, the   */
/* product's real-world appearance must never be reinterpreted/redesigned by  */
/* the model. This is applied at every point a product reference image is    */
/* used: the pipeline's tie-in image-prompt directive, the start-frame        */
/* image/angle-variation generation calls (negative prompt), shot image      */
/* repair (preservation directive) when the shot is a tie-in shot, and the    */
/* per-shot video prompt (product must stay visually unchanged while moving). */
/* -------------------------------------------------------------------------- */

/**
 * Concise, cap-aware hard-lock instruction appended immediately after the
 * natural in-scene placement directive (BEFORE any other decorative prompt
 * detail) so it survives `ensurePromptWithinLimit`'s tail truncation fallback
 * if the final prompt still exceeds the cap after LLM refinement.
 */
export const VD_PRODUCT_LOCK_INSTRUCTION =
  "PRODUCT LOCK (MANDATORY): the product shown in the reference image(s) must appear EXACTLY as-is — identical shape, proportions, physical size relative to the scene, colors, materials, logo, and label text. Do NOT redesign, restyle, recolor, resize, add or remove parts, or invent variants of the product.";

/** Negative-prompt terms enforcing the product lock on the generation side. */
export const VD_PRODUCT_LOCK_NEGATIVE_TERMS = [
  "altered product design",
  "wrong product color",
  "distorted logo",
  "modified packaging",
  "redesigned product",
] as const;

/** Comma-joined negative-prompt fragment built from `VD_PRODUCT_LOCK_NEGATIVE_TERMS`. */
export const VD_PRODUCT_LOCK_NEGATIVE_PROMPT_FRAGMENT = VD_PRODUCT_LOCK_NEGATIVE_TERMS.join(", ");

/**
 * Video-side variant of the product lock — the product must remain visually
 * unchanged (no redesign/recolor/resize/logo drift) across the clip's motion,
 * distinct from the image-side wording since video prompts describe change
 * over time rather than a single frame.
 *
 * DEFERRED for vertical-drama-skill-first-architecture plan, Phase 3, item 3
 * (2026-07-11) — used inline in
 * `verticalDramaVideoMotionPromptGeneration.ts`'s per-shot user-prompt
 * builders (`buildShotVideoPromptUserPrompt` and its sub-shots variant) as
 * part of the INPUT sent to the `vertical-drama-shot-video-prompt` skill —
 * not a post-hoc output append, so architecturally closer to Tier 1/5's
 * "code authors instructional prompt text" issue than Tier 3's append
 * pattern. Converting this (pass `productName`/`description`/`placementStyle`
 * as structured facts, let skill.md phrase the lock itself, mirroring
 * `vertical-drama-shot-image-action/skill.md`'s "weave into prose, never
 * append verbatim" pattern) is achievable without touching any off-limits
 * file, but was intentionally bundled into the same deferred follow-up as
 * `appendPresetVisualIdentityStyleTokensToMotionPrompt` above (same file,
 * same skill, same review pass) rather than done as an isolated partial
 * edit to the video pipeline in this phase.
 */
export const VD_PRODUCT_LOCK_VIDEO_INSTRUCTION =
  "PRODUCT LOCK (MANDATORY): the product must remain visually unchanged while in motion — same shape, proportions, size relative to the scene, colors, materials, logo, and label text as the reference image, for the entire clip. Never let the product warp, morph, recolor, resize, or drift its logo/label during the motion.";

/**
 * Append a concise, natural in-scene product-presence direction PLUS the hard
 * product-lock instruction to a shot's image prompt (spec: no ad-poster look,
 * natural placement only; product visuals must never be reinterpreted). The
 * lock is appended immediately after the placement directive — i.e. before
 * any other decorative prompt detail added later in the pipeline — so it is
 * the LEAST likely part of the final prompt to be cut if a downstream QC
 * pass has to hard-truncate at the character cap. Caller is responsible for
 * enforcing the final prompt length cap (`VD_IMAGE_PROMPT_MAX` via
 * `ensurePromptWithinLimit`) — this only appends, never truncates.
 *
 * Brand-neutral by design (Thai ad-compliance + video-policy guard,
 * 2026-07-06): the directive NEVER names the product/brand — brand identity
 * comes from the attached product reference image + the product lock, not
 * prompt text. `categoryDescriptor` (e.g. "skincare bottle") lets the
 * directive read more naturally than the generic reference-image phrasing
 * alone; omit it to fall back to `buildGenericProductDescriptor`'s default.
 * `productName` is still accepted (for backward-compat call sites) but is
 * intentionally never interpolated into the outgoing directive text.
 *
 * DEFERRED for vertical-drama-skill-first-architecture plan, Phase 3, item 3
 * (2026-07-11) — the `VD_PRODUCT_LOCK_INSTRUCTION` sentence appended below is
 * still code-authored, intentionally not migrated to skill.md this phase:
 * this function's ONLY call site (grep-confirmed) is
 * `verticalDramaEpisodePipeline.ts`'s `generateRealStartFramePlan`, applied
 * ONCE right after the `vertical-drama-shot-start-frame-render` planning
 * skill call returns, before the plan is persisted — outside this phase's
 * authorized file list. Converting it properly requires threading product
 * facts (`productName`, `placement`, `categoryDescriptor`) into that skill
 * call's own input (mirroring how `characters` already flows into
 * `buildStartFrameRenderPlanUserPrompt`) and teaching skill.md to phrase the
 * lock itself, then removing this call site from the pipeline file — that
 * pipeline-side change is out of scope here. `VD_PRODUCT_LOCK_NEGATIVE_TERMS`/
 * `mergeProductLockNegativePrompt` are unaffected (pure keyword-list merge,
 * not an authored instruction sentence — legitimate as-is).
 */
export function appendProductPresenceDirective(
  imagePrompt: string,
  productName: string | undefined,
  placement: VerticalDramaShotProductPlacement,
  categoryDescriptor?: string,
): string {
  const genericName = buildGenericProductDescriptor(categoryDescriptor);
  const directive = `Product placement (natural, not an advertisement): ${genericName} must be visibly present in this shot — ${PLACEMENT_STYLE_DIRECTIVE[placement.placementStyle]}. Render it as an ordinary object in the world of the scene, photorealistic and consistent with the attached product reference image, never as packaging art, a poster, or on-image text/branding overlay. Never render brand names, logos as text, or trademarked wording as prompt-described text — any branding visible must come only from the attached reference image itself.`;
  // Defensive sanitize pass over the caller's own `imagePrompt` too — in case
  // an earlier pipeline stage's LLM output already wrote the literal brand
  // name into the base shot description.
  const sanitizedImagePrompt = sanitizeBrandMentionsInPrompt(
    imagePrompt.trim(),
    [productName],
    categoryDescriptor,
  );
  return [sanitizedImagePrompt, directive, VD_PRODUCT_LOCK_INSTRUCTION].filter(Boolean).join(" ");
}

/**
 * Merge the product-lock negative-prompt terms into an existing negative
 * prompt string — only when product reference image(s) are actually attached
 * to this generation call (`hasProductReferences`). No-op (returns the
 * original negative prompt unchanged, including `undefined`) when there are
 * no product references, so shots without a tie-in are never affected.
 */
export function mergeProductLockNegativePrompt(
  negativePrompt: string | undefined,
  hasProductReferences: boolean,
): string | undefined {
  if (!hasProductReferences) return negativePrompt;
  const existing = negativePrompt?.trim();
  return existing
    ? `${existing}, ${VD_PRODUCT_LOCK_NEGATIVE_PROMPT_FRAGMENT}`
    : VD_PRODUCT_LOCK_NEGATIVE_PROMPT_FRAGMENT;
}

/* -------------------------------------------------------------------------- */
/* Brand / public-figure sanitize pass (Thai ad-compliance + video-policy     */
/* guard, 2026-07-06)                                                         */
/*                                                                            */
/* Provider-facing prompts (image AND video) must never contain the product's */
/* brand/trademark name, a real public figure/celebrity name, or a real       */
/* company name — that identity must come from the attached reference image  */
/* + the product lock, never from prompt text (some providers content-policy */
/* reject brand-name/trademark/celebrity mentions in generation prompts, and  */
/* it is also a marketing/IP risk regardless). This is a rule-based find/     */
/* replace over the KNOWN product/brand name from the tie-in config — it does */
/* NOT attempt open-ended celebrity/brand detection (that would need an LLM   */
/* call); the matching skill instructions ("never name real people,           */
/* celebrities, or brands") are the complementary guard for names the caller  */
/* doesn't already know about.                                               */
/* -------------------------------------------------------------------------- */

/** Generic, brand-neutral placeholder text used when no better category descriptor is available. */
const VD_GENERIC_PRODUCT_DESCRIPTOR_FALLBACK = "the product shown in the reference image";

/**
 * Build a generic, brand-neutral descriptor for the product — prefers a
 * caller-supplied category descriptor (e.g. "the skincare bottle") when
 * provided, else falls back to the reference-image phrasing.
 */
export function buildGenericProductDescriptor(categoryDescriptor?: string): string {
  const trimmed = categoryDescriptor?.trim();
  return trimmed ? `the ${trimmed} shown in the reference image` : VD_GENERIC_PRODUCT_DESCRIPTOR_FALLBACK;
}

/** Escape a string for safe use inside a `RegExp` constructor. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip/replace every occurrence of the product/brand name (and, if
 * provided, any additional known aliases — e.g. a shortened brand name) in an
 * outgoing PROVIDER-FACING prompt string with a generic, brand-neutral
 * descriptor. Case-insensitive, word-boundary match so a brand name that is
 * also a common word (e.g. "Glow") is only replaced as a whole word, not
 * inside unrelated words. No-op (returns the prompt unchanged) when no
 * brand/product name is configured — a tie-in with no `productName` has
 * nothing to sanitize.
 */
export function sanitizeBrandMentionsInPrompt(
  prompt: string,
  brandNames: Array<string | undefined | null>,
  categoryDescriptor?: string,
): string {
  const names = brandNames
    .map((n) => n?.trim())
    .filter((n): n is string => Boolean(n && n.length > 0));
  if (names.length === 0) return prompt;

  const genericDescriptor = buildGenericProductDescriptor(categoryDescriptor);
  let result = prompt;
  for (const name of names) {
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi");
    result = result.replace(pattern, genericDescriptor);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

/** Max number of product reference images resolved for a tie-in (before the character-ref merge/trim step). */
export const VD_PRODUCT_REFERENCE_IMAGE_CAP = 3 as const;

/**
 * Resolve the effective set of product reference image URLs for a tie-in
 * config: Marketplace Capture's selected/best product images (when a capture
 * is linked) plus the series' own `productImageUrl` (when also set), deduped
 * and capped at `VD_PRODUCT_REFERENCE_IMAGE_CAP`. Pure — the caller is
 * responsible for actually fetching `captureSelectedImageUrls` (e.g. via the
 * Marketplace Capture storytelling-handoff read path) and passing them in;
 * this function never throws and degrades gracefully:
 *   - capture linked but it has no images -> falls back to `productImageUrl`
 *     alone (or `[]` if that is also absent);
 *   - no capture and no `productImageUrl` -> `[]`.
 * Capture images are listed first (curated/best evidence), then
 * `productImageUrl` (manual override), matching the general "most authoritative
 * source first" convention already used by `mergeAndTrimReferenceImageUrls`.
 */
export function resolveProductReferenceImageUrls(input: {
  productImageUrl?: string;
  captureSelectedImageUrls?: string[];
}): string[] {
  const captureUrls = (input.captureSelectedImageUrls ?? []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  const manualUrl = input.productImageUrl?.trim();
  const combined = manualUrl ? [...captureUrls, manualUrl] : captureUrls;
  const deduped = combined.filter((u, i, arr) => arr.indexOf(u) === i);
  return deduped.slice(0, VD_PRODUCT_REFERENCE_IMAGE_CAP);
}

/**
 * Read-only, tenant/user-scoped fetch of a Marketplace Capture's
 * selected/best product image URLs, for use as tie-in product reference
 * images. Reuses the exact same read path the `marketplaceCapture.
 * getStorytellingHandoff` tRPC procedure already exposes to the frontend
 * (`listMarketplaceInsightsByCapture` -> synced `storytelling_handoff`
 * insight if one exists, else `buildBasicStorytellingHandoffFromCapture`'s
 * on-the-fly basic handoff) so both surfaces stay consistent. Never throws:
 * a missing/inaccessible/cross-tenant capture, or a capture with no
 * selectable images, simply resolves to `[]` (graceful skip — the caller
 * falls back to `productImageUrl` alone via `resolveProductReferenceImageUrls`).
 */
export async function resolveMarketplaceCaptureProductImageUrls(
  marketplaceCaptureId: string | undefined,
  auth: { userId: number; tenantId?: string },
): Promise<string[]> {
  if (!marketplaceCaptureId?.trim()) return [];
  try {
    const {
      listMarketplaceInsightsByCapture,
      buildBasicStorytellingHandoffFromCapture,
    } = await import("./marketplaceInsightService");
    const insights = await listMarketplaceInsightsByCapture(marketplaceCaptureId, auth);
    const syncedHandoff = insights.find(
      (insight: { insightType?: string }) => insight.insightType === "storytelling_handoff",
    );
    const handoff =
      (syncedHandoff?.payloadJson as { selectedImages?: Array<{ url?: string }> } | undefined) ??
      (await buildBasicStorytellingHandoffFromCapture(marketplaceCaptureId, auth));
    const selectedImages = Array.isArray((handoff as { selectedImages?: unknown })?.selectedImages)
      ? ((handoff as { selectedImages: Array<{ url?: string }> }).selectedImages)
      : [];
    return selectedImages
      .map((img) => (typeof img?.url === "string" ? img.url.trim() : ""))
      .filter((url): url is string => url.length > 0);
  } catch {
    // Capture missing / inaccessible / cross-tenant / any read error — graceful
    // skip, never crash tie-in image resolution over a bad capture link.
    return [];
  }
}

/** One product reference image the picker can offer the user (spec: "control the reference"). */
export interface VerticalDramaAvailableProductImage {
  url: string;
  source: "capture" | "direct";
  label?: string;
}

/**
 * List EVERY available product reference image for a series' tie-in config —
 * the full Marketplace Capture image set (not the generation-time capped-3
 * subset `resolveProductReferenceImageUrls` returns) plus the series' own
 * `productImageUrl`, for the storyboard panel's "เปลี่ยนภาพสินค้า" picker to
 * choose from. Read-only, user/tenant-scoped (delegates to
 * `getMarketplaceCaptureForUser`, which is user-scoped the same way
 * `resolveMarketplaceCaptureProductImageUrls` already is), deduped by URL,
 * capture images first (curated/best evidence) then the direct URL. Never
 * throws: a missing/inaccessible/cross-tenant capture, or one with no
 * images, degrades to just the direct URL (or `[]`).
 */
export async function listAvailableProductReferenceImages(input: {
  productImageUrl?: string;
  marketplaceCaptureId?: string;
  auth: { userId: number; tenantId?: string };
}): Promise<VerticalDramaAvailableProductImage[]> {
  const images: VerticalDramaAvailableProductImage[] = [];
  const seen = new Set<string>();

  if (input.marketplaceCaptureId?.trim()) {
    try {
      const {
        listMarketplaceInsightsByCapture,
        buildBasicStorytellingHandoffFromCapture,
      } = await import("./marketplaceInsightService");
      const insights = await listMarketplaceInsightsByCapture(input.marketplaceCaptureId, input.auth);
      const syncedHandoff = insights.find(
        (insight: { insightType?: string }) => insight.insightType === "storytelling_handoff",
      );
      const handoff =
        (syncedHandoff?.payloadJson as
          | { selectedImages?: Array<{ url?: string; role?: string }> }
          | undefined) ?? (await buildBasicStorytellingHandoffFromCapture(input.marketplaceCaptureId, input.auth));
      const selectedImages = Array.isArray((handoff as { selectedImages?: unknown })?.selectedImages)
        ? (handoff as { selectedImages: Array<{ url?: string; role?: string }> }).selectedImages
        : [];
      for (const img of selectedImages) {
        const url = typeof img?.url === "string" ? img.url.trim() : "";
        if (!url || seen.has(url)) continue;
        seen.add(url);
        images.push({
          url,
          source: "capture",
          label: typeof img.role === "string" && img.role ? img.role : undefined,
        });
      }
    } catch {
      // Capture missing / inaccessible / cross-tenant / any read error —
      // graceful skip, matching `resolveMarketplaceCaptureProductImageUrls`.
    }
  }

  const manualUrl = input.productImageUrl?.trim();
  if (manualUrl && !seen.has(manualUrl)) {
    seen.add(manualUrl);
    images.push({ url: manualUrl, source: "direct" });
  }

  return images;
}

/**
 * Decide a frame's effective `productReferenceAssetIds` when the pipeline
 * (re)generates `start_frame_render_plan` (2026-07-06 product-reference
 * upgrade — override semantics). Pure/unit-testable, called by
 * `verticalDramaEpisodePipeline.ts`'s tie-in shot-mapping step for every
 * frame that carries a placement:
 *
 *   - `productRefsCustomized: true` (the user explicitly set/cleared this
 *     shot's product reference image(s) via the storyboard panel's picker) —
 *     USE THE EXISTING VALUE AS-IS, even `[]` (an explicit "no product image
 *     for this shot" choice); auto-resolution never overwrites it.
 *   - otherwise (never touched, or `productRefsCustomized` absent/false —
 *     the pre-existing default for every frame created before this field
 *     existed) — merge the newly-resolved `productRefUrls` into whatever was
 *     already there, deduped (the pre-existing auto-merge behavior,
 *     unchanged).
 */
export function resolveFrameProductReferenceAssetIds(input: {
  existingProductReferenceAssetIds: string[] | undefined;
  productRefsCustomized: boolean | undefined;
  resolvedProductRefUrls: string[];
}): string[] {
  const existing = input.existingProductReferenceAssetIds ?? [];
  if (input.productRefsCustomized) return existing;
  return input.resolvedProductRefUrls.length
    ? Array.from(new Set([...existing, ...input.resolvedProductRefUrls]))
    : existing;
}

/**
 * Merge location + product reference URLs onto a shot's existing character
 * reference URL list and trim to the resolved model's `maxReferenceImages`,
 * if any. Priority order (highest to lowest, per
 * `planning/polished-toasting-gadget.md` Phase 2 "Render-time attachment"):
 * character refs first (never trimmed first — identity-lock is the single
 * most important reference), then the shot's location reference (Location
 * Visual Bible — at most one URL per shot), then product refs LAST (trimmed
 * first — a product tie-in already has its own independent hard gate
 * elsewhere that blocks render if missing, so it is comparatively
 * protected). Returns the merged list plus how many entries were trimmed off
 * the END (so callers can surface a "reference images were trimmed" notice,
 * matching the existing convention used for shot-reference trimming
 * elsewhere in this router).
 */
export function mergeAndTrimReferenceImageUrls(
  characterRefUrls: string[],
  locationRefUrls: string[],
  productRefUrls: string[],
  maxReferenceImages: number | undefined,
): { urls: string[]; trimmedCount: number } {
  const merged = [...characterRefUrls, ...locationRefUrls, ...productRefUrls].filter(
    (u, i, arr) => Boolean(u) && arr.indexOf(u) === i,
  );
  if (!maxReferenceImages || maxReferenceImages <= 0 || merged.length <= maxReferenceImages) {
    return { urls: merged, trimmedCount: 0 };
  }
  return {
    urls: merged.slice(0, maxReferenceImages),
    trimmedCount: merged.length - maxReferenceImages,
  };
}

/* -------------------------------------------------------------------------- */
/* Tie-in naturalness quality report (spec §13.1 / §16.1, section-08          */
/* extension "Production-Grade Tie-In Naturalness QC", added 2026-07-07)      */
/*                                                                            */
/* Measurement + repair-loop layer ON TOP of the shipped placement machinery  */
/* above — never replaces it. Pure/DB-free (mirrors `planTieIn`'s convention) */
/* so it is cheaply unit-testable; the caller (router) is responsible for     */
/* resolving `script`/`storyboard`/dialogue lines/policy and persisting the   */
/* result as a run artifact.                                                 */
/* -------------------------------------------------------------------------- */

/** Max spoken (dialogue) mentions of the product name/benefit per episode (spec §13.1). */
export const VD_TIE_IN_MAX_SPOKEN_MENTIONS = 2 as const;

/** Max shots (of 9) a tie-in may visually occupy per episode (spec §13.1). */
export const VD_TIE_IN_MAX_VISUAL_SHOTS = 3 as const;

/**
 * Small th/en ad-speak lexicon (spec §13.1) — superlative/CTA phrasing that
 * reads as a hard advertisement rather than natural in-story dialogue. A hit
 * is a deterministic report violation UNLESS the carrying shot's placement
 * story function is an explicit `soft_cta` beat (see `isSoftCtaStoryFunction`
 * below) — a soft CTA moment is exactly where this kind of phrasing is
 * intentionally allowed. Case-insensitive substring match, same matching
 * style as `screenThaiAdCompliance`/`screenClaims`. Deliberately SMALL and
 * SEPARATE from `VERTICAL_DRAMA_THAI_PROHIBITED_CLAIM_PATTERNS` (legal claim
 * compliance) and `VERTICAL_DRAMA_REGULATED_CLAIM_PATTERNS` (regulated
 * unsupported claims) — this lexicon is about marketing TONE, not legality.
 */
export const VERTICAL_DRAMA_AD_SPEAK_LEXICON: readonly string[] = [
  // Thai superlative / CTA phrasing.
  "ดีที่สุด",
  "ซื้อเลย",
  "สั่งซื้อ",
  "โปรโมชั่น",
  "ลดราคา",
  "ห้ามพลาด",
  // English superlative / CTA phrasing.
  "best ever",
  "buy now",
  "order now",
  "shop now",
  "limited time offer",
  "act now",
  "don't miss out",
];

/**
 * True when a placement's (freeform, LLM-authored) `storyFunction` text
 * reads as the `soft_cta` allowed story function (spec `allowedStoryFunctions`
 * enum) — normalizes whitespace/underscores/hyphens before matching so both
 * `"soft_cta"` and prose like `"a soft CTA moment"` match. Ad-speak lexicon
 * hits are TOLERATED only in a shot classified this way.
 */
export function isSoftCtaStoryFunction(storyFunction: string | undefined): boolean {
  if (!storyFunction) return false;
  return storyFunction.toLowerCase().replace(/[\s_-]+/g, "").includes("softcta");
}

/**
 * Qualitative dimensions expected from the section-14 quality-review skill's
 * v2 scorecard (`server/services/verticalDramaEpisodeQualityReview.ts`) —
 * narrow slice, only the tie-in-relevant fields.
 */
export interface TieInQualityScorecardV2 {
  /** 1-5, or null/undefined when tie-in was not judged (flag off / disabled). */
  tie_in_naturalness?: number | null;
  /** Short qualitative note supporting the score — echoed onto the report as `tieInAssessment`. */
  tie_in_assessment?: string;
}

/**
 * The report's core computed fields (spec §13.1 `VerticalDramaTieInQualityReport`,
 * minus the persistence-layer identifiers `reportId`/`episodeId`/`runId` —
 * this function is pure/DB-free, so those are stamped by the caller at
 * persist time, same convention as `planTieIn`'s `TieInPlanResult` never
 * assigning its own DB ids).
 *
 * ADAPTATION (documented per this wave's brief): spec §13.1 names THREE
 * separate qualitative sub-dimensions (`storyIntegration`,
 * `characterMotivation`, `toneMatch`, each 1-5, independently judged).
 * The shipped section-14 scorecard v2 (already shipped, not reimplemented
 * here) carries a single judged `tie_in_naturalness` (1-5) dimension plus a
 * free-text `tie_in_assessment` note — it does not carry three independent
 * numbers. This report folds all three spec sub-dimensions onto that ONE
 * shipped judged value (`storyIntegration === characterMotivation ===
 * toneMatch === tie_in_naturalness`), which keeps `naturalnessScore`'s spec
 * formula (`round(mean(...) / 5 * 100)`) numerically IDENTICAL to
 * `round(tie_in_naturalness / 5 * 100)` — the mean of three equal numbers is
 * that number. `tieInAssessment` carries the skill's own qualitative note
 * for the UI. A future skill-schema upgrade that splits the single dimension
 * into three real ones can drop this fold-in without changing this
 * function's return shape.
 */
export interface VerticalDramaTieInQualityReport {
  // qualitative (LLM-judged, 1-5) — see ADAPTATION doc comment above.
  storyIntegration: number;
  characterMotivation: number;
  toneMatch: number;
  tieInAssessment?: string;
  // deterministic (computed, not judged)
  spokenMentionCount: number;
  visualShotCount: number;
  adSpeakViolations: string[];
  claimViolations: string[];
  disclosureSeparated: boolean;
  fatigueOk: boolean;
  // verdict
  naturalnessScore: number;
  passed: boolean;
}

export interface BuildTieInQualityReportParams {
  /** Raw (or relevant-subset) `vertical-drama-script-builder` output — only `product_tie_in_plan` is consulted. */
  script?: Record<string, unknown> | null;
  /**
   * Raw (or relevant-subset) storyboard — consulted ONLY as a disclosure-
   * separation cross-check candidate (alongside `script`); the primary
   * `visualShotCount` deterministic check reads `product_tie_in_plan.
   * shot_numbers` directly (spec §13.1), not the storyboard.
   */
  storyboard?: Record<string, unknown> | null;
  /** Every shot's spoken dialogue line texts, keyed by shot number (script/dialogue-plan sourced). */
  dialogueLinesByShot?: Map<number, string[]>;
  tieInConfig: VerticalDramaProductTieInConfig;
  scorecardV2: TieInQualityScorecardV2;
  /** Result of `evaluateFatigue(...)` for this episode — `fatigueOk = !fatigueContext.exceeded`. */
  fatigueContext: { exceeded: boolean };
  /**
   * Resolved quality policy (spec §16.1, `resolveQualityPolicy`) — supplies
   * `tieInMinNaturalnessScore`, the pass floor `naturalnessScore` must clear.
   * Not part of this file's own contracts; caller resolves it via the
   * already-shipped `@shared/verticalDramaSeries/qualityPolicy` module.
   */
  policy: Pick<VerticalDramaQualityPolicy, "tieInMinNaturalnessScore">;
}

/**
 * Build the hybrid (deterministic + qualitative) tie-in naturalness report
 * for one episode (spec §13.1). Pure — no DB, no LLM call (the qualitative
 * score is supplied already-judged via `scorecardV2`, produced by the
 * section-14 quality-review skill). Never throws: a missing/malformed
 * `product_tie_in_plan` simply yields zero deterministic violations.
 *
 * `naturalnessScore` formula (spec §13.1, exact): `round(tie_in_naturalness /
 * 5 * 100)` (see the ADAPTATION doc comment on
 * `VerticalDramaTieInQualityReport` for why this is numerically identical to
 * the spec's `round(mean(storyIntegration, characterMotivation, toneMatch) /
 * 5 * 100)`); when ANY deterministic violation exists, the stored score is
 * capped at `min(score, 69)` — one point below the default pass floor — so a
 * violation can never be masked by a high qualitative score.
 * `passed = naturalnessScore >= policy.tieInMinNaturalnessScore AND zero
 * deterministic violations`.
 */
export function buildTieInQualityReport(
  params: BuildTieInQualityReportParams,
): VerticalDramaTieInQualityReport {
  const { tieInConfig, scorecardV2, fatigueContext, policy } = params;

  const placements = extractShotProductPlacements(
    (params.script as { product_tie_in_plan?: unknown } | null | undefined)?.product_tie_in_plan,
  );
  const tieInShotNumbers = tieInShotNumberSet(placements);
  const visualShotCount = tieInShotNumbers.size;

  const dialogueLinesByShot = params.dialogueLinesByShot ?? new Map<number, string[]>();
  const tieInShotDialogueLines: string[] = [];
  for (const shotNumber of tieInShotNumbers) {
    tieInShotDialogueLines.push(...(dialogueLinesByShot.get(shotNumber) ?? []));
  }

  // Deterministic check 1: spoken product-name/benefit mentions (max 2).
  const productNameLower = tieInConfig.productName?.trim().toLowerCase();
  const benefitPhrasesLower = placements
    .map((p) => p.benefitTalkingPoint?.trim().toLowerCase())
    .filter((b): b is string => Boolean(b));
  const spokenMentionCount = tieInShotDialogueLines.filter((line) => {
    const lower = line.toLowerCase();
    if (productNameLower && lower.includes(productNameLower)) return true;
    return benefitPhrasesLower.some((benefit) => lower.includes(benefit));
  }).length;

  // Deterministic check 2: ad-speak lexicon hits outside an allowed soft_cta shot.
  const adSpeakViolations: string[] = [];
  for (const shotNumber of tieInShotNumbers) {
    const placement = findPlacementForShot(placements, shotNumber);
    if (isSoftCtaStoryFunction(placement?.storyFunction)) continue;
    for (const line of dialogueLinesByShot.get(shotNumber) ?? []) {
      const lower = line.toLowerCase();
      const hit = VERTICAL_DRAMA_AD_SPEAK_LEXICON.find((phrase) => lower.includes(phrase.toLowerCase()));
      if (hit) {
        adSpeakViolations.push(`Ad-speak phrase "${hit}" in shot ${shotNumber} dialogue: "${line}"`);
      }
    }
  }

  // Deterministic check 3: forbidden/regulated claim screening (existing `screenClaims`),
  // run over every tie-in-carrying shot's spoken lines.
  const claimViolations = screenClaims(tieInConfig, tieInShotDialogueLines).warnings;

  // Deterministic check 4: disclosure separation (existing `isDisclosureSeparateFromPrompt`).
  // This pure function has no direct access to the actual outgoing prompt
  // payloads (start-frame/motion prompts are assembled downstream, at
  // generation time) — the category-mandated disclosure line (when the
  // product category has one) is checked against the SCRIPT + STORYBOARD
  // JSON instead, the closest available prompt-source proxy within this
  // function's pure/DB-free signature. The generation-time prompt assembly
  // path is the actual enforcement point for the video/image payload itself.
  const requiredDisclosure = resolveRequiredDisclosureForCategory(tieInConfig.productCategory);
  const disclosureSeparated = isDisclosureSeparateFromPrompt(
    { script: params.script ?? null, storyboard: params.storyboard ?? null },
    requiredDisclosure,
  );

  // Deterministic check 5: fatigue (existing `evaluateFatigue`, caller-computed).
  const fatigueOk = !fatigueContext.exceeded;

  const hasDeterministicViolation =
    spokenMentionCount > VD_TIE_IN_MAX_SPOKEN_MENTIONS ||
    visualShotCount > VD_TIE_IN_MAX_VISUAL_SHOTS ||
    adSpeakViolations.length > 0 ||
    claimViolations.length > 0 ||
    !disclosureSeparated ||
    !fatigueOk;

  // Qualitative — see the ADAPTATION doc comment on
  // `VerticalDramaTieInQualityReport` for why all three spec sub-dimensions
  // fold onto the single shipped `tie_in_naturalness` value. `?? 0` is a
  // conservative fallback for the (should-not-normally-happen-when-tie-in-
  // enabled) case where the LLM omitted the dimension — a missing judgment
  // scores as the worst case, never silently passes.
  const tieInNaturalness = scorecardV2.tie_in_naturalness ?? 0;
  const storyIntegration = tieInNaturalness;
  const characterMotivation = tieInNaturalness;
  const toneMatch = tieInNaturalness;

  const rawScore = Math.round((tieInNaturalness / 5) * 100);
  const naturalnessScore = hasDeterministicViolation ? Math.min(rawScore, 69) : rawScore;
  const passed = naturalnessScore >= policy.tieInMinNaturalnessScore && !hasDeterministicViolation;

  return {
    storyIntegration,
    characterMotivation,
    toneMatch,
    tieInAssessment: scorecardV2.tie_in_assessment,
    spokenMentionCount,
    visualShotCount,
    adSpeakViolations,
    claimViolations,
    disclosureSeparated,
    fatigueOk,
    naturalnessScore,
    passed,
  };
}
