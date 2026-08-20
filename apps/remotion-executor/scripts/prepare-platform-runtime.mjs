import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const executorRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(executorRoot, "../..");
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const runtimeId = arg("--target") ?? process.env.REMOTION_EXECUTOR_RUNTIME_ID ?? "";
const outputRoot = path.resolve(
  arg("--output") ?? process.env.REMOTION_EXECUTOR_PREPARED_RUNTIME_ROOT ?? path.join(os.tmpdir(), "smartaihub-remotion-runtime"),
);
const runtimeRoot = path.join(outputRoot, "runtime-pack");
const npmExecPath = process.env.npm_execpath?.trim();
const npmCommand = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmPrefixArgs = npmExecPath ? [npmExecPath] : [];

const target = {
  "remotion-executor-windows-x64": {
    platform: "win32",
    architecture: "x64",
    nodePath: "node/node.exe",
    browserPath: "browser/chrome.exe",
    ffmpegPath: "bin/ffmpeg.exe",
    ffprobePath: "bin/ffprobe.exe",
  },
  "remotion-executor-macos-arm64": {
    platform: "darwin",
    architecture: "arm64",
    nodePath: "node/bin/node",
    browserPath: "browser/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ffmpegPath: "bin/ffmpeg",
    ffprobePath: "bin/ffprobe",
  },
  "remotion-executor-macos-x64": {
    platform: "darwin",
    architecture: "x64",
    nodePath: "node/bin/node",
    browserPath: "browser/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ffmpegPath: "bin/ffmpeg",
    ffprobePath: "bin/ffprobe",
  },
}[runtimeId];

if (!target) throw new Error(`unsupported_runtime_id:${runtimeId || "missing"}`);
if (process.platform !== target.platform || process.arch !== target.architecture) {
  throw new Error(`native_runtime_host_mismatch:expected=${target.platform}/${target.architecture}:actual=${process.platform}/${process.arch}`);
}

function absoluteInput(value, label) {
  const resolved = path.resolve(value ?? "");
  if (!value || !fsSync.existsSync(resolved)) throw new Error(`${label}_missing:${resolved}`);
  return resolved;
}

async function copyFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  if (process.platform !== "win32") await fs.chmod(destination, 0o755).catch(() => {});
}

async function copyDirectory(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(source, destination, { recursive: true, force: true });
}

async function downloadFonts(destination) {
  await fs.mkdir(destination, { recursive: true });
  const cssResponse = await fetch("https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@100..900");
  if (!cssResponse.ok) throw new Error(`font_download_css_failed:${cssResponse.status}`);
  const css = await cssResponse.text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((match) => match[1]);
  if (urls.length === 0) throw new Error("font_download_urls_missing");
  for (const [index, url] of [...new Set(urls)].entries()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`font_download_failed:${response.status}`);
    const extension = path.extname(new URL(url).pathname) || ".font";
    await fs.writeFile(path.join(destination, `NotoSansThai-${index + 1}${extension}`), Buffer.from(await response.arrayBuffer()));
  }
  await fs.writeFile(path.join(destination, "OFL.txt"), "Noto Sans Thai is distributed under the SIL Open Font License.\nSource: https://fonts.google.com/specimen/Noto+Sans+Thai\n");
}

