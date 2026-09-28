import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const script = resolve(repoRoot, "apps/worker-app/scripts/package-content-protection-runtime.mjs");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function makeFixture(name) {
  const root = resolve(tmpdir(), `smartspec-content-protection-release-${process.pid}-${name}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "provider"), { recursive: true });
  mkdirSync(join(root, "ckpts"), { recursive: true });
  mkdirSync(join(root, "runtime-pack/bin"), { recursive: true });
  const provider = join(root, "provider/videoseal-provider.exe");
  const model = join(root, "ckpts/videoseal_y_256b_img.pth");
  const ffmpeg = join(root, "runtime-pack/bin/ffmpeg.exe");
  const ffprobe = join(root, "runtime-pack/bin/ffprobe.exe");
  const notices = join(root, "THIRD_PARTY_NOTICES.txt");
  writeFileSync(provider, "MZ-content-protection-provider");
  writeFileSync(model, "model");
  writeFileSync(ffmpeg, "ffmpeg");
  writeFileSync(ffprobe, "ffprobe");
  writeFileSync(notices, "VideoSeal license");
  truncateSync(model, 100 * 1024 * 1024);
  const files = [
    { path: "provider/videoseal-provider.exe", sha256: sha256(provider) },
    { path: "ckpts/videoseal_y_256b_img.pth", sha256: sha256(model) },
    { path: "runtime-pack/bin/ffmpeg.exe", sha256: sha256(ffmpeg) },
    { path: "runtime-pack/bin/ffprobe.exe", sha256: sha256(ffprobe) },
    { path: "THIRD_PARTY_NOTICES.txt", sha256: sha256(notices) },
  ];
  writeFileSync(join(root, "content-protection-manifest.json"), JSON.stringify({
    contractVersion: "content-protection.runtime.v1",
    runtimeId: "content-protection-windows-x64",
    version: "0.1.0",
    targetPlatform: "windows-x64",
    provider: "videoseal",
    providerVersion: "videoseal-1.0",
    videoSealCommit: "870ca7fb33578b90f14c602016b6c2788096226e",
    providerCommand: "provider/videoseal-provider.exe",
    modelPath: "ckpts/videoseal_y_256b_img.pth",
    requiresWorkerRuntimeVersion: "0.1.0",
    files,
    healthChecked: true,
    licenseNotice: "THIRD_PARTY_NOTICES.txt",
  }, null, 2));
  return root;
}

test("standalone runtime check accepts a valid Windows fixture", () => {
  const root = makeFixture("valid");
  try {
    const output = execFileSync(process.execPath, [script, "--check-only", "--bundle-root", root], { encoding: "utf8" });
    assert.match(output, /content protection runtime is ready/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("standalone runtime check rejects a missing provider executable", () => {
  const root = makeFixture("missing-provider");
  rmSync(join(root, "provider/videoseal-provider.exe"));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [script, "--check-only", "--bundle-root", root], { encoding: "utf8", stdio: "pipe" }),
      /provider executable is missing/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release script bundles Windows media tools in the optional runtime", () => {
  const source = readFileSync(script, "utf8");
  assert.match(source, /nodeRequire\("ffmpeg-static"\)/);
  assert.match(source, /nodeRequire\("ffprobe-static"\)\.path/);
  assert.match(source, /runtime-pack\/bin/);
  assert.match(source, /ffmpeg\.exe/);
  assert.match(source, /ffprobe\.exe/);
});
