import { describe, it, expect } from "vitest";
import { parseSkillFile } from "@smartspec/skills";
import fs from "fs";
import path from "path";

const SKILLS_DIR = path.resolve(__dirname, "../../skills");

const REVIEWER_SKILLS = [
  "electronics-reviewer",
  "beauty-skincare-reviewer",
  "food-grocery-reviewer",
  "fashion-clothing-reviewer",
  "home-appliance-reviewer",
  "household-product-reviewer",
  "baby-kids-reviewer",
  "health-wellness-reviewer",
  "hobby-craft-reviewer",
  "home-decor-textile-reviewer",
  "sports-outdoor-reviewer",
  "pet-products-reviewer",
  "agriculture-garden-reviewer",
  "hardware-renovation-reviewer",
  "real-estate-reviewer",
];

describe("Reviewer skills Spec 038 upgrade", () => {
  for (const skill of REVIEWER_SKILLS) {
    describe(skill, () => {
      it("parses frontmatter with execution_policy and content_quality", () => {
        const content = fs.readFileSync(
          path.join(SKILLS_DIR, skill, "skill.md"),
          "utf-8"
        );
        const result = parseSkillFile(content);
        expect(result.metadata.name).toBeTruthy();

        // execution_policy
        const ep = result.metadata.execution_policy;
        expect(ep).toBeDefined();
        expect(ep!.requires_web_search).toBe(true);
        expect(ep!.requires_citations).toBe(true);
        expect(ep!.requires_structured_output).toBe(true);
        expect(ep!.thinking_level_hint).toBe("medium");
        expect(ep!.output_format).toBe("cms_review");

        // content_quality
        const cq = result.metadata.content_quality;
        expect(cq).toBeDefined();
        expect(cq!.citation_required_for).toEqual(["critical", "major"]);
        expect(cq!.min_citation_coverage).toBe(0.7);
        expect(cq!.disclosure_required).toBe(true);
        expect(cq!.refresh_cadence_days).toBe(30);

        // No warnings
        expect(result.warnings).toBeUndefined();
      });

      it("has valid input schema with response_mode field", () => {
        const schema = JSON.parse(
          fs.readFileSync(
            path.join(SKILLS_DIR, skill, "schemas", "input.schema.json"),
            "utf-8"
          )
        );
        expect(schema.properties.response_mode).toBeDefined();
        expect(schema.properties.response_mode.enum).toContain("cms_json");
        expect(schema.properties.response_mode.default).toBe("markdown");
        expect(schema.properties.disclosure_type).toBeDefined();
        expect(schema.properties.price_thb).toBeDefined();
        expect(schema.properties.price_checked_at).toBeDefined();
      });

      it("skill.md contains CMS JSON output section", () => {
        const content = fs.readFileSync(
          path.join(SKILLS_DIR, skill, "skill.md"),
          "utf-8"
        );
        expect(content).toContain("CMS JSON Output Mode");
        expect(content).toContain("ProductReviewCMS.v1");
      });
    });
  }
});
