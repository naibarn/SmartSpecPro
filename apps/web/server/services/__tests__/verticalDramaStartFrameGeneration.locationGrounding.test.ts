/**
 * Phase 1 of `planning/polished-toasting-gadget.md` (location visual bible)
 * — coverage for `verticalDramaStartFrameGeneration.ts`'s:
 *  - `buildStartFrameRenderPlanUserPrompt` rendering a `| location: <name> —
 *    <description>` suffix on a shot's line only when that shot carries a
 *    `location` fact, with the `"[has an approved reference image —
 *    environment lock applies]"` bracket suffix added only when
 *    `hasReferenceImage` is true;
 *  - `buildStartFrameShotPromptUserPrompt` rendering an analogous
 *    `location: name="..." description="..."` line only when `location` is
 *    supplied;
 *  - EXPLICIT byte-identical regression proof for both builders: when
 *    `location` is absent, the prompt is unchanged in every respect from
 *    before this feature existed (the #1 safety guarantee for this round).
 *
 * Both builder functions are pure (no LLM/credit/rate-limit/fs
 * dependencies) — mirrors `verticalDramaProductTieIn.test.ts`'s "no mocking
 * needed for pure helpers" convention exactly.
 */
import { describe, it, expect } from "vitest";
import {
  buildStartFrameRenderPlanUserPrompt,
  buildStartFrameShotPromptUserPrompt,
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
/* buildStartFrameRenderPlanUserPrompt (batch)                               */
/* -------------------------------------------------------------------------- */

describe("buildStartFrameRenderPlanUserPrompt — location grounding (Phase 1 location visual bible)", () => {
  it("byte-identical: a shot's line is exactly the pre-existing format when location is absent (regression guard)", () => {
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
    const shotLine = prompt.split("\n").find(l => l.startsWith("- Shot 1"));
    expect(shotLine).toBe(
      "- Shot 1 (6s): Aria signs the contract | camera: medium, eye_level | characters: char-1",
    );
  });

  it("appends '| location: <name> — <description>' when a shot carries a location fact with no reference image", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 1,
            description: "Aria signs the contract",
            cameraSetup: "medium, eye_level",
            characterIds: ["char-1"],
            durationSeconds: 6,
            location: {
              name: "ร้านสะดวกซื้อ",
              description: "แถวชั้นวางของเด็ก",
              hasReferenceImage: false,
            },
          },
        ],
      }),
    );
    const shotLine = prompt.split("\n").find(l => l.startsWith("- Shot 1"));
    expect(shotLine).toBe(
      "- Shot 1 (6s): Aria signs the contract | camera: medium, eye_level | characters: char-1 | location: ร้านสะดวกซื้อ — แถวชั้นวางของเด็ก",
    );
  });

  it("appends the '[has an approved reference image — environment lock applies]' suffix when hasReferenceImage is true", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 1,
            description: "Aria signs the contract",
            cameraSetup: "medium, eye_level",
            characterIds: ["char-1"],
            durationSeconds: 6,
            location: {
              name: "ร้านสะดวกซื้อ",
              description: "แถวชั้นวางของเด็ก",
              hasReferenceImage: true,
            },
          },
        ],
      }),
    );
    const shotLine = prompt.split("\n").find(l => l.startsWith("- Shot 1"));
    expect(shotLine).toBe(
      "- Shot 1 (6s): Aria signs the contract | camera: medium, eye_level | characters: char-1 | location: ร้านสะดวกซื้อ — แถวชั้นวางของเด็ก [has an approved reference image — environment lock applies]",
    );
  });

  it("mixed shots: each shot's line reflects only its own location state, independently of siblings", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            shotNumber: 1,
            description: "Shot one",
            cameraSetup: "medium",
            characterIds: [],
            durationSeconds: 6,
            location: { name: "Store", description: "Aisle", hasReferenceImage: false },
          },
          {
            shotNumber: 2,
            description: "Shot two",
            cameraSetup: "wide",
            characterIds: [],
            durationSeconds: 6,
          },
        ],
      }),
    );
    const lines = prompt.split("\n").filter(l => l.startsWith("- Shot"));
    expect(lines[0]).toContain("| location: Store — Aisle");
    expect(lines[1]).not.toContain("location:");
  });

  it("byte-identical: every other line of the prompt (identity map, region instruction, JSON instruction) is unaffected by adding location to a shot", () => {
    const shotNoLocation = {
      shotNumber: 1,
      description: "Aria signs the contract",
      cameraSetup: "medium, eye_level",
      characterIds: ["char-1"],
      durationSeconds: 6,
    };
    const without = buildStartFrameRenderPlanUserPrompt(
      baseParams({ storyboardShots: [shotNoLocation] }),
    );
    const withLocation = buildStartFrameRenderPlanUserPrompt(
      baseParams({
        storyboardShots: [
          {
            ...shotNoLocation,
            location: { name: "Store", description: "Aisle", hasReferenceImage: false },
          },
        ],
      }),
    );
    const withoutLines = without.split("\n");
    const withLocationLines = withLocation.split("\n");
    expect(withLocationLines).toHaveLength(withoutLines.length);
    withoutLines.forEach((line, i) => {
      if (line.startsWith("- Shot 1")) return; // the one line allowed to differ
      expect(withLocationLines[i]).toBe(line);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* buildStartFrameShotPromptUserPrompt (single-shot)                         */
/* -------------------------------------------------------------------------- */

describe("buildStartFrameShotPromptUserPrompt — location grounding (Phase 1 location visual bible)", () => {
  it("byte-identical: no 'location:' line at all when location is absent (regression guard)", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(baseShotParams());
    expect(prompt).not.toContain("location:");
  });

  it("renders a 'location: name=\"...\" description=\"...\"' line when location is supplied with no reference image", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        location: {
          name: "ร้านสะดวกซื้อ",
          description: "แถวชั้นวางของเด็ก",
          hasReferenceImage: false,
        },
      }),
    );
    expect(prompt).toContain(
      'location: name="ร้านสะดวกซื้อ" description="แถวชั้นวางของเด็ก"',
    );
    expect(prompt).not.toContain("environment lock applies");
  });

  it("appends the '[has an approved reference image — environment lock applies]' suffix when hasReferenceImage is true", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        location: {
          name: "ร้านสะดวกซื้อ",
          description: "แถวชั้นวางของเด็ก",
          hasReferenceImage: true,
        },
      }),
    );
    expect(prompt).toContain(
      'location: name="ร้านสะดวกซื้อ" description="แถวชั้นวางของเด็ก" [has an approved reference image — environment lock applies]',
    );
  });

  it("byte-identical: adding a location fact inserts exactly one new line and changes nothing else in the prompt", () => {
    const without = buildStartFrameShotPromptUserPrompt(baseShotParams());
    const withLocation = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        location: {
          name: "ร้านสะดวกซื้อ",
          description: "แถวชั้นวางของเด็ก",
          hasReferenceImage: false,
        },
      }),
    );
    const expectedLocationLine =
      'location: name="ร้านสะดวกซื้อ" description="แถวชั้นวางของเด็ก"';
    expect(withLocation).toContain(expectedLocationLine);
    expect(withLocation.replace(`${expectedLocationLine}\n`, "")).toBe(without);
  });

  it("renders the location line after product_lock and before the final JSON instruction, mirroring the product_lock/character_reference_manifest line ordering convention", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        productLock: { active: false },
        location: {
          name: "ร้านสะดวกซื้อ",
          description: "แถวชั้นวางของเด็ก",
          hasReferenceImage: false,
        },
      }),
    );
    const lines = prompt.split("\n");
    const productLockIndex = lines.findIndex(l => l.startsWith("product_lock:"));
    const locationIndex = lines.findIndex(l => l.startsWith("location:"));
    expect(productLockIndex).toBeGreaterThanOrEqual(0);
    expect(locationIndex).toBeGreaterThan(productLockIndex);
    expect(lines[lines.length - 1]).not.toBe("");
  });
});