async function prepareSidecar(destination) {
  const sourceDir = process.env.REMOTION_EXECUTOR_SIDECAR_DIR?.trim();
  const sourceScript = process.env.REMOTION_EXECUTOR_SIDECAR_SCRIPT?.trim()
    || path.join(repositoryRoot, "apps/worker-app/runtime-sidecar-remotion/render.mjs");
  const sidecarDir = path.join(destination, "remotion-sidecar");
  await fs.mkdir(sidecarDir, { recursive: true });
  await fs.copyFile(absoluteInput(sourceScript, "remotion_sidecar_script"), path.join(sidecarDir, "render.mjs"));

  if (sourceDir) {
    const source = absoluteInput(sourceDir, "remotion_sidecar_dir");
    await fs.copyFile(path.join(source, "package.json"), path.join(sidecarDir, "package.json"));
    await copyDirectory(path.join(source, "node_modules"), path.join(sidecarDir, "node_modules"));
  } else {
    const packageJson = {
      name: "smart-ai-hub-remotion-sidecar-runtime",
      private: true,
      type: "module",
      dependencies: {
        "@remotion/bundler": "4.0.496",
        "@remotion/renderer": "4.0.496",
        "@smartspec/remotion-render": "file:smartspec-remotion-render.tgz",
      },
    };
    await fs.writeFile(path.join(sidecarDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
    const packOutput = await fs.mkdtemp(path.join(os.tmpdir(), "smartaihub-remotion-render-pack-"));
    try {
      execFileSync(npmCommand, [...npmPrefixArgs, "pack", path.join(repositoryRoot, "packages/remotion-render"), "--pack-destination", packOutput], { cwd: repositoryRoot, stdio: "inherit" });
      const tarball = (await fs.readdir(packOutput)).find((name) => name.endsWith(".tgz"));
      if (!tarball) throw new Error("remotion_render_package_missing");
      await fs.copyFile(path.join(packOutput, tarball), path.join(sidecarDir, "smartspec-remotion-render.tgz"));
      execFileSync(npmCommand, [...npmPrefixArgs, "install", "--ignore-scripts", "--no-package-lock", "--prefix", sidecarDir], { cwd: sidecarDir, stdio: "inherit" });
    } finally {
      await fs.rm(packOutput, { recursive: true, force: true });
    }
  }
  await fs.access(path.join(sidecarDir, "node_modules/@smartspec/remotion-render/dist/index.js"));
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(runtimeRoot, { recursive: true });
const nodeSource = absoluteInput(process.env.REMOTION_EXECUTOR_NODE_PATH ?? process.execPath, "node");
const chromeSource = absoluteInput(process.env.REMOTION_EXECUTOR_CHROME_PATH, "chrome");
const ffmpegSource = absoluteInput(process.env.REMOTION_EXECUTOR_FFMPEG_PATH, "ffmpeg");
const ffprobeSource = absoluteInput(process.env.REMOTION_EXECUTOR_FFPROBE_PATH, "ffprobe");

await copyFile(nodeSource, path.join(runtimeRoot, target.nodePath));
await copyFile(ffmpegSource, path.join(runtimeRoot, target.ffmpegPath));
await copyFile(ffprobeSource, path.join(runtimeRoot, target.ffprobePath));

if (process.platform === "win32") {
  await copyDirectory(path.dirname(chromeSource), path.join(runtimeRoot, "browser"));
} else {
  const appMarker = chromeSource.indexOf(".app/");
  const appRoot = appMarker >= 0 ? chromeSource.slice(0, appMarker + 4) : chromeSource;
  await copyDirectory(appRoot, path.join(runtimeRoot, "browser", "Google Chrome for Testing.app"));
}

const fontSource = process.env.REMOTION_EXECUTOR_FONT_DIR?.trim();
if (fontSource) await copyDirectory(absoluteInput(fontSource, "fonts"), path.join(runtimeRoot, "fonts"));
else await downloadFonts(path.join(runtimeRoot, "fonts"));
await prepareSidecar(runtimeRoot);
await fs.writeFile(path.join(runtimeRoot, "THIRD_PARTY_NOTICES.txt"), "SmartAIHub Remotion Executor runtime pack. See the bundled package metadata and fonts/OFL.txt for third-party notices.\n");
// The pack builder replaces this with the signed, target-specific manifest.
// Keeping a valid placeholder here lets the same prepared root be inspected by
// `doctor` before packaging without treating an unbuilt staging directory as a
// release artifact.
await fs.writeFile(path.join(runtimeRoot, "manifest.json"), `${JSON.stringify({
  schemaVersion: "2026-08-16.1",
  runtimeId,
  runtimePlatform: runtimeId.includes("windows") ? "windows-x64" : `macos-${target.architecture}`,
  architecture: target.architecture,
  allowed: true,
  remotionPlatformContractVersion: "2026-08-04.2",
  nodePath: target.nodePath,
  browserPath: target.browserPath,
  ffmpegPath: target.ffmpegPath,
  ffprobePath: target.ffprobePath,
  fontsPath: "fonts",
  sidecarPath: "remotion-sidecar/render.mjs",
  sidecarSha256: crypto.createHash("sha256").update(await fs.readFile(path.join(runtimeRoot, "remotion-sidecar/render.mjs"))).digest("hex"),
}, null, 2)}\n`);
console.log(JSON.stringify({ runtimeId, runtimeRoot, node: target.nodePath, browser: target.browserPath, ffmpeg: target.ffmpegPath, ffprobe: target.ffprobePath }));
