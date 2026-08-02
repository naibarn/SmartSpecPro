import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertPresetSynthesizerSkillSupportsV2 } from "../verticalDramaPresetSynthesis";

function readSkill(relativePath: string): string {
  const candidates = [
    path.resolve(process.cwd(), "skills/vertical-drama-preset-synthesizer", relativePath),
    path.resolve(process.cwd(), "apps/web/skills/vertical-drama-preset-synthesizer", relativePath),
  ];
  const filePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error(`vertical-drama-preset-synthesizer/${relativePath} not found`);
  }
  return fs.readFileSync(filePath, "utf8");
}

describe("vertical-drama-preset-synthesizer skill — v2 runtime contract", () => {
  it("keeps the loaded skill and its mirror aware of the v2 response mode", () => {
    for (const manifest of ["skill.md", "SKILL.md"]) {
      const content = readSkill(manifest);
      expect(content).toContain("Mix and Match v2");
      expect(content).toContain("contract_version");
      expect(content).toContain("blendFacets");
      expect(content).toContain("presetId");
      expect(content).toContain("kept");
      expect(content).toMatch(/never (?:silently )?downgrade/i);
      expect(content).toContain("Generate from basics");
      expect(content).toMatch(/no preset and no user premise/i);
      expect(content).toContain("Sequel lineage — continuity outranks premise");
      expect(content).toContain("continuation, never an unrelated reboot");
    }
  });

  it("keeps the standalone system prompt aligned with the runtime skill contract", () => {
    const content = readSkill("prompts/system.prompt.md");
    expect(content).toContain("Mix and Match v2");
    expect(content).toContain("contract_version: 2");
    expect(content).toContain("blendFacets");
  });
});

/* -------------------------------------------------------------------------- */
/* titleOptions + locations (Stage 1, `planning/fix-create-series-premise-    */
/* blend/plan-phase2-mode-first.md`)                                         */
/* -------------------------------------------------------------------------- */

describe("vertical-drama-preset-synthesizer skill — titleOptions/locations contract", () => {
  it("(c) assertPresetSynthesizerSkillSupportsV2 still passes against the REAL loaded skill.md and SKILL.md content", () => {
    for (const manifest of ["skill.md", "SKILL.md"]) {
      const content = readSkill(manifest);
      expect(() => assertPresetSynthesizerSkillSupportsV2(content)).not.toThrow();
    }
  });

  it("both files document the new optional titleOptions/locations fields", () => {
    for (const manifest of ["skill.md", "SKILL.md"]) {
      const content = readSkill(manifest);
      expect(content).toContain("titleOptions");
      expect(content).toContain("locations");
      expect(content).toMatch(/4 or 5/);
      expect(content).toMatch(/3 to 6/);
    }
  });

  it("(d) skill.md and SKILL.md stay byte-identical after the titleOptions/locations edit", () => {
    const skillMd = readSkill("skill.md");
    const SKILLMd = readSkill("SKILL.md");
    expect(skillMd).toBe(SKILLMd);
  });
});
