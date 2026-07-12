import { describe, it, expect } from "vitest";
import { buildDetectLocationsSummaryMessage } from "../VerticalDramaLocationStockPanel";

describe("buildDetectLocationsSummaryMessage", () => {
  it("returns a distinct 'nothing found' message when both counts are zero", () => {
    expect(
      buildDetectLocationsSummaryMessage("th", { locationsCreated: 0, locationsReused: 0 }),
    ).toBe("ไม่พบฉากใหม่จากเนื้อเรื่องปัจจุบัน");
    expect(
      buildDetectLocationsSummaryMessage("en", { locationsCreated: 0, locationsReused: 0 }),
    ).toBe("No new locations found in the current story");
  });

  it("summarizes created and reused counts when either is non-zero", () => {
    expect(
      buildDetectLocationsSummaryMessage("th", { locationsCreated: 3, locationsReused: 1 }),
    ).toBe("สร้างฉากใหม่ 3 รายการ, ใช้ฉากเดิม 1 รายการ");
    expect(
      buildDetectLocationsSummaryMessage("en", { locationsCreated: 3, locationsReused: 1 }),
    ).toBe("Created 3 location(s), matched 1 existing");
  });

  it("does not use the zero-message when only one count is non-zero", () => {
    expect(
      buildDetectLocationsSummaryMessage("en", { locationsCreated: 0, locationsReused: 2 }),
    ).toBe("Created 0 location(s), matched 2 existing");
  });
});
