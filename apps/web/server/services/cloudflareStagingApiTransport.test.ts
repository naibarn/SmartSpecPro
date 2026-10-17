import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CloudflareStagingTarget } from "./cloudflareStagingDeploymentExecutor";
import { createCloudflareStagingApiTransport, type CloudflareStagingBundle } from "./cloudflareStagingApiTransport";

const accountId = "0123456789abcdef0123456789abcdef";
const target: CloudflareStagingTarget = {
  targetId: "smartspec-cloudflare-staging",
  environment: "staging",
  accountRef: accountId,
  workerRef: "smartspec-cloudflare-staging",
  credentialRef: "opaque-ref",
  enabled: true,
  tenantId: "tenant-a",
  projectId: "project-a",
};
const sourceSha = "a".repeat(40);
const bytes = new TextEncoder().encode("export default { fetch() { return new Response('ok') } }");
const assetBytes = new TextEncoder().encode("<!doctype html><div id=\"root\"></div>");

function digest(bundle: Omit<CloudflareStagingBundle, "buildDigest">) {
  const files = [
    ...Object.entries(bundle.moduleFiles).map(([name, file]) => [`modules/${name}`, file.bytes] as const),
    ...Object.entries(bundle.assets).map(([name, file]) => [`public/${name}`, file.bytes] as const),
  ].sort(([left], [right]) => left.localeCompare(right));
  const manifest = files.map(([name, value]) => `${name}\0${createHash("sha256").update(value).digest("hex")}\0${value.byteLength}`).join("\n");
  return createHash("sha256").update(manifest).digest("hex");
}

const bundleBase = {
  sourceSha,
  mainModule: "index.js",
  compatibilityDate: "2026-10-17",
  moduleFiles: { "index.js": { contentType: "application/javascript+module", bytes } },
  assets: { "index.html": { contentType: "text/html", bytes: assetBytes } },
};
const buildDigest = digest(bundleBase);
const bundle: CloudflareStagingBundle = { ...bundleBase, buildDigest };
const artifact = { artifactRef: "canonical:main:build-1", sourceSha, buildDigest, immutable: true as const };
const deploymentId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";

function json(result: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, result }), { status, headers: { "Content-Type": "application/json" } });
}

describe("Cloudflare staging API transport", () => {
  it("uploads a verified static bundle, creates a version and deploys only the pinned staging Worker", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/assets-upload-session")) return json({ jwt: "upload-session-jwt", buckets: [[createHash("md5").update(assetBytes).digest("hex")]] });
      if (url.includes("/workers/assets/upload?base64=true")) {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer upload-session-jwt");
        const uploaded = (init.body as FormData).get(createHash("md5").update(assetBytes).digest("hex")) as File;
        expect(uploaded.type).toBe("text/html");
        expect(await uploaded.text()).toBe(Buffer.from(assetBytes).toString("base64"));
        return json({ jwt: "completion-jwt" }, 201);
      }
      if (url.endsWith("/versions")) {
        const form = init.body as FormData;
        const metadata = JSON.parse(await form.get("metadata")!.text());
        expect(metadata.main_module).toBe("index.js");
        expect(metadata.assets.jwt).toBe("completion-jwt");
        expect(metadata.bindings).toEqual([{ name: "ASSETS", type: "assets" }]);
        expect(metadata.annotations["workers/commit_sha"]).toBe(sourceSha);
        expect(metadata.annotations["workers/message"]).toContain(buildDigest);
        return json({ id: versionId });
      }
      if (url.endsWith("/deployments") && init.method !== "POST") return json({ deployments: [] });
      if (url.endsWith("/deployments") && init.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.versions).toEqual([{ version_id: versionId, percentage: 100 }]);
        expect(JSON.stringify(body)).not.toMatch(/routes|cron|queue|hyperdrive|migration/i);
        return json({ id: deploymentId });
      }
      if (url.endsWith("/workers/subdomain")) return json({ subdomain: "account-test" });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, metadata: { annotations: {
        "workers/commit_sha": sourceSha,
        "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}`,
      } } });
      if (url === "https://smartspec-cloudflare-staging.account-test.workers.dev/healthz") return new Response("ok", { status: 200 });
      throw new Error(`Unexpected request ${url}`);
    }) as typeof fetch;

    const cloudflare = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    const result = await cloudflare.deploy({ token: "secret-token", target, artifact, idempotencyKey: "cloudflare-staging:job-1" });
    expect(result).toEqual({
      deploymentId,
      url: "https://smartspec-cloudflare-staging.account-test.workers.dev",
      sourceSha,
      buildDigest,
    });
    expect(requests[0]?.url).toContain(`/accounts/${accountId}/workers/scripts/smartspec-cloudflare-staging/assets-upload-session`);
    expect(requests.every(request => !request.url.includes("smartaihub.app") && !request.url.includes("/zones/"))).toBe(true);

    const verification = await cloudflare.verifyRuntime({
      token: "secret-token", target, deploymentId, url: result.url, sourceSha, buildDigest,
    });
    expect(verification).toMatchObject({ reachable: true, deploymentId, sourceSha, buildDigest });
  });

  it("verifies a pinned prior deployment before creating an explicit rollback deployment", async () => {
    const rollbackId = "33333333-3333-4333-8333-333333333333";
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, body: typeof init.body === "string" ? init.body : undefined });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, metadata: { annotations: {
        "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}`,
      } } });
      if (url.endsWith("/deployments") && init.method === "POST") return json({ id: rollbackId });
      if (url.endsWith("/workers/subdomain")) return json({ subdomain: "account-test" });
      throw new Error(`Unexpected request ${url}`);
    }) as typeof fetch;
    const cloudflare = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    const result = await cloudflare.rollback({ token: "secret-token", target, deploymentId, idempotencyKey: "cloudflare-staging:job-rollback" });
    expect(result).toEqual({
      deploymentId: rollbackId,
      url: "https://smartspec-cloudflare-staging.account-test.workers.dev",
      sourceSha,
      buildDigest,
    });
    expect(calls.some(call => call.url.endsWith(`/versions/${versionId}`))).toBe(true);
  });

  it("reuses a verified deployment receipt on an idempotent retry", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/deployments")) return json({ deployments: [{
        id: deploymentId,
        annotations: { "workers/message": "SmartAIHub staging idempotency cloudflare-staging:job-1" },
      }] });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, metadata: { annotations: {
        "workers/commit_sha": sourceSha,
        "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}`,
      } } });
      if (url.endsWith("/workers/subdomain")) return json({ subdomain: "account-test" });
      throw new Error(`Unexpected request ${url}`);
    }) as typeof fetch;
    const cloudflare = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    const result = await cloudflare.deploy({ token: "secret-token", target, artifact, idempotencyKey: "cloudflare-staging:job-1" });
    expect(result.deploymentId).toBe(deploymentId);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("rejects a mismatched bundle digest and any target other than the exact staging worker before API mutation", async () => {
    const fetchImpl = vi.fn() as typeof fetch;
    const cloudflare = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    await expect(cloudflare.deploy({
      token: "secret-token", target, artifact: { ...artifact, buildDigest: "f".repeat(64) }, idempotencyKey: "cloudflare-staging:job-1",
    })).rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_STAGING_ARTIFACT_MISMATCH" });
    await expect(cloudflare.deploy({
      token: "secret-token", target: { ...target, workerRef: "production-worker" }, artifact, idempotencyKey: "cloudflare-staging:job-1",
    })).rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_STAGING_TARGET_DENIED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
