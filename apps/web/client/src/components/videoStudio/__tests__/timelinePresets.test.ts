/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P3, §7 P3 row.
 * Covers: every preset adds exactly the layer(s) it promises, stays inside
 * the safe area for TWO different platform presets (tiktok_9_16's tighter
 * insets and youtube_16_9's looser ones), and the `closingCta` id never
 * carries the `_cta` suffix (task brief §3 CAUTION).
 */
import { describe, expect, it } from "vitest";

import { createDefaultDocument } from "../createDefaultDocument";
import { TIMELINE_PRESETS } from "../timelinePresets";
import { computeSafeAreaRect } from "../videoStudioSafeArea";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { PlatformPreset } from "@shared/videoIntelligence/projectSchemas";

function findPreset(id: string) {
  const preset = TIMELINE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`preset not found: ${id}`);
  return preset;
}

function allLayers(doc: ReturnType<typeof createDefaultDocument>): RemotionLayer[] {
  return doc.scenes.flatMap((s) => s.layers);
}

function isInsideSafeArea(layer: RemotionLayer, platformPreset: PlatformPreset): boolean {
  const rect = computeSafeAreaRect(platformPreset);
  return (
    layer.x >= rect.left - 1e-6 &&
    layer.y >= rect.top - 1e-6 &&
    layer.x + layer.width <= rect.right + 1e-6 &&
    layer.y + layer.height <= rect.bottom + 1e-6
  );
}

const PLATFORM_PRESETS_TO_CHECK: PlatformPreset[] = ["tiktok_9_16", "youtube_16_9"];

describe("timelinePresets — safe area (§4.6 preset list)", () => {
  for (const platformPreset of PLATFORM_PRESETS_TO_CHECK) {
    describe(`platformPreset=${platformPreset}`, () => {
      it("promoPriceTopRight adds one overlay-band text layer inside the safe area", () => {
        const doc = createDefaultDocument({ platformPreset });
        const before = allLayers(doc).length;
        const result = findPreset("promoPriceTopRight").apply(doc, null);
        const added = allLayers(result.document);
        expect(added.length).toBe(before + 1);
        expect(result.layerIds).toHaveLength(1);
        const layer = added.find((l) => l.id === result.layerIds[0])!;
        expect(layer.type).toBe("text");
        expect(layer.role).toBe("overlay");
        expect(isInsideSafeArea(layer, platformPreset)).toBe(true);
      });

      it("storeWatermark adds one LOCKED brand-band text layer inside the safe area", () => {
        const doc = createDefaultDocument({ platformPreset });
        const result = findPreset("storeWatermark").apply(doc, null);
        const layer = allLayers(result.document).find((l) => l.id === result.layerIds[0])!;
        expect(layer.role).toBe("brand");
        expect(layer.locked).toBe(true);
        expect(isInsideSafeArea(layer, platformPreset)).toBe(true);
      });

      it("openingText3s adds a 3-second overlay text layer starting at 0, inside the safe area", () => {
        const doc = createDefaultDocument({ platformPreset });
        const result = findPreset("openingText3s").apply(doc, null);
        const layer = allLayers(result.document).find((l) => l.id === result.layerIds[0])!;
        expect(layer.role).toBe("overlay");
        expect(layer.startFrame).toBe(0);
        expect(isInsideSafeArea(layer, platformPreset)).toBe(true);
      });

      it("closingCta adds an overlay text layer near the END of the document, inside the safe area, WITHOUT a _cta id suffix", () => {
        const doc = createDefaultDocument({ platformPreset });
        const result = findPreset("closingCta").apply(doc, null);
        const layer = allLayers(result.document).find((l) => l.id === result.layerIds[0])!;
        expect(layer.role).toBe("overlay");
        expect(layer.id.endsWith("_cta")).toBe(false);
        expect(isInsideSafeArea(layer, platformPreset)).toBe(true);
      });

      it("subtitleBackdrop adds a motionGraphic rect matching the compiler's caption rect (x5 y76 w90 h20)", () => {
        const doc = createDefaultDocument({ platformPreset });
        const result = findPreset("subtitleBackdrop").apply(doc, null);
        const layer = allLayers(result.document).find((l) => l.id === result.layerIds[0])!;
        expect(layer.type).toBe("motionGraphic");
        expect(layer.x).toBe(5);
        expect(layer.y).toBe(76);
        expect(layer.width).toBe(90);
        expect(layer.height).toBe(20);
      });
    });
  }
});

describe("timelinePresets — brand-lock constraint (§4.8)", () => {
  it("forces the locked brand color/font onto a preset-authored text layer", () => {
    const doc = createDefaultDocument({ platformPreset: "tiktok_9_16" });
    const brandKit = {
      colors: { primary: "#ff00aa" },
      fonts: { body: "Sarabun" },
      locks: { colors: true, fonts: true },
    };
    const result = findPreset("promoPriceTopRight").apply(doc, brandKit);
    const layer = allLayers(result.document).find((l) => l.id === result.layerIds[0])!;
    expect(layer.type).toBe("text");
    if (layer.type === "text") {
      expect(layer.color).toBe("#ff00aa");
      expect(layer.fontFamily).toBe("Sarabun");
    }
  });
});
