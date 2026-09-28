/**
 * Coverage for `verticalDramaShotCharacterRepair.ts`'s pure merge core
 * (`computeRepairedStartFramePlan`) — no DB/LLM mocking needed, same
 * "pure helper covered in isolation" convention as this directory's sibling
 * `verticalDramaCharacterRosterAutoRegister.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  computeRepairedStartFramePlan,
  resolveSpeakerLabelToRosterKey,
} from "../verticalDramaShotCharacterRepair";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries";

function basePlan(
  frames: VerticalDramaStartFramePlan["frames"]
): VerticalDramaStartFramePlan {
  return { mode: "single_frame_per_shot", selectedImageModelId: "", frames };
}

describe("computeRepairedStartFramePlan", () => {
  it("unions a resolved dialogue speaker not already in requiredCharacterRefs, preserving existing refs, sorted by shotNumber", () => {
    const existingPlan = basePlan([
      {
        shotNumber: 2,
        imagePrompt: "shot 2",
        negativePrompt: "",
        requiredCharacterRefs: ["nara_lead"],
        productReferenceAssetIds: [],
      },
      {
        shotNumber: 1,
        imagePrompt: "shot 1",
        negativePrompt: "",
        requiredCharacterRefs: [],
        productReferenceAssetIds: [],
      },
    ]);

    const { updatedPlan, added } = computeRepairedStartFramePlan({
      shotCount: 2,
      existingPlan,
      resolveDialogueKeysForShot: shotNumber =>
        shotNumber === 2 ? ["nara_lead", "mintra_lead"] : [],
    });

    expect(added).toEqual([
      { shotNumber: 2, addedKeys: ["mintra_lead"], promptReset: true },
    ]);
    // Sorted by shotNumber.
    expect(updatedPlan.frames.map(f => f.shotNumber)).toEqual([1, 2]);
    const shot2 = updatedPlan.frames.find(f => f.shotNumber === 2)!;
    expect(shot2.requiredCharacterRefs).toEqual(["nara_lead", "mintra_lead"]);
    // Adding a ref shifts the attached-image order, so the stored prompt's
    // "Image N = character" mapping is stale — the prompt is cleared and the
    // shot must be re-prompted.
    expect(shot2.imagePrompt).toBe("");
    expect(shot2.negativePrompt).toBe("");
    // Untouched shot's frame is unaffected.
    const shot1 = updatedPlan.frames.find(f => f.shotNumber === 1)!;
    expect(shot1.requiredCharacterRefs).toEqual([]);
  });

  it("does NOT reset a prompt when the frame's imagePrompt was already empty (promptReset false)", () => {
    const existingPlan = basePlan([
      {
        shotNumber: 1,
        imagePrompt: "",
        negativePrompt: "",
        requiredCharacterRefs: ["nara_lead"],
        productReferenceAssetIds: [],
      },
    ]);

    const { updatedPlan, added } = computeRepairedStartFramePlan({
      shotCount: 1,
      existingPlan,
      resolveDialogueKeysForShot: () => ["nara_lead", "mintra_lead"],
    });

    expect(added).toEqual([
      { shotNumber: 1, addedKeys: ["mintra_lead"], promptReset: false },
    ]);
    const shot1 = updatedPlan.frames.find(f => f.shotNumber === 1)!;
    expect(shot1.requiredCharacterRefs).toEqual(["nara_lead", "mintra_lead"]);
    expect(shot1.imagePrompt).toBe("");
  });

  it("makes no change when every resolved speaker is already present", () => {
    const existingPlan = basePlan([
      {
        shotNumber: 1,
        imagePrompt: "shot 1",
        negativePrompt: "",
        requiredCharacterRefs: ["nara_lead", "mintra_lead"],
        productReferenceAssetIds: [],
      },
    ]);

    const { updatedPlan, added } = computeRepairedStartFramePlan({
      shotCount: 1,
      existingPlan,
      resolveDialogueKeysForShot: () => ["nara_lead", "mintra_lead"],
    });

    expect(added).toEqual([]);
    // Byte-identical plan object returned — no-op short-circuit.
    expect(updatedPlan).toBe(existingPlan);
  });

  it("creates a minimal frame (with the resolved keys) for a shot that has no frame at all", () => {
    const existingPlan = basePlan([]);

    const { updatedPlan, added } = computeRepairedStartFramePlan({
      shotCount: 1,
      existingPlan,
      resolveDialogueKeysForShot: () => ["mintra_lead"],
    });

    expect(added).toEqual([
      { shotNumber: 1, addedKeys: ["mintra_lead"], promptReset: false },
    ]);
    expect(updatedPlan.frames).toEqual([
      {
        shotNumber: 1,
        imagePrompt: "",
        negativePrompt: "",
        requiredCharacterRefs: ["mintra_lead"],
        productReferenceAssetIds: [],
      },
    ]);
  });

  it("makes no change when the speaker is unresolvable (callback returns [])", () => {
    const existingPlan = basePlan([
      {
        shotNumber: 1,
        imagePrompt: "shot 1",
        negativePrompt: "",
        requiredCharacterRefs: [],
        productReferenceAssetIds: [],
      },
    ]);

    const { updatedPlan, added } = computeRepairedStartFramePlan({
      shotCount: 1,
      existingPlan,
      resolveDialogueKeysForShot: () => [],
    });

    expect(added).toEqual([]);
    expect(updatedPlan).toBe(existingPlan);
  });

  it("handles a null existingPlan (no start-frame plan generated yet) by starting from an empty plan", () => {
    const { updatedPlan, added } = computeRepairedStartFramePlan({
      shotCount: 1,
      existingPlan: null,
      resolveDialogueKeysForShot: () => ["mintra_lead"],
    });

    expect(added).toEqual([
      { shotNumber: 1, addedKeys: ["mintra_lead"], promptReset: false },
    ]);
    expect(updatedPlan.mode).toBe("single_frame_per_shot");
    expect(updatedPlan.frames).toHaveLength(1);
  });
});

// planning/vd-character-identity-repair/plan.md — alias-aware speaker
// resolution (Series 18's "Kirin"/"คีริน"/"คิริน" -> characterKey "kirin-70"
// shape, post-merge).
describe("resolveSpeakerLabelToRosterKey", () => {
  const rosterKeySet = new Set(["kirin-70", "lalin-71"]);
  const rosterByNormalizedName = new Map([
    ["คิริน วัฒนเมธา", "kirin-70"],
    ["ลลิน ศิริกุล", "lalin-71"],
  ]);
  const characterKeyByNormalizedAlias = new Map([
    ["คิริน", "kirin-70"],
    ["kirin", "kirin-70"],
    ["คีริน", "kirin-70"],
    ["ลลิน", "lalin-71"],
  ]);

  it("resolves an exact characterKey match (step 1) without consulting name/alias maps", () => {
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "kirin-70",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias,
      })
    ).toBe("kirin-70");
  });

  it("resolves a canonical (full) name via normalized-name match (step 2)", () => {
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "คิริน วัฒนเมธา",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias,
      })
    ).toBe("kirin-70");
  });

  it("resolves a declared alias to the canonical character's key (step 3)", () => {
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "Kirin",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias,
      })
    ).toBe("kirin-70");
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "คีริน",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias,
      })
    ).toBe("kirin-70");
  });

  it("a canonical name always wins over an alias for the same normalized string", () => {
    // Caller-side invariant (documented on the `characterKeyByNormalizedAlias`
    // param): the orchestrator never includes a normalized string here that
    // already exists in `rosterByNormalizedName`. Simulate a caller that
    // (incorrectly) failed to filter, to prove step 2 is still checked
    // strictly before step 3 in resolution order.
    const conflictingAliasMap = new Map([
      ...characterKeyByNormalizedAlias,
      ["ลลิน ศิริกุล", "some-other-key"],
    ]);
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "ลลิน ศิริกุล",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias: conflictingAliasMap,
      })
    ).toBe("lalin-71");
  });

  it("returns undefined for an unknown/unresolvable label (never guesses)", () => {
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "Random Extra",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias,
      })
    ).toBeUndefined();
  });

  it("returns undefined for an empty/whitespace-only label", () => {
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "   ",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias,
      })
    ).toBeUndefined();
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: undefined,
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias,
      })
    ).toBeUndefined();
  });

  it("behaves byte-identically to the pre-alias resolver when the alias map is empty", () => {
    expect(
      resolveSpeakerLabelToRosterKey({
        rawLabel: "Kirin",
        rosterKeySet,
        rosterByNormalizedName,
        characterKeyByNormalizedAlias: new Map(),
      })
    ).toBeUndefined();
  });
});
