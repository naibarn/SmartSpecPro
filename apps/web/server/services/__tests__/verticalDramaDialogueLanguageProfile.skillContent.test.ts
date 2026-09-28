import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const skillsRoot = path.resolve(__dirname, "../../../skills");

function readSkill(relativePath: string): string {
  return fs.readFileSync(path.join(skillsRoot, relativePath), "utf8");
}

describe("Vertical Drama dialogue language profile skill contract", () => {
  it("keeps the full-story skill language-neutral and profile-driven", () => {
    const skill = readSkill("vertical-drama-full-story-architect/skill.md");
    const reference = readSkill(
      "vertical-drama-full-story-architect/references/production-grade-vertical-drama.md",
    );

    expect(skill).toContain("DIALOGUE LANGUAGE PROFILE (HARD CONTRACT)");
    expect(skill).toContain("natural contemporary speech");
    expect(skill).not.toContain("All dialogue is\nnatural spoken Thai");
    expect(reference).toContain("### 9.4 Spoken Dialogue Rule");
    expect(reference).not.toContain("### 9.4 Spoken Thai Rule");
  });

  it("keeps both script-builder skill manifests aligned with the profile contract", () => {
    for (const manifest of ["skill.md", "SKILL.md"]) {
      const content = readSkill(`vertical-drama-script-builder/${manifest}`);
      expect(content).toContain("Dialogue language profile — MANDATORY");
      expect(content).toContain("natural contemporary\nAmerican spoken English");
    }
  });

  it("publishes the structured profile fields to the script skill schema", () => {
    const schema = JSON.parse(
      readSkill("vertical-drama-script-builder/schemas/input.schema.json"),
    ) as { properties?: Record<string, { properties?: Record<string, unknown> }> };
      expect(schema.properties?.dialogue_language_profile?.properties).toEqual(
      expect.objectContaining({
        version: expect.any(Object),
        marketMode: expect.any(Object),
        spokenLocale: expect.any(Object),
        resolvedSpokenLocale: expect.any(Object),
      }),
    );
  });

  it("keeps the audio planner from overriding the shared profile with Thai-only rules", () => {
    for (const manifest of ["skill.md", "SKILL.md"]) {
      const content = readSkill(`vertical-drama-dialogue-audio-planner/${manifest}`);
      expect(content).toContain("dialogue language profile");
      expect(content).toContain(
        "Natural contemporary American English, spoken dialogue, not translated English.",
      );
      expect(content).not.toContain("HARD RULE — dialogue must be natural spoken Thai");
    }
    const systemPrompt = readSkill(
      "vertical-drama-dialogue-audio-planner/prompts/system.prompt.md",
    );
    expect(systemPrompt).toContain("DIALOGUE LANGUAGE PROFILE (HARD CONTRACT)");
    expect(systemPrompt).toContain(
      "Natural contemporary American English, spoken dialogue, not translated English.",
    );
  });

  it("publishes the structured profile fields to the audio skill schema", () => {
    const schema = JSON.parse(
      readSkill("vertical-drama-dialogue-audio-planner/schemas/input.schema.json"),
    ) as { properties?: Record<string, { properties?: Record<string, unknown> }> };
      expect(schema.properties?.dialogue_language_profile?.properties).toEqual(
      expect.objectContaining({
        version: expect.any(Object),
        marketMode: expect.any(Object),
        spokenLocale: expect.any(Object),
        resolvedSpokenLocale: expect.any(Object),
      }),
    );
  });
});
