import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
    }
  });

  it("keeps the standalone system prompt aligned with the runtime skill contract", () => {
    const content = readSkill("prompts/system.prompt.md");
    expect(content).toContain("Mix and Match v2");
    expect(content).toContain("contract_version: 2");
    expect(content).toContain("blendFacets");
  });
});
