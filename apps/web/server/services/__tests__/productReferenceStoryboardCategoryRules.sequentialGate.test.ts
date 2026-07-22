/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 05, closing gap G7 (implementation-gaps.md).
 *
 * `appendProductReferenceStoryboardCategoryRules` was hard-gated to
 * `skillSlug === "product-reference-storyboard"`, so the shared
 * per-category rule library never reached the sequential skill. This suite
 * proves (a) the sequential skill id is now an additive second accepted
 * gate value, reading the SAME shared rule library folder (the sequential
 * skill bundle has no `references/product-categories/` of its own), and
 * (b) the original 3x3 path is byte-identical (same status, same appended
 * text) — the fix must never change 3x3 behavior.
 */
import path from "path";
import { describe, expect, it } from "vitest";

import { appendProductReferenceStoryboardCategoryRules } from "../productReferenceStoryboardCategoryRules";

const CATEGORY_RULE_LIBRARY_DIRS = [
  path.resolve(
    process.cwd(),
    "skills",
    "product-reference-storyboard"
  ),
];

describe("appendProductReferenceStoryboardCategoryRules — G7 sequential gate", () => {
  it("appends the shared furniture category rule file for the sequential skill id", () => {
    const result = appendProductReferenceStoryboardCategoryRules("BASE PROMPT", {
      skillSlug: "product-review-sequential-storyboard",
      skillDirectories: CATEGORY_RULE_LIBRARY_DIRS,
      userInputs: { product_category: "furniture" },
    });

    expect(result.audit.status).toBe("appended");
    expect(result.audit.skillSlug).toBe("product-review-sequential-storyboard");
    expect(result.audit.category).toBe("furniture");
    expect(result.systemPrompt).toContain("BASE PROMPT");
    expect(result.systemPrompt).toContain("Category id: `furniture`");
  });

  it("appends the shared mother_baby category rule file for the sequential skill id", () => {
    const result = appendProductReferenceStoryboardCategoryRules("BASE PROMPT", {
      skillSlug: "product-review-sequential-storyboard",
      skillDirectories: CATEGORY_RULE_LIBRARY_DIRS,
      userInputs: { product_category: "mother_baby" },
    });

    expect(result.audit.status).toBe("appended");
    expect(result.systemPrompt).toContain("Category id: `mother_baby`");
  });

  it("reports missing_category for the sequential skill id when no category is supplied (never blocks the run)", () => {
    const result = appendProductReferenceStoryboardCategoryRules("BASE PROMPT", {
      skillSlug: "product-review-sequential-storyboard",
      skillDirectories: CATEGORY_RULE_LIBRARY_DIRS,
      userInputs: {},
    });

    expect(result.audit.status).toBe("missing_category");
    expect(result.systemPrompt).toBe("BASE PROMPT");
  });

  it("still returns not_applicable for any other skill id (gate stays closed by default)", () => {
    const result = appendProductReferenceStoryboardCategoryRules("BASE PROMPT", {
      skillSlug: "some-unrelated-skill",
      skillDirectories: CATEGORY_RULE_LIBRARY_DIRS,
      userInputs: { product_category: "furniture" },
    });

    expect(result.audit.status).toBe("not_applicable");
    expect(result.systemPrompt).toBe("BASE PROMPT");
  });

  it("regression: the 3x3 path (product-reference-storyboard) is byte-identical to the sequential path for the same category", () => {
    const threeByThree = appendProductReferenceStoryboardCategoryRules(
      "BASE PROMPT",
      {
        skillSlug: "product-reference-storyboard",
        skillDirectories: CATEGORY_RULE_LIBRARY_DIRS,
        userInputs: { product_category: "furniture" },
      }
    );
    const sequential = appendProductReferenceStoryboardCategoryRules(
      "BASE PROMPT",
      {
        skillSlug: "product-review-sequential-storyboard",
        skillDirectories: CATEGORY_RULE_LIBRARY_DIRS,
        userInputs: { product_category: "furniture" },
      }
    );

    expect(sequential.systemPrompt).toBe(threeByThree.systemPrompt);
    expect(sequential.audit.status).toBe(threeByThree.audit.status);
    expect(sequential.audit.category).toBe(threeByThree.audit.category);
  });
});
