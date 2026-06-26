#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
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
const liveOutputDir = resolve(repoRoot, "apps/web/dist/public/releases/runtime");

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

function bufferIncludes(buffer, text) {
  return buffer.includes(Buffer.from(text, "utf8"));
}

function assertNotMockSidecar(path) {
  const sidecarBytes = readFileSync(path);
  const blockedMarkers = [
    "placeholder sidecar",
    "mock video content",
    "mock-hyperframes",
    "testsrc2=",
    "testsrc=size=",
    "lavfi",
    "local_smoke_snapshot",
    "diagnostic_ffmpeg_smoke",
  ];
  const matchedMarker = blockedMarkers.find((marker) => bufferIncludes(sidecarBytes, marker));
  if (matchedMarker) {
    throw new Error(
      `Cannot package a mock, placeholder, or diagnostic smoke sidecar (${matchedMarker}). Provide the actual hyperframes-render.exe binary for --hyperframes-sidecar. (Got: ${path})`,
    );
  }
}

function assertWindowsExecutable(path, label) {
  const bytes = readFileSync(path);
  if (bytes.length < 2 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error(`${label} must be a Windows executable (MZ/PE): ${path}`);
  }
}

function requirePackageVersion(packageJsonPath, expectedName) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (packageJson.name !== expectedName) {
    throw new Error(`Expected ${expectedName} package at ${packageJsonPath}, found ${packageJson.name}`);
  }
  if (!packageJson.version) {
    throw new Error(`${expectedName} package has no version`);
  }
  return packageJson.version;
}

function findFile(root, predicate) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(absolute, predicate);
      if (nested) return nested;
    } else if (entry.isFile() && predicate(entry.name, absolute)) {
      return absolute;
    }
  }
  return null;
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

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveRuntimeOutputDirs(primaryOutputDir, usedDefaultOutputDir) {
  const dirs = [primaryOutputDir];
  if (usedDefaultOutputDir && existsSync(resolve(repoRoot, "apps/web/dist/public"))) {
    dirs.push(liveOutputDir);
  }
  return Array.from(new Set(dirs));
}

function findFileName(root, predicate) {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileName(absolute, predicate);
      if (nested) return nested;
    } else if (entry.isFile() && predicate(entry.name, absolute)) {
      return absolute;
    }
  }
  return null;
}

function assertWsl2SharpRuntime(root) {
  const requiredPackages = [
    "sharp",
    "@img/sharp-linux-x64",
    "@img/sharp-libvips-linux-x64",
  ];
  const missingPackages = requiredPackages.filter(
    (packageName) => !existsSync(join(root, "node_modules", packageName, "package.json")),
  );
  const sharpBinding = findFileName(
    join(root, "node_modules/@img/sharp-linux-x64/lib"),
    (name) => name.startsWith("sharp-linux-x64") && name.endsWith(".node"),
  );
  const libvipsBinary = findFileName(
    join(root, "node_modules/@img/sharp-libvips-linux-x64/lib"),
    (name) => name.startsWith("libvips-cpp.so."),
  );

  if (missingPackages.length > 0 || !sharpBinding || !libvipsBinary) {
    throw new Error(
      [
        "WSL2 runtime pack is missing Linux x64 sharp native dependencies.",
        ...missingPackages.map((packageName) => `- missing package: ${packageName}`),
        ...(!sharpBinding ? ["- missing native binary: node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64*.node"] : []),
        ...(!libvipsBinary ? ["- missing native binary: node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*"] : []),
      ].join("\n"),
    );
  }
}

const BROWSER_SHARED_LIBRARY_EXCLUDE = new Set([
  "ld-linux-x86-64.so.2",
  "libc.so.6",
  "libdl.so.2",
  "libm.so.6",
  "libpthread.so.0",
  "librt.so.1",
]);

function bundleBrowserSharedLibraries(browserPath, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  const output = execFileSync("ldd", [browserPath], { encoding: "utf8" });
  const copied = new Set();
  const missing = [];

  for (const line of output.split(/\r?\n/)) {
    if (line.includes("not found")) {
      missing.push(line.trim());
      continue;
    }
    const match = line.match(/=>\s+(\/\S+)/) ?? line.match(/^\s*(\/\S+)/);
    const libraryPath = match?.[1];
    if (!libraryPath || !existsSync(libraryPath)) continue;
    const libraryName = basename(libraryPath);
    if (BROWSER_SHARED_LIBRARY_EXCLUDE.has(libraryName)) continue;
    if (copied.has(libraryName)) continue;
    const realLibraryPath = realpathSync(libraryPath);
    if (!statSync(realLibraryPath).isFile()) continue;
    copyFileSync(realLibraryPath, join(targetDir, libraryName));
    copied.add(libraryName);
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Bundled browser has unresolved shared libraries on this packaging host.",
        ...missing.map((line) => `- ${line}`),
      ].join("\n"),
    );
  }
  if (!copied.has("libnspr4.so") || !copied.has("libnss3.so")) {
    throw new Error("Browser shared-library bundle is missing NSS/NSPR libraries.");
  }
  console.log(`[worker-app] Bundled ${copied.size} Linux browser shared libraries for WSL2 runtime.`);
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
const targetRuntime = argValue("--target-runtime") || "hyperframes-wsl2";
if (!["hyperframes-wsl2", "hyperframes-windows-x64"].includes(targetRuntime)) {
  throw new Error(`Unsupported --target-runtime: ${targetRuntime}`);
}
const isWsl2Runtime = targetRuntime === "hyperframes-wsl2";

