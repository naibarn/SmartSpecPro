import { describe, expect, it } from "vitest";
import {
  deriveVerticalDramaSpokenCallerVirtualScreens,
  renderVerticalDramaSpokenCallerVirtualScreenPromptBlock,
} from "./spokenCallerVirtualScreen";

describe("spoken caller virtual-screen policy", () => {
  it("creates one vertical screen and removes the spoken caller from physical refs", () => {
    const result = deriveVerticalDramaSpokenCallerVirtualScreens({
      physicalSceneCharacterRefs: ["phakin", "krit"],
      screenCallerCharacterRefs: ["krit"],
      dialogueSpeakerRefs: ["krit"],
    });

    expect(result.physicalSceneCharacterRefs).toEqual(["phakin"]);
    expect(result.spokenScreenCallerCharacterRefs).toEqual(["krit"]);
    expect(result.virtualScreens).toEqual([
      { callerCharacterRef: "krit", screenIndex: 1, orientation: "vertical", visibleFaceRequired: true },
    ]);
    expect(renderVerticalDramaSpokenCallerVirtualScreenPromptBlock(result)).toContain(
      "dedicated vertical virtual phone screen",
    );
  });

  it("creates separate screens in first-speaking order and supports display-name aliases", () => {
    const result = deriveVerticalDramaSpokenCallerVirtualScreens({
      physicalSceneCharacterRefs: ["phakin", "krit", "wara"],
      screenCallerCharacterRefs: ["krit", "wara"],
      dialogueSpeakerRefs: ["Wara", "krit", "Wara"],
      characterAliases: { krit: ["Krit"], wara: ["Wara"] },
    });

    expect(result.physicalSceneCharacterRefs).toEqual(["phakin"]);
    expect(result.spokenScreenCallerCharacterRefs).toEqual(["wara", "krit"]);
    expect(result.virtualScreens.map(screen => screen.screenIndex)).toEqual([1, 2]);
    expect(result.virtualScreens.map(screen => screen.callerCharacterRef)).toEqual([
      "wara",
      "krit",
    ]);
  });

  it("renders an explicit face lock against the attached caller reference image", () => {
    const result = deriveVerticalDramaSpokenCallerVirtualScreens({
      physicalSceneCharacterRefs: ["phakin"],
      screenCallerCharacterRefs: ["krit"],
      dialogueSpeakerRefs: ["krit"],
      faceReferenceImageIndexByCharacterRef: { krit: 2 },
    });

    const prompt = renderVerticalDramaSpokenCallerVirtualScreenPromptBlock(result);

    expect(prompt).toContain("CALLER FACE IDENTITY LOCK (MANDATORY)");
    expect(prompt).toContain("screen_1=krit");
    expect(prompt).toContain("Image 2 = krit");
    expect(prompt).toContain("sole face identity reference");
    expect(prompt).toContain("Never use a different face");
  });

  it("does not infer a caller from an unmatched dialogue speaker", () => {
    const input = {
      physicalSceneCharacterRefs: ["phakin"],
      screenCallerCharacterRefs: ["krit"],
      dialogueSpeakerRefs: ["phakin"],
    };
    const result = deriveVerticalDramaSpokenCallerVirtualScreens(input);

    expect(result).toEqual({
      physicalSceneCharacterRefs: ["phakin"],
      screenCallerCharacterRefs: ["krit"],
      spokenScreenCallerCharacterRefs: [],
      virtualScreens: [],
    });
    expect(input.physicalSceneCharacterRefs).toEqual(["phakin"]);
  });
});
