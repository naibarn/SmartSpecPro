import { describe, expect, it } from "vitest";

import {
  CreateHyperframesFinalCompositeInputSchema,
  CreateHyperframesPreviewOutputSchema,
  GetAutoStoryboardReviewPlanInputSchema,
  GetVideoSegmentPlanPreviewInputSchema,
  GetVideoSegmentPlanPreviewOutputSchema,
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
        videoModel: "kling3/generate-kling-3-video",
      },
    });

    expect(input.overrides).toMatchObject({
      qualityMode: "high",
      platformPresetId: "tiktok_reels_shorts_9_16",
      imageModel: "google-banana-2",
      videoModel: "kling3/generate-kling-3-video",
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

  it("accepts safe creative preset selections on Auto Storyboard start anchors", () => {
    const input = StartAutoStoryboardReviewInputSchema.parse({
      productId: "product_1",
      referenceAnchors: {
        productImageUrl: "https://cdn.example.test/product.png",
        creativePresets: [
          { family: "tone_preset", presetId: "tone_warm_honest" },
          { family: "audio_preset", presetId: "audio_thai_tts" },
        ],
      },
    });

    expect(input.referenceAnchors?.creativePresets).toEqual([
      { family: "tone_preset", presetId: "tone_warm_honest" },
      { family: "audio_preset", presetId: "audio_thai_tts" },
    ]);
  });

  it("accepts server-owned video segment preview inputs with MCP metadata", () => {
    const input = GetVideoSegmentPlanPreviewInputSchema.parse({
      productId: "product_1",
      overrides: {
        videoModel: "magnific-mcp/imagen-nano-banana-2-flash",
        videoStructureMode: "adaptive_multi_shot",
        creativeBrief: "Make the review warmer but keep product facts locked.",
      },
      transportMetadata: {
        transport: "mcp",
        connectionId: "mcp_conn_1",
        sharedGroupId: 12,
      },
      referenceAnchors: {
        productImageUrl: "https://cdn.example.test/product.png",
        creativePresets: [
          { family: "tone_preset", presetId: "tone_warm_honest" },
        ],
      },
    });

    expect(input.overrides.videoStructureMode).toBe("adaptive_multi_shot");
    expect(input.transportMetadata?.transport).toBe("mcp");
    expect(input.referenceAnchors?.creativePresets).toEqual([
      { family: "tone_preset", presetId: "tone_warm_honest" },
    ]);
  });

  it("validates video segment preview output with separated credit source and basis", () => {
    const parsed = GetVideoSegmentPlanPreviewOutputSchema.parse({
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      videoSegmentPlan: {
        schemaVersion: 1,
        sourceSurface: "marketplace_capture",
        mode: "adaptive_multi_shot",
        effectiveMode: "per_shot",
        videoModelId: "magnific-mcp/imagen-nano-banana-2-flash",
        transport: "mcp",
        audioStrategy: "separate_tts_voiceover",
        referenceMode: "single_storyboard_frame",
        creativePresets: [],
        segments: [
          {
            segmentId: "seg_1",
            index: 0,
            shotIds: ["shot_1"],
            durationSeconds: 5,
            referenceMode: "single_storyboard_frame",
            referenceImageUrls: ["https://cdn.example.test/frame.png"],
            subShots: [
              {
                shotId: "shot_1",
                index: 0,
                durationSeconds: 5,
                title: "Hook",
              },
            ],
            warnings: [],
          },
        ],
        fallbackReason: "selected_model_does_not_support_multi_shot",
        warnings: [],
        planHash: "plan_hash_123",
      },
      accessDecision: {
        allowed: true,
        transport: "mcp",
        mcpConnectionId: "mcp_conn_1",
        sharedGroupId: 12,
      },
      creditEstimate: {
        mode: "per_shot",
        estimatedCredits: 1,
        basis: "jobs",
        creditSource: "mcp_provider_account",
        notes: ["Provider-specific adjustments happen at submission time."],
      },
      warnings: [
        {
          code: "multi_shot_not_supported",
          message: "Fallback to per-shot.",
          severity: "warning",
          source: "fallback",
          shotIds: ["shot_1"],
        },
      ],
      fallbackReason: "selected_model_does_not_support_multi_shot",
    });

    expect(parsed.creditEstimate).toMatchObject({
      basis: "jobs",
      creditSource: "mcp_provider_account",
    });
    expect(JSON.stringify(parsed)).not.toContain("token");
    expect(JSON.stringify(parsed)).not.toContain("session");
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

  it("accepts five-minute final composites split into thirty-second shots", () => {
    const shots = Array.from({ length: 10 }, (_, index) => {
      const startSec = index * 30;
      return {
        id: `shot_${index + 1}`,
        index,
        sourceVideoUrl: "https://cdn.example.test/long-source.mp4",
        sourceVideoRef: "storage://long-source",
        mediaStartSec: startSec,
        startSec,
        durationSec: 30,
        subtitleCues: [
          {
            startSec,
            endSec: startSec + 5,
            text: `ช่วงที่ ${index + 1}`,
          },
        ],
      };
    });

    const input = CreateHyperframesFinalCompositeInputSchema.parse({
      productId: "product_1",
      runId: "mar_1",
      config: {
        finalVideoLengthSec: 300,
        shots,
      },
    });

    expect(input.config.finalVideoLengthSec).toBe(300);
    expect(input.config.shots).toHaveLength(10);
    expect(input.config.shots.at(-1)?.startSec).toBe(270);
    expect(input.config.shots.at(-1)?.mediaStartSec).toBe(270);
  });

  it("keeps individual final composite shots capped at thirty seconds", () => {
    expect(() =>
      CreateHyperframesFinalCompositeInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        config: {
          finalVideoLengthSec: 31,
          shots: [
            {
              id: "shot_1",
              index: 0,
              sourceVideoUrl: "https://cdn.example.test/shot-1.mp4",
              startSec: 0,
              durationSec: 31,
            },
          ],
        },
      })
    ).toThrow();
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

  it("accepts long spec overlay presets with up to fifteen user-controlled lines", () => {
    const longSpecLines = Array.from(
      { length: 15 },
      (_, index) => `สเปกบรรทัดที่ ${index + 1} RAM 16GB SSD 1TB กล้องคมชัด ไม่ตัดคำกลางประโยค`
    );
    const input = CreateHyperframesFinalCompositeInputSchema.parse({
      productId: "product_1",
      runId: "mar_1",
      config: {
        finalVideoLengthSec: 8,
        overlayPreset: "spec_lines_15_neon",
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "https://cdn.example.test/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            overlayPreset: "spec_lines_15_neon",
            onScreenText: longSpecLines,
          },
        ],
      },
    });

    expect(input.config.overlayPreset).toBe("spec_lines_15_neon");
    expect(input.config.shots[0]?.overlayPreset).toBe("spec_lines_15_neon");
    expect(input.config.shots[0]?.onScreenText).toHaveLength(15);
    expect(input.config.shots[0]?.onScreenText.at(-1)).toContain("สเปกบรรทัดที่ 15");
  });

  it("rejects long spec overlay text maps above the supported fifteen line maximum", () => {
    const tooManyLines = Array.from(
      { length: 16 },
      (_, index) => `สเปกบรรทัดที่ ${index + 1}`
    );

    expect(() =>
      CreateHyperframesFinalCompositeInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        config: {
          finalVideoLengthSec: 8,
          overlayPreset: "spec_lines_15_neon",
          shots: [
            {
              id: "shot_1",
              index: 0,
              sourceVideoUrl: "https://cdn.example.test/shot-1.mp4",
              startSec: 0,
              durationSec: 8,
              overlayPreset: "spec_lines_15_neon",
              onScreenText: tooManyLines,
            },
          ],
        },
      })
    ).toThrow();
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
