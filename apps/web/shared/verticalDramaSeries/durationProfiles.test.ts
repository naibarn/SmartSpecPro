import { describe, expect, it } from "vitest";
import {
  VERTICAL_DRAMA_LOGICAL_SHOT_COUNT,
  createMixedVerticalDramaDurationPlan,
  createUniformVerticalDramaDurationPlan,
  deriveVerticalDramaEpisodeRuntimeSeconds,
  formatVerticalDramaDurationPlan,
  readVerticalDramaDurationPlan,
  resolveVerticalDramaEpisodeDurationPlan,
  resolveVerticalDramaDurationPlan,
} from "./durationProfiles";

describe("Vertical Drama duration profiles", () => {
  it("derives a uniform episode runtime from nine logical shots", () => {
    const plan = createUniformVerticalDramaDurationPlan(15);
    expect(plan.shotDurationsSeconds).toHaveLength(VERTICAL_DRAMA_LOGICAL_SHOT_COUNT);
    expect(deriveVerticalDramaEpisodeRuntimeSeconds(plan)).toBe(135);
    expect(formatVerticalDramaDurationPlan(plan, "th")).toContain("9 ช็อต × 15 วินาที");
  });

  it("supports a mixed provider profile without changing logical shot count", () => {
    const plan = createMixedVerticalDramaDurationPlan([8, 8, 10, 10, 15, 15, 20, 25, 30]);
    expect(plan.shotDurationsSeconds).toHaveLength(9);
    expect(deriveVerticalDramaEpisodeRuntimeSeconds(plan)).toBe(141);
  });

  it("does not accept unsupported or incomplete profiles", () => {
    expect(() => createUniformVerticalDramaDurationPlan(60)).toThrow(
      "Unsupported Vertical Drama shot duration"
    );
    expect(() => createMixedVerticalDramaDurationPlan([8, 8])).toThrow(
      "must contain 9"
    );
  });

  it("reads new bible plans but keeps legacy records as compatibility only", () => {
    const plan = createUniformVerticalDramaDurationPlan(20);
    expect(readVerticalDramaDurationPlan(plan)?.profileId).toBe(
      "vertical_drama_20s_x9_shots"
    );
    expect(resolveVerticalDramaDurationPlan({}, 60)?.status).toBe("legacy_compat");
    expect(resolveVerticalDramaDurationPlan({})).toBeNull();
  });

  it("rejects active plans with unsupported or non-uniform declared values", () => {
    expect(
      readVerticalDramaDurationPlan({
        ...createUniformVerticalDramaDurationPlan(15),
        shotDurationsSeconds: [15, 15, 15, 15, 15, 15, 15, 15, 60],
      })
    ).toBeNull();
    expect(
      readVerticalDramaDurationPlan({
        ...createUniformVerticalDramaDurationPlan(15),
        shotDurationSeconds: 20,
      })
    ).toBeNull();
  });

  it("reconstructs an episode snapshot after the series profile changes", () => {
    const plan = resolveVerticalDramaEpisodeDurationPlan(
      "vertical_drama_10s_x9_shots",
      90
    );
    expect(plan?.status).toBe("active");
    expect(plan?.shotDurationsSeconds).toEqual(Array(9).fill(10));
    expect(
      resolveVerticalDramaEpisodeDurationPlan("vertical_drama_10s_x9_shots", 135)
    ).toBeNull();
  });
});
