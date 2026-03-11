import { describe, it, expect } from "vitest";
import { parseSkillFile } from "@smartspec/skills";
import fs from "fs";
import path from "path";

const SKILLS_DIR = path.resolve(__dirname, "../../skills");

const ARTICLE_WRITERS = [
  "general-article-writer",
  "business-article-writer",
  "education-article-writer",
  "lifestyle-article-writer",
  "marketing-article-writer",
  "documentary-script-writer",
  "creative-story-writer",
  "parenting-article-writer",
];

describe("Article writer skills Spec 038 upgrade", () => {
  for (const skill of ARTICLE_WRITERS) {
    describe(skill, () => {
      it("parses frontmatter with execution_policy and content_quality", () => {
        const content = fs.readFileSync(
          path.join(SKILLS_DIR, skill, "skill.md"),
          "utf-8"
        );
        const result = parseSkillFile(content);
        expect(result.metadata.name).toBeTruthy();

        const ep = result.metadata.execution_policy;
        expect(ep).toBeDefined();
        expect(ep!.requires_structured_output).toBe(true);
        expect(ep!.output_format).toBe("cms_article");
        expect(ep!.thinking_level_hint).toBeTruthy();

        const cq = result.metadata.content_quality;
        expect(cq).toBeDefined();
        expect(typeof cq!.min_citation_coverage).toBe("number");

        expect(result.warnings).toBeUndefined();
      });

      it("has valid input schema with response_mode field", () => {
        const schemaPath = path.join(
          SKILLS_DIR, skill, "schemas", "input.schema.json"
        );
        if (!fs.existsSync(schemaPath)) return; // skip if no schema
        const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
        expect(schema.properties.response_mode).toBeDefined();
        expect(schema.properties.response_mode.enum).toContain("cms_json");
        // Default is "markdown" for most, "standard_article" for parenting (backward compat)
        expect(["markdown", "standard_article"]).toContain(schema.properties.response_mode.default);
      });

      it("skill.md contains CMS JSON output section", () => {
        const content = fs.readFileSync(
          path.join(SKILLS_DIR, skill, "skill.md"),
          "utf-8"
        );
        expect(content).toContain("CMS JSON Output Mode");
        expect(content).toContain("ArticleCMS.v1");
      });
    });
  }

  // Special cases
  describe("creative-story-writer special settings", () => {
    it("has requires_web_search=false and min_citation_coverage=0", () => {
      const content = fs.readFileSync(
        path.join(SKILLS_DIR, "creative-story-writer", "skill.md"),
        "utf-8"
      );
      const result = parseSkillFile(content);
      expect(result.metadata.execution_policy!.requires_web_search).toBe(false);
      expect(result.metadata.execution_policy!.requires_citations).toBe(false);
      expect(result.metadata.content_quality!.min_citation_coverage).toBe(0);
    });
  });

  describe("marketing-article-writer special settings", () => {
    it("has disclosure_required=true", () => {
      const content = fs.readFileSync(
        path.join(SKILLS_DIR, "marketing-article-writer", "skill.md"),
        "utf-8"
      );
      const result = parseSkillFile(content);
      expect(result.metadata.content_quality!.disclosure_required).toBe(true);
    });
  });
});
