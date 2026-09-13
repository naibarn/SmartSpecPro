#!/usr/bin/env node

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
const macReleasePattern = /^smart-ai-hub-worker-app-(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)-arm64-setup\.dmg$/i;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipBuild = args.has("--skip-build");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function compareVersions(left, right) {
  const leftParts = left.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return left.localeCompare(right);
}

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot bump non-semver Worker App version: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function listMacPublishedVersions() {
  const releaseDirs = [sourceReleasesDir, runtimeReleasesDir].filter((releaseDir) => existsSync(releaseDir));
  return releaseDirs.flatMap((releaseDir) => readdirSync(releaseDir))
    .map((fileName) => fileName.match(macReleasePattern)?.[1] ?? null)
    .filter(Boolean);
}

function updateCargoVersion(version) {
  const current = readFileSync(cargoTomlPath, "utf8");
  const next = current.replace(/^version = ".+"$/m, `version = "${version}"`);
  if (current !== next) writeFileSync(cargoTomlPath, next);
}

function run(command, commandArgs, options = {}) {
  execFileSync(command, commandArgs, {
    cwd: options.cwd ?? appDir,
    stdio: "inherit",
    env: process.env,
  });
}

function findDmg(targetDir) {
  if (!existsSync(targetDir)) return null;
  const candidates = [];
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    const absolute = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findDmg(absolute);
      if (nested) candidates.push(nested);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".dmg")) {
      candidates.push(absolute);
    }
  }
  return candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] ?? null;
}

function assertMacHost() {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("macOS Worker App release packaging must run on an Apple Silicon macOS host");
  }
}

if (args.has("--help")) {
  console.log(`Worker App macOS release packager

Usage:
  npm --workspace apps/worker-app run release:mac -- [options]

Options:
  --release-version VERSION  publish this Mac version; defaults to the next Mac version
  --skip-build               reuse the existing aarch64 Tauri DMG output
  --dry-run                  print release paths without building or writing files

The production command requires macOS arm64. It creates a native DMG only;
publish hyperframes-macos-arm64 separately through the Worker Runtime release portal.`);
  process.exit(0);
}

if (!dryRun) assertMacHost();

const packageJson = readJson(packagePath);
const tauriConfig = readJson(tauriConfigPath);
const macVersions = listMacPublishedVersions();
const highestMacVersion = macVersions.sort(compareVersions).at(-1) ?? null;
const baseVersion = highestMacVersion && compareVersions(highestMacVersion, packageJson.version) >= 0
  ? highestMacVersion
  : packageJson.version;
const requestedVersion = argValue("--release-version");
if (requestedVersion && !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(requestedVersion)) {
  throw new Error(`Invalid --release-version: ${requestedVersion}`);
}
const nextVersion = requestedVersion || bumpPatch(baseVersion);
if (highestMacVersion && compareVersions(nextVersion, highestMacVersion) <= 0) {
  throw new Error(`Mac release version ${nextVersion} must be newer than the highest Mac release ${highestMacVersion}`);
}

const releaseFileName = `smart-ai-hub-worker-app-${nextVersion}-arm64-setup.dmg`;
const sourceReleasePath = join(sourceReleasesDir, releaseFileName);
const runtimeReleasePath = join(runtimeReleasesDir, releaseFileName);
const bundleRoot = join(appDir, "src-tauri/target/aarch64-apple-darwin/release/bundle");

console.log(`[worker-app] current package version: ${packageJson.version}`);
console.log(`[worker-app] highest Mac release: ${highestMacVersion ?? "none"}`);
console.log(`[worker-app] next macOS arm64 release version: ${nextVersion}`);

if (dryRun) {
  console.log(`[worker-app] dry run only; would write ${sourceReleasePath}`);
  if (existsSync(runtimeReleasesDir)) console.log(`[worker-app] dry run only; would update ${runtimeReleasePath}`);
  process.exit(0);
}

if (existsSync(sourceReleasePath) || existsSync(runtimeReleasePath)) {
  throw new Error(`Mac release already exists: ${existsSync(sourceReleasePath) ? sourceReleasePath : runtimeReleasePath}`);
}

packageJson.version = nextVersion;
tauriConfig.version = nextVersion;
writeJson(packagePath, packageJson);
writeJson(tauriConfigPath, tauriConfig);
updateCargoVersion(nextVersion);

if (!skipBuild) {
  run("npm", ["run", "build"]);
  run("npm", ["run", "tauri:build", "--", "--target", "aarch64-apple-darwin", "--bundles", "app,dmg"]);
}

const bundlePath = findDmg(bundleRoot);
if (!bundlePath) {
  throw new Error(`macOS arm64 DMG was not found under ${bundleRoot}`);
}

mkdirSync(sourceReleasesDir, { recursive: true });
copyFileSync(bundlePath, sourceReleasePath);
console.log(`[worker-app] copied native Mac release: ${sourceReleasePath}`);

if (existsSync(resolve(repoRoot, "apps/web/dist/public"))) {
  mkdirSync(runtimeReleasesDir, { recursive: true });
  copyFileSync(bundlePath, runtimeReleasePath);
  console.log(`[worker-app] updated live dashboard release: ${runtimeReleasePath}`);
}

console.log(JSON.stringify({
  platform: "macos",
  architecture: "arm64",
  version: nextVersion,
  bundle: bundlePath,
  sourceRelease: sourceReleasePath,
  liveRelease: existsSync(runtimeReleasePath) ? runtimeReleasePath : null,
}, null, 2));
