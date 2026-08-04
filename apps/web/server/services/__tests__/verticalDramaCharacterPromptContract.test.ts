import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetStaticModelById } = vi.hoisted(() => ({
  mockGetStaticModelById: vi.fn(),
}));

vi.mock("../modelRegistry", () => ({
  getStaticModelById: mockGetStaticModelById,
}));

import {
  assertVerticalDramaCharacterPromptLength,
  isTargetVerticalDramaCharacterCapability,
  resolveVerticalDramaCharacterPromptCapability,
} from "../verticalDramaCharacterPromptContract";

const contract = {
  family: "gpt_image_2",
  negativePromptMode: "inline_only",
};

describe("vertical drama character prompt contract", () => {
  beforeEach(() => mockGetStaticModelById.mockReset());

  it("resolves GPT Image 2 as rich single-prompt target capability", () => {
    const capability = resolveVerticalDramaCharacterPromptCapability(
      {
        modelId: "gpt-image-2-text-to-image",
        configJson: { maxPromptLength: 20_000, verticalDramaCharacterPromptContract: contract },
      },
      { requireTarget: true },
    );

    expect(capability).toMatchObject({
      family: "gpt_image_2",
      maxPromptChars: 20_000,
      negativePromptMode: "inline_only",
      promptProfile: "rich",
      source: "db",
      configured: true,
    });
    expect(isTargetVerticalDramaCharacterCapability(capability)).toBe(true);
  });

  it("resolves Seedream as a compact 5,000-character target", () => {
    const capability = resolveVerticalDramaCharacterPromptCapability(
      {
        modelId: "seedream/5-pro-text-to-image",
        configJson: {
          maxPromptLength: 5_000,
          verticalDramaCharacterPromptContract: {
            family: "seedream",
            negativePromptMode: "inline_only",
          },
        },
      },
      { requireTarget: true },
    );

    expect(capability).toMatchObject({
      family: "seedream",
      maxPromptChars: 5_000,
      promptProfile: "compact",
    });
  });

  it("prefers DB metadata over a conflicting static fallback", () => {
    mockGetStaticModelById.mockReturnValue({
      id: "gpt-image-2-text-to-image",
      configJson: {
        maxPromptLength: 20_000,
        verticalDramaCharacterPromptContract: {
          family: "gpt_image_2",
          negativePromptMode: "inline_only",
        },
      },
    });

    expect(
      resolveVerticalDramaCharacterPromptCapability(
        {
          modelId: "gpt-image-2-text-to-image",
          configJson: { maxPromptLength: 20_000, verticalDramaCharacterPromptContract: contract },
        },
        { requireTarget: true },
      ),
    ).toMatchObject({ family: "gpt_image_2", source: "db" });
  });

  it("keeps reference-image route resolution on the same capability", () => {
    const text = resolveVerticalDramaCharacterPromptCapability(
      {
        modelId: "seedream/5-pro-text-to-image",
        configJson: {
          maxPromptLength: 5_000,
          verticalDramaCharacterPromptContract: {
            family: "seedream",
            negativePromptMode: "inline_only",
          },
        },
      },
      { requireTarget: true },
    );
    const reference = resolveVerticalDramaCharacterPromptCapability(
      {
        modelId: "seedream/5-pro-text-to-image",
        referenceImageRoute: "google-banana-2",
        configJson: {
          maxPromptLength: 5_000,
          verticalDramaCharacterPromptContract: {
            family: "seedream",
            negativePromptMode: "inline_only",
          },
        },
      },
      { requireTarget: true },
    );

    expect(reference).toEqual(text);
  });

  it("uses a complete static fallback when DB config is absent", () => {
    mockGetStaticModelById.mockReturnValue({
      configJson: {
        maxPromptLength: 20_000,
        verticalDramaCharacterPromptContract: {
          family: "nano_banana",
          negativePromptMode: "inline_only",
        },
      },
    });

    expect(
      resolveVerticalDramaCharacterPromptCapability(
        { modelId: "google-nano-banana-pro" },
        { requireTarget: true },
      ),
    ).toMatchObject({
      family: "nano_banana",
      maxPromptChars: 20_000,
      source: "static",
      promptProfile: "rich",
    });
  });

  it("fails closed when target metadata is incomplete", () => {
    mockGetStaticModelById.mockReturnValue(undefined);

    expect(() =>
      resolveVerticalDramaCharacterPromptCapability(
        { modelId: "unknown-model", configJson: { maxPromptLength: 20_000 } },
        { requireTarget: true },
      ),
    ).toThrowError(expect.objectContaining({
      code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING",
    }));
  });

  it.each([
    [{ family: "not_a_family", negativePromptMode: "inline_only" }, 20_000],
    [{ family: "gpt_image_2", negativePromptMode: "separate_legacy" }, 20_000],
    [{ family: "seedream", negativePromptMode: "inline_only" }, 20_000],
  ])("rejects malformed target contract %#", (rawContract, maxPromptLength) => {
    expect(() =>
      resolveVerticalDramaCharacterPromptCapability(
        {
          modelId: "invalid-model",
          configJson: { maxPromptLength, verticalDramaCharacterPromptContract: rawContract },
        },
        { requireTarget: true },
      ),
    ).toThrowError(expect.objectContaining({
      code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
    }));
  });

  it("rejects fractional target limits instead of flooring them", () => {
    expect(() =>
      resolveVerticalDramaCharacterPromptCapability(
        {
          modelId: "gpt-image-2-text-to-image",
          configJson: {
            maxPromptLength: 20_000.9,
            verticalDramaCharacterPromptContract: contract,
          },
        },
        { requireTarget: true },
      ),
    ).toThrowError(expect.objectContaining({
      code: "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
    }));
  });

  it("keeps an unmarked caller on the explicit legacy path", () => {
    mockGetStaticModelById.mockReturnValue(undefined);

    expect(
      resolveVerticalDramaCharacterPromptCapability({ modelId: "legacy-model" }),
    ).toMatchObject({
      family: "other",
      maxPromptChars: 3_800,
      negativePromptMode: "separate_legacy",
      promptProfile: "legacy",
      source: "explicit_legacy",
      configured: false,
    });
  });

  it.each([
    ["gpt_image_2", 20_000],
    ["nano_banana", 20_000],
    ["seedream", 5_000],
  ] as const)("accepts exact target boundary for %s", (family, limit) => {
    const capability = {
      family,
      maxPromptChars: limit,
      negativePromptMode: "inline_only" as const,
      promptProfile: family === "seedream" ? "compact" as const : "rich" as const,
      source: "db" as const,
      canonicalModelId: "model",
      configured: true,
    };

    expect(() => assertVerticalDramaCharacterPromptLength("x".repeat(limit), capability)).not.toThrow();
    expect(() => assertVerticalDramaCharacterPromptLength(`${"x".repeat(limit)}y`, capability)).toThrow(
      /too[_ ]long/i,
    );
  });

  it("uses JavaScript string.length semantics for Thai and emoji", () => {
    const capability = {
      family: "seedream" as const,
      maxPromptChars: 5,
      negativePromptMode: "inline_only" as const,
      promptProfile: "compact" as const,
      source: "db" as const,
      canonicalModelId: "seedream/5-pro-text-to-image",
      configured: true,
    };

    expect(() => assertVerticalDramaCharacterPromptLength("ไทย", capability)).not.toThrow();
    expect(() => assertVerticalDramaCharacterPromptLength("🙂🙂🙂", capability)).toThrow(/too[_ ]long/i);
  });

  it("exposes bounded structured length metadata without the prompt body", () => {
    const capability = {
      family: "seedream" as const,
      maxPromptChars: 5,
      negativePromptMode: "inline_only" as const,
      promptProfile: "compact" as const,
      source: "db" as const,
      canonicalModelId: "seedream/5-pro-text-to-image",
      configured: true,
    };
    const sensitivePrompt = "secret-character-prompt";

    expect(() => assertVerticalDramaCharacterPromptLength(sensitivePrompt, capability)).toThrow();
    try {
      assertVerticalDramaCharacterPromptLength(sensitivePrompt, capability);
    } catch (error) {
      expect(error).toMatchObject({
        code: "VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG",
        modelId: "seedream/5-pro-text-to-image",
        family: "seedream",
        maxPromptChars: 5,
        promptLength: sensitivePrompt.length,
      });
      expect((error as Error).message).not.toContain(sensitivePrompt);
    }
  });
});
