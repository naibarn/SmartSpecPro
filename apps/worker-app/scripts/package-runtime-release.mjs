#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appRoot, "../..");
const defaultOutputDir = resolve(repoRoot, "apps/web/client/public/releases/runtime");

function argValue(name) {
  const prefix = `${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function requiredPath(name) {
  const value = argValue(name);
  if (!value) throw new Error(`${name} is required`);
  const absolute = resolve(value);
  if (!existsSync(absolute)) throw new Error(`${name} does not exist: ${absolute}`);
  return absolute;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkFiles(root, prefix = "") {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

function copyFileInto(path, targetDir, targetName = basename(path)) {
  mkdirSync(targetDir, { recursive: true });
  cpSync(path, join(targetDir, targetName));
}

function createZipArchive(archivePath, sourceRoot) {
  try {
    execFileSync("zip", ["-qr", archivePath, "."], {
      cwd: sourceRoot,
      stdio: "inherit",
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[worker-app] zip command unavailable, falling back to python zipfile: ${message}`);
  }

  execFileSync("python3", [
    "-c",
    [
      "import os, sys, zipfile",
      "from pathlib import Path",
      "archive_path = Path(sys.argv[1])",
      "source_root = Path(sys.argv[2])",
      "with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:",
      "    for root, _, files in os.walk(source_root):",
      "        for file in files:",
      "            full_path = Path(root) / file",
      "            arcname = full_path.relative_to(source_root).as_posix()",
      "            zf.write(full_path, arcname)",
    ].join("\n"),
    archivePath,
    sourceRoot,
  ], {
    stdio: "inherit",
  });
}

const runtimeVersion = argValue("--runtime-version");
if (!runtimeVersion) throw new Error("--runtime-version is required, e.g. 2026.06.23.1");

const hyperframesSidecar = requiredPath("--hyperframes-sidecar");
const browserDir = requiredPath("--browser-dir");
const ffmpeg = requiredPath("--ffmpeg");
const ffprobe = requiredPath("--ffprobe");
const thaiFontsDir = requiredPath("--thai-fonts-dir");
const notices = requiredPath("--notices");
const signatureFile = requiredPath("--signature-file");
const outputDir = resolve(argValue("--output-dir") || defaultOutputDir);
const hyperframesVersion = argValue("--hyperframes-version") || "official";
const browserVersion = argValue("--browser-version") || "managed";
const ffmpegVersion = argValue("--ffmpeg-version") || "managed";
const ffprobeVersion = argValue("--ffprobe-version") || ffmpegVersion;
const thaiFontFamily = argValue("--thai-font-family") || "Noto Sans Thai";

mkdirSync(outputDir, { recursive: true });

const stagingRoot = resolve(appRoot, ".runtime-release-staging");
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(join(stagingRoot, "sidecars"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/bin"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/browser"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/fonts"), { recursive: true });

copyFileInto(hyperframesSidecar, join(stagingRoot, "sidecars"), "hyperframes-render.exe");
cpSync(browserDir, join(stagingRoot, "runtime-pack/browser"), { recursive: true });
copyFileInto(ffmpeg, join(stagingRoot, "runtime-pack/bin"), "ffmpeg.exe");
copyFileInto(ffprobe, join(stagingRoot, "runtime-pack/bin"), "ffprobe.exe");
cpSync(thaiFontsDir, join(stagingRoot, "runtime-pack/fonts"), { recursive: true });
copyFileInto(notices, join(stagingRoot, "runtime-pack"), "THIRD_PARTY_NOTICES.txt");
copyFileInto(signatureFile, join(stagingRoot, "runtime-pack"), "SHA256SUMS.sig");

const sidecarSha256 = sha256File(join(stagingRoot, "sidecars/hyperframes-render.exe"));
const checksumLines = walkFiles(stagingRoot)
  .filter((file) => file !== "runtime-pack/SHA256SUMS")
  .map((file) => `${sha256File(join(stagingRoot, file))}  ${file}`)
  .join("\n");
writeFileSync(join(stagingRoot, "runtime-pack/SHA256SUMS"), `${checksumLines}\n`);
const runtimeProfileHash = createHash("sha256").update(checksumLines).digest("hex");

const manifest = {
  runtimeId: "hyperframes-windows-x64",
  version: runtimeVersion,
  hyperframesVersion,
  browserVersion,
  ffmpegVersion,
  ffprobeVersion,
  thaiFontFamily,
  sidecarPath: "hyperframes-render.exe",
  sidecarSha256,
  checksumFile: "SHA256SUMS",
  signatureFile: "SHA256SUMS.sig",
  licenseNotices: ["THIRD_PARTY_NOTICES.txt"],
  supportedContractVersions: ["2026-06-22"],
  runtimeProfileHash,
  allowed: true,
  denyReason: null,
  rollbackToVersion: null,
};
writeFileSync(join(stagingRoot, "runtime-pack/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const archiveName = `smart-ai-hub-worker-runtime-hyperframes-windows-x64-${runtimeVersion}.zip`;
const archivePath = join(outputDir, archiveName);
rmSync(archivePath, { force: true });
createZipArchive(archivePath, stagingRoot);
const archiveStat = statSync(archivePath);
const archiveSha256 = sha256File(archivePath);
writeFileSync(
  `${archivePath}.manifest.json`,
  `${JSON.stringify({ ...manifest, archiveFileName: archiveName, archiveSha256, archiveSizeBytes: archiveStat.size }, null, 2)}\n`,
);

console.log(`[worker-app] runtime release written: ${archivePath}`);
