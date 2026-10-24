import { createHash } from "node:crypto";
import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { cloudflareStagingAssetContentType } from "../server/services/cloudflareStagingAssetMetadata";
import { resolve, relative, sep } from "node:path";
import {
  assertSharedImmutableStorageActive,
  getStorageBackendIdentity,
  storagePutIfAbsent,
  storageReadBuffer,
} from "../server/storage";
import {
  createCanonicalBuildReceiptAuthority,
  createCloudflareStagingArtifactAuthority,
  isCloudflareStagingArtifactPathAllowed,
  isRetryableCloudflareStagingPublishReason,
  type CloudflareStagingBuildReceipt,
} from "../server/services/cloudflareStagingArtifactAuthority";
import { classifyCloudflareArtifactPublishFailure } from "./cloudflareArtifactPublishDiagnostics";

let activePhase = "receipt_validation";
let storageBackend: Readonly<Record<string, string | null>> | null = null;
let publishContext = { sourceSha: "", buildId: "", buildDigest: "", retryExisting: false };

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeRelative(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    !value.startsWith("/") && !value.includes("\\") &&
    value.split("/").every(part => part && part !== "." && part !== "..");
}

function assertInside(path: string, root: string) {
  const relation = relative(root, path);
  if (!relation || relation === ".." || relation.startsWith(`..${sep}`)) throw new Error("ARTIFACT_PATH_DENIED");
}


