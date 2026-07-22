/**
 * Model-family-aware, vision-grounded video prompt quality upgrade
 * (`planning/vd-video-prompt-model-family-quality/plan.md`) — unit coverage
 * for `resolveVideoPromptTargetFamily`/`videoPromptFamilySupportsNegativePrompt`,
 * the single source of truth both the server (fact block + persist stamping)
 * and the client (badge/mismatch) use to classify a video model into the
 * `grok | veo | seedance | other` prompt-shaping family.
 */
import { describe, expect, it } from "vitest";
import {
  resolveVideoPromptTargetFamily,
  videoPromptFamilySupportsNegativePrompt,
  VIDEO_PROMPT_MODEL_FAMILIES,
  VIDEO_PROMPT_MODEL_FAMILY_LABELS,
  type VideoPromptModelFamily,
} from "../videoPromptModelFamily";

describe("resolveVideoPromptTargetFamily", () => {
  it("classifies a Hermes Grok video model as grok, from modelId + provider + name", () => {
    expect(
      resolveVideoPromptTargetFamily({
        modelId: "grok-imagine-video-1.5",
        provider: "hermes_grok",
        name: "Grok video 3",
      }),
    ).toBe("grok");
  });

  it("classifies a Veo 3.1 Lite model as veo, from modelId + name", () => {
    expect(
      resolveVideoPromptTargetFamily({
        modelId: "veo3/generate-veo-3-video-lite",
        name: "Veo 3.1 Lite",
      }),
    ).toBe("veo");
  });

  it("classifies a Seedance model as seedance, from modelId containing 'seedance' + a byteplus provider", () => {
    expect(
      resolveVideoPromptTargetFamily({
        modelId: "bytedance/seedance-2.0/pro",
        provider: "byteplus",
      }),
    ).toBe("seedance");
  });

  it("classifies a ModelArk-provided seedance model as seedance too (both byteplus platform tokens recognized)", () => {
    expect(
      resolveVideoPromptTargetFamily({
        modelId: "seedance-pro",
        provider: "modelark",
      }),
    ).toBe("seedance");
  });

  it("classifies kling-2.6 as other (not a recognized grok/veo/seedance family)", () => {
    expect(resolveVideoPromptTargetFamily({ modelId: "kling-2.6" })).toBe("other");
  });

  it("classifies a null/undefined source as other, without throwing", () => {
    expect(resolveVideoPromptTargetFamily(null)).toBe("other");
    expect(resolveVideoPromptTargetFamily(undefined)).toBe("other");
  });

  it("does NOT classify a letter-embedded 'veo' fragment (e.g. 'alveolar-model') as veo — letter-boundary tokenization", () => {
    expect(resolveVideoPromptTargetFamily({ modelId: "alveolar-model" })).toBe("other");
  });

  it("does NOT classify a letter-embedded 'grok' fragment as grok either (same letter-boundary rule)", () => {
    expect(resolveVideoPromptTargetFamily({ modelId: "groktopus-model" })).toBe("other");
  });

  it("still matches grok/veo at the start or end of a hyphenated id (word-boundary, not exact-match)", () => {
    expect(resolveVideoPromptTargetFamily({ modelId: "grok-video-1" })).toBe("grok");
    expect(resolveVideoPromptTargetFamily({ modelId: "veo3-lite" })).toBe("veo");
  });

  it("prioritizes grok over veo/seedance when a hermes_grok provider is paired with an otherwise-ambiguous id", () => {
    // A hermes_grok-provided model wins grok no matter what its display name
    // says — see the resolver's own doc comment ("Order matters: grok
    // first").
    expect(
      resolveVideoPromptTargetFamily({ modelId: "custom-video-1", provider: "hermes_grok" }),
    ).toBe("grok");
  });

  it("reads configJson hints (kieModelId/apiPayloadFormat/externalModelId) when modelId/name/provider don't carry the family token", () => {
    expect(
      resolveVideoPromptTargetFamily({
        modelId: "generic-id-1",
        configJson: { kieModelId: "veo3/generate-veo-3-video-fast" },
      }),
    ).toBe("veo");
  });
});

describe("videoPromptFamilySupportsNegativePrompt", () => {
  it("is false for grok (no negative-prompt channel) and true for every other family", () => {
    expect(videoPromptFamilySupportsNegativePrompt("grok")).toBe(false);
    expect(videoPromptFamilySupportsNegativePrompt("veo")).toBe(true);
    expect(videoPromptFamilySupportsNegativePrompt("seedance")).toBe(true);
    expect(videoPromptFamilySupportsNegativePrompt("other")).toBe(true);
  });
});

describe("VIDEO_PROMPT_MODEL_FAMILIES / VIDEO_PROMPT_MODEL_FAMILY_LABELS", () => {
  it("carries exactly the 4 families, each with a UI label", () => {
    expect(VIDEO_PROMPT_MODEL_FAMILIES).toEqual(["grok", "veo", "seedance", "other"]);
    const families: VideoPromptModelFamily[] = ["grok", "veo", "seedance", "other"];
    for (const family of families) {
      expect(typeof VIDEO_PROMPT_MODEL_FAMILY_LABELS[family]).toBe("string");
      expect(VIDEO_PROMPT_MODEL_FAMILY_LABELS[family].length).toBeGreaterThan(0);
    }
  });
});
