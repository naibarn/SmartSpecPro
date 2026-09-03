import { describe, expect, it } from "vitest";
import { formatEnhancedReadinessReasons } from "../VerticalDramaStoryboardPanel";

describe("formatEnhancedReadinessReasons", () => {
  it("renders actionable Thai labels for readiness blockers", () => {
    expect(
      formatEnhancedReadinessReasons(
        ["AGENT_RUNTIME_NOT_READY", "PROVIDER_CAPABILITY_MISMATCH"],
        "th"
      )
    ).toBe(
      "Enhanced runtime ยังไม่ผ่าน readiness • video model ไม่รองรับชุด frame/reference นี้"
    );
  });

  it("keeps unknown server reasons visible instead of hiding the blocker", () => {
    expect(formatEnhancedReadinessReasons(["NEW_BLOCKER_CODE"], "en")).toBe(
      "NEW BLOCKER CODE"
    );
  });
});
