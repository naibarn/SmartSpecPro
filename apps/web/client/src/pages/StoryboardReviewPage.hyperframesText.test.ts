import { describe, expect, it } from "vitest";

import { __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS } from "./StoryboardReviewPage";

describe("StoryboardReviewPage HyperFrames text helpers", () => {
  it("does not seed per-shot overlay text from video-generation prompts", () => {
    const overlay = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.buildHyperframesShotOverlayDraft({
      preset: "premium_product_hero",
      productContext: null,
      productTitle: "BENO เครื่องชงกาแฟ PRO-FLEX",
      description: "บด ชง ตีฟองในเครื่องเดียว",
      hookText: "ชงกาแฟหอมเข้ม แบบโปรในเครื่องเดียว",
      supportingText: "BENO PRO-FLEX บด ชง ตีฟองในเครื่องเดียว",
      clip: {
        id: "shot-3",
        prompt:
          'Create a 5-second cinematic video. Scene: Use @Image1 as start frame. Use @Image2 as stop frame. Action: เทเมล็ดกาแฟลงเครื่อง. Dialogue: Presenter พูดเป็นภาษาไทยว่า "อีกหนึ่งความสะดวก ไม่ต้องวุ่นวายมีเครื่องตีฟองนมต่างหาก"',
      } as any,
      index: 2,
      total: 6,
    });

    expect(overlay).not.toContain("Create a 5-second cinematic video");
    expect(overlay).not.toContain("Use @Image1");
    expect(overlay).not.toContain("Use @Image2");
    expect(overlay.trim().length).toBeGreaterThan(0);
  });

  it("removes stale video prompt lines from saved per-shot overlay text", () => {
    const sanitized = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.sanitizeHyperframesShotTextMap({
      "shot-1": "ชงกาแฟหอมเข้ม\nCreate a 5-second cinematic video",
      "shot-2": "Use @Image1 as start frame\nSmart display ใช้ง่าย",
    });

    expect(sanitized["shot-1"]).toBe("ชงกาแฟหอมเข้ม");
    expect(sanitized["shot-2"]).toBe("Smart display ใช้ง่าย");
  });

  it("does not use video prompt boilerplate as a subtitle fallback", () => {
    const subtitle = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.defaultHyperframesSubtitleText({
      id: "shot-4",
      prompt: "Create a 5-second cinematic video. Scene: Use @Image1 as start frame. Action: close-up product demo.",
    } as any);

    expect(subtitle).toBe("");
  });

  it("builds a clean subtitle map from shot voice lines only", () => {
    const map = __STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS.buildHyperframesSubtitleTextMapFromClips([
      {
        id: "shot-1",
        prompt: 'Dialogue: Presenter พูดเป็นภาษาไทยว่า "แก้วแรกก็ได้ครีม่านุ่มสวย"',
      },
      {
        id: "shot-2",
        prompt: "Create a 5-second cinematic video. Scene: Use @Image1 as start frame.",
      },
    ] as any);

    expect(map["shot-1"]).toContain("แก้วแรกก็ได้ครีม่านุ่มสวย");
    expect(map["shot-2"]).toBe("");
  });
});
