import { describe, expect, it } from "vitest";

import {
  verticalDramaCopy,
  voiceCastingLockedAtText,
  voiceCastingPreviewCreditCostText,
} from "@/components/verticalDramaSeries/verticalDramaCopy";

/**
 * Voice casting copy (W12-B, spec feature 131 §14/§7.4 voice chain wave) —
 * Characters-surface casting card strings. See
 * `VerticalDramaCharacterVoiceCastingCard.tsx`.
 */
describe("Voice casting copy (W12-B)", () => {
  const keys = [
    "voiceCastingSectionTitle",
    "voiceCastingChipUncast",
    "voiceCastingSelectCta",
    "voiceCastingClearCta",
    "voiceCastingClearing",
    "voiceCastingPreviewCta",
    "voiceCastingPreviewing",
    "voiceCastingPreviewConfirmTitle",
    "voiceCastingPreviewConfirmBody",
    "voiceCastingPreviewErrorNoVoice",
    "voiceCastingDialogTitle",
    "voiceCastingSearchPlaceholder",
    "voiceCastingSearchAriaLabel",
    "voiceCastingLoading",
    "voiceCastingNoResults",
    "voiceCastingEmptyCatalog",
    "voiceCastingUnknownLanguageGroup",
    "voiceCastingCastSuccess",
    "voiceCastingClearSuccess",
    "voiceCastingCurrentlyCast",
    "voiceCastingCancel",
    "voiceCastingConfirm",
  ] as const;

  it("has non-empty bilingual (th/en) entries for every new key", () => {
    for (const key of keys) {
      expect(verticalDramaCopy[key].th.length).toBeGreaterThan(0);
      expect(verticalDramaCopy[key].en.length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings (Thai)", () => {
    expect(verticalDramaCopy.voiceCastingChipUncast.th).toBe("ยังไม่กำหนดเสียง");
    expect(verticalDramaCopy.voiceCastingSelectCta.th).toBe("เลือกเสียง");
    expect(verticalDramaCopy.voiceCastingClearCta.th).toBe("ล้างเสียง");
    expect(verticalDramaCopy.voiceCastingPreviewCta.th).toBe("ฟังตัวอย่าง (มีค่าใช้จ่าย)");
  });
});

describe("voiceCastingLockedAtText", () => {
  it("renders the exact 'ล็อกเมื่อ {date}' Copy Contract shape (Thai), UTC-formatted", () => {
    expect(voiceCastingLockedAtText("th", "2026-07-08T14:05:00.000Z")).toBe(
      "ล็อกเมื่อ 2026-07-08 14:05",
    );
  });

  it("renders a non-empty English equivalent carrying the same formatted date", () => {
    const text = voiceCastingLockedAtText("en", "2026-07-08T14:05:00.000Z");
    expect(text).toContain("2026-07-08 14:05");
  });

  it("returns an empty string for an unparseable date, never throws", () => {
    expect(voiceCastingLockedAtText("th", "not-a-date")).toBe("");
  });
});

describe("voiceCastingPreviewCreditCostText (debt-item-2)", () => {
  it("renders the exact 'ใช้ไป {n} เครดิต' Copy Contract shape (Thai)", () => {
    expect(voiceCastingPreviewCreditCostText("th", 3)).toBe("ใช้ไป 3 เครดิต");
  });

  it("renders a singular English form for a cost of 1", () => {
    expect(voiceCastingPreviewCreditCostText("en", 1)).toBe("Cost: 1 credit");
  });

  it("renders a plural English form for a cost other than 1", () => {
    expect(voiceCastingPreviewCreditCostText("en", 5)).toBe("Cost: 5 credits");
    expect(voiceCastingPreviewCreditCostText("en", 0)).toBe("Cost: 0 credits");
  });
});
