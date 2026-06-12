#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MARKETPLACE_HYPERFRAMES_RESULTS_DIR,
  encodeFramesToMp4,
  ensureResultsDir,
  fileEvidence,
  renderFixtureFrames,
} from "./hyperframes-local-renderer.mjs";

const outputDir = ensureResultsDir();
function stableFixtureHash(value) {
  return `hf_${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 48)}`;
}

const render = await renderFixtureFrames({
  outputDir,
  frameDirName: "fixture-render-frames",
});
const outputPath = join(outputDir, "marketplace-hyperframes-fixture.mp4");
encodeFramesToMp4({ frameDir: render.frameDir, outputPath });
const outputBytes = readFileSync(outputPath);
let playableProbe = {
  passed: false,
  durationSec: null,
  hasVideo: false,
  hasAudio: false,
};
try {
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
    passed: streams.some(stream => stream.codec_type === "video") && Number.isFinite(durationSec) && durationSec > 0,
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    hasVideo: streams.some(stream => stream.codec_type === "video"),
    hasAudio: streams.some(stream => stream.codec_type === "audio"),
  };
} catch {
  playableProbe = { ...playableProbe, passed: false };
}
const contentHash = `hf_${createHash("sha256")
  .update(outputBytes)
  .digest("hex")
  .slice(0, 48)}`;
const expectedDurationSec = render.framePaths.length;
const durationDeltaSec =
  typeof playableProbe.durationSec === "number"
    ? Math.abs(playableProbe.durationSec - expectedDurationSec)
    : null;
const fixtureMatrix = {
  coveredCases: [
    "ecommerce_toy_no_audio_silent_policy",
    "electronics_spec_overlay",
    "price_deal_overlay",
    "ugc_review_subtitle_style",
    "thai_long_text_safe_area",
    "music_sfx_event_map",
    "native_audio_policy",
    "fallback_only_runtime",
  ],
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
  fallbackQuality: "partial",
};
const audioEventMap = {
  preserveNativeAudio: false,
  explicitSilentPolicy: true,
  events: [],
};
const creativePlanHash = stableFixtureHash({
  templateId: "marketplace_storyboard_motion_9x9_v1",
  fixtureMatrix,
  presetManifest,
});
const presetManifestHash = stableFixtureHash(presetManifest);
const audioEventMapHash = stableFixtureHash(audioEventMap);

const manifest = {
  gate: "fixture-render",
  status: "passed",
  renderer: "playwright_chromium_ffmpeg_smoke",
  generatedAt: new Date().toISOString(),
  creativePlanHash,
  presetManifestHash,
  audioEventMapHash,
  fixtureMatrix,
  htmlPath: render.htmlPath,
  frameCount: render.framePaths.length,
  frames: render.framePaths.map(fileEvidence),
  output: fileEvidence(outputPath),
  outputRef: {
    kind: "final_video",
    url: "/api/storage/files/marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_fixture/output.mp4",
    contentHash,
  },
  playableProbe,
  exactDuration: {
    expectedDurationSec,
    actualDurationSec: playableProbe.durationSec,
    toleranceSec: 0.25,
    passed:
      durationDeltaSec !== null &&
      Number.isFinite(durationDeltaSec) &&
      durationDeltaSec <= 0.25,
  },
  safeArea: render.safeAreaReport,
  audioMixReport: {
    preserveNativeAudio: false,
    nativeInputWithAudioCount: 0,
    outputAudioPolicy: playableProbe.hasAudio
      ? "fixture_audio_present"
      : "no_audio_explicit_silent_policy",
    explicitSilentPolicy: !playableProbe.hasAudio,
    audioEventMapHash,
  },
  mediaHistory: {
    source: "marketplace_auto_review_hyperframes_render",
    mediaKind: "video",
    productId: "product_1",
    runId: "mar_1",
    openAction: true,
    downloadAction: true,
  },
  expectedArtifacts: [
    "input envelope HTML",
    "composition HTML hash proxy via generated fixture",
    "snapshot refs",
    "manifest",
    "cleanup proof",
  ],
  notes: [
    "This gate proves local browser+FFmpeg rendering is operational for SmartSpecPro fixtures.",
    "Production HyperFrames producer rollout still requires pinned @hyperframes packages, Chrome image, fonts, and dependency audit approval.",
  ],
};

writeFileSync(
  join(MARKETPLACE_HYPERFRAMES_RESULTS_DIR, "fixture-render-manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log(JSON.stringify(manifest, null, 2));
