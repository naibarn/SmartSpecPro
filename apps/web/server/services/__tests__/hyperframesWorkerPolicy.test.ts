import { afterEach, describe, expect, it } from "vitest";

import {
  buildCompletedHyperframesStagePayload,
  buildOfficialRuntimeAudioMixReport,
  buildFinalCompositeAss,
  executeLocalHyperframesSmokeRender,
  isHyperframesRuntimeExecutionReady,
  isHyperframesWorkerEnabled,
  resolveHyperframesFfmpegBinary,
  runHyperframesRenderWorkerOnce,
  shouldRequireHyperframesOutputAudio,
} from "../../workers/hyperframesRenderWorker";

describe("hyperframesWorkerPolicy", () => {
  const previous = process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
  const previousRuntimeReady = process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY;
  const previousRuntimeMode = process.env.HYPERFRAMES_RUNTIME_MODE;
  const previousOfficialRuntimeReady = process.env.HYPERFRAMES_OFFICIAL_RUNTIME_READY;
  const previousAllowNode20Runtime = process.env.HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME;
  const previousEnabled = process.env.MARKETPLACE_HYPERFRAMES_ENABLED;
  const previousDisabled = process.env.MARKETPLACE_HYPERFRAMES_DISABLED;

  afterEach(() => {
    if (previous == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = previous;
    }
    if (previousRuntimeReady == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY = previousRuntimeReady;
    }
    if (previousRuntimeMode == null) {
      delete process.env.HYPERFRAMES_RUNTIME_MODE;
    } else {
      process.env.HYPERFRAMES_RUNTIME_MODE = previousRuntimeMode;
    }
    if (previousOfficialRuntimeReady == null) {
      delete process.env.HYPERFRAMES_OFFICIAL_RUNTIME_READY;
    } else {
      process.env.HYPERFRAMES_OFFICIAL_RUNTIME_READY = previousOfficialRuntimeReady;
    }
    if (previousAllowNode20Runtime == null) {
      delete process.env.HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME;
    } else {
      process.env.HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME = previousAllowNode20Runtime;
    }
    if (previousEnabled == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_ENABLED;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_ENABLED = previousEnabled;
    }
    if (previousDisabled == null) {
      delete process.env.MARKETPLACE_HYPERFRAMES_DISABLED;
    } else {
      process.env.MARKETPLACE_HYPERFRAMES_DISABLED = previousDisabled;
    }
  });

  it("defaults the global worker gate open so tenant flags can control rollout", () => {
    delete process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
    expect(isHyperframesWorkerEnabled()).toBe(true);
  });

  it("ignores legacy env false values so tenant flags control worker rollout", () => {
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "false";
    expect(isHyperframesWorkerEnabled()).toBe(true);
  });

  it("ignores legacy global HyperFrames env switches before tenant rollout", () => {
    process.env.MARKETPLACE_HYPERFRAMES_DISABLED = "true";
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "true";
    expect(isHyperframesWorkerEnabled()).toBe(true);

    process.env.MARKETPLACE_HYPERFRAMES_DISABLED = "false";
    process.env.MARKETPLACE_HYPERFRAMES_ENABLED = "false";
    expect(isHyperframesWorkerEnabled()).toBe(true);
  });

  it("keeps legacy explicit on values harmless for existing deployments", () => {
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "true";
    expect(isHyperframesWorkerEnabled()).toBe(true);
  });

  it("resolves an ffmpeg binary for local smoke renders", () => {
    expect(resolveHyperframesFfmpegBinary()).toMatch(/ffmpeg$/);
  });

  it("keeps runtime execution gated separately from worker enablement", () => {
    process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY = "false";
    process.env.HYPERFRAMES_RUNTIME_MODE = "diagnostic";
    process.env.HYPERFRAMES_OFFICIAL_RUNTIME_READY = "0";
    process.env.HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME = "1";
    expect(isHyperframesRuntimeExecutionReady()).toBe(true);
  });

  it("defers jobs when worker is enabled but runtime execution is not ready", async () => {
    await expect(runHyperframesRenderWorkerOnce({ runtimeReady: false })).resolves.toEqual({
      processed: 0,
      disabled: false,
      runtimeDeferred: true,
    });
  });

  it("builds job-type specific completion payloads before render execution", () => {
    expect(
      buildCompletedHyperframesStagePayload({
        jobType: "hyperframes_lint",
        payload: { productId: "product_1" },
      })
    ).toMatchObject({
      productId: "product_1",
      lintStatus: "passed",
      lintDiagnostics: [],
    });

    expect(
      buildCompletedHyperframesStagePayload({
        jobType: "hyperframes_snapshot",
        payload: { productId: "product_1" },
      })
    ).toMatchObject({
      snapshotStatus: "passed",
      snapshotManifest: {
        renderer: "local_smoke_snapshot",
        frameCount: 1,
        redacted: true,
      },
    });

    expect(
      buildCompletedHyperframesStagePayload({
        jobType: "hyperframes_render",
        payload: { productId: "product_1" },
      })
    ).toBeNull();
  });

  it("does not fall back to FFmpeg/ASS for final composite renders when official runtime is unavailable", async () => {
    await expect(
      executeLocalHyperframesSmokeRender({
        runId: "mar_1",
        renderJobId: "hf_final_1",
        runtimeEnv: {
          HYPERFRAMES_RUNTIME_MODE: "diagnostic",
        },
        payload: {
          renderIntent: "final",
          compositionMode: "captioned_final_composite",
          finalCompositeConfig: {
            width: 1080,
            height: 1920,
            shots: [
              {
                id: "shot_1",
                index: 0,
                durationSec: 8,
                sourceVideoUrl: "/api/storage/files/tenant/run/shot-1.mp4",
              },
            ],
          },
        },
      })
    ).rejects.toThrow(/HTML\/CSS\/browser runtime is required/);
  });

  it("requires an audio stream when final composite preserves native source audio", () => {
    const payload = {
      renderIntent: "final",
      compositionMode: "captioned_final_composite",
      finalCompositeConfig: {
        preserveNativeAudio: true,
        shots: [
          {
            id: "shot_1",
            index: 0,
            durationSec: 8,
            sourceVideoUrl: "/api/storage/files/tenant/run/shot-1.mp4",
          },
        ],
        audioEvents: [],
        audioAssetValidation: {
          missingAssetRefs: [],
          validatedAssetRefs: [],
        },
      },
    };

    expect(shouldRequireHyperframesOutputAudio(payload)).toBe(true);
    expect(
      buildOfficialRuntimeAudioMixReport(payload, { hasAudio: false })
    ).toMatchObject({
      preserveNativeAudio: true,
      nativeInputWithAudioCount: 0,
      nativeInputCandidateCount: 1,
      expectedOutputAudio: true,
      outputAudioProbeHasAudio: false,
      renderableAudioEventCount: 0,
    });
  });

  it("does not require an audio stream when native audio and audio events are disabled", () => {
    const payload = {
      renderIntent: "final",
      compositionMode: "captioned_final_composite",
      finalCompositeConfig: {
        preserveNativeAudio: false,
        shots: [
          {
            id: "shot_1",
            index: 0,
            durationSec: 8,
            sourceVideoUrl: "/api/storage/files/tenant/run/shot-1.mp4",
          },
        ],
        audioEvents: [],
        audioAssetValidation: {
          missingAssetRefs: [],
          validatedAssetRefs: [],
        },
      },
    };

    expect(shouldRequireHyperframesOutputAudio(payload)).toBe(false);
    expect(buildOfficialRuntimeAudioMixReport(payload)).toMatchObject({
      preserveNativeAudio: false,
      nativeInputCandidateCount: 0,
      expectedOutputAudio: false,
      renderableAudioEventCount: 0,
    });
  });

  it("expands legacy ellipsized Thai overlay text before writing the final ASS render script", () => {
    const longThaiOverlay =
      "พร้อมส่ง ของเล่นที่ตักทราย ชุดตักทราย ชุดเล่นทราย ของเล่นชายหาด";
    const ass = buildFinalCompositeAss(
      [
        {
          index: 0,
          durationSec: 8,
          sourceVideoUrl: "/api/storage/files/tenant_1/run_1/v001.mp4",
          onScreenText: ["พร้อมส่ง..."],
          subtitleCues: [
            {
              startSec: 0,
              endSec: 3,
              text: "วันหยุดที่บ้านอยากพาเด็ก ๆ ไปเล่น แต่กลัวแบกของเยอะ",
            },
          ],
          animationPreset: "glow_feature",
        },
      ],
      {
        productTitle: longThaiOverlay,
        finalCompositeConfig: {
          overlayPreset: "premium_product_hero",
          subtitlePreset: "classic_box",
          textMode: "hook_and_per_shot",
          includeShotText: true,
          includeHookText: true,
          burnInSubtitles: true,
          hookText: "พร้อมส่ง...",
          supportingText: "ของเล่นตักทรายพร้อมส่ง",
        },
      }
    );

    expect(ass).toContain("พร้อมส่ง");
    expect(ass).toContain("ของเล่นที่ตักทราย");
    expect(ass).toContain("ชุดตักทราย");
    expect(ass).toContain("\\N");
    expect(ass).not.toContain("พร้อมส่ง…");
    expect(ass).not.toContain("พร้อมส่ง...");
  });

  it("uses each shot overlay preset when writing the final ASS render script", () => {
    const ass = buildFinalCompositeAss(
      [
        {
          index: 0,
          durationSec: 8,
          sourceVideoUrl: "/api/storage/files/tenant_1/run_1/v001.mp4",
          onScreenText: ["ชงกาแฟหอมเข้ม"],
          overlayPreset: "lower_third_review",
          animationPreset: "fade_clean",
        },
      ],
      {
        finalCompositeConfig: {
          overlayPreset: "kinetic_bold_hook",
          subtitlePreset: "classic_box",
          textMode: "per_shot",
          includeShotText: true,
          includeHookText: false,
          burnInSubtitles: true,
        },
      }
    );

    expect(ass).toContain("{\\an1\\pos(90,1330)");
    expect(ass).not.toContain("{\\an8\\pos(540,170)");
  });

  it("renders kinetic overlay copy with preview-style left panel instead of centered text", () => {
    const ass = buildFinalCompositeAss(
      [
        {
          index: 0,
          durationSec: 8,
          sourceVideoUrl: "/api/storage/files/tenant_1/run_1/v001.mp4",
          onScreenText: [
            "ชงกาแฟหอมเข้ม แบบโปรในเครื่องเดียว",
            "BENO เครื่องชงกาแฟเอสเพรสโซ่ รุ่น PRO-FLEX บด ชง ตีฟองในเครื่องเดียว",
          ],
          overlayPreset: "kinetic_bold_hook",
          animationPreset: "glow_feature",
        },
      ],
      {
        finalCompositeConfig: {
          overlayPreset: "kinetic_bold_hook",
          subtitlePreset: "classic_box",
          textMode: "per_shot",
          includeShotText: true,
          includeHookText: false,
          burnInSubtitles: true,
        },
      }
    );
    const titleDialogue = ass
      .split("\n")
      .find(line => line.startsWith("Dialogue:") && line.includes("KineticTitle")) ?? "";
    const hookDialogue = ass
      .split("\n")
      .find(line => line.startsWith("Dialogue:") && line.includes("BENO")) ?? "";
    const renderedText = titleDialogue.split(",,").at(-1) ?? "";
    const hookText = hookDialogue.split(",,").at(-1) ?? "";
    const visualSegments = renderedText
      .replace(/\{[^}]*\}/g, "")
      .split("\\N")
      .filter(Boolean);

    expect(ass).toContain("Style: KineticPanel,Noto Sans Thai,1");
    expect(ass).toContain("Style: KineticTitle,Prompt,84");
    expect(ass).toContain("Style: KineticHookBg,Noto Sans Thai,1");
    expect(ass).toContain("Style: KineticHookBox,Noto Sans Thai,52");
    expect(ass).toContain("{\\an7\\pos(44,124)");
    expect(ass).toContain("m 0 1250 l 580 700 l 580 1660 l 0 1660");
    expect(ass).not.toContain("{\\an8\\pos(540,170)");
    expect(renderedText).toContain("แบบโปรในเครื่อง\\Nเดียว");
    expect(hookText).toContain("BENO");
    const plainAss = ass.replace(/\{[^}]*\}/g, "").replace(/\\N/g, " ");
    expect(plainAss).toContain("เครื่องชงกาแฟเอสเพรสโซ่");
    expect(plainAss).toContain("รุ่น PRO-FLEX");
    expect(plainAss).toContain("ตีฟองในเครื่องเดียว");
    expect(plainAss).not.toContain("…");
    expect(visualSegments.length).toBeGreaterThan(1);
    expect(Math.max(...visualSegments.map(segment => Array.from(segment).length))).toBeLessThanOrEqual(18);
  });
});
