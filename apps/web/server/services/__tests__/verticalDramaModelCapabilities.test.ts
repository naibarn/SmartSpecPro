/**
 * Vertical Drama Storyboard Completion Plan — Phase 0 capability metadata +
 * Phase 0.3 new video model catalog entries.
 *
 * Covers:
 *  - `ModelDefinition` capability fields (`supportsStartFrame`,
 *    `maxReferenceImages`, `nativeAudioDialogue`, `verticalDramaReady`) are
 *    populated for every existing/new video model per the plan's explicit
 *    requirements.
 *  - `grok-imagine-video-1-5-preview` and the WaveSpeed Seedance 2.0 models
 *    are present, enabled, and carry correct capability metadata (both are
 *    verified-callable providers — see the Result Report for evidence).
 *  - `deriveVerticalDramaCapabilities` / `resolveVerticalDramaCapabilities`
 *    behave correctly for both known static models and DB-only models.
 */
import { describe, expect, it } from "vitest";
import {
  getStaticFallbackModels,
  getStaticModelById,
  deriveVerticalDramaCapabilities,
  isGrokVideoFamily,
  resolveVerticalDramaCapabilities,
} from "../modelRegistry";

const staticModels = getStaticFallbackModels();
const videoModels = staticModels.filter((m) => m.type === "video");

function findVideo(id: string) {
  const model = videoModels.find((m) => m.id === id);
  if (!model) throw new Error(`Expected static video model "${id}" to exist`);
  return model;
}

describe("Vertical Drama capability metadata (Phase 0.1/0.2)", () => {
  it("marks every Veo 3.1 tier as start-frame capable with native audio and 3 reference images", () => {
    for (const id of [
      "veo3/generate-veo-3-video-lite",
      "veo-3-1",
      "veo3/generate-veo-3-video-fast",
    ]) {
      const model = findVideo(id);
      expect(model.supportsStartFrame).toBe(true);
      expect(model.maxReferenceImages).toBe(3);
      expect(model.nativeAudioDialogue).toBe(true);
      expect(model.verticalDramaReady).toBe(true);
    }
  });

  it("marks veo3/extend-video as Veo-family but NOT start-frame-capable (extends an existing task, not a fresh render)", () => {
    const model = findVideo("veo3/extend-video");
    expect(model.supportsStartFrame).toBe(false);
    expect(model.verticalDramaReady).toBe(false);
  });

  it("marks HappyHorse reference-to-video with 9 max reference images and no native audio", () => {
    const model = findVideo("happyhorse/reference-to-video");
    expect(model.supportsStartFrame).toBe(true);
    expect(model.maxReferenceImages).toBe(9);
    expect(model.nativeAudioDialogue).toBe(false);
    expect(model.verticalDramaReady).toBe(true);
  });

  it("marks HappyHorse text-to-video and video-edit as NOT start-frame-capable", () => {
    expect(findVideo("happyhorse/text-to-video").supportsStartFrame).toBe(false);
    expect(findVideo("happyhorse/video-edit").supportsStartFrame).toBe(false);
  });

  it("marks Gemini Omni Video as start-frame capable with native audio and 9:16", () => {
    const model = findVideo("gemini-omni-video");
    expect(model.supportsStartFrame).toBe(true);
    expect(model.maxReferenceImages).toBe(7);
    expect(model.nativeAudioDialogue).toBe(true);
    expect(model.verticalDramaReady).toBe(true);
  });

  it("marks Sora 2 and Kling 2.6 as NOT start-frame-capable in this catalog (text-to-video only)", () => {
    expect(findVideo("sora-2").supportsStartFrame).toBe(false);
    expect(findVideo("kling-2.6").supportsStartFrame).toBe(false);
  });

  it("KNPLabs veo_3_1-fast form model has no image field (text-to-video only)", () => {
    const model = findVideo("veo_3_1-fast");
    expect(model.supportsStartFrame).toBe(false);
    expect(model.maxReferenceImages).toBe(0);
  });

  it("KNPLabs grok-video-3 JSON model accepts a reference image", () => {
    const model = findVideo("grok-video-3");
    expect(model.supportsStartFrame).toBe(true);
    expect(model.maxReferenceImages).toBe(1);
    expect(model.verticalDramaReady).toBe(true);
    expect(model.nativeAudioDialogue).toBe(true);
    expect(model.supportsNativeAudio).toBe(true);
  });
});

