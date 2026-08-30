import { describe, expect, it } from "vitest";
import { VD_SERIES_PROFILE_IDS } from "../seriesProfile";
import { buildVerticalDramaAssuranceAcceptanceCases, VERTICAL_DRAMA_ASSURANCE_STAGE_IDS, VERTICAL_DRAMA_PROFILE_ACCEPTANCE_MATRIX, VERTICAL_DRAMA_VISUAL_SOURCE_COVERAGE_MATRIX } from "./fixtures/assuranceProductionMatrix";

describe("Vertical Drama assurance production matrix", () => {
  it("covers every authoritative profile exactly once", () => {
    const cases = buildVerticalDramaAssuranceAcceptanceCases();
    expect(cases).toHaveLength(VD_SERIES_PROFILE_IDS.length);
    expect(new Set(cases.map(item => item.profileId)).size).toBe(VD_SERIES_PROFILE_IDS.length);
    for (const profileId of VD_SERIES_PROFILE_IDS) expect(VERTICAL_DRAMA_PROFILE_ACCEPTANCE_MATRIX[profileId]).toBeTruthy();
  });

  it("covers the complete stage and visual-source enum surfaces", () => {
    expect(VERTICAL_DRAMA_ASSURANCE_STAGE_IDS).toContain("final_gate");
    expect(VERTICAL_DRAMA_VISUAL_SOURCE_COVERAGE_MATRIX.roles).toContain("b_roll_footage");
    expect(VERTICAL_DRAMA_VISUAL_SOURCE_COVERAGE_MATRIX.origins).toContain("user_upload");
    expect(VERTICAL_DRAMA_VISUAL_SOURCE_COVERAGE_MATRIX.fitModes).toContain("crop_safe");
  });
});
