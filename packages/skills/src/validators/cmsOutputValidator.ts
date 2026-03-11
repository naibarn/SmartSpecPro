/**
 * CMS Output Validator — Spec 038
 *
 * Validates LLM outputs against ArticleCMS.v1 and ProductReviewCMS.v1 schemas.
 * Calculates citation coverage for quality gating.
 */

import type {
  ClaimEntry,
  ArticleCMSOutput,
  ProductReviewCMSOutput,
  CmsValidationResult,
} from "../types";

const VALID_IMPORTANCE = ["critical", "major", "minor"] as const;
const VALID_VERIFICATION = ["verified", "partially_verified", "unverified"] as const;
const VALID_SOURCE_TYPES = ["web", "doi", "api", "pdf", "internal_doc"] as const;
const VALID_DISCLOSURE_TYPES = ["none", "affiliate", "sponsored", "provided_for_review"] as const;

/**
 * Calculate citation coverage: fraction of claims at required importance levels
 * that have at least one evidence entry.
 */
export function calculateCitationCoverage(
  claims: ClaimEntry[],
  requiredLevels: string[] = ["critical", "major"]
): number {
  const relevant = claims.filter((c) => requiredLevels.includes(c.importance));
  if (relevant.length === 0) return 1.0; // No required claims → full coverage
  const withEvidence = relevant.filter((c) => c.evidence && c.evidence.length > 0);
  return withEvidence.length / relevant.length;
}

function validateClaims(claims: unknown): { valid: ClaimEntry[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(claims)) {
    return { valid: [], errors: ["claims must be an array"] };
  }

  const validated: ClaimEntry[] = [];
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    if (!c || typeof c !== "object") {
      errors.push(`claims[${i}]: must be an object`);
      continue;
    }
    const claim = c as Record<string, unknown>;
    if (!claim.claim_id || typeof claim.claim_id !== "string") {
      errors.push(`claims[${i}]: missing or invalid claim_id`);
    }
    if (!claim.text || typeof claim.text !== "string") {
      errors.push(`claims[${i}]: missing or invalid text`);
    }
    if (!claim.importance || !(VALID_IMPORTANCE as readonly string[]).includes(String(claim.importance))) {
      errors.push(`claims[${i}]: invalid importance "${claim.importance}"`);
    }
    if (!claim.verification_status || !(VALID_VERIFICATION as readonly string[]).includes(String(claim.verification_status))) {
      errors.push(`claims[${i}]: invalid verification_status "${claim.verification_status}"`);
    }
    if (errors.length === 0) {
      validated.push(claim as unknown as ClaimEntry);
    }
  }

  return { valid: validated, errors };
}

function validateRequiredString(obj: Record<string, unknown>, field: string, errors: string[], prefix = ""): void {
  if (!obj[field] || typeof obj[field] !== "string") {
    errors.push(`${prefix}missing required field: ${field}`);
  }
}

function validateDisclosure(disc: unknown, warnings: string[]): boolean {
  if (!disc || typeof disc !== "object") {
    warnings.push("disclosures: missing or invalid");
    return false;
  }
  const d = disc as Record<string, unknown>;
  if (!d.type || !(VALID_DISCLOSURE_TYPES as readonly string[]).includes(String(d.type))) {
    warnings.push(`disclosures.type: invalid value "${d.type}"`);
    return false;
  }
  return true;
}

/**
 * Validate an ArticleCMS.v1 output.
 */
export function validateArticleCmsOutput(output: unknown): CmsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!output || typeof output !== "object") {
    return {
      valid: false,
      errors: ["output must be an object"],
      warnings: [],
      citation_coverage: 0,
      claims_total: 0,
      claims_with_evidence: 0,
      claims_unverified: 0,
      disclosure_complete: false,
    };
  }

  const o = output as Record<string, unknown>;

  // Required string fields
  for (const field of ["locale", "title", "slug", "body_markdown", "last_verified_at"]) {
    validateRequiredString(o, field, errors);
  }

  // Claims
  const { valid: validClaims, errors: claimErrors } = validateClaims(o.claims);
  errors.push(...claimErrors);

  // Citations (array check only)
  if (o.citations !== undefined && !Array.isArray(o.citations)) {
    errors.push("citations must be an array");
  }

  // Disclosure
  const disclosureComplete = validateDisclosure(o.disclosures, warnings);

  // Calculate coverage
  const coverage = calculateCitationCoverage(validClaims);
  const withEvidence = validClaims.filter((c) => c.evidence && c.evidence.length > 0).length;
  const unverified = validClaims.filter((c) => c.verification_status === "unverified").length;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    citation_coverage: coverage,
    claims_total: validClaims.length,
    claims_with_evidence: withEvidence,
    claims_unverified: unverified,
    disclosure_complete: disclosureComplete,
  };
}

/**
 * Validate a ProductReviewCMS.v1 output.
 */
export function validateProductReviewCmsOutput(output: unknown): CmsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!output || typeof output !== "object") {
    return {
      valid: false,
      errors: ["output must be an object"],
      warnings: [],
      citation_coverage: 0,
      claims_total: 0,
      claims_with_evidence: 0,
      claims_unverified: 0,
      disclosure_complete: false,
    };
  }

  const o = output as Record<string, unknown>;

  // Required string fields
  for (const field of ["locale", "title", "slug", "last_verified_at"]) {
    validateRequiredString(o, field, errors);
  }

  // Product
  if (!o.product || typeof o.product !== "object") {
    errors.push("missing required field: product");
  } else {
    const p = o.product as Record<string, unknown>;
    for (const field of ["brand", "model", "category"]) {
      validateRequiredString(p, field, errors, "product.");
    }
  }

  // Review
  if (!o.review || typeof o.review !== "object") {
    errors.push("missing required field: review");
  } else {
    const r = o.review as Record<string, unknown>;
    for (const field of ["title", "summary", "verdict", "body_markdown"]) {
      validateRequiredString(r, field, errors, "review.");
    }
    if (!Array.isArray(r.pros)) errors.push("review.pros must be an array");
    if (!Array.isArray(r.cons)) errors.push("review.cons must be an array");
    if (!r.scoring || typeof r.scoring !== "object") {
      errors.push("review.scoring is required");
    } else {
      const s = r.scoring as Record<string, unknown>;
      if (typeof s.overall !== "number") errors.push("review.scoring.overall must be a number");
      if (typeof s.max_score !== "number") errors.push("review.scoring.max_score must be a number");
    }
  }

  // Claims
  const { valid: validClaims, errors: claimErrors } = validateClaims(o.claims);
  errors.push(...claimErrors);

  // Citations
  if (o.citations !== undefined && !Array.isArray(o.citations)) {
    errors.push("citations must be an array");
  }

  // Disclosure
  const disclosureComplete = validateDisclosure(o.disclosures, warnings);

  // Coverage
  const coverage = calculateCitationCoverage(validClaims);
  const withEvidence = validClaims.filter((c) => c.evidence && c.evidence.length > 0).length;
  const unverified = validClaims.filter((c) => c.verification_status === "unverified").length;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    citation_coverage: coverage,
    claims_total: validClaims.length,
    claims_with_evidence: withEvidence,
    claims_unverified: unverified,
    disclosure_complete: disclosureComplete,
  };
}
