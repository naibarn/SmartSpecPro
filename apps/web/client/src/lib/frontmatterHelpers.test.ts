import { describe, expect, it } from "vitest";

import {
  ensureFrontmatterAliases,
  ensureFrontmatterProperty,
  ensureFrontmatterTags,
  ensureKnowledgeFrontmatter,
} from "./frontmatterHelpers";

describe("frontmatterHelpers", () => {
  it("creates a knowledge frontmatter block when missing", () => {
    const result = ensureKnowledgeFrontmatter("# Hello");

    expect(result).toContain("aliases:");
    expect(result).toContain("tags:");
    expect(result).toContain("owner:");
    expect(result).toContain("# Hello");
  });

  it("does not duplicate an existing aliases field", () => {
    const result = ensureFrontmatterAliases(`---
aliases:
  - Existing
---

# Hello`);

    expect(result.match(/^aliases:/gm)?.length ?? 0).toBe(1);
  });

  it("merges missing fields into partial frontmatter", () => {
    const result = ensureKnowledgeFrontmatter(`---
aliases:
  - Existing
---

Body`);

    expect(result.match(/^aliases:/gm)?.length ?? 0).toBe(1);
    expect(result).toContain("tags:");
    expect(result).toContain("owner:");
    expect(result).toContain("status:");
  });

  it("adds tags and scalar properties into existing frontmatter", () => {
    const result = ensureFrontmatterProperty(
      ensureFrontmatterTags(`---
aliases:
  - Existing
---

Body`),
      "reviewer",
    );

    expect(result).toContain("tags:");
    expect(result).toContain("reviewer:");
  });
});
