import { describe, it, expect } from "vitest";
import { processContentOutput } from "./contentOutputProcessor";

const validArticle = {
  locale: "th",
  title: "ทดสอบบทความ เรื่องการทดสอบ",
  slug: "test-article",
  body_markdown: "# Test Article\n\nThis is a test article body with enough content to test SEO generation.",
  last_verified_at: "2026-03-11T00:00:00Z",
  claims: [
    {
      claim_id: "c1",
      text: "This product has excellent battery life and performance benchmarks",
      importance: "critical",
      verification_status: "verified",
      evidence: [{ source_type: "web", url: "https://example.com/source1", retrieved_at: "2026-03-11T00:00:00Z" }],
    },
    {
      claim_id: "c2",
      text: "The design is compact and lightweight for everyday use",
      importance: "major",
      verification_status: "verified",
      evidence: [{ source_type: "web", url: "https://example.com/source2", retrieved_at: "2026-03-11T00:00:00Z" }],
    },
  ],
  citations: [{ citation_id: "cit1", url: "https://example.com/source1", title: "Source 1", source_type: "web", accessed_at: "2026-03-11" }],
  disclosures: { type: "none" },
};

const validReview = {
  locale: "th",
  title: "รีวิวโทรศัพท์ Samsung Galaxy S26",
  slug: "samsung-galaxy-s26-review",
  last_verified_at: "2026-03-11T00:00:00Z",
  product: { brand: "Samsung", model: "Galaxy S26", category: "smartphone" },
  review: {
    title: "Samsung Galaxy S26 Review",
    summary: "A comprehensive review of the Samsung Galaxy S26 flagship smartphone with detailed analysis.",
    verdict: "Excellent phone",
    body_markdown: "# Review content",
    pros: ["Great camera", "Fast performance"],
    cons: ["Expensive", "No headphone jack"],
    scoring: { overall: 8.5, max_score: 10, dimensions: [] },
  },
  claims: [
    {
      claim_id: "c1",
      text: "The camera sensor captures excellent low light photos",
      importance: "critical",
      verification_status: "verified",
      evidence: [{ source_type: "web", url: "https://example.com/camera", retrieved_at: "2026-03-11" }],
    },
  ],
  citations: [],
  disclosures: { type: "provided_for_review" },
};

describe("processContentOutput", () => {
  it("processes valid CMS article JSON", () => {
    const result = processContentOutput({
      llmOutput: JSON.stringify(validArticle),
      outputFormat: "cms_article",
      skillSlug: "test-article-writer",
    });
    expect(result.format).toBe("cms_article");
    expect(result.quality.quality_gate_passed).toBe(true);
    expect(result.quality.claims_total).toBe(2);
    expect(result.quality.claims_with_evidence).toBe(2);
    expect(result.quality.citation_coverage).toBe(1);
    expect(result.quality.errors).toHaveLength(0);
  });

  it("processes valid CMS review JSON", () => {
    const result = processContentOutput({
      llmOutput: JSON.stringify(validReview),
      outputFormat: "cms_review",
      skillSlug: "test-reviewer",
    });
    expect(result.format).toBe("cms_review");
    expect(result.quality.quality_gate_passed).toBe(true);
    expect(result.quality.claims_total).toBe(1);
  });

  it("handles invalid JSON from LLM gracefully", () => {
    const result = processContentOutput({
      llmOutput: "This is not valid JSON at all",
      outputFormat: "cms_article",
      skillSlug: "test",
    });
    expect(result.quality.quality_gate_passed).toBe(false);
    expect(result.quality.errors).toContain("Failed to parse LLM output as JSON");
    expect(typeof result.content).toBe("string");
  });

  it("extracts JSON from markdown code fences", () => {
    const fenced = "```json\n" + JSON.stringify(validArticle) + "\n```";
    const result = processContentOutput({
      llmOutput: fenced,
      outputFormat: "cms_article",
      skillSlug: "test",
    });
    expect(result.quality.quality_gate_passed).toBe(true);
    expect(result.quality.errors).toHaveLength(0);
  });

  it("quality gate fails when coverage below threshold", () => {
    const article = {
      ...validArticle,
      claims: [
        { claim_id: "c1", text: "Unverified claim", importance: "critical", verification_status: "unverified" },
        { claim_id: "c2", text: "Another unverified claim", importance: "major", verification_status: "unverified" },
      ],
    };
    const result = processContentOutput({
      llmOutput: JSON.stringify(article),
      outputFormat: "cms_article",
      contentQuality: { min_citation_coverage: 0.7 },
      skillSlug: "test",
    });
    expect(result.quality.citation_coverage).toBe(0);
    expect(result.quality.quality_gate_passed).toBe(false);
  });

  it("quality gate passes when coverage meets threshold", () => {
    const result = processContentOutput({
      llmOutput: JSON.stringify(validArticle),
      outputFormat: "cms_article",
      contentQuality: { min_citation_coverage: 0.7 },
      skillSlug: "test",
    });
    expect(result.quality.citation_coverage).toBe(1);
    expect(result.quality.quality_gate_passed).toBe(true);
  });

  it("generates SEO metadata when missing", () => {
    const result = processContentOutput({
      llmOutput: JSON.stringify(validArticle),
      outputFormat: "cms_article",
      skillSlug: "test",
    });
    const content = result.content as Record<string, unknown>;
    const seo = content.seo as Record<string, unknown>;
    expect(seo.meta_title).toBeTruthy();
    expect(seo.meta_description).toBeTruthy();
    expect(result.quality.seo_complete).toBe(true);
  });

  it("passes through markdown unchanged", () => {
    const md = "# My Article\n\nSome content here.";
    const result = processContentOutput({
      llmOutput: md,
      outputFormat: "markdown",
      skillSlug: "test",
    });
    expect(result.content).toBe(md);
    expect(result.format).toBe("markdown");
    expect(result.quality.quality_gate_passed).toBe(true);
    expect(result.quality.claims_total).toBe(0);
  });

  it("matches extracted citations to claims without evidence", () => {
    const article = {
      ...validArticle,
      claims: [
        {
          claim_id: "c1",
          text: "The battery performance benchmark scores are excellent with long lasting results",
          importance: "critical",
          verification_status: "verified",
          // no evidence
        },
      ],
    };
    const result = processContentOutput({
      llmOutput: JSON.stringify(article),
      outputFormat: "cms_article",
      extractedCitations: [
        {
          url: "https://example.com/battery-test",
          title: "Battery Performance Benchmark Results for Long Lasting Devices",
          snippet: "Excellent battery benchmark scores",
          provider: "openai",
        },
      ],
      skillSlug: "test",
    });
    const content = result.content as Record<string, unknown>;
    const claims = content.claims as Array<{ evidence?: unknown[] }>;
    expect(claims[0].evidence).toBeDefined();
    expect(claims[0].evidence!.length).toBeGreaterThan(0);
  });
});
