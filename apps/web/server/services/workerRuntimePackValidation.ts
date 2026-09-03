import fs from "fs";
import crypto from "crypto";
import yauzl from "yauzl";

import {
  type WorkerRuntimeId,
  type WorkerRuntimeValidationCheck,
} from "../../shared/workerRuntimeReleases";

const deniedSidecarHashes = new Set([
  "f04671084625130d4ed59f89ebb29000a411247ed2e8491ecfa3216b6e9e0774",
  "4a73439229e3c18034ada679a32f005e7e126376631405062f05e88a5562920e",
]);

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

export async function validateRuntimePackArchive(input: {
  filePath: string;
  fileName: string;
  version: string;
  runtimeId: WorkerRuntimeId;
  publicKey?: string | null;
}): {
  manifest: Record<string, unknown> | null;
  checks: WorkerRuntimeValidationCheck[];
  valid: boolean;
} {
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
