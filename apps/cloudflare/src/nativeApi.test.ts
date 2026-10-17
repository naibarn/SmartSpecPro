import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getPublicEvidenceVerificationKeys } from "@smartspec/shared/src/contentProtection";
import { classifyApiRoute } from "./apiRouteManifest";
import type { CloudflareEnvironment } from "./contracts";
import { dispatchManifestRoute, nativeApiApp, PUBLIC_EVIDENCE_KEYS_PATH } from "./nativeApi";

const keySet = JSON.stringify([{
  keyId: "verify-2026",
  algorithm: "Ed25519",
  publicKey: "public-key-material",
  validFrom: "2026-01-01T00:00:00.000Z",
}]);

function expectedExpressEtag(raw: string | undefined): string {
  const body = JSON.stringify(getPublicEvidenceVerificationKeys(raw));
  const digest = createHash("sha1").update(body).digest("base64").slice(0, 27);
  return `W/"${Buffer.byteLength(body).toString(16)}-${digest}"`;
}

describe("Hono native API foundation", () => {
  it("runs the existing public evidence-key service natively under Node's Fetch runtime", async () => {
    const env: CloudflareEnvironment = { CONTENT_PROTECTION_PUBLIC_KEYS_JSON: keySet };
    const originProxy = vi.fn(async () => new Response("origin"));
    const response = await dispatchManifestRoute(
      new Request(`https://smartaihub.app${PUBLIC_EVIDENCE_KEYS_PATH}`),
      env,
      { originProxy },
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response?.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response?.headers.get("etag")).toBe(expectedExpressEtag(keySet));
    expect(await response?.json()).toEqual(getPublicEvidenceVerificationKeys(keySet));
    expect(originProxy).not.toHaveBeenCalled();

    const etag = response?.headers.get("etag");
    const conditional = await nativeApiApp.request(`http://localhost${PUBLIC_EVIDENCE_KEYS_PATH}`, {
      headers: { "if-none-match": etag ?? "" },
    }, env);
    expect(conditional.status).toBe(304);
    expect(conditional.headers.get("etag")).toBe(etag);
  });

  it("returns parity for empty, valid, and malformed configured key sets", async () => {
    for (const raw of [undefined, keySet, "not-json"]) {
      const env: CloudflareEnvironment = { CONTENT_PROTECTION_PUBLIC_KEYS_JSON: raw };
      const response = await nativeApiApp.request(`http://localhost${PUBLIC_EVIDENCE_KEYS_PATH}`, undefined, env);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=300");
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(response.headers.get("etag")).toBe(expectedExpressEtag(raw));
      expect(await response.json()).toEqual(getPublicEvidenceVerificationKeys(raw));
    }
  });

  it("supports HEAD and rejects oversized request metadata with stable API errors", async () => {
    const head = await nativeApiApp.request(`http://localhost${PUBLIC_EVIDENCE_KEYS_PATH}`, { method: "HEAD" }, {});
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const oversized = await nativeApiApp.request(`http://localhost${PUBLIC_EVIDENCE_KEYS_PATH}`, {
      headers: { "content-length": "1025" },
    }, {});
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: "REQUEST_TOO_LARGE" });
  });

  it("uses the explicit manifest for origin-proxy rollback and rejects unregistered paths", async () => {
    const route = classifyApiRoute("GET", PUBLIC_EVIDENCE_KEYS_PATH);
    const rollbackRoute = { ...route, classification: "ORIGIN_PROXY" as const };
    const originProxy = vi.fn(async () => new Response("legacy-origin", { status: 200 }));
    const response = await dispatchManifestRoute(
      new Request(`https://smartaihub.app${PUBLIC_EVIDENCE_KEYS_PATH}`),
      {},
      { manifest: [rollbackRoute], originProxy },
    );
    expect(await response?.text()).toBe("legacy-origin");
    expect(originProxy).toHaveBeenCalledOnce();

    const unregistered = await nativeApiApp.request("http://localhost/native-not-registered");
    expect(unregistered.status).toBe(404);
  });
});
