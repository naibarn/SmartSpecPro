import { describe, it, expect } from "vitest";
import { parseSkillFile, parseExecutionPolicyContentFields, parseContentQuality } from "@smartspec/skills";

describe("parseSkillFile — Spec 038 frontmatter fields", () => {
  it("parses frontmatter with all Spec 038 execution_policy fields", () => {
    const content = `---
name: test-skill
category: product_review
execution_policy:
  requires_web_search: true
  requires_citations: true
  requires_structured_output: true
  thinking_level_hint: high
  output_format: cms_review
  max_tokens_hint: 8000
---
# Test Skill`;

    const result = parseSkillFile(content);
    expect(result.metadata.name).toBe("test-skill");
    const ep = result.metadata.execution_policy!;
    expect(ep.requires_web_search).toBe(true);
    expect(ep.requires_citations).toBe(true);
    expect(ep.requires_structured_output).toBe(true);
    expect(ep.thinking_level_hint).toBe("high");
    expect(ep.output_format).toBe("cms_review");
    expect(ep.max_tokens_hint).toBe(8000);
    expect(result.warnings).toBeUndefined();
  });

  it("parses frontmatter with content_quality fields", () => {
    const content = `---
name: review-skill
content_quality:
  citation_required_for:
    - critical
    - major
  min_citation_coverage: 0.7
  disclosure_required: true
  refresh_cadence_days: 30
---
# Review Skill`;

    const result = parseSkillFile(content);
    const cq = result.metadata.content_quality!;
    expect(cq.citation_required_for).toEqual(["critical", "major"]);
    expect(cq.min_citation_coverage).toBe(0.7);
    expect(cq.disclosure_required).toBe(true);
    expect(cq.refresh_cadence_days).toBe(30);
    expect(result.warnings).toBeUndefined();
  });

  it("parses frontmatter with partial Spec 038 fields", () => {
    const content = `---
name: partial-skill
execution_policy:
  requires_web_search: true
content_quality:
  min_citation_coverage: 0.5
---
# Partial`;

    const result = parseSkillFile(content);
    expect(result.metadata.execution_policy!.requires_web_search).toBe(true);
    expect(result.metadata.execution_policy!.requires_citations).toBeUndefined();
    expect(result.metadata.content_quality!.min_citation_coverage).toBe(0.5);
    expect(result.metadata.content_quality!.citation_required_for).toBeUndefined();
  });

  it("parses legacy frontmatter without new fields (backward compatible)", () => {
    const content = `---
name: legacy-skill
category: chat_assistant
priority: 50
---
# Legacy Skill`;

    const result = parseSkillFile(content);
    expect(result.metadata.name).toBe("legacy-skill");
    expect(result.metadata.execution_policy).toBeUndefined();
    expect(result.metadata.content_quality).toBeUndefined();
    expect(result.warnings).toBeUndefined();
  });

  it("produces warnings for invalid thinking_level_hint", () => {
    const content = `---
name: bad-hint
execution_policy:
  thinking_level_hint: extreme
---
# Bad Hint`;

    const result = parseSkillFile(content);
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain("Invalid thinking_level_hint");
  });

  it("produces warnings for invalid output_format", () => {
    const content = `---
name: bad-format
execution_policy:
  output_format: html
---
# Bad Format`;

    const result = parseSkillFile(content);
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain("Invalid output_format");
  });

  it("produces warnings for invalid citation_required_for values", () => {
    const content = `---
name: bad-citation
content_quality:
  citation_required_for:
    - critical
    - trivial
---
# Bad Citation`;

    const result = parseSkillFile(content);
    expect(result.metadata.content_quality!.citation_required_for).toEqual(["critical"]);
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain("Invalid citation_required_for");
  });

  it("produces warnings for out-of-range min_citation_coverage", () => {
    const content = `---
name: bad-coverage
content_quality:
  min_citation_coverage: 1.5
---
# Bad Coverage`;

    const result = parseSkillFile(content);
    expect(result.metadata.content_quality).toBeUndefined();
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain("min_citation_coverage");
  });

  it("handles both execution_policy and content_quality together", () => {
    const content = `---
name: full-skill
execution_policy:
  mode: requirements
  requires_web_search: true
  requires_citations: true
  thinking_level_hint: medium
  output_format: cms_article
  requirements:
    supportsWebSearch: true
content_quality:
  citation_required_for:
    - critical
    - major
  min_citation_coverage: 0.6
  disclosure_required: false
  refresh_cadence_days: 30
---
# Full Skill`;

    const result = parseSkillFile(content);
    const ep = result.metadata.execution_policy!;
    expect(ep.mode).toBe("requirements");
    expect(ep.requires_web_search).toBe(true);
    expect(ep.requirements?.supportsWebSearch).toBe(true);

    const cq = result.metadata.content_quality!;
    expect(cq.citation_required_for).toEqual(["critical", "major"]);
    expect(cq.min_citation_coverage).toBe(0.6);
    expect(cq.disclosure_required).toBe(false);
    expect(result.warnings).toBeUndefined();
  });
});

describe("parseExecutionPolicyContentFields", () => {
  it("returns undefined for undefined input", () => {
    expect(parseExecutionPolicyContentFields(undefined)).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(parseExecutionPolicyContentFields({})).toBeUndefined();
  });

  it("parses valid fields", () => {
    const result = parseExecutionPolicyContentFields({
      requires_web_search: true,
      thinking_level_hint: "low",
      output_format: "markdown",
    });
    expect(result).toEqual({
      requires_web_search: true,
      thinking_level_hint: "low",
      output_format: "markdown",
    });
  });

  it("coerces booleans", () => {
    const result = parseExecutionPolicyContentFields({
      requires_web_search: 1,
      requires_citations: 0,
    });
    expect(result!.requires_web_search).toBe(true);
    expect(result!.requires_citations).toBe(false);
  });
});

describe("parseContentQuality", () => {
  it("returns undefined quality for undefined input", () => {
    const { quality } = parseContentQuality(undefined);
    expect(quality).toBeUndefined();
  });

  it("returns undefined quality for empty object", () => {
    const { quality } = parseContentQuality({});
    expect(quality).toBeUndefined();
  });

  it("parses all valid fields", () => {
    const { quality, warnings } = parseContentQuality({
      citation_required_for: ["critical", "minor"],
      min_citation_coverage: 0.8,
      disclosure_required: true,
      refresh_cadence_days: 60,
    });
    expect(quality).toEqual({
      citation_required_for: ["critical", "minor"],
      min_citation_coverage: 0.8,
      disclosure_required: true,
      refresh_cadence_days: 60,
    });
    expect(warnings).toHaveLength(0);
  });

  it("filters invalid citation levels with warning", () => {
    const { quality, warnings } = parseContentQuality({
      citation_required_for: ["critical", "unknown"],
    });
    expect(quality!.citation_required_for).toEqual(["critical"]);
    expect(warnings).toHaveLength(1);
  });

  it("rejects min_citation_coverage > 1", () => {
    const { quality, warnings } = parseContentQuality({
      min_citation_coverage: 2.0,
    });
    expect(quality).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it("rejects negative min_citation_coverage", () => {
    const { quality, warnings } = parseContentQuality({
      min_citation_coverage: -0.1,
    });
    expect(quality).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});
