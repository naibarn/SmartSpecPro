import { describe, expect, it } from "vitest";
import {
  normalizeVerticalDramaBarrierDialogue,
  renderVerticalDramaBarrierDialogueBlock,
} from "../barrierDialogue";

describe("Vertical Drama closed-door barrier dialogue", () => {
  it("keeps the offscreen physical actor separate from visible refs", () => {
    const barrier = normalizeVerticalDramaBarrierDialogue({
      type: "closed_door",
      state: "locked",
      camera_side: "inside",
      visible_character_refs: ["woman", "woman"],
      offscreen_character_refs: ["man"],
    });

    expect(barrier).toEqual({
      type: "closed_door",
      state: "locked",
      cameraSide: "inside",
      visibleCharacterRefs: ["woman"],
      offscreenCharacterRefs: ["man"],
    });
    expect(renderVerticalDramaBarrierDialogueBlock(barrier!)).toContain(
      "offscreen_physical_character_refs: man"
    );
  });

  it("rejects overlapping visible and offscreen assignments", () => {
    expect(
      normalizeVerticalDramaBarrierDialogue({
        type: "closed_door",
        state: "closed",
        cameraSide: "inside",
        visibleCharacterRefs: ["woman"],
        offscreenCharacterRefs: ["woman"],
      })
    ).toBeUndefined();
  });
});
