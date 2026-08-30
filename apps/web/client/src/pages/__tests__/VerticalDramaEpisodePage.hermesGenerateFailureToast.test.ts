import { describe, expect, it } from "vitest";

import {
  buildVdGenerateFailureToastMessage,
  shouldReauthorStartFrameImageRetry,
} from "../VerticalDramaEpisodePage";
import { formatHermesErrorMessage } from "@shared/hermesMedia";

/**
 * Feature 135 (Hermes/Grok media worker), section-10 review fix — shared
 * task-projection failure toast builder used by every image/video
 * generation poll loop in `VerticalDramaEpisodePage.tsx` (start-frame,
 * angle variations, video clip, repair image, reference frame).
 */
const FALLBACK = { th: "สร้างภาพล้มเหลว", en: "Generation failed" };

describe("buildVdGenerateFailureToastMessage", () => {
  it("renders the hermes Thai copy (not the raw errorMessage) when task.errorCode is a typed hermes code", () => {
    const message = buildVdGenerateFailureToastMessage(
      { errorMessage: "การประมวลผลของ Hermes ล้มเหลว", errorCode: "HERMES_PROCESS_FAILED" },
      "th",
      FALLBACK,
    );
    expect(message).toContain("ลองใหม่ได้");
    expect(message).not.toBe(`${FALLBACK.th}: การประมวลผลของ Hermes ล้มเหลว`);
  });

  it("renders the English copy when lang is en", () => {
    const message = buildVdGenerateFailureToastMessage(
      { errorMessage: "x", errorCode: "HERMES_ENTITLEMENT_RESTRICTED" },
      "en",
      FALLBACK,
    );
    expect(message).toContain("xAI has not authorized");
  });

  it("also reads a [HERMES_X]-prefixed errorMessage (message-channel fallback) when no errorCode field is present", () => {
    const message = buildVdGenerateFailureToastMessage(
      { errorMessage: formatHermesErrorMessage("HERMES_TIMEOUT") },
      "th",
      FALLBACK,
    );
    expect(message).not.toMatch(/^\[HERMES_/);
  });

  it("regression: falls back to the exact pre-existing '<fallback>: <errorMessage>' format for a non-hermes task", () => {
    expect(
      buildVdGenerateFailureToastMessage({ errorMessage: "provider timeout" }, "th", FALLBACK),
    ).toBe("สร้างภาพล้มเหลว: provider timeout");
    expect(
      buildVdGenerateFailureToastMessage({ errorMessage: "provider timeout" }, "en", FALLBACK),
    ).toBe("Generation failed: provider timeout");
  });

  it("gives policy failures terminal guidance instead of suggesting an automatic retry", () => {
    const message = buildVdGenerateFailureToastMessage(
      {
        errorMessage:
          "Provider failed: Sorry, but the image we created may violate OpenAI's content policies.",
      },
      "th",
      FALLBACK,
    );
    expect(message).toContain("หยุดส่งซ้ำทันที");
    expect(message).toContain("แก้ prompt หรือภาพอ้างอิงก่อน");
  });

  it("regression: falls back to the bare fallback string when there is no errorMessage at all", () => {
    expect(buildVdGenerateFailureToastMessage(null, "th", FALLBACK)).toBe("สร้างภาพล้มเหลว");
    expect(buildVdGenerateFailureToastMessage(undefined, "en", FALLBACK)).toBe("Generation failed");
    expect(buildVdGenerateFailureToastMessage({}, "th", FALLBACK)).toBe("สร้างภาพล้มเหลว");
  });
});

describe("shouldReauthorStartFrameImageRetry", () => {
  it("re-authors when the persisted failure is the stale composition-lock guard", () => {
    expect(
      shouldReauthorStartFrameImageRetry(
        "พรอมต์ภาพของช็อต 1 ยังไม่มีข้อมูลจัดองค์ประกอบช็อตปัจจุบันครบถ้วน (missing_current_shot_composition_lock)"
      )
    ).toBe(true);
  });

  it("keeps provider failures on the existing prompt", () => {
    expect(shouldReauthorStartFrameImageRetry("Provider timeout")).toBe(false);
    expect(shouldReauthorStartFrameImageRetry(undefined)).toBe(false);
  });
});
