/**
 * Deterministic join between a project's statements (narration + on-screen
 * caption/text) and its declared claim records (Feature 133, section-06
 * §5.1). This is a FACT computed for the QA judge — it does NOT decide
 * naturalness or prohibited-category judgment (those live in
 * `skills/video-project-quality-review/skill.md`, skill-first rule, memory
 * `feedback_skill_first_authoring`). The only hard signal this module emits
 * is `blocksFinalRender`, which the router (section-07) turns into
 * `VI_CLAIM_VIOLATION` per spec §20. This file does NO I/O and calls no LLM.
 *
 * Motion Studio projects (no product/catalog source, `resolvedCatalog ===
 * null`) skip claim validation entirely and get an empty
 * `ClaimValidationResult` with `blocksFinalRender: false` (cross-section
 * consistency resolution #5, `sections/index.md`).
 */
import type { ClaimRecord, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

/**
 * Catalog facts resolved from the marketplace product + insights (research
 * A13). Passed in by the caller (section-07) — this function does NO I/O.
 * Seeded from `marketplaceCaptureInsights.claimResolutionsJson` + product
 * fields. `null` means "no catalog source" (a Motion Studio project).
 */
export type ResolvedCatalogFacts = {
  productIds: string[];
  /** Approved/known claim strings + their source + status, from claimResolutionsJson. */
  claimResolutions: Array<{ claim: string; source: string; status: ClaimRecord["status"] }>;
  /** Latest price/promotion facts stamped at generation time (spec §11). */
  priceFacts?: { current?: string; original?: string; currency?: string; resolvedAt: string };
};

export type ClaimValidationResult = {
  /** Statements (narration/caption/text) that matched a claim record. */
  mappedClaims: Array<{ statement: string; sceneId: string; claim: string; status: ClaimRecord["status"] }>;
  /** Product statements with no backing claim record — flagged for the judge. */
  unmappedStatements: Array<{ statement: string; sceneId: string }>;
  /** Claims whose status is "prohibited" (deduplicated by claim text). */
  prohibitedClaims: Array<{ claim: string; status: "prohibited" }>;
  /** Fraction of product statements that mapped to a claim (0..1); metric input. */
  coverage: number;
  /** True iff a prohibited claim OR an unmapped product statement is present.
   *  The router uses this to block `final` render (spec §20). */
  blocksFinalRender: boolean;
};

/** A single {claim, source, status} entry — the shared shape of both
 *  `document.claims` (author-declared) and `resolvedCatalog.claimResolutions`
 *  (catalog-resolved). Merging both lists is what lets a statement match
 *  either an author-declared claim or a catalog-known one. */
type ClaimLike = { claim: string; source: string; status: ClaimRecord["status"] };

interface ExtractedStatement {
  statement: string;
  sceneId: string;
}

const EMPTY_RESULT: ClaimValidationResult = {
  mappedClaims: [],
  unmappedStatements: [],
  prohibitedClaims: [],
  // No statements were ever checked (either no catalog, or a catalog
  // project with zero narration/caption/text-layer statements) — vacuously
  // "fully covered", nothing to flag.
  coverage: 1,
  blocksFinalRender: false,
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Extracts every product statement from a document in a fixed, documented
 * order (narration, then caption cues, then text-layer content — all
 * per-scene, in scene array order). Deterministic: same input always
 * produces the same statement list in the same order.
 */
function extractStatements(document: VideoProjectDocument): ExtractedStatement[] {
  const statements: ExtractedStatement[] = [];
  for (const scene of document.scenes) {
    if (scene.narration && scene.narration.trim().length > 0) {
      statements.push({ statement: scene.narration.trim(), sceneId: scene.sceneId });
    }
    for (const cue of scene.captionCues) {
      if (cue.text.trim().length > 0) {
        statements.push({ statement: cue.text.trim(), sceneId: scene.sceneId });
      }
    }
    for (const layer of scene.layers) {
      if (layer.type === "text" && layer.content.trim().length > 0) {
        statements.push({ statement: layer.content.trim(), sceneId: scene.sceneId });
      }
    }
  }
  return statements;
}

/**
 * Severity ranking used by {@link findMatchingClaim}'s max-severity-wins tie
 * break (FE01 fix, pre-merge security gate): most to least severe.
 * `prohibited` must never be overridden by any less-severe status matching
 * the same statement.
 */
const CLAIM_STATUS_SEVERITY: Record<ClaimRecord["status"], number> = {
  prohibited: 3,
  unsupported: 2,
  needs_review: 1,
  approved: 0,
};

/**
 * Simple deterministic containment/normalized-equality join (section-06
 * §5.1: "Matching is a simple deterministic containment/normalized-equality
 * join. Do NOT call an LLM here."). Scans every claim in `claims`
 * (document-declared claims first, catalog-resolved claims second — see
 * `validateProjectClaims`) and returns the MOST SEVERE matching claim, not
 * merely the first one encountered (FE01 fix, pre-merge security gate).
 *
 * Root cause this closes: `document.claims` (author-declared, checked first)
 * used to shadow a real catalog-resolved `"prohibited"` claim whenever a
 * project owner added their own claim record with matching text and
 * `status: "approved"` — `blocksFinalRender` would incorrectly become
 * `false` even though the catalog explicitly flagged that exact claim as
 * prohibited. Max-severity-wins means a catalog-sourced `"prohibited"`
 * status can never be overridden by a document-declared `"approved"` claim
 * for the same statement. When two matches tie on severity, the first
 * encountered (in `claims` array order) wins, preserving the original
 * document-before-catalog tie-break for equally-severe matches.
 */
function findMatchingClaim(statement: string, claims: ClaimLike[]): ClaimLike | null {
  const normStatement = normalize(statement);
  if (!normStatement) return null;
  let best: ClaimLike | null = null;
  for (const claim of claims) {
    const normClaim = normalize(claim.claim);
    if (!normClaim) continue;
    if (normStatement.includes(normClaim) || normClaim.includes(normStatement)) {
      if (!best || CLAIM_STATUS_SEVERITY[claim.status] > CLAIM_STATUS_SEVERITY[best.status]) {
        best = claim;
      }
    }
  }
  return best;
}

export function validateProjectClaims(
  document: VideoProjectDocument,
  resolvedCatalog: ResolvedCatalogFacts | null,
): ClaimValidationResult {
  if (resolvedCatalog === null) {
    return EMPTY_RESULT;
  }

  const statements = extractStatements(document);
  if (statements.length === 0) {
    return EMPTY_RESULT;
  }

  // Document-declared claims (`document.claims`) take priority over
  // catalog-resolved ones (`resolvedCatalog.claimResolutions`) when both
  // happen to match — array order below is the tie-break.
  const allClaims: ClaimLike[] = [...document.claims, ...resolvedCatalog.claimResolutions];

  const mappedClaims: ClaimValidationResult["mappedClaims"] = [];
  const unmappedStatements: ClaimValidationResult["unmappedStatements"] = [];
  const prohibitedClaimTexts = new Set<string>();
  const prohibitedClaims: ClaimValidationResult["prohibitedClaims"] = [];

  for (const { statement, sceneId } of statements) {
    const match = findMatchingClaim(statement, allClaims);
    if (!match) {
      unmappedStatements.push({ statement, sceneId });
      continue;
    }
    mappedClaims.push({ statement, sceneId, claim: match.claim, status: match.status });
    if (match.status === "prohibited" && !prohibitedClaimTexts.has(match.claim)) {
      prohibitedClaimTexts.add(match.claim);
      prohibitedClaims.push({ claim: match.claim, status: "prohibited" });
    }
  }

  const coverage = mappedClaims.length / statements.length;
  // Spec §20 hard gate: a prohibited claim OR an unmapped product statement
  // blocks `final` render. Price/promotion staleness (via
  // `resolvedCatalog.priceFacts`) is a fact for the judge, never a hard
  // block here (section-06 §5.1 notes) — Phase 1 does not add a separate
  // price-mismatch field to keep this result's shape exactly as specified.
  const blocksFinalRender = prohibitedClaims.length > 0 || unmappedStatements.length > 0;

  return { mappedClaims, unmappedStatements, prohibitedClaims, coverage, blocksFinalRender };
}
