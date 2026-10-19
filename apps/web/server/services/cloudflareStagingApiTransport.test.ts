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
  ].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const manifest = files.map(([name, value]) => `${name}\0${createHash("sha256").update(value).digest("hex")}\0${value.byteLength}`).join("\n");
  return createHash("sha256").update(manifest).digest("hex");
}

const bundleBase = {
  sourceSha,
  mainModule: "index.js",
  compatibilityDate: "2026-10-17",
  moduleFiles: { "index.js": { contentType: "application/javascript", bytes } },
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
  it("accepts canonical codepoint digests for localized assets before provider mutation", async () => {
    const localizedBase = {
      ...bundleBase,
      assets: {
        ...bundleBase.assets,
        "z-guide.md": { contentType: "text/markdown", bytes: new TextEncoder().encode("guide") },
        "ä-guide.md": { contentType: "text/markdown", bytes: new TextEncoder().encode("localized guide") },
        "คู่มือ.md": { contentType: "text/markdown", bytes: new TextEncoder().encode("คู่มือ") },
      },
    };
    const localizedDigest = digest(localizedBase);
    const fetchImpl = vi.fn(async () => {
      throw new Error("PROVIDER_READ_PREFLIGHT_REACHED");
    }) as typeof fetch;
    const cloudflare = createCloudflareStagingApiTransport({
      resolveBundle: async () => ({ ...localizedBase, buildDigest: localizedDigest }),
      fetchImpl,
    });
    await expect(cloudflare.deploy({
      token: "secret-token", target,
      artifact: { ...artifact, buildDigest: localizedDigest },
      idempotencyKey: "cloudflare-staging:localized-job",
    })).rejects.toThrow("PROVIDER_READ_PREFLIGHT_REACHED");
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${target.workerRef}/deployments`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(init.method ?? "GET").toBe("GET");
  });

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
        expect((form.get("index.js") as File).type).toBe("application/javascript+module");
        expect(metadata.assets.jwt).toBe("completion-jwt");
        expect(metadata.bindings).toEqual([
          { name: "ASSETS", type: "assets" },
          { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "disabled" },
          { name: "CLOUDFLARE_ENVIRONMENT", type: "plain_text", text: "staging" },
        ]);
        expect(metadata.annotations["workers/message"]).toContain(buildDigest);
        return json({ id: versionId });
      }
      if (url.endsWith("/deployments") && init.method !== "POST") return json({ deployments: [{ id: deploymentId }] });
      if (url.endsWith("/deployments") && init.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.versions).toEqual([{ version_id: versionId, percentage: 100 }]);
        expect(JSON.stringify(body)).not.toMatch(/routes|cron|queue|hyperdrive|migration/i);
        return json({ id: deploymentId });
      }
      if (url.endsWith("/workers/subdomain")) return json({ subdomain: "account-test" });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, annotations: {
        "workers/commit_sha": sourceSha,
        "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}`,
      } });
      if (url === "https://smartspec-cloudflare-staging.account-test.workers.dev/healthz") return Response.json({ ok: true, service: "smartspec-cloudflare-runtime" });
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
    expect(
      requests.some(request =>
        request.url.endsWith(`/accounts/${accountId}/workers/scripts/smartspec-cloudflare-staging/assets-upload-session`),
      ),
    ).toBe(true);
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
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, annotations: {
        "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}`,
      } });
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
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, annotations: {
        "workers/commit_sha": sourceSha,
        "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}`,
      } });
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
  it("bootstraps an absent Worker with the official PUT flow and resumes only its own version", async () => {
    let created = false;
    let accountSubdomain = false;
    let versionTag = "";
    let putCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith("/deployments")) return created
        ? json({ deployments: [{ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] }] })
        : json({ deployments: [] });
      if (url.endsWith(`/scripts/${target.workerRef}/versions`)) return json({ items: [] });
      if (url.endsWith(`/scripts/${target.workerRef}/settings`)) return new Response(JSON.stringify({ success: false, errors: [{ code: 10222 }] }), { status: 404 });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, annotations: {
        "workers/tag": versionTag, "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}`,
      } });
      if (url.endsWith("/workers/scripts")) return json([{ id: "existing-disabled-worker" }]);
      if (url.endsWith("/scripts/existing-disabled-worker/subdomain")) return json({ enabled: false, previews_enabled: false });
      if (url.endsWith("/workers/subdomain")) {
        if (init.method === "PUT") { accountSubdomain = true; expect(JSON.parse(String(init.body))).toEqual({ subdomain: `smartaihub-${accountId.slice(0, 8)}` }); }
        return accountSubdomain ? json({ subdomain: `smartaihub-${accountId.slice(0, 8)}` })
          : new Response(JSON.stringify({ success: false, errors: [{ code: 10007 }] }), { status: 404 });
      }
      if (url.endsWith("/assets-upload-session")) return json({ jwt: "completion", buckets: [] });
      if (url.endsWith(`/scripts/${target.workerRef}`) && init.method === "PUT") {
        const metadata = JSON.parse(await ((init.body as FormData).get("metadata") as File).text());
        expect(Object.keys(metadata.annotations).sort()).toEqual(["workers/message", "workers/tag"]);
        expect(metadata.bindings).toHaveLength(3);
        expect(JSON.stringify(metadata)).not.toMatch(/hyperdrive|database|route|cron|queue|container/i);
        versionTag = metadata.annotations["workers/tag"]; putCount++; created = true;
        return json({ id: target.workerRef });
      }
      if (url.endsWith(`/scripts/${target.workerRef}/subdomain`)) {
        expect(JSON.parse(String(init.body))).toEqual({ enabled: true, previews_enabled: false });
        return json({ enabled: true });
      }
      throw Error("UNEXPECTED_BOOTSTRAP_ENDPOINT");
    }) as typeof fetch;
    const transport = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    const request = { token: "private", target, artifact, idempotencyKey: "cloudflare-staging:bootstrap-job", bootstrap: true };
    expect(await transport.deploy(request)).toMatchObject({ deploymentId, sourceSha, buildDigest });
    expect(await transport.deploy(request)).toMatchObject({ deploymentId });
    expect(putCount).toBe(1);
    versionTag = "foreign-job";
    await expect(transport.deploy(request)).rejects.toThrow("BOOTSTRAP_EXISTING_WORKER_DENIED");
    expect(putCount).toBe(1);
  });

  it("never registers an account-wide subdomain when existing Workers could be exposed", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      expect(init.method ?? "GET").toBe("GET");
      if (String(input).endsWith("/scripts/existing-worker/subdomain")) return json({ enabled: true, previews_enabled: false });
      return String(input).endsWith("/workers/scripts") ? json([{ id: "existing-worker" }])
        : new Response(JSON.stringify({ success: false, errors: [{ code: 10007 }] }), { status: 404 });
    }) as typeof fetch;
    const transport = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    await expect(transport.deploy({ token: "private", target, artifact, idempotencyKey: "bootstrap", bootstrap: true })).rejects.toThrow("ACCOUNT_SUBDOMAIN_SCOPE_DENIED");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("refuses a historical deployment receipt when another deployment is active", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workers/subdomain")) return json({ subdomain: "account-test" });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, annotations: { "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}` } });
      if (url.endsWith("/deployments")) return json({ deployments: [{ id: "33333333-3333-4333-8333-333333333333" }] });
      throw Error("HEALTH_MUST_NOT_BE_CHECKED_FOR_STALE_DEPLOYMENT");
    }) as typeof fetch;
    const transport = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    await expect(transport.verifyRuntime({ token: "private", target, deploymentId, sourceSha, buildDigest,
      url: "https://smartspec-cloudflare-staging.account-test.workers.dev" })).rejects.toThrow("ACTIVE_DEPLOYMENT_MISMATCH");
  });

});
