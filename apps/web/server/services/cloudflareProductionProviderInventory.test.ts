import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveTarget, withCredential } = vi.hoisted(() => ({ resolveTarget: vi.fn(), withCredential: vi.fn() }));
vi.mock("./cloudflareProductionDeploymentContract", () => ({ resolveCloudflareProductionDeploymentTarget: resolveTarget }));
const { getOriginConfiguration } = vi.hoisted(() => ({ getOriginConfiguration: vi.fn() }));
vi.mock("./cloudflareOriginConfiguration", () => ({ getCloudflareOriginConfiguration: getOriginConfiguration }));
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
    getOriginConfiguration.mockRejectedValue(new Error("no saved production config"));
  });

  it("distinguishes Staging resources, unverified baseline, and unattached domain route", async () => {
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response([{ queue_name: "smartspec-staging-abc-jobs" }]);
      if (url.pathname.endsWith("/hyperdrive/configs")) return response([{ name: "smartspec-staging-abc-database" }]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/cfd_tunnel")) return response([{ id: "191d047e-674a-48f4-b105-b37269c2dad6", name: "smartaihub-main", status: "healthy", credentials_file: "must-not-return" }]);
      if (url.pathname.endsWith("/containers/applications")) return response([]);
      if (url.pathname.endsWith("/connectivity/directory/services")) return response([{ service_id: "12345678-1234-4234-8234-123456789abc", name: "smartspec-production-postgres", type: "tcp", app_protocol: "postgresql", host: { resolver_network: { tunnel_id: "87654321-4321-4321-8321-cba987654321" } } }]);
      if (url.pathname.endsWith("/workers/routes")) return response([]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [{ id: "deployment-a", versions: [{ version_id: versionId, percentage: 100 }] }] });
      if (url.pathname.endsWith(`/versions/${versionId}`)) return response({ annotations: {}, resources: { bindings: [{ name: "CLOUDFLARE_ACTIVATION" }], script_runtime: { containers: [] } } });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });

    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({
      status: "CHECKED",
      accountRef,
      originConfiguration: { status: "NOT_CONFIGURED", applicationHttpConfigured: false, applicationHttpReadyForRequests: false },
      queues: [{ name: "smartspec-staging-abc-jobs", environment: "staging" }],
      hyperdrives: [{ name: "smartspec-staging-abc-database", environment: "staging" }],
      tunnels: [{ id: "191d047e-674a-48f4-b105-b37269c2dad6", name: "smartaihub-main", status: "healthy" }],
      vpcServices: [{ id: "12345678-1234-4234-8234-123456789abc", name: "smartspec-production-postgres", type: "tcp", appProtocol: "postgresql", tunnelId: "87654321-4321-4321-8321-cba987654321", environment: "production" }],
      domainRoute: { inventoryComplete: true, attached: false, conflicting: false },
      worker: { deploymentCount: 1, activeVersionCount: 1, versions: [{ bindingNames: ["CLOUDFLARE_ACTIVATION"], hasVerifiedReleaseIdentity: false }] },
    });
    expect(fetchImpl.mock.calls.every(([request, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
    const paths = fetchImpl.mock.calls.map(([request]) => new URL(String(request)).pathname);
    expect(paths.some(path => path.endsWith("/connectivity/directory/services"))).toBe(true);
    expect(paths.some(path => /dns_records|mtls_certificates|access\/apps|access\/service_tokens/.test(path))).toBe(false);
  });

  it("reports saved Production origin and ingress state without returning its configuration or secrets", async () => {
    resolveTarget.mockResolvedValue({ targetId: workerRef, tenantId: "tenant-a", projectId: "project-a", environment: "production",
      accountRef, workerRef, credentialRef: "cloudflare:production", runtimePolicy: "cf-origin:" + "c".repeat(64), enabled: true });
    getOriginConfiguration.mockResolvedValue({ status: "STORED", descriptor: {
      applicationHttp: { namespace: "smartspec-production", node: {}, python: {} },
      applicationHttpPhase: "namespace-only", jobTransport: "queues",
    } });
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues") || url.pathname.endsWith("/hyperdrive/configs") || url.pathname.endsWith("/workers/routes")) return response([]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/cfd_tunnel")) return response([]);
      if (url.pathname.endsWith("/containers/applications")) return response([]);
      if (url.pathname.endsWith("/connectivity/directory/services")) return response([]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ originConfiguration: { status: "STORED", applicationHttpConfigured: true,
      applicationHttpReadyForRequests: false, queueProfileConfigured: true } });
    expect(JSON.stringify(result)).not.toContain("smartspec-production");
  });

  it("does not claim a complete inventory when an endpoint is inaccessible or paginated", async () => {
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response([], 200, false);
      if (url.pathname.endsWith("/hyperdrive/configs")) return response([]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/workers/routes")) return response([]);
      if (url.pathname.endsWith("/cfd_tunnel")) return response([]);
      if (url.pathname.endsWith("/containers/applications")) return response([]);
      if (url.pathname.endsWith("/connectivity/directory/services")) return response([]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ status: "PARTIAL", queueInventoryComplete: false,
      accessChecks: { queues: { httpStatus: 200, complete: false } } });
  });

  it("reports denied reads separately from an empty Production inventory", async () => {
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response(null, 403);
      if (url.pathname.endsWith("/hyperdrive/configs")) return response([]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/workers/routes")) return response([]);
      if (url.pathname.endsWith("/cfd_tunnel")) return response([]);
      if (url.pathname.endsWith("/containers/applications")) return response(null, 403);
      if (url.pathname.endsWith("/connectivity/directory/services")) return response([], 403);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });

    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ status: "PARTIAL", queueInventoryComplete: false,
      accessChecks: { queues: { httpStatus: 403, complete: false }, hyperdrive: { httpStatus: 200, complete: true }, vpcServices: { httpStatus: 403, complete: false } },
      productionDatabaseProvisioning: { checks: { vpcServices: { httpStatus: 403, readable: false }, containers: { httpStatus: 403, readable: false } },
        permissionPacket: expect.arrayContaining([
          expect.objectContaining({ scope: "Account", permission: "Hyperdrive Edit" }),
          expect.objectContaining({ scope: "Account", permission: "Connectivity Directory Admin" }),
          expect.objectContaining({ scope: "Zone", permission: "SSL and Certificates Edit" }),
          expect.objectContaining({ scope: "Account", permission: "Containers Edit" }),
          expect.objectContaining({ scope: "Zone", permission: "Workers Routes Edit" }),
        ]) } });
    const permissionPacket = result.productionDatabaseProvisioning?.permissionPacket ?? [];
    expect(permissionPacket.some(item => item.permission === "Connectivity Directory Bind")).toBe(false);
    expect(permissionPacket.some(item => item.scope === "Zone" && item.permission === "DNS Read")).toBe(false);
    expect(permissionPacket.some(item => item.scope === "Account" && item.permission === "SSL and Certificates Read")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-token");
    expect(JSON.stringify(result)).not.toContain("credentials_file");
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
