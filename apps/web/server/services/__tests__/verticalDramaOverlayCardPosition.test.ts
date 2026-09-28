import { describe, expect, it } from "vitest";

import {
  VD_TEXT_OVERLAY_CARD_POSITIONS,
  vdTextOverlayCardSchema,
} from "../../../shared/verticalDramaSeries/textOverlay";

/**
 * Per-episode custom text overlays needed a screen position (item 5 of the
 * Marketplace-parity list, 2026-07-31). The card system already stored free
 * text per episode; only WHERE it renders was missing, so this adds an
 * optional 3x3 anchor rather than a parallel overlay type.
 */
describe("per-episode text overlay card position", () => {
  it("offers the same nine anchors as every other overlay picker", () => {
    expect([...VD_TEXT_OVERLAY_CARD_POSITIONS]).toEqual([
      "top_left",
      "top_center",
      "top_right",
      "middle_left",
      "middle_center",
      "middle_right",
      "bottom_left",
      "bottom_center",
      "bottom_right",
    ]);
  });

  it("accepts a card carrying a position", () => {
    const parsed = vdTextOverlayCardSchema.safeParse({
      id: "card-1",
      kind: "custom",
      anchor: { shotNumber: 2 },
      position: "middle_center",
      text: "ลดพิเศษวันนี้",
      durationSec: 3,
      enabled: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.position).toBe("middle_center");
  });

  it("still accepts a card with NO position — every pre-existing card", () => {
    const parsed = vdTextOverlayCardSchema.safeParse({
      id: "legacy-card",
      kind: "narrative_hook",
      anchor: { shotNumber: 1 },
      text: "เดิม",
      durationSec: 3,
      enabled: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.position).toBeUndefined();
  });

  it("rejects an anchor outside the nine", () => {
    const parsed = vdTextOverlayCardSchema.safeParse({
      id: "card-2",
      kind: "custom",
      anchor: { shotNumber: 1 },
      position: "somewhere_else",
      text: "x",
      durationSec: 3,
      enabled: true,
    });
    expect(parsed.success).toBe(false);
  });
});