describe("Grok video family native-audio invariant", () => {
  it.each([
    ["higgsfield/grok_video", { providerModelId: "grok_video" }],
    ["higgsfield/grok_video_v15", { mcp: { providerModelId: "grok_video_v15" } }],
    ["grok-imagine/text-to-video", {}],
    ["grok-imagine/image-to-video", {}],
    ["grok-imagine-video-1-5-preview", {}],
    ["grok-video-3", {}],
    ["magnific-mcp/grok-video-next", { providerModelId: "grok-video-next" }],
    ["future-provider/video", { mcp: { providerModelId: "grok_video_future" } }],
  ])("classifies %s as a Grok video", (modelId, configJson) => {
    expect(isGrokVideoFamily(modelId, { type: "video", configJson })).toBe(true);
    const caps = resolveVerticalDramaCapabilities(modelId, {
      type: "video",
      aspectRatios: ["9:16"],
      configJson: { ...configJson, hasAudio: false, nativeAudio: false },
    });
    expect(caps.nativeAudioDialogue).toBe(true);
    expect(caps.supportsNativeAudio).toBe(true);
  });

  it.each([
    ["higgsfield/grok_image", "image"],
    ["grok-imagine/text-to-image", "image"],
    ["grok-imagine/upscale", "image"],
    ["future-provider/video", "video"],
  ] as const)("does not misclassify %s (%s)", (modelId, type) => {
    expect(isGrokVideoFamily(modelId, { type })).toBe(false);
  });
});

describe("Phase 0.3 — new video models (verified callable)", () => {
  it("adds grok-imagine-video-1-5-preview as an enabled, start-frame-capable kie.ai model", () => {
    const model = findVideo("grok-imagine-video-1-5-preview");
    expect(model.provider).toBe("kie.ai");
    expect(model.isEnabled).toBe(true);
    expect(model.supportsStartFrame).toBe(true);
    expect(model.maxReferenceImages).toBe(1);
    // Grok Imagine v1.x generates native in-video audio incl. speech
    // (xAI synchronized audio, user-confirmed 2026-07-06).
    expect(model.nativeAudioDialogue).toBe(true);
    expect(model.verticalDramaReady).toBe(true);
    expect(model.aspectRatios).toContain("9:16");
    expect(model.aliases).toContain("grok imagine 1.5");
    expect(model.configJson?.kieModelId).toBe("grok-imagine-video-1-5-preview");
    expect(model.configJson?.apiPayloadFormat).toBe("market");
  });

  it("keeps WaveSpeed Seedance 2.0 image-to-video enabled with correct capability metadata", () => {
    const model = findVideo("bytedance/seedance-2.0/image-to-video");
    expect(model.provider).toBe("wavespeed_ai");
    expect(model.isEnabled).toBe(true);
    expect(model.supportsStartFrame).toBe(true);
    expect(model.maxReferenceImages).toBeGreaterThan(0);
    expect(model.nativeAudioDialogue).toBe(true);
    expect(model.verticalDramaReady).toBe(true);
    expect(model.aspectRatios).toContain("9:16");
  });

  it("keeps WaveSpeed Seedance 2.0 Fast (text + image to video) enabled with capability metadata", () => {
    const t2v = findVideo("bytedance/seedance-2.0-fast/text-to-video");
    const i2v = findVideo("bytedance/seedance-2.0-fast/image-to-video");
    expect(t2v.isEnabled).toBe(true);
    expect(i2v.isEnabled).toBe(true);
    expect(i2v.verticalDramaReady).toBe(true);
  });
});

