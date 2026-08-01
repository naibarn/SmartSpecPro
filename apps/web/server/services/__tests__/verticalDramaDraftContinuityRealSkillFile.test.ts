import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const skillsRoot = resolve(__dirname, "../../../skills");

describe("identity-safe drafting guidance real skill files", () => {
  it("keeps storyboard guidance conditional, advisory, and twin-synced", () => {
    const dir = resolve(skillsRoot, "vertical-drama-storyboard-shotgrid");
    const lower = readFileSync(resolve(dir, "skill.md"), "utf8");
    const upper = readFileSync(resolve(dir, "SKILL.md"), "utf8");
    expect(lower).toBe(upper);
    expect(lower).toContain(
      "## Identity-safe shot boundaries — MANDATORY when the caller states `identity_safe_shot_boundaries: REQUIRED`",
    );
    expect(lower).toContain("nothing here is code-validated");
    expect(lower).toContain("variety applies between scenes, not within one continuous scene.");
  });

  it("keeps full-story guidance under craft without inventing an uppercase twin", () => {
    const dir = resolve(skillsRoot, "vertical-drama-full-story-architect");
    const lower = readFileSync(resolve(dir, "skill.md"), "utf8");
    const hard = lower.indexOf("## Hard requirements");
    const craft = lower.indexOf("## Craft requirements");
    const guidance = lower.indexOf("## Identity-safe shot boundaries");
    expect(existsSync(resolve(dir, "SKILL.md"))).toBe(false);
    expect(hard).toBeGreaterThanOrEqual(0);
    expect(craft).toBeGreaterThan(hard);
    expect(guidance).toBeGreaterThan(craft);
    expect(lower.slice(guidance)).toContain("nothing here is code-validated");
  });

  it("documents the scene-continuity image label as reference, not composition", () => {
    const dir = resolve(skillsRoot, "vertical-drama-shot-start-frame-render");
    const lower = readFileSync(resolve(dir, "skill.md"), "utf8");
    const upper = readFileSync(resolve(dir, "SKILL.md"), "utf8");
    expect(lower).toBe(upper);
    expect(lower).toContain("scene_continuity_reference: attached");
    expect(lower).toContain(
      "Scene continuity reference (shot N): same scene, same lighting, same set",
    );
    expect(lower).toMatch(/it is not the\s+new shot's composition/);
  });
});
