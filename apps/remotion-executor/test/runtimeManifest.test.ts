import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { managedRuntimeDoctor } from "../src/doctor.js";

test("managed runtime doctor fails closed when the manifest is absent", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "smartaihub-runtime-manifest-"));
  const result = await managedRuntimeDoctor(root);
  assert.equal(result.status, "blocked");
  assert.match(result.checks[0]?.detail ?? "", /missing|invalid/i);
});

test("managed runtime doctor fails closed on an unsupported host", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "smartaihub-runtime-manifest-"));
  await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify({
    allowed: true,
    runtimeId: "remotion-executor-macos-arm64",
    runtimePlatform: "macos-arm64",
    architecture: "arm64",
    remotionPlatformContractVersion: "2026-08-04.2",
    nodePath: "../escape/node",
    browserPath: "browser",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    fontsPath: "fonts",
    sidecarPath: "remotion-sidecar/render.mjs",
    sidecarSha256: "a".repeat(64),
  }));
  const result = await managedRuntimeDoctor(root);
  assert.equal(result.status, "blocked");
  assert.ok(result.checks.some((check) => check.id === "runtime_manifest" && check.status === "error"));
});
