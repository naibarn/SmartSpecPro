import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSkill(): string {
  const candidates = [
    path.resolve(
      process.cwd(),
      "skills/vertical-drama-special-edition-planner/skill.md"
    ),
    path.resolve(
      process.cwd(),
      "apps/web/skills/vertical-drama-special-edition-planner/skill.md"
    ),
  ];
  const filePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error(
      "vertical-drama-special-edition-planner/skill.md not found"
    );
  }
  return fs.readFileSync(filePath, "utf8");
}

describe("vertical-drama-special-edition-planner skill.md", () => {
  it("loads and declares the output contract fields the plan calls out", () => {
    const content = readSkill();
    expect(content).toContain("contractVersion");
    expect(content).toContain("storyShape");
    expect(content).toContain("episodeBriefs");
    expect(content).toContain("continuityNotes");
    expect(content).toContain("charactersUsed");
  });

  it("declares both story-function choices and their allowed-function mapping", () => {
    const content = readSkill();
    expect(content).toContain('"review"');
    expect(content).toContain('"tie_in_solution"');
    expect(content).toMatch(/soft_cta/);
    expect(content).toMatch(/daily_use/);
    expect(content).toMatch(/plot_clue/);
    expect(content).toMatch(/memory_trigger/);
    expect(content).toMatch(/relationship_token/);
  });

  it("teaches the seamlessness ('เนียน') craft test explicitly", () => {
    const content = readSkill();
    expect(content).toMatch(/เนียน/);
    expect(content).toMatch(/character.*want|want.*character/i);
  });

  it("forbids reopening/advancing the season plot — borrows cast, not arc", () => {
    const content = readSkill();
    expect(content).toMatch(/does not (re-open|reopen)|not to (re-open|reopen)|borrows the cast/i);
    expect(content).toMatch(/not.*re-open.*season|do not re-open/i);
  });

  it("requires respecting the parent's recorded disclosure/knowledge continuity", () => {
    const content = readSkill();
    expect(content).toMatch(/disclosure/i);
    expect(content).toMatch(/secret/i);
    expect(content).toMatch(/characterKnowledge|who-knows-what|who knows what/i);
  });

  it("sizes protagonist_stake/price_paid down for a short special (the 1-episode finale-scaffolding problem)", () => {
    const content = readSkill();
    expect(content).toContain("protagonist_stake");
    expect(content).toContain("price_paid");
    expect(content).toMatch(/small|minor|proportionate/i);
    expect(content).not.toMatch(/if\s*\(.*episodeNumber/i); // no TS-branch language leaking in
  });

  it("explicitly composes with, and does not replace, the product tie-in planner", () => {
    const content = readSkill();
    expect(content).toContain("vertical-drama-product-tie-in-planner");
    expect(content).toMatch(/does not (decide|plan) (shots|placement)|not a replacement/i);
  });
});
