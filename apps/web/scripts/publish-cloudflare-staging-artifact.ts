import { lstat, readFile, realpath } from "node:fs/promises";
import { cloudflareStagingAssetContentType } from "../server/services/cloudflareStagingAssetMetadata";
import { resolve, relative, sep } from "node:path";
import {
  assertSharedImmutableStorageActive,
  storagePutIfAbsent,
  storageReadBuffer,
} from "../server/storage";
import {
  createCanonicalBuildReceiptAuthority,
  createCloudflareStagingArtifactAuthority,
  isCloudflareStagingArtifactPathAllowed,
  type CloudflareStagingBuildReceipt,
} from "../server/services/cloudflareStagingArtifactAuthority";

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
  const resultsRoot = process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT?.trim();
  if (!/^[a-f0-9]{40}$/i.test(sourceSha) || !/^[a-z0-9._-]{8,120}$/i.test(buildId) || !resultsRoot) {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_build_authority_unavailable" }));
    return;
  }
  const root = resolve(resultsRoot);
  let record: Record<string, any>;
  try { record = JSON.parse(await readFile(resolve(root, `${buildId}.json`), "utf8")); }
  catch {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_build_receipt_unavailable" }));
    return;
  }
  const artifact = record.cloudflare_staging_artifact;
  const bundleVerified = artifact?.status === "BUNDLE_READY" ||
    artifact?.status === "PUBLISHED" ||
    artifact?.status === "PUBLISH_PENDING" &&
      ["artifact_publish_failed", "artifact_storage_unavailable"].includes(artifact?.reason);
  if (record.status !== "BUILD_PASSED" || record.source_revision?.toLowerCase() !== sourceSha.toLowerCase() ||
      record.canonical_ref !== "refs/heads/main" || record.canonical_tip_after_build?.toLowerCase() !== sourceSha.toLowerCase() ||
      !bundleVerified || !/^[a-f0-9]{64}$/i.test(artifact.build_digest ?? "") ||
      artifact.artifact_ref !== `sha256:${artifact.build_digest.toLowerCase()}`) {
    console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason: "canonical_build_receipt_untrusted" }));
    return;
  }
  await assertSharedImmutableStorageActive();
  const workspace = resolve(String(record.isolated_workspace ?? ""));
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
  const published = await authority.publish({
    receipt,
    bundle: {
      mainModule: manifest.mainModule,
      compatibilityDate: manifest.compatibilityDate,
      moduleFiles: modules,
      assets,
    },
  });
  console.log(JSON.stringify({ status: "PUBLISHED", artifactRef: published.artifactRef, sourceSha, buildDigest: published.buildDigest }));
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown";
  const diagnosticCode = /^[A-Z][A-Z0-9_]{4,99}$/.test(message)
    ? message
    : "ARTIFACT_PUBLISH_FAILED";
  const reason = message.startsWith("STORAGE_") || message.startsWith("R2_")
    ? "artifact_storage_unavailable"
    : "artifact_publish_failed";
  console.log(JSON.stringify({ status: "PUBLISH_PENDING", reason, diagnosticCode }));
});
