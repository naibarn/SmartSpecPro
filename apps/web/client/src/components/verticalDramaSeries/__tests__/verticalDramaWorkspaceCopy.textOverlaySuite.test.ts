import { describe, expect, it } from "vitest";

import {
  VD_TEXT_OVERLAY_COPY,
  vdTextOverlayCopy,
  vdTextOverlayCopyWithParams,
} from "@/components/verticalDramaSeries/verticalDramaTextOverlayCopy";

/**
 * Text Overlay Suite copy (F131AB, task #34,
 * `planning/vertical-drama-end-card-teaser/plan.md` v2) — the DEDICATED
 * `verticalDramaTextOverlayCopy.ts` module. Mirrors
 * `verticalDramaWorkspaceCopy.adBannerPlan.test.ts`'s exact convention.
 */
describe("Text Overlay Suite copy (F131AB, task #34)", () => {
  it("has the exact same key set in both locales (no drift)", () => {
    const thKeys = Object.keys(VD_TEXT_OVERLAY_COPY.th).sort();
    const enKeys = Object.keys(VD_TEXT_OVERLAY_COPY.en).sort();
    expect(thKeys).toEqual(enKeys);
  });

  it("has a non-empty entry for every key in both locales", () => {
    const keys = Object.keys(VD_TEXT_OVERLAY_COPY.en) as Array<
      keyof typeof VD_TEXT_OVERLAY_COPY.en
    >;
    for (const key of keys) {
      expect(vdTextOverlayCopy("th")[key].length).toBeGreaterThan(0);
      expect(vdTextOverlayCopy("en")[key].length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings (Thai) for the section header", () => {
    expect(vdTextOverlayCopy("th").sectionTitle).toBe("ข้อความบนวิดีโอ");
    expect(vdTextOverlayCopy("th").watermarkCardTitle).toBe("ลายน้ำซีรีส์");
  });

  it("covers all 8 overlay-kind titles", () => {
    const th = vdTextOverlayCopy("th");
    expect(th.endCardTitle).toBeTruthy();
    expect(th.openerRecapTitle).toBeTruthy();
    expect(th.titleBumperTitle).toBeTruthy();
    expect(th.episodeIndicatorTitle).toBeTruthy();
    expect(th.characterIntroTitle).toBeTruthy();
    expect(th.cardsTitle).toBeTruthy(); // time_setting + narrative_hook/custom share this list UI
    expect(th.watermarkCardTitle).toBeTruthy();
  });

  it("covers every derivation-source label used by the workspace's ที่มา badge", () => {
    const th = vdTextOverlayCopy("th");
    expect(th.sourceManual).toBeTruthy();
    expect(th.sourceCliffhanger).toBeTruthy();
    expect(th.sourceHook).toBeTruthy();
    expect(th.sourceFallback).toBeTruthy();
    expect(th.sourceSummary).toBeTruthy();
    expect(th.sourceNone).toBeTruthy();
  });

  it("interpolates the too-many-cards template correctly (Thai)", () => {
    const text = vdTextOverlayCopyWithParams(
      vdTextOverlayCopy("th").cardTooManyTotalError,
      { n: 24 }
    );
    expect(text).toBe("เพิ่มการ์ดได้สูงสุด 24 ใบต่อตอนย่อย");
  });

  it("interpolates the too-many-cards template correctly (English)", () => {
    const text = vdTextOverlayCopyWithParams(
      vdTextOverlayCopy("en").cardTooManyTotalError,
      { n: 24 }
    );
    expect(text).toBe("You can add at most 24 cards per Sub-episode");
  });

  it("interpolates the title-bumper preview template with two placeholders", () => {
    const text = vdTextOverlayCopyWithParams(
      vdTextOverlayCopy("th").titleBumperPreviewTemplate,
      { primary: "รักนี้ต้องลุ้น", secondary: "SUB-EP 3" }
    );
    expect(text).toBe("ตัวอย่าง: รักนี้ต้องลุ้น / SUB-EP 3");
  });

  it("covers all 4 watermark corner position labels", () => {
    const th = vdTextOverlayCopy("th");
    expect(th.watermarkPositionTopLeft).toBeTruthy();
    expect(th.watermarkPositionTopRight).toBeTruthy();
    expect(th.watermarkPositionBottomLeft).toBeTruthy();
    expect(th.watermarkPositionBottomRight).toBeTruthy();
  });

  it("covers the batch (season) render dialog toggles", () => {
    const th = vdTextOverlayCopy("th");
    expect(th.batchApplyTextOverlaysLabel).toBe("ใส่ข้อความตามแผนของแต่ละตอน");
    expect(th.batchApplyWatermarkLabel).toBeTruthy();
  });
});
