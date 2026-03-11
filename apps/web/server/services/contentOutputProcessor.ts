/**
 * Content Output Processor — Spec 038 Section 05
 *
 * Post-processing pipeline: parse LLM output → validate CMS schema →
 * match citations to claims → quality gate → SEO metadata.
 */

import type {
  ArticleCMSOutput,
  ProductReviewCMSOutput,
  SkillContentQuality,
  ClaimEntry,
} from "@smartspec/skills";
import {
  validateArticleCmsOutput,
  validateProductReviewCmsOutput,
  calculateCitationCoverage,
} from "@smartspec/skills";
import type { ExtractedCitation } from "./citationExtractor";
import {
  generateProductReviewJsonLd,
  generateArticleJsonLd,
} from "./jsonLdGenerator";

export interface ContentProcessingInput {
  llmOutput: string;
  outputFormat: "cms_article" | "cms_review" | "markdown";
  extractedCitations?: ExtractedCitation[];
  contentQuality?: SkillContentQuality;
  skillSlug: string;
}

export interface QualityReport {
  citation_coverage: number;
  claims_total: number;
  claims_with_evidence: number;
  claims_unverified: number;
  quality_gate_passed: boolean;
  seo_complete: boolean;
  errors: string[];
  warnings: string[];
}

export interface ContentProcessingResult {
  content: ArticleCMSOutput | ProductReviewCMSOutput | string;
  quality: QualityReport;
  format: "cms_article" | "cms_review" | "markdown";
}

/**
 * Main pipeline: process LLM output into validated CMS content with quality report.
 */
export function processContentOutput(
  input: ContentProcessingInput
): ContentProcessingResult {
  if (input.outputFormat === "markdown") {
    return {
      content: input.llmOutput,
      quality: {
        citation_coverage: 1,
        claims_total: 0,
        claims_with_evidence: 0,
        claims_unverified: 0,
        quality_gate_passed: true,
        seo_complete: false,
        errors: [],
        warnings: [],
      },
      format: "markdown",
    };
  }

  // Step 1: Parse JSON from LLM output
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(input.llmOutput);
  } catch {
    return {
      content: input.llmOutput,
      quality: {
        citation_coverage: 0,
        claims_total: 0,
        claims_with_evidence: 0,
        claims_unverified: 0,
        quality_gate_passed: false,
        seo_complete: false,
        errors: ["Failed to parse LLM output as JSON"],
        warnings: [],
      },
      format: input.outputFormat,
    };
  }

  // Step 2: Validate against CMS schema
  const validation =
    input.outputFormat === "cms_article"
      ? validateArticleCmsOutput(parsed)
      : validateProductReviewCmsOutput(parsed);

  // Step 3: Match extracted citations to claims
  if (input.extractedCitations?.length && Array.isArray(parsed.claims)) {
    matchCitationsToClaims(
      parsed.claims as ClaimEntry[],
      input.extractedCitations
    );
  }

  // Step 4: Quality gate
  const requiredLevels = input.contentQuality?.citation_required_for ?? [
    "critical",
    "major",
  ];
  const coverage = Array.isArray(parsed.claims)
    ? calculateCitationCoverage(parsed.claims as ClaimEntry[], requiredLevels)
    : 0;
  const minCoverage = input.contentQuality?.min_citation_coverage ?? 0.6;
  const gatePass =
    validation.valid && coverage >= minCoverage;

  // Step 5: SEO metadata
  const seoComplete = ensureSeoMetadata(parsed);

  // Step 6: JSON-LD structured data
  try {
    if (input.outputFormat === "cms_review" && !parsed.structured_data_jsonld) {
      parsed.structured_data_jsonld = generateProductReviewJsonLd(
        parsed as unknown as ProductReviewCMSOutput
      );
    } else if (input.outputFormat === "cms_article" && !parsed.structured_data_jsonld) {
      parsed.structured_data_jsonld = generateArticleJsonLd(
        parsed as unknown as ArticleCMSOutput
      );
    }
  } catch {
    // JSON-LD generation is non-critical — don't fail the pipeline
  }

  return {
    content: parsed as ArticleCMSOutput | ProductReviewCMSOutput,
    quality: {
      citation_coverage: coverage,
      claims_total: validation.claims_total,
      claims_with_evidence: validation.claims_with_evidence,
      claims_unverified: validation.claims_unverified,
      quality_gate_passed: gatePass,
      seo_complete: seoComplete,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    format: input.outputFormat,
  };
}

/**
 * Extract JSON from LLM output, handling markdown code fences.
 */
function extractJson(raw: string): Record<string, unknown> {
  let text = raw.trim();
  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  return JSON.parse(text);
}

/**
 * Match extracted web search citations to claims that lack evidence.
 */
function matchCitationsToClaims(
  claims: ClaimEntry[],
  citations: ExtractedCitation[]
): void {
  for (const claim of claims) {
    if (claim.evidence && claim.evidence.length > 0) continue;
    // Simple text overlap matching: find citations whose title/snippet overlaps with claim text
    const matched = citations.filter((c) => {
      const claimWords = claim.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const citText = `${c.title} ${c.snippet ?? ""}`.toLowerCase();
      const overlap = claimWords.filter((w) => citText.includes(w));
      return overlap.length >= Math.min(3, claimWords.length * 0.3);
    });
    if (matched.length > 0) {
      claim.evidence = matched.map((c) => ({
        source_type: "web" as const,
        url: c.url,
        retrieved_at: new Date().toISOString(),
      }));
    }
  }
}

/**
 * Ensure SEO metadata exists. Returns true if complete.
 */
function ensureSeoMetadata(parsed: Record<string, unknown>): boolean {
  if (!parsed.seo || typeof parsed.seo !== "object") {
    parsed.seo = {};
  }
  const seo = parsed.seo as Record<string, unknown>;
  const title = String(parsed.title ?? "");

  if (!seo.meta_title && title) {
    seo.meta_title = title.length > 60 ? title.slice(0, 57) + "..." : title;
  }
  if (!seo.meta_description) {
    const body = String(
      (parsed as any).body_markdown ??
        (parsed as any).review?.summary ??
        ""
    );
    if (body) {
      seo.meta_description =
        body.length > 160 ? body.slice(0, 157) + "..." : body;
    }
  }
  if (!seo.keywords && title) {
    seo.keywords = title
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
      .slice(0, 10);
  }

  return !!(seo.meta_title && seo.meta_description);
}
