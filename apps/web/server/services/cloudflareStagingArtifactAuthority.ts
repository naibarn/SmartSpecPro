import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { CloudflareStagingBundle } from "./cloudflareStagingApiTransport";
import { storagePutIfAbsent, storageReadBuffer } from "../storage";

const SOURCE_SHA = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const ARTIFACT_REF = /^sha256:([a-f0-9]{64})$/i;
const STORAGE_ROOT = "cloudflare-staging/artifacts";
const BLOB_ROOT = "cloudflare-staging/blobs/sha256";
const MAX_OBJECT_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MANIFEST_VERSION = "cloudflare-staging-artifact-v1";

export type CloudflareStagingBuildReceipt = Readonly<{
  buildId: string;
  status: "BUILD_PASSED";
  canonicalRef: "refs/heads/main";
  sourceSha: string;
  canonicalTipAfterBuild: string;
  cloudflareBundleDigest: string;
  completedAt: string;
}>;

type StoredFile = Readonly<{
  contentType: string;
  size: number;
  sha256: string;
  chunks?: readonly Readonly<{ sha256: string; size: number }>[];
}>;

type ArtifactManifest = Readonly<{
  format: typeof MANIFEST_VERSION;
  sourceSha: string;
  buildId: string;
  canonicalRef: "refs/heads/main";
  canonicalTipAfterBuild: string;
  cloudflareBundleDigest: string;
  buildReceipt: CloudflareStagingBuildReceipt;
  buildReceiptDigest: string;
  completedAt: string;
  buildDigest: string;
  mainModule: string;
  compatibilityDate: string;
  moduleFiles: Readonly<Record<string, StoredFile>>;
  assets: Readonly<Record<string, StoredFile>>;
}>;

export type CloudflareStagingArtifactStorage = Readonly<{
  putIfAbsent(key: string, bytes: Uint8Array, contentType: string): Promise<unknown>;
  readBuffer(key: string): Promise<Uint8Array | null>;
}>;

export type CloudflareStagingBuildReceiptAuthority = Readonly<{
  /** Must check the canonical build authority, not merely trust caller fields. */
  verify(receipt: CloudflareStagingBuildReceipt): Promise<boolean>;
}>;

/** Reads only canonical builder receipts from the preconfigured result store. */
export function createCanonicalBuildReceiptAuthority(resultsRoot: string): CloudflareStagingBuildReceiptAuthority {
  const root = resolve(resultsRoot);
  return {
    async verify(receipt) {
      if (!validateReceiptShape(receipt)) return false;
      let files: string[];
      try { files = await readdir(root); }
      catch { return false; }
      for (const name of files) {
        if (!name.endsWith(".json") || name.slice(0, -5) !== receipt.buildId) continue;
        try {
          const record = JSON.parse(await readFile(join(root, name), "utf8")) as Record<string, any>;
          const artifact = record.cloudflare_staging_artifact;
          return record.status === "BUILD_PASSED" && record.canonical_ref === receipt.canonicalRef &&
            record.source_revision?.toLowerCase() === receipt.sourceSha.toLowerCase() &&
            record.canonical_tip_after_build?.toLowerCase() === receipt.canonicalTipAfterBuild.toLowerCase() &&
            record.source_verified === true && artifact?.source_sha?.toLowerCase() === receipt.sourceSha.toLowerCase() &&
            artifact?.build_digest?.toLowerCase() === receipt.cloudflareBundleDigest.toLowerCase() &&
            artifact?.artifact_ref === `sha256:${receipt.cloudflareBundleDigest.toLowerCase()}` &&
            (["BUNDLE_READY", "PUBLISHED"].includes(artifact?.status) ||
            (artifact?.status === "PUBLISH_PENDING" &&
              ["artifact_publish_failed", "artifact_storage_unavailable"].includes(artifact?.reason)));
        } catch {
          return false;
        }
      }
      return false;
    },
  };
}

export type CloudflareStagingArtifactPublisherInput = Readonly<{
  receipt: CloudflareStagingBuildReceipt;
  bundle: Omit<CloudflareStagingBundle, "sourceSha" | "buildDigest">;
}>;

export type PublishedCloudflareStagingArtifact = Readonly<{
  artifactRef: string;
  sourceSha: string;
  buildDigest: string;
  immutable: true;
}>;

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isCloudflareStagingArtifactPathAllowed(path: string, allowedRoots: readonly string[]) {
  const candidate = resolve(path);
  return allowedRoots.some(root => {
    const relation = relative(resolve(root), candidate);
    return Boolean(relation) && relation !== ".." && !relation.startsWith(`..${sep}`);
  });
}

