import { describe, expect, it } from "vitest";
import {
  resolveVerticalDramaFormatProfile,
  resolveTieInEpisodeBudget,
  VD_FORMAT_PROFILE_ULTRA_SHORT_MAX_EPISODES,
  VD_FORMAT_PROFILE_SHORT_MAX_EPISODES,
  VD_FORMAT_PROFILES_ROLLOUT,
  VERTICAL_DRAMA_FORMAT_PROFILE_TIERS,
  type VerticalDramaFormatProfile,
} from "../formatProfiles";

describe("resolveVerticalDramaFormatProfile — tier boundaries", () => {
  it("pins the documented boundary constants (5 / 12)", () => {
    expect(VD_FORMAT_PROFILE_ULTRA_SHORT_MAX_EPISODES).toBe(5);
    expect(VD_FORMAT_PROFILE_SHORT_MAX_EPISODES).toBe(12);
  });

  it("resolves 3 episodes to ultra_short (the owner's specific concern)", () => {
    expect(resolveVerticalDramaFormatProfile(3).tier).toBe("ultra_short");
  });

  it("resolves 5 episodes (the ultra_short ceiling) to ultra_short", () => {
    expect(resolveVerticalDramaFormatProfile(5).tier).toBe("ultra_short");
  });

  it("resolves 6 episodes (one past the ultra_short ceiling) to short", () => {
    expect(resolveVerticalDramaFormatProfile(6).tier).toBe("short");
  });

  it("resolves 12 episodes (the short ceiling) to short", () => {
    expect(resolveVerticalDramaFormatProfile(12).tier).toBe("short");
  });

  it("resolves 13 episodes (one past the short ceiling) to standard", () => {
    expect(resolveVerticalDramaFormatProfile(13).tier).toBe("standard");
  });

  it("resolves a large season (e.g. 100 episodes) to standard", () => {
    expect(resolveVerticalDramaFormatProfile(100).tier).toBe("standard");
  });
});

describe("resolveVerticalDramaFormatProfile — never throws, clamps weird inputs to standard", () => {
  it("clamps 0 and negative counts to standard", () => {
    expect(resolveVerticalDramaFormatProfile(0).tier).toBe("standard");
    expect(resolveVerticalDramaFormatProfile(-1).tier).toBe("standard");
    expect(resolveVerticalDramaFormatProfile(-100).tier).toBe("standard");
  });

  it("clamps NaN and Infinity to standard without throwing", () => {
    expect(() => resolveVerticalDramaFormatProfile(NaN)).not.toThrow();
    expect(resolveVerticalDramaFormatProfile(NaN).tier).toBe("standard");
    expect(resolveVerticalDramaFormatProfile(Number.POSITIVE_INFINITY).tier).toBe("standard");
    expect(resolveVerticalDramaFormatProfile(Number.NEGATIVE_INFINITY).tier).toBe("standard");
  });

  it("clamps non-numeric runtime input (a caller ignoring the TS type) to standard without throwing", () => {
    expect(() =>
      resolveVerticalDramaFormatProfile(undefined as unknown as number)
    ).not.toThrow();
    expect(resolveVerticalDramaFormatProfile(undefined as unknown as number).tier).toBe(
      "standard"
    );
    expect(resolveVerticalDramaFormatProfile(null as unknown as number).tier).toBe(
      "standard"
    );
    expect(resolveVerticalDramaFormatProfile("3" as unknown as number).tier).toBe(
      "standard"
    );
  });

  it("floors a non-integer count instead of treating it as unusable", () => {
    expect(resolveVerticalDramaFormatProfile(3.7).tier).toBe("ultra_short");
    expect(resolveVerticalDramaFormatProfile(5.9).tier).toBe("ultra_short");
    expect(resolveVerticalDramaFormatProfile(12.9).tier).toBe("short");
    expect(resolveVerticalDramaFormatProfile(13.1).tier).toBe("standard");
  });
});

