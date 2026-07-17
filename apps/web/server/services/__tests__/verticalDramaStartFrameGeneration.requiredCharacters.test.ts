/**
 * Multi-character frame-inclusion fix — coverage for
 * `verticalDramaStartFrameGeneration.ts`'s:
 *  - `buildStartFrameRenderPlanUserPrompt` appending a
 *    `| required_characters: N (frame must include ALL)` suffix on a shot's
 *    line only when that shot has 2+ `characterIds`;
 *  - `buildStartFrameShotPromptUserPrompt` appending an analogous
 *    `required_character_count: N (all must appear in frame)` line, derived
 *    from `requiredCharacterRefs` (preferred) or `characterReferenceManifest`
 *    length (fallback), only when the count is 2+;
 *  - EXPLICIT byte-identical regression proof for both builders: when the
 *    shot has fewer than 2 required characters, the prompt is unchanged in
 *    every respect from before this feature existed;
 *  - the fact composes with (does not replace) the existing
 *    `speaking_order` fact on the same shot.
 *
 * Mirrors `verticalDramaStartFrameGeneration.locationGrounding.test.ts`'s
 * "no mocking needed for pure helpers" convention exactly — both builder
 * functions are pure (no LLM/credit/rate-limit/fs dependencies).
 */
import { describe, it, expect } from "vitest";
import {
  buildStartFrameRenderPlanUserPrompt,
  buildStartFrameShotPromptUserPrompt,
  remapCameraSetupForRequiredCharacters,
  type GenerateStartFrameRenderPlanParams,
  type GenerateStartFrameShotPromptParams,
} from "../verticalDramaStartFrameGeneration";

function baseParams(
  overrides: Partial<GenerateStartFrameRenderPlanParams> = {},
): GenerateStartFrameRenderPlanParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    episodeTitle: "Episode 1",
    durationSeconds: 90,
    selectedImageModelId: "google-banana-2-lite",
    storyboardShots: [],
    ...overrides,
  };
}

function baseShotParams(
  overrides: Partial<GenerateStartFrameShotPromptParams> = {},
): GenerateStartFrameShotPromptParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    shotNumber: 4,
    instruction: "Make her smile more.",
    currentPrompt: "vertical 9:16 start frame for shot 4, Aria in boardroom.",
    currentNegativePrompt: "no identity drift",
    characterReferenceManifest: [],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* remapCameraSetupForRequiredCharacters (deterministic camera remap fix)    */
/* -------------------------------------------------------------------------- */