function safePath(value: string) {
  return value.length > 0 && value.length <= 512 && !value.startsWith("/") &&
    !value.includes("\\") && value.split("/").every(part => part && part !== "." && part !== "..");
}

function sortedFileDigest(moduleFiles: CloudflareStagingBundle["moduleFiles"], assets: CloudflareStagingBundle["assets"]) {
  const entries: Array<[string, Uint8Array]> = [];
  for (const [name, file] of Object.entries(moduleFiles)) entries.push([`modules/${name}`, file.bytes]);
  for (const [name, file] of Object.entries(assets)) entries.push([`public/${name}`, file.bytes]);
  entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const manifest = entries.map(([name, bytes]) => `${name}\0${sha256(bytes)}\0${bytes.byteLength}`).join("\n");
  return sha256(Buffer.from(manifest));
}

function receiptDigest(receipt: CloudflareStagingBuildReceipt) {
  return sha256(Buffer.from(JSON.stringify({
    buildId: receipt.buildId,
    status: receipt.status,
    canonicalRef: receipt.canonicalRef,
    sourceSha: receipt.sourceSha.toLowerCase(),
    canonicalTipAfterBuild: receipt.canonicalTipAfterBuild.toLowerCase(),
    cloudflareBundleDigest: receipt.cloudflareBundleDigest.toLowerCase(),
    completedAt: receipt.completedAt,
  })));
}

function validateReceiptShape(receipt: CloudflareStagingBuildReceipt) {
  return receipt.status === "BUILD_PASSED" && receipt.canonicalRef === "refs/heads/main" &&
      /^[a-z0-9._-]{8,120}$/i.test(receipt.buildId) && SOURCE_SHA.test(receipt.sourceSha) &&
    receipt.canonicalTipAfterBuild.toLowerCase() === receipt.sourceSha.toLowerCase() &&
    SHA256.test(receipt.cloudflareBundleDigest) &&
    Number.isFinite(Date.parse(receipt.completedAt));
}

function artifactKey(digest: string, sourceSha?: string) {
  const source = sourceSha ? `/${sourceSha.toLowerCase()}` : "";
  return `${STORAGE_ROOT}/sha256/${digest}${source}/manifest.json`;
}

function blobKey(digest: string) {
  return `${BLOB_ROOT}/${digest}`;
}

async function putBlob(storage: CloudflareStagingArtifactStorage, bytes: Uint8Array, contentType: string) {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) throw new Error("CLOUDFLARE_ARTIFACT_FILE_SIZE_INVALID");
  const digest = sha256(bytes);
  if (bytes.byteLength > MAX_OBJECT_BYTES) {
    const chunks: { sha256: string; size: number }[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += MAX_OBJECT_BYTES) {
      const chunk = bytes.subarray(offset, offset + MAX_OBJECT_BYTES);
      const chunkDigest = sha256(chunk);
      await storage.putIfAbsent(blobKey(chunkDigest), chunk, "application/octet-stream");
      chunks.push({ sha256: chunkDigest, size: chunk.byteLength });
    }
    return { contentType, size: bytes.byteLength, sha256: digest, chunks } satisfies StoredFile;
  }
  await storage.putIfAbsent(blobKey(digest), bytes, contentType);
  return { contentType, size: bytes.byteLength, sha256: digest } satisfies StoredFile;
}

async function readBlob(storage: CloudflareStagingArtifactStorage, file: StoredFile) {
  const parts: Uint8Array[] = [];
  for (const part of file.chunks ?? [file]) {
    const bytes = await storage.readBuffer(blobKey(part.sha256.toLowerCase()));
    if (!bytes || bytes.byteLength !== part.size || sha256(bytes) !== part.sha256.toLowerCase()) return null;
    parts.push(bytes);
  }
  const bytes = parts.length === 1 ? parts[0]! : Buffer.concat(parts);
  return bytes.byteLength === file.size && sha256(bytes) === file.sha256.toLowerCase() ? bytes : null;
}

