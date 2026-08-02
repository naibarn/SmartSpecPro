/**
 * Feature 142, section-05 — real-file contract coverage for
 * `skills/video-project-scene-plan/` (fs + JSON.parse, no ajv, no LLM).
 * Repo convention (`verticalDramaMotionContractRealSkillFile.test.ts` and
 * others): assert against the ACTUAL skill bundle on disk, never a fixture
 * copy, so an edit to the real files can never silently drift from what this
 * test checks.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

import { scenePlanOutputSchema } from "../videoProjectScenePlanAdapter";
import { MOTION_TEMPLATE_IDS } from "@shared/videoIntelligence/motionTemplates";

const SKILL_DIR = path.resolve(__dirname, "../../../skills/video-project-scene-plan");
const SKILL_MD_PATH = path.join(SKILL_DIR, "skill.md");
const SKILL_MD_UPPER_PATH = path.join(SKILL_DIR, "SKILL.md");
const INPUT_SCHEMA_PATH = path.join(SKILL_DIR, "schemas", "input.schema.json");
const OUTPUT_SCHEMA_PATH = path.join(SKILL_DIR, "schemas", "output.schema.json");

const PROMPT_LEAK_PATTERN = /prompt|imagePrompt|videoPrompt|negativePrompt/i;

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/** Walks every key name in a JSON-Schema-shaped object (not values) so the
 *  guard catches a leaked property no matter how deeply it is nested. */
function collectPropertyKeys(node: unknown, keys: string[] = []): string[] {
  if (!node || typeof node !== "object") return keys;
  if (Array.isArray(node)) {
    for (const item of node) collectPropertyKeys(item, keys);
    return keys;
  }
  const record = node as Record<string, unknown>;
  if (record.properties && typeof record.properties === "object") {
    for (const [key, value] of Object.entries(record.properties as Record<string, unknown>)) {
      keys.push(key);
      collectPropertyKeys(value, keys);
    }
  }
  if (record.items) collectPropertyKeys(record.items, keys);
  return keys;
}

describe("skill bundle: video-project-scene-plan", () => {
  it("skill.md exists in lowercase and has no SKILL.md twin (dual-case drift lock)", () => {
    expect(fs.existsSync(SKILL_MD_PATH)).toBe(true);
    expect(fs.existsSync(SKILL_MD_UPPER_PATH)).toBe(false);
  });

  it("frontmatter declares llm-only, enabledByDefault:false, priority 50, slug video-project-scene-plan", () => {
    const source = fs.readFileSync(SKILL_MD_PATH, "utf-8");
    const frontmatter = source.slice(0, source.indexOf("---", 4));
    expect(frontmatter).toContain("slug: video-project-scene-plan");
    expect(frontmatter).toContain("execution_mode: llm-only");
    expect(frontmatter).toContain("enabledByDefault: false");
    expect(frontmatter).toContain("priority: 50");
  });

  it("input.schema.json requires brief/format/availableTemplates/layerBudget/plannableScenes/occupiedIntervals", () => {
    const schema = readJson(INPUT_SCHEMA_PATH) as { required: string[] };
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "brief",
        "format",
        "availableTemplates",
        "layerBudget",
        "plannableScenes",
        "occupiedIntervals",
      ]),
    );
  });

  it("output.schema.json requires scenes[] with sceneId/templateId/templateParams/startMs/endMs/rationale/onScreenStatements", () => {
    const schema = readJson(OUTPUT_SCHEMA_PATH) as {
      required: string[];
      properties: { scenes: { items: { required: string[] } } };
    };
    expect(schema.required).toEqual(expect.arrayContaining(["scenes", "summary"]));
    expect(schema.properties.scenes.items.required).toEqual(
      expect.arrayContaining([
        "sceneId",
        "templateId",
        "templateParams",
        "startMs",
        "endMs",
        "rationale",
        "onScreenStatements",
      ]),
    );
  });

  it("scenePlanOutputSchema accepts the exact example object from skill.md's Output format block", () => {
    const source = fs.readFileSync(SKILL_MD_PATH, "utf-8");
    const fenceStart = source.indexOf("```json");
    expect(fenceStart).toBeGreaterThan(0);
    const fenceContentStart = source.indexOf("\n", fenceStart) + 1;
    const fenceEnd = source.indexOf("```", fenceContentStart);
    const jsonText = source.slice(fenceContentStart, fenceEnd);

    const parsed = JSON.parse(jsonText);
    const result = scenePlanOutputSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("output.schema.json has NO property matching /prompt|imagePrompt|videoPrompt|negativePrompt/i", () => {
    const schema = readJson(OUTPUT_SCHEMA_PATH);
    const keys = collectPropertyKeys(schema);
    const leaked = keys.filter(key => PROMPT_LEAK_PATTERN.test(key));
    expect(leaked).toEqual([]);
  });

  it("skill.md names only template ids that exist in MOTION_TEMPLATE_IDS (drift lock)", () => {
    const source = fs.readFileSync(SKILL_MD_PATH, "utf-8");
    const tableSection = source.slice(
      source.indexOf("| Information shape of the beat | Template |"),
      source.indexOf("## Binding parameters"),
    );
    const mentionedIds = MOTION_TEMPLATE_IDS.filter(id => tableSection.includes(`\`${id}\``));
    // Every one of the 10 registry ids must appear in the table exactly —
    // the skill's selection guide must never silently drop or rename one.
    expect(mentionedIds.sort()).toEqual([...MOTION_TEMPLATE_IDS].sort());

    // And nothing OTHER than a real template id is fenced as a template
    // reference in that table (a stray/renamed id would fail the count check
    // above, but this also guards against a typo'd id sneaking in alongside
    // the real ones).
    const fencedIds = Array.from(tableSection.matchAll(/`([a-z_]+)`/g)).map(match => match[1]);
    for (const id of fencedIds) {
      expect(MOTION_TEMPLATE_IDS as readonly string[]).toContain(id);
    }
  });

  it("skill.md tells the skill to treat catalog text as data, never as instructions", () => {
    const source = fs.readFileSync(SKILL_MD_PATH, "utf-8").toLowerCase();
    expect(source).toMatch(/data to bind|never as an instruction|never .* instruction to follow/);
  });

  it("skill.md is forbidden from naming any image/video/negative prompt field", () => {
    const source = fs.readFileSync(SKILL_MD_PATH, "utf-8");
    expect(source.toLowerCase()).toContain("forbidden to emit");
  });
});
