import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const repoRoot = resolve(appDir, "../..");
const sourceReleasesDir = resolve(repoRoot, "apps/web/client/public/releases");
const runtimeReleasesDir = resolve(repoRoot, "apps/web/dist/public/releases");
const packagePath = join(appDir, "package.json");
const tauriConfigPath = join(appDir, "src-tauri/tauri.conf.json");
const cargoTomlPath = join(appDir, "src-tauri/Cargo.toml");
const releasePattern = /^smart-ai-hub-worker-app-(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)-x64-setup\.(exe|msi)$/i;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const checkRuntime = args.has("--check-runtime");
const skipBuild = args.has("--skip-build");
const allowPlaceholderRuntime = args.has("--allow-placeholder-runtime");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fileIncludes(path, text) {
  return existsSync(path) && readFileSync(path).includes(Buffer.from(text, "utf8"));
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

function compareVersions(left, right) {
  const leftParts = left.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return left.localeCompare(right);
}

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Cannot bump non-semver worker app version: ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function listPublishedVersions() {
  const releaseDirs = [sourceReleasesDir, runtimeReleasesDir].filter((releaseDir) => existsSync(releaseDir));
  return releaseDirs.flatMap((releaseDir) => readdirSync(releaseDir))
    .map((fileName) => fileName.match(releasePattern)?.[1] ?? null)
    .filter(Boolean);
}

function updateCargoVersion(version) {
  const current = readFileSync(cargoTomlPath, "utf8");
  const next = current.replace(/^version = ".+"$/m, `version = "${version}"`);
  if (current === next) {
    throw new Error("Could not update Cargo.toml version");
  }
  writeFileSync(cargoTomlPath, next);
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? appDir,
    stdio: "inherit",
    env: process.env,
  });
}

