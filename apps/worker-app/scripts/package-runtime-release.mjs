#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import {
  cpSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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

function requiredPath(name, fallback = "") {
  const value = argValue(name) || fallback;
  if (!value) throw new Error(`${name} is required`);
  const absolute = resolve(value);
  if (!existsSync(absolute)) throw new Error(`${name} does not exist: ${absolute}`);
  return absolute;
}

function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
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
      `Cannot package a mock, placeholder, or diagnostic smoke sidecar (${matchedMarker}). Provide the approved native/portable Mac or Windows launcher for --hyperframes-sidecar. (Got: ${path})`,
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

function assertMacRuntimeSidecar(path, label) {
  let description;
  try {
    description = execFileSync("file", [path], { encoding: "utf8" }).toLowerCase();
  } catch (error) {
    throw new Error(`${label} could not be inspected with file(1): ${path} (${error})`);
  }
  if (description.includes("mach-o")) {
    assertMacArm64Executable(path, label);
    return;
  }

  const source = readFileSync(path, "utf8");
  const isPortableLauncher =
    /^#!\/bin\/sh\s/m.test(source) &&
    source.includes("runtime-pack/node/bin/node") &&
    source.includes("runtime-pack/hyperframes-sidecar/render.mjs") &&
    !/wsl\.exe|hyperframes-wsl2|\.exe\b/i.test(source);
  if (!isPortableLauncher) {
    throw new Error(
      `${label} must be a native Mach-O arm64 executable or the approved POSIX macOS launcher: ${path}`,
    );
  }
}

function assertBundledWhisperExecutable(path, label, isWsl2, isMac) {
  if (isWsl2) {
    const description = execFileSync("file", [path], { encoding: "utf8" }).toLowerCase();
    if (!description.includes("elf") || !description.includes("x86-64")) {
      throw new Error(`${label} must be a Linux x86-64 executable for WSL2: ${description.trim()}`);
    }
  } else if (isMac) {
    assertMacArm64Executable(path, label);
  } else {
    assertWindowsExecutable(path, label);
  }
}

function assertWhisperModel(path) {
  const size = statSync(path).size;
  if (size < 100_000_000) {
    throw new Error(`Whisper model is too small to be a production model (${size} bytes): ${path}`);
  }
}

