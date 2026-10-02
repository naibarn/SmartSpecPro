import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseSkillFile } from "@smartspec/skills";
import { dbSkillToDefinition } from "../skillRegistry";

/**
 * Regression coverage for the `config:` frontmatter round-trip.
 *
 * The sync path writes `metadata.config` into `skills.configJson`, but the read
 * path (`dbSkillToDefinition`) never mapped it back onto `SkillDefinition.config`
 * — so `skill.config` was `undefined` for every registry-loaded skill and any
 * authored `config:` block was dead weight at runtime.
 *
 * These tests pin the full path: real skill.md on disk -> parseSkillFile ->
 * configJson column -> SkillDefinition.config.
 */

const SKILLS_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "skills");

/** Minimal non-media row; `image_prompt_generation` maps to `prompt-enhancement`,
 *  which keeps the media-model branches of the mapper out of these assertions. */
function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "test-skill",
    name: "Test Skill",
    description: "fixture",
    category: "image_prompt_generation",
    icon: null,
    isAutoTrigger: false,
    triggerPatterns: null,
    isEnabled: true,
    enabledByDefault: true,
    creditMultiplier: "1.0",
    priority: 50,
    availableModels: null,
    defaultModel: null,
    systemPrompt: null,
    skillContent: null,
    folderPath: null,
    executionMode: null,
    chainTo: null,
    ...overrides,
  } as Parameters<typeof dbSkillToDefinition>[0];
}

/** Parse a real skill.md from disk exactly the way autoSyncSkillsFromFolder does. */
function authoredConfigFor(slug: string): Record<string, unknown> | undefined {
  const file = path.join(SKILLS_DIR, slug, "skill.md");
  const parsed = parseSkillFile(fs.readFileSync(file, "utf-8"));
  return parsed.metadata.config as Record<string, unknown> | undefined;
}

describe("dbSkillToDefinition — configJson round-trip", () => {
  it("maps configJson back onto SkillDefinition.config", () => {
    const authored = authoredConfigFor("product-reference-storyboard");

    // Guard: if the skill file ever loses its config block the round-trip
    // assertion below would pass vacuously.
    expect(authored).toBeDefined();
    expect(authored).toHaveProperty("media_studio");

    const definition = dbSkillToDefinition(
      baseRow({ slug: "product-reference-storyboard", configJson: authored }),
    );

    expect(definition.config).toEqual(authored);
  });

  it("delivers the authored auto_learning values, not just a truthy object", () => {
    const authored = authoredConfigFor("product-reference-storyboard") as any;
    const autoLearning = authored?.media_studio?.auto_learning;

    // These are the values Feature 136's gap report called out as ignored.
    expect(autoLearning).toMatchObject({
      enabled: true,
      prompt_qa_after_auto_prompt: true,
      image_qa_after_generation: true,
      min_prompt_score_to_pass: 88,
      min_image_fidelity_score_to_pass: 84,
      max_auto_patch_risk: "medium",
    });

    const definition = dbSkillToDefinition(
      baseRow({ slug: "product-reference-storyboard", configJson: authored }),
    );

    expect((definition.config as any).media_studio.auto_learning).toEqual(autoLearning);
  });

  it("round-trips every on-disk skill that declares a config block", () => {
    const slugs = fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((slug) => fs.existsSync(path.join(SKILLS_DIR, slug, "skill.md")));

    const withConfig = slugs
      .map((slug) => ({ slug, config: authoredConfigFor(slug) }))
      .filter((entry) => entry.config !== undefined);

    // Sanity check on the sweep itself — the platform ships many such skills.
    expect(withConfig.length).toBeGreaterThan(10);

    for (const { slug, config } of withConfig) {
      const definition = dbSkillToDefinition(baseRow({ slug, configJson: config }));
      expect(definition.config, `config dropped for skill '${slug}'`).toEqual(config);
    }
  });
});

describe("dbSkillToDefinition — skills without a config block", () => {
  it("leaves config undefined when the column is NULL", () => {
    const definition = dbSkillToDefinition(baseRow({ configJson: null }));
    expect(definition.config).toBeUndefined();
    expect("config" in definition).toBe(true);
  });

  it("leaves config undefined when the column is absent entirely", () => {
    const definition = dbSkillToDefinition(baseRow());
    expect(definition.config).toBeUndefined();
  });

  it("does not invent config for a real skill whose frontmatter declares none", () => {
    const slugs = fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((slug) => fs.existsSync(path.join(SKILLS_DIR, slug, "skill.md")));

    const withoutConfig = slugs.find((slug) => authoredConfigFor(slug) === undefined);
    expect(withoutConfig, "expected at least one shipped skill with no config block").toBeDefined();

    const definition = dbSkillToDefinition(
      baseRow({ slug: withoutConfig!, configJson: authoredConfigFor(withoutConfig!) }),
    );
    expect(definition.config).toBeUndefined();
  });
});
