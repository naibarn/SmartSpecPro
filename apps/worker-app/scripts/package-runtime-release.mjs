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

function assertMacArm64Executable(path, label) {
  let description;
  try {
    description = execFileSync("file", [path], { encoding: "utf8" }).toLowerCase();
  } catch (error) {
    throw new Error(`${label} could not be inspected with file(1): ${path} (${error})`);
  }
  if (!description.includes("mach-o")) {
    throw new Error(`${label} must be a native Mach-O executable for macOS: ${path}`);
  }
  if (!description.includes("arm64") && !description.includes("aarch64")) {
    throw new Error(`${label} must contain an arm64 slice for Apple Silicon: ${description.trim()}`);
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

function assertRemotionSidecarContract(remotionSidecarDir) {
  const sourcePackagePath = resolve(repoRoot, "packages/remotion-render/package.json");
  const sourceSchemaPath = resolve(
    repoRoot,
    "packages/remotion-render/src/remotionRenderVideoSchema.ts",
  );
  const installedPackagePath = join(
    remotionSidecarDir,
    "node_modules/@smartspec/remotion-render/package.json",
  );
  const installedSchemaPath = join(
    remotionSidecarDir,
    "node_modules/@smartspec/remotion-render/dist/remotionRenderVideoSchema.js",
  );
  const sourcePackage = readJsonFile(sourcePackagePath);
  const installedPackage = readJsonFile(installedPackagePath);
  if (sourcePackage.version !== installedPackage.version) {
    throw new Error(
      `Remotion sidecar package drift: source is @smartspec/remotion-render@${sourcePackage.version}, installed sidecar is @smartspec/remotion-render@${installedPackage.version}. Rebuild and install the sidecar package before release.`,
    );
  }

  const extractContractVersion = (filePath, label) => {
    const text = readFileSync(filePath, "utf8");
    const match = text.match(
      /REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION\s*=\s*["']([^"']+)["']/,
    );
    if (!match) throw new Error(`Unable to read Remotion contract version from ${label}: ${filePath}`);
    return match[1];
  };
  const sourceContractVersion = extractContractVersion(sourceSchemaPath, "source");
  const installedContractVersion = extractContractVersion(installedSchemaPath, "installed sidecar");
  if (sourceContractVersion !== installedContractVersion) {
    throw new Error(
      `Remotion sidecar contract drift: source is ${sourceContractVersion}, installed sidecar is ${installedContractVersion}. Rebuild and install the sidecar package before release.`,
    );
  }
  console.log(
    `[worker-app] Remotion sidecar contract verified: @smartspec/remotion-render@${installedPackage.version} / ${installedContractVersion}`,
  );
  return {
    packageVersion: installedPackage.version,
    platformContractVersion: installedContractVersion,
  };
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

function assertMacSharpRuntime(root) {
  const requiredPackages = [
    "sharp",
    "@img/sharp-darwin-arm64",
    "@img/sharp-libvips-darwin-arm64",
  ];
  const missingPackages = requiredPackages.filter(
    (packageName) => !existsSync(join(root, "node_modules", packageName, "package.json")),
  );
  const sharpBinding = findFileName(
    join(root, "node_modules/@img/sharp-darwin-arm64/lib"),
    (name) => name.startsWith("sharp-darwin-arm64") && name.endsWith(".node"),
  );
  const libvipsBinary = findFileName(
    join(root, "node_modules/@img/sharp-libvips-darwin-arm64/lib"),
    (name) => name.startsWith("libvips-cpp.") && (name.endsWith(".dylib") || name.includes(".dylib.")),
  );
  if (missingPackages.length > 0 || !sharpBinding || !libvipsBinary) {
    throw new Error(
      [
        "macOS arm64 runtime pack is missing native sharp dependencies.",
        ...missingPackages.map((packageName) => `- missing package: ${packageName}`),
        ...(!sharpBinding ? ["- missing native binary: node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64*.node"] : []),
        ...(!libvipsBinary ? ["- missing native binary: node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp*.dylib"] : []),
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

  // Field incident 2026-07-30 (Lane B smoke render, job failed
  // `bundle_failed: spawn .../@esbuild/linux-x64/bin/esbuild EACCES`):
  // `ZipFile.write()` stores a default mode and DROPS the Unix permission
  // bits, so every executable in the pack (esbuild, node, ffmpeg, ffprobe,
  // chrome, .so loaders…) arrives on the worker without its +x bit. The
  // real `zip` binary preserves them, which is why this only ever breaks on
  // build hosts where `zip` is missing — a silent, build-clean,
  // run-time-fatal difference between two supposedly equivalent code paths.
  // Carry st_mode through `external_attr` (high 16 bits) so both paths
  // produce an identical archive. Symlinks are materialised as regular
  // files by `zf.write`, matching `zip` without `-y`.
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
      "            st = full_path.lstat()",
      "            info = zipfile.ZipInfo.from_file(full_path, arcname)",
      "            info.external_attr = (st.st_mode & 0xFFFF) << 16",
      "            info.compress_type = zipfile.ZIP_DEFLATED",
      "            with open(full_path, 'rb') as src:",
      "                zf.writestr(info, src.read())",
    ].join("\n"),
    archivePath,
    sourceRoot,
  ], {
    stdio: "inherit",
  });
}

if (process.argv.includes("--help")) {
  console.log(`Worker App runtime packager

Required arguments:
  --runtime-version VERSION
  --target-runtime hyperframes-wsl2|hyperframes-windows-x64|hyperframes-macos-arm64
  --hyperframes-sidecar PATH
  --node-dir PATH
  --hyperframes-dir PATH
  --hyperframes-sidecar-script PATH
  --browser-dir PATH
  --ffmpeg PATH
  --ffprobe PATH
  --thai-fonts-dir PATH
  --notices PATH
  --signature-file PATH

Mac full-render arguments:
  --remotion-sidecar-script PATH
  --remotion-sidecar-dir PATH`);
  process.exit(0);
}

const runtimeVersion = argValue("--runtime-version");
if (!runtimeVersion) throw new Error("--runtime-version is required, e.g. 2026.06.23.1");
const targetRuntime = argValue("--target-runtime") || "hyperframes-wsl2";
if (!["hyperframes-wsl2", "hyperframes-windows-x64", "hyperframes-macos-arm64"].includes(targetRuntime)) {
  throw new Error(`Unsupported --target-runtime: ${targetRuntime}`);
}
const isWsl2Runtime = targetRuntime === "hyperframes-wsl2";
const isMacRuntime = targetRuntime === "hyperframes-macos-arm64";
if (isMacRuntime && (process.platform !== "darwin" || process.arch !== "arm64")) {
  throw new Error("hyperframes-macos-arm64 runtime packaging must run on an Apple Silicon macOS host");
}
if (isMacRuntime && (!argValue("--remotion-sidecar-script") || !argValue("--remotion-sidecar-dir"))) {
  throw new Error(
    "hyperframes-macos-arm64 runtime packaging requires the native Remotion sidecar script and installed dependency tree",
  );
}

const hyperframesSidecar = requiredPath("--hyperframes-sidecar");
assertNotMockSidecar(hyperframesSidecar);
if (isMacRuntime) {
  assertMacArm64Executable(hyperframesSidecar, "HyperFrames launcher sidecar");
} else if (!isWsl2Runtime) {
  assertWindowsExecutable(hyperframesSidecar, "HyperFrames launcher sidecar");
}

const nodeDir = requiredPath("--node-dir");
const nodeBinary = isWsl2Runtime || isMacRuntime ? join(nodeDir, "bin/node") : join(nodeDir, "node.exe");
if (!existsSync(nodeBinary)) throw new Error(`--node-dir must contain ${isWsl2Runtime || isMacRuntime ? "bin/node" : "node.exe"}: ${nodeBinary}`);
if (isMacRuntime) assertMacArm64Executable(nodeBinary, "Bundled Node runtime");
if (!isWsl2Runtime && !isMacRuntime) assertWindowsExecutable(nodeBinary, "Bundled Node runtime");
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
// Remotion sidecar (planning/worker-app-remotion-render-video/plan.md P1).
// Optional so existing release invocations that predate the Remotion lane
// keep working unchanged — when omitted the pack simply ships without
// `runtime-pack/remotion-sidecar/`, and the Rust executor's own
// missing-sidecar guard reports a clean failure instead of a crash.
// Tracked source of truth: apps/worker-app/runtime-sidecar-remotion/render.mjs
// (runtime-pack/ itself is gitignored — .gitignore:273).
const remotionSidecarScript = argValue("--remotion-sidecar-script")
  ? requiredPath("--remotion-sidecar-script")
  : "";
// The Remotion sidecar's INSTALLED dependency tree (`node_modules` holding
// @smartspec/remotion-render + @remotion/bundler + @remotion/renderer).
// Shipping render.mjs without this produces a pack that fails at first
// import on a real worker — exactly the class of break
// `assertReleaseRuntimePack` guards against. Mirrors how the HyperFrames
// sidecar's deps ride along via `--hyperframes-dir`.
const remotionSidecarDir = argValue("--remotion-sidecar-dir")
  ? requiredPath("--remotion-sidecar-dir")
  : "";
if (remotionSidecarScript && !remotionSidecarDir) {
  throw new Error(
    "--remotion-sidecar-script requires --remotion-sidecar-dir (the installed node_modules tree); shipping the script alone yields a pack that cannot run Remotion jobs",
  );
}
const remotionSidecarContract = remotionSidecarDir
  ? assertRemotionSidecarContract(remotionSidecarDir)
  : null;
const browserDir = requiredPath("--browser-dir");
const browserExe = findFile(browserDir, (name) => {
  const lower = name.toLowerCase();
  if (isWsl2Runtime) return ["chrome", "headless_shell", "chrome-headless-shell"].includes(lower);
  if (isMacRuntime) return ["chrome", "headless_shell", "chrome-headless-shell", "google chrome for testing"].includes(lower);
  return ["chrome.exe", "headless_shell.exe"].includes(lower);
});
if (!browserExe) {
  throw new Error(
    `--browser-dir must contain ${isWsl2Runtime ? "Linux chrome/headless_shell" : "Chrome for Testing win64 chrome.exe or headless_shell.exe"}: ${browserDir}`,
  );
}
if (isMacRuntime) assertMacArm64Executable(browserExe, "Chrome browser runtime");
if (!isWsl2Runtime && !isMacRuntime) assertWindowsExecutable(browserExe, "Chrome browser runtime");
const ffmpeg = requiredPath("--ffmpeg");
const ffprobe = requiredPath("--ffprobe");
if (isMacRuntime) {
  assertMacArm64Executable(ffmpeg, "FFmpeg");
  assertMacArm64Executable(ffprobe, "ffprobe");
} else if (!isWsl2Runtime) {
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

copyFileInto(hyperframesSidecar, join(stagingRoot, "sidecars"), isMacRuntime ? "hyperframes-render" : "hyperframes-render.exe");
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
} else if (isMacRuntime) {
  assertMacSharpRuntime(join(stagingRoot, "runtime-pack/hyperframes"));
}
copyFileInto(hyperframesSidecarScript, join(stagingRoot, "runtime-pack/hyperframes-sidecar"), "render.mjs");
if (remotionSidecarScript) {
  const remotionStaging = join(stagingRoot, "runtime-pack/remotion-sidecar");
  mkdirSync(remotionStaging, { recursive: true });
  // Dependency tree first, then the tracked script on top — so the shipped
  // render.mjs is always the repo's source of truth even if the install
  // directory happens to hold an older working copy.
  cpSync(join(remotionSidecarDir, "node_modules"), join(remotionStaging, "node_modules"), {
    recursive: true,
  });
  copyFileInto(join(remotionSidecarDir, "package.json"), remotionStaging, "package.json");
  copyFileInto(remotionSidecarScript, remotionStaging, "render.mjs");
  const remotionEntry = join(
    remotionStaging,
    "node_modules/@smartspec/remotion-render/dist/index.js",
  );
  if (!existsSync(remotionEntry)) {
    throw new Error(
      `Remotion sidecar dependency tree is incomplete — missing ${remotionEntry}. Run \`npm install\` in ${remotionSidecarDir} before packaging.`,
    );
  }
}
cpSync(browserDir, join(stagingRoot, "runtime-pack/browser"), { recursive: true });
if (isWsl2Runtime) {
  bundleBrowserSharedLibraries(browserExe, join(stagingRoot, "runtime-pack/browser-libs"));
}
copyFileInto(ffmpeg, join(stagingRoot, "runtime-pack/bin"), isWsl2Runtime || isMacRuntime ? "ffmpeg" : "ffmpeg.exe");
copyFileInto(ffprobe, join(stagingRoot, "runtime-pack/bin"), isWsl2Runtime || isMacRuntime ? "ffprobe" : "ffprobe.exe");
cpSync(thaiFontsDir, join(stagingRoot, "runtime-pack/fonts"), { recursive: true });
copyFileInto(notices, join(stagingRoot, "runtime-pack"), "THIRD_PARTY_NOTICES.txt");
copyFileInto(signatureFile, join(stagingRoot, "runtime-pack"), "SHA256SUMS.sig");

const sidecarSha256 = sha256File(
  join(stagingRoot, "sidecars", isMacRuntime ? "hyperframes-render" : "hyperframes-render.exe"),
);
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
  sidecarPath: isMacRuntime ? "hyperframes-render" : "hyperframes-render.exe",
  sidecarSha256,
  checksumFile: "SHA256SUMS",
  signatureFile: "SHA256SUMS.sig",
  licenseNotices: ["THIRD_PARTY_NOTICES.txt"],
  runtimePlatform: isWsl2Runtime ? "wsl2-linux-x64" : isMacRuntime ? "macos-arm64" : "windows-x64",
  architecture: isMacRuntime ? "arm64" : "x64",
  nodeVersion: isWsl2Runtime ? "bundled-node-linux-x64" : isMacRuntime ? "bundled-node-darwin-arm64" : "bundled-node-win-x64",
  rendererKind: "hyperframes_cli_official",
  sidecarLauncher: "smart-ai-hub-hyperframes-node-launcher",
  sidecarScriptPath: "hyperframes-sidecar/render.mjs",
  // Remotion lane — declared only when the pack actually ships the sidecar,
  // so `assertReleaseRuntimePack` (package-windows-release.mjs) can hard-fail
  // a build whose manifest claims Remotion support the files don't back up.
  ...(remotionSidecarScript
    ? { remotionSidecarScriptPath: "remotion-sidecar/render.mjs" }
    : {}),
  ...(remotionSidecarContract
    ? {
        remotionRenderPackageVersion: remotionSidecarContract.packageVersion,
        remotionPlatformContractVersion: remotionSidecarContract.platformContractVersion,
      }
    : {}),
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