describe("deriveVerticalDramaCapabilities", () => {
  it("returns an empty object for audio model types", () => {
    expect(deriveVerticalDramaCapabilities({ type: "audio" })).toEqual({});
  });

  it("marks image models verticalDramaReady when they support 9:16 (start-frame picker)", () => {
    expect(
      deriveVerticalDramaCapabilities({ type: "image", aspectRatios: ["1:1", "16:9", "9:16"] }),
    ).toEqual({ verticalDramaReady: true });
    expect(deriveVerticalDramaCapabilities({ type: "image", aspectRatios: ["1:1"] })).toEqual({
      verticalDramaReady: false,
    });
    expect(deriveVerticalDramaCapabilities({ type: "image" })).toEqual({
      verticalDramaReady: false,
    });
  });

  it("derives supportsStartFrame from apiPayloadFormat: veo even without maxReferenceImages in configJson", () => {
    const caps = deriveVerticalDramaCapabilities({
      type: "video",
      aspectRatios: ["9:16"],
      configJson: { apiPayloadFormat: "veo", hasAudio: true },
    });
    expect(caps.supportsStartFrame).toBe(true);
    expect(caps.nativeAudioDialogue).toBe(true);
    expect(caps.verticalDramaReady).toBe(true);
  });

  it("derives verticalDramaReady=false when 9:16 is not in aspectRatios even if start-frame capable", () => {
    const caps = deriveVerticalDramaCapabilities({
      type: "video",
      aspectRatios: ["16:9"],
      configJson: { maxReferenceImages: 2 },
    });
    expect(caps.supportsStartFrame).toBe(true);
    expect(caps.verticalDramaReady).toBe(false);
  });

  it("derives supportsStartFrame=false with no maxReferenceImages/veo/image-to-video signal", () => {
    const caps = deriveVerticalDramaCapabilities({
      type: "video",
      aspectRatios: ["9:16"],
      configJson: {},
    });
    expect(caps.supportsStartFrame).toBe(false);
    expect(caps.verticalDramaReady).toBe(false);
  });

  describe("maxReferenceImages: undefined (unknown) vs explicit 0 (Phase 6.4)", () => {
    it("resolves maxReferenceImages to undefined — not 0 — when configJson has no maxReferenceImages signal at all", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "video",
        aspectRatios: ["9:16"],
        configJson: {},
      });
      expect(caps.maxReferenceImages).toBeUndefined();
    });

    it("resolves maxReferenceImages to undefined when configJson is entirely absent", () => {
      const caps = deriveVerticalDramaCapabilities({ type: "video" });
      expect(caps.maxReferenceImages).toBeUndefined();
    });

    it("keeps an EXPLICIT configJson.maxReferenceImages: 0 as a real 0 (not coerced to undefined)", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "video",
        aspectRatios: ["9:16"],
        configJson: { maxReferenceImages: 0, apiPayloadFormat: "veo" },
      });
      expect(caps.maxReferenceImages).toBe(0);
    });

    it("keeps a positive explicit configJson.maxReferenceImages", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "video",
        aspectRatios: ["9:16"],
        configJson: { maxReferenceImages: 5 },
      });
      expect(caps.maxReferenceImages).toBe(5);
    });

    it("treats a non-numeric configJson.maxReferenceImages as unknown (undefined), not 0", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "video",
        aspectRatios: ["9:16"],
        configJson: { maxReferenceImages: "not-a-number" },
      });
      expect(caps.maxReferenceImages).toBeUndefined();
    });

    it("byte-identical: an image model with no configJson.maxReferenceImages signal still resolves to undefined (regression guard)", () => {
      const caps = deriveVerticalDramaCapabilities({ type: "image", aspectRatios: ["9:16"] });
      expect(caps.maxReferenceImages).toBeUndefined();
      expect(caps.verticalDramaReady).toBe(true);
    });

    it("byte-identical: an image model with an empty configJson still resolves maxReferenceImages to undefined", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "image",
        aspectRatios: ["9:16"],
        configJson: {},
      });
      expect(caps.maxReferenceImages).toBeUndefined();
    });

    it("latent-bug fix: an image model that DOES declare configJson.maxReferenceImages now surfaces it (previously always undefined)", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "image",
        aspectRatios: ["9:16"],
        configJson: { maxReferenceImages: 10 },
      });
      expect(caps.maxReferenceImages).toBe(10);
      // verticalDramaReady logic is unchanged by this fix — still 9:16-only.
      expect(caps.verticalDramaReady).toBe(true);
    });

    it("normalizes a Hermes image model's referenceImageLimit into maxReferenceImages", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "image",
        aspectRatios: ["9:16"],
        configJson: {
          transport: "hermes_worker",
          referenceImageLimit: 3,
        },
      });
      expect(caps.maxReferenceImages).toBe(3);
      expect(caps.verticalDramaReady).toBe(true);
    });

    it("the static google-banana-2-lite catalog entry (configJson.maxReferenceImages: 10) now resolves a defined maxReferenceImages via deriveVerticalDramaCapabilities", () => {
      const staticModel = getStaticModelById("google-banana-2-lite");
      expect(staticModel?.configJson?.maxReferenceImages).toBe(10);
      const caps = deriveVerticalDramaCapabilities({
        type: "image",
        aspectRatios: staticModel?.aspectRatios,
        configJson: staticModel?.configJson,
      });
      expect(caps.maxReferenceImages).toBe(10);
    });

    it("treats a non-numeric configJson.maxReferenceImages on an image model as unknown (undefined), mirroring the video branch", () => {
      const caps = deriveVerticalDramaCapabilities({
        type: "image",
        aspectRatios: ["9:16"],
        configJson: { maxReferenceImages: "not-a-number" },
      });
      expect(caps.maxReferenceImages).toBeUndefined();
    });
  });
});

