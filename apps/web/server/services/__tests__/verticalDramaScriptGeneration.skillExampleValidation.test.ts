/**
 * Confirms `skills/vertical-drama-script-builder/skill.md`'s worked examples
 * actually validate against the output contract — the same root-cause class
 * as the `repair_queue`/`storyboard_handoff_json` incidents fixed earlier
 * this session (an empty/placeholder example is the proven cause of a skill
 * never reliably producing a field; this test guards against skill.md's
 * examples drifting out of shape from the schema without anyone noticing).
 *
 * Covers Phase 5 (Tier 5) of
 * `planning/vertical-drama-skill-first-architecture/plan.md`: skill.md's new
 * "Product Tie-In" section adds a worked example showing a POPULATED
 * `product_tie_in_plan.tie_ins[]` entry (the shipped full example in
 * `examples/example.output.sample.json` and skill.md's main output skeleton
 * both only ever showed the empty `{ tie_ins: [], note: "..." }` shape).
 *
 * Validates against BOTH:
 *  - `scriptBuilderOutputSchema` (the zod schema `verticalDramaScriptGeneration.ts`
 *    actually runs at generation time — this file's own comment says it
 *    "mirrors schemas/output.schema.json's REQUIRED fields");
 *  - `schemas/output.schema.json`'s own top-level `required` list, read
 *    directly from disk so this test stays honest if that list changes.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { scriptBuilderOutputSchema } from "../verticalDramaScriptGeneration";

const SKILL_DIR = path.join(__dirname, "..", "..", "..", "skills", "vertical-drama-script-builder");

function loadJson(relPath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(SKILL_DIR, relPath), "utf-8"));
}

describe("vertical-drama-script-builder skill.md examples validate against the output contract", () => {
  it("examples/example.output.sample.json validates against scriptBuilderOutputSchema", () => {
    const example = loadJson("examples/example.output.sample.json");
    expect(() => scriptBuilderOutputSchema.parse(example)).not.toThrow();
  });

  it("examples/example.output.sample.json carries every field schemas/output.schema.json marks required", () => {
    const example = loadJson("examples/example.output.sample.json") as Record<string, unknown>;
    const outputSchema = loadJson("schemas/output.schema.json") as { required: string[] };

    for (const field of outputSchema.required) {
      expect(example).toHaveProperty(field);
    }
  });

  it("skill.md's new populated product_tie_in_plan.tie_ins worked example validates when spliced into a full script", () => {
    // Mirrors skill.md's "Product Tie-In" -> "Worked example — a populated
    // placement" JSON block verbatim.
    const populatedTieIn = {
      tie_ins: [
        {
          shot_numbers: [2, 6],
          story_function: "daily_use",
          placement_style: "in_use_moment",
          benefit_talking_point:
            "the serum absorbs fast enough that Aria can apply it between meetings without smudging her makeup",
        },
      ],
    };

    const example = loadJson("examples/example.output.sample.json") as Record<string, unknown>;
    const withPopulatedTieIn = { ...example, product_tie_in_plan: populatedTieIn };

    expect(() => scriptBuilderOutputSchema.parse(withPopulatedTieIn)).not.toThrow();

    const parsed = scriptBuilderOutputSchema.parse(withPopulatedTieIn) as {
      product_tie_in_plan: {
        tie_ins: Array<{
          shot_numbers: number[];
          story_function: string;
          placement_style: string;
          benefit_talking_point: string;
        }>;
      };
    };
    const [tieIn] = parsed.product_tie_in_plan.tie_ins;
    expect(Array.isArray(tieIn.shot_numbers)).toBe(true);
    expect(tieIn.shot_numbers.every(n => Number.isInteger(n))).toBe(true);
    expect(["hero_prop", "background", "in_use_moment"]).toContain(tieIn.placement_style);
    expect(tieIn.story_function).toBe("daily_use");
    expect(typeof tieIn.benefit_talking_point).toBe("string");
  });

  it("fixtures/pass.output.json (the shipped pass fixture) validates against scriptBuilderOutputSchema", () => {
    const passOutput = loadJson("fixtures/pass.output.json");
    expect(() => scriptBuilderOutputSchema.parse(passOutput)).not.toThrow();
  });
});