function applyHyperframesWhisperCompatibilityPatch(cliPath) {
  const source = readFileSync(cliPath, "utf8");
  const unsupportedDtwArgs = '    "--dtw",\n    effectiveModel,\n';
  if (source.includes(unsupportedDtwArgs)) {
    writeFileSync(cliPath, source.replace(unsupportedDtwArgs, ""));
    return;
  }
  // Packaging can be retried from an already staged CLI. Treat the expected
  // post-patch shape as valid, while still refusing an unrelated/unknown CLI.
  if (source.includes('function transcribeAudio') && source.includes('"--suppress-nst"')) {
    return;
  }
  {
    throw new Error(
      `Cannot verify HyperFrames/whisper.cpp compatibility in ${cliPath}; expected unsupported DTW argument was not found.`,
    );
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

function copyMacRuntimeLibraries(binaryPath, targetDir, label) {
  const sourceDir = dirname(binaryPath);
  const libraries = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".dylib"))
    .map((entry) => join(sourceDir, entry.name));
  if (libraries.length === 0) {
    throw new Error(`${label} is missing its adjacent macOS dylib bundle: ${sourceDir}`);
  }
  for (const library of libraries) {
    assertMacArm64Executable(library, `${label} dylib`);
    copyFileInto(library, targetDir);
  }
  console.log(`[worker-app] Bundled ${libraries.length} ${label} macOS dylibs.`);
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

function assertMacRemotionRuntime(root) {
  const requiredExecutables = [
    [
      join(root, "node_modules/@remotion/compositor-darwin-arm64/remotion"),
      "Remotion Darwin arm64 compositor",
    ],
    [
      join(root, "node_modules/@remotion/compositor-darwin-arm64/ffmpeg"),
      "Remotion Darwin arm64 FFmpeg",
    ],
    [
      join(root, "node_modules/@remotion/compositor-darwin-arm64/ffprobe"),
      "Remotion Darwin arm64 ffprobe",
    ],
    [
      join(root, "node_modules/@esbuild/darwin-arm64/bin/esbuild"),
      "Remotion Darwin arm64 esbuild",
    ],
    [
      join(root, "node_modules/@rspack/binding-darwin-arm64/rspack.darwin-arm64.node"),
      "Remotion Darwin arm64 rspack binding",
    ],
  ];
  for (const [path, label] of requiredExecutables) {
    if (!existsSync(path)) {
      throw new Error(`macOS arm64 Remotion runtime is missing ${label}: ${path}`);
    }
    assertMacArm64Executable(path, label);
  }
}

function assertMacWhisperRuntime(whisperCli) {
  const libDir = join(dirname(whisperCli), "lib");
  const requiredLibraries = [
    ["libwhisper.1.dylib", "whisper.cpp"],
    ["libggml.0.dylib", "ggml"],
    ["libggml-base.0.dylib", "ggml-base"],
    ["libomp.dylib", "OpenMP"],
  ];
  for (const [name, label] of requiredLibraries) {
    const path = join(libDir, name);
    if (!existsSync(path)) {
      throw new Error(`macOS arm64 Whisper runtime is missing ${label} library: ${path}`);
    }
    assertMacArm64Executable(path, `macOS arm64 ${label} library`);
  }
}

function pruneMacForeignNativeArtifacts(root) {
  const napiRoot = join(root, "node_modules/onnxruntime-node/bin/napi-v6");
  for (const platform of ["linux", "win32"]) {
    rmSync(join(napiRoot, platform), { recursive: true, force: true });
  }
  console.log("[worker-app] Pruned non-macOS ONNX Runtime native variants from Mac pack.");
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
  // preserve executable bits. Stream file contents so a multi-gigabyte
  // Whisper model never has to be loaded into RAM; very large binary assets
  // are stored without compression because they are already compact enough
  // and compressing them would make the fallback unnecessarily expensive.
  execFileSync("python3", [
    "-c",
    [
      "import os, sys, shutil, zipfile",
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
            "            info.compress_type = zipfile.ZIP_STORED if st.st_size >= 1073741824 else zipfile.ZIP_DEFLATED",
            "            with open(full_path, 'rb') as src:",
            "                with zf.open(info, 'w') as dst:",
            "                    shutil.copyfileobj(src, dst, length=1024 * 1024)",
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
  --whisper-cli PATH
  --whisper-model PATH
  --thai-fonts-dir PATH
  --notices PATH
  --speaker-aware-runner PATH (optional native Feature 179 runner; target platform)
  --speaker-aware-runner-version VERSION (defaults to 0.1.1)
  --signature-file PATH (precomputed Ed25519 signature; optional)
  --signing-private-key-file PATH (build-only; optional)
  --comfy-mcp-manifest PATH
  --staging-dir PATH (optional isolated staging directory)

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
if (isMacRuntime && (!argValue("--remotion-sidecar-script") || !argValue("--remotion-sidecar-dir"))) {
  throw new Error(
    "hyperframes-macos-arm64 runtime packaging requires the native Remotion sidecar script and installed dependency tree",
  );
}

const hyperframesSidecar = requiredPath("--hyperframes-sidecar");
assertNotMockSidecar(hyperframesSidecar);
if (isMacRuntime) {
  assertMacRuntimeSidecar(hyperframesSidecar, "HyperFrames launcher sidecar");
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
// The Worker App advertises the Remotion lane for every supported Windows/WSL2
// runtime.  Omitting the sidecar would therefore create a signed release that
// can never claim the queued `remotion_render_video` jobs (they remain waiting
// forever).  Keep the argument optional only for the historical macOS/source
// packaging paths that do not publish a Windows queue runtime.
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
if (isWsl2Runtime && (!remotionSidecarScript || !remotionSidecarDir)) {
  throw new Error(
    "hyperframes-wsl2 runtime packaging requires --remotion-sidecar-script and --remotion-sidecar-dir so Remotion jobs cannot be stranded in the queue",
  );
}
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
const whisperCli = requiredPath("--whisper-cli");
assertBundledWhisperExecutable(whisperCli, "Bundled whisper.cpp executable", isWsl2Runtime, isMacRuntime);
if (isMacRuntime) assertMacWhisperRuntime(whisperCli);
const whisperModel = requiredPath("--whisper-model");
assertWhisperModel(whisperModel);
const speakerAwareRunner = argValue("--speaker-aware-runner")
  ? requiredPath("--speaker-aware-runner")
  : "";
const speakerAwareRunnerVersion = argValue("--speaker-aware-runner-version") || "0.1.1";
const speakerAwareRunnerName = isMacRuntime ? "speaker-aware-runner" : "speaker-aware-runner.exe";
if (speakerAwareRunner && !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(speakerAwareRunnerVersion)) {
  throw new Error(`Invalid --speaker-aware-runner-version: ${speakerAwareRunnerVersion}`);
}
if (speakerAwareRunner) {
  // The speaker-aware runner is launched by the Tauri Worker process, so it
  // must match the Worker App host. WSL2 is only the render runtime on
  // Windows; the Mac pack must never carry a Windows .exe module.
  if (isMacRuntime) {
    assertMacArm64Executable(speakerAwareRunner, "Speaker-aware runner");
  } else {
    assertWindowsExecutable(speakerAwareRunner, "Speaker-aware runner");
  }
}
const thaiFontsDir = requiredPath("--thai-fonts-dir");
const notices = requiredPath("--notices");
const signatureFileArg = argValue("--signature-file");
const signingPrivateKeyFileArg = argValue("--signing-private-key-file");
if (signatureFileArg && signingPrivateKeyFileArg) {
  throw new Error("Use either --signature-file or --signing-private-key-file, not both");
}
const signatureFile = signatureFileArg ? requiredPath("--signature-file") : "";
const signingPrivateKeyFile = signingPrivateKeyFileArg
  ? requiredPath("--signing-private-key-file")
  : "";
const comfyMcpManifest = requiredPath(
  "--comfy-mcp-manifest",
  resolve(appRoot, "src-tauri/resources/comfy-mcp/manifest.json"),
);
const ttsProviderRegistry = requiredPath(
  "--tts-provider-registry",
  resolve(appRoot, "tts-runtime/provider_registry.py"),
);
const outputDir = resolve(argValue("--output-dir") || defaultOutputDir);
const hyperframesVersion = argValue("--hyperframes-version") || "official";
const browserVersion = argValue("--browser-version") || "managed";
const ffmpegVersion = argValue("--ffmpeg-version") || "managed";
const ffprobeVersion = argValue("--ffprobe-version") || ffmpegVersion;
const thaiFontFamily = argValue("--thai-font-family") || "Noto Sans Thai";
const usedDefaultOutputDir = !argValue("--output-dir");

mkdirSync(outputDir, { recursive: true });

const stagingRoot = resolve(
  argValue("--staging-dir") || resolve(appRoot, ".runtime-release-staging"),
);
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(join(stagingRoot, "sidecars"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/bin"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/browser"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/browser-libs"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/fonts"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/node"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/hyperframes"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/hyperframes-sidecar"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/comfy-mcp"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/tts-runtime"), { recursive: true });
mkdirSync(join(stagingRoot, "runtime-pack/whisper/.cache/hyperframes/whisper/models"), { recursive: true });
if (speakerAwareRunner) mkdirSync(join(stagingRoot, "runtime-pack/speaker-aware"), { recursive: true });

copyFileInto(hyperframesSidecar, join(stagingRoot, "sidecars"), isMacRuntime ? "hyperframes-render" : "hyperframes-render.exe");
// The Worker App invokes the bundled Node executable directly. Shipping the
// complete Node distribution also duplicates HyperFrames/npm trees and can
// push the archive into ZIP64, which the server validator intentionally does
// not accept. Keep only the platform executable required by the runtime
// contract.
copyFileInto(
  nodeBinary,
  join(stagingRoot, "runtime-pack/node", isWsl2Runtime || isMacRuntime ? "bin" : ""),
  isWsl2Runtime || isMacRuntime ? "node" : "node.exe",
);
cpSync(hyperframesDir, join(stagingRoot, "runtime-pack/hyperframes"), { recursive: true });
rmSync(join(stagingRoot, "runtime-pack/hyperframes/node_modules/.bin"), { recursive: true, force: true });
applyHyperframesWhisperCompatibilityPatch(
  join(stagingRoot, "runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js"),
);
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
  pruneMacForeignNativeArtifacts(join(stagingRoot, "runtime-pack/hyperframes"));
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
  if (isMacRuntime) assertMacRemotionRuntime(remotionStaging);
}
cpSync(browserDir, join(stagingRoot, "runtime-pack/browser"), { recursive: true });
if (isWsl2Runtime) {
  bundleBrowserSharedLibraries(browserExe, join(stagingRoot, "runtime-pack/browser-libs"));
}
copyFileInto(ffmpeg, join(stagingRoot, "runtime-pack/bin"), isWsl2Runtime || isMacRuntime ? "ffmpeg" : "ffmpeg.exe");
copyFileInto(ffprobe, join(stagingRoot, "runtime-pack/bin"), isWsl2Runtime || isMacRuntime ? "ffprobe" : "ffprobe.exe");
if (isMacRuntime) {
  copyMacRuntimeLibraries(ffmpeg, join(stagingRoot, "runtime-pack/bin"), "FFmpeg");
}
copyFileInto(
  whisperCli,
  join(stagingRoot, "runtime-pack/whisper"),
  isWsl2Runtime || isMacRuntime ? "whisper-cli" : "whisper-cli.exe",
);
if (isMacRuntime) {
  cpSync(
    join(dirname(whisperCli), "lib"),
    join(stagingRoot, "runtime-pack/whisper/lib"),
    { recursive: true },
  );
}
copyFileInto(
  whisperModel,
  join(stagingRoot, "runtime-pack/whisper/.cache/hyperframes/whisper/models"),
  "ggml-large-v3.bin",
);
if (speakerAwareRunner) {
  copyFileInto(speakerAwareRunner, join(stagingRoot, "runtime-pack/speaker-aware"), speakerAwareRunnerName);
}
cpSync(thaiFontsDir, join(stagingRoot, "runtime-pack/fonts"), { recursive: true });
copyFileInto(notices, join(stagingRoot, "runtime-pack"), "THIRD_PARTY_NOTICES.txt");
copyFileInto(comfyMcpManifest, join(stagingRoot, "runtime-pack/comfy-mcp"), "manifest.json");
copyFileInto(ttsProviderRegistry, join(stagingRoot, "runtime-pack/tts-runtime"), "provider_registry.py");

const sidecarSha256 = await sha256File(
  join(stagingRoot, "sidecars", isMacRuntime ? "hyperframes-render" : "hyperframes-render.exe"),
);
const checksumEntries = await Promise.all(walkFiles(stagingRoot)
  .filter((file) => file !== "runtime-pack/SHA256SUMS" && file !== "runtime-pack/SHA256SUMS.sig")
  .map(async (file) => `${await sha256File(join(stagingRoot, file))}  ${file}`));
const checksumLines = checksumEntries.join("\n");
const checksumText = `${checksumLines}\n`;
writeFileSync(join(stagingRoot, "runtime-pack/SHA256SUMS"), checksumText);

let signatureContents = "";
if (signatureFile) {
  signatureContents = readFileSync(signatureFile, "utf8").trim();
} else {
  const privateKeySource = signingPrivateKeyFile
    ? readFileSync(signingPrivateKeyFile, "utf8")
    : process.env.SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY || "";
  if (!privateKeySource.trim()) {
    throw new Error(
      "A real Ed25519 signature is required. Provide --signature-file, --signing-private-key-file, or SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY in the build environment.",
    );
  }
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeySource);
  } catch {
    throw new Error("The Worker Runtime signing private key is invalid or unreadable.");
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("The Worker Runtime signing private key must be Ed25519.");
  }
  signatureContents = sign(null, Buffer.from(checksumText, "utf8"), privateKey).toString("base64");
}
if (!signatureContents || signatureContents.includes("placeholder-signature-required-before-release")) {
  throw new Error("The Worker Runtime signature must be a real Ed25519 signature; placeholder signatures cannot be published");
}
writeFileSync(join(stagingRoot, "runtime-pack/SHA256SUMS.sig"), `${signatureContents}\n`);
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
  transcription: {
    engine: "whisper.cpp",
    version: argValue("--whisper-version") || "managed",
    binaryPath: isWsl2Runtime || isMacRuntime ? "whisper/whisper-cli" : "whisper/whisper-cli.exe",
    binarySha256: await sha256File(join(stagingRoot, "runtime-pack/whisper", isWsl2Runtime || isMacRuntime ? "whisper-cli" : "whisper-cli.exe")),
    model: "large-v3",
    modelPath: "whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin",
    modelSha256: await sha256File(join(stagingRoot, "runtime-pack/whisper/.cache/hyperframes/whisper/models", "ggml-large-v3.bin")),
    modelUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
  },
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
  ...(speakerAwareRunner
    ? {
        speakerAwareRunner: {
          path: `speaker-aware/${speakerAwareRunnerName}`,
          version: speakerAwareRunnerVersion,
          contractVersion: "feature-179-v1",
          sha256: await sha256File(join(stagingRoot, "runtime-pack/speaker-aware", speakerAwareRunnerName)),
        },
      }
    : {}),
  supportedContractVersions: ["2026-06-22"],
  runtimeProfileHash,
  allowed: true,
  denyReason: null,
  rollbackToVersion: null,
  comfyMcp: {
    command: "comfy-mcp",
    package: "comfy-mcp",
    packageVersion: "0.10.0",
    comfyCliRequirement: ">=1.14.0",
    pythonRequirement: ">=3.10",
    installMode: "worker-managed-venv",
  },
  ttsRuntime: {
    providerRegistryPath: "tts-runtime/provider_registry.py",
    providerRegistrySha256: await sha256File(join(stagingRoot, "runtime-pack/tts-runtime/provider_registry.py")),
    providers: ["voxcpm2", "confucius4-tts", "moss-tts"],
    trainingProviders: ["voxcpm2"],
    operatorCommandEnvironment: [
      "SMARTSPEC_TTS_VOXCPM2_COMMAND",
      "SMARTSPEC_TTS_VOXCPM2_TRAIN_COMMAND",
      "SMARTSPEC_TTS_CONFUCIUS4_COMMAND",
      "SMARTSPEC_TTS_CONFUCIUS4_TRAIN_COMMAND",
      "SMARTSPEC_TTS_MOSS_COMMAND",
      "SMARTSPEC_TTS_MOSS_TRAIN_COMMAND",
    ],
    executionMode: "operator-command-allowlist",
  },
};
writeFileSync(join(stagingRoot, "runtime-pack/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const archiveName = `smart-ai-hub-worker-runtime-${targetRuntime}-${runtimeVersion}.zip`;
const archivePath = join(outputDir, archiveName);
rmSync(archivePath, { force: true });
const archiveEntries = walkFiles(stagingRoot);
createZipArchive(archivePath, stagingRoot);
const archiveStat = statSync(archivePath);
const archiveSha256 = await sha256File(archivePath);
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
