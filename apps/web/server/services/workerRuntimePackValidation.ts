import fs from "fs";
import crypto from "crypto";
import yauzl from "yauzl";

import {
  type WorkerRuntimeId,
  type WorkerRuntimeValidationCheck,
} from "../../shared/workerRuntimeReleases";
import { REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION } from "../../shared/workerRuntime";

const deniedSidecarHashes = new Set([
  "f04671084625130d4ed59f89ebb29000a411247ed2e8491ecfa3216b6e9e0774",
  "4a73439229e3c18034ada679a32f005e7e126376631405062f05e88a5562920e",
]);

// Runner 0.1.1 is the first packaged runner that exposes the capability
// probe consumed by the Worker App model manager. Older archives can execute
// jobs, but cannot provide truthful adapter readiness and would leave the UI
// blocked after installation.
export const MIN_SPEAKER_AWARE_RUNNER_VERSION = "0.1.1";
// Runtime packs published from 2026.09.08.2 onward are required to carry the
// Remotion sidecar. Without it the Worker App correctly withholds the
// `remotion-render` claim hint, leaving Remotion jobs queued indefinitely.
export const MIN_REMOTION_RUNTIME_VERSION = "2026.09.08.2";

export function isRemotionRuntimeReadyManifest(
  manifest: Record<string, unknown> | null,
): boolean {
  return Boolean(
    manifest &&
      stringField(manifest.remotionSidecarScriptPath) ===
        "remotion-sidecar/render.mjs" &&
      stringField(manifest.remotionPlatformContractVersion) ===
        REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION &&
      stringField(manifest.remotionRenderPackageVersion),
  );
}

