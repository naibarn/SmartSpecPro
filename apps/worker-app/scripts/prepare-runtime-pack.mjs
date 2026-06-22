#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sidecarsDir = resolve(appRoot, "sidecars");
const runtimePackDir = resolve(appRoot, "runtime-pack");
const placeholderSidecar = resolve(sidecarsDir, "hyperframes-render.exe");

mkdirSync(sidecarsDir, { recursive: true });
mkdirSync(runtimePackDir, { recursive: true });

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

try {
  readFileSync(placeholderSidecar);
} catch {
  writeFileSync(
    placeholderSidecar,
    "Smart AI Hub Worker App placeholder sidecar. Replace during signed runtime pack assembly.\n",
  );
}

const digest = sha256(placeholderSidecar);
const manifest = {
  runtimeId: "hyperframes-windows-x64",
  version: "0.0.0-placeholder",
  hyperframesVersion: "not-bundled",
  browserVersion: "not-bundled",
  ffmpegVersion: "not-bundled",
  ffprobeVersion: "not-bundled",
  thaiFontFamily: "Noto Sans Thai",
  sidecarPath: "hyperframes-render.exe",
  sidecarSha256: digest,
  checksumFile: "SHA256SUMS",
  signatureFile: "SHA256SUMS.sig",
  licenseNotices: ["THIRD_PARTY_NOTICES.txt"],
  supportedContractVersions: ["2026-06-22"],
  runtimeProfileHash: digest,
  allowed: false,
  denyReason: "Placeholder runtime pack is not claimable.",
  rollbackToVersion: null,
};

writeFileSync(resolve(runtimePackDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve(runtimePackDir, "SHA256SUMS"), `${digest}  ../sidecars/hyperframes-render.exe\n`);
writeFileSync(resolve(runtimePackDir, "SHA256SUMS.sig"), "placeholder-signature-required-before-release\n");
writeFileSync(
  resolve(runtimePackDir, "THIRD_PARTY_NOTICES.txt"),
  "Placeholder runtime pack. Add HyperFrames, browser, FFmpeg/FFprobe, and font license notices before release.\n",
);

console.log(`[worker-app] runtime pack placeholder written to ${runtimePackDir}`);
