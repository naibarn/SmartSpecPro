import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const skillDir = path.resolve(process.cwd(), "skills/vertical-drama-draft-quality-controller");

describe("vertical-drama-draft-quality-controller skill", () => {
  it("keeps the paired skill docs aligned and judge/revise responsibilities explicit", () => {
    const skill = fs.readFileSync(path.join(skillDir, "skill.md"), "utf8");
    const mirror = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
    expect(skill).toBe(mirror);
    expect(skill).toContain("evaluate");
    expect(skill).toContain("revise");
    expect(skill).toMatch(/Spoken-language profile is[\s\S]*only for dialogue\/audio downstream/);
    expect(skill).toContain("long_form_sustainability");
    expect(skill).toContain("allowlisted `storyDesign`");
    expect(skill).toContain("Do not add or change unknown");
  });

  it("contains strict mode-specific schemas and all prompt files", () => {
    expect(JSON.parse(fs.readFileSync(path.join(skillDir, "schemas/input.schema.json"), "utf8"))).toBeTruthy();
    expect(JSON.parse(fs.readFileSync(path.join(skillDir, "schemas/output.schema.json"), "utf8"))).toBeTruthy();
    expect(fs.existsSync(path.join(skillDir, "prompts/evaluate.system.prompt.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "prompts/revise.system.prompt.md"))).toBe(true);
  });
});