export function releaseRequiresRemotion(version: string): boolean {
  const parse = (value: string) =>
    value
      .split(/[.+-]/)
      .map((segment) => Number.parseInt(segment, 10))
      .map((segment) => (Number.isFinite(segment) ? segment : 0));
  const actual = parse(version);
  const minimum = parse(MIN_REMOTION_RUNTIME_VERSION);
  for (let index = 0; index < Math.max(actual.length, minimum.length); index += 1) {
    const diff = (actual[index] ?? 0) - (minimum[index] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

export function requiredRuntimeArchiveFiles(
  runtimeId: WorkerRuntimeId
): string[] {
  const common = [
    "runtime-pack/manifest.json",
    "runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js",
    "runtime-pack/hyperframes/node_modules/@hyperframes/producer/package.json",
    "runtime-pack/hyperframes-sidecar/render.mjs",
    "runtime-pack/SHA256SUMS",
    "runtime-pack/SHA256SUMS.sig",
  ];
  if (runtimeId === "hyperframes-wsl2") {
    return [
      ...common,
      "runtime-pack/node/bin/node",
      "runtime-pack/bin/ffmpeg",
      "runtime-pack/bin/ffprobe",
      "runtime-pack/browser-libs/libnspr4.so*",
      "runtime-pack/browser-libs/libnss3.so*",
      "runtime-pack/browser-libs/libnssutil3.so*",
      "runtime-pack/browser-libs/libsmime3.so*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*",
      "runtime-pack/whisper/whisper-cli",
      "runtime-pack/whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin",
      "sidecars/hyperframes-render.exe",
    ];
  }
  if (runtimeId === "hyperframes-macos-arm64") {
    return [
      ...common,
      "runtime-pack/node/bin/node",
      "runtime-pack/bin/ffmpeg",
      "runtime-pack/bin/ffprobe",
      "runtime-pack/browser/*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp*",
      "runtime-pack/whisper/whisper-cli",
      "runtime-pack/whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin",
      "runtime-pack/remotion-sidecar/render.mjs",
      "runtime-pack/remotion-sidecar/node_modules/@smartspec/remotion-render/dist/index.js",
      "runtime-pack/remotion-sidecar/node_modules/@remotion/compositor-darwin-arm64/remotion",
      "runtime-pack/remotion-sidecar/node_modules/@remotion/compositor-darwin-arm64/ffmpeg",
      "runtime-pack/remotion-sidecar/node_modules/@remotion/compositor-darwin-arm64/ffprobe",
      "runtime-pack/remotion-sidecar/node_modules/@esbuild/darwin-arm64/bin/esbuild",
      "runtime-pack/remotion-sidecar/node_modules/@rspack/binding-darwin-arm64/rspack.darwin-arm64.node",
      "sidecars/hyperframes-render",
    ];
  }
  return [
    ...common,
    "runtime-pack/node/node.exe",
    "runtime-pack/bin/ffmpeg.exe",
    "runtime-pack/bin/ffprobe.exe",
    "runtime-pack/whisper/whisper-cli.exe",
    "runtime-pack/whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin",
    "sidecars/hyperframes-render.exe",
  ];
}

function entriesContainFiles(
  entries: Set<string>,
  requiredFiles: string[]
): boolean {
  return requiredFiles.every(file =>
    file.endsWith("*")
      ? [...entries].some(entry => entry.startsWith(file.slice(0, -1)))
      : entries.has(file)
  );
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isSupportedSpeakerAwareRunnerVersion(value: string): boolean {
  const parse = (input: string) => {
    const match = input.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const actual = parse(value);
  const required = parse(MIN_SPEAKER_AWARE_RUNNER_VERSION);
  if (!actual || !required) return false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) return actual[index] > required[index];
  }
  return true;
}

function checksumContains(
  checksumText: string,
  filePath: string,
  expectedHash: string
): boolean {
  return checksumText.split(/\r?\n/).some(line => {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    return Boolean(
      match &&
      match[1].toLowerCase() === expectedHash.toLowerCase() &&
      match[2].trim() === filePath
    );
  });
}

function speakerAwareRunnerPath(runtimeId: WorkerRuntimeId): string {
  return runtimeId === "hyperframes-macos-arm64"
    ? "speaker-aware/speaker-aware-runner"
    : "speaker-aware/speaker-aware-runner.exe";
}

function validateSpeakerAwareRunnerMetadata(
  manifest: Record<string, unknown> | null,
  entries: Set<string>,
  runtimeId: WorkerRuntimeId,
  checksumText: string
): boolean {
  const raw = manifest?.speakerAwareRunner;
  // Existing runtime packs remain valid when they predate Feature 179. New
  // packs that advertise the runner must prove the exact file and checksum.
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== "object" || Array.isArray(raw)) return false;
  const runner = raw as Record<string, unknown>;
  const relativePath = stringField(runner.path);
  const version = stringField(runner.version);
  const contractVersion = stringField(runner.contractVersion);
  const sha256 = stringField(runner.sha256).toLowerCase();
  const expectedPath = speakerAwareRunnerPath(runtimeId);
  if (
    relativePath !== expectedPath ||
    !version ||
    !isSupportedSpeakerAwareRunnerVersion(version) ||
    contractVersion !== "feature-179-v1" ||
    !/^[a-f0-9]{64}$/.test(sha256)
  ) {
    return false;
  }
  const archivePath = `runtime-pack/${relativePath}`;
  return (
    entries.has(archivePath) &&
    checksumContains(checksumText, archivePath, sha256)
  );
}

function verifyChecksumSignature(
  checksumText: string,
  signatureText: string,
  publicKey: string | null | undefined
): boolean {
  if (!publicKey) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureText)) return false;
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureText, "base64");
    if (signature.length !== 64) return false;
    const normalizedPublicKey = publicKey
      .replaceAll("\\r", "\r")
      .replaceAll("\\n", "\n")
      .trim();
    return crypto.verify(
      null,
      Buffer.from(checksumText, "utf8"),
      crypto.createPublicKey(normalizedPublicKey),
      signature
    );
  } catch {
    return false;
  }
}

function verifyContentProtectionManifestSignature(
  manifest: Record<string, unknown> | null,
  publicKey: string | null | undefined,
): boolean {
  if (!manifest || !publicKey) return false;
  const signatureText = stringField(manifest.signature);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureText)) return false;
  try {
    const payload = { ...manifest };
    delete payload.signature;
    return crypto.verify(
      null,
      Buffer.from(JSON.stringify(payload), "utf8"),
      crypto.createPublicKey(publicKey),
      Buffer.from(signatureText, "base64"),
    );
  } catch {
    return false;
  }
}

