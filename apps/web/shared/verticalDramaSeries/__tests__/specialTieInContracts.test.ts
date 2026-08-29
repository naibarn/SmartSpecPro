import { describe, expect, it } from "vitest";
import { resolveVerticalDramaEpisodeShotContract, specialTieInInputSchema } from "../specialTieInContracts";
const validInput = { idea: "A woman demonstrates a teal shampoo bottle in a bright bathroom.", referenceType: "product" as const, referenceImages: [{ mediaAssetId: "asset-1", source: "upload" as const }], imageModelId: "tie-in-image", videoModelId: "tie-in-video", dialogueMode: "none" as const };
describe("special tie-in contracts", () => {
  it("accepts 12 seconds and strict 9:16", () => { const parsed = specialTieInInputSchema.parse({ ...validInput, durationSeconds: 12 }); expect(parsed.durationSeconds).toBe(12); expect(parsed.aspectRatio).toBe("9:16"); });
  it("enforces bounded idea and references", () => { expect(() => specialTieInInputSchema.parse({ ...validInput, idea: "x".repeat(5_001) })).toThrow(); expect(() => specialTieInInputSchema.parse({ ...validInput, referenceImages: [] })).toThrow(); expect(() => specialTieInInputSchema.parse({ ...validInput, referenceImages: Array.from({ length: 4 }, (_, index) => ({ mediaAssetId: `asset-${index}`, source: "upload" })) })).toThrow(); });
  it("keeps normal shape and resolves special cardinality without padding", () => { expect(resolveVerticalDramaEpisodeShotContract("normal")).toEqual({ kind: "normal", shotCount: 9, clipCount: 8, fixedNormalShape: true }); expect(resolveVerticalDramaEpisodeShotContract("special_tie_in", 3)).toEqual({ kind: "special_tie_in", shotCount: 3, clipCount: 3, fixedNormalShape: false }); });
});
