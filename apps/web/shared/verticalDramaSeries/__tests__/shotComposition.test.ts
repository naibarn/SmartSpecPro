import { describe, expect, it } from "vitest";
import {
  findVerticalDramaShotGroundingIssues,
  normalizeVerticalDramaShotComposition,
  renderVerticalDramaShotCompositionLock,
} from "../shotComposition";

describe("vertical drama shot composition grounding", () => {
  const composition = normalizeVerticalDramaShotComposition({
    shot_type: "tight two shot",
    angle: "eye level",
    movement: "slow push in",
    composition: "both faces visible, phone low in foreground",
    body_language: { Lalin: "holds one phone", Kirin: "protects Lalin" },
    gaze_direction: { Lalin: "toward Kirin", Kirin: "toward Lalin" },
    facial_expression: { Lalin: "alarmed", Kirin: "focused" },
  });

  it("normalizes storyboard snake_case facts and renders a mandatory lock", () => {
    expect(composition?.shotType).toBe("tight two shot");
    const block = renderVerticalDramaShotCompositionLock(composition);
    expect(block).toContain("CURRENT SHOT COMPOSITION LOCK (MANDATORY)");
    expect(block).toContain("both faces visible, phone low in foreground");
    expect(block).toContain("CURRENT SHOT PROP VISIBILITY RULE (MANDATORY)");
  });

  it("fails closed when a newly grounded frame still carries an old prompt", () => {
    expect(
      findVerticalDramaShotGroundingIssues({
        prompt: "old prompt",
        composition,
      })
    ).toEqual(["missing_current_shot_composition_lock"]);
  });

  it("accepts a prompt containing the current-shot lock", () => {
    const prompt = renderVerticalDramaShotCompositionLock(composition)!;
    expect(
      findVerticalDramaShotGroundingIssues({
        prompt,
        composition,
        continuityLockBlock: "- Active props: phone",
      })
    ).toEqual([]);
  });

  it("also detects an old prompt that lists continuity props as visible facts", () => {
    expect(
      findVerticalDramaShotGroundingIssues({
        prompt: "CURRENT SHOT COMPOSITION LOCK\n- Active props: phone; tablet",
        composition,
      })
    ).toEqual(["missing_current_shot_prop_visibility_rule"]);
  });
});
