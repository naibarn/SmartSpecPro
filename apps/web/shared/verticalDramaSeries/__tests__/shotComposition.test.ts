import { describe, expect, it } from "vitest";
import {
  ensureVerticalDramaShotCompositionLock,
  findVerticalDramaShotGroundingIssues,
  normalizeVerticalDramaShotComposition,
  replaceVerticalDramaShotCompositionCharacterKeys,
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

  it("repairs a legacy prompt from the current shot composition", () => {
    const repairedPrompt = ensureVerticalDramaShotCompositionLock({
      prompt: "old prompt",
      composition,
    });

    expect(repairedPrompt).toContain("old prompt");
    expect(repairedPrompt).toContain("CURRENT SHOT COMPOSITION LOCK (MANDATORY)");
    expect(repairedPrompt).toContain("both faces visible, phone low in foreground");
    expect(
      findVerticalDramaShotGroundingIssues({
        prompt: repairedPrompt,
        composition,
      })
    ).toEqual([]);
  });

  it("does not duplicate an existing current-shot lock", () => {
    const prompt = renderVerticalDramaShotCompositionLock(composition)!;
    expect(
      ensureVerticalDramaShotCompositionLock({ prompt, composition })
    ).toBe(prompt);
  });

  it("uses display names instead of internal character keys in composition facts", () => {
    const block = renderVerticalDramaShotCompositionLock(
      normalizeVerticalDramaShotComposition({
        body_language: {
          character: "reads the letter",
          "character-5": "blocks the doorway",
        },
        gaze_direction: {
          character: "toward the letter",
          "character-5": "toward the reader",
        },
      }),
      new Map([
        ["character", "พิมพ์ชนก"],
        ["character-5", "มยุรี"],
      ])
    );
    expect(block).toContain("พิมพ์ชนก: reads the letter");
    expect(block).toContain("มยุรี: blocks the doorway");
    expect(block).not.toContain("character-5:");
  });

  it("repairs internal keys in a persisted legacy composition block", () => {
    const prompt =
      "scene\nCURRENT SHOT COMPOSITION LOCK (MANDATORY):\n- Body language: character: reads; character-5: blocks\nCURRENT SHOT PROP VISIBILITY RULE (MANDATORY): keep the letter.";
    const repaired = replaceVerticalDramaShotCompositionCharacterKeys(
      prompt,
      new Map([
        ["character", "พิมพ์ชนก"],
        ["character-5", "มยุรี"],
      ])
    );
    expect(repaired).toContain("พิมพ์ชนก: reads");
    expect(repaired).toContain("มยุรี: blocks");
    expect(repaired).toContain("CURRENT SHOT PROP VISIBILITY RULE");
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

  it("accepts legacy casing and hyphenation for the current-shot prop rule", () => {
    expect(
      findVerticalDramaShotGroundingIssues({
        prompt:
          "CURRENT SHOT COMPOSITION LOCK\n- Continuity prop candidates\n- Current-shot prop visibility rule: show only explicitly required props.",
        composition,
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