async function main() {
  const sourceSha = argument("--source-sha") ?? "";
  const buildId = argument("--build-id") ?? "";
  const retryExisting = process.argv.includes("--retry-existing");
  publishContext = { sourceSha, buildId, buildDigest: "", retryExisting };
  const resultsRoot = process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT?.trim();
  if (!/^[a-f0-9]{40}$/i.test(sourceSha) || !/^[a-z0-9._-]{8,120}$/i.test(buildId) || !resultsRoot) {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_build_authority_unavailable", diagnostics: {
      phase: "receipt_validation", rootErrorCategory: "build_receipt_validation", diagnosticCode: "CANONICAL_BUILD_AUTHORITY_UNAVAILABLE",
      retryable: false, timeoutResource: null, providerDiagnostics: {}, storageBackend: null,
      artifact: { sourceSha: sourceSha || null, buildId: buildId || null, buildDigest: null },
    } }));
    return;
  }
  const root = resolve(resultsRoot);
  let record: Record<string, any>;
  try { record = JSON.parse(await readFile(resolve(root, `${buildId}.json`), "utf8")); }
  catch {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_build_receipt_unavailable", diagnostics: {
      phase: "receipt_validation", rootErrorCategory: "build_receipt_validation", diagnosticCode: "CANONICAL_BUILD_RECEIPT_UNAVAILABLE",
      retryable: false, timeoutResource: null, providerDiagnostics: {}, storageBackend: null,
      artifact: { sourceSha, buildId, buildDigest: null },
    } }));
    return;
  }
  const artifact = record.cloudflare_staging_artifact;
  publishContext.buildDigest = typeof artifact?.build_digest === "string" ? artifact.build_digest : "";
  activePhase = "receipt_validation";
  if (retryExisting && !(artifact?.status === "PUBLISHED" ||
      artifact?.status === "PUBLISH_PENDING" && isRetryableCloudflareStagingPublishReason(artifact?.reason))) {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_build_receipt_not_retryable", diagnostics: {
      phase: activePhase, rootErrorCategory: "build_receipt_validation", diagnosticCode: "CANONICAL_BUILD_RECEIPT_NOT_RETRYABLE",
      retryable: false, timeoutResource: null, providerDiagnostics: {}, storageBackend: null,
      artifact: { sourceSha, buildId, buildDigest: publishContext.buildDigest || null },
    } }));
    return;
  }
  const bundleVerified = artifact?.status === "BUNDLE_READY" ||
    artifact?.status === "PUBLISHED" ||
    artifact?.status === "PUBLISH_PENDING" &&
      isRetryableCloudflareStagingPublishReason(artifact?.reason);
  if (record.status !== "BUILD_PASSED" || record.source_revision?.toLowerCase() !== sourceSha.toLowerCase() ||
      record.canonical_ref !== "refs/heads/main" || record.canonical_tip_after_build?.toLowerCase() !== sourceSha.toLowerCase() ||
      !bundleVerified || !/^[a-f0-9]{64}$/i.test(artifact.build_digest ?? "") ||
      artifact.artifact_ref !== `sha256:${artifact.build_digest.toLowerCase()}`) {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_build_receipt_untrusted" }));
    return;
  }
  storageBackend = await getStorageBackendIdentity();
  activePhase = "storage_validation";
  if (storageBackend.provider !== "s3") throw new Error("STORAGE_SHARED_CONTENT_STORE_REQUIRED");
  await assertSharedImmutableStorageActive();
  const workspace = resolve(String(record.isolated_workspace ?? ""));
  activePhase = "manifest_validation";
  const manifestFile = resolve(workspace, "apps/cloudflare/.staging-artifact/bundle-manifest.json");
  const manifestRoot = await realpath(workspace);
  const actualManifest = await realpath(manifestFile);
  assertInside(actualManifest, manifestRoot);
  const manifest = JSON.parse(await readFile(actualManifest, "utf8")) as Record<string, any>;
  if (manifest.format !== "cloudflare-staging-build-bundle-v1" || manifest.sourceSha?.toLowerCase() !== sourceSha.toLowerCase() ||
      manifest.buildDigest?.toLowerCase() !== artifact.build_digest?.toLowerCase() || !safeRelative(manifest.mainModule) ||
      !Array.isArray(manifest.moduleFiles) || !Array.isArray(manifest.assets)) {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_bundle_manifest_invalid" }));
    return;
  }
  const modules: Record<string, { contentType: string; bytes: Uint8Array }> = {};
  const assets: Record<string, { contentType: string; bytes: Uint8Array }> = {};
  const moduleRoot = resolve(workspace, "apps/cloudflare/.staging-artifact/modules");
  const assetRoot = resolve(workspace, "apps/web/dist/public");
  const publicSourcePath = resolve(workspace, "apps/web/client/public");
  const publicSourceStat = await lstat(publicSourcePath);
  if (!publicSourceStat.isDirectory() || publicSourceStat.isSymbolicLink()) {
    throw new Error("ARTIFACT_PUBLIC_SOURCE_INVALID");
  }
  const publicSourceRoot = await realpath(publicSourcePath);
  assertInside(publicSourceRoot, manifestRoot);
  async function loadFiles(entries: any[], base: string, destination: typeof modules, allowedRoots = [base]) {
    for (const entry of entries) {
      activePhase = destination === modules ? "module_file_validation" : "asset_file_validation";
      const name = entry?.name;
      if (!safeRelative(name) || !/^[a-f0-9]{64}$/i.test(entry.sha256 ?? "") || !Number.isSafeInteger(entry.size) || entry.size < 1) {
        throw new Error("ARTIFACT_MANIFEST_ENTRY_INVALID");
      }
      const path = resolve(base, name);
      assertInside(path, base);
      const resolvedPath = await realpath(path);
      if (!isCloudflareStagingArtifactPathAllowed(resolvedPath, allowedRoots)) {
        throw new Error("ARTIFACT_RESOLVED_PATH_DENIED");
      }
      const bytes = await readFile(resolvedPath);
      if (bytes.byteLength !== entry.size) throw new Error("ARTIFACT_FILE_SIZE_MISMATCH");
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== entry.sha256.toLowerCase()) throw new Error("ARTIFACT_FILE_HASH_MISMATCH");
      destination[name] = { contentType: cloudflareStagingAssetContentType(name, entry.contentType), bytes };
    }
  }
  await loadFiles(manifest.moduleFiles, moduleRoot, modules);
  await loadFiles(manifest.assets, assetRoot, assets, [await realpath(assetRoot), publicSourceRoot]);
  const receipt: CloudflareStagingBuildReceipt = {
    buildId,
    status: "BUILD_PASSED",
    canonicalRef: "refs/heads/main",
    sourceSha,
    canonicalTipAfterBuild: sourceSha,
    cloudflareBundleDigest: artifact.build_digest,
    completedAt: new Date(Number(record.completed_at) * 1000).toISOString(),
  };
  const authority = createCloudflareStagingArtifactAuthority({
    storage: {
      putIfAbsent: async (key, bytes, type) => storagePutIfAbsent(key, Buffer.from(bytes), type),
      readBuffer: key => storageReadBuffer(key),
    },
    buildReceipts: createCanonicalBuildReceiptAuthority(root),
  });
  activePhase = "artifact_publication";
  const published = await authority.publish({
    receipt,
    bundle: {
      mainModule: manifest.mainModule,
      compatibilityDate: manifest.compatibilityDate,
      moduleFiles: modules,
      assets,
    },
    onPhase: phase => { activePhase = phase; },
  });
  // Keep the authentic build receipt and provenance fields intact. Only advance
  // its publication state after the authority has read back and verified every
  // manifest entry and blob. Atomic replacement prevents partial JSON on crash.
  const receiptPath = resolve(root, `${buildId}.json`);
  const updatedRecord = {
    ...record,
    cloudflare_staging_artifact: {
      ...Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== "diagnostic_code")),
      status: "PUBLISHED",
      reason: null,
      artifact_ref: published.artifactRef,
      source_sha: published.sourceSha,
      build_digest: published.buildDigest,
      published_at: new Date().toISOString(),
      publication_verified_readback: true,
      publication_storage_backend: storageBackend,
    },
  };
  const temporaryReceiptPath = `${receiptPath}.${process.pid}.publish.tmp`;
  await writeFile(temporaryReceiptPath, `${JSON.stringify(updatedRecord, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporaryReceiptPath, receiptPath);
  console.log(JSON.stringify({ status: "PUBLISHED", buildId, artifactRef: published.artifactRef, sourceSha,
    buildDigest: published.buildDigest, retryExisting, verifiedReadback: true, storageBackend }));
}

main().catch(error => {
  const failure = classifyCloudflareArtifactPublishFailure(error, activePhase);
  const reason = failure.rootErrorCategory.startsWith("storage_") ||
    failure.rootErrorCategory.startsWith("provider_") || failure.timeoutResource !== null
    ? "artifact_storage_unavailable"
    : "artifact_publish_failed";
  console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason, diagnosticCode: failure.diagnosticCode,
    diagnostics: { ...failure, storageBackend, artifact: {
      sourceSha: publishContext.sourceSha || null,
      buildId: publishContext.buildId || null,
      buildDigest: publishContext.buildDigest || null,
    }, retryExisting: publishContext.retryExisting } }));
  process.exitCode = 1;
});
