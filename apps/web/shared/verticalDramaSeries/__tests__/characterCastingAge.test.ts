import { describe, expect, it } from "vitest";
import {
  isCharacterCastingAgeRangeCompatible,
  parseCharacterCastingAgeRange,
  resolveCharacterCastingAgeProfile,
} from "../characterCastingAge";

describe("character casting age profile", () => {
  it("prefers explicit story facts over approved DNA and role inference", () => {
    expect(
      resolveCharacterCastingAgeProfile({
        ageMin: 30,
        ageMax: 35,
        approvedDnaAgeRange: "22-25",
        occupation: "นักศึกษา",
      }),
    ).toMatchObject({ min: 30, max: 35, source: "story_fact" });
  });

  it.each([
    ["นักศึกษา", 17, 19],
    ["วัยทำงานช่วงต้น", 22, 25],
    ["ผู้บริหารอาวุโส", 30, 35],
  ])("infers %s as the contextual age band", (occupation, min, max) => {
    expect(resolveCharacterCastingAgeProfile({ occupation })).toMatchObject({
      min,
      max,
      source: "role_context",
    });
  });

  it("supports under-18 age-stage profiles without adult clamping", () => {
    expect(
      resolveCharacterCastingAgeProfile({ ageStage: "มัธยม อายุ 17-19" }),
    ).toMatchObject({ min: 17, max: 19, isMinor: true });
    expect(resolveCharacterCastingAgeProfile({ roleTier: "child" })).toMatchObject({
      min: 8,
      max: 14,
      isMinor: true,
    });
  });

  it("does not invent a universal fallback when there is no meaningful context", () => {
    expect(resolveCharacterCastingAgeProfile({ role: "supporting" })).toBeNull();
  });

  it("parses decade labels and rejects material candidate drift", () => {
    expect(parseCharacterCastingAgeRange("early 20s")).toEqual({ min: 20, max: 23 });
    expect(isCharacterCastingAgeRangeCompatible("22-25", { min: 22, max: 25 })).toBe(true);
    expect(isCharacterCastingAgeRangeCompatible("30-35", { min: 22, max: 25 })).toBe(false);
  });
});
