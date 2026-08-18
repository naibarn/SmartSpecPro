import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const flag = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const root = path.resolve(flag("--pack-root") ?? process.env.REMOTION_EXECUTOR_PACK_ROOT ?? "runtime-pack");
const outputDir = path.resolve(flag("--output-dir") ?? process.env.REMOTION_EXECUTOR_OUTPUT_DIR ?? "dist/runtime-packs");
const runtimeId = flag("--target") ?? process.env.REMOTION_EXECUTOR_RUNTIME_ID ?? "";
const version = flag("--version") ?? process.env.REMOTION_EXECUTOR_VERSION ?? "";
const privateKey = process.env.SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY?.trim() ?? "";

if (!/^remotion-executor-(windows-x64|macos-arm64|macos-x64)$/.test(runtimeId) || !version || !privateKey) {
  throw new Error("runtime_pack_release_requires_runtime_id_version_and_signing_key");
}
await fs.access(path.join(root, "remotion-sidecar", "render.mjs"));
await fs.access(path.join(root, "manifest.json"));
if (path.basename(root) !== "runtime-pack") throw new Error("runtime_pack_root_must_be_named_runtime-pack");
await fs.mkdir(outputDir, { recursive: true });

const fileName = `smart-ai-hub-remotion-executor-${runtimeId}-${version}.zip`;
const archivePath = path.join(outputDir, fileName);
await fs.rm(archivePath, { force: true });
await exec("zip", ["-qr", archivePath, "runtime-pack"], { cwd: path.dirname(root), maxBuffer: 1024 * 1024 });
const archive = await fs.readFile(archivePath);
const archiveSha256 = crypto.createHash("sha256").update(archive).digest("hex");
const archiveSignature = crypto.sign(null, Buffer.from(archiveSha256), crypto.createPrivateKey(privateKey)).toString("base64");
const entries = (await exec("unzip", ["-Z1", archivePath], { maxBuffer: 16 * 1024 * 1024 })).stdout
  .split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
const manifest = {
  schemaVersion: "2026-08-16.1",
  runtimeId,
  runtimePackId: runtimeId,
  version,
  runtimeKind: "standalone_remotion_executor",
  runtimePlatform: runtimeId.includes("windows") ? "windows" : "macos",
  architecture: runtimeId.endsWith("arm64") ? "arm64" : "x64",
  executionEnvironment: "native",
  allowed: true,
  sidecarPath: "remotion-sidecar/render.mjs",
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
