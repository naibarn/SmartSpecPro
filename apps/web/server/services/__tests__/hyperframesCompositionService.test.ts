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
        mediaStartSec: 0,
        sourceMediaRef: "storage://shot-1",
      },
      {
        shotId: "shot_2",
        shotIndex: 1,
        absoluteStartSec: 8,
        absoluteEndSec: 16,
        durationSec: 8,
        mediaStartSec: 0,
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

  it("keeps source media offsets for split final composite shots", () => {
    const timeline = normalizeHyperframesFinalCompositeTimeline({
      finalVideoLengthSec: 60,
      width: 1080,
      height: 1920,
      fps: 30,
      textMode: "hook_and_per_shot",
      overlayPreset: "spec_highlight",
      includeHookText: true,
      includeShotText: true,
      burnInSubtitles: true,
      subtitlePreset: "classic_box",
      fontFamily: "Prompt",
      styleBrief: "",
      hookText: "",
      supportingText: "",
      subtitlePlacement: "bottom",
      safeZonePercent: 8,
      cssAnimationEnabled: true,
      gsapCompatibleTimeline: true,
      shots: [
        {
          id: "shot_1",
          index: 0,
          sourceVideoUrl: "/api/storage/files/long.mp4",
          sourceVideoRef: "storage://long",
          mediaStartSec: 0,
          startSec: 0,
          durationSec: 30,
          onScreenText: [],
          subtitleCues: [],
          animationPreset: "smooth_reveal",
          transition: "fade",
        },
        {
          id: "shot_2",
          index: 1,
          sourceVideoUrl: "/api/storage/files/long.mp4",
          sourceVideoRef: "storage://long",
          mediaStartSec: 30,
          startSec: 30,
          durationSec: 30,
          onScreenText: [],
          subtitleCues: [],
          animationPreset: "smooth_reveal",
          transition: "fade",
        },
      ],
    });

    expect(timeline.entries[1]?.mediaStartSec).toBe(30);
    expect(timeline.entries[0]?.sourceMediaHash).not.toBe(
      timeline.entries[1]?.sourceMediaHash
    );
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
          validatedAssetRefs: [
            "/api/storage/hyperframes/audio-presets/hf_audio_sfx_whoosh_scene_transition_v1.wav",
          ],
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
            mediaStartSec: 12,
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
    expect(composition.provenance.builderVersion).toBe(
      "hyperframes_final_composite_builder_v17"
    );
    expect(composition.compositionHtml).toContain('data-shot-id="shot_1"');
    expect(composition.compositionHtml).toContain(
      'class="clip scene source-video"'
    );
    expect(composition.compositionHtml).toContain(
      'class="clip shot shot-glow_feature"'
    );
    expect(composition.compositionHtml).not.toContain('data-shot-start=');
    expect(composition.compositionHtml).not.toContain('data-shot-duration=');
    expect(composition.compositionHtml).toContain('data-overlay-preset="price_impact"');
    expect(composition.compositionHtml).toContain('data-media-start="12"');
    expect(composition.compositionHtml).toContain('data-hf-auto-start="true"');
    expect(composition.compositionHtml).toContain('data-has-audio="true"');
    expect(composition.compositionHtml).toContain('data-native-audio="true"');
    expect(composition.compositionHtml).not.toMatch(/<video[^>]+muted/);
    expect(composition.compositionHtml).toContain('data-track-index="0"');
    expect(composition.compositionHtml).toContain(
      'data-text-motion-preset="stagger_rise"'
    );
    expect(composition.compositionHtml).toContain(
      'data-text-motion-preset="slide_right_to_left"'
    );
    expect(composition.compositionHtml).not.toContain("SHOT 1");
    expect(composition.compositionHtml).not.toContain("hook-badge");
    expect(composition.compositionHtml).toContain(
      '<div class="hook-main motion-item" style="--motion-delay:0s">แท็บเล็ตจอใหญ่</div>'
    );
    expect(composition.compositionHtml).toContain(
      '<div class="hook-sub motion-item" style="--motion-delay:0.14s">Xiaomi Pad 8</div>'
    );
    expect(composition.compositionHtml).toContain(
      '<div class="hook-chip motion-item" style="--motion-delay:0.28s">Xiaomi Pad 8</div>'
    );
    expect(composition.compositionHtml).toContain(
      'data-shot-copy-deferred="after-hook" data-has-shot-copy="true"'
    );
    expect(composition.compositionHtml).toContain('<div class="shade"></div>');
    expect(composition.compositionHtml).toContain(".overlay-copy-layer");
    expect(composition.compositionHtml).toContain("@keyframes overlayCopyLifetime");
    expect(composition.compositionHtml).toContain(
      ".shot.is-active .overlay-copy-layer"
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="price_impact"] .shot-copy { top: auto; bottom: 28%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="hero_price_billboard"] .shot-copy { top: auto; bottom: 25%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="lower_third_review"] .shot-copy { top: auto; bottom: 31%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="spec_highlight"] .shot-copy { left: 8%; right: 8%; top: 4%;'
    );
    expect(composition.compositionHtml).toContain("-webkit-text-stroke: 2px #020617");
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="electronics_spec_stack"] .shot-copy { left: auto; top: 14%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="feature_cards"] .shot-copy { top: 19%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="creator_top_punch"] .shot-copy { left: 8%; right: 8%; top: 5%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="ugc_center_stack"] .shot-copy { left: 7%; right: 7%; top: 42%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="ugc_center_stack"] .hook-sub { color: #fbbf24; font-size: 78px; }'
    );
    expect(composition.compositionHtml).toContain(
      ".shot-line, .hook-main, .hook-sub, .hook-chip, .subtitle-cue { box-sizing: border-box; overflow-wrap: anywhere; word-break: break-word; }"
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="white_intro_card"] .shot-copy { inset: 0; display: flex;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="white_intro_card"] .overlay-copy-layer { z-index: 10; }'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="tech_signal_map"] .shot-copy { left: 7%; right: 7%; top: 6%;'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="tech_signal_map"] .shot-line { position: relative; z-index: 1; display: block; box-sizing: border-box; width: 100%; max-width: 100%; overflow: hidden; white-space: nowrap;'
    );
    expect(composition.compositionHtml).toContain('data-has-subtitles="true"');
    expect(composition.compositionHtml).toContain('[data-has-subtitles="true"] .shot-copy { bottom: 25% !important;');
    expect(composition.compositionHtml).toContain(
      '[data-has-subtitles="true"] [data-overlay-preset="badge_cascade"] .shot-line { max-width: calc(100% - 80px) !important; }'
    );
    expect(composition.compositionHtml).toContain(
      '[data-overlay-preset="kinetic_bold_hook"].hook-layer::before'
    );
    expect(composition.compositionHtml).not.toContain(
      '<div class="shot-line line-1">แท็บเล็ตจอใหญ่</div>'
    );
    expect(composition.compositionHtml).toContain("@keyframes textSlideRightToLeft");
    expect(composition.compositionHtml).toContain('[data-text-motion-preset="slide_right_to_left"] .motion-item');
    expect(composition.compositionHtml).toContain('class="clip audio-event"');
    expect(composition.compositionHtml).not.toMatch(
      /<audio[^>]+hf_audio_music_upbeat_ecommerce_social_v1\.wav/
    );
    expect(composition.compositionHtml).toMatch(
      /<audio[^>]+hf_audio_sfx_whoosh_scene_transition_v1\.wav/
    );
    expect(composition.compositionHtml).toContain('data-volume="0.22"');
    expect(composition.compositionHtml).toContain("data-audio-event-map-hash=");
    expect(composition.compositionHtml).toContain("window.__timelines");
    expect(composition.compositionHtml).toContain(".source-video.is-active");
    expect(composition.compositionHtml).toContain(
      ".shot { position: absolute; inset: 0; opacity: 1; overflow: hidden; background: transparent; pointer-events: none; z-index: 2; }"
    );
    expect(composition.compositionHtml).toContain(
      ".source-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 1; transform: scale(1.02); z-index: 0; }"
    );
    expect(composition.compositionHtml).not.toContain(
      ".shot { position: absolute; inset: 0; opacity: 0; overflow: hidden; background: #050505;"
    );
    expect(composition.compositionHtml).not.toContain(
      ".source-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0;"
    );
    expect(composition.compositionHtml).toContain("document.querySelectorAll(\".source-video\")");
    expect(composition.compositionHtml).toContain("video.classList.toggle(\"is-active\", active)");
    expect(composition.compositionHtml).toContain("var shotWindowById =");
    expect(composition.compositionHtml).toContain("shotWindowById[shot.dataset.shotId]");
    expect(composition.compositionHtml).toContain("Number(shotWindow.start || 0)");
    expect(composition.compositionHtml).toContain("Number(shotWindow.duration || 0)");
    expect(composition.compositionHtml).not.toContain(
      'class="clip scene shot'
    );
    expect(composition.compositionHtml).not.toContain("fetch(");
    expect(composition.finalCompositeConfig.audioEventMapHash).toMatch(/^hf_/);
    expect(composition.assets.some(asset => asset.kind === "audio")).toBe(true);
    expect(getHyperframesFinalCompositeFallbackCapability(composition.finalCompositeConfig)).toMatchObject({
      ffmpegAssFallback: false,
      fallbackQuality: "not_supported",
      unsupportedFeatures: expect.arrayContaining([
        "official_html_css_browser_runtime_required",
      ]),
    });
  });

  it("mutes storyboard source videos only when native audio preservation is disabled", () => {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "BENO PRO-FLEX" },
      now: new Date("2026-06-04T00:00:00.000Z"),
      finalComposite: {
        finalVideoLengthSec: 8,
        width: 1080,
        height: 1920,
        fps: 30,
        textMode: "per_shot" as const,
        overlayPreset: "kinetic_bold_hook",
        includeHookText: false,
        includeShotText: true,
        burnInSubtitles: false,
        subtitlePreset: "classic_box",
        preserveNativeAudio: false,
        audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
        musicPresetId: "none",
        sfxPresetIds: [],
        audioEvents: [],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: false,
          missingAssetRefs: [],
          validatedAssetRefs: [],
        },
        fontFamily: "Prompt",
        styleBrief: "",
        hookText: "",
        supportingText: "",
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
            overlayPreset: "kinetic_bold_hook",
            onScreenText: ["ชงกาแฟหอมเข้ม"],
            subtitleCues: [],
            animationPreset: "glow_feature",
            transition: "fade",
          },
        ],
      },
    });

    expect(composition.compositionHtml).toMatch(/<video[^>]+muted/);
    expect(composition.compositionHtml).toContain('data-has-audio="false"');
    expect(composition.compositionHtml).not.toContain('data-has-audio="true"');
    expect(composition.compositionHtml).not.toContain('data-native-audio="true"');
  });

  it("scopes every per-shot overlay to a short lifetime and defers shot 1 copy until after the hook", () => {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "BENO PRO-FLEX" },
      now: new Date("2026-06-04T00:00:00.000Z"),
      finalComposite: {
        finalVideoLengthSec: 16,
        width: 1080,
        height: 1920,
        fps: 30,
        textMode: "hook_and_per_shot",
        overlayPreset: "kinetic_bold_hook",
        includeHookText: true,
        includeShotText: true,
        burnInSubtitles: true,
        subtitlePreset: "classic_box",
        preserveNativeAudio: true,
        audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
        musicPresetId: "none",
        sfxPresetIds: [],
        audioEvents: [],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: false,
          missingAssetRefs: [],
          validatedAssetRefs: [],
        },
        fontFamily: "Prompt",
        styleBrief: "",
        hookText: "ชงกาแฟหอมเข้ม",
        supportingText: "BENO PRO-FLEX",
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
            overlayPreset: "kinetic_bold_hook",
            onScreenText: ["ชงกาแฟหอมเข้ม", "BENO PRO-FLEX"],
            subtitleCues: [{ startSec: 0, endSec: 3, text: "เริ่มต้นด้วยปัญหากาแฟเปรี้ยว" }],
            animationPreset: "glow_feature",
            transition: "fade",
          },
          {
            id: "shot_2",
            index: 1,
            title: "Shot 2",
            sourceVideoUrl: "/api/storage/files/shot-2.mp4",
            sourceVideoRef: "storage://shot-2",
            startSec: 8,
            durationSec: 8,
            overlayPreset: "kinetic_bold_hook",
            onScreenText: ["บด ชง ตีฟองในเครื่องเดียว", "ใช้งานง่ายขึ้นทุกเช้า"],
            subtitleCues: [{ startSec: 8, endSec: 11, text: "บด ชง และตีฟองได้ในเครื่องเดียว" }],
            animationPreset: "smooth_reveal",
            transition: "fade",
          },
        ],
      },
    });

    expect(composition.compositionHtml).toMatch(
      /id="shot-shot_1"[\s\S]*?data-shot-copy-deferred="after-hook" data-has-shot-copy="true"/
    );
    expect(composition.compositionHtml).toMatch(
      /id="shot-shot_1"[\s\S]*?<div class="shot-line line-1 motion-item" style="--motion-delay:0s">ชงกาแฟหอมเข้ม<\/div>/
    );
    expect(composition.compositionHtml).toMatch(
      /id="shot-shot_2"[\s\S]*?data-text-motion-preset="stagger_rise"[\s\S]*?<div class="overlay-copy-layer">[\s\S]*?<div class="shot-line line-1 motion-item" style="--motion-delay:0s">บด ชง ตีฟองในเครื่องเดียว<\/div>/
    );
    expect(composition.compositionHtml).toContain(
      ".overlay-copy-layer { position: absolute; inset: 0; z-index: 1; opacity: 0; pointer-events: none; }"
    );
    expect(composition.compositionHtml).toContain(
      ".shot.is-active .overlay-copy-layer { animation: overlayCopyLifetime 3.2s linear both; }"
    );
    expect(composition.compositionHtml).toContain(
      '.shot.is-active[data-shot-copy-deferred="after-hook"] .overlay-copy-layer { animation: overlayCopyLifetime 3.2s linear 3s forwards; }'
    );
    expect(composition.compositionHtml).toContain(
      "@keyframes overlayCopyLifetime { 0%, 88% { opacity: 1; } 100% { opacity: 0; } }"
    );
  });

  it("keeps video prompt text out of overlay copy and applies selected subtitle size", () => {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "BENO PRO-FLEX" },
      now: new Date("2026-06-04T00:00:00.000Z"),
      finalComposite: {
        finalVideoLengthSec: 8,
        width: 1080,
        height: 1920,
        fps: 30,
        textMode: "per_shot",
        overlayPreset: "auto",
        includeHookText: false,
        includeShotText: true,
        burnInSubtitles: true,
        subtitlePreset: "classic_box",
        subtitleFontSizePx: 28,
        preserveNativeAudio: true,
        audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
        musicPresetId: "none",
        sfxPresetIds: [],
        audioEvents: [],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: false,
          missingAssetRefs: [],
          validatedAssetRefs: [],
        },
        fontFamily: "Prompt",
        styleBrief: "",
        hookText: "",
        supportingText: "",
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
            overlayPreset: "auto",
            onScreenText: [
              "Create a 5-second cinematic video. Scene: Use @Image1 as start frame.",
              "ชงกาแฟหอมเข้ม",
            ],
            subtitleCues: [
              {
                startSec: 0,
                endSec: 3,
                text: "คุณเคยชงกาแฟตอนเช้า แบบชงเท่าไหร่ก็ยังได้กาแฟติดเปรี้ยวจนหมดอารมณ์ไหม",
              },
            ],
            animationPreset: "smooth_reveal",
            transition: "fade",
          },
        ],
      },
    });

    expect(composition.compositionHtml).not.toContain("Create a 5-second cinematic video");
    expect(composition.compositionHtml).not.toContain("Use @Image1 as start frame");
    expect(composition.compositionHtml).toContain(
      '<div class="shot-line line-1 motion-item" style="--motion-delay:0s">ชงกาแฟหอมเข้ม</div>'
    );
    expect(composition.compositionHtml).toContain("font-size: 28px");
    expect(composition.compositionHtml).toContain(
      "คุณเคยชงกาแฟตอนเช้า แบบชงเท่าไหร่ก็ยังได้กาแฟติดเปรี้ยวจนหมดอารมณ์ไหม"
    );
  });

  it("enables FFmpeg/ASS fallback capability for manual Storyboard Review final composites", () => {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "manual_storyboard_product_1",
      runId: "manual_storyboard_run_1",
      productState: {
        product: {
          title: "Manual Storyboard Project",
          platformRawJson: { manualStoryboardReview: true },
        },
      },
      runState: {
        launchMode: "manual_storyboard_review",
        metadataJson: { manualStoryboardReview: true },
      },
      now: new Date("2026-06-04T00:00:00.000Z"),
      finalComposite: {
        finalVideoLengthSec: 8,
        width: 1080,
        height: 1920,
        fps: 30,
        textMode: "per_shot",
        overlayPreset: "premium_product_hero",
        includeHookText: false,
        includeShotText: true,
        burnInSubtitles: true,
        subtitlePreset: "highlight_bar",
        preserveNativeAudio: true,
        audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
        musicPresetId: "none",
        sfxPresetIds: [],
        audioEvents: [],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: false,
          missingAssetRefs: [],
          validatedAssetRefs: [],
        },
        fontFamily: "Prompt",
        styleBrief: "",
        hookText: "พัฒนาการเด็กแตกต่างกัน",
        supportingText: "การเลี้ยงดูมีผลอย่างมาก",
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
            overlayPreset: "premium_product_hero",
            onScreenText: ["พัฒนาการเด็กแตกต่างกัน"],
            subtitleCues: [
              { startSec: 0, endSec: 3, text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก" },
            ],
            animationPreset: "smooth_reveal",
            transition: "fade",
          },
        ],
      },
    });

    expect(composition.finalCompositeConfig.fallbackCapability).toMatchObject({
      ffmpegAssFallback: true,
      fallbackQuality: "partial",
      unsupportedFeatures: expect.arrayContaining([
        "rich_css_gsap_timeline",
        "kinetic_typography",
      ]),
    });
    expect(
      (composition.finalCompositeConfig.fallbackCapability as { unsupportedFeatures: string[] })
        .unsupportedFeatures
    ).not.toContain("official_html_css_browser_runtime_required");
  });

  it("does not emit audio tags for final composite audio refs that were not validated for staging", () => {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "BENO PRO-FLEX" },
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
        subtitlePreset: "classic_box",
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
            "/api/storage/hyperframes/audio-presets/hf_audio_sfx_whoosh_scene_transition_v1.wav",
          ],
          validatedAssetRefs: [],
        },
        fontFamily: "Prompt",
        styleBrief: "",
        hookText: "ชงกาแฟหอมเข้ม",
        supportingText: "BENO PRO-FLEX",
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
            onScreenText: ["ชงกาแฟหอมเข้ม"],
            subtitleCues: [{ startSec: 0, endSec: 2, text: "เปิด Hook" }],
            animationPreset: "glow_feature",
            transition: "fade",
          },
        ],
      },
    });

    expect(composition.compositionHtml).not.toContain('class="clip audio-event"');
    expect(composition.compositionHtml).not.toContain("<audio");
    expect(composition.assets.some(asset => asset.kind === "audio")).toBe(false);
    expect(composition.finalCompositeConfig.audioAssetValidation.missingAssetRefs).toHaveLength(2);
  });
});
