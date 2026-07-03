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
