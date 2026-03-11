import { describe, expect, it } from "vitest";

import { createEnabledModelIdSet, pickEnabledModelId } from "./enabledModelSelection";

describe("createEnabledModelIdSet", () => {
  it("filters blank ids", () => {
    expect(createEnabledModelIdSet(["gpt-4o", "", null, "claude"]).size).toBe(2);
  });
});

describe("pickEnabledModelId", () => {
  it("returns preferred id when enabled", () => {
    expect(
      pickEnabledModelId({
        preferredId: "gpt-4o",
        allowedIds: ["gpt-4o", "claude-sonnet-4"],
        fallbackIds: ["claude-sonnet-4"],
      }),
    ).toBe("gpt-4o");
  });

  it("falls back to first enabled fallback id", () => {
    expect(
      pickEnabledModelId({
        preferredId: "disabled-model",
        allowedIds: ["gpt-4o", "claude-sonnet-4"],
        fallbackIds: ["", "claude-sonnet-4", "gpt-4o"],
      }),
    ).toBe("claude-sonnet-4");
  });

  it("returns empty string when nothing is enabled", () => {
    expect(
      pickEnabledModelId({
        preferredId: "disabled-model",
        allowedIds: [],
        fallbackIds: ["also-disabled"],
      }),
    ).toBe("");
  });
});
