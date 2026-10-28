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
      if (url.pathname.endsWith("/mtls_certificates")) return response([]);
      if (url.pathname.endsWith("/workers/routes")) return response([]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [{ id: "33333333-3333-4333-8333-333333333333",
        created_on: "2026-10-20T00:00:00Z", versions: [{ version_id: versionId, percentage: 100 }] }] });
      if (url.pathname.endsWith(`/versions/${versionId}`)) return response({ annotations: { "workers/message": `SmartAIHub production ${"a".repeat(40)} ${"b".repeat(64)} origin ${"c".repeat(64)}` }, resources: { bindings: [{ name: "CLOUDFLARE_ACTIVATION" }, { name: "JOB_QUEUE" }, { name: "CF_VERSION_METADATA" }], script_runtime: { containers: [] } } });
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
      worker: { deploymentCount: 1, activeVersionCount: 1, versions: [{ bindingNames: ["CLOUDFLARE_ACTIVATION", "JOB_QUEUE", "CF_VERSION_METADATA"],
        hasProductionQueueBinding: false, hasVersionMetadataBinding: false, hasVerifiedReleaseIdentity: true,
        sourceSha: "a".repeat(40), buildDigest: "b".repeat(64), configurationDigest: "c".repeat(64) }] },
    });
    expect(fetchImpl.mock.calls.every(([request, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
    const paths = fetchImpl.mock.calls.map(([request]) => new URL(String(request)).pathname);
    expect(paths.some(path => path.endsWith("/connectivity/directory/services"))).toBe(true);
    expect(paths.some(path => /dns_records|access\/apps|access\/service_tokens/.test(path))).toBe(false);
    expect(paths.some(path => path.endsWith("/mtls_certificates"))).toBe(true);
  });

  it("exposes only safe Hyperdrive identity and binding fields for exact recovery reconciliation", async () => {
    const hyperdriveId = "db6b46010af44ad381dd6e3e2674913a";
    const vpcServiceId = "12345678-1234-4234-8234-123456789abc";
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues") || url.pathname.endsWith("/workers/routes") || url.pathname.endsWith("/cfd_tunnel") ||
          url.pathname.endsWith("/containers/applications") || url.pathname.endsWith("/mtls_certificates")) return response([]);
      if (url.pathname.endsWith("/hyperdrive/configs")) return response([{ id: hyperdriveId,
        name: "smartspec-production-database-aaaaaaaaaaaa", origin: { service_id: vpcServiceId, database: "smartspec",
          user: "sah_cf_prod_0123456789ab", scheme: "postgres" }, caching: { disabled: true }, origin_connection_limit: 5,
        mtls: { private_key: "must-not-return" } }]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/connectivity/directory/services")) return response([{ service_id: vpcServiceId,
        name: "smartspec-production-postgres-aaaaaaaaaaaa", type: "tcp", app_protocol: "postgresql" }]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ hyperdrives: [{ id: hyperdriveId, name: "smartspec-production-database-aaaaaaaaaaaa",
      vpcServiceId, database: "smartspec", databaseUser: "sah_cf_prod_0123456789ab", scheme: "postgres",
      cachingDisabled: true, connectionLimit: 5, environment: "production" }] });
    expect(JSON.stringify(result)).not.toContain("must-not-return");
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
      if (url.pathname.endsWith("/mtls_certificates")) return response([]);
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
      if (url.pathname.endsWith("/mtls_certificates")) return response([]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ status: "PARTIAL", queueInventoryComplete: false,
      accessChecks: { queues: { httpStatus: 200, complete: false } } });
  });

  it("follows the Cloudflare deployments pagination contract and validates the complete immutable baseline", async () => {
    const activeVersion = "81e64be8-af01-4efb-ad82-94e78da2510b";
    const activeDeployment = { id: "33333333-3333-4333-8333-333333333333", created_on: "2026-10-27T00:00:00Z",
      versions: [{ version_id: activeVersion, percentage: 100 }] };
    const oldDeployment = { id: "22222222-2222-4222-8222-222222222222", created_on: "2026-10-20T00:00:00Z",
      versions: [{ version_id: "44444444-4444-4444-8444-444444444444", percentage: 100 }] };
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/deployments")) {
        const page = Number(url.searchParams.get("page"));
        const deployments = page === 1 ? [activeDeployment] : [oldDeployment];
        return new Response(JSON.stringify({ success: true, result: { deployments }, result_info: { page, per_page: 100, total_pages: 2 } }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.pathname.endsWith("/queues") || url.pathname.endsWith("/hyperdrive/configs") || url.pathname.endsWith("/workers/routes") ||
          url.pathname.endsWith("/cfd_tunnel") || url.pathname.endsWith("/containers/applications") ||
          url.pathname.endsWith("/connectivity/directory/services") || url.pathname.endsWith("/mtls_certificates")) {
        return response(url.pathname === "/client/v4/zones" ? [{ id: "z".repeat(32), name: "smartaihub.app" }] : []);
      }
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith(`/versions/${activeVersion}`)) return response({ id: activeVersion,
        annotations: { "workers/message": `SmartAIHub production ${"a".repeat(40)} ${"b".repeat(64)} origin ${"c".repeat(64)}` },
        resources: { bindings: [] } });
      throw new Error(`Unexpected provider request: ${url.pathname}`);
    });

    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ status: "CHECKED", accessChecks: { workerDeployments: { httpStatus: 200, complete: true } },
      worker: { activeDeploymentId: activeDeployment.id, deploymentCount: 2, deploymentInventoryComplete: true,
        readbackReason: null, versions: [{ versionId: activeVersion, hasVerifiedReleaseIdentity: true }] } });
    const deploymentRequests = fetchImpl.mock.calls.map(([request]) => new URL(String(request)))
      .filter(url => url.pathname.endsWith("/deployments"));
    expect(deploymentRequests.map(url => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(deploymentRequests.every(url => url.searchParams.get("per_page") === "100")).toBe(true);
  });

  it("returns a precise permission diagnostic when deployment readback is denied", async () => {
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/deployments")) return response(null, 403);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/queues") || url.pathname.endsWith("/hyperdrive/configs") || url.pathname.endsWith("/workers/routes") ||
          url.pathname.endsWith("/cfd_tunnel") || url.pathname.endsWith("/containers/applications") ||
          url.pathname.endsWith("/connectivity/directory/services") || url.pathname.endsWith("/mtls_certificates")) return response([]);
      throw new Error(`Unexpected provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ worker: { readbackReason: "WORKER_DEPLOYMENT_PERMISSION_DENIED_HTTP_403" },
      accessChecks: { workerDeployments: { httpStatus: 403, complete: false,
        diagnosticCode: "WORKER_DEPLOYMENT_PERMISSION_DENIED_HTTP_403" } } });
  });

  it("reads all positively weighted versions and the actual production Queue consumer", async () => {
    const candidateVersion = "92f40f82-179d-4b94-8a2f-30c6fa0ce63a";
    const queueId = "d".repeat(32);
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response([{ id: queueId, queue_name: "smartspec-canonical-job-queue-production" }]);
      if (url.pathname.endsWith(`/queues/${queueId}/consumers`)) return response([{ consumer_id: "e".repeat(32),
        queue_name: "smartspec-canonical-job-queue-production", script_name: workerRef,
        dead_letter_queue: "smartspec-canonical-job-queue-production-dlq", type: "worker", settings: { max_retries: 8 } }]);
      if (url.pathname.endsWith("/hyperdrive/configs") || url.pathname.endsWith("/workers/routes") || url.pathname.endsWith("/cfd_tunnel") ||
          url.pathname.endsWith("/containers/applications") || url.pathname.endsWith("/connectivity/directory/services") || url.pathname.endsWith("/mtls_certificates")) return response([]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [
        { id: "22222222-2222-4222-8222-222222222222", created_on: "2026-10-19T00:00:00Z",
          versions: [{ version_id: "81e64be8-af01-4efb-ad82-94e78da2510c", percentage: 100 }] },
        { id: "33333333-3333-4333-8333-333333333333", created_on: "2026-10-20T00:00:00Z", versions: [
        { version_id: versionId, percentage: 99 }, { version_id: candidateVersion, percentage: 1 },
      ] }] });
      if (url.pathname.endsWith(`/versions/${versionId}`) || url.pathname.endsWith(`/versions/${candidateVersion}`)) {
        const sourceSha = url.pathname.endsWith(candidateVersion) ? "c".repeat(40) : "a".repeat(40);
        const digest = url.pathname.endsWith(candidateVersion) ? "d".repeat(64) : "b".repeat(64);
        return response({ annotations: { "workers/message": `SmartAIHub production ${sourceSha} ${digest} origin ${"c".repeat(64)}` },
          resources: { bindings: [{ name: "JOB_QUEUE", type: "queue", queue_name: "smartspec-canonical-job-queue-production" },
            { name: "CF_VERSION_METADATA", type: "version_metadata" }] } });
      }
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ status: "CHECKED", productionQueueConsumerInventory: { complete: true, queueId,
      consumers: [{ consumerId: "e".repeat(32), queueName: "smartspec-canonical-job-queue-production", scriptName: workerRef,
        deadLetterQueueName: "smartspec-canonical-job-queue-production-dlq", maxRetries: 8 }] },
      worker: { activeDeploymentId: "33333333-3333-4333-8333-333333333333", activeVersionCount: 2,
        versions: [{ versionId, percentage: 99, hasProductionQueueBinding: true, hasVersionMetadataBinding: true },
          { versionId: candidateVersion, percentage: 1, hasProductionQueueBinding: true, hasVersionMetadataBinding: true }] } });
    expect(fetchImpl.mock.calls.some(([request]) => new URL(String(request)).pathname.endsWith(`/queues/${queueId}/consumers`))).toBe(true);
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
      if (url.pathname.endsWith("/mtls_certificates")) return response(null, 403);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });

    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ status: "PARTIAL", queueInventoryComplete: false,
      accessChecks: { queues: { httpStatus: 403, complete: false }, hyperdrive: { httpStatus: 200, complete: true }, vpcServices: { httpStatus: 403, complete: false } },
      productionDatabaseProvisioning: { checks: { vpcServices: { httpStatus: 403, readable: false }, containers: { httpStatus: 403, readable: false }, mtlsCertificates: { httpStatus: 403, readable: false } },
        permissionPacket: expect.arrayContaining([
          expect.objectContaining({ scope: "Account", permission: "Hyperdrive Edit" }),
          expect.objectContaining({ scope: "Account", permission: "Connectivity Directory Admin" }),
          expect.objectContaining({ scope: "Account", permission: "Containers Edit" }),
          expect.objectContaining({ scope: "Zone", permission: "Workers Routes Edit" }),
        ]) } });
    const permissionPacket = result.productionDatabaseProvisioning?.permissionPacket ?? [];
    expect(permissionPacket.some(item => item.permission === "SSL and Certificates Read + Write")).toBe(false);
    expect(result.productionDatabaseProvisioning?.conditionalPermissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "Account", permission: "SSL and Certificates Read + Write" }),
      expect.objectContaining({ scope: "Zone", permission: "SSL and Certificates Edit" }),
    ]));
    expect(permissionPacket.some(item => item.permission === "Connectivity Directory Bind")).toBe(false);
    expect(permissionPacket.some(item => item.scope === "Zone" && item.permission === "DNS Read")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-token");
    expect(JSON.stringify(result)).not.toContain("credentials_file");
  });

  it("reports the exact Queue consumer read failure without treating it as an empty consumer list", async () => {
    const queueId = "d".repeat(32);
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response([{ id: queueId, queue_name: "smartspec-canonical-job-queue-production" }]);
      if (url.pathname.endsWith(`/queues/${queueId}/consumers`)) return response(null, 403);
      if (url.pathname.endsWith("/hyperdrive/configs") || url.pathname.endsWith("/workers/routes") || url.pathname.endsWith("/cfd_tunnel") ||
          url.pathname.endsWith("/containers/applications") || url.pathname.endsWith("/connectivity/directory/services") || url.pathname.endsWith("/mtls_certificates")) return response([]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ productionQueueConsumerInventory: { complete: false, reason: "PRODUCTION_QUEUE_CONSUMER_READ_HTTP_403", queueId, consumers: [] },
      accessChecks: { productionQueueConsumers: { httpStatus: 403, complete: false, diagnosticCode: "CLOUDFLARE_HTTP_403" } } });
  });

  it("distinguishes a readable Production Queue with no consumer from a denied consumer read", async () => {
    const queueId = "d".repeat(32);
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith("/queues")) return response([{ id: queueId, queue_name: "smartspec-canonical-job-queue-production" }]);
      if (url.pathname.endsWith(`/queues/${queueId}/consumers`)) return response([]);
      if (url.pathname.endsWith("/hyperdrive/configs") || url.pathname.endsWith("/workers/routes") || url.pathname.endsWith("/cfd_tunnel") ||
          url.pathname.endsWith("/containers/applications") || url.pathname.endsWith("/connectivity/directory/services") || url.pathname.endsWith("/mtls_certificates")) return response([]);
      if (url.pathname === "/client/v4/zones") return response([{ id: "z".repeat(32), name: "smartaihub.app" }]);
      if (url.pathname.endsWith("/deployments")) return response({ deployments: [] });
      throw new Error(`Unexpected read-only provider request: ${url.pathname}`);
    });
    const result = await probeCloudflareProductionProviderInventory({ db: {} as DrizzleDB, tenantId: "tenant-a", projectId: "project-a", fetchImpl });
    expect(result.productionQueueConsumerInventory).toMatchObject({ complete: true, reason: "PRODUCTION_QUEUE_CONSUMER_MISSING", consumers: [] });
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
