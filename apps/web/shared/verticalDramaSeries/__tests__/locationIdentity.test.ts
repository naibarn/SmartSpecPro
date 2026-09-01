import { describe, expect, it } from "vitest";
import {
  findSimilarVerticalDramaLocationCandidates,
  normalizeVerticalDramaLocationName,
  scoreVerticalDramaLocationNameSimilarity,
} from "../locationIdentity";

describe("Vertical Drama location identity", () => {
  it("normalizes Unicode width, dash variants, and whitespace for exact reuse", () => {
    expect(normalizeVerticalDramaLocationName("  ห้องนั่งเล่น—บ้าน  ")).toBe(
      "ห้องนั่งเล่น บ้าน",
    );
    expect(normalizeVerticalDramaLocationName("ＡＢＣ  Room")).toBe("abc room");
    expect(normalizeVerticalDramaLocationName("ร้าน/กาแฟ")).toBe("ร้าน กาแฟ");
  });

  it("scores similar scene labels as advisory candidates without making them exact", () => {
    const incoming = "มุมเล่นพื้นเรียบในห้องนั่งเล่นวันฝนตก";
    const existing = "มุมเล่นเด็กในห้องนั่งเล่นยามฝนตก";

    expect(scoreVerticalDramaLocationNameSimilarity(incoming, incoming)).toBe(1);
    expect(scoreVerticalDramaLocationNameSimilarity(incoming, existing)).toBeGreaterThanOrEqual(0.5);
    expect(normalizeVerticalDramaLocationName(incoming)).not.toBe(
      normalizeVerticalDramaLocationName(existing),
    );
  });

  it("returns bounded, deterministically ordered near-duplicate candidates", () => {
    const candidates = findSimilarVerticalDramaLocationCandidates(
      [
        { locationKey: "z-room", name: "มุมเล่นเด็กในห้องนั่งเล่นยามฝนตก" },
        { locationKey: "a-room", name: "มุมเล่นพื้นเรียบในห้องนั่งเล่นวันฝนตก" },
        { locationKey: "unrelated", name: "สถานีรถไฟ" },
      ],
      "มุมเล่นพื้นเรียบในห้องนั่งเล่นวันฝนตก",
      { limit: 2 },
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.location.locationKey).toBe("a-room");
    expect(candidates[0]?.score).toBe(1);
    expect(candidates.some(candidate => candidate.location.locationKey === "unrelated")).toBe(false);
  });
});
