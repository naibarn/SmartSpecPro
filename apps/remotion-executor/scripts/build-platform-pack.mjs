import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");
const flag = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const executorRoot = path.resolve(
  flag("--executor-root")
    ?? process.env.REMOTION_EXECUTOR_ROOT
    ?? path.join(scriptDir, ".."),
);
const repositoryRoot = path.resolve(executorRoot, "../..");
function resolveInputPath(value, fallback) {
  const candidate = value ?? fallback;
  if (path.isAbsolute(candidate)) return path.resolve(candidate);
  const fromCwd = path.resolve(candidate);
  if (fsSync.existsSync(fromCwd)) return fromCwd;
  return path.resolve(repositoryRoot, candidate);
}
const root = resolveInputPath(
  flag("--pack-root") ?? process.env.REMOTION_EXECUTOR_PACK_ROOT,
  "runtime-pack",
);
const outputDir = resolveInputPath(
  flag("--output-dir") ?? process.env.REMOTION_EXECUTOR_OUTPUT_DIR,
  "dist/runtime-packs",
);
const executorDist = path.resolve(
  flag("--executor-dist")
    ?? process.env.REMOTION_EXECUTOR_DIST
    ?? path.join(executorRoot, "dist"),
);
const runtimeId = flag("--target") ?? process.env.REMOTION_EXECUTOR_RUNTIME_ID ?? "";
const version = flag("--version") ?? process.env.REMOTION_EXECUTOR_VERSION ?? "";
const privateKey = process.env.SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY?.trim() ?? "";
const targetConfigPath = path.join(executorRoot, "release", "targets", `${runtimeId}.json`);

if (!/^remotion-executor-(windows-x64|macos-arm64|macos-x64)$/.test(runtimeId) || !version || !privateKey) {
  throw new Error("runtime_pack_release_requires_runtime_id_version_and_signing_key");
}
const targetConfig = JSON.parse(await fs.readFile(targetConfigPath, "utf8"));
if (targetConfig.runtimeId !== runtimeId) throw new Error("runtime_pack_target_config_mismatch");
await fs.access(path.join(root, "remotion-sidecar", "render.mjs"));
await fs.access(path.join(root, "manifest.json"));
if (path.basename(root) !== "runtime-pack") throw new Error("runtime_pack_root_must_be_named_runtime-pack");
await fs.mkdir(outputDir, { recursive: true });

const fileName = `smart-ai-hub-remotion-executor-${runtimeId}-${version}.zip`;
const archivePath = path.join(outputDir, fileName);
await fs.rm(archivePath, { force: true });
const stagingParent = await fs.mkdtemp(path.join(os.tmpdir(), "smartaihub-remotion-pack-"));
const stagingRuntimePack = path.join(stagingParent, "runtime-pack");
try {
  await fs.cp(root, stagingRuntimePack, { recursive: true, force: true });
  const requiredRuntimePaths = [
    targetConfig.nodePath,
    targetConfig.browserPath,
    targetConfig.ffmpegPath,
    targetConfig.ffprobePath,
    targetConfig.fontsPath,
    targetConfig.sidecarPath,
  ];
  for (const relativePath of requiredRuntimePaths) {
    await fs.access(path.join(stagingRuntimePack, relativePath));
  }
  const sidecarBytes = await fs.readFile(path.join(stagingRuntimePack, targetConfig.sidecarPath));
  const sidecarSha256 = crypto.createHash("sha256").update(sidecarBytes).digest("hex");
  await fs.writeFile(path.join(stagingRuntimePack, "manifest.json"), `${JSON.stringify({
    schemaVersion: "2026-08-16.1",
    runtimeId,
    runtimePackId: runtimeId,
    version,
    runtimeKind: "standalone_remotion_executor",
    runtimePlatform: targetConfig.runtimePlatform === "windows" ? "windows-x64" : `macos-${targetConfig.architecture}`,
    architecture: targetConfig.architecture,
    executionEnvironment: targetConfig.executionEnvironment,
    allowed: true,
    remotionPlatformContractVersion: "2026-08-04.2",
    nodePath: targetConfig.nodePath,
    browserPath: targetConfig.browserPath,
    ffmpegPath: targetConfig.ffmpegPath,
    ffprobePath: targetConfig.ffprobePath,
    fontsPath: targetConfig.fontsPath,
    sidecarPath: targetConfig.sidecarPath,
    sidecarSha256,
  }, null, 2)}\n`);
  await fs.access(path.join(executorDist, "cli.js"));
  await fs.cp(executorDist, path.join(stagingRuntimePack, "executor", "dist"), { recursive: true, force: true });
  await fs.copyFile(path.join(executorRoot, "package.json"), path.join(stagingRuntimePack, "executor", "package.json"));
  await fs.cp(path.join(executorRoot, "packaging"), path.join(stagingRuntimePack, "executor", "packaging"), { recursive: true, force: true }).catch(() => {});
  const publicKey = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  await fs.writeFile(path.join(stagingRuntimePack, "executor", "packaging", "runtime-pack-public-key.pem"), publicKey, { mode: 0o644 });
  try {
    await exec("zip", ["-qr", archivePath, "runtime-pack"], { cwd: stagingParent, maxBuffer: 1024 * 1024 });
  } catch (error) {
    // Release hosts do not always have Info-ZIP installed. Keep the archive
    // format identical while making pack generation self-contained in Node.
    if (!error || !["ENOENT", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"].includes(error.code)) throw error;
    const zip = new AdmZip();
    zip.addLocalFolder(stagingRuntimePack, "runtime-pack");
    zip.writeZip(archivePath);
  }
} finally {
  await fs.rm(stagingParent, { recursive: true, force: true });
}
const archive = await fs.readFile(archivePath);
const archiveSha256 = crypto.createHash("sha256").update(archive).digest("hex");
const archiveSignature = crypto.sign(null, Buffer.from(archiveSha256), crypto.createPrivateKey(privateKey)).toString("base64");
let entries;
try {
  entries = (await exec("unzip", ["-Z1", archivePath], { maxBuffer: 16 * 1024 * 1024 })).stdout
    .split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  entries = new AdmZip(archivePath).getEntries().map((entry) => entry.entryName).filter(Boolean);
}
const manifest = {
  schemaVersion: "2026-08-16.1",
  runtimeId,
  runtimePackId: runtimeId,
  version,
  runtimeKind: "standalone_remotion_executor",
  runtimePlatform: runtimeId.includes("windows") ? "windows" : "macos",
  platform: runtimeId.includes("windows") ? "windows" : "macos",
  architecture: runtimeId.endsWith("arm64") ? "arm64" : "x64",
  executionEnvironment: "native",
  allowed: true,
  platformContractVersion: "2026-08-04.2",
  nodePath: targetConfig.nodePath,
  browserPath: targetConfig.browserPath,
  ffmpegPath: targetConfig.ffmpegPath,
  ffprobePath: targetConfig.ffprobePath,
  fontsPath: targetConfig.fontsPath,
  sidecarPath: targetConfig.sidecarPath,
  checksumFile: "SHA256SUMS",
  checksumSignatureFile: "SHA256SUMS.sig",
  signingAlgorithm: "ed25519",
  archiveSha256,
  archiveSizeBytes: archive.byteLength,
  archiveSignature,
  archiveFileName: fileName,
  archiveEntries: entries,
};
await fs.writeFile(`${archivePath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ archivePath, manifestPath: `${archivePath}.manifest.json`, archiveSha256, archiveSizeBytes: archive.byteLength }));
