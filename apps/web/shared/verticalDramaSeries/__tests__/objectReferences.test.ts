import { describe, expect, it } from "vitest";
import {
  normalizeObjectReferenceAliases,
  buildObjectReferencePrompt,
  objectReferenceContextFingerprint,
  objectReferenceStableKey,
  selectObjectReferenceMedia,
  verticalDramaObjectReferenceCreateSchema,
} from "../objectReferences";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS,
} from "../../featureFlags";

describe("vertical drama object references", () => {
  it("registers Feature 174 capabilities as fail-closed tenant flags", () => {
    const keys = [
      "verticalDramaObjectReferences",
      "verticalDramaObjectDetection",
      "verticalDramaObjectImageGeneration",
      "verticalDramaObjectLegacyBackfill",
    ] as const;
    for (const key of keys) {
      expect(ALLOWED_FEATURE_FLAGS.has(key)).toBe(true);
      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(false);
      expect(VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS).toContain(key);
    }
  });

  it("keeps story objects stable by normalized name", () => {
    expect(
      objectReferenceStableKey({
        mode: "story_object",
        name: "  กล่องไม้ของคุณปู่ ",
      })
    ).toBe("story:กล่องไม้ของคุณปู่");
  });

  it("keeps Marketplace objects stable by capture and product", () => {
    expect(
      objectReferenceStableKey({
        mode: "commercial_tie_in",
        marketplaceCaptureId: "capture-1",
        marketplaceProductId: "product-9",
      })
    ).toBe("capture:capture-1:product-9");
  });

  it("defaults a new object to the non-commercial mode", () => {
    const parsed = verticalDramaObjectReferenceCreateSchema.parse({
      seriesId: "53",
      name: "ล็อกเก็ต",
    });
    expect(parsed.mode).toBe("story_object");
    expect(parsed.source).toBe("uploaded");
    expect(parsed.objectType).toBe("other");
    expect(parsed.commercialTieInEnabled).toBe(false);
  });

  it("normalizes and deduplicates aliases", () => {
    expect(
      normalizeObjectReferenceAliases([" กล่องไม้ ", "กล่อง  ไม้", "BOX"])
    ).toEqual(["กล่องไม้", "กล่อง ไม้", "box"]);
  });

  it("creates a stable context fingerprint and trims media deterministically", () => {
    expect(
      objectReferenceContextFingerprint({ text: "  same   context " })
    ).toBe(objectReferenceContextFingerprint({ text: "same context" }));
    expect(
      selectObjectReferenceMedia(
        [
          { id: "10", role: "alternate" },
          { id: "2", role: "canonical" },
          { id: "3", role: "detail" },
        ],
        2
      )
    ).toEqual([
      { id: "2", role: "canonical" },
      { id: "3", role: "detail" },
    ]);
  });

  it("builds a context-grounded prompt without requiring paid generation", () => {
    expect(
      buildObjectReferencePrompt({
        name: "กล่องไม้ของคุณปู่",
        objectType: "box",
        continuityNotes: "ลายดอกไม้และกุญแจทองต้องเหมือนเดิม",
        sceneContext: "เด็กถือกล่องอยู่ในบ้าน",
      })
    ).toContain("ลายดอกไม้และกุญแจทองต้องเหมือนเดิม");
  });
});
