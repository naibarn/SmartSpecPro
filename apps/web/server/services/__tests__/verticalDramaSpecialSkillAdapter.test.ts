import { describe, expect, it } from "vitest";
import {
  extractSpecialExactDialogueLines,
  validateSpecialSkillOutput,
} from "../verticalDramaSpecialSkillAdapter";

const shot = (number: number) => ({
  shot_number: number,
  image_prompt: "start frame",
  video_prompt: "motion prompt",
  reference_ids: [],
});
describe("special skill output contract", () => {
  it("accepts exactly nine sequential shots", () => {
    const result = validateSpecialSkillOutput({
      status: "ready",
      aspect_ratio: "9:16",
      shot_duration_seconds: 12,
      shot_count: 9,
      shots: Array.from({ length: 9 }, (_, index) => shot(index + 1)),
    });
    expect(result.shots).toHaveLength(9);
  });
  it("rejects padding or duration drift", () => {
    expect(() =>
      validateSpecialSkillOutput({
        status: "ready",
        aspect_ratio: "9:16",
        shot_duration_seconds: 10,
        shot_count: 9,
        shots: [shot(1)],
      })
    ).toThrow();
    expect(() =>
      validateSpecialSkillOutput({
        status: "ready",
        aspect_ratio: "9:16",
        shot_duration_seconds: 12,
        shot_count: 9,
        shots: [{ ...shot(1), shot_number: 2 }],
      })
    ).toThrow();
  });
  it("extracts only explicitly locked dialogue lines", () => {
    expect(
      extractSpecialExactDialogueLines(
        "EXACT: สระผมด้วยแชมพูนี้\nแนวทาง: เป็นธรรมชาติ\nตรงตัว: ล้างออกให้หมด"
      )
    ).toEqual(["สระผมด้วยแชมพูนี้", "ล้างออกให้หมด"]);
  });
});
