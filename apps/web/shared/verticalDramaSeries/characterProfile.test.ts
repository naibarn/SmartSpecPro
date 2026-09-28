import { describe, expect, it } from "vitest";
import {
  verticalDramaApprovedCharacterDesignSnapshotSchema,
  verticalDramaCharacterDesignContextSchema,
  verticalDramaCharacterDesignDnaSchema,
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

const DESIGN_DNA = {
  version: 1,
  designIntent: "A grounded support character with a memorable silhouette.",
  seriesDnaAlignment: ["grounded legal thriller"],
  roleTier: "support",
  beautyArchetype: "approachable realism",
  ageRange: "30s",
  faceIdentity: {
    facialGeometry: "soft-square face",
    eyesAndGaze: "steady gaze",
    brows: "straight brows",
    nose: "rounded tip",
    lipsAndSmile: "asymmetric smile",
    skinAndTexture: "visible natural texture",
    hair: "short black hair",
    distinctiveAsymmetry: "slightly higher left brow",
  },
  bodyLanguage: {
    posture: "upright but relaxed",
    gesturePattern: "small precise gestures",
    movementRhythm: "measured",
    tensionTell: "thumb presses index finger",
  },
  recallStack: {
    face: "higher left brow",
    silhouette: "narrow jacket",
    color: "ink navy",
    behavior: "still hands",
    emotionalHook: "quiet loyalty",
  },
  costumeGrammar: "precise professional layers",
  publicMask: "calm competence",
  hiddenTruth: "fears being overlooked",
  narrativePromise: "will choose loyalty over comfort",
  attractiveContradiction: "warm face, forensic gaze",
  forbiddenDrift: ["generic luxury styling"],
  antiCloneChecks: {
    distinctFacialDimensions: ["face shape", "brow line", "mouth asymmetry"],
    distinctHairDimensions: ["length", "part"],
    distinctBodyLanguageDimensions: ["gesture pattern", "movement rhythm"],
    signatureDifference: "oxidized-gold pin",
  },
  scores: {
    storyFit: 8,
    screenPresence: 8,
    emotionalReadability: 8,
    ensembleContrast: 8,
    crossSeriesUniqueness: 12,
    thresholdStatus: "provisional",
    rationale: "The design is grounded and distinct within the ensemble.",
  },
  comparisonEvidence: {
    candidateDirectionCount: 3,
    currentCastCompared: 2,
    recentSeriesCompared: 1,
    priorLeadDnaCompared: 0,
    historyCompleteness: "partial",
  },
};

describe("verticalDramaCharacterProfile schemas", () => {
  it("validates a complete story-grounded character DNA record", () => {
    const parsed = verticalDramaCharacterDesignDnaSchema.parse({
      version: 1,
      designIntent: "A reassuring public defender whose guarded eyes reveal private guilt.",
      seriesDnaAlignment: ["grounded legal thriller", "restrained Bangkok old-money world"],
      roleTier: "lead_female",
      beautyArchetype: "approachable authority",
      ageRange: "early 30s",
      faceIdentity: {
        facialGeometry: "soft-square face, high cheekbones, compact chin",
        eyesAndGaze: "steady almond eyes with a delayed vulnerable blink",
        brows: "straight dense brows with a slight inner lift",
        nose: "low straight bridge with a rounded tip",
        lipsAndSmile: "defined upper lip, asymmetric closed-mouth smile",
        skinAndTexture: "warm medium skin, real pores, faint under-eye texture",
        hair: "collarbone-length black hair, restrained side part",
        distinctiveAsymmetry: "left brow sits slightly higher",
      },
      bodyLanguage: {
        posture: "upright but never rigid",
        gesturePattern: "keeps hands still until challenged",
        movementRhythm: "measured, then suddenly decisive",
        tensionTell: "thumb presses against index finger",
      },
      recallStack: {
        face: "higher left brow and delayed blink",
        silhouette: "clean long blazer over narrow trousers",
        color: "ink navy with one oxidized-gold accent",
        behavior: "still hands before decisive movement",
        emotionalHook: "competence shielding guilt",
      },
      costumeGrammar: "precise professional layers softened by one inherited accessory",
      publicMask: "calm competence",
      hiddenTruth: "fears she protected the wrong client",
      narrativePromise: "will choose between reputation and justice",
      attractiveContradiction: "warm face, forensic gaze",
      forbiddenDrift: ["generic luxury CEO styling", "porcelain skin retouching"],
      antiCloneChecks: {
        distinctFacialDimensions: ["face shape", "brow line", "mouth asymmetry"],
        distinctHairDimensions: ["length", "part"],
        distinctBodyLanguageDimensions: ["gesture pattern", "movement rhythm"],
        signatureDifference: "oxidized-gold heirloom pin",
      },
      scores: {
        storyFit: 9,
        screenPresence: 9,
        emotionalReadability: 8,
        ensembleContrast: 9,
        crossSeriesUniqueness: 17,
        thresholdStatus: "pass",
        rationale: "The face, behavior, and costume all express the central moral conflict.",
      },
      comparisonEvidence: {
        candidateDirectionCount: 3,
        currentCastCompared: 6,
        recentSeriesCompared: 4,
        priorLeadDnaCompared: 7,
        historyCompleteness: "structured",
      },
    });

    expect(parsed.scores.crossSeriesUniqueness).toBe(17);
    expect(parsed.antiCloneChecks.distinctFacialDimensions).toHaveLength(3);
  });

  it("rejects an adult lead DNA score that claims pass below the uniqueness threshold", () => {
    const result = verticalDramaCharacterDesignDnaSchema.safeParse({
      version: 1,
      designIntent: "Generic lead",
      seriesDnaAlignment: ["thriller"],
      roleTier: "lead",
      beautyArchetype: "polished",
      ageRange: "late 20s",
      faceIdentity: {
        facialGeometry: "oval",
        eyesAndGaze: "direct",
        brows: "straight",
        nose: "straight",
        lipsAndSmile: "neutral",
        skinAndTexture: "natural",
        hair: "black bob",
        distinctiveAsymmetry: "subtle",
      },
      bodyLanguage: {
        posture: "upright",
        gesturePattern: "small",
        movementRhythm: "even",
        tensionTell: "jaw tightens",
      },
      recallStack: {
        face: "direct gaze",
        silhouette: "suit",
        color: "navy",
        behavior: "still",
        emotionalHook: "guarded",
      },
      costumeGrammar: "tailored",
      publicMask: "calm",
      hiddenTruth: "afraid",
      narrativePromise: "must confess",
      attractiveContradiction: "soft and severe",
      forbiddenDrift: ["clone"],
      antiCloneChecks: {
        distinctFacialDimensions: ["face", "eyes", "mouth"],
        distinctHairDimensions: ["length", "part"],
        distinctBodyLanguageDimensions: ["posture", "gesture"],
        signatureDifference: "pin",
      },
      scores: {
        storyFit: 9,
        screenPresence: 9,
        emotionalReadability: 9,
        ensembleContrast: 9,
        crossSeriesUniqueness: 12,
        thresholdStatus: "pass",
        rationale: "Not unique enough.",
      },
      comparisonEvidence: {
        candidateDirectionCount: 3,
        currentCastCompared: 1,
        recentSeriesCompared: 3,
        priorLeadDnaCompared: 5,
        historyCompleteness: "structured",
      },
    });

    expect(result.success).toBe(false);
  });

  it("caps design context to bounded current-cast and recent-series evidence", () => {
    const result = verticalDramaCharacterDesignContextSchema.safeParse({
      seriesDna: {
        title: "A",
        genre: "romance",
        tone: "bittersweet",
        storyWorld: "Bangkok food industry",
        emotionalEngine: "ambition versus family loyalty",
        visualCulture: "warm realism",
        realismLevel: "grounded",
        beautyDirection: "recognizable rather than flawless",
        dominantColors: ["amber"],
        signatureMotifs: ["steam"],
        prohibitedRepetition: ["generic CEO"],
      },
      archiveStatus: "available",
      currentCast: Array.from({ length: 31 }, (_, index) => ({
        characterId: index + 1,
        characterKey: `c-${index + 1}`,
        name: `Character ${index + 1}`,
        role: "support",
        relationshipKind: "distinct_person",
      })),
      recentLeadArchive: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects oversized or unrecognized fields in an approved preview snapshot", () => {
    const oversized = verticalDramaApprovedCharacterDesignSnapshotSchema.safeParse({
      characterKey: "char-1",
      portraitPrompt: "x".repeat(20_001),
      visualBible: { ...VISUAL_BIBLE, version: 1, designDna: DESIGN_DNA },
    });
    const unknown = verticalDramaApprovedCharacterDesignSnapshotSchema.safeParse({
      characterKey: "char-1",
      portraitPrompt: "portrait",
      visualBible: { ...VISUAL_BIBLE, version: 1, designDna: DESIGN_DNA },
      arbitraryPayload: "must not pass",
    });

    expect(oversized.success).toBe(false);
    expect(unknown.success).toBe(false);
    if (!oversized.success) {
      expect(oversized.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["portraitPrompt"] }),
        ])
      );
    }
    if (!unknown.success) {
      expect(unknown.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unrecognized_keys",
            keys: ["arbitraryPayload"],
          }),
        ])
      );
    }
  });

  it("round-trips legacy negative data and current prompt contract metadata", () => {
    const legacy = verticalDramaApprovedCharacterDesignSnapshotSchema.parse({
      characterKey: "char-1",
      portraitPrompt: "natural human portrait with visible skin texture",
      negativePrompt: "old legacy negative value",
      visualBible: { ...VISUAL_BIBLE, version: 1, designDna: DESIGN_DNA },
    });
    expect(legacy.negativePrompt).toBe("old legacy negative value");
    expect(legacy.promptContractVersion).toBeUndefined();

    const current = verticalDramaApprovedCharacterDesignSnapshotSchema.parse({
      ...legacy,
      promptContractVersion: "vd_character_natural_human_v1",
      promptProfile: "rich",
      visualBible: {
        ...legacy.visualBible,
        promptContractVersion: "vd_character_natural_human_v1",
        promptProfile: "rich",
        semanticRetryCount: 1,
      },
    });
    expect(current.promptContractVersion).toBe("vd_character_natural_human_v1");
    expect(current.promptProfile).toBe("rich");
    expect(current.visualBible.promptProfile).toBe("rich");
    expect(current.visualBible.semanticRetryCount).toBe(1);
    expect(current.negativePrompt).toBe("old legacy negative value");
  });

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