export function isOfficialRuntimePackManifest(
  manifest: Record<string, unknown> | null,
  runtimeId: WorkerRuntimeId | string,
  options: { strict?: boolean } = {}
): manifest is Record<string, unknown> {
  const strict = options.strict === true;
  if (!manifest || manifest.allowed !== true) return false;
  if (
    (strict && stringField(manifest.runtimeId) !== runtimeId) ||
    (!strict &&
      stringField(manifest.runtimeId) &&
      stringField(manifest.runtimeId) !== runtimeId)
  )
    return false;
  const sidecarSha256 = stringField(manifest.sidecarSha256).toLowerCase();
  if (
    (strict && !/^[a-f0-9]{64}$/.test(sidecarSha256)) ||
    deniedSidecarHashes.has(sidecarSha256)
  )
    return false;
  const runtimePlatform = stringField(manifest.runtimePlatform).toLowerCase();
  if (runtimeId === "hyperframes-wsl2" && !/wsl2|linux/.test(runtimePlatform))
    return false;
  if (
    runtimeId === "hyperframes-windows-x64" &&
    !/windows|win/.test(runtimePlatform)
  )
    return false;
  if (
    runtimeId === "hyperframes-macos-arm64" &&
    !/macos|darwin/.test(runtimePlatform)
  )
    return false;
  const architecture = stringField(manifest.architecture).toLowerCase();
  if (
    strict &&
    runtimeId === "hyperframes-macos-arm64" &&
    !architecture.includes("arm64")
  )
    return false;
  if (
    strict &&
    runtimeId !== "hyperframes-macos-arm64" &&
    !["x64", "x86_64"].includes(architecture)
  )
    return false;
  if (stringField(manifest.rendererKind) !== "hyperframes_cli_official")
    return false;
  if (
    stringField(manifest.sidecarLauncher) !==
    "smart-ai-hub-hyperframes-node-launcher"
  )
    return false;
  if (
    stringField(manifest.sidecarScriptPath) !== "hyperframes-sidecar/render.mjs"
  )
    return false;
  const hyperframesVersion = stringField(
    manifest.hyperframesVersion
  ).toLowerCase();
  const blockedText = [
    stringField(manifest.denyReason),
    hyperframesVersion,
    stringField(manifest.runtimeKind),
    stringField(manifest.sidecarKind),
    runtimePlatform,
  ].join(" ");
  if (
    [
      "mock",
      "placeholder",
      "smoke",
      "testsrc",
      "lavfi",
      "ffmpeg-render-sidecar",
      "diagnostic",
      "fallback",
    ].some(marker => blockedText.includes(marker))
  )
    return false;
  if (
    !hyperframesVersion.includes("hyperframes@") ||
    !hyperframesVersion.includes("@hyperframes/producer@")
  )
    return false;
  if (
    stringField(manifest.checksumFile) !== "SHA256SUMS" ||
    stringField(manifest.signatureFile) !== "SHA256SUMS.sig"
  )
    return false;
  const transcription = manifest.transcription;
  if (
    !transcription ||
    typeof transcription !== "object" ||
    Array.isArray(transcription)
  )
    return false;
  const record = transcription as Record<string, unknown>;
  const binaryPath =
    runtimeId === "hyperframes-windows-x64"
      ? "whisper/whisper-cli.exe"
      : "whisper/whisper-cli";
  return (
    stringField(record.engine) === "whisper.cpp" &&
    Boolean(stringField(record.version)) &&
    stringField(record.binaryPath) === binaryPath &&
    /^[a-f0-9]{64}$/i.test(stringField(record.binarySha256)) &&
    stringField(record.model) === "large-v3" &&
    stringField(record.modelPath) ===
      "whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin" &&
    /^[a-f0-9]{64}$/i.test(stringField(record.modelSha256)) &&
    /^https:\/\//i.test(stringField(record.modelUrl))
  );
}

// SHA256SUMS contains one line per bundled dependency and is several MB for
// the official runtime. Keep metadata bounded without imposing a 2 GiB
// readFileSync-style limit on the archive itself.
const MAX_VALIDATION_METADATA_BYTES = 16 * 1024 * 1024;

type RuntimeArchiveMetadata = {
  entries: Set<string>;
  files: Map<string, string>;
};

const CONTENT_PROTECTION_RUNTIME_ID = "content-protection-windows-x64";
const CONTENT_PROTECTION_VIDEOSEAL_COMMIT =
  "870ca7fb33578b90f14c602016b6c2788096226e";
const CONTENT_PROTECTION_MIN_MODEL_BYTES = 100 * 1024 * 1024;

