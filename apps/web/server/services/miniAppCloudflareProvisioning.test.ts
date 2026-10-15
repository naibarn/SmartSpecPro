import { beforeEach, describe, expect, it, vi } from "vitest";

const { credentialMock } = vi.hoisted(() => ({ credentialMock: vi.fn() }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareDeploymentCredential: credentialMock }));

import { deploymentCredentialRef } from "./providerDeploymentTargetAuthority";
import { miniAppRuntimeResourceNamesForTarget, provisionMiniAppCloudflareTarget } from "./miniAppCloudflareProvisioning";

const identity = { tenantId: "tenant-a", projectId: "project-a", environment: "preview", provider: "cloudflare" };
const target = {
  id: "9d4f1679-ea7b-4e0d-9306-8ec53ab46945", ...identity, deploymentTargetId: "miniapp-preview",
  accountRef: "a".repeat(32), workerRef: null, containerApplicationRef: null,
  credentialRef: deploymentCredentialRef(identity), enabled: true, provenance: "owner-configured",
};

function response(status: number, body: unknown, text = "") {
  return new Response(text || JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Mini-App Cloudflare target provisioning", () => {
  beforeEach(() => {
    credentialMock.mockReset();
    credentialMock.mockImplementation(async (_db: unknown, _scope: unknown, operation: (token: string) => Promise<unknown>) => ({
      status: "CONFIGURED", value: await operation("secret-token-for-test"),
    }));
  });

  it("creates deterministic isolated preview R2 and an unexposed BUILDING Worker", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url.includes("/r2/buckets?")) return response(200, { success: true, result: { buckets: [] } });
      if (url.endsWith("/r2/buckets")) return response(200, { success: true, result: { name: "created" } });
      if (url.includes("/workers/scripts/") && !init.method) return response(404, { success: false });
      if (url.endsWith("/subdomain")) return response(200, { success: true, result: { enabled: false, previews_enabled: false } });
      return response(200, { success: true, result: { id: "deployment-1" } });
    });

    const result = await provisionMiniAppCloudflareTarget({ db: {} as never, target, fetchImpl });
    const names = miniAppRuntimeResourceNamesForTarget(target.id);
    expect(result).toEqual({ status: "PROVISIONED", ...names, workerExposure: "DISABLED", runtimeStatus: "BUILDING" });
    expect(requests.map(request => request.init.method ?? "GET")).toEqual(["GET", "POST", "GET", "PUT", "POST"]);
    expect(JSON.parse(String(requests[1]?.init.body))).toEqual({ name: names.bucketName });
    expect(requests[3]?.url).toContain(names.workerName);
    expect(requests[3]?.init.headers).toEqual({ Authorization: "Bearer secret-token-for-test" });
    expect(JSON.parse(String(requests[4]?.init.body))).toEqual({ enabled: false, previews_enabled: false });
    const form = requests[3]?.init.body as FormData;
    expect(JSON.parse(await (form.get("metadata") as Blob).text())).toMatchObject({
      bindings: [{ type: "r2_bucket", name: "MINIAPP_ARTIFACTS", bucket_name: names.bucketName }],
    });
    expect(await (form.get("runtime.mjs") as Blob).text()).toContain('"BUILDING"');
  });

  it("does not make Cloudflare calls for production or disabled targets", async () => {
    const fetchImpl = vi.fn();
    await expect(provisionMiniAppCloudflareTarget({ db: {} as never, target: { ...target, environment: "production" }, fetchImpl }))
      .rejects.toThrow("MINI_APP_TARGET_NOT_AUTHORIZED");
    await expect(provisionMiniAppCloudflareTarget({ db: {} as never, target: { ...target, enabled: false }, fetchImpl }))
      .rejects.toThrow("MINI_APP_TARGET_NOT_AUTHORIZED");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(credentialMock).not.toHaveBeenCalled();
  });

  it("refuses to overwrite a Worker whose source lacks the SmartAIHub runtime marker", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/r2/buckets?")) return response(200, { success: true, result: { buckets: [{ name: miniAppRuntimeResourceNamesForTarget(target.id).bucketName }] } });
      return response(200, {}, "export default { fetch() { return new Response('other app') } }");
    });
    await expect(provisionMiniAppCloudflareTarget({ db: {} as never, target, fetchImpl })).rejects.toThrow("MINI_APP_WORKER_NAME_CONFLICT");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reuses deterministic resources after an interrupted provisioning attempt", async () => {
    const names = miniAppRuntimeResourceNamesForTarget(target.id);
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/r2/buckets?")) return response(200, { success: true, result: { buckets: [{ name: names.bucketName }] } });
      if (url.includes("/workers/scripts/") && !init.method) return response(200, {}, `// smartaihub-miniapp-runtime/v1\n${"x".repeat(100)}`);
      if (url.endsWith("/subdomain")) return response(200, { success: true, result: { enabled: false, previews_enabled: false } });
      return response(200, { success: true, result: { id: "deployment-2" } });
    });
    await expect(provisionMiniAppCloudflareTarget({ db: {} as never, target, fetchImpl })).resolves.toMatchObject({
      status: "PROVISIONED", ...names,
    });
    expect(fetchImpl.mock.calls.some(([url, init]) => url.endsWith("/r2/buckets") && init?.method === "POST")).toBe(false);
  });

  it("fails provisioning unless Cloudflare confirms both Worker endpoints are disabled", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/r2/buckets?")) return response(200, { success: true, result: { buckets: [] } });
      if (url.endsWith("/r2/buckets")) return response(200, { success: true, result: {} });
      if (url.includes("/workers/scripts/") && !init.method) return response(404, {});
      if (url.endsWith("/subdomain")) return response(200, { success: true, result: { enabled: true, previews_enabled: false } });
      return response(200, { success: true, result: {} });
    });
    await expect(provisionMiniAppCloudflareTarget({ db: {} as never, target, fetchImpl })).rejects.toThrow("MINI_APP_WORKER_EXPOSURE_NOT_DISABLED");
  });

  it("fails closed when the configured credential is absent", async () => {
    credentialMock.mockResolvedValueOnce({ status: "NOT_CONFIGURED" });
    const fetchImpl = vi.fn();
    await expect(provisionMiniAppCloudflareTarget({ db: {} as never, target, fetchImpl })).rejects.toThrow("MINI_APP_CREDENTIAL_NOT_CONFIGURED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
