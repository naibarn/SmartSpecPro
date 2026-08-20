import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runtimePackId, sidecarPath, serverUrl, stateRoot } from "./config.js";
import { runFile } from "./process.js";
import { managedRuntimeDoctor } from "./doctor.js";

export function isSafeArchiveListing(listing: string): boolean {
  return listing.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).every((entry) => {
    const normalized = entry.replaceAll("\\", "/");
    return !normalized.startsWith("/") && !normalized.split("/").includes("..") && !normalized.includes(":");
  });
}

/**
 * A path-safe name is not enough for an archive: a symlink can have a safe
 * name while resolving outside the staging directory after extraction. The
 * runtime pack is self-contained, so reject symbolic and hard links before
 * extraction. GNU/BSD tar use `l`/`h` as the first mode character for those
 * entry types in `tar -tvf` output.
 */
export function isSafeArchiveVerboseListing(listing: string): boolean {
  return listing.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).every((entry) => {
    const type = entry[0]?.toLowerCase();
    // GNU/BSD tar prints the link type as the first mode character. Info-ZIP
    // (`unzip -Z -v`) prints it after "Unix file attributes" instead, so
    // inspect both formats before extraction.
    return type !== "l"
      && type !== "h"
      && !/unix file attributes[^:]*:\s*[lh]/i.test(entry)
      && !/\b(?:symbolic|hard) link\b/i.test(entry);
  });
}

export type RuntimeArchiveCommands = {
  list: { file: string; args: (archivePath: string) => string[] };
  verbose: { file: string; args: (archivePath: string) => string[] };
  extract: { file: string; args: (archivePath: string, stagingRoot: string) => string[] };
};

/**
 * Runtime packs are ZIP archives. Windows 11 ships bsdtar, while macOS ships
 * `ditto` and Info-ZIP. Do not use the host `tar` blindly: the macOS tar
 * binary is a tar reader and cannot extract the ZIP produced by the release
 * builder. Keeping the command choice here also makes the bootstrap path
 * deterministic and testable without requiring a platform-specific host.
 */
export function runtimeArchiveCommands(platform = process.platform): RuntimeArchiveCommands {
  if (platform === "win32") {
    return {
      list: { file: "tar", args: (archivePath) => ["-tf", archivePath] },
      verbose: { file: "tar", args: (archivePath) => ["-tvf", archivePath] },
      extract: { file: "tar", args: (archivePath, stagingRoot) => ["-xf", archivePath, "-C", stagingRoot] },
    };
  }
  if (platform === "darwin") {
    return {
      list: { file: "unzip", args: (archivePath) => ["-Z1", archivePath] },
      verbose: { file: "unzip", args: (archivePath) => ["-Z", "-v", archivePath] },
      extract: { file: "ditto", args: (archivePath, stagingRoot) => ["-x", "-k", archivePath, stagingRoot] },
    };
  }
  return {
    list: { file: "unzip", args: (archivePath) => ["-Z1", archivePath] },
    verbose: { file: "unzip", args: (archivePath) => ["-Z", "-v", archivePath] },
    extract: { file: "unzip", args: (archivePath, stagingRoot) => ["-q", archivePath, "-d", stagingRoot] },
  };
}

async function assertNoExtractedLinks(root: string): Promise<void> {
  const visit = async (current: string): Promise<void> => {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error("runtime_pack_extracted_link");
    if (!stat.isDirectory()) return;
    const directory = await fs.opendir(current);
    try {
      for await (const entry of directory) await visit(path.join(current, entry.name));
    } finally {
      await directory.close().catch(() => {});
    }
  };
  await visit(root);
}

const MAX_MANIFEST_BYTES = 1024 * 1024;
const configuredRuntimePackBytes = Number.parseInt(
  process.env.SMARTAIHUB_RUNTIME_PACK_MAX_BYTES ?? "4294967296",
  10,
);
const MAX_RUNTIME_PACK_BYTES = Number.isSafeInteger(configuredRuntimePackBytes)
  && configuredRuntimePackBytes > 0
  ? configuredRuntimePackBytes
  : 4294967296;

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error("runtime_pack_response_too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("runtime_pack_response_body_missing");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("runtime_pack_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function downloadArchive(response: Response, filePath: string, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error("runtime_pack_too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("runtime_pack_response_body_missing");
  const handle = await fs.open(filePath, "w", 0o600);
  const hash = crypto.createHash("sha256");
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("runtime_pack_too_large");
      hash.update(value);
      await handle.write(value);
    }
    return hash.digest("hex");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await handle.close();
  }
}

