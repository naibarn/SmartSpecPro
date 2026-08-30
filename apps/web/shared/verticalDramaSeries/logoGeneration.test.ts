import { describe, expect, it } from "vitest";

import {
  buildSeriesLogoPrompt,
  patchGeneratedLogoSlot,
} from "./logoGeneration";

describe("Vertical Drama logo generation helpers", () => {
  it("builds the exact title-logo prompt", () => {
    expect(
      buildSeriesLogoPrompt({
        slotId: "primary",
        seriesTitle: "รักนี้ต้องลุ้น",
      })
    ).toBe(
      "สร้าง logo แบบพื้นหลังโปร่งใส สำหรับซีรีย์แนวตั้งเรื่อง รักนี้ต้องลุ้น"
    );
  });

  it("builds the exact Facebook channel-logo prompt with the required spacing", () => {
    expect(
      buildSeriesLogoPrompt({
        slotId: "secondary",
        channelName: "Smart AI Hub",
      })
    ).toBe(
      "สร้าง logo แบบพื้นหลังโปร่งใส สำหรับชื่อช่องเฟสบุค ชื่อ  Smart AI Hub"
    );
  });

  it("rejects a channel logo without a channel name", () => {
    expect(() =>
      buildSeriesLogoPrompt({ slotId: "secondary", channelName: "  " })
    ).toThrow("Channel name is required");
  });

  it("preserves primary placement values while applying a generated logo", () => {
    const next = patchGeneratedLogoSlot(
      {
        enabled: false,
        type: "text",
        text: "old",
        position: "middle_left",
        opacity: 0.6,
        scalePct: 14,
        marginPx: 44,
      },
      "primary",
      "/api/storage/files/logo.png"
    );

    expect(next).toEqual(
      expect.objectContaining({
        enabled: true,
        type: "image",
        imageUrl: "/api/storage/files/logo.png",
        position: "middle_left",
        opacity: 0.6,
        scalePct: 14,
        marginPx: 44,
      })
    );
  });

  it("creates secondary without materializing it until apply", () => {
    const next = patchGeneratedLogoSlot(
      null,
      "secondary",
      "/api/storage/files/channel.png"
    );
    expect(next.secondary).toEqual(
      expect.objectContaining({
        enabled: true,
        type: "image",
        imageUrl: "/api/storage/files/channel.png",
        position: "bottom_right",
      })
    );
    expect(next).toEqual(
      expect.objectContaining({
        enabled: false,
        type: "text",
        position: "top_right",
      })
    );
  });
});
