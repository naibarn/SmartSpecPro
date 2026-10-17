import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createCloudflareStagingArtifactAuthority,
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

describe("Cloudflare staging artifact authority", () => {
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
