import { describe, expect, it } from "vitest";
import {
  canAddSpecialReferences,
  resolveSpecialTieInCharacterId,
  specialEpisodeLabel,
  toggleBoundedSelection,
} from "./specialTieInUi";

describe("special tie-in UI constraints", () => {
  it("enforces the aggregate three-reference cap", () => {
    expect(canAddSpecialReferences(1, 2)).toBe(true);
    expect(canAddSpecialReferences(2, 2)).toBe(false);
  });
  it("keeps bounded character/speaker selections deterministic", () => {
    expect(toggleBoundedSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleBoundedSelection(["a"], "b", 2)).toEqual(["a", "b"]);
    expect(toggleBoundedSelection(["a", "b"], "a", 2)).toEqual(["b"]);
  });
  it("uses the server characterId as the stable selection and portrait key", () => {
    expect(
      resolveSpecialTieInCharacterId({ characterId: "42", id: "legacy-42" })
    ).toBe("42");
    expect(resolveSpecialTieInCharacterId({ id: 7 })).toBe("7");
    expect(resolveSpecialTieInCharacterId({})).toBe("");
  });
  it("labels special episodes independently from normal episode numbers", () => {
    expect(specialEpisodeLabel(3, "th")).toBe("ตอนพิเศษ 03");
    expect(specialEpisodeLabel(3, "en")).toBe("SPECIAL 03");
  });
});
