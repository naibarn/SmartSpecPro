import { describe, it, expect } from "vitest";
import {
  validateArticleCmsOutput,
  validateProductReviewCmsOutput,
  calculateCitationCoverage,
} from "@smartspec/skills";
import type { ClaimEntry } from "@smartspec/skills";

function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "ArticleCMS.v1",
    locale: "th",
    title: "ทดสอบบทความ",
    slug: "test-article",
    body_markdown: "# Test\n\nContent here.",
    claims: [],
    citations: [],
    last_verified_at: "2026-03-01T00:00:00Z",
    disclosures: { type: "none" },
    ...overrides,
  };
}

function makeReview(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "ProductReviewCMS.v1",
    locale: "th",
    title: "รีวิวสินค้า",
    slug: "test-review",
    product: { brand: "TestBrand", model: "X100", category: "electronics" },
    review: {
      title: "รีวิว TestBrand X100",
      summary: "สินค้าดี",
      verdict: "แนะนำ",
      pros: ["เร็ว", "สวย"],
      cons: ["แพง"],
      body_markdown: "# Review\n\nContent.",
      scoring: { overall: 8.5, max_score: 10, rubric: [] },
    },
    claims: [],
    citations: [],
    last_verified_at: "2026-03-01T00:00:00Z",
    disclosures: { type: "none" },
    ...overrides,
  };
}

function makeClaim(overrides: Partial<ClaimEntry> = {}): ClaimEntry {
  return {
    claim_id: "c1",
    text: "Test claim",
    importance: "critical",
    verification_status: "verified",
    last_verified_at: "2026-03-01T00:00:00Z",
    evidence: [{ source_type: "web", title: "Source", retrieved_at: "2026-03-01T00:00:00Z" }],
    ...overrides,
  };
}

describe("validateArticleCmsOutput", () => {
  it("validates a valid ArticleCMS output", () => {
    const result = validateArticleCmsOutput(makeArticle());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports missing required field", () => {
    const { title, ...article } = makeArticle();
    const result = validateArticleCmsOutput(article);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
  });

  it("reports invalid claim importance", () => {
    const result = validateArticleCmsOutput(
      makeArticle({
        claims: [{ claim_id: "c1", text: "Test", importance: "trivial", verification_status: "verified", last_verified_at: "2026-03-01T00:00:00Z", evidence: [] }],
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("importance"))).toBe(true);
  });

  it("handles empty claims array (valid)", () => {
    const result = validateArticleCmsOutput(makeArticle({ claims: [] }));
    expect(result.valid).toBe(true);
    expect(result.citation_coverage).toBe(1.0);
  });

  it("reports non-object output", () => {
    const result = validateArticleCmsOutput("not an object");
    expect(result.valid).toBe(false);
  });

  it("warns on missing disclosure", () => {
    const result = validateArticleCmsOutput(makeArticle({ disclosures: undefined }));
    expect(result.disclosure_complete).toBe(false);
  });
});

describe("validateProductReviewCmsOutput", () => {
  it("validates a valid ProductReviewCMS output", () => {
    const result = validateProductReviewCmsOutput(makeReview());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports missing product", () => {
    const { product, ...review } = makeReview();
    const result = validateProductReviewCmsOutput(review);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("product"))).toBe(true);
  });

  it("reports missing review", () => {
    const { review, ...rest } = makeReview();
    const result = validateProductReviewCmsOutput(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("review"))).toBe(true);
  });

  it("reports missing scoring", () => {
    const r = makeReview();
    delete (r.review as Record<string, unknown>).scoring;
    const result = validateProductReviewCmsOutput(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("scoring"))).toBe(true);
  });
});

describe("calculateCitationCoverage", () => {
  it("returns 1.0 for empty claims", () => {
    expect(calculateCitationCoverage([])).toBe(1.0);
  });

  it("returns 1.0 when all claims are minor (not required)", () => {
    const claims = [
      makeClaim({ claim_id: "c1", importance: "minor", evidence: [] }),
      makeClaim({ claim_id: "c2", importance: "minor", evidence: [] }),
    ];
    expect(calculateCitationCoverage(claims)).toBe(1.0);
  });

  it("returns 0.75 for 3/4 critical claims with evidence", () => {
    const claims = [
      makeClaim({ claim_id: "c1", importance: "critical", evidence: [{ source_type: "web", title: "S1", retrieved_at: "2026-03-01T00:00:00Z" }] }),
      makeClaim({ claim_id: "c2", importance: "critical", evidence: [{ source_type: "web", title: "S2", retrieved_at: "2026-03-01T00:00:00Z" }] }),
      makeClaim({ claim_id: "c3", importance: "critical", evidence: [{ source_type: "web", title: "S3", retrieved_at: "2026-03-01T00:00:00Z" }] }),
      makeClaim({ claim_id: "c4", importance: "critical", evidence: [] }),
    ];
    expect(calculateCitationCoverage(claims)).toBe(0.75);
  });

  it("includes major claims in coverage calculation", () => {
    const claims = [
      makeClaim({ claim_id: "c1", importance: "major", evidence: [{ source_type: "web", title: "S", retrieved_at: "2026-03-01T00:00:00Z" }] }),
      makeClaim({ claim_id: "c2", importance: "major", evidence: [] }),
    ];
    expect(calculateCitationCoverage(claims)).toBe(0.5);
  });

  it("respects custom required levels", () => {
    const claims = [
      makeClaim({ claim_id: "c1", importance: "minor", evidence: [] }),
    ];
    // Only "minor" is required
    expect(calculateCitationCoverage(claims, ["minor"])).toBe(0);
  });
});
