#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MARKETPLACE_HYPERFRAMES_RESULTS_DIR,
  ensureResultsDir,
  fileEvidence,
  renderFixtureFrames,
} from "./hyperframes-local-renderer.mjs";

const outputDir = ensureResultsDir();
const cases = [
  "marketplace_storyboard_motion_9x9_v1",
  "long_thai_title",
  "missing_price_rating",
  "cta_scene",
  "disclosure_scene",
  "vertical_9_16_safe_area",
];
const results = [];

for (const name of cases) {
  const render = await renderFixtureFrames({
    outputDir,
    frameDirName: `snapshot-${name}`,
    htmlFileName: `snapshot-${name}.html`,
    title:
      name === "long_thai_title"
        ? "ชื่อสินค้าไทยยาวมากมากมาก พร้อม English และ % discount CTA ที่ต้องไม่ล้นขอบภาพ"
        : `HyperFrames ${name}`,
    frameLabel: name.replaceAll("_", " "),
    frames: [0, 30, 60],
  });
  results.push({
    case: name,
    htmlPath: render.htmlPath,
    frames: render.framePaths.map(fileEvidence),
    status: render.framePaths.every(path => fileEvidence(path).ok)
      ? "passed"
      : "failed",
  });
}

const manifest = {
  gate: "snapshot-test",
  status: results.every(item => item.status === "passed") ? "passed" : "failed",
  renderer: "playwright_chromium_snapshot_smoke",
  generatedAt: new Date().toISOString(),
  cases: results,
  notes: [
    "Smoke snapshots validate local browser rendering, file generation, and long Thai text safe-area fixtures.",
    "Golden-frame pixel baselines remain a rollout follow-up once pinned HyperFrames producer/Chrome/fonts are approved.",
  ],
};

writeFileSync(
  join(MARKETPLACE_HYPERFRAMES_RESULTS_DIR, "snapshot-test-manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "passed") process.exitCode = 1;
