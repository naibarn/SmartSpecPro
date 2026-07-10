import { describe, expect, it } from "vitest";
import {
  checkAngleGridDiversity,
  deriveRecommendedAngleIndex,
} from "../verticalDramaAngleGridPlanning";
import type { AngleGridCandidate, AngleGridCandidateScore } from "@shared/verticalDramaSeries/angleGrid";

function candidate(index: number, over: Partial<AngleGridCandidate> = {}): AngleGridCandidate {
  return {
    index,
    storyFunction: "establishing_context",
    cameraPosition: `pos ${index}`,
    shotSize: `size ${index}`,
    lensMood: "tense",
    subjectPlacement: "left",
    foregroundElement: "glass",
    backgroundElement: "office",
    motionPotential: "push",
    riskToAvoid: "text",
    ...over,
  };
}

function score(index: number, total: number): AngleGridCandidateScore {
  return {
    index,
    clarity: total,
    continuity: 1,
    emotionalPrecision: 1,
    characterIdentitySafety: 1,
    motionPotential: 1,
    productionReadiness: 1,
  };
}

describe("checkAngleGridDiversity", () => {
  it("warns when one story function appears more than twice and distinct coverage is too narrow", () => {
    const warnings = checkAngleGridDiversity([
      candidate(0),
      candidate(1),
      candidate(2),
      candidate(3, { storyFunction: "power_shift" }),
    ]);

    expect(warnings.some((w) => w.includes("appears 3 times"))).toBe(true);
    expect(warnings.some((w) => w.includes("distinct storyFunction"))).toBe(true);
  });

  it("warns on near-duplicate framing within the same story function", () => {
    const warnings = checkAngleGridDiversity([
      candidate(0, { cameraPosition: "high", shotSize: "wide" }),
      candidate(1, { cameraPosition: "high", shotSize: "wide" }),
      candidate(2, { storyFunction: "power_shift" }),
      candidate(3, { storyFunction: "choice_moment" }),
      candidate(4, { storyFunction: "threat_presence" }),
      candidate(5, { storyFunction: "mystery_hook" }),
    ]);

    expect(warnings.some((w) => w.includes("repeat the same framing"))).toBe(true);
  });
});

describe("deriveRecommendedAngleIndex", () => {
  it("selects the highest total score", () => {
    expect(
      deriveRecommendedAngleIndex([candidate(0), candidate(1)], [score(0, 2), score(1, 9)]),
    ).toBe(1);
  });

  it("breaks score ties toward less-used story functions", () => {
    const candidates = [
      candidate(0, { storyFunction: "establishing_context" }),
      candidate(1, { storyFunction: "choice_moment" }),
    ];
    expect(
      deriveRecommendedAngleIndex(candidates, [score(0, 8), score(1, 8)], {
        establishing_context: 7,
        choice_moment: 1,
      }),
    ).toBe(1);
  });
});

