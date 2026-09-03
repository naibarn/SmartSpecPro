import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPECIAL_TIE_IN_DIALOGUE_MODE,
  isUsableSpecialTieInPortrait,
  resolveSpecialTieInActionState,
  resolveSpecialTieInDialogueMode,
} from "../SpecialTieInEpisodeDialog";

describe("special tie-in action state", () => {
  it("defaults a new special tie-in form to character dialogue", () => {
    expect(DEFAULT_SPECIAL_TIE_IN_DIALOGUE_MODE).toBe("character_dialogue");
    expect(resolveSpecialTieInDialogueMode()).toBe("character_dialogue");
  });

  it("preserves the explicitly saved dialogue mode when reopening a form", () => {
    expect(resolveSpecialTieInDialogueMode({ dialogueMode: "none" })).toBe(
      "none",
    );
    expect(
      resolveSpecialTieInDialogueMode({ dialogueMode: "character_dialogue" }),
    ).toBe("character_dialogue");
  });

  it("does not mark final episode creation as pending while references are materialized", () => {
    expect(
      resolveSpecialTieInActionState({
        createMutationPending: false,
        finalSubmitPending: false,
        materializeMutationPending: true,
      })
    ).toEqual({
      finalSubmitPending: false,
      materializeReferencesPending: true,
    });
  });

  it("marks only the final action as pending during episode creation", () => {
    expect(
      resolveSpecialTieInActionState({
        createMutationPending: true,
        finalSubmitPending: false,
        materializeMutationPending: false,
      })
    ).toEqual({
      finalSubmitPending: true,
      materializeReferencesPending: false,
    });
  });

  it("allows a ready generated/imported character-reference portrait without approval", () => {
    expect(
      isUsableSpecialTieInPortrait({
        characterId: "42",
        assetType: "character_reference",
        role: "primary_portrait",
        approved: false,
        state: "generated",
        thumbnailUrl: "/portrait.png",
      }),
    ).toBe(true);
  });
});
