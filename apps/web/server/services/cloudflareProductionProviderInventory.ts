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
    const [routes, queueDetails, hyperdriveDetails, zoneDns, mtlsCertificates, accessApps, serviceTokens] = await Promise.all([
      zone?.id ? get(token, `/zones/${encodeURIComponent(zone.id)}/workers/routes?per_page=100`, fetchImpl) : Promise.resolve(null),
      Array.isArray(queues.result) ? queues.result as Array<{ queue_name?: unknown }> : [],
      Array.isArray(hyperdrive.result) ? hyperdrive.result as Array<{ name?: unknown }> : [],
      zone?.id ? get(token, `/zones/${encodeURIComponent(zone.id)}/dns_records?name=db-prod.smartaihub.app&per_page=100`, fetchImpl) : Promise.resolve(null),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/mtls_certificates?per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/access/apps?per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/access/service_tokens?per_page=100`, fetchImpl),
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
      deployments.complete && Array.isArray(deploymentRows) && versionDetails.every(version => version.checked);
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
        productionDatabaseDns: { httpStatus: zoneDns?.status ?? null, complete: zoneDns?.complete ?? false },
        mtlsCertificates: { httpStatus: mtlsCertificates.status, complete: mtlsCertificates.complete },
        accessApplications: { httpStatus: accessApps.status, complete: accessApps.complete },
        accessServiceTokens: { httpStatus: serviceTokens.status, complete: serviceTokens.complete },
      },
      productionDatabaseProvisioning: {
        checks: {
          dns: { httpStatus: zoneDns?.status ?? null, readable: zoneDns?.complete ?? false },
          mtlsCertificates: { httpStatus: mtlsCertificates.status, readable: mtlsCertificates.complete },
          accessApplications: { httpStatus: accessApps.status, readable: accessApps.complete },
          serviceTokens: { httpStatus: serviceTokens.status, readable: serviceTokens.complete },
          hyperdrive: { httpStatus: hyperdrive.status, readable: hyperdrive.complete },
        },
        // These are the exact Cloudflare permission groups used by the
        // production-only database provisioning flow. Read checks above do
        // not claim that write access has been tested.
        requiredWritePermissions: [
          "Zone → DNS → Write",
          "Account → SSL and Certificates → Write",
          "Account → Access: Apps and Policies → Write",
          "Account → Access: Service Tokens → Write",
          "Account → Hyperdrive → Write",
        ],
      },
      originConfiguration,
      queueInventoryComplete: queues.complete,
      queues: queueNames.map(name => ({ name, environment: /(?:^|-)production(?:-|$)/i.test(name) ? "production" as const : /(?:^|-)staging(?:-|$)/i.test(name) ? "staging" as const : "other" as const })),
      hyperdriveInventoryComplete: hyperdrive.complete,
      hyperdrives: hyperdriveNames.map(name => ({ name, environment: /(?:^|-)production(?:-|$)/i.test(name) ? "production" as const : /(?:^|-)staging(?:-|$)/i.test(name) ? "staging" as const : "other" as const })),
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