function validateManifest(input: unknown, artifactDigest: string): ArtifactManifest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Partial<ArtifactManifest>;
  if (value.format !== MANIFEST_VERSION || !SOURCE_SHA.test(value.sourceSha ?? "") ||
      value.canonicalRef !== "refs/heads/main" || !SHA256.test(value.buildReceiptDigest ?? "") ||
      !SHA256.test(value.buildDigest ?? "") || !SHA256.test(artifactDigest) ||
      !SHA256.test(value.cloudflareBundleDigest ?? "") || !value.buildReceipt ||
      value.buildDigest?.toLowerCase() !== value.cloudflareBundleDigest?.toLowerCase() ||
      value.buildDigest?.toLowerCase() !== artifactDigest.toLowerCase() ||
      !/^[a-z0-9._-]{8,120}$/i.test(value.buildId ?? "") ||
      value.canonicalTipAfterBuild?.toLowerCase() !== value.sourceSha?.toLowerCase() ||
      !safePath(value.mainModule ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(value.compatibilityDate ?? "") ||
      !value.moduleFiles || !value.assets || !Object.hasOwn(value.moduleFiles, value.mainModule ?? "") ||
      Object.keys(value.assets).length === 0) return null;
  for (const [group, files] of [["module", value.moduleFiles], ["asset", value.assets]] as const) {
    for (const [name, file] of Object.entries(files)) {
      if (!safePath(name) || !file || !SHA256.test(file.sha256) || !Number.isSafeInteger(file.size) ||
          file.size < 1 || file.size > MAX_FILE_BYTES || typeof file.contentType !== "string" ||
          file.contentType.length > 200) throw new Error(`CLOUDFLARE_ARTIFACT_${group.toUpperCase()}_MANIFEST_INVALID`);
      if (file.size > MAX_OBJECT_BYTES) {
        if (!Array.isArray(file.chunks) || file.chunks.length !== Math.ceil(file.size / MAX_OBJECT_BYTES) ||
            file.chunks.some((chunk, index) => !chunk || !SHA256.test(chunk.sha256) ||
              chunk.size !== Math.min(MAX_OBJECT_BYTES, file.size - index * MAX_OBJECT_BYTES))) return null;
      } else if (file.chunks !== undefined) return null;
    }
  }
  return value as ArtifactManifest;
}

/**
 * Uses the existing immutable storage authority. Artifact references resolve only
 * to content-addressed manifests; caller-provided filesystem paths are never read.
 */