describe("remapCameraSetupForRequiredCharacters — deterministic multi-character close-up remap", () => {
  it("byte-identical: returns cameraSetup unchanged when requiredCharacterCount < 2", () => {
    expect(remapCameraSetupForRequiredCharacters("extreme_close_up, high_angle, fast_push_in", 1)).toBe(
      "extreme_close_up, high_angle, fast_push_in",
    );
    expect(remapCameraSetupForRequiredCharacters("extreme_close_up", 0)).toBe("extreme_close_up");
  });

  it("widens a close-up-class shot-size token to medium_two_shot for a 2-character shot, preserving angle/movement tokens", () => {
    expect(
      remapCameraSetupForRequiredCharacters("extreme_close_up, high_angle, fast_push_in", 2),
    ).toBe("medium_two_shot, high_angle, fast_push_in");
  });

  it("widens to medium_group_shot for a 3+ character shot", () => {
    expect(remapCameraSetupForRequiredCharacters("extreme_close_up, high_angle", 3)).toBe(
      "medium_group_shot, high_angle",
    );
    expect(remapCameraSetupForRequiredCharacters("close_up", 5)).toBe("medium_group_shot");
  });

  it("byte-identical: leaves an already-wide camera unchanged for a 2-character shot", () => {
    expect(remapCameraSetupForRequiredCharacters("medium, eye_level", 2)).toBe("medium, eye_level");
    expect(remapCameraSetupForRequiredCharacters("wide", 2)).toBe("wide");
  });

  it("matches case/underscore/space/hyphen variants of close-up tokens", () => {
    const variants = [
      "extreme_close_up",
      "Extreme Close Up",
      "EXTREME-CLOSE-UP",
      "extremecloseup",
      "close_up",
      "CloseUp",
      "close-up",
      "big_close_up",
      "tight_close_up",
      "macro",
      "ECU",
      "cu",
      "choker",
    ];
    for (const variant of variants) {
      const result = remapCameraSetupForRequiredCharacters(variant, 2);
      expect(result, `variant "${variant}" should be remapped`).toBe("medium_two_shot");
    }
  });

  it("preserves comma-delimiter spacing style around the replaced token", () => {
    expect(remapCameraSetupForRequiredCharacters("extreme_close_up,high_angle", 2)).toBe(
      "medium_two_shot,high_angle",
    );
    expect(remapCameraSetupForRequiredCharacters("high_angle, extreme_close_up ,fast_push_in", 2)).toBe(
      "high_angle, medium_two_shot ,fast_push_in",
    );
  });

  it("only replaces the first matching token, leaving subsequent tokens untouched even if they'd also match", () => {
    expect(remapCameraSetupForRequiredCharacters("close_up, close_up", 2)).toBe(
      "medium_two_shot, close_up",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* buildStartFrameRenderPlanUserPrompt (batch)                               */
/* -------------------------------------------------------------------------- */

describe("buildStartFrameRenderPlanUserPrompt — required-character frame inclusion", () => {
  it("byte-identical: a solo-character shot's line is exactly the pre-existing format (regression guard)", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 1,
            description: "Aria signs the contract",
            cameraSetup: "medium, eye_level",
            characterIds: ["char-1"],
            durationSeconds: 6,
          },
        ],
      }),
    );
    const shotLine = prompt.split("\n").find((l) => l.startsWith("- Shot 1"));
    expect(shotLine).toBe(
      "- Shot 1 (6s): Aria signs the contract | camera: medium, eye_level | characters: char-1",
    );
  });

  it("byte-identical: a zero-character shot's line is unaffected", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 1,
            description: "Empty establishing shot",
            cameraSetup: "wide",
            characterIds: [],
            durationSeconds: 6,
          },
        ],
      }),
    );
    const shotLine = prompt.split("\n").find((l) => l.startsWith("- Shot 1"));
    expect(shotLine).toBe(
      "- Shot 1 (6s): Empty establishing shot | camera: wide | characters: (none)",
    );
  });

  it("appends '| required_characters: 2 (frame must include ALL)' when a shot has 2 required characters, and widens an extreme_close_up camera to medium_two_shot (deterministic camera remap fix)", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 3,
            description: "Reversal beat — Aria confronts Noon",
            cameraSetup: "extreme_close_up",
            characterIds: ["char-1", "char-2"],
            durationSeconds: 6,
          },
        ],
      }),
    );
    const shotLine = prompt.split("\n").find((l) => l.startsWith("- Shot 3"));
    expect(shotLine).toBe(
      "- Shot 3 (6s): Reversal beat — Aria confronts Noon | camera: medium_two_shot | characters: char-1, char-2 | required_characters: 2 (frame must include ALL)",
    );
  });

  it("scales the count for 3+ required characters", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 5,
            description: "Group scene",
            cameraSetup: "wide",
            characterIds: ["char-1", "char-2", "char-3"],
            durationSeconds: 6,
          },
        ],
      }),
    );
    const shotLine = prompt.split("\n").find((l) => l.startsWith("- Shot 5"));
    expect(shotLine).toContain("| required_characters: 3 (frame must include ALL)");
  });

  it("mixed shots: each shot's line reflects only its own required-character count, independently of siblings", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 1,
            description: "Solo shot",
            cameraSetup: "medium",
            characterIds: ["char-1"],
            durationSeconds: 6,
          },
          {
            shotNumber: 2,
            description: "Two-hander",
            cameraSetup: "close_up",
            characterIds: ["char-1", "char-2"],
            durationSeconds: 6,
          },
        ],
      }),
    );
    const lines = prompt.split("\n").filter((l) => l.startsWith("- Shot"));
    expect(lines[0]).not.toContain("required_characters:");
    expect(lines[1]).toContain("required_characters: 2 (frame must include ALL)");
  });

  it("composes with the existing speaking_order fact on the same shot line", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 3,
            description: "Reversal beat",
            cameraSetup: "extreme_close_up",
            characterIds: ["char-1", "char-2"],
            durationSeconds: 6,
            speakingOrder: ["ฝ้าย", "ใบข้าว"],
          },
        ],
      }),
    );
    const shotLine = prompt.split("\n").find((l) => l.startsWith("- Shot 3"));
    expect(shotLine).toBe(
      "- Shot 3 (6s): Reversal beat | camera: medium_two_shot | characters: char-1, char-2 | speaking_order: ฝ้าย > ใบข้าว (first speaker leftmost) | required_characters: 2 (frame must include ALL)",
    );
  });

  it("byte-identical: every other line of the prompt is unaffected by adding a second character to a shot", () => {
    const soloShot = {
      shotNumber: 1,
      description: "Aria signs the contract",
      cameraSetup: "medium, eye_level",
      characterIds: ["char-1"],
      durationSeconds: 6,
    };
    const without = buildStartFrameRenderPlanUserPrompt(
      baseParams({ storyboardShots: [soloShot] }),
    );
    const withSecondCharacter = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [{ ...soloShot, characterIds: ["char-1", "char-2"] }],
      }),
    );
    const withoutLines = without.split("\n");
    const withLines = withSecondCharacter.split("\n");
    expect(withLines).toHaveLength(withoutLines.length);
    withoutLines.forEach((line, i) => {
      if (line.startsWith("- Shot 1")) return; // the one line allowed to differ
      expect(withLines[i]).toBe(line);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* buildStartFrameShotPromptUserPrompt (single-shot)                         */
/* -------------------------------------------------------------------------- */

describe("buildStartFrameShotPromptUserPrompt — required-character frame inclusion", () => {
  it("byte-identical: no 'required_character_count:' line when requiredCharacterRefs has fewer than 2 entries (regression guard)", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ requiredCharacterRefs: ["char-1"] }),
    );
    expect(prompt).not.toContain("required_character_count:");
  });

  it("byte-identical: no 'required_character_count:' line when requiredCharacterRefs is absent and manifest has fewer than 2 entries", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        characterReferenceManifest: [{ index: 1, name: "Aria", characterId: "char-1" }],
      }),
    );
    expect(prompt).not.toContain("required_character_count:");
  });

  it("renders 'required_character_count: 2 (all must appear in frame)' when requiredCharacterRefs has 2+ entries", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ requiredCharacterRefs: ["char-1", "char-2"] }),
    );
    expect(prompt).toContain("required_character_count: 2 (all must appear in frame)");
  });

  it("falls back to characterReferenceManifest length when requiredCharacterRefs is absent", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        characterReferenceManifest: [
          { index: 1, name: "Aria", characterId: "char-1" },
          { index: 2, name: "Noon", characterId: "char-2" },
        ],
      }),
    );
    expect(prompt).toContain("required_character_count: 2 (all must appear in frame)");
  });

  it("prefers requiredCharacterRefs over the manifest length when both are present and differ", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        requiredCharacterRefs: ["char-1"],
        characterReferenceManifest: [
          { index: 1, name: "Aria", characterId: "char-1" },
          { index: 2, name: "Noon", characterId: "char-2" },
        ],
      }),
    );
    expect(prompt).not.toContain("required_character_count:");
  });

  it("composes with the existing speaking_order fact", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        requiredCharacterRefs: ["char-1", "char-2"],
        speakingOrder: ["ฝ้าย", "ใบข้าว"],
      }),
    );
    expect(prompt).toContain("speaking_order: ฝ้าย > ใบข้าว (first speaker leftmost)");
    expect(prompt).toContain("required_character_count: 2 (all must appear in frame)");
  });

  it("byte-identical: adding a second requiredCharacterRefs entry inserts exactly two new lines (required_character_count + framing_override) and changes nothing else in the prompt", () => {
    const without = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ requiredCharacterRefs: ["char-1"] }),
    );
    const withSecondCharacter = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ requiredCharacterRefs: ["char-1", "char-2"] }),
    );
    const expectedLines =
      "required_character_count: 2 (all must appear in frame)\n" +
      "framing_override: medium_two_shot (2 required characters must ALL be visible — do not isolate one in a close-up)\n";
    expect(withSecondCharacter).toContain(expectedLines);
    expect(withSecondCharacter.replace(expectedLines, "")).toBe(without);
  });
});