type ContentProtectionArchiveMetadata = {
  entries: Set<string>;
  entrySizes: Map<string, number>;
  manifestText: string;
  providerHeader: string;
};

async function readRuntimeArchiveMetadata(
  filePath: string
): Promise<RuntimeArchiveMetadata> {
  const zip = await yauzl.openPromise(filePath, {
    autoClose: false,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const entries = new Set<string>();
  const files = new Map<string, string>();
  try {
    for await (const entry of zip.eachEntry()) {
      if (entries.has(entry.fileName)) {
        throw new Error(`Duplicate ZIP entry: ${entry.fileName}`);
      }
      entries.add(entry.fileName);
      if (
        entry.fileName.endsWith("/") ||
        ![
          "runtime-pack/manifest.json",
          "runtime-pack/SHA256SUMS",
          "runtime-pack/SHA256SUMS.sig",
        ].includes(entry.fileName)
      ) {
        continue;
      }
      if (entry.uncompressedSize > MAX_VALIDATION_METADATA_BYTES) {
        throw new Error(`ZIP metadata entry is unexpectedly large: ${entry.fileName}`);
      }
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_VALIDATION_METADATA_BYTES) {
          stream.destroy();
          throw new Error(`ZIP metadata entry exceeded the validation limit: ${entry.fileName}`);
        }
        chunks.push(buffer);
      }
      files.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
    }
    return { entries, files };
  } finally {
    zip.close();
  }
}

