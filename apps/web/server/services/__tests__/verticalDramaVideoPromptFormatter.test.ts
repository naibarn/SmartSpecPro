/**
 * Vertical Drama Storyboard Completion Plan — Phase 3.3 unit coverage for
 * `verticalDramaVideoPromptFormatter.ts`'s `formatVideoClipRequest`.
 *
 * Covers the model-family behavior matrix required by the plan:
 *  - Veo 3.1 (any tier) — native audio: dialogue embedded verbatim +
 *    delivery/acting direction, `generateAudio: true`, `ttsFallback: false`.
 *  - Grok Imagine 1.5 (kie.ai, `grok-imagine-video-1-5-preview`) — no native
 *    audio: acting/mouth-movement direction only (no literal transcript),
 *    `ttsFallback: true` with the resolved lines echoed back.
 *  - A Seedance model id (ByteDance/BytePlus ModelArk family, DB-only — no
 *    static catalog entry, `configJson.hasAudio: false`) — same non-native
 *    behavior as Grok. (Note: WaveSpeed's `bytedance/seedance-2.0/*` variants
 *    DO have a static catalog entry with `nativeAudio: true` — this test
 *    intentionally picks a Seedance id WITHOUT native audio to exercise the
 *    non-native branch + the DB-only derivation fallback.)
 *  - An unknown/generic model id — falls back to the generic family, same
 *    non-native behavior.
 *  - Silent clips (no dialogue lines) never set `ttsFallback`/`generateAudio`.
 */
import { describe, expect, it } from "vitest";
import {
  formatVideoClipRequest,
  resolveProviderFamily,
  type VerticalDramaClipDialogueLine,
} from "../verticalDramaVideoPromptFormatter";

function clip(over: Partial<Parameters<typeof formatVideoClipRequest>[0]["clip"]> = {}) {
  return {
    clipNumber: 1,
    prompt: "Slow push-in on Aria as tension rises.",
    negativeMotionPrompt: "no warping, no identity drift",
    durationSeconds: 8,
    startFrameAssetId: "500",
    ...over,
  };
}

function dialogueLine(over: Partial<VerticalDramaClipDialogueLine> = {}): VerticalDramaClipDialogueLine {
  return {
    characterKey: "aria",
    lineTh: "เราไม่ได้จบกันแค่นี้หรอกนะ",
    emotion: "cold defiance",
    delivery: { tone: "cold", pace: "slow", pauses: "a beat before the last word", texture: "steady" },
    subtext: "She wants him to believe she's unafraid, but her hands are shaking.",
    ...over,
  };
}

describe("formatVideoClipRequest — Veo 3.1 (native audio)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };

  it("embeds the Thai dialogue line verbatim + delivery/acting direction and sets generateAudio true", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.providerFamily).toBe("veo");
    expect(result.nativeAudioDialogue).toBe(true);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
    expect(result.ttsLines).toEqual([]);
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
    expect(result.prompt).toContain("tone: cold");
    expect(result.prompt).toContain("pace: slow");
    expect(result.prompt).toContain("Subtext/acting note:");
    expect(result.maxReferenceImages).toBe(3);
    expect(result.supportsStartFrame).toBe(true);
  });

  it("leaves the base prompt untouched for a silent clip with no start frame (no dialogue lines, no startFrameAssetId)", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: undefined }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });
    expect(result.prompt).toBe(clip().prompt);
    expect(result.generateAudio).toBe(false);
    expect(result.ttsFallback).toBe(false);
  });

  it("states the speech language explicitly as 'spoken Thai' by default (no dialogueLanguage supplied)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });
    expect(result.prompt).toContain("in natural spoken Thai, exactly:");
  });

  it("states the speech language explicitly as 'spoken English' when dialogueLanguage is 'en'", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine({ lineTh: "We are not done here." })],
      modelId: veoModel.id,
      model: veoModel,
      dialogueLanguage: "en",
    });
    expect(result.prompt).toContain("in natural spoken English, exactly:");
    expect(result.prompt).toContain("We are not done here.");
  });

  it("supports the wider dialogueLanguage set (e.g. Vietnamese, Arabic) beyond just th/en", () => {
    const viResult = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine({ lineTh: "Chúng ta chưa xong đâu." })],
      modelId: veoModel.id,
      model: veoModel,
      dialogueLanguage: "vi",
    });
    expect(viResult.prompt).toContain("in natural spoken Vietnamese, exactly:");

    const arResult = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine({ lineTh: "لم ننته بعد." })],
      modelId: veoModel.id,
      model: veoModel,
      dialogueLanguage: "ar",
    });
    expect(arResult.prompt).toContain("in natural spoken Arabic, exactly:");
  });
});

