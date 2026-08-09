import { describe, expect, it } from "vitest";
import {
  normalizeVerticalDramaCharacterPromptRequest,
  VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
} from "../verticalDramaCharacterPromptContract";

const targetCapability = {
  family: "nano_banana" as const,
  maxPromptChars: 20_000,
  negativePromptMode: "inline_only" as const,
  promptProfile: "rich" as const,
  source: "db" as const,
  canonicalModelId: "google/nano-banana-pro",
  configured: true,
};

const legacyCapability = {
  family: "other" as const,
  maxPromptChars: 3_800,
  negativePromptMode: "separate_legacy" as const,
  promptProfile: "legacy" as const,
  source: "explicit_legacy" as const,
  canonicalModelId: "legacy-model",
  configured: false,
};

describe("vertical drama character request normalizer", () => {
  it("removes target negativePrompt without changing authored prose", () => {
    expect(
      normalizeVerticalDramaCharacterPromptRequest(
        { prompt: "natural human skin with visible pores", negativePrompt: "plastic", model: targetCapability.canonicalModelId },
        {
          capability: targetCapability,
          marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
          contractVersion: "vd_character_natural_human_v1",
        },
      ),
    ).toEqual({ prompt: "natural human skin with visible pores", model: targetCapability.canonicalModelId });
  });

  it("preserves legacy negativePrompt exactly", () => {
    expect(
      normalizeVerticalDramaCharacterPromptRequest(
        { prompt: "legacy portrait", negativePrompt: "old negative guard", model: legacyCapability.canonicalModelId },
        { capability: legacyCapability, marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER, contractVersion: null },
      ),
    ).toEqual({ prompt: "legacy portrait", negativePrompt: "old negative guard", model: legacyCapability.canonicalModelId });
  });

  it("is idempotent for an already-normalized target request", () => {
    const params = {
      capability: targetCapability,
      marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
      contractVersion: "vd_character_natural_human_v1",
    } as const;
    const once = normalizeVerticalDramaCharacterPromptRequest(
      {
        prompt: "natural human skin with varied texture",
        negativePrompt: "plastic skin",
        model: targetCapability.canonicalModelId,
      },
      params,
    );
    expect(normalizeVerticalDramaCharacterPromptRequest(once, params)).toEqual(once);
  });

  it("uses JavaScript length semantics and omits prompt contents from errors", () => {
    const prompt = `ตัวละคร🙂${"x".repeat(20_000)}`;
    expect(() =>
      normalizeVerticalDramaCharacterPromptRequest(
        { prompt, model: targetCapability.canonicalModelId },
        { capability: targetCapability, marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER, contractVersion: "vd_character_natural_human_v1" },
      ),
    ).toThrowError(expect.objectContaining({
      code: "VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG",
      promptLength: prompt.length,
    }));
    try {
      normalizeVerticalDramaCharacterPromptRequest(
        { prompt, model: targetCapability.canonicalModelId },
        { capability: targetCapability, marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER, contractVersion: "vd_character_natural_human_v1" },
      );
    } catch (error) {
      expect((error as Error).message).not.toContain(prompt);
    }
  });

  it("fails closed when the target marker or capability is missing", () => {
    expect(() =>
      normalizeVerticalDramaCharacterPromptRequest(
        { prompt: "portrait", model: targetCapability.canonicalModelId },
        { capability: targetCapability, marker: null, contractVersion: "vd_character_natural_human_v1" },
      ),
    ).toThrowError(expect.objectContaining({ code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID" }));
    expect(() =>
      normalizeVerticalDramaCharacterPromptRequest(
        { prompt: "portrait", model: targetCapability.canonicalModelId },
        { marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER, contractVersion: "vd_character_natural_human_v1" },
      ),
    ).toThrowError(expect.objectContaining({ code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING" }));
  });
});
