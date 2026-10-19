import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CloudflareStagingBundle } from "./cloudflareStagingApiTransport";
import { describe, expect, it } from "vitest";
import {
  createCanonicalBuildReceiptAuthority,
  createCloudflareStagingArtifactAuthority,
  isCloudflareStagingArtifactPathAllowed,
  type CloudflareStagingArtifactStorage,
  type CloudflareStagingBuildReceipt,
} from "./cloudflareStagingArtifactAuthority";

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

const sourceSha = "c".repeat(40);
const moduleBytes = Buffer.from("export default { fetch: () => new Response('ok') };");
const indexBytes = Buffer.from("<html><div id=\"root\"></div></html>");
const jsBytes = Buffer.from("console.log('spa')");
const localizedBytes = Buffer.from("localized guide");
const buildDigest = sha256(Buffer.from([
  `modules/index.js\0${sha256(moduleBytes)}\0${moduleBytes.byteLength}`,
  `public/assets/app.js\0${sha256(jsBytes)}\0${jsBytes.byteLength}`,
  `public/index.html\0${sha256(indexBytes)}\0${indexBytes.byteLength}`,
  `public/ä-user-guide.md\0${sha256(localizedBytes)}\0${localizedBytes.byteLength}`,
].join("\n")));
const receipt: CloudflareStagingBuildReceipt = {
  buildId: "build-20261017-1",
  status: "BUILD_PASSED",
  canonicalRef: "refs/heads/main",
  sourceSha,
  canonicalTipAfterBuild: sourceSha,
  cloudflareBundleDigest: buildDigest,
  completedAt: "2026-10-17T11:00:00.000Z",
};

function fixture(verify: (value: CloudflareStagingBuildReceipt) => Promise<boolean> = async () => true) {
  const objects = new Map<string, Buffer>();
  const storage: CloudflareStagingArtifactStorage = {
    async putIfAbsent(key, bytes) {
      const existing = objects.get(key);
      if (existing && !existing.equals(Buffer.from(bytes))) throw new Error("immutable conflict");
      if (!existing) objects.set(key, Buffer.from(bytes));
    },
    async readBuffer(key) { return objects.get(key) ?? null; },
  };
  return {
    objects,
    storage,
    authority: createCloudflareStagingArtifactAuthority({ storage, buildReceipts: { verify } }),
  };
}

const bundle = {
  mainModule: "index.js",
  compatibilityDate: "2026-10-17",
  moduleFiles: { "index.js": { contentType: "application/javascript", bytes: moduleBytes } },
  assets: {
    "index.html": { contentType: "text/html", bytes: indexBytes },
    "assets/app.js": { contentType: "application/javascript", bytes: jsBytes },
    "ä-user-guide.md": { contentType: "text/markdown", bytes: localizedBytes },
  },
};

function bundleReceipt(value: Pick<CloudflareStagingBundle, "moduleFiles" | "assets">) {
  const lines = [
    ...Object.entries(value.moduleFiles).map(([name, file]) => [`modules/${name}`, file.bytes] as const),
    ...Object.entries(value.assets).map(([name, file]) => [`public/${name}`, file.bytes] as const),
  ].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, bytes]) => `${name}\0${sha256(bytes)}\0${bytes.byteLength}`);
  return { ...receipt, cloudflareBundleDigest: sha256(Buffer.from(lines.join("\n"))) };
}

