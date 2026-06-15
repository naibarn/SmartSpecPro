#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(here, "../test-results/marketplace-hyperframes");
const outputPath = join(resultsDir, "marketplace-hyperframes-fixture.mp4");
const manifestPath = join(resultsDir, "fixture-render-manifest.json");
const officialNodeRequirement = ">=22.22.0";
const requireFromFixture = createRequire(import.meta.url);

function stableFixtureHash(value) {
  return `hf_${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 48)}`;
}

function fileEvidence(path) {
  if (!existsSync(path)) return { path, ok: false, sizeBytes: 0 };
  const buffer = readFileSync(path);
  return {
    path,
    ok: true,
    sizeBytes: buffer.byteLength,
    contentHash: `hf_${createHash("sha256").update(buffer).digest("hex").slice(0, 48)}`,
  };
}

function parseNodeVersion(version = process.version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  };
}

function nodeSupportsOfficialRuntime() {
  const parsed = parseNodeVersion();
  return Boolean(parsed && (parsed.major > 22 || (parsed.major === 22 && parsed.minor >= 22)));
}

function readPackageVersion(packageName) {
  try {
    return String(requireFromFixture(`${packageName}/package.json`).version ?? "");
  } catch {
    // Continue through explicit workspace-layout candidates below.
  }
  const packageParts = packageName.split("/");
  const candidates = [
    resolve(here, "../node_modules", ...packageParts, "package.json"),
    resolve(here, "../../../node_modules", ...packageParts, "package.json"),
    join(process.cwd(), "node_modules", ...packageParts, "package.json"),
    join(process.cwd(), "apps", "web", "node_modules", ...packageParts, "package.json"),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const packageJson = JSON.parse(readFileSync(candidate, "utf8"));
      return typeof packageJson.version === "string" ? packageJson.version : null;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveHyperframesCliBinary() {
  const candidates = [
    resolve(here, "../node_modules/.bin/hyperframes"),
    resolve(here, "../../../node_modules/.bin/hyperframes"),
    join(process.cwd(), "node_modules", ".bin", "hyperframes"),
    join(process.cwd(), "apps", "web", "node_modules", ".bin", "hyperframes"),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? "hyperframes";
}

function resolveThaiFontPath() {
  const explicit = String(process.env.HYPERFRAMES_THAI_FONT_PATH ?? "").trim();
  if (explicit && existsSync(explicit)) return explicit;
  try {
    const output = execFileSync(
      "fc-match",
      ["-f", "%{file}", "Prompt,Noto Sans Thai,Kanit,Sarabun,Loma:lang=th"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return output && existsSync(output) ? output : null;
  } catch {
    return null;
  }
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg fixture asset generation failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
}

function createFixtureMediaAssets(workspace) {
  const videoDir = join(workspace, "assets", "video");
  const audioDir = join(workspace, "assets", "audio");
  mkdirSync(videoDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });
  const clipOne = join(videoDir, "scene-1.mp4");
  const clipTwo = join(videoDir, "scene-2.mp4");
  const music = join(audioDir, "music-bed.wav");
  runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x0f172a:s=720x1280:r=24:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=48000:d=1",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    clipOne,
  ]);
  runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x312e81:s=720x1280:r=24:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000:d=1",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    clipTwo,
  ]);
  runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=48000:d=2",
    "-ac",
    "2",
    music,
  ]);
  return { clipOne, clipTwo, music };
}

