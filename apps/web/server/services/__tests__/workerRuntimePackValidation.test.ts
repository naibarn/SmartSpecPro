import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";

import {
  isOfficialRuntimePackManifest,
  requiredRuntimeArchiveFiles,
  validateRuntimePackArchive,
} from "../workerRuntimePackValidation";

const tempPaths: string[] = [];

function createManifest() {
  return {
    allowed: true,
    runtimeId: "hyperframes-wsl2",
    version: "2026.08.31.1",
    hyperframesVersion: "hyperframes@0.7.109; @hyperframes/producer@0.7.109",
    runtimePlatform: "wsl2-linux-x64",
    architecture: "x64",
    rendererKind: "hyperframes_cli_official",
    sidecarLauncher: "smart-ai-hub-hyperframes-node-launcher",
    sidecarScriptPath: "hyperframes-sidecar/render.mjs",
    sidecarSha256: "a".repeat(64),
    checksumFile: "SHA256SUMS",
    signatureFile: "SHA256SUMS.sig",
    transcription: {
      engine: "whisper.cpp",
      version: "1.9.3",
      binaryPath: "whisper/whisper-cli",
      binarySha256: "b".repeat(64),
      model: "large-v3",
      modelPath: "whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin",
      modelSha256: "c".repeat(64),
      modelUrl:
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
    },
  };
}

function makeArchive(
  manifest: Record<string, unknown>,
  signature?: string,
  checksumTextOverride?: string
) {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const zip = new AdmZip();
  zip.addFile(
    "runtime-pack/manifest.json",
    Buffer.from(JSON.stringify(manifest))
  );
  const transcription = manifest.transcription as Record<string, string>;
  zip.addFile(
    "runtime-pack/SHA256SUMS",
    Buffer.from(
      checksumTextOverride ??
        `${transcription.binarySha256}  runtime-pack/${transcription.binaryPath}\n${transcription.modelSha256}  runtime-pack/${transcription.modelPath}\n${manifest.sidecarSha256}  sidecars/hyperframes-render.exe\n`
    )
  );
  const checksumText =
    checksumTextOverride ??
    `${(manifest.transcription as Record<string, string>).binarySha256}  runtime-pack/${(manifest.transcription as Record<string, string>).binaryPath}\n${(manifest.transcription as Record<string, string>).modelSha256}  runtime-pack/${(manifest.transcription as Record<string, string>).modelPath}\n${manifest.sidecarSha256}  sidecars/hyperframes-render.exe\n`;
  const signatureText =
    signature ??
    crypto.sign(null, Buffer.from(checksumText), keyPair.privateKey).toString("base64");
  zip.deleteFile("runtime-pack/SHA256SUMS");
  zip.addFile("runtime-pack/SHA256SUMS", Buffer.from(checksumText));
  zip.addFile("runtime-pack/SHA256SUMS.sig", Buffer.from(signatureText));
  for (const file of requiredRuntimeArchiveFiles("hyperframes-wsl2")) {
    if (!zip.getEntry(file.replace(/\*$/, "fixture"))) {
      zip.addFile(file.replace(/\*$/, "fixture"), Buffer.from("fixture"));
    }
  }
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "worker-runtime-validation-test-")
  );
  const archivePath = path.join(
    directory,
    "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.08.31.1.zip"
  );
  zip.writeZip(archivePath);
  tempPaths.push(directory);
  return {
    archivePath,
    publicKey: keyPair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

afterEach(() => {
  for (const tempPath of tempPaths.splice(0))
    fs.rmSync(tempPath, { recursive: true, force: true });
});

describe("worker runtime pack validation", () => {
  it("accepts a complete official WSL2 archive", async () => {
    const manifest = createManifest();
    expect(isOfficialRuntimePackManifest(manifest, "hyperframes-wsl2")).toBe(
      true
    );
    const archive = makeArchive(manifest);
    const result = await validateRuntimePackArchive({
      filePath: archive.archivePath,
      fileName: path.basename(archive.archivePath),
      version: "2026.08.31.1",
      runtimeId: "hyperframes-wsl2",
      publicKey: archive.publicKey,
    });
    expect(result.valid).toBe(true);
    expect(result.checks.every(check => check.status === "ok")).toBe(true);
  });

  it("rejects placeholder signatures and missing transcription metadata", async () => {
    const manifest = createManifest();
    manifest.transcription = undefined;
    expect(isOfficialRuntimePackManifest(manifest, "hyperframes-wsl2")).toBe(
      false
    );
    const archive = makeArchive(
      createManifest(),
      "placeholder-signature-required-before-release"
    );
    const result = await validateRuntimePackArchive({
      filePath: archive.archivePath,
      fileName: path.basename(archive.archivePath),
      version: "2026.08.31.1",
      runtimeId: "hyperframes-wsl2",
      publicKey: archive.publicKey,
    });
    expect(result.valid).toBe(false);
    expect(result.checks.find(check => check.id === "signature")?.status).toBe(
      "error"
    );
  });

  it("rejects archives whose checksum file does not bind the manifest assets", async () => {
    const manifest = createManifest();
    const archive = makeArchive(
      manifest,
      undefined,
      "bad-checksum\n"
    );
    const result = await validateRuntimePackArchive({
      filePath: archive.archivePath,
      fileName: path.basename(archive.archivePath),
      version: "2026.08.31.1",
      runtimeId: "hyperframes-wsl2",
      publicKey: archive.publicKey,
    });
    expect(result.valid).toBe(false);
    expect(
      result.checks.find(check => check.id === "checksum_bindings")?.status
    ).toBe("error");
  });

  it("rejects a validly shaped signature from the wrong Ed25519 key", async () => {
    const archive = makeArchive(createManifest());
    const otherKey = crypto.generateKeyPairSync("ed25519");
    const result = await validateRuntimePackArchive({
      filePath: archive.archivePath,
      fileName: path.basename(archive.archivePath),
      version: "2026.08.31.1",
      runtimeId: "hyperframes-wsl2",
      publicKey: otherKey.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    expect(result.valid).toBe(false);
    expect(
      result.checks.find(check => check.id === "signature_verification")?.status
    ).toBe("error");
  });
});
