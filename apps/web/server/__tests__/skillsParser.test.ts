import { describe, expect, it } from "vitest";
import { categoryToSkillType, mapCategoryToEnum, normalizeMetadata, parseSkillFile } from "@smartspec/skills";

describe("skills parser", () => {
  it("falls back unknown categories to other", () => {
    expect(mapCategoryToEnum("skill_development")).toBe("other");
    expect(mapCategoryToEnum("totally-unknown")).toBe("other");
  });

  it("treats unknown categories as generic chat skills instead of prompt skills", () => {
    expect(categoryToSkillType("other")).toBe("chat-assistant");
    expect(categoryToSkillType("totally-unknown")).toBe("chat-assistant");
  });

  it("normalizes chainTo from frontmatter metadata", () => {
    const parsed = parseSkillFile(`---
name: Demo
description: Demo skill
category: image_prompt_generation
execution_mode: enhance-prompt
chainTo: image-creator
---

# Demo`);

    const normalized = normalizeMetadata(parsed.metadata, "demo");
    expect(normalized.chainTo).toBe("image-creator");
    expect(normalized.executionMode).toBe("enhance-prompt");
  });
});