const hyperframesSidecar = requiredPath("--hyperframes-sidecar");
assertNotMockSidecar(hyperframesSidecar);
assertWindowsExecutable(hyperframesSidecar, "HyperFrames launcher sidecar");

const nodeDir = requiredPath("--node-dir");
const nodeBinary = isWsl2Runtime ? join(nodeDir, "bin/node") : join(nodeDir, "node.exe");
if (!existsSync(nodeBinary)) throw new Error(`--node-dir must contain ${isWsl2Runtime ? "bin/node" : "node.exe"}: ${nodeBinary}`);
if (!isWsl2Runtime) assertWindowsExecutable(nodeBinary, "Bundled Node runtime");
const hyperframesDir = requiredPath("--hyperframes-dir");
const hyperframesCli = join(hyperframesDir, "node_modules/hyperframes/dist/cli.js");
const hyperframesPackagePath = join(hyperframesDir, "node_modules/hyperframes/package.json");
if (!existsSync(hyperframesCli)) {
  throw new Error(`--hyperframes-dir must contain official hyperframes CLI: ${hyperframesCli}`);
}
const bundledHyperframesVersion = requirePackageVersion(hyperframesPackagePath, "hyperframes");
const producerPackagePath = join(hyperframesDir, "node_modules/@hyperframes/producer/package.json");
const bundledProducerVersion = requirePackageVersion(producerPackagePath, "@hyperframes/producer");
const hyperframesSidecarScript = requiredPath("--hyperframes-sidecar-script");
const browserDir = requiredPath("--browser-dir");
const browserExe = findFile(browserDir, (name) => {
  const lower = name.toLowerCase();
  return isWsl2Runtime
    ? ["chrome", "headless_shell", "chrome-headless-shell"].includes(lower)
    : ["chrome.exe", "headless_shell.exe"].includes(lower);
});
if (!browserExe) {
  throw new Error(
    `--browser-dir must contain ${isWsl2Runtime ? "Linux chrome/headless_shell" : "Chrome for Testing win64 chrome.exe or headless_shell.exe"}: ${browserDir}`,
  );
}
if (!isWsl2Runtime) assertWindowsExecutable(browserExe, "Chrome browser runtime");
const ffmpeg = requiredPath("--ffmpeg");
const ffprobe = requiredPath("--ffprobe");
if (!isWsl2Runtime) {
  assertWindowsExecutable(ffmpeg, "FFmpeg");
  assertWindowsExecutable(ffprobe, "ffprobe");
}
const thaiFontsDir = requiredPath("--thai-fonts-dir");
const notices = requiredPath("--notices");
const signatureFile = requiredPath("--signature-file");
const outputDir = resolve(argValue("--output-dir") || defaultOutputDir);
const hyperframesVersion = argValue("--hyperframes-version") || "official";
const browserVersion = argValue("--browser-version") || "managed";
const ffmpegVersion = argValue("--ffmpeg-version") || "managed";
const ffprobeVersion = argValue("--ffprobe-version") || ffmpegVersion;
const thaiFontFamily = argValue("--thai-font-family") || "Noto Sans Thai";
const usedDefaultOutputDir = !argValue("--output-dir");

mkdirSync(outputDir, { recursive: true });