describe("formatVideoClipRequest — Grok Imagine 1.5 (native audio — xAI synchronized speech, user-confirmed 2026-07-06)", () => {
  const grokModel = {
    id: "grok-imagine-video-1-5-preview",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["grok imagine 1.5", "grok imagine video 1.5"],
    configJson: { maxReferenceImages: 1, hasAudio: true },
  };

  it("embeds the Thai dialogue verbatim with generateAudio and no ttsFallback", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: grokModel.id,
      model: grokModel,
    });

    expect(result.providerFamily).toBe("grok");
    expect(result.nativeAudioDialogue).toBe(true);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
    // Literal transcript IS embedded for native-audio models.
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
    expect(result.prompt).toContain("in natural spoken Thai, exactly:");
    expect(result.maxReferenceImages).toBe(1);
  });

  it("states 'spoken in English' when dialogueLanguage is 'en'", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: grokModel.id,
      model: grokModel,
      dialogueLanguage: "en",
    });
    expect(result.prompt).toContain("in natural spoken English, exactly:");
  });
});

describe("formatVideoClipRequest — Seedance (ByteDance/BytePlus ModelArk family, DB-only model, no native audio)", () => {
  const seedanceModel = {
    id: "seedance-1-0-lite-i2v-250428",
    type: "video" as const,
    provider: "byteplus_modelark",
    aliases: [],
    configJson: { maxReferenceImages: 1, hasAudio: false },
  };

  it("resolves the seedance provider family and stays non-native (mouth-movement direction, ttsFallback true)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: seedanceModel.id,
      model: seedanceModel,
    });

    expect(result.providerFamily).toBe("seedance");
    expect(result.nativeAudioDialogue).toBe(false);
    expect(result.ttsFallback).toBe(true);
    expect(result.prompt).not.toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
  });
});

describe("formatVideoClipRequest — unknown model id -> generic family", () => {
  const unknownModel = {
    id: "some-future-video-model",
    type: "video" as const,
    provider: "some_provider",
    aliases: [],
    configJson: {},
  };

  it("falls back to the generic family and non-native dialogue handling", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: unknownModel.id,
      model: unknownModel,
    });

    expect(result.providerFamily).toBe("generic");
    expect(result.nativeAudioDialogue).toBe(false);
    expect(result.ttsFallback).toBe(true);
    expect(result.maxReferenceImages).toBe(0);
    expect(result.supportsStartFrame).toBe(false);
  });
});

describe("formatVideoClipRequest — WaveSpeed Seedance 2.0 (static catalog entry, HAS native audio)", () => {
  const waveSpeedSeedanceModel = {
    id: "bytedance/seedance-2.0/image-to-video",
    type: "video" as const,
    provider: "wavespeed_ai",
    aliases: [],
    configJson: {},
  };

  it("resolves as seedance family AND native audio (static catalog entry overrides the generic non-native default)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: waveSpeedSeedanceModel.id,
      model: waveSpeedSeedanceModel,
    });

    expect(result.providerFamily).toBe("seedance");
    expect(result.nativeAudioDialogue).toBe(true);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
  });
});

describe("formatVideoClipRequest — start-frame grounding instruction (video MCP submission fix)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };
  const unknownModel = {
    id: "some-future-video-model",
    type: "video" as const,
    provider: "some_provider",
    aliases: [],
    configJson: {},
  };

  it("prepends the grounding instruction when the clip has a start frame and the model supports one", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: "500" }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt.startsWith(
      "Use the attached first image as the exact start frame and visual source of truth — continue motion from it; keep faces, wardrobe, set and composition identical.",
    )).toBe(true);
    expect(result.prompt).toContain(clip().prompt);
  });

  it("does not add the grounding instruction when the clip has no start frame", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: undefined }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toBe(clip().prompt);
    expect(result.prompt).not.toContain("exact start frame");
  });

  it("does not add the grounding instruction when the model does not support a start frame (even if the clip has one)", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: "500" }),
      dialogueLines: [],
      modelId: unknownModel.id,
      model: unknownModel,
    });

    expect(result.supportsStartFrame).toBe(false);
    expect(result.prompt).toBe(clip().prompt);
    expect(result.prompt).not.toContain("exact start frame");
  });

  it("still respects the model's native-audio dialogue clause after the grounding instruction", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: "500" }),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt.startsWith("Use the attached first image")).toBe(true);
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
  });
});

describe("resolveProviderFamily", () => {
  it("detects veo/grok/seedance/generic independently of resolveVerticalDramaCapabilities", () => {
    expect(
      resolveProviderFamily("veo-3-1", { type: "video", provider: "kie.ai", aliases: [] }),
    ).toBe("veo");
    expect(
      resolveProviderFamily("grok-imagine-video-1-5-preview", {
        type: "video",
        provider: "kie.ai",
        aliases: [],
      }),
    ).toBe("grok");
    expect(
      resolveProviderFamily("bytedance/seedance-2.0/image-to-video", {
        type: "video",
        provider: "wavespeed_ai",
        aliases: [],
      }),
    ).toBe("seedance");
    expect(
      resolveProviderFamily("acme-video-1", { type: "video", provider: "acme", aliases: [] }),
    ).toBe("generic");
  });
});
