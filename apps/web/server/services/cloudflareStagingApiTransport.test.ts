import { createHash } from "node:crypto";
import { cloudflareOriginDescriptorDigest, type CloudflareOriginDescriptor } from "./cloudflareOriginVersionBindings";
import { nativeProvisionNamespace, nativeProvisionPlanDigest } from "./cloudflareNativeProvisionContract";
import { nativeWorkerBindings, type CloudflareNativeBindingDescriptor } from "./cloudflareNativeBindingDescriptor";
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
const assetBytes = new TextEncoder().encode('<!doctype html><div id="root"></div><script type="module" src="/assets/app.js"></script>');

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
  moduleFiles: {
    "index.js": { contentType: "application/javascript", bytes },
    // The canonical Wrangler output includes this alongside index.js. The
    // artifact publisher infers a browser MIME type, which is invalid for modules.
    "README.md": { contentType: "text/markdown; charset=utf-8", bytes: new TextEncoder().encode("Wrangler output") },
  },
  assets: {
    "index.html": { contentType: "application/octet-stream", bytes: assetBytes },
    "_headers": { contentType: "application/octet-stream", bytes: new TextEncoder().encode("/\n  Cache-Control: no-cache\n") },
  },
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
      if (url.endsWith("/assets-upload-session")) {
        expect(JSON.parse(String(init.body)).manifest).not.toHaveProperty("/_headers");
        return json({ jwt: "upload-session-jwt", buckets: [[createHash("md5").update("smartaihub-http-metadata-v1\0").update("text/html; charset=utf-8").update("\0").update(assetBytes).digest("hex")]] });
      }
      if (url.includes("/workers/assets/upload?base64=true")) {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer upload-session-jwt");
        const uploaded = (init.body as FormData).get(createHash("md5").update("smartaihub-http-metadata-v1\0").update("text/html; charset=utf-8").update("\0").update(assetBytes).digest("hex")) as File;
        expect(uploaded.type).toBe("text/html; charset=utf-8");
        expect(await uploaded.text()).toBe(Buffer.from(assetBytes).toString("base64"));
        return json({ jwt: "completion-jwt" }, 201);
      }
      if (url.endsWith("/versions")) {
        const form = init.body as FormData;
        const metadata = JSON.parse(await form.get("metadata")!.text());
        expect(metadata.main_module).toBe("index.js");
        expect((form.get("index.js") as File).type).toBe("application/javascript+module");
        expect((form.get("README.md") as File).type).toBe("text/plain");
        expect(await (form.get("README.md") as File).text()).toBe("Wrangler output");
        expect(metadata.assets.jwt).toBe("completion-jwt");
        expect(metadata.assets.config._headers).toContain("Cache-Control: no-cache");
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
      if (url === "https://smartspec-cloudflare-staging.account-test.workers.dev/") return new Response(assetBytes, { headers: { "Content-Type": "text/html" } });
      if (url === "https://smartspec-cloudflare-staging.account-test.workers.dev/assets/app.js") return new Response("export default {}", { headers: { "Content-Type": "application/javascript" } });
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

  it("rejects unsupported module MIME types before even creating an asset upload session", async () => {
    const invalidBase = { ...bundleBase, moduleFiles: {
      ...bundleBase.moduleFiles,
      "unknown.module": { contentType: "application/json", bytes: new TextEncoder().encode("{}") },
    } };
    const invalidDigest = digest(invalidBase);
    const fetchImpl = vi.fn() as typeof fetch;
    const cloudflare = createCloudflareStagingApiTransport({
      resolveBundle: async () => ({ ...invalidBase, buildDigest: invalidDigest }), fetchImpl,
    });
    await expect(cloudflare.deploy({ token: "secret-token", target,
      artifact: { ...artifact, buildDigest: invalidDigest }, idempotencyKey: "invalid-module",
    })).rejects.toThrow("CLOUDFLARE_STAGING_MODULE_CONTENT_TYPE_INVALID");
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

  it("rechecks mutation authority after slow bundle reads before any provider write", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      expect(init.method ?? "GET").toBe("GET");
      expect(String(input)).toMatch(/deployments$/);
      return json({ deployments: [] });
    }) as typeof fetch;
    const assertMutationAuthorized = vi.fn(async () => { throw Error("LEASE_EXPIRED_DURING_ARTIFACT_READ"); });
    const transport = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    await expect(transport.deploy({ token: "private", target, artifact, idempotencyKey: "job-lease-test", assertMutationAuthorized }))
      .rejects.toThrow("LEASE_EXPIRED_DURING_ARTIFACT_READ");
    expect(assertMutationAuthorized).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not accept a healthy Worker whose SPA is served as a binary download", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workers/subdomain")) return json({ subdomain: "account-test" });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId, annotations: { "workers/message": `SmartAIHub staging ${sourceSha} ${buildDigest}` } });
      if (url.endsWith("/deployments")) return json({ deployments: [{ id: deploymentId }] });
      if (url.endsWith("/healthz")) return Response.json({ ok: true, service: "smartspec-cloudflare-runtime" });
      return new Response(assetBytes, { headers: { "Content-Type": "application/octet-stream" } });
    }) as typeof fetch;
    const transport = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl });
    expect(await transport.verifyRuntime({ token: "private", target, deploymentId, sourceSha, buildDigest,
      url: "https://smartspec-cloudflare-staging.account-test.workers.dev" })).toMatchObject({ reachable: false });
  });

});


