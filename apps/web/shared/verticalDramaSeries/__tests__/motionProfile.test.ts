import { describe, expect, it } from "vitest";

import {
  VD_CAMERA_MOTIONS,
  VD_FACINGS,
  VD_IDENTITY_RISKS,
  VD_TURN_MAGNITUDES,
  deriveMotionRiskFloor,
  parseMotionProfile,
  resolveEffectiveIdentityRisk,
  resolveMotionProfile,
  type VdMotionProfile,
  type VdMotionProfileCharacter,
} from "../motionProfile";

function character(
  overrides: Partial<VdMotionProfileCharacter> = {},
): VdMotionProfileCharacter {
  return {
    name: "Aria",
    startFacing: "frontal",
    endFacing: "frontal",
    turnMagnitude: "none",
    revealsHiddenSide: false,
    ...overrides,
  };
}

function profile(overrides: Partial<VdMotionProfile> = {}): VdMotionProfile {
  return {
    characters: [character()],
    cameraMotion: "locked",
    newCharacterEnters: false,
    identityRisk: "low",
    riskReasons: [],
    ...overrides,
  };
}

const validWireProfile = {
  characters: [{
    name: " Aria ",
    start_facing: "Three Quarter",
    end_facing: "profile",
    turn_magnitude: "moderate",
    reveals_hidden_side: false,
  }],
  camera_motion: "small-pan-tilt",
  new_character_enters: false,
  identity_risk: "low",
  risk_reasons: [" face turns "],
};

describe("motion risk floor", () => {
  it.each([
    [profile({ characters: [character({ revealsHiddenSide: true })] }), "high"],
    [profile({ characters: [character({ turnMagnitude: "large" })] }), "high"],
    [profile({ cameraMotion: "orbit" }), "high"],
    [profile({ cameraMotion: "large_reframe" }), "high"],
    [profile({ newCharacterEnters: true }), "high"],
    [profile({ characters: [character({ turnMagnitude: "moderate" })] }), "medium"],
    [profile({ characters: [character({ startFacing: "profile", turnMagnitude: "subtle" })] }), "medium"],
    [profile({ characters: [character({ startFacing: "back_of_head", turnMagnitude: "subtle" })] }), "medium"],
    [profile({ characters: [character({ startFacing: "not_visible", turnMagnitude: "subtle" })] }), "medium"],
    [profile({ characters: [character({ startFacing: "profile", turnMagnitude: "none" })] }), "low"],
    [profile({ characters: [] }), "low"],
  ] as const)("derives %s", (input, expected) => {
    expect(deriveMotionRiskFloor(input)).toBe(expected);
  });

  it("uses the worst character, not the first", () => {
    expect(deriveMotionRiskFloor(profile({
      characters: [character(), character({ name: "B", turnMagnitude: "large" })],
    }))).toBe("high");
  });

  it("never lowers the skill risk and raises it to a higher floor", () => {
    expect(resolveEffectiveIdentityRisk(profile({ identityRisk: "high" }))).toBe("high");
    expect(resolveEffectiveIdentityRisk(profile({
      identityRisk: "low",
      cameraMotion: "orbit",
    }))).toBe("high");
    expect(resolveEffectiveIdentityRisk(profile({
      identityRisk: "medium",
      characters: [character({ turnMagnitude: "moderate" })],
    }))).toBe("medium");
  });
});

describe("motion profile parsing", () => {
  it.each([undefined, null, ""])("classifies absent output as missing", raw => {
    expect(parseMotionProfile(raw)).toEqual({ status: "missing" });
  });

  it.each([{}, [], "nope", 1, { characters: [] }])(
    "classifies malformed or incomplete output as invalid",
    raw => {
      expect(parseMotionProfile(raw)).toEqual({ status: "invalid" });
      expect(resolveMotionProfile(raw)).toBeUndefined();
    },
  );

  it("emits only a complete profile and computes effective risk", () => {
    expect(parseMotionProfile(validWireProfile)).toEqual({
      status: "emitted",
      profile: {
        characters: [{
          name: "Aria",
          startFacing: "three_quarter",
          endFacing: "profile",
          turnMagnitude: "moderate",
          revealsHiddenSide: false,
        }],
        cameraMotion: "small_pan_tilt",
        newCharacterEnters: false,
        identityRisk: "low",
        riskReasons: ["face turns"],
      },
      effectiveRisk: "medium",
    });
  });

  it("accepts camelCase persisted profiles and round-trips", () => {
    const once = resolveMotionProfile(validWireProfile);
    expect(once).toBeDefined();
    expect(resolveMotionProfile(once)).toEqual(once);
  });

  it("normalizes enum formatting but rejects unknown enums", () => {
    expect(resolveMotionProfile(validWireProfile)?.characters[0].startFacing)
      .toBe("three_quarter");
    expect(parseMotionProfile({ ...validWireProfile, camera_motion: "static" }))
      .toEqual({ status: "invalid" });
  });

  it("does not coerce missing required fields to safe-looking defaults", () => {
    const { identity_risk: _omitted, ...withoutRisk } = validWireProfile;
    expect(parseMotionProfile(withoutRisk)).toEqual({ status: "invalid" });
  });

  it("accepts true/false boolean strings but rejects speculative values", () => {
    expect(resolveMotionProfile({
      ...validWireProfile,
      new_character_enters: "TRUE ",
      characters: [{
        ...validWireProfile.characters[0],
        reveals_hidden_side: "false",
      }],
    })).toMatchObject({ newCharacterEnters: true, characters: [{ revealsHiddenSide: false }] });
    expect(parseMotionProfile({ ...validWireProfile, new_character_enters: "yes" }))
      .toEqual({ status: "invalid" });
  });

  it("bounds names, roster size, and risk reasons without mutating input", () => {
    const raw = {
      ...validWireProfile,
      characters: Array.from({ length: 8 }, (_, index) => ({
        ...validWireProfile.characters[0],
        name: `${index}-${"x".repeat(100)}`,
      })),
      risk_reasons: [" ", ...Array.from({ length: 8 }, () => "r".repeat(250))],
    };
    const snapshot = structuredClone(raw);
    const resolved = resolveMotionProfile(raw);
    expect(resolved?.characters).toHaveLength(6);
    expect(resolved?.characters.every(entry => entry.name.length <= 80)).toBe(true);
    expect(resolved?.riskReasons).toHaveLength(6);
    expect(resolved?.riskReasons.every(reason => reason.length <= 200)).toBe(true);
    expect(raw).toEqual(snapshot);
  });
});

describe("frozen motion-profile enums", () => {
  it("matches the documented closed sets", () => {
    expect(VD_FACINGS).toEqual(["frontal", "three_quarter", "profile", "back_of_head", "not_visible"]);
    expect(VD_TURN_MAGNITUDES).toEqual(["none", "subtle", "moderate", "large"]);
    expect(VD_CAMERA_MOTIONS).toEqual(["locked", "push_in", "pull_back", "small_pan_tilt", "small_lateral", "orbit", "large_reframe"]);
    expect(VD_IDENTITY_RISKS).toEqual(["low", "medium", "high"]);
  });
});
