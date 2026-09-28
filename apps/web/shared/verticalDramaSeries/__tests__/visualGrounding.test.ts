import { describe, expect, it } from "vitest";
import { evaluateVisualGenreGrounding, resolveVisualGroundingContract } from "../visualGrounding";

describe("visual genre grounding", () => {
  it("requires observable science-fiction evidence and a mechanic/cost", () => {
    const contract = resolveVisualGroundingContract({ genreKey: "sci_fi_cyberpunk", mode: "strict_genre" });
    const [missing] = evaluateVisualGenreGrounding([{ episodeNumber: 1, keyBeats: ["They argue in an office."] }], contract);
    expect(missing.passed).toBe(false);
    expect(missing.severity).toBe("blocking");
    const [grounded] = evaluateVisualGenreGrounding([{ episodeNumber: 1, keyBeats: ["The neural interface streams data and overloads at a cost."], genre_evidence: { observed_cues: ["functional future technology"], world_mechanic: "The interface overloads after three minutes", causal_cost: "memory loss" } }], contract);
    expect(grounded.passed).toBe(true);
  });
});
