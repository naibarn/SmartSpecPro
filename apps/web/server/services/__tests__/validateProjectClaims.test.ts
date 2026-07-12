/**
 * Coverage for `validateProjectClaims.ts` — the pure, deterministic claim
 * join (Feature 133, section-06 §5.1 / §4.1). No mocking: this module does
 * no I/O, so every test drives real inputs through the real function.
 */
import { describe, expect, it } from "vitest";

import { VideoProjectDocumentSchema } from "../../../shared/videoIntelligence/projectSchemas";
import {
  validateProjectClaims,
  type ResolvedCatalogFacts,
} from "../validateProjectClaims";

function baseSceneLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_1",
    type: "image",
    startFrame: 0,
    durationFrames: 60,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    src: "https://cdn.example.com/img.png",
    fit: "cover",
    ...overrides,
  };
}

function buildScene(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: "SC-001",
    startMs: 0,
    endMs: 5000,
    narration: null,
    narrationAudioAssetId: null,
    visual: { kind: "layers" },
    layers: [],
    motion: { intensity: "medium", camera: "static" },
    captionCues: [],
    ...overrides,
  };
}

function buildDocument(overrides: Record<string, unknown> = {}) {
  // Round-trip through the section-01 schema per section-06 §4.1's test
  // convention — proves every fixture is a genuinely valid document.
  return VideoProjectDocumentSchema.parse({
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    content: { language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [buildScene()],
    audioTracks: [],
    captions: { presetId: "classic_box", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 8, maxLoops: 5 },
    ...overrides,
  });
}

function buildCatalog(overrides: Partial<ResolvedCatalogFacts> = {}): ResolvedCatalogFacts {
  return {
    productIds: ["prod-1"],
    claimResolutions: [],
    ...overrides,
  };
}

describe("validateProjectClaims", () => {
  it("maps narration statements to claim records", () => {
    const document = buildDocument({
      claims: [
        { claim: "ลดริ้วรอยใน 2 สัปดาห์", source: "catalog.description", status: "approved" },
      ],
      scenes: [buildScene({ narration: "ลดริ้วรอยใน 2 สัปดาห์" })],
    });

    const result = validateProjectClaims(document, buildCatalog());

    expect(result.mappedClaims).toEqual([
      {
        statement: "ลดริ้วรอยใน 2 สัปดาห์",
        sceneId: "SC-001",
        claim: "ลดริ้วรอยใน 2 สัปดาห์",
        status: "approved",
      },
    ]);
    expect(result.unmappedStatements).toEqual([]);
    expect(result.prohibitedClaims).toEqual([]);
    expect(result.coverage).toBe(1);
    expect(result.blocksFinalRender).toBe(false);
  });

  it("maps a caption-cue statement via a catalog-resolved claim (not document.claims)", () => {
    const document = buildDocument({
      claims: [],
      scenes: [
        buildScene({
          captionCues: [{ startMs: 0, endMs: 2000, text: "ลดสิวได้จริง" }],
        }),
      ],
    });

    const result = validateProjectClaims(
      document,
      buildCatalog({
        claimResolutions: [
          { claim: "ลดสิวได้จริง", source: "marketplace.insight", status: "needs_review" },
        ],
      }),
    );

    expect(result.mappedClaims).toEqual([
      { statement: "ลดสิวได้จริง", sceneId: "SC-001", claim: "ลดสิวได้จริง", status: "needs_review" },
    ]);
    expect(result.unmappedStatements).toEqual([]);
    expect(result.blocksFinalRender).toBe(false);
  });

  it("flags an unmapped product statement", () => {
    const document = buildDocument({
      claims: [],
      scenes: [buildScene({ narration: "รักษาสิวหายขาดใน 3 วัน" })],
    });

    const result = validateProjectClaims(document, buildCatalog());

    expect(result.unmappedStatements).toEqual([
      { statement: "รักษาสิวหายขาดใน 3 วัน", sceneId: "SC-001" },
    ]);
    expect(result.mappedClaims).toEqual([]);
    expect(result.coverage).toBe(0);
    expect(result.blocksFinalRender).toBe(true);
  });

  it("flags a prohibited claim", () => {
    const document = buildDocument({
      claims: [
        { claim: "รักษามะเร็งได้ 100%", source: "catalog.description", status: "prohibited" },
      ],
      scenes: [buildScene({ narration: "รักษามะเร็งได้ 100%" })],
    });

    const result = validateProjectClaims(document, buildCatalog());

    expect(result.prohibitedClaims).toEqual([
      { claim: "รักษามะเร็งได้ 100%", status: "prohibited" },
    ]);
    expect(result.mappedClaims).toEqual([
      {
        statement: "รักษามะเร็งได้ 100%",
        sceneId: "SC-001",
        claim: "รักษามะเร็งได้ 100%",
        status: "prohibited",
      },
    ]);
    expect(result.coverage).toBe(1);
    expect(result.blocksFinalRender).toBe(true);
  });

  it("deduplicates repeated prohibited claim text across multiple statements", () => {
    const document = buildDocument({
      claims: [{ claim: "รักษามะเร็ง", source: "catalog.description", status: "prohibited" }],
      scenes: [
        buildScene({
          narration: "รักษามะเร็ง",
          captionCues: [{ startMs: 0, endMs: 1000, text: "รักษามะเร็ง" }],
        }),
      ],
    });

    const result = validateProjectClaims(document, buildCatalog());

    expect(result.prohibitedClaims).toEqual([{ claim: "รักษามะเร็ง", status: "prohibited" }]);
    expect(result.mappedClaims).toHaveLength(2);
  });

  it("returns empty result for a catalog-less (Motion) project", () => {
    const document = buildDocument({
      scenes: [buildScene({ narration: "ทดสอบข้อความบรรยาย" })],
    });

    const result = validateProjectClaims(document, null);

    expect(result).toEqual({
      mappedClaims: [],
      unmappedStatements: [],
      prohibitedClaims: [],
      coverage: 1,
      blocksFinalRender: false,
    });
  });

  it("FE01 fix: a catalog-declared prohibited claim cannot be shadowed by a document-declared approved claim with matching text (max-severity-wins)", () => {
    const document = buildDocument({
      // A project owner self-declares an "approved" claim for the exact
      // same text a real catalog claim already marks "prohibited" — before
      // the fix, first-match-wins (document.claims checked first) let this
      // neutralize the prohibited status entirely.
      claims: [{ claim: "cures X", source: "self-declared", status: "approved" }],
      scenes: [buildScene({ narration: "cures X" })],
    });

    const result = validateProjectClaims(
      document,
      buildCatalog({
        claimResolutions: [{ claim: "cures X", source: "marketplace.insight", status: "prohibited" }],
      }),
    );

    expect(result.prohibitedClaims).toEqual([{ claim: "cures X", status: "prohibited" }]);
    expect(result.mappedClaims).toEqual([
      { statement: "cures X", sceneId: "SC-001", claim: "cures X", status: "prohibited" },
    ]);
    expect(result.blocksFinalRender).toBe(true);
  });

  it("max-severity-wins picks the first-encountered claim when severities tie", () => {
    const document = buildDocument({
      claims: [{ claim: "safe for daily use", source: "self-declared", status: "approved" }],
      scenes: [buildScene({ narration: "safe for daily use" })],
    });

    const result = validateProjectClaims(
      document,
      buildCatalog({
        claimResolutions: [
          { claim: "safe for daily use", source: "marketplace.insight", status: "approved" },
        ],
      }),
    );

    expect(result.mappedClaims).toEqual([
      { statement: "safe for daily use", sceneId: "SC-001", claim: "safe for daily use", status: "approved" },
    ]);
    expect(result.blocksFinalRender).toBe(false);
  });

  it("returns coverage 1 and does not block when a catalog project has no statements at all", () => {
    const document = buildDocument({ scenes: [buildScene()] });

    const result = validateProjectClaims(document, buildCatalog());

    expect(result).toEqual({
      mappedClaims: [],
      unmappedStatements: [],
      prohibitedClaims: [],
      coverage: 1,
      blocksFinalRender: false,
    });
  });
});