async function readContentProtectionArchiveMetadata(
  filePath: string,
): Promise<ContentProtectionArchiveMetadata> {
  const zip = await yauzl.openPromise(filePath, {
    autoClose: false,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const entries = new Set<string>();
  const entrySizes = new Map<string, number>();
  let manifestText = "";
  let providerHeader = "";
  try {
    for await (const entry of zip.eachEntry()) {
      if (entries.has(entry.fileName)) {
        throw new Error(`Duplicate ZIP entry: ${entry.fileName}`);
      }
      if (
        entry.fileName.startsWith("/") ||
        entry.fileName.includes("\\") ||
        entry.fileName.split("/").includes("..")
      ) {
        throw new Error(`Unsafe ZIP entry: ${entry.fileName}`);
      }
      entries.add(entry.fileName);
      entrySizes.set(entry.fileName, entry.uncompressedSize);
      if (entry.fileName.endsWith("/")) continue;
      if (
        entry.fileName !== "content-protection-manifest.json" &&
        entry.fileName !== "provider/videoseal-provider.exe"
      ) {
        continue;
      }
      if (
        entry.fileName === "content-protection-manifest.json" &&
        entry.uncompressedSize > MAX_VALIDATION_METADATA_BYTES
      ) {
        throw new Error(`ZIP metadata entry is unexpectedly large: ${entry.fileName}`);
      }
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (entry.fileName === "provider/videoseal-provider.exe" && size > 2) {
          chunks.push(buffer.subarray(0, Math.max(0, 2 - (size - buffer.length))));
          stream.destroy();
          break;
        }
        if (size > MAX_VALIDATION_METADATA_BYTES) {
          stream.destroy();
          throw new Error(`ZIP metadata entry exceeded the validation limit: ${entry.fileName}`);
        }
        chunks.push(buffer);
      }
      if (entry.fileName === "content-protection-manifest.json") {
        manifestText = Buffer.concat(chunks).toString("utf8");
      } else {
        providerHeader = Buffer.concat(chunks).toString("ascii");
      }
    }
    return { entries, entrySizes, manifestText, providerHeader };
  } finally {
    zip.close();
  }
}

function isSafeContentProtectionPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

export async function validateContentProtectionRuntimeArchive(input: {
  filePath: string;
  fileName: string;
  version: string;
  publicKey?: string | null;
}): Promise<{
  manifest: Record<string, unknown> | null;
  checks: WorkerRuntimeValidationCheck[];
  valid: boolean;
}> {
  const checks: WorkerRuntimeValidationCheck[] = [];
  const check = (id: string, ok: boolean, message: string) =>
    checks.push({ id, status: ok ? "ok" : "error", message });
  let archive: ContentProtectionArchiveMetadata;
  try {
    archive = await readContentProtectionArchiveMetadata(input.filePath);
  } catch {
    check("archive", false, "The uploaded Content Protection file is not a readable ZIP archive.");
    return { manifest: null, checks, valid: false };
  }
  const expectedName = `smart-ai-hub-content-protection-runtime-windows-x64-${input.version}.zip`;
  check("filename", input.fileName === expectedName, `Filename must be ${expectedName}.`);
  let manifest: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(archive.manifestText);
    manifest = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    manifest = null;
  }
  check("manifest", Boolean(manifest), "Content Protection manifest is present and valid JSON.");
  check(
    "manifest_identity",
    Boolean(
      manifest &&
        manifest.contractVersion === "content-protection.runtime.v1" &&
        manifest.runtimeId === CONTENT_PROTECTION_RUNTIME_ID &&
        manifest.version === input.version &&
        manifest.targetPlatform === "windows-x64" &&
        manifest.provider === "videoseal" &&
        manifest.providerVersion === "videoseal-1.0" &&
        manifest.videoSealCommit === CONTENT_PROTECTION_VIDEOSEAL_COMMIT &&
        manifest.healthChecked === true &&
        stringField(manifest.requiresWorkerRuntimeVersion).length > 0,
    ),
    "Content Protection manifest identity and health contract are valid.",
  );
  check(
    "signature",
    verifyContentProtectionManifestSignature(manifest, input.publicKey),
    "Content Protection manifest signature verifies against the configured Ed25519 public key.",
  );
  const providerPath = stringField(manifest?.providerCommand);
  const modelPath = stringField(manifest?.modelPath);
  const licensePath = stringField(manifest?.licenseNotice);
  check(
    "required_files",
    providerPath === "provider/videoseal-provider.exe" &&
      modelPath.length > 0 &&
      licensePath.length > 0 &&
      isSafeContentProtectionPath(providerPath) &&
      isSafeContentProtectionPath(modelPath) &&
      isSafeContentProtectionPath(licensePath) &&
      archive.entries.has(providerPath) &&
      archive.entries.has(modelPath) &&
      archive.entries.has(licensePath),
    "Provider, model, and license files are present with safe paths.",
  );
  check(
    "provider_binary",
    providerPath === "provider/videoseal-provider.exe" && archive.providerHeader === "MZ",
    "Content Protection provider is a Windows PE executable.",
  );
  check(
    "model_size",
    Boolean(modelPath && (archive.entrySizes.get(modelPath) ?? 0) >= CONTENT_PROTECTION_MIN_MODEL_BYTES),
    "Content Protection model meets the minimum packaged size.",
  );
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const boundPaths = new Set(
    files.flatMap(file =>
      file && typeof file === "object" && !Array.isArray(file)
        ? [stringField((file as Record<string, unknown>).path)]
        : [],
    ),
  );
  check(
    "file_bindings",
    files.length > 0 &&
      boundPaths.has(providerPath) &&
      boundPaths.has(modelPath) &&
      boundPaths.has(licensePath) &&
      files.every(file => {
      if (!file || typeof file !== "object" || Array.isArray(file)) return false;
      const record = file as Record<string, unknown>;
      return isSafeContentProtectionPath(record.path) &&
        /^[a-f0-9]{64}$/i.test(stringField(record.sha256)) &&
        archive.entries.has(record.path);
      }),
    "Manifest file bindings are safe and cover packaged entries.",
  );
  let archiveStat: fs.Stats | null = null;
  try {
    archiveStat = fs.statSync(input.filePath);
  } catch {
    archiveStat = null;
  }
  check("archive_size", Boolean(archiveStat?.isFile() && archiveStat.size > 0), "Archive has a non-zero size.");
  return { manifest, checks, valid: checks.every(item => item.status === "ok") };
}

