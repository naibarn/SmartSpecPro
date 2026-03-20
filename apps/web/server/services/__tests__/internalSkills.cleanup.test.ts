import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getInternalSkillDefinitions,
  isInternalSkillId,
} from "../internalSkills";

describe("internalSkills — post-migration", () => {
  it("should return empty array from getInternalSkillDefinitions()", () => {
    expect(getInternalSkillDefinitions()).toEqual([]);
  });

  it("should return false from isInternalSkillId for team-discussion-assistant", () => {
    expect(isInternalSkillId("team-discussion-assistant")).toBe(false);
  });

  it("should return false from isInternalSkillId for any string", () => {
    expect(isInternalSkillId("some-skill")).toBe(false);
    expect(isInternalSkillId("")).toBe(false);
  });

  it("should not export TEAM_DISCUSSION_SKILL_ID", () => {
    const sourceFile = path.resolve(__dirname, "../internalSkills.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).not.toContain("TEAM_DISCUSSION_SKILL_ID");
    expect(source).not.toContain("team-discussion-assistant");
  });
});