function assertReleaseRuntimePack() {
  const comfyMcpManifestPath = join(appDir, "src-tauri/resources/comfy-mcp/manifest.json");
  if (!existsSync(comfyMcpManifestPath)) {
    throw new Error(`ComfyUI MCP installer manifest is missing: ${comfyMcpManifestPath}`);
  }
  const comfyMcpManifest = readJson(comfyMcpManifestPath);
  if (comfyMcpManifest.command !== "comfy-mcp" || comfyMcpManifest.packageVersion !== "0.10.0" || comfyMcpManifest.comfyCliRequirement !== ">=1.14.0") {
    throw new Error("ComfyUI MCP installer manifest is not pinned to the supported official package contract");
  }
  const manifestPath = join(appDir, "runtime-pack/manifest.json");
  const manifest = readJson(manifestPath);
  const runtimeId = manifest.runtimeId || "hyperframes-wsl2";
  const isWsl2Runtime = runtimeId === "hyperframes-wsl2" || String(manifest.runtimePlatform || "").includes("wsl2");
  const blockedReasons = [];
  if (!manifest.allowed) blockedReasons.push("manifest.allowed is false");
  if (manifest.version === "0.0.0-placeholder") blockedReasons.push("runtime version is placeholder");
  if (manifest.hyperframesVersion === "not-bundled") blockedReasons.push("HyperFrames is not bundled");
  if (manifest.browserVersion === "not-bundled") blockedReasons.push("browser runtime is not bundled");
  if (manifest.ffmpegVersion === "not-bundled") blockedReasons.push("FFmpeg is not bundled");
  if (manifest.ffprobeVersion === "not-bundled") blockedReasons.push("ffprobe is not bundled");
  if (manifest.rendererKind !== "hyperframes_cli_official") blockedReasons.push("official HyperFrames renderer kind is missing");
  if (manifest.sidecarLauncher !== "smart-ai-hub-hyperframes-node-launcher") blockedReasons.push("official sidecar launcher marker is missing");
  if (manifest.sidecarScriptPath !== "hyperframes-sidecar/render.mjs") blockedReasons.push("official sidecar render script path is missing");
  // Remotion lane (planning/worker-app-remotion-render-video/plan.md).
  // The Rust executor spawns `runtime-pack/remotion-sidecar/render.mjs` for
  // `remotion_render_video` jobs, and that script imports
  // `@smartspec/remotion-render` + `@remotion/{bundler,renderer}` — so the
  // installed node_modules tree MUST ship with the pack. Shipping the script
  // without its dependencies produces an installer that fails at first
  // import on a real worker machine (silent at build time, fatal at run
  // time), which is exactly what these guards exist to prevent.
  if (manifest.remotionSidecarScriptPath !== "remotion-sidecar/render.mjs") {
    blockedReasons.push("Remotion sidecar render script path is missing from the runtime manifest");
  }
  if (!existsSync(join(appDir, "runtime-pack/remotion-sidecar/render.mjs"))) {
    blockedReasons.push("Remotion sidecar render script is missing");
  }
  for (const requiredRemotionModule of [
    "@smartspec/remotion-render/dist/index.js",
    "@smartspec/remotion-render/dist/renderVideoJobEntry.js",
    "@remotion/bundler/package.json",
    "@remotion/renderer/package.json",
  ]) {
    if (!existsSync(join(appDir, "runtime-pack/remotion-sidecar/node_modules", requiredRemotionModule))) {
      blockedReasons.push(`Remotion sidecar dependency is missing: ${requiredRemotionModule}`);
    }
  }
  const remotionPackageManifestPath = join(
    appDir,
    "runtime-pack/remotion-sidecar/node_modules/@smartspec/remotion-render/package.json",
  );
  const sourceRemotionPackagePath = resolve(repoRoot, "packages/remotion-render/package.json");
  if (!existsSync(remotionPackageManifestPath)) {
    blockedReasons.push("Remotion sidecar package manifest is missing");
  } else {
    const installedRemotionVersion = readJson(remotionPackageManifestPath).version;
    const sourceRemotionVersion = readJson(sourceRemotionPackagePath).version;
    if (manifest.remotionRenderPackageVersion !== installedRemotionVersion) {
      blockedReasons.push(
        `runtime manifest Remotion version ${manifest.remotionRenderPackageVersion || "(missing)"} does not match installed sidecar ${installedRemotionVersion}`,
      );
    }
    if (installedRemotionVersion !== sourceRemotionVersion) {
      blockedReasons.push(
        `installed Remotion sidecar ${installedRemotionVersion} does not match source package ${sourceRemotionVersion}`,
      );
    }
  }
  if (isWsl2Runtime) {
    if (!existsSync(join(appDir, "runtime-pack/node/bin/node"))) blockedReasons.push("bundled WSL2 Linux node binary is missing");
    if (!existsSync(join(appDir, "runtime-pack/bin/ffmpeg"))) blockedReasons.push("bundled WSL2 Linux ffmpeg is missing");
    if (!existsSync(join(appDir, "runtime-pack/bin/ffprobe"))) blockedReasons.push("bundled WSL2 Linux ffprobe is missing");
    if (!existsSync(join(appDir, "runtime-pack/hyperframes/node_modules/@img/sharp-linux-x64/package.json"))) {
      blockedReasons.push("bundled WSL2 Linux sharp native package is missing");
    }
    if (!existsSync(join(appDir, "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-linux-x64/package.json"))) {
      blockedReasons.push("bundled WSL2 Linux sharp libvips package is missing");
    }
    if (!findFileName(
      join(appDir, "runtime-pack/hyperframes/node_modules/@img/sharp-linux-x64/lib"),
      (name) => name.startsWith("sharp-linux-x64") && name.endsWith(".node"),
    )) {
      blockedReasons.push("bundled WSL2 Linux sharp native binding is missing");
    }
    if (!findFileName(
      join(appDir, "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-linux-x64/lib"),
      (name) => name.startsWith("libvips-cpp.so."),
    )) {
      blockedReasons.push("bundled WSL2 Linux sharp libvips binary is missing");
    }
  } else {
    if (!existsSync(join(appDir, "runtime-pack/node/node.exe"))) blockedReasons.push("bundled Windows node.exe is missing");
    if (!existsSync(join(appDir, "runtime-pack/bin/ffmpeg.exe"))) blockedReasons.push("bundled Windows ffmpeg.exe is missing");
    if (!existsSync(join(appDir, "runtime-pack/bin/ffprobe.exe"))) blockedReasons.push("bundled Windows ffprobe.exe is missing");
  }
  if (!existsSync(join(appDir, "runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js"))) {
    blockedReasons.push("bundled official HyperFrames CLI is missing");
  }
  if (!existsSync(join(appDir, "runtime-pack/hyperframes-sidecar/render.mjs"))) {
    blockedReasons.push("bundled HyperFrames sidecar render script is missing");
  }
  const transcription = manifest.transcription;
  if (!transcription || transcription.engine !== "whisper.cpp") {
    blockedReasons.push("bundled whisper.cpp transcription contract is missing");
  } else {
    const whisperPath = join(appDir, "runtime-pack", transcription.binaryPath || "");
    const modelPath = join(appDir, "runtime-pack", transcription.modelPath || "");
    if (!existsSync(whisperPath)) blockedReasons.push(`bundled whisper executable is missing: ${transcription.binaryPath || "(missing)"}`);
    if (!existsSync(modelPath)) blockedReasons.push(`bundled whisper model is missing: ${transcription.modelPath || "(missing)"}`);
    if (existsSync(modelPath) && statSync(modelPath).size < 100_000_000) {
      blockedReasons.push("bundled whisper model is too small to be a production model");
    }
  }
  if (!Array.isArray(manifest.licenseNotices) || manifest.licenseNotices.length === 0) {
    blockedReasons.push("license notices are missing");
  }
  const sidecarPath = join(appDir, "sidecars", manifest.sidecarPath || "");
  if (!existsSync(sidecarPath)) {
    blockedReasons.push(`HyperFrames sidecar file does not exist: ${manifest.sidecarPath || "(missing)"}`);
  } else if (
    fileIncludes(sidecarPath, "placeholder sidecar")
    || fileIncludes(sidecarPath, "mock video content")
    || fileIncludes(sidecarPath, "mock-hyperframes")
    || fileIncludes(sidecarPath, "testsrc2=")
    || fileIncludes(sidecarPath, "testsrc=size=")
    || fileIncludes(sidecarPath, "lavfi")
    || fileIncludes(sidecarPath, "local_smoke_snapshot")
    || fileIncludes(sidecarPath, "diagnostic_ffmpeg_smoke")
  ) {
    blockedReasons.push("HyperFrames sidecar is a mock, placeholder, or diagnostic smoke renderer");
  }
  for (const fileField of ["checksumFile", "signatureFile"]) {
    const fileName = manifest[fileField];
    if (typeof fileName !== "string" || fileName.trim().length === 0) {
      blockedReasons.push(`${fileField} is missing`);
      continue;
    }
    if (!existsSync(join(appDir, "runtime-pack", fileName))) {
      blockedReasons.push(`${fileField} file does not exist: ${fileName}`);
    }
  }
  const signaturePath = join(appDir, "runtime-pack", manifest.signatureFile || "");
  if (existsSync(signaturePath)) {
    const signatureContents = readFileSync(signaturePath, "utf8").trim();
    if (!signatureContents || signatureContents.includes("placeholder-signature-required-before-release")) {
      blockedReasons.push("runtime signature is a placeholder or empty");
    }
  }
  for (const notice of Array.isArray(manifest.licenseNotices) ? manifest.licenseNotices : []) {
    if (!existsSync(join(appDir, "runtime-pack", notice))) {
      blockedReasons.push(`license notice file does not exist: ${notice}`);
    }
  }
  if (blockedReasons.length > 0 && !allowPlaceholderRuntime) {
    throw new Error(
      [
        "Refusing to publish Smart AI Hub Worker App with a non-official runtime pack.",
        ...blockedReasons.map((reason) => `- ${reason}`),
        "Use --allow-placeholder-runtime only for internal UI/dev smoke builds that must not be offered as render-ready.",
      ].join("\n"),
    );
  }
}

