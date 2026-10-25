import type { DrizzleDB } from "../db";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import { getCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const VERSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

type Envelope = { success?: boolean; result?: unknown; result_info?: { total_pages?: number } };
type SafeResponse = { status: number; result: unknown; complete: boolean };

async function get(token: string, path: string, fetchImpl: typeof fetch): Promise<SafeResponse> {
  const url = new URL(`${API_ROOT}${path}`);
  if (url.origin !== new URL(API_ROOT).origin || !url.pathname.startsWith("/client/v4/") || url.username || url.password || url.hash) {
    return { status: 0, result: null, complete: false };
  }
  try {
    const response = await fetchImpl(url, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status, result: null, complete: false }; }
    const envelope = await response.json() as Envelope;
    return { status: response.status, result: envelope?.success === true ? envelope.result ?? null : null,
      complete: envelope?.success === true && (envelope.result_info?.total_pages ?? 1) <= 1 };
  } catch {
    return { status: 0, result: null, complete: false };
  }
}

/** Read-only inventory that distinguishes Staging resources from a Production rollback candidate. */
export async function probeCloudflareProductionProviderInventory(input: {
  db: DrizzleDB;
  tenantId: string;
  projectId: string;
  fetchImpl?: typeof fetch;
}) {
  const target = await resolveCloudflareProductionDeploymentTarget(input);
  if (!target) return { status: "TARGET_NOT_CONFIGURED" as const, checkedAt: new Date().toISOString() };
  let originConfiguration: { status: "NOT_CONFIGURED" | "STORED" | "EXPIRED" | "REVOKED" | "INVALID";
    applicationHttpConfigured: boolean; applicationHttpReadyForRequests: boolean; queueProfileConfigured: boolean } = {
    status: "NOT_CONFIGURED", applicationHttpConfigured: false, applicationHttpReadyForRequests: false, queueProfileConfigured: false,
  };
  if (target.runtimePolicy) {
    try {
      const config = await getCloudflareOriginConfiguration(input.db, {
        identity: { tenantId: target.tenantId, projectId: target.projectId, environment: "production", provider: "cloudflare" },
        configurationRef: target.runtimePolicy,
      });
      originConfiguration = {
        status: config.status,
        applicationHttpConfigured: Boolean(config.descriptor.applicationHttp),
        applicationHttpReadyForRequests: Boolean(config.descriptor.applicationHttp && !config.descriptor.applicationHttpPhase),
        queueProfileConfigured: config.descriptor.jobTransport === "queues",
      };
    } catch {
      originConfiguration = { status: "INVALID", applicationHttpConfigured: false, applicationHttpReadyForRequests: false, queueProfileConfigured: false };
    }
  }
  const fetched = await withCloudflareDeploymentCredential(input.db, {
    identity: { tenantId: target.tenantId, projectId: target.projectId, environment: "production", provider: "cloudflare" },
    credentialRef: target.credentialRef,
  }, async token => {
    const fetchImpl = input.fetchImpl ?? fetch;
    const [queues, hyperdrive, zones, deployments] = await Promise.all([
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/queues?per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/hyperdrive/configs?per_page=100`, fetchImpl),
      get(token, "/zones?name=smartaihub.app&per_page=50", fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments`, fetchImpl),
    ]);
    const zoneRows = Array.isArray(zones.result) ? zones.result as Array<{ id?: unknown; name?: unknown }> : [];
    const zone = zoneRows.find(row => row.name === "smartaihub.app" && typeof row.id === "string");
    const zoneId = typeof zone?.id === "string" ? zone.id : undefined;
    const [routes, queueDetails, hyperdriveDetails, tunnels, containers, vpcServices, mtlsCertificates] = await Promise.all([
      zoneId ? get(token, `/zones/${encodeURIComponent(zoneId)}/workers/routes?per_page=100`, fetchImpl) : Promise.resolve(null),
      Array.isArray(queues.result) ? queues.result as Array<{ queue_name?: unknown }> : [],
      Array.isArray(hyperdrive.result) ? hyperdrive.result as Array<{ name?: unknown }> : [],
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/cfd_tunnel?is_deleted=false&per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/containers/applications?per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/connectivity/directory/services?per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/mtls_certificates?per_page=100`, fetchImpl),
    ]);
    const routeRows = Array.isArray(routes?.result) ? routes.result as Array<{ id?: unknown; pattern?: unknown; script?: unknown }> : [];
    const matchingRoutes = routeRows.filter(row => row.pattern === "smartaihub.app/*");
    const deploymentRows = deployments.result && typeof deployments.result === "object" && !Array.isArray(deployments.result)
      ? (deployments.result as { deployments?: unknown }).deployments : null;
    const records = Array.isArray(deploymentRows) ? deploymentRows as Array<{ id?: unknown; versions?: unknown }> : [];
    const first = records[0];
    const versions = Array.isArray(first?.versions) ? first.versions as Array<{ version_id?: unknown; percentage?: unknown }> : [];
    const active = versions.filter(version => typeof version.version_id === "string" && VERSION_ID.test(version.version_id) && version.percentage === 100);
    const versionDetails = await Promise.all(active.slice(0, 2).map(async version => {
      const detail = await get(token, `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(version.version_id as string)}`, fetchImpl);
      const value = detail.result && typeof detail.result === "object" && !Array.isArray(detail.result) ? detail.result as Record<string, any> : {};
      const bindings = Array.isArray(value.resources?.bindings) ? value.resources.bindings : [];
      const containers = Array.isArray(value.resources?.script_runtime?.containers) ? value.resources.script_runtime.containers : [];
      const message = value.annotations?.["workers/message"];
      return { versionId: version.version_id as string, percentage: version.percentage as number,
        bindingNames: bindings.map((binding: any) => binding?.name).filter((name: unknown): name is string => typeof name === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(name)),
        containerNames: containers.map((container: any) => container?.name).filter((name: unknown): name is string => typeof name === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(name)),
        hasVerifiedReleaseIdentity: typeof message === "string" && /^SmartAIHub production [a-f0-9]{40} [a-f0-9]{64} origin [a-f0-9]{64}$/.test(message),
        checked: detail.complete };
    }));
    const queueNames = queueDetails.map(row => row.queue_name).filter((name: unknown): name is string => typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/.test(name));
    const hyperdriveNames = hyperdriveDetails.map(row => row.name).filter((name: unknown): name is string => typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,127}$/.test(name));
    const inventoryComplete = queues.complete && hyperdrive.complete && zones.complete && Boolean(routes?.complete) &&
      deployments.complete && Array.isArray(deploymentRows) && versionDetails.every(version => version.checked) &&
      vpcServices.complete && tunnels.complete && containers.complete;
    const vpcServiceRows = Array.isArray(vpcServices.result) ? vpcServices.result as Array<{
      service_id?: unknown; name?: unknown; type?: unknown; app_protocol?: unknown; host?: { resolver_network?: { tunnel_id?: unknown } };
    }> : [];
    const tunnelRows = Array.isArray(tunnels.result) ? tunnels.result as Array<{ id?: unknown; name?: unknown; status?: unknown }> : [];
    return {
      status: inventoryComplete ? "CHECKED" as const : "PARTIAL" as const,
      checkedAt: new Date().toISOString(),
      accountRef: target.accountRef,
      // Keep read failures distinct from an empty inventory. These are safe,
      // provider-free diagnostics; a 200 still proves read access only.
      accessChecks: {
        queues: { httpStatus: queues.status, complete: queues.complete },
        hyperdrive: { httpStatus: hyperdrive.status, complete: hyperdrive.complete },
        zone: { httpStatus: zones.status, complete: zones.complete },
        routes: { httpStatus: routes?.status ?? null, complete: routes?.complete ?? false },
        workerDeployments: { httpStatus: deployments.status, complete: deployments.complete && Array.isArray(deploymentRows) },
        workerVersions: versionDetails.map(version => ({ httpStatus: version.checked ? 200 : null, complete: version.checked })),
        vpcServices: { httpStatus: vpcServices.status, complete: vpcServices.complete },
        tunnels: { httpStatus: tunnels.status, complete: tunnels.complete },
        containers: { httpStatus: containers.status, complete: containers.complete },
        mtlsCertificates: { httpStatus: mtlsCertificates.status, complete: mtlsCertificates.complete },
      },
      productionDatabaseProvisioning: {
        checks: {
          hyperdrive: { httpStatus: hyperdrive.status, readable: hyperdrive.complete },
          tunnel: { httpStatus: tunnels.status, readable: tunnels.complete },
          vpcServices: { httpStatus: vpcServices.status, readable: vpcServices.complete },
          containers: { httpStatus: containers.status, readable: containers.complete },
          mtlsCertificates: { httpStatus: mtlsCertificates.status, readable: mtlsCertificates.complete },
        },
        // One consolidated packet from the concrete production APIs used by
        // inventory, DB provisioning, Worker version publishing and cutover.
        // Read probes prove only read access; edit scopes are required only for
        // a resource the corresponding step must create or change.
        permissionPacket: [
          { scope: "Account", permission: "Workers Scripts Read", operations: ["GET /accounts/{account_id}/workers/scripts/{script_name}/deployments", "GET /accounts/{account_id}/workers/scripts/{script_name}/versions/{version_id}"] },
          { scope: "Account", permission: "Workers Scripts Edit", operations: ["upload immutable Worker version", "create bounded version deployment / rollback"] },
          { scope: "Account", permission: "Queues Read", operations: ["GET /accounts/{account_id}/queues"] },
          { scope: "Account", permission: "Hyperdrive Read", operations: ["GET /accounts/{account_id}/hyperdrive/configs", "GET /accounts/{account_id}/hyperdrive/configs/{hyperdrive_id}"] },
          { scope: "Account", permission: "Hyperdrive Edit", operations: ["POST /accounts/{account_id}/hyperdrive/configs for the dedicated Production origin"] },
          { scope: "Account", permission: "Connectivity Directory Read", operations: ["GET /accounts/{account_id}/connectivity/directory/services"] },
          { scope: "Account", permission: "Connectivity Directory Admin", operations: ["POST /accounts/{account_id}/connectivity/directory/services for one PostgreSQL TCP service bound to the existing Tunnel"] },
          { scope: "Account", permission: "Cloudflare Tunnel Read", operations: ["GET /accounts/{account_id}/cfd_tunnel?is_deleted=false to select and verify the existing database Tunnel"] },
          { scope: "Zone", permission: "SSL and Certificates Edit", operations: ["POST /certificates to issue a Cloudflare Origin CA server certificate for db.smartaihub.app; Workers VPC trusts Cloudflare Origin CA, while the current private PostgreSQL CA is not trusted"] },
          { scope: "Account", permission: "SSL and Certificates Read + Write", operations: ["GET /accounts/{account_id}/mtls_certificates to inspect the Staging Hyperdrive trust anchor", "POST /accounts/{account_id}/mtls_certificates to register the Cloudflare Origin CA root before rotating PostgreSQL's leaf certificate"] },
          { scope: "Account", permission: "Containers Read", operations: ["GET /accounts/{account_id}/containers/applications"] },
          { scope: "Account", permission: "Containers Edit", operations: ["POST/PATCH /accounts/{account_id}/containers/applications for selected Node/Python production apps"] },
          { scope: "Zone", permission: "Zone Read", operations: ["GET /zones?name=smartaihub.app"] },
          { scope: "Zone", permission: "Workers Routes Read", operations: ["GET /zones/{zone_id}/workers/routes"] },
          { scope: "Zone", permission: "Workers Routes Edit", operations: ["POST /zones/{zone_id}/workers/routes for the exact smartaihub.app/* route during the authorized canary"] },
        ],
        conditionalPermissions: [
          { scope: "Account", permission: "Queues Edit", condition: "only if a fresh complete inventory proves the already-provisioned Production Queue or DLQ is absent" },
          { scope: "Account", permission: "Workers R2 Storage Read/Edit", condition: "only if production provisions or changes an R2 bucket; existing object access uses the separately configured R2 S3 credentials" },
          { scope: "Account", permission: "Cloudflare Tunnel Edit", condition: "only if the selected existing Tunnel must be changed through the Cloudflare-managed API; VPC service provisioning alone does not edit Tunnel configuration" },
        ],
      },
      originConfiguration,
      queueInventoryComplete: queues.complete,
      queues: queueNames.map(name => ({ name, environment: /(?:^|-)production(?:-|$)/i.test(name) ? "production" as const : /(?:^|-)staging(?:-|$)/i.test(name) ? "staging" as const : "other" as const })),
      hyperdriveInventoryComplete: hyperdrive.complete,
      hyperdrives: hyperdriveNames.map(name => ({ name, environment: /(?:^|-)production(?:-|$)/i.test(name) ? "production" as const : /(?:^|-)staging(?:-|$)/i.test(name) ? "staging" as const : "other" as const })),
      tunnelInventoryComplete: tunnels.complete,
      tunnels: tunnelRows.flatMap(row => typeof row.id === "string" && /^[a-f0-9-]{36}$/i.test(row.id) &&
        typeof row.name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,99}$/.test(row.name)
        ? [{ id: row.id, name: row.name, ...(typeof row.status === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(row.status) ? { status: row.status } : {}) }] : []),
      vpcServiceInventoryComplete: vpcServices.complete,
      vpcServices: vpcServiceRows.flatMap(row => typeof row.service_id === "string" && /^[a-f0-9-]{36}$/i.test(row.service_id) &&
        typeof row.name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(row.name) && (row.type === "tcp" || row.type === "http")
        ? [{ id: row.service_id, name: row.name, type: row.type, ...(row.app_protocol === "postgresql" || row.app_protocol === "mysql" ? { appProtocol: row.app_protocol } : {}),
            ...(typeof row.host?.resolver_network?.tunnel_id === "string" && /^[a-f0-9-]{36}$/i.test(row.host.resolver_network.tunnel_id) ? { tunnelId: row.host.resolver_network.tunnel_id } : {}),
            environment: /(?:^|-)production(?:-|$)/i.test(row.name) ? "production" as const : /(?:^|-)staging(?:-|$)/i.test(row.name) ? "staging" as const : "other" as const }] : []),
      domainRoute: { inventoryComplete: Boolean(routes?.complete), attached: matchingRoutes.length === 1 && matchingRoutes[0].script === target.targetId,
        conflicting: matchingRoutes.length > 1 || (matchingRoutes.length === 1 && matchingRoutes[0].script !== target.targetId) },
      worker: { deploymentInventoryComplete: deployments.complete && Array.isArray(deploymentRows), deploymentCount: records.length,
        activeVersionCount: active.length, versions: versionDetails },
    };
  });
  if (fetched.status !== "CONFIGURED" || !fetched.value) {
    return { status: fetched.status === "NOT_CONFIGURED" ? "CREDENTIAL_NOT_CONFIGURED" as const : "CREDENTIAL_UNAVAILABLE" as const,
      checkedAt: new Date().toISOString() };
  }
  return fetched.value;
}
