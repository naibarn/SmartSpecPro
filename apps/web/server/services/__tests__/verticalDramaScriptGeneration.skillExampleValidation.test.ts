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

  /**
   * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W2,
   * added 2026-07-11) — skill.md's main "Output skeleton" example now
   * includes worked `open_loops[]`/`retention_loop` entries, and the
   * "Product Tie-In" section gained a second worked example (problem→result
   * placement shape). Mirrors both JSON blocks verbatim.
   */
  it("skill.md's new open_loops/retention_loop worked example (from the Output skeleton) validates", () => {
    const example = loadJson("examples/example.output.sample.json") as Record<string, unknown>;
    const withRetentionHooks = {
      ...example,
      open_loops: [
        {
          question: "who tipped the rival's own backers off to call the emergency vote",
          planted_at_beat: 3,
          expected_resolution: "future_episode",
        },
      ],
      retention_loop: {
        type: "threat",
        description:
          "the rival's own backers just called an emergency vote — the reversal Aria pulled off has put his own board on his neck next",
        ties_to_beat: 3,
      },
    };

    const result = scriptBuilderOutputSchema.safeParse(withRetentionHooks);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.open_loops).toHaveLength(1);
      expect(result.data.open_loops![0].expected_resolution).toBe("future_episode");
      expect(result.data.retention_loop?.type).toBe("threat");
    }
  });

  it("skill.md's new problem→result product tie-in worked example validates when spliced into a full script", () => {
    const problemResultTieIn = {
      tie_ins: [
        {
          shot_numbers: [3],
          story_function: "daily_use",
          placement_style: "in_use_moment",
          benefit_talking_point:
            "her hands are visibly chapped from the cold case files, but one pump of the hand cream and she flexes her fingers, ready to keep working",
        },
      ],
    };

    const example = loadJson("examples/example.output.sample.json") as Record<string, unknown>;
    const withProblemResultTieIn = { ...example, product_tie_in_plan: problemResultTieIn };

    expect(() => scriptBuilderOutputSchema.parse(withProblemResultTieIn)).not.toThrow();
  });
});
