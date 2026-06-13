import { describe, expect, it } from "vitest";

import {
  buildHyperframesCompositionInput,
  buildHyperframesFinalCompositeCompositionInput,
  getHyperframesFinalCompositeFallbackCapability,
  getHyperframesCompositionInputHash,
  normalizeHyperframesFinalCompositeTimeline,
} from "../hyperframesCompositionService";

describe("hyperframesCompositionService", () => {
  it("builds deterministic sanitized composition input", () => {
    const base = {
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: {
        title: "<b>สินค้า</b>",
        selectedImageUrls: ["https://cdn.example.com/product.png?sig=abc"],
      },
      now: new Date("2026-06-04T00:00:00.000Z"),
    };
    const first = buildHyperframesCompositionInput(base);
    const second = buildHyperframesCompositionInput(base);

    expect(first.productTruth.title).toBe("สินค้า");
    expect(first.assets[0]?.ref).toBe("https://cdn.example.com/product.png");
    expect(getHyperframesCompositionInputHash(first)).toBe(
      getHyperframesCompositionInputHash(second)
    );
    expect(first.provenance.templateId).toBe(
      "marketplace_storyboard_motion_9x9_v1"
    );
  });

  it("changes hash when product truth changes", () => {
    const one = buildHyperframesCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "A" },
      now: new Date("2026-06-04T00:00:00.000Z"),
    });
    const two = buildHyperframesCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "B" },
      now: new Date("2026-06-04T00:00:00.000Z"),
    });

    expect(getHyperframesCompositionInputHash(one)).not.toBe(
      getHyperframesCompositionInputHash(two)
    );
  });

  it("normalizes final composite shots into a canonical contiguous timeline", () => {
    const config = {
      finalVideoLengthSec: 16,
      width: 1080,
      height: 1920,
      fps: 30,
      textMode: "hook_and_per_shot" as const,
      overlayPreset: "spec_highlight" as const,
      includeHookText: true,
      includeShotText: true,
      burnInSubtitles: true,
      subtitlePreset: "classic_box" as const,
      fontFamily: "Prompt" as const,
      styleBrief: "",
      hookText: "จอใหญ่",
      supportingText: "แบตอึด",
      subtitlePlacement: "bottom" as const,
      safeZonePercent: 8,
      cssAnimationEnabled: true,
      gsapCompatibleTimeline: true,
      shots: [
        {
          id: "shot_1",
          index: 0,
          title: "Shot 1",
          sourceVideoUrl: "/api/storage/files/shot-1.mp4",
          sourceVideoRef: "storage://shot-1",
          startSec: 0,
          durationSec: 8,
          onScreenText: ["11.2 นิ้ว", "9200mAh"],
          subtitleCues: [{ startSec: 0, endSec: 2, text: "เปิด Hook" }],
          animationPreset: "glow_feature" as const,
          transition: "fade" as const,
        },
        {
          id: "shot_2",
          index: 1,
          title: "Shot 2",
          sourceVideoUrl: "/api/storage/files/shot-2.mp4",
          sourceVideoRef: "storage://shot-2",
          startSec: 8,
          durationSec: 8,
          onScreenText: ["โปรแรง"],
          subtitleCues: [{ startSec: 8, endSec: 12, text: "ต่อด้วยโปร" }],
          animationPreset: "bounce_price" as const,
          transition: "fade" as const,
        },
      ],
    };

    const timeline = normalizeHyperframesFinalCompositeTimeline(config);

    expect(timeline.timelineVersion).toBe(1);
    expect(timeline.durationSec).toBe(16);
    expect(timeline.entries).toMatchObject([
      {
        shotId: "shot_1",
        shotIndex: 0,
        absoluteStartSec: 0,
        absoluteEndSec: 8,
        durationSec: 8,
        sourceMediaRef: "storage://shot-1",
      },
      {
        shotId: "shot_2",
        shotIndex: 1,
        absoluteStartSec: 8,
        absoluteEndSec: 16,
        durationSec: 8,
        sourceMediaRef: "storage://shot-2",
      },
    ]);
    expect(timeline.timelineHash).toMatch(/^hf_/);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [{ ...config.shots[0], startSec: 4 }],
      })
    ).toThrow(/stale timeline/i);

    expect(
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [config.shots[1], config.shots[0]],
      }).entries.map(entry => entry.shotId)
    ).toEqual(["shot_1", "shot_2"]);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          config.shots[0],
          {
            ...config.shots[1],
            id: "shot_1",
          },
        ],
      })
    ).toThrow(/duplicate shot id/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          config.shots[0],
          {
            ...config.shots[1],
            index: 2,
          },
        ],
      })
    ).toThrow(/contiguous/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          {
            ...config.shots[0],
            subtitleCues: [{ startSec: 7.8, endSec: 8.4, text: "หลุดข้าม shot" }],
          },
          config.shots[1],
        ],
      })
    ).toThrow(/subtitle cue/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          config.shots[0],
          {
            ...config.shots[1],
            subtitleCues: [{ startSec: 7.9, endSec: 9, text: "เริ่มก่อน shot" }],
          },
        ],
      })
    ).toThrow(/subtitle cue/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          {
            ...config.shots[0],
            subtitleCues: [
              { startSec: 0, endSec: 3, text: "บรรทัดแรก" },
              { startSec: 2.9, endSec: 5, text: "บรรทัดซ้อน" },
            ],
          },
          config.shots[1],
        ],
      })
    ).toThrow(/must not overlap/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          {
            ...config.shots[0],
            durationSec: 0,
          },
          config.shots[1],
        ],
      })
    ).toThrow(/durationSec must be positive/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          {
            ...config.shots[0],
            startSec: Number.NaN,
          },
          config.shots[1],
        ],
      })
    ).toThrow(/startSec must be finite/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          {
            ...config.shots[0],
            subtitleCues: [{ startSec: 1, endSec: 1, text: "เวลาไม่ถูกต้อง" }],
          },
          config.shots[1],
        ],
      })
    ).toThrow(/finite start\/end seconds/i);

    expect(() =>
      normalizeHyperframesFinalCompositeTimeline({
        ...config,
        shots: [
          {
            ...config.shots[0],
            sourceVideoUrl: "",
            sourceVideoRef: "",
          },
          config.shots[1],
        ],
      })
    ).toThrow(/source media ref/i);
  });

  it("builds final composite HTML with timeline data attributes and fallback report", () => {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "Xiaomi Pad 8" },
      now: new Date("2026-06-04T00:00:00.000Z"),
      finalComposite: {
        finalVideoLengthSec: 8,
        width: 1080,
        height: 1920,
        fps: 30,
        textMode: "hook_and_per_shot",
        overlayPreset: "kinetic_bold_hook",
        includeHookText: true,
        includeShotText: true,
        burnInSubtitles: true,
        subtitlePreset: "karaoke_word",
        preserveNativeAudio: true,
        audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
        musicPresetId: "hf_audio_music_upbeat_ecommerce_social_v1",
        sfxPresetIds: ["hf_audio_sfx_whoosh_scene_transition_v1"],
        audioEvents: [
          {
            id: "music_bed_main",
            role: "music",
            presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 8,
            volume: 0.18,
            assetRef: "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav",
          },
          {
            id: "sfx_scene_cut",
            role: "transition_sfx",
            presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
            visualTrigger: "scene_cut",
            startSec: 0.2,
            durationSec: 0.22,
            volume: 0.22,
            assetRef: "/api/storage/hyperframes/audio-presets/hf_audio_sfx_whoosh_scene_transition_v1.wav",
          },
        ],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: true,
          missingAssetRefs: [
            "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav",
          ],
          validatedAssetRefs: [],
        },
        fontFamily: "Prompt",
        styleBrief: "",
        hookText: "แท็บเล็ตจอใหญ่",
        supportingText: "Xiaomi Pad 8",
        subtitlePlacement: "bottom",
        safeZonePercent: 8,
        cssAnimationEnabled: true,
        gsapCompatibleTimeline: true,
        shots: [
          {
            id: "shot_1",
            index: 0,
            title: "Shot 1",
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            sourceVideoRef: "storage://shot-1",
            startSec: 0,
            durationSec: 8,
            overlayPreset: "price_impact",
            onScreenText: ["แท็บเล็ตจอใหญ่"],
            subtitleCues: [{ startSec: 0, endSec: 2, text: "กำลังมองหาแท็บเล็ตไหม" }],
            animationPreset: "glow_feature",
            transition: "fade",
          },
        ],
      },
    });

    expect(composition.finalCompositeConfig.creativeTimeline).toMatchObject({
      durationSec: 8,
      timelineVersion: 1,
    });
    expect(composition.compositionHtml).toContain('data-shot-id="shot_1"');
    expect(composition.compositionHtml).toContain('data-overlay-preset="price_impact"');
    expect(composition.compositionHtml).toContain('data-media-start="0"');
    expect(composition.compositionHtml).toContain('data-track-index="0"');
    expect(composition.compositionHtml).toContain('class="clip audio-event"');
    expect(composition.compositionHtml).toContain('data-volume="0.18"');
    expect(composition.compositionHtml).toContain("data-audio-event-map-hash=");
    expect(composition.compositionHtml).toContain("window.__timelines");
    expect(composition.compositionHtml).not.toContain("fetch(");
    expect(composition.finalCompositeConfig.audioEventMapHash).toMatch(/^hf_/);
    expect(composition.assets.some(asset => asset.kind === "audio")).toBe(true);
    expect(getHyperframesFinalCompositeFallbackCapability(composition.finalCompositeConfig)).toMatchObject({
      ffmpegAssFallback: true,
      fallbackQuality: "partial",
    });
  });
});
