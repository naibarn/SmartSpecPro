import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseSkillFile, mapCategoryToEnum } from "@smartspec/skills";

const SKILLS_DIR = path.resolve(__dirname, "..", "..", "..", "skills");

const ARTICLE_WRITER_SLUGS = [
  "general-article-writer",
  "business-article-writer",
  "education-article-writer",
  "marketing-article-writer",
  "lifestyle-article-writer",
];

describe("Built-in Article Writer Skills", () => {
  it("all 5 skill.md files exist and are readable", () => {
    for (const slug of ARTICLE_WRITER_SLUGS) {
      const filePath = path.join(SKILLS_DIR, slug, "skill.md");
      expect(fs.existsSync(filePath), `${slug}/skill.md should exist`).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }
  });

  for (const slug of ARTICLE_WRITER_SLUGS) {
    describe(slug, () => {
      const filePath = path.join(SKILLS_DIR, slug, "skill.md");
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = parseSkillFile(content);

      it("parses successfully via parseSkillFile", () => {
        expect(parsed.metadata).toBeDefined();
        expect(parsed.metadata.name).toBeTruthy();
        expect(parsed.content.length).toBeGreaterThan(0);
      });

      it("has execution_mode set to llm-only", () => {
        expect(parsed.metadata.execution_mode).toBe("llm-only");
      });

      it("has category that maps to chat_assistant", () => {
        const mapped = mapCategoryToEnum(parsed.metadata.category);
        expect(mapped).toBe("chat_assistant");
      });

      it("has enabledByDefault set to true", () => {
        expect(parsed.metadata.enabledByDefault).toBe(true);
      });

      it("has a non-empty system prompt in the markdown body", () => {
        expect(parsed.content.length).toBeGreaterThan(50);
      });

      it("has slug matching the directory name", () => {
        expect(parsed.metadata.slug).toBe(slug);
      });
    });
  }

  it("all skill IDs (slugs) are unique", () => {
    const uniqueSlugs = new Set(ARTICLE_WRITER_SLUGS);
    expect(uniqueSlugs.size).toBe(ARTICLE_WRITER_SLUGS.length);
  });
});
