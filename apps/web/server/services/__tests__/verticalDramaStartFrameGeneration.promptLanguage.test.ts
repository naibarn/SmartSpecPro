/**
 * Shared-field prompt-language fix — `promptLanguage` was previously wired
 * ONLY into the video-prompt path (`verticalDramaVideoMotionPromptGeneration.ts`).
 * This is coverage for the SAME `motionPromptPack.promptLanguage` field
 * (`VerticalDramaPromptLanguage`, `@shared/verticalDramaSeries/contracts`)
 * now also threading into `verticalDramaStartFrameGeneration.ts`'s:
 *  - `buildStartFrameRenderPlanUserPrompt` appending a "PROMPT LANGUAGE
 *    (MANDATORY)" directive line naming every shot's `prompt`/
 *    `negative_prompt` fields;
 *  - `buildStartFrameShotPromptUserPrompt` appending the equivalent
 *    single-shot directive line for its own `prompt`/`negative_prompt`
 *    fields.
 *
 * Both default to `"en"` when `promptLanguage` is omitted, mirroring
 * `verticalDramaVideoMotionPromptGeneration.ts`'s own
 * `params.promptLanguage ?? "en"` convention exactly — the directive line is
 * ALWAYS present (even when defaulting to English), unlike this file's
 * `location` field, which is a genuinely byte-identical-when-omitted
 * addition (see `verticalDramaStartFrameGeneration.locationGrounding.test.ts`).
 *
 * Both builder functions are pure (no LLM/credit/rate-limit/fs
 * dependencies) — mirrors `verticalDramaStartFrameGeneration.locationGrounding.test.ts`'s
 * "no mocking needed for pure helpers" convention exactly.
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
    storyboardShots: [
      {
        shotNumber: 1,
        description: "Aria signs the contract",
        cameraSetup: "medium, eye_level",
        characterIds: ["char-1"],
        durationSeconds: 6,
      },
    ],
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

describe("buildStartFrameRenderPlanUserPrompt — prompt language (shared-field fix)", () => {
  it("defaults to English when promptLanguage is omitted", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(baseParams());
    expect(prompt).toContain(
      'PROMPT LANGUAGE (MANDATORY): write every "start_frame_requests[].prompt" and "negative_prompt" entirely in English',
    );
  });

  it('resolves the directive to Thai when promptLanguage is "th"', () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({ promptLanguage: "th" }),
    );
    expect(prompt).toContain(
      'PROMPT LANGUAGE (MANDATORY): write every "start_frame_requests[].prompt" and "negative_prompt" entirely in Thai',
    );
    expect(prompt).not.toContain("entirely in English");
  });

  it("renders the directive as the line immediately before the final JSON-compactness instruction", () => {
    const prompt = buildStartFrameRenderPlanUserPrompt(
      baseParams({ promptLanguage: "ja" }),
    );
    const lines = prompt.split("\n");
    expect(lines[lines.length - 2]).toBe(
      'PROMPT LANGUAGE (MANDATORY): write every "start_frame_requests[].prompt" and "negative_prompt" entirely in Japanese — every word of each shot\'s image prompt text must be in Japanese.',
    );
    expect(lines[lines.length - 1]).toMatch(/compact JSON/i);
  });
});

/* -------------------------------------------------------------------------- */
/* buildStartFrameShotPromptUserPrompt (single-shot)                         */
/* -------------------------------------------------------------------------- */

describe("buildStartFrameShotPromptUserPrompt — prompt language (shared-field fix)", () => {
  it("defaults to English when promptLanguage is omitted", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(baseShotParams());
    expect(prompt).toContain(
      'PROMPT LANGUAGE (MANDATORY): write the "prompt" and "negative_prompt" fields entirely in English',
    );
  });

  it('resolves the directive to Thai when promptLanguage is "th"', () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ promptLanguage: "th" }),
    );
    expect(prompt).toContain(
      'PROMPT LANGUAGE (MANDATORY): write the "prompt" and "negative_prompt" fields entirely in Thai',
    );
    expect(prompt).not.toContain("entirely in English");
  });

  it("renders the directive as the line immediately before the final JSON-compactness instruction, regardless of whether the optional `location` line is present", () => {
    const withoutLocation = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ promptLanguage: "ko" }),
    );
    const withoutLines = withoutLocation.split("\n");
    expect(withoutLines[withoutLines.length - 2]).toBe(
      'PROMPT LANGUAGE (MANDATORY): write the "prompt" and "negative_prompt" fields entirely in Korean — every word of the image prompt text must be in Korean.',
    );

    const withLocation = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        promptLanguage: "ko",
        location: { name: "Store", description: "Aisle", hasReferenceImage: false },
      }),
    );
    const withLocationLines = withLocation.split("\n");
    expect(withLocationLines[withLocationLines.length - 2]).toBe(
      'PROMPT LANGUAGE (MANDATORY): write the "prompt" and "negative_prompt" fields entirely in Korean — every word of the image prompt text must be in Korean.',
    );
  });
});