export function createCloudflareStagingArtifactAuthority(input: {
  storage: CloudflareStagingArtifactStorage;
  buildReceipts: CloudflareStagingBuildReceiptAuthority;
}) {
  async function publish(params: CloudflareStagingArtifactPublisherInput): Promise<PublishedCloudflareStagingArtifact> {
    const { receipt, bundle } = params;
    if (!validateReceiptShape(receipt) || !await input.buildReceipts.verify(receipt)) {
      throw new Error("CLOUDFLARE_BUILD_RECEIPT_UNTRUSTED");
    }
    if (!SOURCE_SHA.test(receipt.sourceSha) || !safePath(bundle.mainModule) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(bundle.compatibilityDate)) {
      throw new Error("CLOUDFLARE_ARTIFACT_BUNDLE_INVALID");
    }
    for (const name of Object.keys(bundle.moduleFiles)) if (!safePath(name)) throw new Error("CLOUDFLARE_ARTIFACT_MODULE_PATH_INVALID");
    for (const name of Object.keys(bundle.assets)) if (!safePath(name)) throw new Error("CLOUDFLARE_ARTIFACT_ASSET_PATH_INVALID");
    if (!Object.hasOwn(bundle.moduleFiles, bundle.mainModule) || Object.keys(bundle.assets).length === 0) {
      throw new Error("CLOUDFLARE_ARTIFACT_BUNDLE_INVALID");
    }
    const buildDigest = sortedFileDigest(bundle.moduleFiles, bundle.assets);
    if (buildDigest !== receipt.cloudflareBundleDigest.toLowerCase()) throw new Error("CLOUDFLARE_ARTIFACT_BUILD_DIGEST_MISMATCH");

    // The bundle digest intentionally covers bytes, while its canonical source
    // attestation is a separate dimension. Reuse a verified same-source
    // artifact, but keep different source revisions in separate immutable
    // manifests even when their built bytes happen to be identical.
    const artifactRef = `sha256:${buildDigest}`;
    const reuseExistingArtifact = async (): Promise<PublishedCloudflareStagingArtifact | null> => {
      const existing = await resolveManifest(artifactRef, receipt.sourceSha);
      if (!existing) return null;
      if (existing.mainModule !== bundle.mainModule || existing.compatibilityDate !== bundle.compatibilityDate) {
        throw new Error("CLOUDFLARE_ARTIFACT_METADATA_CONFLICT");
      }
      const existingBundle = await resolveBundle(artifactRef, receipt.sourceSha);
      const sameFiles = (prior: Record<string, { contentType: string; bytes: Uint8Array }>,
        next: Record<string, { contentType: string; bytes: Uint8Array }>) =>
        Object.keys(prior).length === Object.keys(next).length && Object.entries(next).every(([name, file]) => {
          const previous = prior[name];
          return previous?.contentType === file.contentType && Buffer.from(previous.bytes).equals(Buffer.from(file.bytes));
        });
      if (!existingBundle || !sameFiles(existingBundle.moduleFiles, bundle.moduleFiles) || !sameFiles(existingBundle.assets, bundle.assets)) {
        throw new Error("CLOUDFLARE_ARTIFACT_CONTENT_METADATA_CONFLICT");
      }
      return { artifactRef, sourceSha: receipt.sourceSha.toLowerCase(), buildDigest, immutable: true };
    };
    const existing = await reuseExistingArtifact();
    if (existing) return existing;

    for (const file of [...Object.values(bundle.moduleFiles), ...Object.values(bundle.assets)]) {
      if (file.bytes.byteLength < 1 || file.bytes.byteLength > MAX_FILE_BYTES) throw new Error("CLOUDFLARE_ARTIFACT_FILE_SIZE_INVALID");
    }
    async function publishFiles(files: typeof bundle.assets) {
      const entries = Object.entries(files);
      const stored: Record<string, StoredFile> = {};
      // Bound remote I/O while retaining deterministic manifest property order
      // so repeated publications of the same artifact stay byte-identical.
      for (let offset = 0; offset < entries.length; offset += 8) {
        const batch = await Promise.all(entries.slice(offset, offset + 8).map(async ([name, file]) =>
          [name, await putBlob(input.storage, file.bytes, file.contentType)] as const));
        for (const [name, file] of batch) stored[name] = file;
      }
      return stored;
    }
    const moduleFiles = await publishFiles(bundle.moduleFiles);
    const assets = await publishFiles(bundle.assets);
    const manifest: ArtifactManifest = {
      format: MANIFEST_VERSION,
      sourceSha: receipt.sourceSha.toLowerCase(),
      buildId: receipt.buildId,
      canonicalRef: receipt.canonicalRef,
      canonicalTipAfterBuild: receipt.canonicalTipAfterBuild.toLowerCase(),
      cloudflareBundleDigest: receipt.cloudflareBundleDigest.toLowerCase(),
      buildReceipt: receipt,
      buildReceiptDigest: receiptDigest(receipt),
      completedAt: receipt.completedAt,
      buildDigest,
      mainModule: bundle.mainModule,
      compatibilityDate: bundle.compatibilityDate,
      moduleFiles,
      assets,
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    try {
      await input.storage.putIfAbsent(artifactKey(buildDigest, receipt.sourceSha), manifestBytes, "application/json");
    } catch (error) {
      // Two canonical builders can finish the same source/bundle at once. The
      // first immutable manifest remains authoritative if its receipt and
      // bytes still resolve; unrelated storage errors fail closed as before.
      try {
        const concurrent = await reuseExistingArtifact();
        if (concurrent) return concurrent;
      } catch { /* preserve the original conditional-create failure */ }
      throw error;
    }
    return { artifactRef, sourceSha: receipt.sourceSha.toLowerCase(), buildDigest, immutable: true };
  }

  async function resolveManifest(artifactRef: string, expectedSourceSha?: string): Promise<ArtifactManifest | null> {
    const match = ARTIFACT_REF.exec(artifactRef);
    if (!match || (expectedSourceSha !== undefined && !SOURCE_SHA.test(expectedSourceSha))) return null;
    const artifactDigest = match[1]!.toLowerCase();
    const manifestBytes = (expectedSourceSha
      ? await input.storage.readBuffer(artifactKey(artifactDigest, expectedSourceSha))
      : null) ?? await input.storage.readBuffer(artifactKey(artifactDigest));
    if (!manifestBytes) return null;
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(manifestBytes).toString("utf8")); }
    catch { return null; }
    const manifest = validateManifest(decoded, artifactDigest);
    if (!manifest || (expectedSourceSha && manifest.sourceSha.toLowerCase() !== expectedSourceSha.toLowerCase())) return null;
    if (!validateReceiptShape(manifest.buildReceipt) ||
        receiptDigest(manifest.buildReceipt) !== manifest.buildReceiptDigest ||
        manifest.buildReceipt.sourceSha.toLowerCase() !== manifest.sourceSha.toLowerCase() ||
        manifest.buildReceipt.cloudflareBundleDigest.toLowerCase() !== manifest.buildDigest.toLowerCase() ||
        !await input.buildReceipts.verify(manifest.buildReceipt)) return null;
    // The content address covers the sorted per-file digests and sizes. Recheck
    // that binding and the current canonical receipt without downloading every
    // immutable blob again at each grant/target mutation fence.
    const descriptors = [
      ...Object.entries(manifest.moduleFiles).map(([name, file]) => [`modules/${name}`, file] as const),
      ...Object.entries(manifest.assets).map(([name, file]) => [`public/${name}`, file] as const),
    ].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const digest = sha256(Buffer.from(descriptors.map(([name, file]) => `${name}\0${file.sha256.toLowerCase()}\0${file.size}`).join("\n")));
    return digest === artifactDigest ? manifest : null;
  }

  /** Metadata authority only; byte availability/integrity is checked by resolveBundle before upload. */
  async function resolveArtifact(artifactRef: string, expectedSourceSha?: string): Promise<PublishedCloudflareStagingArtifact | null> {
    const manifest = await resolveManifest(artifactRef, expectedSourceSha);
    return manifest ? { artifactRef, sourceSha: manifest.sourceSha, buildDigest: manifest.buildDigest, immutable: true } : null;
  }

  async function resolveBundle(artifactRef: string, expectedSourceSha?: string): Promise<CloudflareStagingBundle | null> {
    const manifest = await resolveManifest(artifactRef, expectedSourceSha);
    if (!manifest) return null;
    const moduleFiles: Record<string, { contentType: string; bytes: Uint8Array }> = {};
    const assets: Record<string, { contentType: string; bytes: Uint8Array }> = {};
    for (const [files, output] of [[manifest.moduleFiles, moduleFiles], [manifest.assets, assets]] as const) {
      const entries = Object.entries(files);
      for (let offset = 0; offset < entries.length; offset += 8) {
        const batch = await Promise.all(entries.slice(offset, offset + 8).map(async ([name, file]) => ({
          name, file, bytes: await readBlob(input.storage, file),
        })));
        if (batch.some(item => !item.bytes)) return null;
        for (const { name, file, bytes } of batch) output[name] = { contentType: file.contentType, bytes: bytes! };
      }
    }
    const bundle: CloudflareStagingBundle = {
      sourceSha: manifest.sourceSha,
      buildDigest: manifest.buildDigest,
      mainModule: manifest.mainModule,
      compatibilityDate: manifest.compatibilityDate,
      moduleFiles,
      assets,
    };
    if (sortedFileDigest(bundle.moduleFiles, bundle.assets) !== manifest.buildDigest.toLowerCase()) return null;
    return bundle;
  }

  return { publish, resolveBundle, resolveArtifact };
}

