import { describe, expect, it } from "vitest";

import {
  extractKnowledgePreview,
  extractKnowledgePreviewWithQuery,
  getKnowledgeHighlightSegments,
} from "./knowledgePreview";

describe("extractKnowledgePreview", () => {
  it("skips frontmatter and returns summary plus headings", () => {
    const result = extractKnowledgePreview(`---
aliases:
  - Ops Runbook
tags:
  - ops
---

# Incident Runbook

This note explains the escalation path for production incidents and the first checks operators should run.

## Checklist

- Verify queue health
- Verify workers
`);

    expect(result.summary).toContain("escalation path");
    expect(result.headings).toEqual(["Incident Runbook", "Checklist"]);
    expect(result.matchedSnippet).toBeNull();
  });

  it("strips inline markdown noise from the summary", () => {
    const result = extractKnowledgePreview(
      "Review the [deployment guide](https://example.com) and check `worker status` before shipping."
    );

    expect(result.summary).toContain("deployment guide");
    expect(result.summary).not.toContain("[");
    expect(result.summary).not.toContain("`");
  });

  it("extracts a matched snippet when a query is provided", () => {
    const result = extractKnowledgePreviewWithQuery(
      `# Release Gate

The release gate checks production readiness, migration status, and rollback confidence before every rollout.

## Checklist

- Verify migrations
`,
      { query: "migration status" }
    );

    expect(result.matchedSnippet).toContain("migration status");
  });

  it("splits highlight segments for matching preview text", () => {
    const segments = getKnowledgeHighlightSegments(
      "Check migration status before rollout.",
      "migration status"
    );

    expect(segments.some(segment => segment.highlighted)).toBe(true);
    expect(segments.map(segment => segment.text).join("")).toContain("rollout");
  });
});
