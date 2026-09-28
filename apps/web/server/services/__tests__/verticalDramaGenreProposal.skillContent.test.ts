/**
 * Coverage that `vertical-drama-genre-normalizer/skill.md` actually loads
 * and carries the judgment rules this task depends on (mirrors
 * `verticalDramaPresetSynthesizer.skillContent.test.ts`'s pattern).
 *
 * Deliberately checks the LOWERCASE `skill.md` only — `skillFiles.ts`'s
 * `resolveSkillManifestPath` reads `skill.md` before `SKILL.md`, and this
 * skill folder intentionally has no uppercase twin (see this task's brief:
 * a prior real bug was edits landing in a dead uppercase twin never read by
 * the loader).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSkillMd(): string {
  const candidates = [
    path.resolve(process.cwd(), "skills/vertical-drama-genre-normalizer/skill.md"),
    path.resolve(process.cwd(), "apps/web/skills/vertical-drama-genre-normalizer/skill.md"),
  ];
  const filePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error("vertical-drama-genre-normalizer/skill.md not found");
  }
  return fs.readFileSync(filePath, "utf8");
}

function skillDirHasUppercaseTwin(): boolean {
  const candidates = [
    path.resolve(process.cwd(), "skills/vertical-drama-genre-normalizer/SKILL.md"),
    path.resolve(process.cwd(), "apps/web/skills/vertical-drama-genre-normalizer/SKILL.md"),
  ];
  return candidates.some(candidate => fs.existsSync(candidate));
}

describe("vertical-drama-genre-normalizer skill.md", () => {
  it("has no uppercase SKILL.md twin (avoids the dead-file-edit class of bug)", () => {
    expect(skillDirHasUppercaseTwin()).toBe(false);
  });

  it("defines a genre as a category, not a premise/title/sentence", () => {
    const content = readSkillMd();
    expect(content).toMatch(/genre is a short/i);
    expect(content).toMatch(/NOT/);
    expect(content).toContain("premise");
    expect(content).toContain("logline");
  });

  it("requires the proposal to resolve to the reference vocabulary unless nothing fits, and requires saying so explicitly", () => {
    const content = readSkillMd();
    expect(content).toContain("reference_genre_vocabulary");
    expect(content).toMatch(/MUST resolve to one or two labels/i);
    expect(content).toMatch(/rationale.*MUST say explicitly/is);
  });

  it("caps proposals at 1-2 tags and forbids 3+ comma-joined tags", () => {
    const content = readSkillMd();
    expect(content).toMatch(/1 tag preferred, 2 maximum/i);
    expect(content).toMatch(/never propose three or more/i);
  });

  it("makes the title's declared genre axis outrank setting/occupation", () => {
    const content = readSkillMd();
    expect(content).toMatch(/outranks setting\/occupation/i);
    expect(content).toMatch(/MUST\s+retain that axis/);
    expect(content).toContain("Setting and occupation are flavor, not genre");
  });

  it("includes the worked id-16 café-romance negative example so the axis rule isn't just abstract", () => {
    const content = readSkillMd();
    expect(content).toContain("คาเฟ่ป่วนรัก กับดักพี่ชายตัวแสบ");
    expect(content).toContain("คอมเมดี้ดราม่าธุรกิจท้องถิ่น");
    expect(content).toMatch(/WRONG proposal/);
    expect(content).toMatch(/CORRECT proposal/);
    expect(content).toMatch(/discards "รัก" entirely/);
  });

  it("can say the current genre is already fine and should be kept", () => {
    const content = readSkillMd();
    expect(content).toContain('"keep"');
    expect(content).toMatch(/already a real, genre-shaped/i);
  });

  it("requires grounding the proposal in the story, not just the title", () => {
    const content = readSkillMd();
    expect(content).toMatch(/title alone is thin evidence/i);
    expect(content).toContain("episode_samples");
  });

  it("declares the JSON output contract with contract_version/decision/proposed_genre/rationale", () => {
    const content = readSkillMd();
    expect(content).toContain("contract_version");
    expect(content).toContain('"decision"');
    expect(content).toContain("proposed_genre");
    expect(content).toContain("rationale");
  });
});
