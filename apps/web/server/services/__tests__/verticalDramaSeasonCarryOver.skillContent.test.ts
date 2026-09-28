import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSkill(): string {
  const candidates = [
    path.resolve(
      process.cwd(),
      "skills/vertical-drama-season-carry-over-planner/skill.md"
    ),
    path.resolve(
      process.cwd(),
      "apps/web/skills/vertical-drama-season-carry-over-planner/skill.md"
    ),
  ];
  const filePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error(
      "vertical-drama-season-carry-over-planner/skill.md not found"
    );
  }
  return fs.readFileSync(filePath, "utf8");
}

describe("vertical-drama-season-carry-over-planner skill.md", () => {
  it("loads and declares the exact availability vocabulary the service's zod schema enforces", () => {
    const content = readSkill();
    expect(content).toContain("returns_with_explanation");
    expect(content).toContain("write_out");
    expect(content).toContain("cameo_only");
    expect(content).toContain("characterKey");
    expect(content).toContain("contract_version");
    expect(content).toContain("conditionally required");
    expect(content).toContain("never return an empty string");
  });

  it("carries the four judgment rules the project brief calls out explicitly", () => {
    const content = readSkill();
    // A returning villain must be EARNED, not free.
    expect(content).toMatch(/earn|justif/i);
    // Death is final for the character, presence-in-flashback is not.
    expect(content).toMatch(/flashback/i);
    // The new season needs a genuinely new conflict, not a re-run.
    expect(content).toMatch(/new conflict|rerun|re-run/i);
    // undeclared relationships are an opportunity, not left inert.
    expect(content).toContain("undeclared");
  });

  it("does NOT ask the model to produce carriedRelationships/carriedThreads (those are a deterministic TS copy)", () => {
    const content = readSkill();
    expect(content).not.toContain('"carriedRelationships"');
    expect(content).not.toContain('"carriedThreads"');
  });
});
