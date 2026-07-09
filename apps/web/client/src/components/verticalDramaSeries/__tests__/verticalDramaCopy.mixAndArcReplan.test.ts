import { describe, expect, it } from "vitest";

import {
  arcDriftReasonCopy,
  arcDriftReasonLabel,
  blendContributionSummary,
  blendFacetCopy,
  mixWeightLabel,
  tieInReplanMoveKickerText,
  underBlendedWarningText,
  visualStyleLabel,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES } from "@shared/verticalDramaSeries/contentBudget";
import { VERTICAL_DRAMA_BLEND_FACETS } from "@shared/verticalDramaSeries/presetVisualIdentity";

/**
 * Regression coverage for the section-13/15 Copy Contract strings — these
 * MUST stay verbatim in Thai (spec §7.7.3 / §8.2.2.C Copy Contract), since
 * `VerticalDramaArcReplanCard.tsx` and `VerticalDramaBlendReportPanel.tsx`
 * render them directly.
 */
describe("mixWeightLabel", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(mixWeightLabel("th", 3)).toBe("น้ำหนักการผสม 3/5");
  });

  it("renders every valid weight 1-5", () => {
    for (let weight = 1; weight <= 5; weight++) {
      expect(mixWeightLabel("th", weight)).toBe(`น้ำหนักการผสม ${weight}/5`);
    }
  });

  it("renders an English equivalent", () => {
    expect(mixWeightLabel("en", 4)).toBe("Mix weight 4/5");
  });
});

describe("blendContributionSummary", () => {
  it("renders the exact Copy Contract string in Thai, joining elements with a comma", () => {
    expect(blendContributionSummary("th", ["ฉากเปิดเรื่องแบบเข้มข้น", "ตัวร้ายลึกลับ"])).toBe(
      "สิ่งที่ preset นี้เพิ่มเข้ามา: ฉากเปิดเรื่องแบบเข้มข้น, ตัวร้ายลึกลับ",
    );
  });

  it("handles zero kept elements without crashing", () => {
    expect(blendContributionSummary("th", [])).toBe("สิ่งที่ preset นี้เพิ่มเข้ามา: (ไม่มี)");
    expect(blendContributionSummary("en", [])).toBe("What this preset contributed: (none)");
  });
});

describe("underBlendedWarningText", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(underBlendedWarningText("th", "องครักษ์ป่านีออน", 1, 2)).toBe(
      "preset 'องครักษ์ป่านีออน' ยังไม่ถูกผสมจริง (ครอบคลุม 1/2 ด้าน) — เพิ่มน้ำหนักหรือเลือกใหม่",
    );
  });
});

describe("visualStyleLabel", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(visualStyleLabel("th", "Neon Bio-Jungle Tech")).toBe("สไตล์ภาพ: Neon Bio-Jungle Tech");
  });
});

describe("arcDriftReasonCopy / arcDriftReasonLabel", () => {
  it("has a bilingual entry for every stable VD_ARC_* drift reason code", () => {
    for (const code of VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES) {
      expect(arcDriftReasonCopy[code].th.length).toBeGreaterThan(0);
      expect(arcDriftReasonCopy[code].en.length).toBeGreaterThan(0);
    }
  });

  it("looks up a known code in the requested language", () => {
    expect(arcDriftReasonLabel("th", "VD_ARC_HOOK_UNPLANNED")).toBe(arcDriftReasonCopy.VD_ARC_HOOK_UNPLANNED.th);
    expect(arcDriftReasonLabel("en", "VD_ARC_HOOK_UNPLANNED")).toBe(arcDriftReasonCopy.VD_ARC_HOOK_UNPLANNED.en);
  });

  it("falls back to the raw code for an unknown/future code instead of throwing", () => {
    expect(arcDriftReasonLabel("th", "VD_ARC_SOMETHING_NEW")).toBe("VD_ARC_SOMETHING_NEW");
  });

  it("has an entry for VD_ARC_TIE_IN_DEFERRED (task #31)", () => {
    expect(arcDriftReasonLabel("th", "VD_ARC_TIE_IN_DEFERRED")).toBe(
      arcDriftReasonCopy.VD_ARC_TIE_IN_DEFERRED.th,
    );
    expect(arcDriftReasonCopy.VD_ARC_TIE_IN_DEFERRED.th).not.toBe("VD_ARC_TIE_IN_DEFERRED");
  });
});

describe("tieInReplanMoveKickerText (task #31, spec §7.7.3)", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(tieInReplanMoveKickerText("th", 5, 8)).toBe("ข้อเสนอย้ายสินค้า: ตอน 5 → ตอน 8");
  });

  it("renders an English equivalent", () => {
    expect(tieInReplanMoveKickerText("en", 5, 8)).toBe(
      "Proposal to move the product: episode 5 → episode 8",
    );
  });
});

describe("blendFacetCopy", () => {
  it("has a bilingual entry for every one of the 8 blend facets", () => {
    for (const facet of VERTICAL_DRAMA_BLEND_FACETS) {
      expect(blendFacetCopy[facet].th.length).toBeGreaterThan(0);
      expect(blendFacetCopy[facet].en.length).toBeGreaterThan(0);
    }
  });
});
