import { describe, expect, it } from "vitest";
import {
  verticalDramaCharacterTypedDataSchema,
  verticalDramaCharacterVisualBibleSchema,
} from "./characterProfile";
import { verticalDramaConsistencyLedgerSchema } from "./consistencyLedger";

const VISUAL_BIBLE = {
  createdAt: "2026-07-09T00:00:00.000Z",
  model: "test",
  visualIdentitySummary: "sharp office lead",
  identityAnchors: ["round glasses"],
  signatureWardrobe: "navy blazer",
  hairMakeupNotes: "short bob",
  performanceEnergy: "tense",
  consistencyStrategy: "keep glasses and blazer",
  signatureVisualCues: ["round glasses"],
  colorPalette: "navy silver",
  storyWorldRelationship: "corporate thriller",
  forbiddenDrift: ["teen styling"],
  emotionalRangeNeeded: ["neutral", "fear"],
  ageRange: "30s",
};

describe("verticalDramaCharacterProfile schemas", () => {
  it("parses a persisted visual bible with all base and F132 fields", () => {
    const parsed = verticalDramaCharacterVisualBibleSchema.parse(VISUAL_BIBLE);
    expect(parsed.version).toBe(1);
    expect(parsed.signatureWardrobe).toBe("navy blazer");
  });

  it("composes personality, speechProfile, visualBible, and consistencyLedger", () => {
    const parsed = verticalDramaCharacterTypedDataSchema.parse({
      personality: {
        keywords: ["guarded"],
        emotionalBaseline: "controlled",
        want: "win the board vote",
        fear: "exposure",
        contradiction: "protects people by lying",
      },
      speechProfile: {
        speakingSpeed: "normal",
        vocabularyLevel: "everyday",
        emotionalDefault: "dry",
        typicalSentenceLength: "short",
        metaphorUsage: "none",
        commonLineFunction: "deflect",
      },
      visualBible: VISUAL_BIBLE,
      consistencyLedger: verticalDramaConsistencyLedgerSchema.parse({
        anchorAssetId: "asset-1",
        entries: [{ assetId: "asset-1", generatedAt: "now", issues: [], verdict: "ok" }],
      }),
    });

    expect(parsed.visualBible?.colorPalette).toBe("navy silver");
    expect(parsed.consistencyLedger?.entries).toHaveLength(1);
  });
});

