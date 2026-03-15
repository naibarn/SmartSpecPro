import { describe, expect, it } from "vitest";

import {
  deriveBrowserSkillSelection,
} from "./browserSkills";

describe("browser skill selection", () => {
  it("keeps auto-inferred skill selection while the user is typing", () => {
    expect(deriveBrowserSkillSelection({
      draft: "Find the best hotel websites and compare prices",
      currentSkillId: "general_navigation",
      selectionMode: "auto",
    })).toEqual({
      skillId: "compare_options",
      selectionMode: "auto",
    });
  });

  it("preserves a manual skill choice until the draft is cleared", () => {
    expect(deriveBrowserSkillSelection({
      draft: "Find the best hotel websites and compare prices",
      currentSkillId: "web_research",
      selectionMode: "manual",
    })).toEqual({
      skillId: "web_research",
      selectionMode: "manual",
    });

    expect(deriveBrowserSkillSelection({
      draft: "   ",
      currentSkillId: "web_research",
      selectionMode: "manual",
    })).toEqual({
      skillId: "general_navigation",
      selectionMode: "auto",
    });
  });
});
