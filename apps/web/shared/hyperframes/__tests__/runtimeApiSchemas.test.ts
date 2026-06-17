import { describe, expect, it } from "vitest";

import {
  CreateHyperframesFinalCompositeInputSchema,
  CreateHyperframesPreviewOutputSchema,
  GetAutoStoryboardReviewPlanInputSchema,
  ListHyperframesCreativePresetsInputSchema,
  ListHyperframesCreativePresetsOutputSchema,
  RepairHyperframesRenderJobInputSchema,
  RepairHyperframesRenderJobOutputSchema,
  StartAutoStoryboardReviewInputSchema,
} from "../runtimeApiSchemas";
import { createDefaultHyperframesPollingGuidance } from "../contracts";
import { buildHyperframesFeatureAccessProjection } from "../featureAccess";
import {
  HYPERFRAMES_CREATIVE_PRESET_ALIASES,
  listHyperframesCreativePresets,
} from "../creativePresets";
import { HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS } from "../limits";

describe("HyperFrames runtime API schemas", () => {
  it("parses page-load plan input without mutation fields", () => {
    expect(
      GetAutoStoryboardReviewPlanInputSchema.parse({ productId: "product_1" })
    ).toEqual({ productId: "product_1", includeTemplates: false, overrides: {} });
  });

  it("allows optional plan overrides while keeping template and engine backend-selected", () => {
    const input = GetAutoStoryboardReviewPlanInputSchema.parse({
      productId: "product_1",
      overrides: {
        qualityMode: "high",
        platformPresetId: "tiktok_reels_shorts_9_16",
        imageModel: "google-banana-2",
      },
    });

    expect(input.overrides).toMatchObject({
      qualityMode: "high",
      platformPresetId: "tiktok_reels_shorts_9_16",
      imageModel: "google-banana-2",
    });
    expect(() =>
      GetAutoStoryboardReviewPlanInputSchema.parse({
        productId: "product_1",
        overrides: {
          qualityMode: "high",
          renderEngine: "existing_ffmpeg_timeline",
        },
      })
    ).toThrow();
    expect(() =>
      StartAutoStoryboardReviewInputSchema.parse({
        productId: "product_1",
        overrides: { shotCount: 99 },
      })
    ).toThrow();
  });

  it("keeps start input backend-defaulted and override-diff based", () => {
    const input = StartAutoStoryboardReviewInputSchema.parse({
      productId: "product_1",
      expectedPlanHash: "hf_12345678",
      idempotencyKey: "hf-auto-start:hf_12345678",
    });

    expect(input).toEqual({
      productId: "product_1",
      expectedPlanHash: "hf_12345678",
      idempotencyKey: "hf-auto-start:hf_12345678",
      overrides: {},
    });
    expect(input).not.toHaveProperty("templateId");
    expect(input).not.toHaveProperty("platformPresetId");
    expect(input).not.toHaveProperty("renderEngine");
    expect(() =>
      StartAutoStoryboardReviewInputSchema.parse({
        productId: "product_1",
        idempotencyKey: "x".repeat(193),
      })
    ).toThrow();
  });

  it("requires charge summary, polling, and repair actions on preview output", () => {
    const parsed = CreateHyperframesPreviewOutputSchema.safeParse({
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      render: {
        contractVersion: "hyperframes_marketplace_auto_review_v1",
        renderJobId: "hf_render_1",
        tenantId: "tenant_1",
        productId: "product_1",
        runId: "mar_1",
        launchMode: "auto_storyboard_review",
        status: "queued",
        progressPercent: 0,
        statusCopyId: "hyperframes.status.queued",
        safeMessage: "Queued",
        repairActions: [],
        polling: createDefaultHyperframesPollingGuidance("queued"),
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "free_preview_allowed",
        noChargeReason: "preview_only",
      },
      polling: createDefaultHyperframesPollingGuidance("queued"),
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts captioned final composite inputs with Thai fonts and subtitle cues", () => {
    const input = CreateHyperframesFinalCompositeInputSchema.parse({
      productId: "product_1",
      runId: "mar_1",
      config: {
        finalVideoLengthSec: 64,
        fontFamily: "Noto Sans Thai",
        textMode: "hook_and_per_shot",
        overlayPreset: "spec_highlight",
        subtitlePreset: "karaoke_word",
        subtitleFontSizePx: 28,
        burnInSubtitles: true,
        hookText: "แท็บเล็ตจอใหญ่ ลื่นแรง แบตอึด",
        supportingText: "Xiaomi Pad 8 เริ่มต้น 10,946.-",
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "https://cdn.example.test/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            overlayPreset: "price_impact",
            onScreenText: ["Xiaomi Pad 8", "จอใหญ่ ลื่นแรง แบตอึด"],
            subtitleCues: [
              {
                startSec: 0,
                endSec: 2,
                text: "กำลังมองหาแท็บเล็ตจอใหญ่ ใช้งานลื่น ๆ อยู่ไหม",
              },
            ],
          },
        ],
      },
    });

    expect(input.renderIntent).toBe("final");
    expect(input.compositionMode).toBe("captioned_final_composite");
    expect(input.config.fontFamily).toBe("Noto Sans Thai");
    expect(input.config.overlayPreset).toBe("spec_highlight");
    expect(input.config.shots[0]?.overlayPreset).toBe("price_impact");
    expect(input.config.subtitlePreset).toBe("karaoke_word");
    expect(input.config.subtitleFontSizePx).toBe(28);
    expect(input.config.shots[0]?.subtitleCues[0]?.endSec).toBe(2);
  });

  it("accepts the expanded final composite overlay preset set", () => {
    for (const overlayPreset of [
      "creator_top_punch",
      "ugc_center_stack",
      "white_intro_card",
      "tech_signal_map",
    ]) {
      const input = CreateHyperframesFinalCompositeInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        config: {
          finalVideoLengthSec: 8,
          overlayPreset,
          shots: [
            {
              id: "shot_1",
              index: 0,
              sourceVideoUrl: "https://cdn.example.test/shot-1.mp4",
              startSec: 0,
              durationSec: 8,
              overlayPreset,
              onScreenText: ["ข้อความเปิดคลิป", "อ่านง่ายในสามวินาทีแรก"],
            },
          ],
        },
      });

      expect(input.config.overlayPreset).toBe(overlayPreset);
      expect(input.config.shots[0]?.overlayPreset).toBe(overlayPreset);
    }
  });

  it("uses the shared final render prompt limit for styleBrief", () => {
    const validPrompt = "x".repeat(HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS);
    const oversizedPrompt = `${validPrompt}x`;
    const baseInput = {
      productId: "product_1",
      runId: "mar_1",
      config: {
        finalVideoLengthSec: 8,
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "https://cdn.example.test/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            onScreenText: ["BENO"],
          },
        ],
      },
    };

    expect(
      CreateHyperframesFinalCompositeInputSchema.parse({
        ...baseInput,
        config: { ...baseInput.config, styleBrief: validPrompt },
      }).config.styleBrief
    ).toHaveLength(HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS);
    expect(() =>
      CreateHyperframesFinalCompositeInputSchema.parse({
        ...baseInput,
        config: { ...baseInput.config, styleBrief: oversizedPrompt },
      })
    ).toThrow();
  });

  it("accepts richer overlay presets for pre-render visual templates", () => {
    const input = CreateHyperframesFinalCompositeInputSchema.parse({
      productId: "product_1",
      runId: "mar_1",
      config: {
        finalVideoLengthSec: 8,
        overlayPreset: "neon_gaming_specs",
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "https://cdn.example.test/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            onScreenText: ["Snapdragon", "120Hz", "5000mAh"],
          },
        ],
      },
    });

    expect(input.config.overlayPreset).toBe("neon_gaming_specs");
  });

  it("accepts final composite audio presets and event maps", () => {
    const input = CreateHyperframesFinalCompositeInputSchema.parse({
      productId: "product_1",
      runId: "mar_1",
      config: {
        finalVideoLengthSec: 8,
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
            id: "sfx_1",
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
          validatedAssets: [
            {
              assetRef:
                "/api/storage/hyperframes/audio-presets/hf_audio_sfx_whoosh_scene_transition_v1.wav",
              source: "bundled",
              licenseName: "Internal licensed SFX pack",
              checksum: {
                algorithm: "sha256",
                value:
                  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              },
              mimeType: "audio/wav",
              durationSec: 0.22,
            },
          ],
        },
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
          },
        ],
      },
    });

    expect(input.config.audioEvents).toHaveLength(2);
    expect(input.config.audioAssetValidation.allowSyntheticFallback).toBe(true);
    expect(input.config.audioAssetValidation.validatedAssets[0]?.licenseName).toBe(
      "Internal licensed SFX pack"
    );
    expect(input.config.sfxPresetIds).toContain(
      "hf_audio_sfx_whoosh_scene_transition_v1"
    );
  });

  it("contracts self-service repair actions with render and polling output", () => {
    expect(
      RepairHyperframesRenderJobInputSchema.parse({
        renderJobId: "hf_render_1",
        productId: "product_1",
        runId: "mar_1",
        actionId: "repair_retry_worker_step",
        actionType: "retry_worker_step",
        expectedCompositionInputHash: "hf_input",
      })
    ).toMatchObject({
      renderJobId: "hf_render_1",
      productId: "product_1",
      runId: "mar_1",
      actionType: "retry_worker_step",
    });

    expect(
      RepairHyperframesRenderJobOutputSchema.safeParse({
        contractVersion: "hyperframes_marketplace_auto_review_v1",
        render: {
          contractVersion: "hyperframes_marketplace_auto_review_v1",
          renderJobId: "hf_render_1",
          tenantId: "tenant_1",
          productId: "product_1",
          runId: "mar_1",
          launchMode: "auto_storyboard_review",
          status: "queued",
          progressPercent: 0,
          statusCopyId: "hyperframes.status.queued",
          safeMessage: "Queued",
          repairActions: [],
          polling: createDefaultHyperframesPollingGuidance("queued"),
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
        polling: createDefaultHyperframesPollingGuidance("queued"),
        invalidates: ["marketplaceCapture.getHyperframesRenderJob"],
      }).success
    ).toBe(true);
  });

  it("parses creative preset listing inputs and outputs additively", () => {
    expect(ListHyperframesCreativePresetsInputSchema.parse(undefined)).toEqual({
      includeDisabled: false,
      includeCandidate: false,
    });
    expect(
      ListHyperframesCreativePresetsInputSchema.parse({
        includeCandidate: true,
        category: "overlay",
      })
    ).toMatchObject({ includeCandidate: true, category: "overlay" });

    const parsed = ListHyperframesCreativePresetsOutputSchema.parse({
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      access: buildHyperframesFeatureAccessProjection({
        tenantId: "tenant_1",
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
          librarySaveEnabled: true,
          operatorEnabled: false,
          templateAllowlist: [],
        },
        canSaveToLibrary: true,
        nowIso: "2026-06-12T00:00:00.000Z",
      }),
      presets: listHyperframesCreativePresets({ includeCandidate: true }),
      aliases: HYPERFRAMES_CREATIVE_PRESET_ALIASES,
    });

    expect(parsed.presets.some(preset => preset.id === "hf_text_spec_electronics_stack_v1")).toBe(true);
    expect(parsed.aliases.spec_highlight).toBe(
      "hf_text_spec_electronics_stack_v1"
    );
  });
});
