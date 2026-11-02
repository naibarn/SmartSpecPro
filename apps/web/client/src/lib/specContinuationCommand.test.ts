import { describe, expect, it } from "vitest";
import { isSpecContinuationCommand } from "./specContinuationCommand";

describe("isSpecContinuationCommand", () => {
  it("recognizes a direct Thai request to continue a numbered SPEC", () => {
    expect(isSpecContinuationCommand("ให้ทำงานพัฒนา spec 312 ต่อจากเดิม")).toBe(true);
  });

  it("recognizes an explicit English resume request", () => {
    expect(isSpecContinuationCommand("Continue work on SPEC-312 from where it stopped")).toBe(true);
  });

  it("does not intercept questions or requests without a SPEC number", () => {
    expect(isSpecContinuationCommand("spec 312 คืออะไร")).toBe(false);
    expect(isSpecContinuationCommand("ช่วยทำงานพัฒนาต่อจากเดิม")).toBe(false);
  });
});
