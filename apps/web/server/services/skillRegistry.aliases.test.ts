import { describe, expect, it } from "vitest";

import { getLegacySkillSlugAliases, resolveSkillSlugAlias } from "./skillRegistry";
import { classifySkillReference } from "../../shared/skillReferenceContracts";

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

  it.each([
    ["create-image-prompt", "image_prompt_engineer"],
    ["marketplace-auto-review-director", "media-production-storyboard-planner"],
    ["marketplace-auto-review-verifier", "media-production-plan-verifier"],
    ["vertical-drama-season-critique", "vertical-drama-season-dramaturgy-critic"],
  ])("resolves legacy skill reference %s to %s", (legacySlug, canonicalSlug) => {
    expect(resolveSkillSlugAlias(legacySlug)).toBe(canonicalSlug);
  });

  it("keeps workflow, artifact, and diagnostic references out of executable skill lookup", () => {
    expect(classifySkillReference("auto-draft-presentation")).toBe("workflow");
    expect(classifySkillReference("team-discussion-assistant")).toBe("workflow");
    expect(classifySkillReference("presentation-preview-cache")).toBe("artifact");
    expect(classifySkillReference("debug-evidence-gate")).toBe("diagnostic");
    expect(classifySkillReference("agency-swarm")).toBe("runtime");
    expect(classifySkillReference("image_prompt_engineer")).toBe("executable-skill");
  });
});
