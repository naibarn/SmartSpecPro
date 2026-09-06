import { describe, expect, it } from "vitest";
import {
  TWIN_SHARED_FACE_FIELDS,
  buildEffectiveTwinDna,
  materializeTwinDnaData,
  mergeTwinDna,
  resolveTwinPair,
} from "../twinIdentity";

const dna = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  designIntent: "child identity",
  seriesDnaAlignment: ["family drama"],
  roleTier: "child",
  beautyArchetype: "warm child",
  ageRange: "around 9 years old",
  faceIdentity: {
    facialGeometry: "rounded face",
    eyesAndGaze: "bright eyes",
    brows: "soft brows",
    nose: "small nose",
    lipsAndSmile: "left-lifting smile",
    skinAndTexture: "warm skin",
    hair: "messy short hair",
    distinctiveAsymmetry: "temple mark",
  },
  bodyLanguage: { posture: "upright", gesturePattern: "open hands", movementRhythm: "quick", tensionTell: "rubs sleeve" },
  recallStack: { face: "round", silhouette: "hoodie", color: "cream", behavior: "helpful", emotionalHook: "kind" },
  costumeGrammar: "hoodie",
  publicMask: "sunny",
  hiddenTruth: "worried",
  narrativePromise: "reconcile family",
  attractiveContradiction: "cheerful but observant",
  forbiddenDrift: ["adult styling"],
  antiCloneChecks: { distinctFacialDimensions: ["face shape", "eyes", "nose"], distinctHairDimensions: ["length", "shape"], distinctBodyLanguageDimensions: ["posture", "gesture"], signatureDifference: "mark" },
  scores: { storyFit: 8, screenPresence: 8, emotionalReadability: 8, ensembleContrast: 8, crossSeriesUniqueness: 16, thresholdStatus: "pass", rationale: "ok" },
  comparisonEvidence: { candidateDirectionCount: 3, currentCastCompared: 1, recentSeriesCompared: 1, priorLeadDnaCompared: 1, historyCompleteness: "partial" },
  ...overrides,
});

const data = (value: any) => ({ visualBible: { ageRange: value.ageRange, identityDnaRevision: 2, designDna: value } });

describe("twinIdentity", () => {
  it("resolves a one-way pointer as a pair in either direction", () => {
    const rows = [{ id: 1, sharesFaceWithCharacterId: null }, { id: 2, sharesFaceWithCharacterId: 1 }];
    expect(resolveTwinPair(rows[0], rows)).toEqual({ sourceId: 1, targetId: 2 });
    expect(resolveTwinPair(rows[1], rows)).toEqual({ sourceId: 1, targetId: 2 });
  });

  it("shares face and age but preserves target hair and local style", () => {
    const source = dna();
    const target = dna({ ageRange: "8–14 years", faceIdentity: { ...source.faceIdentity, hair: "braided hair" }, costumeGrammar: "white shirt", publicMask: "quiet" });
    const merged = mergeTwinDna(source as any, target as any);
    expect(merged.ageRange).toBe(source.ageRange);
    for (const field of TWIN_SHARED_FACE_FIELDS) expect(merged.faceIdentity[field]).toBe(source.faceIdentity[field]);
    expect(merged.faceIdentity.hair).toBe("braided hair");
    expect(merged.costumeGrammar).toBe("white shirt");
    expect(merged.publicMask).toBe("quiet");
  });

  it("materializes shared DNA with provenance", () => {
    const source = data(dna());
    const target = data(dna({ ageRange: "8–14 years", faceIdentity: { ...dna().faceIdentity, hair: "short curls" } }));
    const result = materializeTwinDnaData({ data: target, sourceData: source, sourceCharacterId: 1, now: "2026-09-06T00:00:00.000Z" });
    expect((result.data.visualBible as any).designDna.ageRange).toBe("around 9 years old");
    expect((result.data.visualBible as any).designDna.faceIdentity.hair).toBe("short curls");
    expect((result.data.visualBible as any).twinIdentity).toMatchObject({ sourceCharacterId: "1", sourceDnaRevision: 2 });
  });

  it("fails closed when either twin DNA is absent", () => {
    expect(() => buildEffectiveTwinDna({ sourceData: {}, targetData: data(dna()), sourceCharacterId: 1, targetCharacterId: 2 })).toThrow(/DNA is incomplete/);
  });

  it("can materialize a missing target visual bible from the source", () => {
    const result = materializeTwinDnaData({ data: { description: "quiet twin" }, sourceData: data(dna()), sourceCharacterId: 1, now: "2026-09-06T00:00:00.000Z" });
    expect((result.data.visualBible as any).designDna.ageRange).toBe("around 9 years old");
    expect((result.data.visualBible as any).twinIdentity.sourceCharacterId).toBe("1");
  });
});