let runtimeAuthority: ReturnType<typeof createCloudflareStagingArtifactAuthority> | null = null;

function getRuntimeAuthority() {
  if (runtimeAuthority) return runtimeAuthority;
  const resultsRoot = process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT?.trim();
  if (!resultsRoot) return null;
  runtimeAuthority = createCloudflareStagingArtifactAuthority({
    storage: {
      putIfAbsent: async (key, bytes, contentType) =>
        storagePutIfAbsent(key, Buffer.from(bytes), contentType),
      readBuffer: key => storageReadBuffer(key),
    },
    buildReceipts: createCanonicalBuildReceiptAuthority(resultsRoot),
  });
  return runtimeAuthority;
}

/** Runtime resolvers use only server-owned storage and canonical build receipts. */
export async function resolveCloudflareStagingBundle(
  artifactRef: string,
  expectedSourceSha?: string,
): Promise<CloudflareStagingBundle | null> {
  return (await getRuntimeAuthority()?.resolveBundle(artifactRef, expectedSourceSha)) ?? null;
}

export async function resolveCloudflareStagingArtifact(
  artifactRef: string,
  expectedSourceSha?: string,
): Promise<PublishedCloudflareStagingArtifact | null> {
  return (await getRuntimeAuthority()?.resolveArtifact(artifactRef, expectedSourceSha)) ?? null;
}
