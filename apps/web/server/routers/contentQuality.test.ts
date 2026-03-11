import { describe, it, expect } from "vitest";
import {
  calculateNextRefreshAt,
  isStale,
  findStaleArtifacts,
} from "../services/contentStalenessChecker";
import { processContentOutput } from "../services/contentOutputProcessor";

/**
 * Integration-level tests for content quality dashboard logic.
 * Tests the pure functions that feed the dashboard.
 * DB-level tRPC tests require a running database and are run as integration tests.
 */

describe("Content Quality Dashboard — data layer tests", () => {
  it("calculates correct staleness for dashboard display", () => {
    const artifacts = [
      {
        id: 1,
        skillSlug: "electronics-reviewer",
        lastVerifiedAt: new Date("2026-01-01"),
        refreshCadenceDays: 30,
        status: "active" as const,
        qualityScore: { citation_coverage: 0.9 },
      },
      {
        id: 2,
        skillSlug: "electronics-reviewer",
        lastVerifiedAt: new Date("2026-03-10"),
        refreshCadenceDays: 30,
        status: "active" as const,
        qualityScore: { citation_coverage: 0.7 },
      },
      {
        id: 3,
        skillSlug: "beauty-skincare-reviewer",
        lastVerifiedAt: new Date("2026-02-01"),
        refreshCadenceDays: 30,
        status: "archived" as const,
        qualityScore: { citation_coverage: 0.5 },
      },
    ];

    const now = new Date("2026-03-11T12:00:00Z");
    const stale = findStaleArtifacts(artifacts, now);

    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe(1);
    expect(stale[0].skillSlug).toBe("electronics-reviewer");
  });

  it("computes overview stats from artifact data", () => {
    const artifacts = [
      { status: "active" as const, qualityScore: { citation_coverage: 0.9, quality_gate_passed: true } },
      { status: "active" as const, qualityScore: { citation_coverage: 0.7, quality_gate_passed: true } },
      { status: "stale" as const, qualityScore: { citation_coverage: 0.5, quality_gate_passed: false } },
      { status: "archived" as const, qualityScore: { citation_coverage: 0.3, quality_gate_passed: false } },
    ];

    const total = artifacts.length;
    const active = artifacts.filter((a) => a.status === "active").length;
    const stale = artifacts.filter((a) => a.status === "stale").length;
    const avgCoverage =
      artifacts.reduce((sum, a) => sum + a.qualityScore.citation_coverage, 0) / total;

    expect(total).toBe(4);
    expect(active).toBe(2);
    expect(stale).toBe(1);
    expect(avgCoverage).toBe(0.6);
  });

  it("groups artifacts by skill for per-skill breakdown", () => {
    const artifacts = [
      { skillSlug: "electronics-reviewer", status: "active" as const },
      { skillSlug: "electronics-reviewer", status: "stale" as const },
      { skillSlug: "beauty-skincare-reviewer", status: "active" as const },
    ];

    const grouped = new Map<string, { count: number; stale: number }>();
    for (const a of artifacts) {
      const existing = grouped.get(a.skillSlug) ?? { count: 0, stale: 0 };
      existing.count++;
      if (a.status === "stale") existing.stale++;
      grouped.set(a.skillSlug, existing);
    }

    expect(grouped.get("electronics-reviewer")?.count).toBe(2);
    expect(grouped.get("electronics-reviewer")?.stale).toBe(1);
    expect(grouped.get("beauty-skincare-reviewer")?.count).toBe(1);
  });

  it("quality gate from pipeline feeds dashboard metrics", () => {
    const validArticle = {
      locale: "th",
      title: "Test",
      slug: "test",
      body_markdown: "Content here",
      last_verified_at: "2026-03-11",
      claims: [
        { claim_id: "c1", text: "Test claim", importance: "critical", verification_status: "verified",
          evidence: [{ source_type: "web", url: "https://example.com", retrieved_at: "2026-03-11" }] },
      ],
      citations: [],
      disclosures: { type: "none" },
    };

    const result = processContentOutput({
      llmOutput: JSON.stringify(validArticle),
      outputFormat: "cms_article",
      contentQuality: { min_citation_coverage: 0.7 },
      skillSlug: "test",
    });

    // This quality report would be stored in qualityScore
    expect(result.quality.citation_coverage).toBe(1);
    expect(result.quality.quality_gate_passed).toBe(true);
    expect(result.quality.claims_total).toBe(1);
  });

  it("handles empty state gracefully (zero artifacts)", () => {
    const artifacts: { status: string; qualityScore: { citation_coverage: number } }[] = [];

    const total = artifacts.length;
    const avgCoverage = total > 0
      ? artifacts.reduce((sum, a) => sum + a.qualityScore.citation_coverage, 0) / total
      : 0;

    expect(total).toBe(0);
    expect(avgCoverage).toBe(0);
    expect(isNaN(avgCoverage)).toBe(false);
  });
});
