import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertStoryboardSkillInputs,
  assertModelSelection,
  filterParentOwnedSkillFields,
  getStoryboardSkillSchema,
  listCompatibleStoryboardSkills,
  normalizeModelCapability,
} from "../storyboardSkillRegistry";

const root = path.resolve(process.cwd(), "skills");

describe("storyboard skill registry", () => {
  it("discovers the nested Cute Child v3 bundle and normalizes its canonical ID", () => {
    const skill = getStoryboardSkillSchema("cute-child-image-generator", root);
    expect(skill.skillId).toBe("cute_child_image_generator");
    expect(skill.version).toBe("3.0.0");
    expect(skill.capabilities.maxReferenceImages).toBe(5);
    expect(
      listCompatibleStoryboardSkills(root).some(
        item => item.skillId === skill.skillId
      )
    ).toBe(true);
  });

  it("does not return parent-owned fields to the dynamic renderer", () => {
    const skill = getStoryboardSkillSchema("cute_child_image_generator", root);
    const fields = filterParentOwnedSkillFields(skill);
    expect(fields).not.toHaveProperty("idea");
    expect(fields).toHaveProperty("identity_lock_mode");
  });

  it("shows quality only when the selected model declares it", () => {
    const capability = normalizeModelCapability({
      id: "gpt-image-2.5",
      type: "image",
      configJson: {
        inputFields: [{ name: "quality", options: ["standard", "xhigh"] }],
      },
    });
    expect(capability.qualityOptions).toEqual(["standard", "xhigh"]);
    expect(() =>
      assertModelSelection(capability, {
        modelId: "gpt-image-2.5",
        quality: "low",
      })
    ).toThrow("quality");
  });

  it("validates dynamic skill values against the selected skill schema", () => {
    const skill = getStoryboardSkillSchema("cute_child_image_generator", root);
    expect(() =>
      assertStoryboardSkillInputs(skill, {
        identity_lock_mode: "not-a-mode",
      })
    ).toThrow("identity_lock_mode");
    expect(() =>
      assertStoryboardSkillInputs(skill, {
        age: 13,
      })
    ).toThrow("age");
    expect(() =>
      assertStoryboardSkillInputs(skill, {
        child_count: 2,
        identity_lock_mode: "strong",
      })
    ).not.toThrow();
  });
});
