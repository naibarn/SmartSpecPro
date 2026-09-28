import assert from "node:assert/strict";
import test from "node:test";
import { remotionExecutorRuntimePackManifestSchema } from "./remotionExecutorRuntimePackSchema";
import { resolveHardwareAcceleration } from "./hardwareAcceleration";

const base = {
  runtimeId: "remotion-executor-macos-arm64",
  version: "1.2.3",
  runtimeKind: "standalone_remotion_executor",
  runtimePlatform: "macos",
  architecture: "arm64",
  allowed: true,
  archiveSignature: "signed",
  archiveSha256: "a".repeat(64),
};

test("runtime pack manifest accepts a signed supported platform", () => {
  assert.equal(remotionExecutorRuntimePackManifestSchema.safeParse(base).success, true);
});

test("runtime pack manifest rejects platform and architecture drift", () => {
  assert.equal(remotionExecutorRuntimePackManifestSchema.safeParse({ ...base, runtimePlatform: "windows" }).success, false);
  assert.equal(remotionExecutorRuntimePackManifestSchema.safeParse({ ...base, architecture: "x64" }).success, false);
});

test("allowed runtime pack requires a signature", () => {
  const { archiveSignature: _signature, ...unsigned } = base;
  assert.equal(remotionExecutorRuntimePackManifestSchema.safeParse(unsigned).success, false);
});

test("desktop render defaults to software encoding and requires explicit GPU opt-in", () => {
  assert.equal(resolveHardwareAcceleration({}), "disable");
  assert.equal(resolveHardwareAcceleration({ SMARTAIHUB_ENABLE_GPU_ENCODING: "0" }), "disable");
  assert.equal(resolveHardwareAcceleration({ SMARTAIHUB_ENABLE_GPU_ENCODING: "1" }), "if-possible");
});
