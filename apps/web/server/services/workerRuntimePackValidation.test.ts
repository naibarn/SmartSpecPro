import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";

import { validateContentProtectionRuntimeArchive } from "./workerRuntimePackValidation";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("validateContentProtectionRuntimeArchive", () => {
  it("accepts the standalone Windows x64 contract", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-protection-validation-"));
    tempRoots.push(root);
    const zipPath = path.join(root, "runtime.zip");
    const model = Buffer.alloc(100 * 1024 * 1024, 7);
    const zip = new AdmZip();
    zip.addFile("provider/videoseal-provider.exe", Buffer.from("MZ-native-provider"));
    zip.addFile("ckpts/videoseal_y_256b_img.pth", model);
    zip.addFile("LICENSE.txt", Buffer.from("VideoSeal license"));
    const manifest = {
      contractVersion: "content-protection.runtime.v1",
      runtimeId: "content-protection-windows-x64",
      version: "0.1.411",
      targetPlatform: "windows-x64",
      provider: "videoseal",
      providerVersion: "videoseal-1.0",
      videoSealCommit: "870ca7fb33578b90f14c602016b6c2788096226e",
      providerCommand: "provider/videoseal-provider.exe",
      modelPath: "ckpts/videoseal_y_256b_img.pth",
      requiresWorkerRuntimeVersion: "0.1.411",
      files: [
        { path: "provider/videoseal-provider.exe", sha256: "a".repeat(64) },
        { path: "ckpts/videoseal_y_256b_img.pth", sha256: "b".repeat(64) },
        { path: "LICENSE.txt", sha256: "c".repeat(64) },
      ],
      healthChecked: true,
      licenseNotice: "LICENSE.txt",
    };
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    manifest.signature = crypto
      .sign(null, Buffer.from(JSON.stringify(manifest)), privateKey)
      .toString("base64");
    zip.addFile("content-protection-manifest.json", Buffer.from(JSON.stringify(manifest)));
    zip.writeZip(zipPath);

    const result = await validateContentProtectionRuntimeArchive({
      filePath: zipPath,
      fileName: "smart-ai-hub-content-protection-runtime-windows-x64-0.1.411.zip",
      version: "0.1.411",
      publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(result.valid).toBe(true);
  });

  it("rejects a provider path that escapes the archive root", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-protection-validation-"));
    tempRoots.push(root);
    const zipPath = path.join(root, "runtime.zip");
    const zip = new AdmZip();
    zip.addFile("provider/videoseal-provider.exe", Buffer.from("MZ"));
    zip.addFile("content-protection-manifest.json", Buffer.from(JSON.stringify({
      contractVersion: "content-protection.runtime.v1",
      runtimeId: "content-protection-windows-x64",
      version: "0.1.411",
      targetPlatform: "windows-x64",
      provider: "videoseal",
      providerVersion: "videoseal-1.0",
      providerCommand: "../videoseal-provider.exe",
      modelPath: "model.bin",
      healthChecked: true,
      files: [],
      licenseNotice: "LICENSE.txt",
    })));
    zip.writeZip(zipPath);

    const result = await validateContentProtectionRuntimeArchive({
      filePath: zipPath,
      fileName: "smart-ai-hub-content-protection-runtime-windows-x64-0.1.411.zip",
      version: "0.1.411",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.find((check) => check.id === "required_files")?.status).toBe("error");
  });
});
