import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseSkillFile, mapCategoryToEnum } from "@smartspec/skills";
import { isExecutionModeCompatibleWithSkillCategory } from "@shared/skills/skillCategoryMetadata";

const SKILLS_DIR = path.resolve(__dirname, "..", "..", "..", "skills");

function getSkillFilePaths(): string[] {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const lower = path.join(SKILLS_DIR, entry.name, "skill.md");
      if (fs.existsSync(lower)) {
        return lower;
      }
      return path.join(SKILLS_DIR, entry.name, "SKILL.md");
    })
    .filter((filePath) => fs.existsSync(filePath));
}

describe("built-in skill metadata", () => {
  const skillFilePaths = getSkillFilePaths();

  it("does not keep legacy unsupported workflow category values", () => {
    const workflowCategoryFiles = skillFilePaths.filter((filePath) => {
      const parsed = parseSkillFile(fs.readFileSync(filePath, "utf-8"));
      return String(parsed.metadata.category || "").trim() === "workflow";
    });

    expect(workflowCategoryFiles).toEqual([]);
  });

  it("keeps supported categories and compatible execution modes for built-in SmartAIHub skills", () => {
    const invalidSkills: string[] = [];

    for (const filePath of skillFilePaths) {
      const parsed = parseSkillFile(fs.readFileSync(filePath, "utf-8"));
      const rawCategory = String(parsed.metadata.category || "").trim();
      if (!rawCategory) {
        continue;
      }

      const normalizedCategory = mapCategoryToEnum(rawCategory);
      if (normalizedCategory === "other" && rawCategory !== "other") {
        invalidSkills.push(`${path.basename(path.dirname(filePath))}: unsupported category '${rawCategory}'`);
        continue;
      }

      const executionMode = String(
        parsed.metadata.execution_mode ?? parsed.metadata.executionMode ?? "llm-only",
      ).trim();
      if (!isExecutionModeCompatibleWithSkillCategory(normalizedCategory, executionMode)) {
        invalidSkills.push(
          `${path.basename(path.dirname(filePath))}: execution_mode '${executionMode}' is not compatible with '${normalizedCategory}'`,
        );
      }
    }

    expect(invalidSkills).toEqual([]);
  });
});
