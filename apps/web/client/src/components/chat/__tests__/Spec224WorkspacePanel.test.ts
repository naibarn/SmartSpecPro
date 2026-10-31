import { describe, expect, it } from "vitest";
import {
  preparationBlockerMessage,
  shouldOfferPromptStartAction,
} from "../Spec224WorkspacePanel";

describe("Spec224WorkspacePanel preparation blockers", () => {
  it("explains missing source evidence with a concrete next action", () => {
    expect(preparationBlockerMessage("WORKSPACE_SOURCE_FINGERPRINT_UNAVAILABLE"))
      .toContain("เลือก Workspace ที่เป็น Git repository");
  });

  it("explains why an empty Spec cannot start", () => {
    expect(preparationBlockerMessage("REQUIREMENTS_REQUIRED"))
      .toContain("เลือก Canonical SPEC หรือแนบไฟล์ Spec");
  });

  it("keeps unknown blocker details safe and actionable", () => {
    expect(preparationBlockerMessage("UNRECOGNIZED_INTERNAL_CODE"))
      .toBe("ยังเริ่มงานไม่ได้จนกว่าเงื่อนไขความปลอดภัยและความพร้อมจะผ่าน");
  });

  it("offers the simple prompt start action without bypassing readiness", () => {
    expect(shouldOfferPromptStartAction("prompt", true, "prompt")).toBe(true);
    expect(shouldOfferPromptStartAction("prompt", false, "prompt")).toBe(false);
    expect(shouldOfferPromptStartAction("spec_set", true, "prompt")).toBe(false);
  });
});
