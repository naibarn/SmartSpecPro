#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MARKETPLACE_HYPERFRAMES_RESULTS_DIR,
  encodeFramesToMp4,
  ensureResultsDir,
  fileEvidence,
  renderFixtureFrames,
} from "./hyperframes-local-renderer.mjs";

const outputDir = ensureResultsDir();
const render = await renderFixtureFrames({
  outputDir,
  frameDirName: "fixture-render-frames",
});
const outputPath = join(outputDir, "marketplace-hyperframes-fixture.mp4");
encodeFramesToMp4({ frameDir: render.frameDir, outputPath });

const manifest = {
  gate: "fixture-render",
  status: "passed",
  renderer: "playwright_chromium_ffmpeg_smoke",
  generatedAt: new Date().toISOString(),
  htmlPath: render.htmlPath,
  frameCount: render.framePaths.length,
  frames: render.framePaths.map(fileEvidence),
  output: fileEvidence(outputPath),
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
