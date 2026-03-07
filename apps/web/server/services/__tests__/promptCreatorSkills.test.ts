import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { mapCategoryToEnum, parseSkillFile } from "@smartspec/skills";

const SKILLS_DIR = path.resolve(__dirname, "..", "..", "..", "skills");

function resolveSkillFilePath(slug: string): string {
  const lowercasePath = path.join(SKILLS_DIR, slug, "skill.md");
  if (fs.existsSync(lowercasePath)) {
    return lowercasePath;
  }
  return path.join(SKILLS_DIR, slug, "SKILL.md");
}

const PROMPT_CREATOR_SKILLS = [
  {
    slug: "image_prompt_engineer",
    expectedCategory: "image_prompt_generation",
    expectedExecutionMode: "enhance-prompt",
  },
  {
    slug: "smart-landscape-designer",
    expectedCategory: "image_prompt_generation",
    expectedExecutionMode: "llm-only",
  },
  {
    slug: "video-prompt-engineer",
    expectedCategory: "video_prompt_generation",
    expectedExecutionMode: "llm-only",
  },
  {
    slug: "video-storyboard-to-prompts",
    expectedCategory: "video_prompt_generation",
    expectedExecutionMode: "llm-only",
  },
  {
    slug: "viral-talking-objects",
    expectedCategory: "video_prompt_generation",
    expectedExecutionMode: "llm-only",
  },
];

describe("Built-in Prompt Creator Skills", () => {
  for (const skillConfig of PROMPT_CREATOR_SKILLS) {
    describe(skillConfig.slug, () => {
      const filePath = resolveSkillFilePath(skillConfig.slug);
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = parseSkillFile(content);

      it("parses successfully", () => {
        expect(fs.existsSync(filePath)).toBe(true);
        expect(parsed.metadata.name).toBeTruthy();
        expect(parsed.content.length).toBeGreaterThan(50);
      });

      it("has the expected prompt-generation category", () => {
        expect(mapCategoryToEnum(parsed.metadata.category)).toBe(skillConfig.expectedCategory);
      });

      it("has the expected execution mode when declared", () => {
        if (!skillConfig.expectedExecutionMode) {
          expect(parsed.metadata.execution_mode ?? parsed.metadata.executionMode).toBeUndefined();
          return;
        }
        expect(parsed.metadata.execution_mode ?? parsed.metadata.executionMode).toBe(
          skillConfig.expectedExecutionMode,
        );
      });
    });
  }
});