export async function validateRuntimePackArchive(input: {
  filePath: string;
  fileName: string;
  version: string;
  runtimeId: WorkerRuntimeId;
  publicKey?: string | null;
}): Promise<{
  manifest: Record<string, unknown> | null;
  checks: WorkerRuntimeValidationCheck[];
  valid: boolean;
}> {
  const checks: WorkerRuntimeValidationCheck[] = [];
  const check = (id: string, ok: boolean, message: string) =>
    checks.push({ id, status: ok ? "ok" : "error", message });
  let archive: RuntimeArchiveMetadata;
  try {
    archive = await readRuntimeArchiveMetadata(input.filePath);
  } catch {
    check("archive", false, "The uploaded file is not a readable ZIP archive.");
    return { manifest: null, checks, valid: false };
  }
  const entries = archive.entries;
  const expectedName = `smart-ai-hub-worker-runtime-${input.runtimeId}-${input.version}.zip`;
  check(
    "filename",
    input.fileName === expectedName,
    `Filename must be ${expectedName}.`
  );
  let manifest: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(
      archive.files.get("runtime-pack/manifest.json") ?? ""
    );
    manifest =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
  } catch {
    manifest = null;
  }
  check(
    "manifest",
    Boolean(manifest),
    "Runtime manifest.json is present and valid JSON."
  );
  check(
    "manifest_identity",
    Boolean(
      manifest &&
      isOfficialRuntimePackManifest(manifest, input.runtimeId, {
        strict: true,
      }) &&
      stringField(manifest.version) === input.version
    ),
    "Manifest identity and official runtime policy match the selected release."
  );
  check(
    "required_files",
    entriesContainFiles(entries, requiredRuntimeArchiveFiles(input.runtimeId)),
    "All platform runtime, HyperFrames, media, and transcription files are present."
  );
  const remotionRequired =
    releaseRequiresRemotion(input.version);
  const remotionEntriesPresent =
    entries.has("runtime-pack/remotion-sidecar/render.mjs") &&
    entries.has("runtime-pack/remotion-sidecar/node_modules/@smartspec/remotion-render/dist/index.js");
  check(
    "remotion_sidecar",
    !remotionRequired ||
      (isRemotionRuntimeReadyManifest(manifest) && remotionEntriesPresent),
    "Remotion sidecar, dependency tree, and platform contract are present."
  );
  const signature =
    archive.files.get("runtime-pack/SHA256SUMS.sig")?.trim() ?? "";
  check(
    "signature",
    signature.length >= 16 &&
      !signature.includes("placeholder-signature-required-before-release"),
    "Runtime signature is present and is not a placeholder."
  );
  const sidecarHash = stringField(manifest?.sidecarSha256).toLowerCase();
  check(
    "sidecar_policy",
    !deniedSidecarHashes.has(sidecarHash),
    "The runtime sidecar is not a mock or diagnostic renderer."
  );
  const checksumText = archive.files.get("runtime-pack/SHA256SUMS") ?? "";
  check(
    "signature_verification",
    verifyChecksumSignature(checksumText, signature, input.publicKey),
    "Runtime signature verifies against the configured Ed25519 public key."
  );
  const transcription =
    manifest?.transcription &&
    typeof manifest.transcription === "object" &&
    !Array.isArray(manifest.transcription)
      ? (manifest.transcription as Record<string, unknown>)
      : null;
  const transcriptionBinaryPath = stringField(transcription?.binaryPath);
  const transcriptionModelPath = stringField(transcription?.modelPath);
  const checksumPathsValid = Boolean(
    transcription &&
    checksumContains(
      checksumText,
      `runtime-pack/${transcriptionBinaryPath}`,
      stringField(transcription.binarySha256)
    ) &&
    checksumContains(
      checksumText,
      `runtime-pack/${transcriptionModelPath}`,
      stringField(transcription.modelSha256)
    ) &&
    checksumContains(
      checksumText,
      `sidecars/${
        input.runtimeId === "hyperframes-wsl2" ||
        input.runtimeId === "hyperframes-windows-x64"
          ? "hyperframes-render.exe"
          : "hyperframes-render"
      }`,
      sidecarHash
    )
  );
  check(
    "checksum_bindings",
    checksumPathsValid,
    "SHA256SUMS binds the transcription binaries, large-v3 model, and runtime sidecar to the manifest."
  );
  check(
    "speaker_aware_runner",
    validateSpeakerAwareRunnerMetadata(manifest, entries, input.runtimeId, checksumText),
    `A declared Feature 179 runner (>= ${MIN_SPEAKER_AWARE_RUNNER_VERSION}) exists in the archive and is bound by SHA256SUMS.`
  );
  let archiveStat: fs.Stats | null = null;
  try {
    archiveStat = fs.statSync(input.filePath);
  } catch {
    archiveStat = null;
  }
  check(
    "archive_size",
    Boolean(archiveStat?.isFile() && archiveStat.size > 0),
    "Archive has a non-zero size."
  );
  return {
    manifest,
    checks,
    valid: checks.every(item => item.status === "ok"),
  };
}