const stagingRoot = resolve(appRoot, ".runtime-release-staging");
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(join(stagingRoot, "sidecars"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/bin"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/browser"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/browser-libs"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/fonts"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/node"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/hyperframes"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/hyperframes-sidecar"), { recursive: true });

copyFileInto(hyperframesSidecar, join(stagingRoot, "sidecars"), "hyperframes-render.exe");
cpSync(nodeDir, join(stagingRoot, "runtime-pack/node"), { recursive: true });
cpSync(hyperframesDir, join(stagingRoot, "runtime-pack/hyperframes"), { recursive: true });
rmSync(join(stagingRoot, "runtime-pack/hyperframes/node_modules/.bin"), { recursive: true, force: true });
if (isWsl2Runtime) {
  const sharpPackagePath = join(stagingRoot, "runtime-pack/hyperframes/node_modules/sharp/package.json");
  const sharpPackage = existsSync(sharpPackagePath) ? readJsonFile(sharpPackagePath) : null;
  const sharpVersion = sharpPackage?.version || "";
  const libvipsVersion = sharpPackage?.optionalDependencies?.["@img/sharp-libvips-linux-x64"] || "";
  const sharpPackages = [
    sharpVersion ? `sharp@${sharpVersion}` : "sharp",
    sharpVersion ? `@img/sharp-linux-x64@${sharpVersion}` : "@img/sharp-linux-x64",
    libvipsVersion
      ? `@img/sharp-libvips-linux-x64@${libvipsVersion}`
      : "@img/sharp-libvips-linux-x64",
  ];
  console.log("[worker-app] Installing linux-x64 native module bindings for WSL2 runtime...");
  execFileSync("npm", [
    "install",
    "--include=optional",
    "--os=linux",
    "--cpu=x64",
    ...sharpPackages,
  ], {
    cwd: join(stagingRoot, "runtime-pack/hyperframes"),
    stdio: "inherit",
  });
  assertWsl2SharpRuntime(join(stagingRoot, "runtime-pack/hyperframes"));
}
copyFileInto(hyperframesSidecarScript, join(stagingRoot, "runtime-pack/hyperframes-sidecar"), "render.mjs");
cpSync(browserDir, join(stagingRoot, "runtime-pack/browser"), { recursive: true });
if (isWsl2Runtime) {
  bundleBrowserSharedLibraries(browserExe, join(stagingRoot, "runtime-pack/browser-libs"));
}
copyFileInto(ffmpeg, join(stagingRoot, "runtime-pack/bin"), isWsl2Runtime ? "ffmpeg" : "ffmpeg.exe");
copyFileInto(ffprobe, join(stagingRoot, "runtime-pack/bin"), isWsl2Runtime ? "ffprobe" : "ffprobe.exe");
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
  runtimeId: targetRuntime,
  version: runtimeVersion,
  hyperframesVersion: hyperframesVersion === "official"
    ? `hyperframes@${bundledHyperframesVersion}; @hyperframes/producer@${bundledProducerVersion}`
    : hyperframesVersion,
  browserVersion,
  ffmpegVersion,
  ffprobeVersion,
  thaiFontFamily,
  sidecarPath: "hyperframes-render.exe",
  sidecarSha256,
  checksumFile: "SHA256SUMS",
  signatureFile: "SHA256SUMS.sig",
  licenseNotices: ["THIRD_PARTY_NOTICES.txt"],
  runtimePlatform: isWsl2Runtime ? "wsl2-linux-x64" : "windows-x64",
  nodeVersion: isWsl2Runtime ? "bundled-node-linux-x64" : "bundled-node-win-x64",
  rendererKind: "hyperframes_cli_official",
  sidecarLauncher: "smart-ai-hub-hyperframes-node-launcher",
  sidecarScriptPath: "hyperframes-sidecar/render.mjs",
  supportedContractVersions: ["2026-06-22"],
  runtimeProfileHash,
  allowed: true,
  denyReason: null,
  rollbackToVersion: null,
};
writeFileSync(join(stagingRoot, "runtime-pack/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const archiveName = `smart-ai-hub-worker-runtime-${targetRuntime}-${runtimeVersion}.zip`;
const archivePath = join(outputDir, archiveName);
rmSync(archivePath, { force: true });
const archiveEntries = walkFiles(stagingRoot);
createZipArchive(archivePath, stagingRoot);
const archiveStat = statSync(archivePath);
const archiveSha256 = sha256File(archivePath);
writeFileSync(
  `${archivePath}.manifest.json`,
  `${JSON.stringify({ ...manifest, archiveFileName: archiveName, archiveSha256, archiveSizeBytes: archiveStat.size, archiveEntries }, null, 2)}\n`,
);

console.log(`[worker-app] runtime release written: ${archivePath}`);
for (const mirrorOutputDir of resolveRuntimeOutputDirs(outputDir, usedDefaultOutputDir).filter((dir) => dir !== outputDir)) {
  mkdirSync(mirrorOutputDir, { recursive: true });
  copyFileSync(archivePath, join(mirrorOutputDir, archiveName));
  copyFileSync(`${archivePath}.manifest.json`, join(mirrorOutputDir, `${archiveName}.manifest.json`));
  console.log(`[worker-app] updated live runtime release: ${join(mirrorOutputDir, archiveName)}`);
}
