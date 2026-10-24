import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveTarget, withCredential } = vi.hoisted(() => ({ resolveTarget: vi.fn(), withCredential: vi.fn() }));
vi.mock("./cloudflareProductionDeploymentContract", () => ({ resolveCloudflareProductionDeploymentTarget: resolveTarget }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareDeploymentCredential: withCredential }));

import { probeCloudflareProductionProviderInventory } from "./cloudflareProductionProviderInventory";
import type { DrizzleDB } from "../db";

const accountRef = "a".repeat(32);
const workerRef = "smartspec-cloudflare-runtime";
const versionId = "81e64be8-af01-4efb-ad82-94e78da2510b";

function response(result: unknown, status = 200, complete = true) {
  return new Response(JSON.stringify({ success: status === 200, result, ...(complete ? {} : { result_info: { total_pages: 2 } }) }), { status,
    headers: { "content-type": "application/json" } });
}

describe("Cloudflare production provider inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTarget.mockResolvedValue({ targetId: workerRef, tenantId: "tenant-a", projectId: "project-a", environment: "production",
      accountRef, workerRef, credentialRef: "cloudflare:production", enabled: true });
    withCredential.mockImplementation(async (_db, _scope, operation) => ({ status: "CONFIGURED", value: await operation("test-token") }));
  });

  it("distinguishes Staging resources, unverified baseline, and unattached domain route", async () => {
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response([{ queue_name: "smartspec-staging-abc-jobs" }]);
      if (url.pathname.endsWith("/hyperdrive/configs")) return response([{ name: "smartspec-staging-abc-database" }]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/workers/routes")) return response([]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [{ id: "deployment-a", versions: [{ version_id: versionId, percentage: 100 }] }] });
      if (url.pathname.endsWith(`/versions/${versionId}`)) return response({ annotations: {}, resources: { bindings: [{ name: "CLOUDFLARE_ACTIVATION" }], script_runtime: { containers: [] } } });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });

    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({
      status: "CHECKED",
      queues: [{ name: "smartspec-staging-abc-jobs", environment: "staging" }],
      hyperdrives: [{ name: "smartspec-staging-abc-database", environment: "staging" }],
      domainRoute: { inventoryComplete: true, attached: false, conflicting: false },
      worker: { deploymentCount: 1, activeVersionCount: 1, versions: [{ bindingNames: ["CLOUDFLARE_ACTIVATION"], hasVerifiedReleaseIdentity: false }] },
    });
    expect(fetchImpl.mock.calls.every(([request, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("does not claim a complete inventory when an endpoint is inaccessible or paginated", async () => {
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response([], 200, false);
      if (url.pathname.endsWith("/hyperdrive/configs")) return response([]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/workers/routes")) return response([]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ status: "PARTIAL", queueInventoryComplete: false });
  });

  it("does not call Cloudflare when target or scoped credential is unavailable", async () => {
    resolveTarget.mockResolvedValueOnce(null);
    const fetchImpl = vi.fn();
    expect(await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl }))
      .toMatchObject({ status: "TARGET_NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();

    resolveTarget.mockResolvedValueOnce({ targetId: workerRef, tenantId: "tenant-a", projectId: "project-a", environment: "production",
      accountRef, workerRef, credentialRef: "cloudflare:production", enabled: true });
    withCredential.mockResolvedValueOnce({ status: "NOT_CONFIGURED" });
    expect(await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl }))
      .toMatchObject({ status: "CREDENTIAL_NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
