import { describe, expect, it } from "vitest";
import {
  isCharacterIdentityDnaStale,
  mergeCharacterIdentityDnaData,
  readCharacterIdentityDna,
  readCharacterVisualBibleAgeRange,
  readCharacterIdentityDnaRevision,
  verticalDramaCharacterIdentityDnaEditSchema,
} from "../characterDnaEditor";

const DNA = {
  version: 1 as const,
  designIntent: "A resilient lead",
  seriesDnaAlignment: ["Thai contemporary drama"],
  roleTier: "lead_female" as const,
  beautyArchetype: "Warm heroine",
  ageRange: "early 30s",
  faceIdentity: {
    facialGeometry: "Long oval face",
    eyesAndGaze: "Large almond eyes",
    brows: "Softly arched brows",
    nose: "Straight medium bridge",
    lipsAndSmile: "Defined cupid's bow",
    skinAndTexture: "Warm honey-beige skin",
    hair: "Long dark hair",
    distinctiveAsymmetry: "Beauty mark under left eye",
  },
  bodyLanguage: {
    posture: "Upright",
    gesturePattern: "Protective hand near earring",
    movementRhythm: "Slow controlled movement",
    tensionTell: "Thumb rubs earring",
  },
  recallStack: {
    face: "Oval face",
    silhouette: "Structured blazer",
    color: "Navy and cream",
    behavior: "Protective gesture",
    emotionalHook: "Strength hiding vulnerability",
  },
  costumeGrammar: "Contemporary tailoring",
  publicMask: "Decisive executive",
  hiddenTruth: "Afraid to trust",
  narrativePromise: "Learns to ask for love",
  attractiveContradiction: "Warmth with boundaries",
  forbiddenDrift: ["Generic corporate headshot"],
  antiCloneChecks: {
    distinctFacialDimensions: ["Oval face", "Almond eyes", "Medium nose"],
    distinctHairDimensions: ["Long length", "Center part"],
    distinctBodyLanguageDimensions: ["Protective shoulders", "Earring gesture"],
    signatureDifference: "Beauty mark",
  },
  scores: {
    storyFit: 9,
    screenPresence: 9,
    emotionalReadability: 9,
    ensembleContrast: 9,
    crossSeriesUniqueness: 16,
    thresholdStatus: "pass" as const,
    rationale: "Strong fit",
  },
  comparisonEvidence: {
    candidateDirectionCount: 3 as const,
    currentCastCompared: 1,
    recentSeriesCompared: 1,
    priorLeadDnaCompared: 1,
    historyCompleteness: "structured" as const,
  },
};

const BASE_DATA = {
  description: "A trusted character description",
  castingPreferences: { version: 1, additionalDetails: "Thai-British" },
  identityLock: "Keep the approved face",
  visualBible: {
    version: 1,
    createdAt: "2026-08-25T00:00:00.000Z",
    model: "test-model",
    visualIdentitySummary: "Original summary",
    identityAnchors: ["Original anchor"],
    signatureWardrobe: "Navy blazer",
    hairMakeupNotes: "Original hair note",
    performanceEnergy: "Controlled",
    consistencyStrategy: "Keep face stable",
    signatureVisualCues: ["Pearl earring"],
    colorPalette: "Navy cream",
    storyWorldRelationship: "Family drama",
    forbiddenDrift: ["Clone face"],
    emotionalRangeNeeded: ["Guarded"],
    ageRange: "early 30s",
    designDna: DNA,
    identityDnaRevision: 4,
    promptDnaRevision: 4,
  },
};

const EDIT = {
  ageRange: "20",
  faceIdentity: {
    ...DNA.faceIdentity,
    facialGeometry: "Soft oval face with youthful proportions",
    hair: "Long straight black hair",
  },
};

describe("character identity DNA editor contract", () => {
  it("validates the structured editable identity payload", () => {
    expect(verticalDramaCharacterIdentityDnaEditSchema.parse(EDIT)).toEqual(EDIT);
    expect(() =>
      verticalDramaCharacterIdentityDnaEditSchema.parse({ ...EDIT, unknown: "x" })
    ).toThrow();
  });

  it("merges identity fields, synchronizes age, and preserves unrelated data", () => {
    const result = mergeCharacterIdentityDnaData({
      data: BASE_DATA,
      edit: EDIT,
      now: "2026-08-26T00:00:00.000Z",
    });
    const visualBible = result.data.visualBible as Record<string, any>;
    const dna = visualBible.designDna as Record<string, any>;

    expect(visualBible.ageRange).toBe("20");
    expect(dna.ageRange).toBe("20");
    expect(dna.faceIdentity.facialGeometry).toContain("youthful");
    expect(dna.publicMask).toBe(DNA.publicMask);
    expect(result.data.description).toBe(BASE_DATA.description);
    expect(result.data.identityLock).toBe(BASE_DATA.identityLock);
    expect(visualBible.identityDnaRevision).toBe(5);
    expect(visualBible.identityDnaSource).toBe("user_edited");
    expect(visualBible.promptDnaRevision).toBe(4);
  });

  it("rejects edits when the existing approved DNA is missing", () => {
    expect(() =>
      mergeCharacterIdentityDnaData({
        data: { visualBible: { ageRange: "early 30s" } },
        edit: EDIT,
        now: "2026-08-26T00:00:00.000Z",
      })
    ).toThrow(/Character DNA is required/);
  });

  it("reads legacy revision metadata safely and detects stale prompts", () => {
    expect(readCharacterIdentityDnaRevision({})).toBe(1);
    expect(readCharacterIdentityDna(BASE_DATA)).toEqual(DNA);
    expect(isCharacterIdentityDnaStale(BASE_DATA.visualBible)).toBe(false);
    expect(
      isCharacterIdentityDnaStale({
        ...BASE_DATA.visualBible,
        identityDnaRevision: 5,
        promptDnaRevision: 4,
      })
    ).toBe(true);
  });

  it("reads the canonical age from the persisted visual bible", () => {
    expect(readCharacterVisualBibleAgeRange(BASE_DATA)).toBe("early 30s");
    expect(readCharacterVisualBibleAgeRange({ data: BASE_DATA })).toBeUndefined();
  });
});
