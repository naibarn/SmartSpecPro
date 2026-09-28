import { describe, expect, it } from "vitest";
import { buildCuteChildPrompt } from "../../../skills/cute-child-image-generator/imported/runtime-example";

describe("Cute Child Image Generator age handling", () => {
  it("supports adult ages without describing the subject as a child", () => {
    const result = buildCuteChildPrompt({
      age: 18,
      gender_style: "girl",
      child_count: 1,
      scene_mode: "random_all",
      accessory_mode: "random",
    });

    expect(result.resolved.age_group).toBe("adult");
    expect(result.generation_prompt).toContain("18-year-old girl adult person");
    expect(result.generation_prompt).toContain(
      "Keep the subject clearly adult"
    );
    expect(result.generation_prompt).not.toContain(
      "Keep the subject clearly looking like a child"
    );
  });
});
