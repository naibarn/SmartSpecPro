import { describe, expect, it } from "vitest";
import { getVerticalDramaAssuranceActionLabel, getVerticalDramaAssuranceCopy } from "../verticalDramaAssuranceCopy";

describe("Vertical Drama assurance copy", () => {
  it("keeps stable user-safe copy for stale and uncertain outcomes", () => {
    expect(getVerticalDramaAssuranceCopy("VD_ASSURANCE_CONTEXT_STALE")).toContain("เปลี่ยนแล้ว");
    expect(getVerticalDramaAssuranceCopy("VD_ASSURANCE_USAGE_UNKNOWN", "en")).toContain("uncertain");
  });

  it("does not invent a blocking action for unknown codes", () => {
    expect(getVerticalDramaAssuranceActionLabel("unknown_code", "en")).toContain("checking");
  });
});