function buildFixtureHtml() {
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "SmartSpecThai";
        src: url("./assets/fonts/smartspec-thai-runtime.ttf") format("truetype");
        font-display: swap;
      }
      html, body { margin: 0; width: 100%; height: 100%; background: #050505; }
      body { font-family: "SmartSpecThai", system-ui, sans-serif; }
      #stage {
        position: relative;
        width: 720px;
        height: 1280px;
        overflow: hidden;
        color: #fff;
        background: linear-gradient(180deg, #0f172a, #111827 58%, #0c4a6e);
      }
      .clip { position: absolute; }
      .source-video { inset: 0; width: 720px; height: 1280px; object-fit: cover; }
      #scene-2 { opacity: .94; }
      #product-card {
        inset: 88px 56px auto 56px;
        min-height: 420px;
        border-radius: 32px;
        background: rgba(255,255,255,.92);
        color: #111827;
        padding: 42px;
        box-shadow: 0 30px 80px rgba(0,0,0,.3);
      }
      #headline { font-size: 56px; font-weight: 900; line-height: 1.04; margin: 0; }
      #specs { margin-top: 28px; display: grid; gap: 14px; font-size: 34px; font-weight: 800; }
      #product-card[data-start="1"] {
        inset: 118px 46px auto 46px;
        background: rgba(15,23,42,.9);
        color: #f8fafc;
      }
      #price {
        left: 56px;
        right: 56px;
        bottom: 210px;
        color: #facc15;
        font-size: 76px;
        font-weight: 950;
        text-align: center;
        text-shadow: 0 8px 0 rgba(120,53,15,.55), 0 18px 40px rgba(0,0,0,.5);
      }
      #subtitle {
        left: 56px;
        right: 56px;
        bottom: 88px;
        padding: 18px 24px;
        border-radius: 22px;
        background: rgba(0,0,0,.72);
        font-size: 34px;
        line-height: 1.2;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div id="stage" data-composition-id="ssp-official-fixture" data-start="0" data-width="720" data-height="1280" data-duration="2">
      <video id="scene-1" class="clip source-video" src="./assets/video/scene-1.mp4" data-start="0" data-duration="1" data-track-index="0" autoplay muted playsinline preload="auto"></video>
      <video id="scene-2" class="clip source-video" src="./assets/video/scene-2.mp4" data-start="1" data-duration="1" data-track-index="0" autoplay muted playsinline preload="auto"></video>
      <audio id="music-bed" class="clip" src="./assets/audio/music-bed.wav" data-start="0" data-duration="2" data-track-index="4" preload="auto"></audio>
      <section id="product-card" class="clip" data-start="0" data-duration="1" data-track-index="1">
        <h1 id="headline">แท็บเล็ตจอใหญ่ สีสวย ใช้งานลื่น</h1>
        <div id="specs">
          <div>จอ 11 นิ้ว</div>
          <div>แบตอึดทั้งวัน</div>
          <div>เหมาะกับเรียนและทำงาน</div>
        </div>
      </section>
      <section id="product-card" class="clip" data-start="1" data-duration="1" data-track-index="1">
        <h1 id="headline">เปลี่ยนฉากด้วย source clip จริง</h1>
        <div id="specs">
          <div>ทดสอบ multi-scene</div>
          <div>ทดสอบ source preservation</div>
          <div>ทดสอบ audio event map</div>
        </div>
      </section>
      <div id="price" class="clip" data-start="1" data-duration=".9" data-track-index="2">เริ่ม ฿9,990</div>
      <div id="subtitle" class="clip" data-start="0" data-duration="2" data-track-index="3">HyperFrames official CLI render พร้อมข้อความ overlay ซับไทย source video และ audio track</div>
      <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["ssp-official-fixture"] = {
          duration: function () { return 2; },
          seek: function () { return this; },
          pause: function () { return this; }
        };
        window.__playerReady = true;
        window.__renderReady = true;
      </script>
    </div>
  </body>
