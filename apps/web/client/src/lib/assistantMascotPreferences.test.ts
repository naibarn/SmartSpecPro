import { describe, expect, it } from "vitest";
import {
  assistantMascotStorageKey,
  DEFAULT_ASSISTANT_MASCOT_PREFERENCES,
  effectiveMascotMotion,
  loadAssistantMascotPreferences,
  MAX_ASSISTANT_MASCOT_PREFERENCES_LENGTH,
  parseAssistantMascotPreferences,
} from "./assistantMascotPreferences";

describe("assistant mascot preferences", () => {
  it("uses a tenant and user scoped key", () => {
    expect(assistantMascotStorageKey("u/1", "t 2")).toBe(
      "assistant-mascot:v2:t%202:u%2F1"
    );
  });

  it("rejects unknown versions and malformed preferences", () => {
    expect(
      parseAssistantMascotPreferences({
        ...DEFAULT_ASSISTANT_MASCOT_PREFERENCES,
        version: 1,
      })
    ).toBeNull();
    expect(
      parseAssistantMascotPreferences({
        ...DEFAULT_ASSISTANT_MASCOT_PREFERENCES,
        style: "unknown",
      })
    ).toBeNull();
  });

  it("falls back safely if storage is unavailable or invalid", () => {
    expect(
      loadAssistantMascotPreferences({ getItem: () => "{" }, "key")
    ).toEqual(DEFAULT_ASSISTANT_MASCOT_PREFERENCES);
    expect(
      loadAssistantMascotPreferences(
        {
          getItem: () => {
            throw new Error("blocked");
          },
        },
        "key"
      )
    ).toEqual(DEFAULT_ASSISTANT_MASCOT_PREFERENCES);
  });

  it("rejects oversized local preferences before parsing", () => {
    const validPayload = JSON.stringify(DEFAULT_ASSISTANT_MASCOT_PREFERENCES);
    expect(
      loadAssistantMascotPreferences(
        { getItem: () => `${validPayload}${" ".repeat(MAX_ASSISTANT_MASCOT_PREFERENCES_LENGTH)}` },
        "key"
      )
    ).toEqual(DEFAULT_ASSISTANT_MASCOT_PREFERENCES);
  });

  it("always honors reduced motion", () => {
    expect(effectiveMascotMotion("normal", true)).toBe("off");
    expect(effectiveMascotMotion("subtle", false)).toBe("subtle");
  });
});