/* -------------------------------------------------------------------------- */
/* buildStartFrameShotPromptUserPrompt — deterministic framing_override fact  */
/* (per-shot regen path fix — the "ให้ AI ปรับ" per-shot builder never        */
/* interpolates a `cameraSetup` string to remap, unlike the batch builder     */
/* above, so this emits the same widened-framing decision directly as a      */
/* fact instead of remapping a camera token)                                 */
/* -------------------------------------------------------------------------- */

describe("buildStartFrameShotPromptUserPrompt — deterministic framing_override fact (per-shot regen camera-widening fix)", () => {
  it("byte-identical: no 'framing_override:' line when requiredCharacterRefs has fewer than 2 entries (regression guard)", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ requiredCharacterRefs: ["char-1"] }),
    );
    expect(prompt).not.toContain("framing_override:");
  });

  it("byte-identical: no 'framing_override:' line when requiredCharacterRefs is absent and the manifest has fewer than 2 entries", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        characterReferenceManifest: [{ index: 1, name: "Aria", characterId: "char-1" }],
      }),
    );
    expect(prompt).not.toContain("framing_override:");
  });

  it("emits 'framing_override: medium_two_shot (...)' for a 2 required-character shot", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ requiredCharacterRefs: ["char-1", "char-2"] }),
    );
    expect(prompt).toContain(
      "framing_override: medium_two_shot (2 required characters must ALL be visible — do not isolate one in a close-up)",
    );
  });

  it("emits 'framing_override: medium_group_shot (...)' for a 3+ required-character shot", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ requiredCharacterRefs: ["char-1", "char-2", "char-3"] }),
    );
    expect(prompt).toContain(
      "framing_override: medium_group_shot (3 required characters must ALL be visible — do not isolate one in a close-up)",
    );
  });

  it("falls back to characterReferenceManifest length when requiredCharacterRefs is absent, same as required_character_count", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        characterReferenceManifest: [
          { index: 1, name: "Aria", characterId: "char-1" },
          { index: 2, name: "Noon", characterId: "char-2" },
        ],
      }),
    );
    expect(prompt).toContain(
      "framing_override: medium_two_shot (2 required characters must ALL be visible — do not isolate one in a close-up)",
    );
  });

  it("composes with (appears immediately after) the required_character_count fact, and with speaking_order", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        requiredCharacterRefs: ["char-1", "char-2"],
        speakingOrder: ["ฝ้าย", "ใบข้าว"],
      }),
    );
    expect(prompt).toContain(
      "required_character_count: 2 (all must appear in frame)\n" +
        "framing_override: medium_two_shot (2 required characters must ALL be visible — do not isolate one in a close-up)",
    );
    expect(prompt).toContain("speaking_order: ฝ้าย > ใบข้าว (first speaker leftmost)");
  });
});
