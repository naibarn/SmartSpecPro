import { describe, expect, it } from "vitest";

import { getLegacySkillSlugAliases, resolveSkillSlugAlias } from "./skillRegistry";

describe("skillRegistry slug aliases", () => {
  it("maps legacy Grok Imagine creator slug to the prompt planner slug", () => {
    expect(resolveSkillSlugAlias("grok-imagine-creator")).toBe("grok-imagine-prompt-planner");
  });

  it("returns canonical slug unchanged when no alias exists", () => {
    expect(resolveSkillSlugAlias("video-prompt-engineer")).toBe("video-prompt-engineer");
  });

  it("lists legacy aliases for the canonical prompt planner slug", () => {
    expect(getLegacySkillSlugAliases("grok-imagine-prompt-planner")).toEqual(["grok-imagine-creator"]);
  });
});