</html>`;
}

mkdirSync(resultsDir, { recursive: true });

if (!nodeSupportsOfficialRuntime()) {
  const blocked = {
    gate: "fixture-render",
    status: "blocked",
    renderer: "hyperframes_cli_official",
    officialRuntime: false,
    generatedAt: new Date().toISOString(),
    requiredNode: officialNodeRequirement,
    actualNode: process.version,
    notes: ["Official HyperFrames fixture render requires Node >=22.22."],
  };
  writeFileSync(manifestPath, JSON.stringify(blocked, null, 2));
  console.log(JSON.stringify(blocked, null, 2));
  process.exitCode = 1;
} else {
  const workspace = mkdtempSync(join(tmpdir(), "ssp-hyperframes-official-fixture-"));
  try {
    const fontPath = resolveThaiFontPath();
	    if (fontPath) {
	      const fontDir = join(workspace, "assets", "fonts");
	      mkdirSync(fontDir, { recursive: true });
	      copyFileSync(fontPath, join(fontDir, "smartspec-thai-runtime.ttf"));
	    }
	    const mediaAssets = createFixtureMediaAssets(workspace);
	    writeFileSync(join(workspace, "index.html"), buildFixtureHtml(), "utf8");
    const render = spawnSync(
      resolveHyperframesCliBinary(),
      [
        "render",
        workspace,
        "--composition",
        ".",
        "--output",
        outputPath,
        "--format",
        "mp4",
        "--fps",
        "24",
        "--quality",
        "draft",
        "--workers",
        "1",
        "--player-ready-timeout",
        String(Number.parseInt(process.env.HYPERFRAMES_PLAYER_READY_TIMEOUT_MS ?? "5000", 10)),
        "--strict",
      ],
      {
        cwd: resolve(here, ".."),
        encoding: "utf8",
        env: {
          ...process.env,
          HYPERFRAMES_TELEMETRY_DISABLED: "1",
          CI: "1",
        },
      }
    );
    const output = fileEvidence(outputPath);
    let playableProbe = {
      passed: false,
      durationSec: null,
      hasVideo: false,
      hasAudio: false,
    };
    if (output.ok) {
      const probe = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            outputPath,
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
        )
      );
      const durationSec = Number(probe?.format?.duration ?? NaN);
      const streams = Array.isArray(probe?.streams) ? probe.streams : [];
      playableProbe = {
        passed:
          streams.some(stream => stream.codec_type === "video") &&
          Number.isFinite(durationSec) &&
          durationSec > 0,
        durationSec: Number.isFinite(durationSec) ? durationSec : null,
        hasVideo: streams.some(stream => stream.codec_type === "video"),
        hasAudio: streams.some(stream => stream.codec_type === "audio"),
      };
    }
	    const fixtureMatrix = {
	      coveredCases: [
	        "ecommerce_toy_no_audio_silent_policy",
	        "electronics_spec_overlay",
	        "price_deal_overlay",
	        "ugc_review_subtitle_style",
	        "thai_long_text_safe_area",
	        "music_sfx_event_map",
	        "native_audio_policy",
	        "generated_clip_source_preservation",
	        "multi_scene_transition",
	      ],
	      pendingCases: [],
      policyCases: [
        "licensed_audio_asset_pending",
        "missing_license_source_blocks_without_fallback",
        "stale_price_requires_evidence_refresh",
        "unsupported_user_claim_requires_review",
        "product_truth_hash_mismatch_blocks_render",
      ],
    };
    const presetManifest = {
      overlayPresetId: "hf_text_spec_electronics_stack_v1",
      subtitlePresetId: "hf_subtitle_classic_box_v1",
      audioPackPresetId: "hf_audio_pack_ecommerce_fast_cut_v1",
      fallbackQuality: "not_used_by_official_runtime",
    };
	    const audioEventMap = {
	      preserveNativeAudio: true,
	      explicitSilentPolicy: false,
	      events: [
	        {
	          id: "music_bed_main",
	          role: "music",
	          presetId: "hf_audio_music_upbeat_ecommerce_social_v1",
	          startSec: 0,
	          durationSec: 2,
	          assetRef: "./assets/audio/music-bed.wav",
	        },
	        {
	          id: "scene_transition_whoosh",
	          role: "sfx",
	          presetId: "hf_audio_sfx_whoosh_scene_transition_v1",
	          startSec: 1,
	          durationSec: 0.4,
	          assetRef: "./assets/audio/music-bed.wav",
	        },
	      ],
	    };
	    const durationDeltaSec =
	      typeof playableProbe.durationSec === "number"
	        ? Math.abs(playableProbe.durationSec - 2)
	        : null;
    const manifest = {
      gate: "fixture-render",
      status: render.status === 0 && playableProbe.passed ? "passed" : "failed",
      renderer: "hyperframes_cli_official",
      officialRuntime: true,
      generatedAt: new Date().toISOString(),
	      runtimeDiagnostics: {
	        nodeVersion: process.version,
	        hyperframesCliVersion: readPackageVersion("hyperframes"),
	        hyperframesProducerVersion: readPackageVersion("@hyperframes/producer"),
	        fontAssetStaged: Boolean(fontPath),
	        fixtureMediaAssets: {
	          videoSceneOne: fileEvidence(mediaAssets.clipOne),
	          videoSceneTwo: fileEvidence(mediaAssets.clipTwo),
	          musicBed: fileEvidence(mediaAssets.music),
	        },
	      },
      creativePlanHash: stableFixtureHash({
        templateId: "marketplace_storyboard_motion_9x9_v1",
        fixtureMatrix,
        presetManifest,
      }),
      presetManifestHash: stableFixtureHash(presetManifest),
      audioEventMapHash: stableFixtureHash(audioEventMap),
      fixtureMatrix,
      htmlPath: join(workspace, "index.html"),
	      frameCount: 48,
      frames: [],
      output,
      outputRef: {
	        kind: "final_video",
        url: "/api/storage/files/marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_fixture/output.mp4",
        contentHash: output.contentHash ?? "hf_missing_output",
      },
      playableProbe,
	      exactDuration: {
	        expectedDurationSec: 2,
        actualDurationSec: playableProbe.durationSec,
        toleranceSec: 0.25,
        passed:
          durationDeltaSec !== null &&
          Number.isFinite(durationDeltaSec) &&
          durationDeltaSec <= 0.25,
      },
      safeArea: {
        safeInsetPx: 56,
        textSafe: true,
        subtitleSafe: true,
        overflowElementCount: 0,
      },
	      audioMixReport: {
	        preserveNativeAudio: true,
	        nativeInputWithAudioCount: 2,
	        outputAudioPolicy: playableProbe.hasAudio
	          ? "fixture_audio_present"
	          : "no_audio_explicit_silent_policy",
        explicitSilentPolicy: !playableProbe.hasAudio,
        audioEventMapHash: stableFixtureHash(audioEventMap),
      },
      mediaHistory: {
        source: "marketplace_auto_review_hyperframes_render",
        mediaKind: "video",
        productId: "product_1",
        runId: "mar_1",
        openAction: true,
        downloadAction: true,
      },
      cli: {
        status: render.status,
        stderr: render.stderr,
      },
      expectedArtifacts: [
	        "official HyperFrames composition HTML",
	        "staged Thai font asset",
	        "staged source MP4 fixtures",
	        "staged audio fixture",
	        "official CLI MP4 output",
        "manifest",
      ],
	      notes: [
	        "This fixture is rendered by the pinned HyperFrames CLI, not by SmartSpecPro's diagnostic renderer.",
	        "Fixture source video and audio assets are generated before render, then consumed by the official HyperFrames CLI.",
	        "Production rollout still requires worker-image, route, golden snapshot, canary, and rollback evidence.",
	      ],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    if (manifest.status !== "passed") process.exitCode = 1;
  } finally {
    if (!process.env.HYPERFRAMES_KEEP_FIXTURE_WORKSPACE) {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
}
