import { describe, expect, it } from "vitest";
import { parseSkillCreateAction } from "../skillActionContract";

const validAction = {
  type: "create_skill",
  name: "Example",
  slug: "example",
  description: "A test skill",
  skillContent: "Do the work",
  triggerPatterns: ["example request"],
};

describe("parseSkillCreateAction", () => {
  it("accepts a complete create-skill action", () => {
    expect(parseSkillCreateAction(validAction)).toEqual(validAction);
  });

  it("rejects missing or malformed fields from the runtime boundary", () => {
    expect(parseSkillCreateAction(undefined)).toBeNull();
    expect(
      parseSkillCreateAction({ ...validAction, skillContent: null })
    ).toBeNull();
    expect(
      parseSkillCreateAction({ ...validAction, triggerPatterns: [1] })
    ).toBeNull();
  });
});
