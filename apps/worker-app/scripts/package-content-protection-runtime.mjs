#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const repoRoot = resolve(appDir, "../..");
const prepareScript = join(appDir, "scripts/prepare-content-protection-runtime.mjs");
const packageJsonPath = join(appDir, "package.json");
const stagingRoot = join(appDir, ".content-protection-build/generated");
const defaultOutputDir = join(appDir, ".content-protection-release");
const runtimeId = "content-protection-windows-x64";
const modelMinimumBytes = 100 * 1024 * 1024;
const videoSealCommit = "870ca7fb33578b90f14c602016b6c2788096226e";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check-only");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function signManifest(manifest) {
  const privateKeySource = process.env.CONTENT_PROTECTION_RUNTIME_SIGNING_PRIVATE_KEY ||
    process.env.SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY || "";
  if (!privateKeySource.trim()) {
    throw new Error("A real Ed25519 signing key is required for Content Protection runtime release.");
  }
  const privateKey = createPrivateKey(privateKeySource);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Content Protection runtime signing key must be Ed25519.");
  }
  return sign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString("base64");
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !value.startsWith("/") && !value.includes("\\") &&
    !value.split("/").includes("..") && value !== ".";
}

function walkFiles(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) return walkFiles(root, absolute);
    if (!entry.isFile()) return [];
    return [relative(root, absolute).replaceAll("\\", "/")];
  }).sort();
}

function assertStandaloneBundle(bundleRoot, expectedVersion = null) {
  const manifestPath = join(bundleRoot, "content-protection-manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Content Protection manifest is missing: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  if (manifest.contractVersion !== "content-protection.runtime.v1") {
    throw new Error("Content Protection runtime contract version is invalid");
  }
  if (manifest.runtimeId !== runtimeId || manifest.targetPlatform !== "windows-x64") {
    throw new Error("Content Protection runtime must target Windows x64");
  }
  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(`Runtime version ${manifest.version} does not match ${expectedVersion}`);
  }
  if (manifest.provider !== "videoseal" || manifest.providerVersion !== "videoseal-1.0") {
    throw new Error("Content Protection provider identity is invalid");
  }
  if (manifest.videoSealCommit !== videoSealCommit) {
    throw new Error(`Unexpected VideoSeal revision in bundle: ${manifest.videoSealCommit}`);
  }
  if (manifest.healthChecked !== true) throw new Error("Content Protection bundle was not health-checked");
  if (!safeRelativePath(manifest.providerCommand) || !manifest.providerCommand.endsWith(".exe")) {
    throw new Error("Content Protection provider command must be a safe Windows executable path");
  }
  if (!safeRelativePath(manifest.modelPath)) throw new Error("Content Protection model path is invalid");
  const providerPath = join(bundleRoot, manifest.providerCommand);
  const modelPath = join(bundleRoot, manifest.modelPath);
  if (!existsSync(providerPath)) throw new Error(`Content Protection provider executable is missing: ${providerPath}`);
  if (readFileSync(providerPath).subarray(0, 2).toString("ascii") !== "MZ") {
    throw new Error("Content Protection provider is not a Windows PE executable");
  }
  if (!existsSync(modelPath) || statSync(modelPath).size < modelMinimumBytes) {
    throw new Error(`Content Protection model is missing or too small: ${modelPath}`);
  }
  if (!safeRelativePath(manifest.licenseNotice) || !existsSync(join(bundleRoot, manifest.licenseNotice))) {
    throw new Error("Content Protection license notice is missing");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Content Protection manifest must bind its payload files");
  }
  for (const file of manifest.files) {
    if (!file || !safeRelativePath(file.path) || !/^[a-f0-9]{64}$/i.test(file.sha256)) {
      throw new Error("Content Protection file checksum entry is invalid");
    }
    const filePath = join(bundleRoot, file.path);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error(`Bound file is missing: ${file.path}`);
    if (sha256File(filePath) !== file.sha256.toLowerCase()) throw new Error(`Bound file checksum mismatch: ${file.path}`);
  }
  return manifest;
}

function zipDirectory(sourceRoot, archivePath) {
  const python = process.env.CONTENT_PROTECTION_BUILD_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const code = [
    "import os, sys, zipfile",
    "root, output = sys.argv[1], sys.argv[2]",
    "with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:",
    "    for current, dirs, files in os.walk(root):",
    "        dirs.sort(); files.sort()",
    "        for name in files:",
    "            path = os.path.join(current, name)",
    "            archive.write(path, os.path.relpath(path, root).replace(os.sep, '/'))",
  ].join("\n");
  execFileSync(python, ["-c", code, sourceRoot, archivePath], { cwd: repoRoot, stdio: "inherit" });
}

if (checkOnly) {
  const bundleRoot = resolve(argValue("--bundle-root") || stagingRoot);
  const manifest = assertStandaloneBundle(bundleRoot, argValue("--version"));
  console.log(`[worker-app] content protection runtime is ready: ${manifest.version}`);
  process.exit(0);
}

if (process.platform !== "win32") {
  throw new Error("Content Protection runtime release must be built on a Windows x64 host; use --check-only for fixture validation.");
}

const packageJson = readJson(packageJsonPath);
const version = argValue("--version") || packageJson.version;
const outputDir = resolve(argValue("--output-dir") || defaultOutputDir);
rmSync(stagingRoot, { recursive: true, force: true });
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

execFileSync(process.execPath, [prepareScript], {
  cwd: appDir,
  env: {
    ...process.env,
    CONTENT_PROTECTION_TARGET: "windows-x64",
    CONTENT_PROTECTION_OUTPUT_ROOT: stagingRoot,
  },
  stdio: "inherit",
});

const existingManifest = readJson(join(stagingRoot, "content-protection-manifest.json"));
const payloadFiles = walkFiles(stagingRoot).filter(file => file !== "content-protection-manifest.json");
const manifest = {
  ...existingManifest,
  contractVersion: "content-protection.runtime.v1",
  runtimeId,
  version,
  targetPlatform: "windows-x64",
  requiresWorkerRuntimeVersion: process.env.CONTENT_PROTECTION_MIN_WORKER_VERSION || packageJson.version,
  files: payloadFiles.map(file => ({ path: file, sha256: sha256File(join(stagingRoot, file)) })),
};
manifest.signature = signManifest(manifest);
writeFileSync(join(stagingRoot, "content-protection-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
assertStandaloneBundle(stagingRoot, version);

const archivePath = join(outputDir, `smart-ai-hub-content-protection-runtime-windows-x64-${version}.zip`);
zipDirectory(stagingRoot, archivePath);
const archiveSha256 = sha256File(archivePath);
const releaseManifest = {
  runtimeId,
  version,
  platform: "windows",
  architecture: "x64",
  fileName: relative(repoRoot, archivePath).replaceAll("\\", "/"),
  archiveSha256,
  archiveSizeBytes: statSync(archivePath).size,
  manifest,
  signature: manifest.signature,
};
writeFileSync(
  join(outputDir, `smart-ai-hub-content-protection-runtime-windows-x64-${version}.manifest.json`),
  `${JSON.stringify(releaseManifest, null, 2)}\n`,
);
cpSync(join(stagingRoot, "content-protection-manifest.json"), join(outputDir, "content-protection-manifest.json"));
console.log(`[worker-app] created optional Content Protection runtime: ${archivePath}`);
console.log(`[worker-app] archive sha256: ${archiveSha256}`);
