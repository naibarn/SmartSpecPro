import { describe, expect, it } from "vitest";
import {
  coerceStoryboardSkillInputValue,
  isNumericStoryboardSkillInput,
} from "./storyboardSkillInput";

describe("storyboard skill input coercion", () => {
  it("treats nullable integer schemas as numeric inputs", () => {
    const schema = { type: ["integer", "null"] };

    expect(isNumericStoryboardSkillInput(schema)).toBe(true);
    expect(coerceStoryboardSkillInputValue(schema, "3")).toBe(3);
    expect(coerceStoryboardSkillInputValue(schema, "")).toBeUndefined();
  });

  it("coerces nullable number schemas without converting blank values to zero", () => {
    const schema = { type: ["number", "null"] };

    expect(coerceStoryboardSkillInputValue(schema, "1.5")).toBe(1.5);
    expect(coerceStoryboardSkillInputValue(schema, "")).toBeUndefined();
  });

  it("leaves text inputs as strings", () => {
    expect(
      coerceStoryboardSkillInputValue({ type: ["string", "null"] }, "hello")
    ).toBe("hello");
  });
});
