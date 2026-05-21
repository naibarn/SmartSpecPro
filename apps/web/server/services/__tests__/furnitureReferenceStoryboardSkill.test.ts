import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const skillDir = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "skills",
  "furniture-reference-storyboard",
);

describe("furniture-reference-storyboard skill contract", () => {
  it("requires Media Studio output to be plain prompt text only", () => {
    const skillContent = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
    const mirroredSkillContent = fs.readFileSync(path.join(skillDir, "skill.md"), "utf-8");
    const outputContract = fs.readFileSync(path.join(skillDir, "references", "output_contract.md"), "utf-8");

    for (const content of [skillContent, mirroredSkillContent, outputContract]) {
      expect(content).toContain("plain prompt text only");
      expect(content).toContain("Do not return JSON");
      expect(content).toContain("directly usable in the Media Studio prompt textarea");
      expect(content).toContain("canvas_9_16_grid_3x3_frame_9_16_exact");
      expect(content).toContain("exactly 9 distinct");
    }

    for (const content of [skillContent, mirroredSkillContent]) {
      expect(content).toContain("contextLength: 1000000");
      expect(content).toContain("allowConversationOverride: false");
      expect(content.length).toBeGreaterThan(50_000);
      expect(content).toContain("Reference Role Disambiguation Rule");
      expect(content).toContain("Forensic Vision Inspection Rule");
      expect(content).toContain("Furniture Geometry And Material Lock");
      expect(content).toContain("Equal-Frame Storyboard Grid Rule");
      expect(content).toContain("Media Studio Maintenance Acceptance Checklist");
      expect(content).toContain("Prompt Quality Loop And Fatal QA Gates");
    }
  });

  it("declares a string output schema instead of a JSON prompt wrapper", () => {
    const outputSchema = JSON.parse(
      fs.readFileSync(path.join(skillDir, "schemas", "output.schema.json"), "utf-8"),
    );

    expect(outputSchema.type).toBe("string");
    expect(JSON.stringify(outputSchema)).not.toContain("\"prompts\"");
    expect(JSON.stringify(outputSchema)).not.toContain("scene_descriptions");
  });
});