const packageJson = readJson(packagePath);
const tauriConfig = readJson(tauriConfigPath);
const publishedVersions = listPublishedVersions();
const highestPublishedVersion = publishedVersions.sort(compareVersions).at(-1) ?? null;
const baseVersion = highestPublishedVersion && compareVersions(highestPublishedVersion, packageJson.version) >= 0
  ? highestPublishedVersion
  : packageJson.version;
const nextVersion = bumpPatch(baseVersion);
const releaseFileName = `smart-ai-hub-worker-app-${nextVersion}-x64-setup.exe`;
const sourceReleasePath = join(sourceReleasesDir, releaseFileName);
const runtimeReleasePath = join(runtimeReleasesDir, releaseFileName);

console.log(`[worker-app] current package version: ${packageJson.version}`);
console.log(`[worker-app] highest dashboard release: ${highestPublishedVersion ?? "none"}`);
console.log(`[worker-app] next Windows release version: ${nextVersion}`);

if (checkRuntime) {
  assertReleaseRuntimePack();
  console.log("[worker-app] runtime pack is release-ready.");
  process.exit(0);
}

if (dryRun) {
  console.log("[worker-app] dry run does not validate runtime readiness; use --check-runtime for the release gate.");
  console.log(`[worker-app] dry run only; would write ${sourceReleasePath}`);
  if (existsSync(runtimeReleasesDir)) {
    console.log(`[worker-app] dry run only; would update runtime dashboard copy ${runtimeReleasePath}`);
  }
  process.exit(0);
}

if (existsSync(sourceReleasePath) || existsSync(runtimeReleasePath)) {
  throw new Error(`Release already exists: ${existsSync(sourceReleasePath) ? sourceReleasePath : runtimeReleasePath}`);
}

packageJson.version = nextVersion;
tauriConfig.version = nextVersion;
writeJson(packagePath, packageJson);
writeJson(tauriConfigPath, tauriConfig);
updateCargoVersion(nextVersion);

run("npm", ["run", "runtime:pack"]);
assertReleaseRuntimePack();

if (!skipBuild) {
  run("npm", [
    "run",
    "tauri:build",
    "--",
    "--runner",
    "cargo-xwin",
    "--target",
    "x86_64-pc-windows-msvc",
  ]);
}

const bundlePath = join(
  appDir,
  "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis",
  `Smart AI Hub Worker App_${nextVersion}_x64-setup.exe`,
);

if (!existsSync(bundlePath)) {
  throw new Error(`Windows installer was not found after build: ${bundlePath}`);
}

mkdirSync(sourceReleasesDir, { recursive: true });
copyFileSync(bundlePath, sourceReleasePath);
console.log(`[worker-app] copied dashboard source release: ${sourceReleasePath}`);

if (existsSync(resolve(repoRoot, "apps/web/dist/public"))) {
  mkdirSync(runtimeReleasesDir, { recursive: true });
  copyFileSync(bundlePath, runtimeReleasePath);
  console.log(`[worker-app] updated live dashboard release: ${runtimeReleasePath}`);
}