describe("Cloudflare version-scoped origin transport", () => {
  const publicUrl = "https://smartspec-cloudflare-staging.account-test.workers.dev";
  function configuration(overrides: Partial<CloudflareOriginDescriptor> = {}) {
    const descriptor: CloudflareOriginDescriptor = {
      schemaVersion: "cloudflare.origin-configuration.v1", versionId: "33333333-3333-4333-8333-333333333333",
      tenantId: target.tenantId, projectId: target.projectId, environment: "staging", provider: "cloudflare",
      accountRef: accountId, targetId: "smartspec-cloudflare-staging", origin: "https://staging-origin.example.com",
      allowedPublicOrigins: [publicUrl], accessApplicationId: "44444444-4444-4444-8444-444444444444",
      accessTeamName: "test-team", accessAudience: "test-application-audience",
      expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
    };
    const configurationDigest = cloudflareOriginDescriptorDigest(descriptor);
    return { descriptor, configurationDigest, configurationRef: `cf-origin:${configurationDigest}`,
      secrets: { token: "t".repeat(32), clientId: "id-" + "i".repeat(20), secret: "s".repeat(32) } };
  }
  function fixture(options: { message?: string; prior?: boolean; auth?: () => Response; native?: CloudflareNativeBindingDescriptor; versionBindings?: unknown } = {}) {
    const config = configuration(options.native ? { nativeResources: options.native } : {});
    const originTarget = { ...target, runtimePolicy: config.configurationRef };
    const mutations: Array<{ url: string; init: RequestInit }> = [];
    let metadata: any;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (init.method && init.method !== "GET") mutations.push({ url, init });
      if (url.endsWith("/workers/subdomain")) return json({ subdomain: "account-test" });
      if (url.endsWith("/assets-upload-session")) return json({ jwt: "completed-asset-session", buckets: [] });
      if (url.endsWith("/versions") && init.method === "POST") {
        metadata = JSON.parse(await ((init.body as FormData).get("metadata") as File).text());
        return json({ id: versionId });
      }
      if (url.endsWith("/deployments") && init.method === "POST") return json({ id: deploymentId });
      if (url.endsWith("/deployments")) return json({ deployments: [{ id: deploymentId,
        annotations: { "workers/message": options.prior ? "SmartAIHub staging idempotency cloudflare-staging:origin-job" : "other-job" } }] });
      if (url.endsWith(`/deployments/${deploymentId}`)) return json({ id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] });
      if (url.endsWith(`/versions/${versionId}`)) return json({ id: versionId,
        resources: { bindings: options.versionBindings ?? metadata?.bindings ?? (options.native ? [
          ...nativeWorkerBindings(options.native), { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "disabled" },
        ] : []) },
        annotations: { "workers/message": options.message ?? `SmartAIHub staging ${sourceSha} ${buildDigest} origin ${config.configurationDigest}` } });
      if (url === `${publicUrl}/healthz`) return new Response(JSON.stringify({ ok: true, service: "smartspec-cloudflare-runtime" }), { headers: { "content-type": "application/json" } });
      if (url === `${publicUrl}/`) return new Response(new TextDecoder().decode(assetBytes), { headers: { "content-type": "text/html" } });
      if (url === `${publicUrl}/assets/app.js`) return new Response("console.log('app')", { headers: { "content-type": "application/javascript" } });
      if (url === `${publicUrl}/trpc/auth.me`) return options.auth?.() ?? new Response(JSON.stringify({ result: { data: { json: null } } }), { headers: { "content-type": "application/json" } });
      throw new Error(`Unexpected fixture request ${url}`);
    }) as typeof fetch;
    return { config, originTarget, fetchImpl, mutations, metadata: () => metadata,
      api: createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl, verifyNativeResources: async () => {} }) };
  }
  function deploy(f: ReturnType<typeof fixture>, assertMutationAuthorized = async () => {}) {
    return f.api.deploy({ token: "provider-deployment-token", target: f.originTarget, artifact,
      idempotencyKey: "cloudflare-staging:origin-job", originConfiguration: f.config, assertMutationAuthorized });
  }
  function verify(f: ReturnType<typeof fixture>) {
    return f.api.verifyRuntime({ token: "provider-deployment-token", target: f.originTarget,
      deploymentId, url: publicUrl, sourceSha, buildDigest, configurationDigest: f.config.configurationDigest });
  }

  function nativeDescriptor(): CloudflareNativeBindingDescriptor {
    const plan = { namespace: nativeProvisionNamespace(target.tenantId, target.projectId), vectorDimensions: 768 as const,
      vectorMetric: "cosine" as const, configurationExpiresAt: new Date(Date.now() + 3600_000).toISOString() };
    return { provisionJobId: "55555555-5555-4555-8555-555555555555", plan, planDigest: nativeProvisionPlanDigest(plan), queueId: "a".repeat(32) };
  }

  it("binds only verified native resource names and reads the immutable version before activation", async () => {
    const native = nativeDescriptor(), f = fixture({ native });
    await deploy(f);
    expect(f.metadata().bindings).toEqual(expect.arrayContaining(nativeWorkerBindings(native)));
    const calls = vi.mocked(f.fetchImpl).mock.calls;
    const versionRead = calls.findIndex(([url]) => String(url).endsWith(`/versions/${versionId}`));
    const activation = calls.findIndex(([url, init]) => String(url).endsWith("/deployments") && init?.method === "POST");
    expect(versionRead).toBeGreaterThan(-1);
    expect(activation).toBeGreaterThan(versionRead);
    expect(f.mutations.every(call => !/\/queues|\/r2|\/vectorize|\/routes|\/schedules/.test(call.url))).toBe(true);
  });

  it.each([false, true])("refuses missing uploaded native bindings even with a matching digest annotation (retry=%s)", async prior => {
    const f = fixture({ native: nativeDescriptor(), versionBindings: [], prior });
    await expect(deploy(f)).rejects.toThrow("VERSION_BINDINGS_MISMATCH");
    expect(f.mutations.some(call => call.url.endsWith("/deployments"))).toBe(false);
  });

  it("requires a scoped resource verifier and refuses drift before uploading a version", async () => {
    const f = fixture({ native: nativeDescriptor() });
    const input = { token: "provider-token", target: f.originTarget, artifact, idempotencyKey: "native-job", originConfiguration: f.config,
      assertMutationAuthorized: async () => {} };
    const missing = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl: f.fetchImpl });
    await expect(missing.deploy(input)).rejects.toThrow("NATIVE_PROVIDER_VERIFIER_REQUIRED");
    expect(f.fetchImpl).not.toHaveBeenCalled();
    const drift = createCloudflareStagingApiTransport({ resolveBundle: async () => bundle, fetchImpl: f.fetchImpl,
      verifyNativeResources: async () => { throw Error("native resource drift"); } });
    await expect(drift.deploy(input)).rejects.toThrow("native resource drift");
    expect(f.mutations).toHaveLength(0);
  });

  it("uploads origin secrets only as version bindings and returns distinct artifact/config receipts", async () => {
    const f = fixture();
    const guard = vi.fn(async () => {});
    const receipt = await deploy(f, guard);
    expect(receipt.configurationDigest).toBe(f.config.configurationDigest);
    expect(receipt.buildDigest).toBe(buildDigest);
    expect(guard).toHaveBeenCalledTimes(3);
    const metadata = f.metadata();
    expect(metadata.bindings).toContainEqual({ name: "AUTH_ORIGIN", type: "plain_text", text: f.config.descriptor.origin });
    expect(metadata.bindings).toContainEqual({ name: "AUTH_ORIGIN_PRIVATE_HOST", type: "plain_text", text: "staging-origin.example.com" });
    expect(metadata.bindings).toContainEqual({ name: "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS", type: "plain_text", text: JSON.stringify([publicUrl]) });
    for (const [name, text] of [["AUTH_ORIGIN_TOKEN", f.config.secrets.token], ["AUTH_ORIGIN_ACCESS_CLIENT_ID", f.config.secrets.clientId], ["AUTH_ORIGIN_ACCESS_CLIENT_SECRET", f.config.secrets.secret]]) {
      expect(metadata.bindings).toContainEqual({ name, type: "secret_text", text });
      expect(JSON.stringify(receipt)).not.toContain(text);
    }
    expect(metadata.bindings).not.toContainEqual(expect.objectContaining({ name: "DATABASE_URL" }));
    expect(metadata.annotations["workers/message"]).toBe(`SmartAIHub staging ${sourceSha} ${buildDigest} origin ${f.config.configurationDigest}`);
    expect(f.mutations.every(r => !/secrets|routes|queues|cron|hyperdrive/.test(r.url))).toBe(true);
    expect((await verify(f)).reachable).toBe(true);
  });

  it.each(["tenantId", "projectId", "accountRef", "configurationDigest", "configurationRef"])("denies %s drift before any provider call", async field => {
    const f = fixture();
    if (field in f.config.descriptor) (f.config.descriptor as any)[field] = "foreign";
    else (f.config as any)[field] = "foreign";
    await expect(deploy(f)).rejects.toThrow("CLOUDFLARE_ORIGIN_CONFIGURATION_DENIED");
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects unbound origins, missing mutation guards and origin bootstrap before fetch", async () => {
    const f = fixture();
    for (const overrides of [{ target }, { assertMutationAuthorized: undefined }, { bootstrap: true }]) {
      await expect(f.api.deploy({ token: "provider-token", target: f.originTarget, artifact,
        idempotencyKey: "origin-job", originConfiguration: f.config, assertMutationAuthorized: async () => {}, ...overrides })).rejects.toThrow("CLOUDFLARE_STAGING_ORIGIN_GRANT_REQUIRED");
    }
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it("denies an allowlist that omits the actual workers.dev origin before upload", async () => {
    const f = fixture();
    f.config = configuration({ allowedPublicOrigins: ["https://different.example.com"] });
    f.originTarget.runtimePolicy = f.config.configurationRef;
    await expect(deploy(f)).rejects.toThrow("CLOUDFLARE_STAGING_PUBLIC_ORIGIN_DENIED");
    expect(f.mutations).toHaveLength(0);
  });

  it("snapshots caller-owned configuration before asynchronous bundle reads", async () => {
    const f = fixture();
    const api = createCloudflareStagingApiTransport({ fetchImpl: f.fetchImpl, resolveBundle: async () => {
      f.config.secrets.secret = "foreign-secret".repeat(4);
      f.config.descriptor.allowedPublicOrigins.push("https://unapproved.example.com");
      return bundle;
    } });
    await api.deploy({ token: "provider-token", target: f.originTarget, artifact,
      idempotencyKey: "origin-job", originConfiguration: f.config, assertMutationAuthorized: async () => {} });
    expect(f.metadata().bindings).toContainEqual({ name: "AUTH_ORIGIN_ACCESS_CLIENT_SECRET", type: "secret_text", text: "s".repeat(32) });
    expect(JSON.stringify(f.metadata())).not.toContain("unapproved.example.com");
  });

  it("rechecks configuration expiry after a long bundle read and before provider mutation", async () => {
    const f = fixture();
    const originalNow = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(originalNow);
    try {
      const api = createCloudflareStagingApiTransport({ fetchImpl: f.fetchImpl, resolveBundle: async () => {
        clock.mockReturnValue(originalNow + 120_000);
        return bundle;
      } });
      await expect(api.deploy({ token: "provider-token", target: f.originTarget, artifact,
        idempotencyKey: "origin-job", originConfiguration: f.config, assertMutationAuthorized: async () => {} })).rejects.toThrow("CLOUDFLARE_ORIGIN_CONFIGURATION_DENIED");
      expect(f.mutations).toHaveLength(0);
    } finally { clock.mockRestore(); }
  });

  it("stops before activation when the current authority is revoked after upload", async () => {
    const f = fixture();
    let calls = 0;
    await expect(deploy(f, async () => { if (++calls === 3) throw new Error("GRANT_REVOKED"); })).rejects.toThrow("GRANT_REVOKED");
    expect(f.mutations).toHaveLength(2);
    expect(f.mutations.some(r => r.url.endsWith("/deployments"))).toBe(false);
  });

  it("does not reuse an artifact-only receipt for an origin-bearing retry", async () => {
    const f = fixture({ prior: true, message: `SmartAIHub staging ${sourceSha} ${buildDigest}` });
    await expect(deploy(f)).rejects.toThrow("CLOUDFLARE_IDEMPOTENT_DEPLOYMENT_ARTIFACT_MISMATCH");
    expect(f.mutations).toHaveLength(0);
  });

  it("verifies the origin digest independently from unchanged artifact bytes", async () => {
    const f = fixture({ message: `SmartAIHub staging ${sourceSha} ${buildDigest} origin ${"f".repeat(64)}` });
    await expect(verify(f)).rejects.toThrow("CLOUDFLARE_DEPLOYMENT_ARTIFACT_RECEIPT_MISMATCH");
    expect(f.mutations).toHaveLength(0);
  });

  it.each([
    () => new Response("<html>Access login</html>", { headers: { "content-type": "text/html" } }),
    () => new Response(JSON.stringify({ error: "AUTH_ORIGIN_UNAVAILABLE" }), { status: 503, headers: { "content-type": "application/json" } }),
    () => new Response(JSON.stringify({ error: { message: "backend failure" } }), { headers: { "content-type": "application/json" } }),
    () => new Response(null, { status: 302, headers: { location: "https://team.cloudflareaccess.com/" } }),
  ])("fails origin acceptance when assets/health pass but actual auth does not", async auth => {
    const f = fixture({ auth });
    expect((await verify(f)).reachable).toBe(false);
  });

  it("reconciles an origin rollback retry without creating another deployment", async () => {
    const f = fixture({ prior: true });
    const result = await f.api.rollback({ token: "provider-token", target: f.originTarget, deploymentId, sourceSha, buildDigest,
      configurationDigest: f.config.configurationDigest, idempotencyKey: "cloudflare-staging:origin-job", assertMutationAuthorized: async () => {} });
    expect(result.deploymentId).toBe(deploymentId);
    expect(f.mutations).toHaveLength(0);
  });

  it("requires the exact previous config for rollback, then reuses its immutable version", async () => {
    const f = fixture();
    const rollback = { token: "provider-token", target: f.originTarget, deploymentId, sourceSha, buildDigest,
      idempotencyKey: "origin-rollback", assertMutationAuthorized: async () => {} };
    await expect(f.api.rollback(rollback)).rejects.toThrow("CLOUDFLARE_ROLLBACK_ORIGIN_MISMATCH");
    await expect(f.api.rollback({ ...rollback, configurationDigest: "e".repeat(64) })).rejects.toThrow("CLOUDFLARE_ROLLBACK_ORIGIN_MISMATCH");
    expect(f.mutations).toHaveLength(0);
    const receipt = await f.api.rollback({ ...rollback, configurationDigest: f.config.configurationDigest });
    expect(receipt.configurationDigest).toBe(f.config.configurationDigest);
    expect(f.mutations).toHaveLength(1);
    expect(f.mutations[0].url.endsWith("/deployments")).toBe(true);
    expect(f.metadata()).toBeUndefined();
  });
});