describe("Cloudflare staging artifact authority", () => {
  it("round-trips a large release asset using bounded immutable chunks and rejects tampering", async () => {
    const { authority, objects } = fixture();
    const bytes = Buffer.alloc(13 * 1024 * 1024, 7);
    const largeBundle = { ...bundle, assets: { ...bundle.assets, "releases/worker.exe": { contentType: "application/octet-stream", bytes } } };
    const published = await authority.publish({ receipt: bundleReceipt(largeBundle), bundle: largeBundle });
    expect([...objects.values()].every(object => object.byteLength <= 10 * 1024 * 1024)).toBe(true);
    const resolved = await authority.resolveBundle(published.artifactRef);
    expect(Buffer.from(resolved!.assets["releases/worker.exe"]!.bytes).equals(bytes)).toBe(true);
    const manifestKey = [...objects.keys()].find(key => key.endsWith("manifest.json"))!;
    const originalManifest = objects.get(manifestKey)!;
    const malformed = JSON.parse(originalManifest.toString());
    malformed.assets["releases/worker.exe"].chunks[0].size++;
    objects.set(manifestKey, Buffer.from(JSON.stringify(malformed)));
    expect(await authority.resolveBundle(published.artifactRef)).toBeNull();
    objects.set(manifestKey, originalManifest);
    const chunkKey = [...objects.keys()].find(key => key.endsWith(sha256(bytes.subarray(0, 10 * 1024 * 1024))))!;
    objects.set(chunkKey, Buffer.alloc(10 * 1024 * 1024, 8));
    expect(await authority.resolveBundle(published.artifactRef)).toBeNull();
  });

  it("rejects an oversized file before writing any remote objects", async () => {
    const { authority, objects } = fixture();
    const oversizedBundle = { ...bundle, assets: { ...bundle.assets, "too-large": { contentType: "application/octet-stream", bytes: Buffer.alloc(25 * 1024 * 1024 + 1) } } };
    await expect(authority.publish({ receipt: bundleReceipt(oversizedBundle), bundle: oversizedBundle })).rejects.toThrow("CLOUDFLARE_ARTIFACT_FILE_SIZE_INVALID");
    expect(objects.size).toBe(0);
  });

  it("bounds parallel uploads and preserves immutable manifest bytes across completion orders", async () => {
    const { storage, objects } = fixture();
    let active = 0;
    let maximum = 0;
    let reverse = false;
    const parallelBundle = { ...bundle, assets: Object.fromEntries(Array.from({ length: 19 }, (_, index) =>
      [`asset-${index}`, { contentType: "text/plain", bytes: Buffer.from(String(index)) }])) };
    const authority = createCloudflareStagingArtifactAuthority({
      buildReceipts: { verify: async () => true },
      storage: {
        readBuffer: storage.readBuffer,
        async putIfAbsent(key, bytes, type) {
          active++;
          maximum = Math.max(maximum, active);
          try {
            await new Promise(resolve => setTimeout(resolve, reverse ? 1 : bytes.byteLength % 3));
            return await storage.putIfAbsent(key, bytes, type);
          } finally { active--; }
        },
      },
    });
    const input = { receipt: bundleReceipt(parallelBundle), bundle: parallelBundle };
    const published = await authority.publish(input);
    const manifestKey = [...objects.keys()].find(key => key.endsWith("manifest.json"))!;
    const firstManifest = Buffer.from(objects.get(manifestKey)!);
    reverse = true;
    await expect(authority.publish(input)).resolves.toEqual(published);
    expect(objects.get(manifestKey)!.equals(firstManifest)).toBe(true);
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(8);
  });

  it("allows only retryable publish-pending canonical build receipts", async () => {
    const resultsRoot = await mkdtemp(join(tmpdir(), "cf-staging-receipt-"));
    try {
      const record = {
        status: "BUILD_PASSED",
        canonical_ref: "refs/heads/main",
        source_revision: sourceSha,
        canonical_tip_after_build: sourceSha,
        source_verified: true,
        completed_at: 1,
        cloudflare_staging_artifact: {
          source_sha: sourceSha,
          build_digest: buildDigest,
          artifact_ref: `sha256:${buildDigest}`,
          status: "PUBLISH_PENDING",
          reason: "artifact_publish_failed",
        },
      };
      const resultPath = join(resultsRoot, `${receipt.buildId}.json`);
      await writeFile(resultPath, JSON.stringify(record));
      const authority = createCanonicalBuildReceiptAuthority(resultsRoot);
      expect(await authority.verify(receipt)).toBe(true);

      record.cloudflare_staging_artifact.reason = "canonical_build_receipt_unavailable";
      await writeFile(resultPath, JSON.stringify(record));
      expect(await authority.verify(receipt)).toBe(false);
    } finally {
      await rm(resultsRoot, { recursive: true, force: true });
    }
  });

  it("allows release assets from the approved public source tree and rejects other paths", () => {
    expect(isCloudflareStagingArtifactPathAllowed(
      "/build/apps/web/client/public/releases/current.json",
      ["/build/apps/web/dist/public", "/build/apps/web/client/public"],
    )).toBe(true);
    expect(isCloudflareStagingArtifactPathAllowed(
      "/build/apps/web/private/secret.json",
      ["/build/apps/web/dist/public", "/build/apps/web/client/public"],
    )).toBe(false);
    expect(isCloudflareStagingArtifactPathAllowed(
      "/build/apps/web/client/public",
      ["/build/apps/web/client/public"],
    )).toBe(false);
  });

  it("publishes immutable content-addressed modules/assets and resolves only by digest", async () => {
    const { authority, objects } = fixture();
    const published = await authority.publish({ receipt, bundle });
    expect(published).toEqual({
      artifactRef: `sha256:${buildDigest}`,
      sourceSha,
      buildDigest,
      immutable: true,
    });
    expect(objects.size).toBe(5);
    const resolved = await authority.resolveBundle(published.artifactRef);
    expect(resolved).toMatchObject({ sourceSha, buildDigest, mainModule: "index.js", compatibilityDate: "2026-10-17" });
    expect(Buffer.from(resolved!.moduleFiles["index.js"]!.bytes).equals(moduleBytes)).toBe(true);
    expect(await authority.resolveBundle("../../etc/passwd")).toBeNull();
    expect(await authority.resolveBundle("sha256:" + "f".repeat(64))).toBeNull();
  });

  it("rejects publication when the canonical build authority denies the receipt", async () => {
    const { authority } = fixture(async () => false);
    await expect(authority.publish({ receipt, bundle })).rejects.toThrow("CLOUDFLARE_BUILD_RECEIPT_UNTRUSTED");
  });

  it("rejects a caller-supplied bundle that is not bound to the trusted build receipt", async () => {
    const { authority } = fixture();
    await expect(authority.publish({
      receipt,
      bundle: { ...bundle, assets: { "index.html": { contentType: "text/html", bytes: Buffer.from("changed") } } },
    })).rejects.toThrow("CLOUDFLARE_ARTIFACT_BUILD_DIGEST_MISMATCH");
  });

  it("fails closed when a stored blob does not match its digest", async () => {
    const { authority, objects } = fixture();
    const published = await authority.publish({ receipt, bundle });
    const blob = [...objects.keys()].find(key => key.endsWith(sha256(moduleBytes)))!;
    objects.set(blob, Buffer.from("tampered"));
    expect(await authority.resolveBundle(published.artifactRef)).toBeNull();
  });

  it("revalidates build provenance when resolving an already published digest", async () => {
    let trusted = true;
    const { authority } = fixture(async () => trusted);
    const published = await authority.publish({ receipt, bundle });
    trusted = false;
    expect(await authority.resolveBundle(published.artifactRef)).toBeNull();
  });

  it("rejects unsafe module and asset paths", async () => {
    const { authority } = fixture();
    await expect(authority.publish({
      receipt,
      bundle: { ...bundle, moduleFiles: { "../index.js": bundle.moduleFiles["index.js"]! } },
    })).rejects.toThrow("CLOUDFLARE_ARTIFACT_MODULE_PATH_INVALID");
  });
});
