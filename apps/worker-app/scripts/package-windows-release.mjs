import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const repoRoot = resolve(appDir, "../..");
const releasesDir = resolve(repoRoot, "apps/web/client/public/releases");
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
  if (!existsSync(releasesDir)) {
    return [];
  }
  return readdirSync(releasesDir)
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
  const manifestPath = join(appDir, "runtime-pack/manifest.json");
  const manifest = readJson(manifestPath);
  const blockedReasons = [];
  if (!manifest.allowed) blockedReasons.push("manifest.allowed is false");
  if (manifest.version === "0.0.0-placeholder") blockedReasons.push("runtime version is placeholder");
  if (manifest.hyperframesVersion === "not-bundled") blockedReasons.push("HyperFrames is not bundled");
  if (manifest.browserVersion === "not-bundled") blockedReasons.push("browser runtime is not bundled");
  if (manifest.ffmpegVersion === "not-bundled") blockedReasons.push("FFmpeg is not bundled");
  if (manifest.ffprobeVersion === "not-bundled") blockedReasons.push("ffprobe is not bundled");
  if (!Array.isArray(manifest.licenseNotices) || manifest.licenseNotices.length === 0) {
    blockedReasons.push("license notices are missing");
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
const releasePath = join(releasesDir, releaseFileName);

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
  console.log(`[worker-app] dry run only; would write ${releasePath}`);
  process.exit(0);
}

if (existsSync(releasePath)) {
  throw new Error(`Release already exists: ${releasePath}`);
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

mkdirSync(releasesDir, { recursive: true });
copyFileSync(bundlePath, releasePath);
console.log(`[worker-app] copied dashboard release: ${releasePath}`);
