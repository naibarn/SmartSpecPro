import { describe, expect, it } from "vitest";

import {
  runnerReleaseAssetSchema,
  runnerReleaseIdentitySchema,
  runnerReleaseTargetKey,
} from "@shared/runnerReleases";

describe("Runner release catalog contract", () => {
  it("accepts the four native targets and the shared-container manifest", () => {
    expect(() => runnerReleaseIdentitySchema.parse({
      version: "0.2.0",
      platform: "windows",
      architecture: "x64",
      profile: "local_device",
      channel: "stable",
      assetKind: "package",
    })).not.toThrow();
    expect(() => runnerReleaseIdentitySchema.parse({
      version: "0.2.0",
      platform: "macos",
      architecture: "arm64",
      profile: "local_device",
      channel: "stable",
      assetKind: "update_binary",
    })).not.toThrow();
    expect(() => runnerReleaseIdentitySchema.parse({
      version: "0.2.0",
      platform: "container",
      architecture: "multi",
      profile: "shared_container",
      channel: "stable",
      assetKind: "manifest",
    })).not.toThrow();
  });

  it("rejects an incompatible native identity", () => {
    expect(() => runnerReleaseIdentitySchema.parse({
      version: "0.2.0",
      platform: "linux",
      architecture: "arm64",
      profile: "local_device",
      channel: "stable",
      assetKind: "package",
    })).toThrow();
  });

  it("keeps target grouping deterministic", () => {
    expect(runnerReleaseTargetKey({
      platform: "windows",
      architecture: "x64",
      profile: "local_device",
      channel: "stable",
    })).toBe("local_device:windows:x64:stable");
  });

  it("allows legacy-safe nullable signatures and exposes only SmartAIHub URLs", () => {
    const asset = runnerReleaseAssetSchema.parse({
      id: 1,
      version: "0.2.0",
      platform: "linux",
      architecture: "x64",
      profile: "local_device",
      channel: "stable",
      assetKind: "package",
      fileName: "runner.tar.gz",
      contentType: "application/gzip",
      fileSizeBytes: 12,
      fileSha256: "a".repeat(64),
      signature: null,
      contractVersion: "sah-runner-v1",
      manifest: null,
      validationStatus: "valid",
      validationChecks: [{ id: "sha256", status: "ok", message: "ok" }],
      provenance: { sourceCommit: "abc", workflowRunId: null, releaseTag: null, signatureAlgorithm: null },
      releaseNotes: null,
      isPublished: true,
      publishedAt: "2026-09-18T00:00:00.000Z",
      withdrawnAt: null,
      uploadedAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
      downloadUrl: "/api/runner-releases/1/download",
    });
    expect(asset.signature).toBeNull();
    expect(asset.downloadUrl).not.toContain("github");
  });
});
