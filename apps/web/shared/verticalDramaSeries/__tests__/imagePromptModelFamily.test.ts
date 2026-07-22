/**
 * Two-mode start-frame image prompt switch
 * (`planning/vd-start-frame-prompt-modes/plan.md`) — unit coverage for
 * `resolveImagePromptTargetFamily`/`resolveDefaultImagePromptMode`, the
 * single source of truth both the server (fact block + persist stamping)
 * and (later) the client (mode control + engine badge) use to classify a
 * start-frame IMAGE model into the `gpt | other` prompt-shaping family and
 * derive the default mode from it. Mirrors
 * `videoPromptModelFamily.test.ts`'s structure/style exactly.
 */
import { describe, expect, it } from "vitest";
import {
  resolveImagePromptTargetFamily,
  resolveDefaultImagePromptMode,
  IMAGE_PROMPT_MODEL_FAMILIES,
  VD_IMAGE_PROMPT_MODES,
  VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS,
  type ImagePromptModelFamily,
} from "../imagePromptModelFamily";

describe("resolveImagePromptTargetFamily", () => {
  it.each([
    ["gpt-image-1.5-all", undefined, undefined],
    ["gpt-image/1.5-text-to-image", undefined, undefined],
    ["gpt-image-2-text-to-image", undefined, undefined],
    ["higgsfield/gpt_image_2", undefined, undefined],
    ["gpt-4o-image", undefined, undefined],
    ["dall-e-3", undefined, undefined],
  ])("classifies real catalog id %s as gpt", (modelId) => {
    expect(resolveImagePromptTargetFamily({ modelId })).toBe("gpt");
  });

  it.each(["google-nano-banana-pro", "flux-2.0", "z-image", "grok-imagine"])(
    "classifies %s as other (not a GPT-family id)",
    (modelId) => {
      expect(resolveImagePromptTargetFamily({ modelId })).toBe("other");
    },
  );

  it("classifies a null/undefined source as other, without throwing", () => {
    expect(resolveImagePromptTargetFamily(null)).toBe("other");
    expect(resolveImagePromptTargetFamily(undefined)).toBe("other");
  });

  it("does NOT classify a letter-embedded 'image' fragment (e.g. 'z-image') as gpt — no bare 'image' match", () => {
    expect(resolveImagePromptTargetFamily({ modelId: "z-image" })).toBe("other");
  });

  it("does NOT classify a letter-embedded 'dalle' fragment inside an unrelated word as gpt", () => {
    expect(resolveImagePromptTargetFamily({ modelId: "medallelier-model" })).toBe("other");
  });

  it("classifies from `name` when `modelId` alone doesn't carry the token", () => {
    expect(
      resolveImagePromptTargetFamily({ modelId: "generic-id-1", name: "GPT-Image 1.5 (All)" }),
    ).toBe("gpt");
  });

  it("classifies from `provider` when it itself carries the token", () => {
    expect(
      resolveImagePromptTargetFamily({ modelId: "generic-id-2", provider: "dall-e" }),
    ).toBe("gpt");
  });

  it("reads configJson hints (kieModelId/externalModelId/providerModelId) when modelId/name/provider don't carry the family token", () => {
    expect(
      resolveImagePromptTargetFamily({
        modelId: "generic-id-3",
        configJson: { kieModelId: "gpt-image-2-text-to-image" },
      }),
    ).toBe("gpt");
    expect(
      resolveImagePromptTargetFamily({
        modelId: "generic-id-4",
        configJson: { externalModelId: "dall-e-3" },
      }),
    ).toBe("gpt");
    expect(
      resolveImagePromptTargetFamily({
        modelId: "generic-id-5",
        configJson: { providerModelId: "gpt-4o-image" },
      }),
    ).toBe("gpt");
  });
});

describe("resolveDefaultImagePromptMode", () => {
  it("maps gpt family -> policy_safe_rewrite", () => {
    expect(resolveDefaultImagePromptMode("gpt")).toBe("policy_safe_rewrite");
  });

  it("maps other family -> cinematic_narrative", () => {
    expect(resolveDefaultImagePromptMode("other")).toBe("cinematic_narrative");
  });

  it("round-trips every real catalog id through resolveImagePromptTargetFamily -> resolveDefaultImagePromptMode as expected", () => {
    expect(
      resolveDefaultImagePromptMode(resolveImagePromptTargetFamily({ modelId: "gpt-image-1.5-all" })),
    ).toBe("policy_safe_rewrite");
    expect(
      resolveDefaultImagePromptMode(
        resolveImagePromptTargetFamily({ modelId: "google-nano-banana-pro" }),
      ),
    ).toBe("cinematic_narrative");
  });
});

describe("IMAGE_PROMPT_MODEL_FAMILIES / VD_IMAGE_PROMPT_MODES / VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS", () => {
  it("carries exactly the 2 families", () => {
    expect(IMAGE_PROMPT_MODEL_FAMILIES).toEqual(["gpt", "other"]);
    const families: ImagePromptModelFamily[] = ["gpt", "other"];
    expect(families).toEqual(IMAGE_PROMPT_MODEL_FAMILIES);
  });

  it("carries exactly the 2 modes", () => {
    expect(VD_IMAGE_PROMPT_MODES).toEqual(["policy_safe_rewrite", "cinematic_narrative"]);
  });

  it("maps each mode to a non-empty, mode-specific skill folder name", () => {
    expect(VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.policy_safe_rewrite).toBe(
      "vertical-drama-shot-synopsis-image-prompt",
    );
    expect(VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.cinematic_narrative).toBe(
      "vertical-drama-cinematic-narrative-image-prompt",
    );
  });
});
