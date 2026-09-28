import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(
  testDir,
  "../../../skills/cinematic-prompt-refiner-pro",
);

function readSkill(name: "SKILL.md" | "skill.md"): string {
  return readFileSync(resolve(skillDir, name), "utf8");
}

describe("cinematic-prompt-refiner-pro provider-safe wording contract", () => {
  it("keeps the uppercase and lowercase skill twins byte-identical", () => {
    expect(readSkill("SKILL.md")).toBe(readSkill("skill.md"));
  });

  it("makes the final provider-safe wording pass part of the skill", () => {
    const skill = readSkill("skill.md");

    expect(skill).toContain("## Final Provider-Safe Wording Pass");
    expect(skill).toContain("exact facial identity");
    expect(skill).toContain("closely matching the attached reference");
    expect(skill).toContain("natural close family framing");
    expect(skill).toContain("Never remove, weaken, or invert a child-safety clause");
    expect(skill).toContain("without a later string replacement");
    expect(skill).toContain("Do not apply this pass mechanically");
    expect(skill).toContain("A semantic-protected identity block is different");
    expect(skill).toContain("Never append\nthe original block after producing");
  });

  it("keeps numeric and shot-format constraints outside the likeness rewrite", () => {
    const skill = readSkill("skill.md");

    expect(skill).toContain("Do not weaken numeric, count, aspect-ratio, or shot");
    expect(skill).toContain("format constraints");
    expect(skill).toContain("Do not remove required characters, props, actions");
  });
});