export async function ensureRuntimePack(): Promise<void> {
  try { await fs.access(sidecarPath()); return; } catch { /* install below */ }
  const manifestUrl = new URL(`/api/workers/runtime-pack/manifest?runtimeId=${encodeURIComponent(runtimePackId())}`, `${serverUrl()}/`);
  const manifestResponse = await fetch(manifestUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!manifestResponse.ok) throw new Error("runtime_pack_manifest_unavailable");
  const manifest = JSON.parse(await readResponseText(manifestResponse, MAX_MANIFEST_BYTES)) as Record<string, unknown>;
  const archiveUrl = typeof manifest.archiveUrl === "string" ? new URL(manifest.archiveUrl, `${serverUrl()}/`) : null;
  const archiveSha256 = typeof manifest.archiveSha256 === "string" ? manifest.archiveSha256.toLowerCase() : "";
  const signature = typeof manifest.archiveSignature === "string" ? manifest.archiveSignature : "";
  if (manifest.runtimeId !== runtimePackId()) throw new Error("runtime_pack_id_mismatch");
  const publicKey = process.env.SMARTAIHUB_RUNTIME_PACK_PUBLIC_KEY?.trim() ?? "";
  if (!archiveUrl || archiveUrl.origin !== new URL(`${serverUrl()}/`).origin || !/^[a-f0-9]{64}$/.test(archiveSha256) || !signature || !publicKey) {
    throw new Error("runtime_pack_signature_policy_missing");
  }
  const archiveResponse = await fetch(archiveUrl, { redirect: "error", signal: AbortSignal.timeout(10 * 60_000) });
  if (!archiveResponse.ok) throw new Error("runtime_pack_download_failed");
  const root = path.join(stateRoot(), "runtime-pack");
  const archivePath = path.join(stateRoot(), `runtime-download-${crypto.randomUUID()}.zip`);
  const staging = path.join(stateRoot(), `runtime-staging-${archiveSha256}`);
  await fs.mkdir(stateRoot(), { recursive: true, mode: 0o700 });
  try {
    const actualHash = await downloadArchive(archiveResponse, archivePath, MAX_RUNTIME_PACK_BYTES);
    if (actualHash !== archiveSha256) throw new Error("runtime_pack_checksum_mismatch");
    if (!crypto.verify(null, Buffer.from(archiveSha256), crypto.createPublicKey(publicKey), Buffer.from(signature, "base64"))) {
      throw new Error("runtime_pack_signature_invalid");
    }
    const archiveCommands = runtimeArchiveCommands();
    let listing;
    let verboseListing;
    try {
      listing = await runFile(archiveCommands.list.file, archiveCommands.list.args(archivePath));
      verboseListing = await runFile(archiveCommands.verbose.file, archiveCommands.verbose.args(archivePath));
    } catch {
      throw new Error("runtime_pack_archive_tool_unavailable");
    }
    if (
      listing.code !== 0
      || verboseListing.code !== 0
      || !isSafeArchiveListing(listing.stdout)
      || !isSafeArchiveVerboseListing(verboseListing.stdout)
    ) throw new Error("runtime_pack_archive_invalid");
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true, mode: 0o700 });
    let extracted;
    try {
      extracted = await runFile(
        archiveCommands.extract.file,
        archiveCommands.extract.args(archivePath, staging),
      );
    } catch {
      throw new Error("runtime_pack_extract_tool_unavailable");
    }
    if (extracted.code !== 0) throw new Error("runtime_pack_extract_failed");
    const stagedRoot = path.join(staging, "runtime-pack");
    await assertNoExtractedLinks(stagedRoot);
    const stagedReadiness = await managedRuntimeDoctor(stagedRoot);
    if (stagedReadiness.status !== "ready") throw new Error("runtime_pack_doctor_blocked");
    const previousRoot = path.join(stateRoot(), "runtime-pack-previous");
    let previousMoved = false;
    await fs.rm(previousRoot, { recursive: true, force: true });
    try {
      await fs.rename(root, previousRoot);
      previousMoved = true;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
      if (code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(stagedRoot, root);
      await fs.access(sidecarPath());
    } catch (error) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
      if (previousMoved) await fs.rename(previousRoot, root).catch(() => {});
      throw error;
    }
  } finally {
    await fs.rm(archivePath, { force: true });
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