describe("supportsNativeAudio (task #36 — optional NATIVE AUDIO DIRECTION prompt option)", () => {
  it("marks every Veo 3.1 tier (incl. extend) as supportsNativeAudio — description states native audio explicitly", () => {
    for (const id of [
      "veo3/generate-veo-3-video-lite",
      "veo-3-1",
      "veo3/generate-veo-3-video-fast",
      "veo3/extend-video",
    ]) {
      expect(findVideo(id).supportsNativeAudio).toBe(true);
    }
  });

  it("marks grok-imagine-video-1-5-preview as supportsNativeAudio (xAI synchronized in-video audio, user-confirmed)", () => {
    expect(findVideo("grok-imagine-video-1-5-preview").supportsNativeAudio).toBe(true);
  });

  it("marks gemini-omni-video as supportsNativeAudio (configJson.hasAudio: true)", () => {
    expect(findVideo("gemini-omni-video").supportsNativeAudio).toBe(true);
  });

  it("leaves supportsNativeAudio unset/false for models with no verified native-audio signal", () => {
    for (const id of [
      "happyhorse/text-to-video",
      "happyhorse/image-to-video",
      "happyhorse/reference-to-video",
      "happyhorse/video-edit",
      "sora-2",
      "kling-2.6",
      "veo_3_1-fast",
    ]) {
      expect(findVideo(id).supportsNativeAudio).not.toBe(true);
    }
  });

  it("mirrors nativeAudioDialogue exactly for every static video model (same underlying technical signal)", () => {
    for (const model of videoModels) {
      expect(Boolean(model.supportsNativeAudio)).toBe(Boolean(model.nativeAudioDialogue));
    }
  });
});

describe("deriveVerticalDramaCapabilities — supportsNativeAudio (task #36)", () => {
  it("derives supportsNativeAudio true whenever nativeAudioDialogue derives true (configJson.hasAudio/nativeAudio)", () => {
    const caps = deriveVerticalDramaCapabilities({
      type: "video",
      aspectRatios: ["9:16"],
      configJson: { apiPayloadFormat: "veo", hasAudio: true },
    });
    expect(caps.supportsNativeAudio).toBe(true);
    expect(caps.supportsNativeAudio).toBe(caps.nativeAudioDialogue);
  });

  it("derives supportsNativeAudio false when no audio signal is present", () => {
    const caps = deriveVerticalDramaCapabilities({
      type: "video",
      aspectRatios: ["9:16"],
      configJson: {},
    });
    expect(caps.supportsNativeAudio).toBe(false);
  });

  it("audio models never set supportsNativeAudio (only video models carry this flag)", () => {
    expect(deriveVerticalDramaCapabilities({ type: "audio" }).supportsNativeAudio).toBeUndefined();
  });
});

describe("resolveVerticalDramaCapabilities", () => {
  it("prefers the hand-tuned static catalog entry over generic derivation", () => {
    // veo3/extend-video is Veo-family (apiPayloadFormat would derive true) but
    // the static catalog explicitly marks it NOT start-frame-capable — the
    // static override must win.
    const capsFromExtend = resolveVerticalDramaCapabilities("veo3/extend-video", {
      type: "video",
      aspectRatios: ["auto", "16:9", "9:16"],
      configJson: getStaticModelById("veo3/extend-video")?.configJson,
    });
    expect(capsFromExtend.supportsStartFrame).toBe(false);
  });

  it("falls back to generic derivation for unknown (DB-only) model ids", () => {
    const caps = resolveVerticalDramaCapabilities("some-future-admin-only-model", {
      type: "video",
      aspectRatios: ["9:16"],
      configJson: { maxReferenceImages: 4, hasAudio: true },
    });
    expect(caps.supportsStartFrame).toBe(true);
    expect(caps.maxReferenceImages).toBe(4);
    expect(caps.nativeAudioDialogue).toBe(true);
    expect(caps.supportsNativeAudio).toBe(true);
    expect(caps.verticalDramaReady).toBe(true);
  });

  it("resolves supportsNativeAudio: true for the static veo-3-1 catalog entry (task #36)", () => {
    const caps = resolveVerticalDramaCapabilities("veo-3-1", {
      type: "video",
      aspectRatios: ["auto", "16:9", "9:16"],
      configJson: getStaticModelById("veo-3-1")?.configJson,
    });
    expect(caps.supportsNativeAudio).toBe(true);
  });

  it("repairs a DB-only Higgsfield Grok row whose persisted audio metadata is missing", () => {
    const caps = resolveVerticalDramaCapabilities("higgsfield/grok_video", {
      type: "video",
      aspectRatios: ["9:16"],
      configJson: {
        providerModelId: "grok_video",
        mcp: { providerModelId: "grok_video" },
      },
    });
    expect(caps.nativeAudioDialogue).toBe(true);
    expect(caps.supportsNativeAudio).toBe(true);
  });
});
