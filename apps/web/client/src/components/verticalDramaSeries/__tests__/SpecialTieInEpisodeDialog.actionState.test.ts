import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPECIAL_TIE_IN_DIALOGUE_MODE,
  areSpecialTieInDialogueSpeakersSelected,
  isUsableSpecialTieInPortrait,
  limitSpecialTieInDialogueLines,
  resolveSpecialTieInActionState,
  resolveSpecialTieInDialogueMode,
  resolveSpecialTieInModelSelection,
} from "../SpecialTieInEpisodeDialog";

describe("special tie-in action state", () => {
  it("switches away from a stale model when selected references change", () => {
    const models = [
      { modelId: "compatible-model" },
      { modelId: "other-model" },
    ];

    expect(resolveSpecialTieInModelSelection("removed-model", models)).toBe(
      "compatible-model",
    );
    expect(resolveSpecialTieInModelSelection("compatible-model", models)).toBe(
      "compatible-model",
    );
    expect(resolveSpecialTieInModelSelection("removed-model", [])).toBe("");
  });

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

  it("matches dialogue names to the selected duplicate character, not the first roster row", () => {
    expect(
      areSpecialTieInDialogueSpeakersSelected({
        characters: [
          { characterId: "1", name: "มุก" },
          { characterId: "2", name: "มุก" },
          { characterId: "3", name: "พี่ฟ้า" },
        ],
        speakerCharacterIds: ["2", "3"],
        shotDialogueDrafts: [
          {
            shotNumber: 1,
            dialogueLines: [
              { speakerCharacterId: "มุก", line: "ลองดูด้วยกันนะ" },
              { speakerCharacterId: "พี่ฟ้า", line: "ได้เลย" },
            ],
          },
        ],
      })
    ).toBe(true);
  });

  it("keeps the full nine-shot dialogue in shotDialogues while capping the legacy summary", () => {
    expect(limitSpecialTieInDialogueLines(Array.from({ length: 18 }))).toHaveLength(12);
  });
});
