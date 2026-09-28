import { describe, expect, it } from "vitest";

import { createDefaultDocument } from "../createDefaultDocument";
import { VideoProjectDocumentSchema } from "@shared/videoIntelligence/projectSchemas";

describe("createDefaultDocument", () => {
  it("produces a document that satisfies VideoProjectDocumentSchema for every platform preset", () => {
    for (const platformPreset of [
      "tiktok_9_16",
      "reels_9_16",
      "youtube_16_9",
      "square_1_1",
    ] as const) {
      const doc = createDefaultDocument({ platformPreset });
      const parsed = VideoProjectDocumentSchema.safeParse(doc);
      expect(parsed.success).toBe(true);
    }
  });

  it("defaults to tiktok_9_16 (1080x1920) when no platform preset is given", () => {
    const doc = createDefaultDocument({});
    expect(doc.format.width).toBe(1080);
    expect(doc.format.height).toBe(1920);
    expect(doc.content.platformPreset).toBe("tiktok_9_16");
  });

  it("always has exactly one scene with an empty layers visual (compiler-safe, no template guess)", () => {
    const doc = createDefaultDocument({});
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes[0].visual).toEqual({ kind: "layers" });
    expect(doc.scenes[0].layers).toEqual([]);
  });
});