describe("resolveVerticalDramaFormatProfile — profile field content", () => {
  it("ultra_short: requires a cold-open hook within 3s, key characters by episode 1, +1 stricter judge hook floor", () => {
    const profile = resolveVerticalDramaFormatProfile(3);
    expect(profile.nameTh).toBe("ซีรีส์สั้นมาก");
    expect(profile.perEpisodeHookRule).toEqual({
      requireColdOpenHook: true,
      hookWithinSeconds: 3,
    });
    expect(profile.dramaturgy.keyCharacterLateIntroMaxEpisode).toBe(1);
    expect(profile.judge.hookStrengthFloorDelta).toBe(1);
    expect(profile.beatDensityGuidanceTh).toContain("filler");
    expect(profile.beatDensityGuidanceEn.length).toBeGreaterThan(0);
  });

  it("short: requires a cold-open hook within 5s, key characters by episode 2, unchanged judge floor", () => {
    const profile = resolveVerticalDramaFormatProfile(9);
    expect(profile.nameTh).toBe("ซีรีส์สั้น");
    expect(profile.perEpisodeHookRule).toEqual({
      requireColdOpenHook: true,
      hookWithinSeconds: 5,
    });
    expect(profile.dramaturgy.keyCharacterLateIntroMaxEpisode).toBe(2);
    expect(profile.judge.hookStrengthFloorDelta).toBe(0);
  });

  it("standard: no forced cold-open hook, unchanged judge floor", () => {
    const profile = resolveVerticalDramaFormatProfile(20);
    expect(profile.perEpisodeHookRule).toEqual({
      requireColdOpenHook: false,
      hookWithinSeconds: 8,
    });
    expect(profile.judge.hookStrengthFloorDelta).toBe(0);
  });

  it("every tier declares exactly the 3 documented tier ids", () => {
    expect(VERTICAL_DRAMA_FORMAT_PROFILE_TIERS).toEqual(["ultra_short", "short", "standard"]);
  });
});

describe("tie-in proration — profile.tieIn.maxEpisodesWithTieIn and resolveTieInEpisodeBudget", () => {
  function bothWays(
    profile: VerticalDramaFormatProfile,
    plannedCount: number,
    perTenCap: number
  ): number {
    const viaProfile = profile.tieIn.maxEpisodesWithTieIn(plannedCount, perTenCap);
    const viaHelper = resolveTieInEpisodeBudget(profile, plannedCount, perTenCap);
    expect(viaHelper).toBe(viaProfile);
    return viaProfile;
  }

  it("prorates ceil(perTenCap * plannedCount / 10)", () => {
    const profile = resolveVerticalDramaFormatProfile(10);
    expect(bothWays(profile, 10, 3)).toBe(3); // ceil(30/10) = 3
    expect(bothWays(profile, 20, 2)).toBe(4); // ceil(40/10) = 4
  });

  it("floors the result at 1 whenever plannedCount >= 3, even if the raw proration rounds to 0", () => {
    const profile = resolveVerticalDramaFormatProfile(3);
    expect(bothWays(profile, 3, 0)).toBe(1); // ceil(0) = 0, but plannedCount >= 3 -> floored to 1
    expect(bothWays(profile, 3, 1)).toBe(1); // ceil(0.3) = 1, already >= 1
  });

  it("does NOT apply the floor when plannedCount < 3", () => {
    const profile = resolveVerticalDramaFormatProfile(2);
    expect(bothWays(profile, 2, 0)).toBe(0);
    expect(bothWays(profile, 0, 5)).toBe(0);
  });

  it("clamps a negative/non-finite plannedCount to 0 instead of throwing (no floor applies below 3)", () => {
    const profile = resolveVerticalDramaFormatProfile(3);
    expect(() => bothWays(profile, -5, 3)).not.toThrow();
    expect(bothWays(profile, -5, 3)).toBe(0);
    expect(bothWays(profile, NaN, 3)).toBe(0);
  });

  it("clamps a negative/non-finite perTenCap to 0, but the >= 1 floor still applies once plannedCount >= 3", () => {
    const profile = resolveVerticalDramaFormatProfile(3);
    expect(() => bothWays(profile, 10, -1)).not.toThrow();
    expect(bothWays(profile, 10, -1)).toBe(1);
    expect(bothWays(profile, 10, NaN)).toBe(1);
  });

  it("uses the SAME proration formula regardless of tier", () => {
    const ultraShort = resolveVerticalDramaFormatProfile(3);
    const short = resolveVerticalDramaFormatProfile(9);
    const standard = resolveVerticalDramaFormatProfile(20);
    expect(ultraShort.tieIn.maxEpisodesWithTieIn(10, 3)).toBe(3);
    expect(short.tieIn.maxEpisodesWithTieIn(10, 3)).toBe(3);
    expect(standard.tieIn.maxEpisodesWithTieIn(10, 3)).toBe(3);
  });
});

describe("VD_FORMAT_PROFILES_ROLLOUT marker", () => {
  it("is the flag-pending sentinel until F131X is registered", () => {
    expect(VD_FORMAT_PROFILES_ROLLOUT).toBe("flag_pending");
  });
});
