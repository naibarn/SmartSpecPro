import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getStaticFallbackModels, getStaticModelById } from "../modelRegistry";
import { resolveVerticalDramaCharacterPromptCapability } from "../verticalDramaCharacterPromptContract";

describe("Vertical Drama character prompt catalog parity", () => {
  it("keeps static Nano Banana entries explicitly target-capable", () => {
    const models = getStaticFallbackModels();
    for (const [id, family, maxPromptLength] of [
      ["google-nano-banana-pro", "nano_banana", 20_000],
      ["google-banana-2", "nano_banana", 20_000],
      ["google-banana-2-lite", "nano_banana", 20_000],
      ["gpt-image-2-text-to-image", "gpt_image_2", 20_000],
      ["google/nano-banana", "nano_banana", 20_000],
      ["google/pro-image-to-image", "nano_banana", 20_000],
      ["google/nano-banana-edit", "nano_banana", 20_000],
      ["seedream", "seedream", 5_000],
      ["seedream/seedream-v4-text-to-image", "seedream", 5_000],
      ["seedream/4.5-text-to-image", "seedream", 5_000],
      ["seedream/5-pro-text-to-image", "seedream", 5_000],
    ] as const) {
      const model = models.find(entry => entry.id === id);
      expect(model, `missing static model ${id}`).toBeDefined();
      expect(model?.configJson).toMatchObject({
        maxPromptLength,
        verticalDramaCharacterPromptContract: {
          family,
          negativePromptMode: "inline_only",
        },
      });
    }
  });

  it("keeps Kie seed rows explicitly target-capable", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../scripts/seed-media-models-kie-ai.ts"),
      "utf8",
    );

    const modelBlock = (modelId: string) => {
      const start = source.indexOf(`modelId: "${modelId}"`);
      const next = source.indexOf("\n  {\n    modelId:", start + 1);
      return source.slice(start, next === -1 ? source.length : next);
    };

    for (const [modelId, family, maxPromptLength] of [
      ["gpt-image-2-text-to-image", "gpt_image_2", "20000"],
      ["google-nano-banana-pro", "nano_banana", "20000"],
      ["google/nano-banana", "nano_banana", "20000"],
      ["google-banana-2", "nano_banana", "20000"],
      ["google-banana-2-lite", "nano_banana", "20000"],
      ["google/pro-image-to-image", "nano_banana", "20000"],
      ["google/nano-banana-edit", "nano_banana", "20000"],
      ["seedream", "seedream", "5000"],
      ["seedream/seedream-v4-text-to-image", "seedream", "5000"],
      ["seedream/4.5-text-to-image", "seedream", "5000"],
      ["seedream/5-pro-text-to-image", "seedream", "5000"],
    ]) {
      const block = modelBlock(modelId);
      expect(block, `missing seed model ${modelId}`).toContain(`modelId: "${modelId}"`);
      expect(block).toContain(`maxPromptLength: ${maxPromptLength}`);
      expect(block).toContain(`family: "${family}"`);
      expect(block).toContain('negativePromptMode: "inline_only"');
    }
  });

  it("uses the canonical selected family even when a reference route differs", () => {
    const capability = resolveVerticalDramaCharacterPromptCapability(
      {
        modelId: "seedream/5-pro-text-to-image",
        referenceImageRoute: "google-banana-2",
      },
      { requireTarget: true },
    );

    expect(capability).toMatchObject({
      family: "seedream",
      maxPromptChars: 5_000,
      source: "static",
    });
  });

  it.each([
    ["nano-banana", "google/nano-banana", "nano_banana", 20_000],
    ["nano-banana-pro", "google-nano-banana-pro", "nano_banana", 20_000],
    ["seedream-3", "seedream", "seedream", 5_000],
    ["seedream-4", "seedream/seedream-v4-text-to-image", "seedream", 5_000],
    ["seedream-4.5", "seedream/4.5-text-to-image", "seedream", 5_000],
    ["seedream-5-pro", "seedream/5-pro-text-to-image", "seedream", 5_000],
  ] as const)("resolves %s alias to its target contract", (_alias, modelId, family, maxPromptChars) => {
    const capability = resolveVerticalDramaCharacterPromptCapability(
      { modelId: _alias },
      { requireTarget: true },
    );

    expect(capability).toMatchObject({
      canonicalModelId: modelId,
      family,
      maxPromptChars,
      negativePromptMode: "inline_only",
    });
  });

  it("keeps representative non-target static entries unchanged and legacy", () => {
    for (const [lookupKey, expectedId] of [
      ["flux-2.0", "flux-2.0"],
      ["z-image", "z-image"],
      ["grok-imagine", "grok-imagine"],
    ] as const) {
      const model = getStaticModelById(lookupKey);
      expect(model?.id).toBe(expectedId);
      expect(model?.configJson?.verticalDramaCharacterPromptContract).toBeUndefined();

      const capability = resolveVerticalDramaCharacterPromptCapability({ modelId: lookupKey });
      expect(capability).toMatchObject({
        family: "other",
        negativePromptMode: "separate_legacy",
        promptProfile: "legacy",
        configured: false,
      });
    }
  });
});
