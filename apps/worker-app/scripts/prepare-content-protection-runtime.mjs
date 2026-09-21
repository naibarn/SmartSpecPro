#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const repoRoot = resolve(appDir, "../..");
const sourceProvider = join(appDir, "content-protection/videoseal-provider.py");
const generatedRoot = resolve(
  process.env.CONTENT_PROTECTION_OUTPUT_ROOT ||
    join(appDir, ".content-protection-build/generated"),
);
const buildRoot = join(appDir, ".content-protection-build");
const videoSealCommit = "870ca7fb33578b90f14c602016b6c2788096226e";
const modelFileName = "videoseal_y_256b_img.pth";
const modelMinimumBytes = 100 * 1024 * 1024;

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check-only");
const targetPlatform = process.env.CONTENT_PROTECTION_TARGET || process.platform;
const isWindowsTarget = targetPlatform === "win32" || targetPlatform === "windows-x64";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: options.encoding,
    stdio: options.stdio || "inherit",
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function platformPython() {
  if (process.env.CONTENT_PROTECTION_BUILD_PYTHON) {
    return process.env.CONTENT_PROTECTION_BUILD_PYTHON;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function pythonArgs(...pythonArguments) {
  const configured = process.env.CONTENT_PROTECTION_BUILD_PYTHON || "";
  if (process.platform === "win32" && configured === "py") {
    return ["-3.11", ...pythonArguments];
  }
  return pythonArguments;
}

function providerExecutablePath() {
  const directory = join(generatedRoot, "provider");
  return join(directory, isWindowsTarget ? "videoseal-provider.exe" : "videoseal-provider");
}

function providerExecutableRelativePath() {
  return isWindowsTarget
    ? "provider/videoseal-provider.exe"
    : "provider/videoseal-provider";
}

function assertBundle(bundleRoot = generatedRoot) {
  const manifestPath = join(bundleRoot, "content-protection-manifest.json");
  const manifest = readJson(manifestPath);
  const executable = join(bundleRoot, manifest.providerCommand);
  const model = join(bundleRoot, manifest.modelPath);
  if (!existsSync(executable)) throw new Error(`Content Protection provider executable is missing: ${executable}`);
  if (!existsSync(model) || statSync(model).size < modelMinimumBytes) {
    throw new Error(`Content Protection model is missing or too small: ${model}`);
  }
  if (manifest.videoSealCommit !== videoSealCommit) {
    throw new Error(`Unexpected VideoSeal revision in bundle: ${manifest.videoSealCommit}`);
  }
  if (manifest.provider !== "videoseal" || manifest.providerVersion !== "videoseal-1.0") {
    throw new Error("Content Protection bundle provider identity is invalid");
  }
  if (manifest.healthChecked !== true) {
    throw new Error("Content Protection bundle was not health-checked");
  }
  if (!existsSync(join(bundleRoot, manifest.licenseNotice))) {
    throw new Error(`Content Protection license notice is missing: ${manifest.licenseNotice}`);
  }
  return { manifest, executable, model };
}

if (checkOnly) {
  const result = assertBundle(argValue("--bundle-root") || generatedRoot);
  console.log(`[worker-app] content protection bundle is ready: ${result.manifest.providerVersion}`);
  process.exit(0);
}

if (!existsSync(sourceProvider)) {
  throw new Error(`Content Protection provider source is missing: ${sourceProvider}`);
}

rmSync(generatedRoot, { recursive: true, force: true });
rmSync(buildRoot, { recursive: true, force: true });
mkdirSync(generatedRoot, { recursive: true });
mkdirSync(buildRoot, { recursive: true });

const python = platformPython();
const venvRoot = join(buildRoot, "venv");
run(python, pythonArgs("-m", "venv", "--copies", venvRoot));
const venvPython = process.platform === "win32"
  ? join(venvRoot, "Scripts/python.exe")
  : join(venvRoot, "bin/python");
const venvPip = process.platform === "win32"
  ? join(venvRoot, "Scripts/pip.exe")
  : join(venvRoot, "bin/pip");

run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", "--upgrade", "pip"]);
const torchVersion = process.env.CONTENT_PROTECTION_TORCH_VERSION || "2.10.0";
const torchvisionVersion = process.env.CONTENT_PROTECTION_TORCHVISION_VERSION || "0.25.0";
run(venvPip, [
  "install",
  "--disable-pip-version-check",
  `torch==${torchVersion}`,
  `torchvision==${torchvisionVersion}`,
  "pillow",
  "numpy",
  "pyinstaller>=6.0,<7",
]);
run(venvPip, [
  "install",
  "--disable-pip-version-check",
  "--no-deps",
  `git+https://github.com/facebookresearch/videoseal.git@${videoSealCommit}`,
]);
run(venvPip, [
  "install",
  "--disable-pip-version-check",
  "PyWavelets",
  "av",
  "calflops",
  "decord",
  "einops",
  "lpips",
  "omegaconf",
  "opencv-python",
  "pandas",
  "pycocotools",
  "pytorch_msssim",
  "requests",
  "safetensors",
  "scikit-image",
  "scipy",
  "setuptools",
  "tensorboard",
  "timm==0.9.16",
  "tqdm",
  "transformers",
  "future",
  "ffmpeg-python",
]);

const sourceCheckout = join(buildRoot, "videoseal-source");
run("git", ["init", "--quiet", sourceCheckout]);
run("git", ["-C", sourceCheckout, "remote", "add", "origin", "https://github.com/facebookresearch/videoseal.git"]);
run("git", ["-C", sourceCheckout, "fetch", "--quiet", "--depth", "1", "origin", videoSealCommit]);
run("git", ["-C", sourceCheckout, "checkout", "--quiet", "FETCH_HEAD"]);

const providerSite = process.platform === "win32"
  ? join(venvRoot, "Lib/site-packages")
  : join(venvRoot, "lib", `python${run(venvPython, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], { encoding: "utf8", stdio: "pipe" }).trim()}`, "site-packages");
const installedVideoSeal = join(providerSite, "videoseal");
mkdirSync(join(installedVideoSeal, "configs"), { recursive: true });
cpSync(join(sourceCheckout, "configs"), join(installedVideoSeal, "configs"), { recursive: true });

const modelRoot = join(generatedRoot, "ckpts");
mkdirSync(modelRoot, { recursive: true });
const healthEnvironment = {
  ...process.env,
  CONTENT_PROTECTION_MODEL_DIR: generatedRoot,
  PYTHONPATH: [providerSite, process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":"),
};
run(venvPython, [sourceProvider, "--health"], { cwd: generatedRoot, env: healthEnvironment });
const modelPath = join(modelRoot, modelFileName);
if (!existsSync(modelPath) || statSync(modelPath).size < modelMinimumBytes) {
  throw new Error(`VideoSeal health check did not produce a valid model: ${modelPath}`);
}

const pyInstallerOutput = join(buildRoot, "pyinstaller-dist");
run(venvPython, [
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--name", "videoseal-provider",
  "--distpath", pyInstallerOutput,
  "--workpath", join(buildRoot, "pyinstaller-work"),
  "--specpath", buildRoot,
  "--collect-all", "videoseal",
  "--collect-all", "timm",
  "--collect-all", "decord",
  "--hidden-import", "ffmpeg",
  "--hidden-import", "torchvision",
  sourceProvider,
]);
const builtProviderDir = join(pyInstallerOutput, "videoseal-provider");
if (!existsSync(builtProviderDir)) throw new Error(`PyInstaller output is missing: ${builtProviderDir}`);
cpSync(builtProviderDir, join(generatedRoot, "provider"), { recursive: true });

const bundledExecutable = providerExecutablePath();
const bundledEnvironment = {
  ...process.env,
  CONTENT_PROTECTION_MODEL_DIR: generatedRoot,
};
run(bundledExecutable, ["--health"], { cwd: generatedRoot, env: bundledEnvironment });

const noticesPath = join(generatedRoot, "THIRD_PARTY_NOTICES.txt");
const videosealLicense = readFileSync(join(sourceCheckout, "LICENSE"), "utf8");
writeFileSync(
  noticesPath,
  [
    "Smart AI Hub Content Protection Runtime",
    "",
    `VideoSeal source revision: ${videoSealCommit}`,
    "VideoSeal license:",
    videosealLicense,
  ].join("\n"),
  "utf8",
);
writeFileSync(
  join(generatedRoot, "content-protection-manifest.json"),
  `${JSON.stringify({
    contractVersion: "content-protection.v1",
    provider: "videoseal",
    providerVersion: "videoseal-1.0",
    videoSealCommit,
    providerCommand: providerExecutableRelativePath(),
    modelPath: `ckpts/${modelFileName}`,
    healthChecked: true,
    targetPlatform: isWindowsTarget ? "windows-x64" : targetPlatform,
    licenseNotice: "THIRD_PARTY_NOTICES.txt",
  }, null, 2)}\n`,
);
assertBundle();
console.log(`[worker-app] generated content protection runtime at ${generatedRoot}`);
