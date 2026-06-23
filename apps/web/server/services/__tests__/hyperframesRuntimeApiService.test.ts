import { mkdtempSync, readFileSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HyperframesArtifactRefSchema,
  buildHyperframesLibraryIdempotencyKey,
} from "@shared/hyperframes/contracts";
import {
  HYPERFRAMES_FINAL_COMPOSITE_SUBMISSION_DEDUPE_WINDOW_MS,
  buildHyperframesFinalCompositeWorkerIdempotencyKey,
  buildHyperframesFinalizeInputFromCompletedRender,
  buildManualStoryboardProductState,
  getHyperframesFinalCompositeRuntimeBlockReason,
  buildHyperframesLibrarySaveChargeSummary,
  isHyperframesRunEligibleForPreview,
  isManualStoryboardHyperframesIdentity,
  validateHyperframesFinalCompositeAudioAssets,
} from "../hyperframesRuntimeApiService";
import { buildHyperframesRenderProjection } from "../hyperframesRenderService";
import { CreateHyperframesPreviewInputSchema } from "@shared/hyperframes/runtimeApiSchemas";
import type { HyperframesRuntimeAdapterEnv } from "../hyperframesRuntimeAdapter";

describe("hyperframesRuntimeApiService", () => {
  const workspaces: string[] = [];

  afterEach(async () => {
    await Promise.all(
      workspaces.map(workspace => rm(workspace, { recursive: true, force: true }))
    );
    workspaces.length = 0;
  });

  async function createRuntimeToolEnv(): Promise<HyperframesRuntimeAdapterEnv> {
    const dir = mkdtempSync(join(tmpdir(), "ssp-hyperframes-runtime-api-"));
    workspaces.push(dir);
    const toolsDir = join(dir, "tools");
    await mkdir(toolsDir, { recursive: true });
    const cliPath = join(toolsDir, "hyperframes");
    const ffmpegPath = join(toolsDir, "ffmpeg");
    const ffprobePath = join(toolsDir, "ffprobe");
    const browserPath = join(toolsDir, "chromium");
    const fontPath = join(toolsDir, "thai-font.ttf");
    for (const path of [cliPath, ffmpegPath, ffprobePath, browserPath]) {
      await writeFile(path, "#!/bin/sh\nexit 0\n");
      await chmod(path, 0o755);
    }
    await writeFile(fontPath, "font");
    return {
      HYPERFRAMES_CLI_BINARY: cliPath,
      HYPERFRAMES_FFMPEG_BINARY: ffmpegPath,
      HYPERFRAMES_FFPROBE_BINARY: ffprobePath,
      HYPERFRAMES_BROWSER_BINARY: browserPath,
      HYPERFRAMES_THAI_FONT_PATH: fontPath,
    };
  }

  it("blocks preview queueing until Storyboard Review evidence exists", () => {
    expect(
      isHyperframesRunEligibleForPreview({
        id: "mar_1",
        resultJson: {},
        metadataJson: {},
        timeline: { items: [] },
      })
    ).toEqual({
      eligible: false,
      reason: "storyboard_review_not_ready",
    });
  });

  it("allows preview queueing when Storyboard Review output is present", () => {
    expect(
      isHyperframesRunEligibleForPreview({
        id: "mar_1",
        resultJson: { storyboardReviewId: "review_1" },
      })
    ).toEqual({
      eligible: true,
      reason: "storyboard_ready",
    });
    expect(
      isHyperframesRunEligibleForPreview({
        id: "mar_2",
        timeline: {
          items: [
            {
              stageKey: "storyboard_review",
              status: "completed_with_warnings",
            },
          ],
        },
      }).eligible
    ).toBe(true);
  });

  it("keeps createHyperframesPreview scoped to supported preview requests", () => {
    expect(
      CreateHyperframesPreviewInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        renderIntent: "preview",
        compositionMode: "storyboard_motion_preview",
      })
    ).toMatchObject({
      productId: "product_1",
      runId: "mar_1",
      renderIntent: "preview",
      compositionMode: "storyboard_motion_preview",
    });
    expect(() =>
      CreateHyperframesPreviewInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        renderIntent: "final",
      })
    ).toThrow();
    expect(() =>
      CreateHyperframesPreviewInputSchema.parse({
        productId: "product_1",
        runId: "mar_1",
        idempotencyKey: "caller_supplied",
      })
    ).toThrow();
  });

  it("submits final composite execution to the desktop worker queue without server render fallback", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../hyperframesRuntimeApiService.ts"),
      "utf-8",
    );

    expect(source).not.toContain("dispatchHyperframesFinalCompositeWorker");
    expect(source).not.toContain("startDetachedHyperframesRenderWorker");
    expect(source).not.toContain("hf_final_worker_required_");
    expect(source).not.toContain("Server-side HyperFrames final composite render is disabled for Storyboard Review.");
    expect(source).toContain("queueDesktopHyperframesFinalCompositeJob");
    expect(source).toContain('Reflect.get(error, "code") === "dispatch_disabled"');
  });

  it("deduplicates final composite submits only inside a short render window", () => {
    const payload: Parameters<
      typeof buildHyperframesFinalCompositeWorkerIdempotencyKey
    >[0]["payload"] = {
      renderIntent: "final",
      compositionInputHash: "hf_input_same",
      templateVersion: "v1",
      platformPresetId: "vertical_9_16",
      runtimeProfileHash: "runtime_ready",
      creativePlanHash: "creative_same",
    };
    const baseInput = {
      tenantId: "tenant_1",
      runId: "mar_1",
      payload,
      finalCompositeConfigHash: "config_same",
    };
    const currentWindow = Math.floor(
      Date.now() / HYPERFRAMES_FINAL_COMPOSITE_SUBMISSION_DEDUPE_WINDOW_MS
    );

    expect(
      buildHyperframesFinalCompositeWorkerIdempotencyKey({
        ...baseInput,
        submissionWindowKey: currentWindow,
      })
    ).toBe(
      buildHyperframesFinalCompositeWorkerIdempotencyKey({
        ...baseInput,
        submissionWindowKey: currentWindow,
      })
    );
    expect(
      buildHyperframesFinalCompositeWorkerIdempotencyKey({
        ...baseInput,
        submissionWindowKey: currentWindow + 1,
      })
    ).not.toBe(
      buildHyperframesFinalCompositeWorkerIdempotencyKey({
        ...baseInput,
        submissionWindowKey: currentWindow,
      })
    );
  });

  it("allows final composite queueing only when the official CLI runtime is doctor-ready", async () => {
    const runtimeTools = await createRuntimeToolEnv();
    expect(
      getHyperframesFinalCompositeRuntimeBlockReason({
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
      })
    ).toMatch(/readiness flag is not enabled/i);
    expect(
      getHyperframesFinalCompositeRuntimeBlockReason({
        HYPERFRAMES_RUNTIME_MODE: "cli",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "1",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
        ...runtimeTools,
      })
    ).toBeNull();
    expect(
      getHyperframesFinalCompositeRuntimeBlockReason({
        HYPERFRAMES_RUNTIME_MODE: "cli",
        HYPERFRAMES_OFFICIAL_RUNTIME_READY: "0",
        HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME: "1",
        ...runtimeTools,
      })
    ).toMatch(/readiness flag is not enabled/i);
    expect(
      getHyperframesFinalCompositeRuntimeBlockReason({
        HYPERFRAMES_RUNTIME_MODE: "producer",
      })
    ).toMatch(/readiness flag is not enabled/i);
  });

  it("recognizes manual Storyboard Review HyperFrames identities", () => {
    expect(
      isManualStoryboardHyperframesIdentity({
        productId: "manual_storyboard_product_123",
        runId: "manual_storyboard_run_123",
      })
    ).toBe(true);
    expect(
      isManualStoryboardHyperframesIdentity({
        productId: "manual_product_1",
        runId: "manual_run_1",
      })
    ).toBe(true);
    expect(
      isManualStoryboardHyperframesIdentity({
        productId: "real_product_1",
        runId: "mar_1",
      })
    ).toBe(false);
  });

  it("builds a fallback product state for manual Storyboard Review final renders", () => {
    const state = buildManualStoryboardProductState({
      productId: "manual_storyboard_product_123",
      runId: "manual_storyboard_run_123",
      runState: {
        productionContext: {
          productionProjectTitle: "Manual Storyboard Project",
          videoConcept: "Custom storyboard workspace",
        },
      },
      config: {
        finalVideoLengthSec: 8,
        width: 1080,
        height: 1920,
        fps: 30,
        aspectRatio: "9:16",
        styleBrief: "Manual render",
        hookText: "Manual hook",
        supportingText: "Manual support",
        overlayPreset: "premium_product_hero",
        textMode: "hook_overlay_all_shots",
        textMotionPreset: "slide_right_to_left",
        fontFamily: "Prompt",
        subtitleFontSizePx: 34,
        subtitlePreset: "highlight_bar",
        burnInSubtitles: true,
        subtitlePlacement: "bottom",
        audioPackPresetId: "ecommerce_fast_cut",
        musicPresetId: "upbeat_ecommerce_social",
        sfxPresetIds: [],
        preserveNativeAudio: true,
        allowSyntheticAudioFallback: true,
        cssAnimationEnabled: true,
        gsapCompatibleTimeline: true,
        shots: [
          {
            id: "shot_1",
            index: 0,
            title: "Shot 1",
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            sourceVideoRef: "/api/storage/files/shot-1.mp4",
            mediaStartSec: 0,
            startSec: 0,
            durationSec: 8,
            onScreenText: [],
            subtitleCues: [],
            overlayPreset: "premium_product_hero",
            animationPreset: "smooth_reveal",
            transition: "fade",
            textMotionPreset: "slide_right_to_left",
          },
        ],
        audioEvents: [],
        audioAssetValidation: {
          stagedAssetsRequired: false,
          allowSyntheticFallback: true,
          missingAssetRefs: [],
          validatedAssetRefs: [],
          validatedAssets: [],
        },
      },
    });

    expect(state.product).toMatchObject({
      id: "manual_storyboard_product_123",
      title: "Manual Storyboard Project",
      accessType: "owner",
    });
    expect(state.health.status).toBe("manual_storyboard_review");
  });

  it("blocks final composite music/SFX when staged licensed assets are missing and fallback is disabled", () => {
    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 8,
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
        ],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: false,
          missingAssetRefs: [
            "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav",
          ],
          validatedAssetRefs: [],
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
      })
    ).toThrow(/staged licensed assets/i);
  });

  it("allows final composite music/SFX only when asset refs are validated or explicit fallback is enabled", () => {
    const assetRef =
      "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav";
    const config = {
      finalVideoLengthSec: 8,
      audioEvents: [
        {
          id: "music_bed_main",
          role: "music" as const,
          presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
          visualTrigger: "video_start" as const,
          startSec: 0,
          durationSec: 8,
          volume: 0.18,
          assetRef,
        },
      ],
      audioAssetValidation: {
        stagedAssetsRequired: true,
        allowSyntheticFallback: false,
        missingAssetRefs: [],
        validatedAssetRefs: [assetRef],
        validatedAssets: [
          {
            assetRef,
            source: "bundled" as const,
            licenseName: "Internal licensed ecommerce music bed",
            checksum: {
              algorithm: "sha256" as const,
              value:
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            },
            mimeType: "audio/wav",
            durationSec: 8,
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
    };

    expect(() => validateHyperframesFinalCompositeAudioAssets(config)).not.toThrow();
    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...config,
        audioAssetValidation: {
          ...config.audioAssetValidation,
          allowSyntheticFallback: true,
          validatedAssetRefs: [],
          validatedAssets: [],
          missingAssetRefs: [assetRef],
        },
      })
    ).not.toThrow();
  });

  it("requires checksum and license metadata for staged audio when fallback is disabled", () => {
    const assetRef =
      "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav";

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 8,
        audioEvents: [
          {
            id: "music_bed_main",
            role: "music",
            presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 8,
            volume: 0.18,
            assetRef,
          },
        ],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: false,
          missingAssetRefs: [],
          validatedAssetRefs: [assetRef],
          validatedAssets: [],
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
      })
    ).toThrow(/checksum metadata/i);
  });

  it("blocks audio events that exceed the final composite timeline", () => {
    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 8,
        audioEvents: [
          {
            id: "late_sfx",
            role: "accent_sfx",
            presetId: "hf_audio_sfx_cash_register_sales_moment_v1",
            visualTrigger: "price_badge_pop",
            startSec: 7.8,
            durationSec: 1,
            volume: 0.25,
            assetRef: "/api/storage/hyperframes/audio-presets/hf_audio_sfx_cash_register_sales_moment_v1.wav",
          },
        ],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: true,
          missingAssetRefs: [],
          validatedAssetRefs: [],
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
      })
    ).toThrow(/timing exceeds/i);
  });

  it("blocks SFX events that repeat too tightly or exceed safe mix policy", () => {
    const baseShot = {
      id: "shot_1",
      index: 0,
      sourceVideoUrl: "/api/storage/files/shot-1.mp4",
      startSec: 0,
      durationSec: 8,
    };
    const baseSfx = {
      role: "transition_sfx" as const,
      presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
      visualTrigger: "scene_cut" as const,
      durationSec: 0.22,
      volume: 0.22,
      assetRef:
        "/api/storage/hyperframes/audio-presets/hf_audio_sfx_whoosh_scene_transition_v1.wav",
    };

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 8,
        audioEvents: [
          { ...baseSfx, id: "sfx_1", startSec: 1 },
          { ...baseSfx, id: "sfx_2", startSec: 1.05 },
        ],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: true,
          missingAssetRefs: [],
          validatedAssetRefs: [],
          validatedAssets: [],
        },
        shots: [baseShot],
      })
    ).toThrow(/too close/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 8,
        audioEvents: [{ ...baseSfx, id: "sfx_loud", startSec: 1, volume: 0.9 }],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: true,
          missingAssetRefs: [],
          validatedAssetRefs: [],
          validatedAssets: [],
        },
        shots: [baseShot],
      })
    ).toThrow(/volume/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 8,
        audioEvents: [{ ...baseSfx, id: "sfx_long", startSec: 1, durationSec: 3 }],
        audioAssetValidation: {
          stagedAssetsRequired: true,
          allowSyntheticFallback: true,
          missingAssetRefs: [],
          validatedAssetRefs: [],
          validatedAssets: [],
        },
        shots: [baseShot],
      })
    ).toThrow(/duration/i);
  });

  it("enforces audio volume ceilings by role and preset family", () => {
    const baseShot = {
      id: "shot_1",
      index: 0,
      sourceVideoUrl: "/api/storage/files/shot-1.mp4",
      startSec: 0,
      durationSec: 8,
    };
    const baseValidation = {
      stagedAssetsRequired: true,
      allowSyntheticFallback: true,
      missingAssetRefs: [],
      validatedAssetRefs: [],
      validatedAssets: [],
    };
    const baseConfig = {
      finalVideoLengthSec: 8,
      audioAssetValidation: baseValidation,
      shots: [baseShot],
    };

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...baseConfig,
        audioEvents: [
          {
            id: "music_loud",
            role: "music",
            presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 8,
            volume: 0.5,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav",
          },
        ],
      })
    ).toThrow(/music without voiceover/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...baseConfig,
        audioEvents: [
          {
            id: "voiceover_main",
            role: "voiceover",
            presetId: "manual_voiceover",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 8,
            volume: 0.9,
            assetRef: "/api/storage/hyperframes/audio-presets/voiceover.wav",
          },
          {
            id: "music_under_vo_loud",
            role: "music",
            presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 8,
            volume: 0.25,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav",
          },
        ],
      })
    ).toThrow(/music under voiceover/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...baseConfig,
        audioEvents: [
          {
            id: "cash_loud",
            role: "accent_sfx",
            presetId: "hf_audio_sfx_cash_register_sales_moment_v1",
            visualTrigger: "price_badge_pop",
            startSec: 1,
            durationSec: 0.4,
            volume: 0.6,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_sfx_cash_register_sales_moment_v1.wav",
          },
        ],
      })
    ).toThrow(/cash register SFX/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...baseConfig,
        audioEvents: [
          {
            id: "ambience_loud",
            role: "ambience",
            presetId: "hf_audio_ambience_beach_soft_v1",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 8,
            volume: 0.2,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_ambience_beach_soft_v1.wav",
          },
        ],
      })
    ).toThrow(/ambience/i);
  });

  it("enforces SFX visual trigger families and timing policies", () => {
    const baseShot = {
      id: "shot_1",
      index: 0,
      sourceVideoUrl: "/api/storage/files/shot-1.mp4",
      startSec: 0,
      durationSec: 8,
    };
    const baseValidation = {
      stagedAssetsRequired: true,
      allowSyntheticFallback: true,
      missingAssetRefs: [],
      validatedAssetRefs: [],
      validatedAssets: [],
    };
    const baseConfig = {
      finalVideoLengthSec: 8,
      audioAssetValidation: baseValidation,
      shots: [baseShot],
    };

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...baseConfig,
        audioEvents: [
          {
            id: "cash_wrong_trigger",
            role: "accent_sfx",
            presetId: "hf_audio_sfx_cash_register_sales_moment_v1",
            visualTrigger: "scene_cut",
            startSec: 4,
            durationSec: 0.4,
            volume: 0.32,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_sfx_cash_register_sales_moment_v1.wav",
          },
        ],
      })
    ).toThrow(/matching visual trigger/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...baseConfig,
        audioEvents: [
          {
            id: "cash_too_early",
            role: "accent_sfx",
            presetId: "hf_audio_sfx_cash_register_sales_moment_v1",
            visualTrigger: "price_badge_pop",
            startSec: 0.1,
            durationSec: 0.4,
            volume: 0.32,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_sfx_cash_register_sales_moment_v1.wav",
          },
        ],
      })
    ).toThrow(/price\/sales lock/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        ...baseConfig,
        audioEvents: [
          {
            id: "whoosh_mid_shot",
            role: "transition_sfx",
            presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
            visualTrigger: "scene_cut",
            startSec: 4,
            durationSec: 0.22,
            volume: 0.22,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_sfx_whoosh_scene_transition_v1.wav",
          },
        ],
      })
    ).toThrow(/scene cut boundary/i);

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 16,
        audioAssetValidation: baseValidation,
        shots: [
          baseShot,
          {
            id: "shot_2",
            index: 1,
            sourceVideoUrl: "/api/storage/files/shot-2.mp4",
            startSec: 8,
            durationSec: 8,
          },
        ],
        audioEvents: [
          {
            id: "riser_at_next_shot_start",
            role: "accent_sfx",
            presetId: "hf_audio_sfx_riser_impact_reveal_v1",
            visualTrigger: "product_reveal",
            startSec: 8,
            durationSec: 0.6,
            volume: 0.35,
            assetRef:
              "/api/storage/hyperframes/audio-presets/hf_audio_sfx_riser_impact_reveal_v1.wav",
          },
        ],
      })
    ).not.toThrow();
  });

  it("keeps SFX events inside a single storyboard shot while allowing global music", () => {
    const musicRef =
      "/api/storage/hyperframes/audio-presets/hf_audio_music_upbeat_ecommerce_social_v1.wav";
    const sfxRef =
      "/api/storage/hyperframes/audio-presets/hf_audio_sfx_whoosh_scene_transition_v1.wav";
    const shots = [
      {
        id: "shot_1",
        index: 0,
        sourceVideoUrl: "/api/storage/files/shot-1.mp4",
        startSec: 0,
        durationSec: 8,
      },
      {
        id: "shot_2",
        index: 1,
        sourceVideoUrl: "/api/storage/files/shot-2.mp4",
        startSec: 8,
        durationSec: 8,
      },
    ];
    const baseValidation = {
      stagedAssetsRequired: true,
      allowSyntheticFallback: true,
      missingAssetRefs: [],
      validatedAssetRefs: [],
      validatedAssets: [],
    };

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 16,
        audioEvents: [
          {
            id: "music_bed_main",
            role: "music",
            presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
            visualTrigger: "video_start",
            startSec: 0,
            durationSec: 16,
            volume: 0.18,
            assetRef: musicRef,
          },
          {
            id: "sfx_scene_cut",
            role: "transition_sfx",
            presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
            visualTrigger: "scene_cut",
            startSec: 8,
            durationSec: 0.22,
            volume: 0.22,
            assetRef: sfxRef,
          },
        ],
        audioAssetValidation: baseValidation,
        shots,
      })
    ).not.toThrow();

    expect(() =>
      validateHyperframesFinalCompositeAudioAssets({
        finalVideoLengthSec: 16,
        audioEvents: [
          {
            id: "sfx_crosses_shot",
            role: "transition_sfx",
            presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
            visualTrigger: "scene_cut",
            startSec: 7.9,
            durationSec: 0.3,
            volume: 0.22,
            assetRef: sfxRef,
          },
        ],
        audioAssetValidation: baseValidation,
        shots,
      })
    ).toThrow(/single storyboard shot/i);
  });

  it("separates new and duplicate Library finalize no-charge reasons", () => {
    expect(
      buildHyperframesLibrarySaveChargeSummary({
        created: true,
        idempotencyKey: "hyperframes-library:tenant_1:mar_1:final:hf_input:hf_output",
      })
    ).toMatchObject({
      chargeRequired: false,
      noChargeReason: "not_billable",
    });
    expect(
      buildHyperframesLibrarySaveChargeSummary({
        created: false,
        idempotencyKey: "hyperframes-library:tenant_1:mar_1:final:hf_input:hf_output",
      })
    ).toMatchObject({
      chargeRequired: false,
      noChargeReason: "duplicate_library_finalize",
    });
  });

  it("rejects Library finalization for preview-only renders", () => {
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        platformPresetId: "generic_vertical_9_16",
        renderIntent: "preview",
        compositionMode: "storyboard_motion_preview",
      },
    });

    expect(() =>
      buildHyperframesFinalizeInputFromCompletedRender({
        auth: { userId: 1, tenantId: "tenant_1" },
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
        idempotencyKey: "hyperframes-library:tenant_1:mar_1:preview:hf_input:hf_output",
        render,
      })
    ).toThrow(/Preview-only/);
  });

  it("builds Library finalization input from completed durable artifact refs", () => {
    const outputArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        compositionHtmlHash: "hf_html",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        templateContentHash: "hf_template",
        platformPresetId: "generic_vertical_9_16",
        platformPresetVersion: "1.0.0",
        renderIntent: "final",
        compositionMode: "storyboard_motion_preview",
        runtimeProfileHash: "hf_runtime",
        launchMode: "auto_storyboard_review",
        traceId: "trace_1",
        correlationId: "corr_1",
        qaStatus: "passed",
        playableProbe: { passed: true, hasVideo: true, hasAudio: true },
      },
      artifactRefs: [outputArtifactRef],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.com/output.mp4",
          storageRef: outputArtifactRef.storageRef,
          contentHash: outputArtifactRef.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });
    const idempotencyKey = buildHyperframesLibraryIdempotencyKey({
      tenantId: "tenant_1",
      runId: "mar_1",
      renderIntent: "final",
      compositionInputHash: "hf_input",
      outputHash: "hf_output",
    });

    const finalizeInput = buildHyperframesFinalizeInputFromCompletedRender({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      idempotencyKey,
      render,
    });

    expect(finalizeInput.outputArtifactRef).toEqual(outputArtifactRef);
    expect(finalizeInput.payload.outputArtifactRef).toEqual(outputArtifactRef);
    expect(finalizeInput.payload.qaStatus).toBe("passed");
    expect(finalizeInput.payload.compositionHtmlHash).toBe("hf_html");
    expect(finalizeInput.payload.templateContentHash).toBe("hf_template");
    expect(finalizeInput.payload.runtimeProfileHash).toBe("hf_runtime");
  });

  it("uses the durable final video when snapshot output refs appear first", () => {
    const snapshotArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "snapshot_1",
      kind: "hyperframes_snapshot",
      storageRef:
        "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/snapshot.png",
      contentHash: "hf_snapshot",
      mimeType: "image/png",
      retentionClass: "review",
      redacted: true,
    });
    const outputArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef:
        "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        compositionHtmlHash: "hf_html",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        templateContentHash: "hf_template",
        platformPresetId: "generic_vertical_9_16",
        platformPresetVersion: "1.0.0",
        renderIntent: "final",
        compositionMode: "storyboard_motion_preview",
        runtimeProfileHash: "hf_runtime",
        launchMode: "auto_storyboard_review",
        traceId: "trace_1",
        correlationId: "corr_1",
        qaStatus: "passed",
        playableProbe: { passed: true, hasVideo: true, hasAudio: true },
      },
      artifactRefs: [snapshotArtifactRef, outputArtifactRef],
      outputRefs: [
        {
          outputId: "snapshot_1",
          kind: "snapshot",
          url: "https://cdn.example.com/snapshot.png",
          storageRef: snapshotArtifactRef.storageRef,
          thumbnailUrl: "https://cdn.example.com/snapshot-thumb.png",
          contentHash: snapshotArtifactRef.contentHash,
          accessibleLabel: "Snapshot",
        },
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.com/output.mp4",
          storageRef: outputArtifactRef.storageRef,
          thumbnailUrl: "https://cdn.example.com/output-thumb.jpg",
          contentHash: outputArtifactRef.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });
    const idempotencyKey = buildHyperframesLibraryIdempotencyKey({
      tenantId: "tenant_1",
      runId: "mar_1",
      renderIntent: "final",
      compositionInputHash: "hf_input",
      outputHash: "hf_output",
    });

    const finalizeInput = buildHyperframesFinalizeInputFromCompletedRender({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      idempotencyKey,
      render,
    });

    expect(finalizeInput.outputArtifactRef.contentHash).toBe("hf_output");
    expect(finalizeInput.outputUrl).toBe("https://cdn.example.com/output.mp4");
    expect(finalizeInput.thumbnailUrl).toBe(
      "https://cdn.example.com/output-thumb.jpg"
    );
    expect(finalizeInput.payload.outputArtifactRef).toEqual(outputArtifactRef);
    expect(finalizeInput.payload.outputUrl).toBe(
      "https://cdn.example.com/output.mp4"
    );
  });

  it("rejects durable output when render QA is not passed", () => {
    const outputArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "completed",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input",
        compositionHtmlHash: "hf_html",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        templateVersion: "1.0.0",
        templateContentHash: "hf_template",
        platformPresetId: "generic_vertical_9_16",
        platformPresetVersion: "1.0.0",
        renderIntent: "final",
        compositionMode: "storyboard_motion_preview",
        runtimeProfileHash: "hf_runtime",
        launchMode: "auto_storyboard_review",
        traceId: "trace_1",
        correlationId: "corr_1",
        playableProbe: { passed: true, hasVideo: true, hasAudio: true },
      },
      artifactRefs: [outputArtifactRef],
      outputRefs: [
        {
          outputId: "output_1",
          kind: "final_video",
          url: "https://cdn.example.com/output.mp4",
          storageRef: outputArtifactRef.storageRef,
          contentHash: outputArtifactRef.contentHash,
          accessibleLabel: "Final HyperFrames video",
        },
      ],
    });

    expect(() =>
      buildHyperframesFinalizeInputFromCompletedRender({
        auth: { userId: 1, tenantId: "tenant_1" },
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
        idempotencyKey: buildHyperframesLibraryIdempotencyKey({
          tenantId: "tenant_1",
          runId: "mar_1",
          renderIntent: "final",
          compositionInputHash: "hf_input",
          outputHash: "hf_output",
        }),
        render,
      })
    ).toThrow(/QA/);
  });
});
