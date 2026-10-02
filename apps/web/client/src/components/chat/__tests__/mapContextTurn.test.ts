import { describe, expect, it } from "vitest";
import { attachMapContextToUserTurn } from "../mapContextTurn";

describe("map context turn attachment", () => {
  it("preserves the user's existing draft and attaches bounded map context only when sent", () => {
    expect(attachMapContextToUserTurn("Check this area", "Public map area: 13.000, 100.000"))
      .toBe("Check this area\n\nPublic map area: 13.000, 100.000");
  });

  it("does not turn an empty composer into a context-only user message", () => {
    expect(attachMapContextToUserTurn("  ", "Public map area: 13.000, 100.000")).toBe("");
  });

  it("does not modify a user message when no context is attached", () => {
    expect(attachMapContextToUserTurn("  Help me understand this  ", undefined)).toBe("Help me understand this");
  });
});
