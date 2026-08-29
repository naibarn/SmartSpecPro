import { describe, expect, it } from "vitest";
import { validateSpecialSkillOutput } from "../verticalDramaSpecialSkillAdapter";

const shot = (number: number) => ({ shot_number: number, image_prompt: "start frame", video_prompt: "motion prompt", reference_ids: [] });
describe("special skill output contract", () => {
  it("accepts one-to-five sequential shots", () => {
    const result = validateSpecialSkillOutput({ status: "ready", aspect_ratio: "9:16", shot_duration_seconds: 12, shot_count: 2, shots: [shot(1), shot(2)] });
    expect(result.shots).toHaveLength(2);
  });
  it("rejects padding or duration drift", () => {
    expect(() => validateSpecialSkillOutput({ status: "ready", aspect_ratio: "9:16", shot_duration_seconds: 10, shot_count: 2, shots: [shot(1)] })).toThrow();
    expect(() => validateSpecialSkillOutput({ status: "ready", aspect_ratio: "9:16", shot_duration_seconds: 12, shot_count: 1, shots: [{ ...shot(1), shot_number: 2 }] })).toThrow();
  });
});
