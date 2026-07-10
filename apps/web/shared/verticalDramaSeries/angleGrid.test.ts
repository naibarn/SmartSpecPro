import { describe, expect, it } from "vitest";
import { angleGridCandidateSchema, angleGridCandidateScoreSchema } from "./angleGrid";

describe("angleGrid schemas", () => {
  it("parses a complete candidate and rejects missing required fields", () => {
    const candidate = {
      index: 0,
      storyFunction: "establishing_context",
      cameraPosition: "high corner",
      shotSize: "wide",
      lensMood: "tense",
      subjectPlacement: "left third",
      foregroundElement: "glass",
      backgroundElement: "boardroom",
      motionPotential: "slow push",
      riskToAvoid: "no text",
    };

    expect(angleGridCandidateSchema.parse(candidate).storyFunction).toBe("establishing_context");
    expect(angleGridCandidateSchema.safeParse({ ...candidate, storyFunction: "pretty" }).success).toBe(false);
    const { riskToAvoid: _dropped, ...missing } = candidate;
    expect(angleGridCandidateSchema.safeParse(missing).success).toBe(false);
  });

  it("requires the six named score dimensions", () => {
    const score = {
      index: 0,
      clarity: 8,
      continuity: 8,
      emotionalPrecision: 8,
      characterIdentitySafety: 8,
      motionPotential: 8,
      productionReadiness: 8,
    };

    expect(angleGridCandidateScoreSchema.safeParse(score).success).toBe(true);
    const { clarity: _dropped, ...missing } = score;
    expect(angleGridCandidateScoreSchema.safeParse(missing).success).toBe(false);
  });
});

