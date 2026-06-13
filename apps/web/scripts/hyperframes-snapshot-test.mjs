#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(here, "../test-results/marketplace-hyperframes");
const fixtureManifestPath = join(resultsDir, "fixture-render-manifest.json");
const snapshotManifestPath = join(resultsDir, "snapshot-test-manifest.json");

function stableHash(value) {
  return `hf_${createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, 48)}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validHash(value) {
  return typeof value === "string" && /^hf_[a-f0-9]{24,128}$/i.test(value);
}

mkdirSync(resultsDir, { recursive: true });

if (!existsSync(fixtureManifestPath)) {
  const blocked = {
    gate: "snapshot-test",
    status: "blocked",
    officialRuntime: false,
    generatedAt: new Date().toISOString(),
    notes: ["Run hyperframes:fixture-render before hyperframes:snapshot-test."],
  };
  writeFileSync(snapshotManifestPath, JSON.stringify(blocked, null, 2));
  console.log(JSON.stringify(blocked, null, 2));
  process.exitCode = 1;
} else {
  const fixture = readJson(fixtureManifestPath);
  const coveredCases = new Set(fixture.fixtureMatrix?.coveredCases ?? []);
  const requiredCases = [
    "electronics_spec_overlay",
    "price_deal_overlay",
    "ugc_review_subtitle_style",
    "thai_long_text_safe_area",
    "music_sfx_event_map",
    "native_audio_policy",
    "generated_clip_source_preservation",
    "multi_scene_transition",
  ];
  const passed =
    fixture.status === "passed" &&
    fixture.officialRuntime === true &&
    /^hyperframes_(cli|producer)_official$/.test(String(fixture.renderer ?? "")) &&
    fixture.playableProbe?.passed === true &&
    fixture.playableProbe?.hasVideo === true &&
    fixture.exactDuration?.passed === true &&
    fixture.safeArea?.textSafe === true &&
    fixture.safeArea?.subtitleSafe === true &&
    fixture.safeArea?.overflowElementCount === 0 &&
    validHash(fixture.output?.contentHash) &&
    requiredCases.every(item => coveredCases.has(item));
  const goldenBaseline = {
    renderer: fixture.renderer,
    hyperframesCliVersion: fixture.runtimeDiagnostics?.hyperframesCliVersion,
    hyperframesProducerVersion: fixture.runtimeDiagnostics?.hyperframesProducerVersion,
    nodeVersion: fixture.runtimeDiagnostics?.nodeVersion,
    creativePlanHash: fixture.creativePlanHash,
    presetManifestHash: fixture.presetManifestHash,
    audioEventMapHash: fixture.audioEventMapHash,
    outputHash: fixture.output?.contentHash,
    durationSec: fixture.playableProbe?.durationSec,
    safeArea: fixture.safeArea,
    coveredCases: requiredCases,
  };
  const manifest = {
    gate: "snapshot-test",
    status: passed ? "passed" : "failed",
    renderer: fixture.renderer,
    officialRuntime: fixture.officialRuntime === true,
    generatedAt: new Date().toISOString(),
    goldenSnapshotHash: stableHash(goldenBaseline),
    baseline: goldenBaseline,
    checks: {
      officialRuntime: fixture.officialRuntime === true,
      playableVideo: fixture.playableProbe?.passed === true,
      exactDuration: fixture.exactDuration?.passed === true,
      textSafeArea: fixture.safeArea?.textSafe === true,
      subtitleSafeArea: fixture.safeArea?.subtitleSafe === true,
      outputHashPresent: validHash(fixture.output?.contentHash),
      requiredCasesCovered: requiredCases.every(item => coveredCases.has(item)),
    },
    notes: [
      "Golden evidence is derived from the pinned official HyperFrames fixture output.",
      "This gate rejects local smoke-renderer snapshots as production golden evidence.",
    ],
  };
  writeFileSync(snapshotManifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  if (!passed) process.exitCode = 1;
}
