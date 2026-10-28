import type { DrizzleDB } from "../db";
import { resolveCloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";
import { getCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const VERSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

type Envelope = { success?: boolean; result?: unknown; result_info?: { total_pages?: number; page?: number } };
type SafeResponse = { status: number; result: unknown; complete: boolean; diagnosticCode?: string; totalPages?: number; page?: number };

async function get(token: string, path: string, fetchImpl: typeof fetch): Promise<SafeResponse> {
  const url = new URL(`${API_ROOT}${path}`);
  if (url.origin !== new URL(API_ROOT).origin || !url.pathname.startsWith("/client/v4/") || url.username || url.password || url.hash) {
    return { status: 0, result: null, complete: false, diagnosticCode: "CLOUDFLARE_API_URL_DENIED" };
  }
  try {
    const response = await fetchImpl(url, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status, result: null, complete: false,
      diagnosticCode: `CLOUDFLARE_HTTP_${response.status}` }; }
    let envelope: Envelope;
    try { envelope = await response.json() as Envelope; }
    catch { return { status: response.status, result: null, complete: false, diagnosticCode: "CLOUDFLARE_RESPONSE_JSON_INVALID" }; }
    if (envelope?.success !== true || envelope.result === undefined) {
      return { status: response.status, result: null, complete: false, diagnosticCode: "CLOUDFLARE_API_RESPONSE_UNSUCCESSFUL" };
    }
    const totalPages = envelope.result_info?.total_pages;
    const page = envelope.result_info?.page;
    return { status: response.status, result: envelope.result,
      complete: (totalPages ?? 1) <= 1,
      ...(typeof totalPages === "number" ? { totalPages } : {}),
      ...(typeof page === "number" ? { page } : {}) };
  } catch {
    return { status: 0, result: null, complete: false, diagnosticCode: "CLOUDFLARE_TRANSPORT_UNAVAILABLE" };
  }
}

const DEPLOYMENTS_PER_PAGE = 100;
const MAX_DEPLOYMENT_PAGES = 50;
const DEPLOYMENT_PAGE_CONCURRENCY = 5;

/** Read every bounded page: Cloudflare's list endpoint defaults to 20 rows and exposes total_pages. */
async function getAllWorkerDeployments(token: string, path: string, fetchImpl: typeof fetch): Promise<SafeResponse> {
  const first = await get(token, `${path}?page=1&per_page=${DEPLOYMENTS_PER_PAGE}`, fetchImpl);
  if (first.diagnosticCode) return first;
  const firstResult = first.result && typeof first.result === "object" && !Array.isArray(first.result)
    ? first.result as { deployments?: unknown } : null;
  if (!firstResult || !Array.isArray(firstResult.deployments)) {
    return { status: first.status, result: first.result, complete: false, diagnosticCode: "WORKER_DEPLOYMENT_RESPONSE_SCHEMA_INVALID" };
  }
  const rows = [...firstResult.deployments];
  if (first.totalPages === undefined) {
    return rows.length < DEPLOYMENTS_PER_PAGE
      ? { status: first.status, result: { deployments: rows }, complete: true }
      : { status: first.status, result: { deployments: rows }, complete: false, diagnosticCode: "WORKER_DEPLOYMENT_PAGINATION_METADATA_MISSING" };
  }
  if (!Number.isSafeInteger(first.totalPages) || first.totalPages < 1 || first.totalPages > MAX_DEPLOYMENT_PAGES) {
    return { status: first.status, result: { deployments: rows }, complete: false, diagnosticCode: "WORKER_DEPLOYMENT_PAGINATION_LIMIT_EXCEEDED" };
  }
  if (first.page !== undefined && first.page !== 1) {
    return { status: first.status, result: { deployments: rows }, complete: false, diagnosticCode: "WORKER_DEPLOYMENT_PAGINATION_PAGE_MISMATCH" };
  }
  if (first.totalPages > 1) {
    for (let startPage = 2; startPage <= first.totalPages; startPage += DEPLOYMENT_PAGE_CONCURRENCY) {
      const endPage = Math.min(first.totalPages, startPage + DEPLOYMENT_PAGE_CONCURRENCY - 1);
      const pages = await Promise.all(Array.from({ length: endPage - startPage + 1 }, (_, index) => {
        const page = startPage + index;
        return get(token, `${path}?page=${page}&per_page=${DEPLOYMENTS_PER_PAGE}`, fetchImpl)
          .then(response => ({ page, response }));
      }));
      for (const item of pages) {
        if (item.response.diagnosticCode) return { status: item.response.status, result: { deployments: rows }, complete: false,
          diagnosticCode: item.response.diagnosticCode };
        const result = item.response.result && typeof item.response.result === "object" && !Array.isArray(item.response.result)
          ? item.response.result as { deployments?: unknown } : null;
        if (!result || !Array.isArray(result.deployments)) return { status: item.response.status, result: { deployments: rows },
          complete: false, diagnosticCode: "WORKER_DEPLOYMENT_RESPONSE_SCHEMA_INVALID" };
        if (item.response.totalPages !== undefined && item.response.totalPages !== first.totalPages ||
            item.response.page !== undefined && item.response.page !== item.page) {
          return { status: item.response.status, result: { deployments: rows }, complete: false,
            diagnosticCode: "WORKER_DEPLOYMENT_PAGINATION_PAGE_MISMATCH" };
        }
        rows.push(...result.deployments);
      }
    }
  }
  return { status: first.status, result: { deployments: rows }, complete: true };
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
    ingressModeConfigured: boolean; applicationHttpConfigured: boolean; applicationHttpReadyForRequests: boolean; queueProfileConfigured: boolean } = {
    status: "NOT_CONFIGURED", ingressModeConfigured: false, applicationHttpConfigured: false, applicationHttpReadyForRequests: false, queueProfileConfigured: false,
  };
  if (target.runtimePolicy) {
    try {
      const config = await getCloudflareOriginConfiguration(input.db, {
        identity: { tenantId: target.tenantId, projectId: target.projectId, environment: "production", provider: "cloudflare" },
        configurationRef: target.runtimePolicy,
      });
      originConfiguration = {
        status: config.status,
        ingressModeConfigured: config.descriptor.ingressMode === "production-origin-bridge-v1",
        applicationHttpConfigured: Boolean(config.descriptor.applicationHttp),
        applicationHttpReadyForRequests: Boolean(config.descriptor.applicationHttp && !config.descriptor.applicationHttpPhase),
        queueProfileConfigured: config.descriptor.jobTransport === "queues",
      };
    } catch {
      originConfiguration = { status: "INVALID", ingressModeConfigured: false, applicationHttpConfigured: false, applicationHttpReadyForRequests: false, queueProfileConfigured: false };
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
      getAllWorkerDeployments(token, `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments`, fetchImpl),
    ]);
    const zoneRows = Array.isArray(zones.result) ? zones.result as Array<{ id?: unknown; name?: unknown }> : [];
    const zone = zoneRows.find(row => row.name === "smartaihub.app" && typeof row.id === "string");
    const zoneId = typeof zone?.id === "string" ? zone.id : undefined;
    const queueRows = Array.isArray(queues.result) ? queues.result as Array<{ id?: unknown; queue_name?: unknown }> : [];
    const productionQueue = queueRows.find(row => row.queue_name === "smartspec-canonical-job-queue-production");
    const [routes, productionQueueConsumers, hyperdriveDetails, tunnels, containers, vpcServices, mtlsCertificates] = await Promise.all([
      zoneId ? get(token, `/zones/${encodeURIComponent(zoneId)}/workers/routes?per_page=100`, fetchImpl) : Promise.resolve(null),
      typeof productionQueue?.id === "string" && /^[a-f0-9]{32}$/i.test(productionQueue.id)
        ? get(token, `/accounts/${encodeURIComponent(target.accountRef)}/queues/${encodeURIComponent(productionQueue.id)}/consumers`, fetchImpl)
        : Promise.resolve(queues.complete ? { status: 200, result: [], complete: true } : null),
      Array.isArray(hyperdrive.result) ? hyperdrive.result as Array<{
        id?: unknown; name?: unknown; origin?: { service_id?: unknown; database?: unknown; user?: unknown; scheme?: unknown };
        caching?: { disabled?: unknown }; origin_connection_limit?: unknown;
      }> : [],
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/cfd_tunnel?is_deleted=false&per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/containers/applications?per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/connectivity/directory/services?per_page=100`, fetchImpl),
      get(token, `/accounts/${encodeURIComponent(target.accountRef)}/mtls_certificates?per_page=100`, fetchImpl),
    ]);
    const routeRows = Array.isArray(routes?.result) ? routes.result as Array<{ id?: unknown; pattern?: unknown; script?: unknown }> : [];
    const matchingRoutes = routeRows.filter(row => row.pattern === "smartaihub.app/*");
    const deploymentRows = deployments.result && typeof deployments.result === "object" && !Array.isArray(deployments.result)
      ? (deployments.result as { deployments?: unknown }).deployments : null;
    const records = Array.isArray(deploymentRows) ? deploymentRows as Array<{ id?: unknown; created_on?: unknown; versions?: unknown }> : [];
    const datedRecords = records.flatMap(record => {
      const createdAt = typeof record.created_on === "string" ? Date.parse(record.created_on) : Number.NaN;
      return typeof record.id === "string" && VERSION_ID.test(record.id) && Number.isFinite(createdAt)
        ? [{ record, createdAt }] : [];
    }).sort((left, right) => right.createdAt - left.createdAt);
    const newestTime = datedRecords[0]?.createdAt;
    const newestRecords = datedRecords.filter(record => record.createdAt === newestTime);
    const activeDeploymentIsUnambiguous = records.length > 0 && datedRecords.length === records.length && newestRecords.length === 1;
    const first = activeDeploymentIsUnambiguous ? newestRecords[0]?.record : undefined;
    const versions = Array.isArray(first?.versions) ? first.versions as Array<{ version_id?: unknown; percentage?: unknown }> : [];
    const validWeights = versions.length > 0 && versions.length <= 2 && versions.every(version =>
      typeof version.version_id === "string" && VERSION_ID.test(version.version_id) &&
      typeof version.percentage === "number" && Number.isFinite(version.percentage) &&
      version.percentage >= 0 && version.percentage <= 100
    ) && Math.abs(versions.reduce((sum, version) => sum + Number(version.percentage), 0) - 100) < 0.001;
    const active = validWeights ? versions.filter(version => Number(version.percentage) > 0) : [];
    const versionDetails = await Promise.all(active.map(async version => {
      const detail = await get(token, `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(version.version_id as string)}`, fetchImpl);
      const value = detail.result && typeof detail.result === "object" && !Array.isArray(detail.result) ? detail.result as Record<string, any> : {};
      const bindings = Array.isArray(value.resources?.bindings) ? value.resources.bindings : [];
      const containers = Array.isArray(value.resources?.script_runtime?.containers) ? value.resources.script_runtime.containers : [];
      const message = value.annotations?.["workers/message"];
      const releaseIdentity = typeof message === "string"
        ? /^SmartAIHub production ([a-f0-9]{40}) ([a-f0-9]{64}) origin ([a-f0-9]{64})$/.exec(message)
        : null;
      return { versionId: version.version_id as string, deploymentId: String(first?.id ?? ""), percentage: version.percentage as number,
        bindingNames: bindings.map((binding: any) => binding?.name).filter((name: unknown): name is string => typeof name === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(name)),
        hasProductionQueueBinding: bindings.filter((binding: any) => binding?.name === "JOB_QUEUE" && binding?.type === "queue" &&
          binding?.queue_name === "smartspec-canonical-job-queue-production").length === 1,
        hasVersionMetadataBinding: bindings.filter((binding: any) => binding?.name === "CF_VERSION_METADATA" &&
          binding?.type === "version_metadata").length === 1,
        containerNames: containers.map((container: any) => container?.name).filter((name: unknown): name is string => typeof name === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(name)),
        hasVerifiedReleaseIdentity: releaseIdentity !== null,
        ...(releaseIdentity ? { sourceSha: releaseIdentity[1], buildDigest: releaseIdentity[2], configurationDigest: releaseIdentity[3] } : {}),
        checked: detail.complete, httpStatus: detail.status,
        ...(!detail.complete ? { readbackReason: detail.diagnosticCode ?? (detail.status === 403 ? "WORKER_VERSION_PERMISSION_DENIED_HTTP_403" :
          detail.status === 401 ? "WORKER_VERSION_PERMISSION_DENIED_HTTP_401" : `WORKER_VERSION_READ_HTTP_${detail.status || "UNAVAILABLE"}`) } :
          releaseIdentity === null ? { readbackReason: "WORKER_VERSION_RELEASE_IDENTITY_MISSING" } : {}) };
    }));
    const workerDeploymentReadbackReason = !deployments.complete
      ? deployments.status === 403 ? "WORKER_DEPLOYMENT_PERMISSION_DENIED_HTTP_403"
        : deployments.status === 401 ? "WORKER_DEPLOYMENT_PERMISSION_DENIED_HTTP_401"
          : deployments.diagnosticCode?.startsWith("WORKER_DEPLOYMENT_") ? deployments.diagnosticCode
            : deployments.status === 200 && deployments.diagnosticCode === "CLOUDFLARE_RESPONSE_JSON_INVALID" ? "WORKER_DEPLOYMENT_RESPONSE_JSON_INVALID"
              : deployments.status === 200 && deployments.diagnosticCode === "CLOUDFLARE_API_RESPONSE_UNSUCCESSFUL" ? "WORKER_DEPLOYMENT_API_RESPONSE_UNSUCCESSFUL"
                : deployments.status === 200 && !deployments.diagnosticCode ? "WORKER_DEPLOYMENT_PAGINATION_INCOMPLETE"
              : deployments.diagnosticCode ?? `WORKER_DEPLOYMENT_READ_HTTP_${deployments.status || "UNAVAILABLE"}`
      : !deploymentRows || !Array.isArray(deploymentRows) ? "WORKER_DEPLOYMENT_RESPONSE_SCHEMA_INVALID"
        : records.length === 0 ? "WORKER_DEPLOYMENT_NOT_FOUND"
          : datedRecords.length !== records.length ? "WORKER_DEPLOYMENT_IDENTITY_INVALID"
            : newestRecords.length !== 1 ? "WORKER_ACTIVE_DEPLOYMENT_AMBIGUOUS"
              : !validWeights ? "WORKER_ACTIVE_VERSION_WEIGHTS_INVALID"
                : versionDetails.some(version => !version.checked) ? versionDetails.find(version => !version.checked)?.readbackReason ?? "WORKER_VERSION_READBACK_INCOMPLETE"
                  : versionDetails.some(version => !version.hasVerifiedReleaseIdentity) ? "WORKER_VERSION_RELEASE_IDENTITY_MISSING"
                    : null;
    const queueNames = queueRows.map(row => row.queue_name).filter((name: unknown): name is string => typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/.test(name));
    const consumerRows = Array.isArray(productionQueueConsumers?.result)
      ? productionQueueConsumers.result as Array<{ consumer_id?: unknown; queue_name?: unknown; script_name?: unknown; dead_letter_queue?: unknown; type?: unknown; settings?: { max_retries?: unknown } }>
      : [];
    const validQueueConsumerRows = consumerRows.filter(row => typeof row.consumer_id === "string" && /^[a-f0-9]{32}$/i.test(row.consumer_id) &&
      row.queue_name === "smartspec-canonical-job-queue-production" && typeof row.script_name === "string" &&
      /^[a-z0-9-]{1,63}$/.test(row.script_name) && typeof row.dead_letter_queue === "string" &&
      /^[a-z0-9-]{0,63}$/.test(row.dead_letter_queue) && row.type === "worker");
    const productionQueueConsumerReason = !queues.complete
      ? queues.status ? `PRODUCTION_QUEUE_INVENTORY_HTTP_${queues.status}` : "PRODUCTION_QUEUE_INVENTORY_UNAVAILABLE"
      : !productionQueue ? "PRODUCTION_QUEUE_NOT_FOUND"
        : typeof productionQueue.id !== "string" || !/^[a-f0-9]{32}$/i.test(productionQueue.id)
          ? "PRODUCTION_QUEUE_ID_INVALID"
          : !productionQueueConsumers?.complete
            ? productionQueueConsumers?.status ? `PRODUCTION_QUEUE_CONSUMER_READ_HTTP_${productionQueueConsumers.status}`
              : "PRODUCTION_QUEUE_CONSUMER_READ_UNAVAILABLE"
            : consumerRows.length === 0 ? "PRODUCTION_QUEUE_CONSUMER_MISSING"
              : consumerRows.length !== 1 ? "PRODUCTION_QUEUE_CONSUMER_COUNT_MISMATCH"
                : validQueueConsumerRows.length !== 1 ? "PRODUCTION_QUEUE_CONSUMER_RESPONSE_INVALID"
                  : validQueueConsumerRows[0]?.script_name !== target.workerRef ? "PRODUCTION_QUEUE_CONSUMER_WORKER_MISMATCH"
                    : validQueueConsumerRows[0]?.dead_letter_queue !== "smartspec-canonical-job-queue-production-dlq"
                      ? "PRODUCTION_QUEUE_DEAD_LETTER_QUEUE_MISMATCH" : null;
    const inventoryComplete = queues.complete && hyperdrive.complete && zones.complete && Boolean(routes?.complete) &&
      deployments.complete && Array.isArray(deploymentRows) && activeDeploymentIsUnambiguous && validWeights && versionDetails.every(version => version.checked) &&
      Boolean(productionQueueConsumers?.complete) &&
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
        workerDeployments: { httpStatus: deployments.status, complete: deployments.complete && Array.isArray(deploymentRows),
          ...(workerDeploymentReadbackReason ? { diagnosticCode: workerDeploymentReadbackReason } : {}) },
        workerVersions: versionDetails.map(version => ({ httpStatus: version.checked ? 200 : null, complete: version.checked })),
        productionQueueConsumers: { httpStatus: productionQueueConsumers?.status ?? null, complete: Boolean(productionQueueConsumers?.complete),
          ...(productionQueueConsumers?.diagnosticCode ? { diagnosticCode: productionQueueConsumers.diagnosticCode } : {}) },
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
          { scope: "Account", permission: "Containers Read", operations: ["GET /accounts/{account_id}/containers/applications"] },
          { scope: "Account", permission: "Containers Edit", operations: ["POST/PATCH /accounts/{account_id}/containers/applications for selected Node/Python production apps"] },
          { scope: "Zone", permission: "Zone Read", operations: ["GET /zones?name=smartaihub.app"] },
          { scope: "Zone", permission: "Workers Routes Read", operations: ["GET /zones/{zone_id}/workers/routes"] },
          { scope: "Zone", permission: "Workers Routes Edit", operations: ["POST /zones/{zone_id}/workers/routes for the exact smartaihub.app/* route during the authorized canary", "DELETE /zones/{zone_id}/workers/routes/{exact_receipt_route_id} for authorized ingress rollback"] },
        ],
        conditionalPermissions: [
          { scope: "Account", permission: "SSL and Certificates Read + Write", condition: "only if migrating the existing direct-origin Staging Hyperdrive trust before rotating the shared PostgreSQL leaf certificate; Production VPC TLS is configured on the VPC Service and must not use Hyperdrive mtls settings" },
          { scope: "Zone", permission: "SSL and Certificates Edit", condition: "only if the already-issued Cloudflare Origin CA certificate for db.smartaihub.app is missing or must be renewed; do not issue another certificate when the existing key-matched certificate is valid" },
          { scope: "Account", permission: "Queues Edit", condition: "only if a fresh complete inventory proves the already-provisioned Production Queue or DLQ is absent" },
          { scope: "Account", permission: "Workers R2 Storage Read/Edit", condition: "only if production provisions or changes an R2 bucket; existing object access uses the separately configured R2 S3 credentials" },
          { scope: "Account", permission: "Cloudflare Tunnel Edit", condition: "only if the selected existing Tunnel must be changed through the Cloudflare-managed API; VPC service provisioning alone does not edit Tunnel configuration" },
        ],
      },
      originConfiguration,
      queueInventoryComplete: queues.complete,
      queues: queueNames.map(name => ({ name, environment: /(?:^|-)production(?:-|$)/i.test(name) ? "production" as const : /(?:^|-)staging(?:-|$)/i.test(name) ? "staging" as const : "other" as const })),
      productionQueueConsumerInventory: {
        complete: Boolean(productionQueueConsumers?.complete),
        reason: productionQueueConsumerReason,
        queueId: typeof productionQueue?.id === "string" && /^[a-f0-9]{32}$/i.test(productionQueue.id) ? productionQueue.id : null,
        consumers: validQueueConsumerRows.map(row => ({ consumerId: row.consumer_id as string, queueName: row.queue_name as string,
          scriptName: row.script_name as string, deadLetterQueueName: row.dead_letter_queue as string,
          ...(typeof row.settings?.max_retries === "number" ? { maxRetries: row.settings.max_retries } : {}) })),
      },
      hyperdriveInventoryComplete: hyperdrive.complete,
      hyperdrives: hyperdriveDetails.flatMap(row => typeof row.name === "string" && /^[a-z0-9][a-z0-9-]{0,127}$/.test(row.name)
        ? [{ ...(typeof row.id === "string" && /^[a-f0-9]{32}$/i.test(row.id) ? { id: row.id } : {}), name: row.name,
            ...(typeof row.origin?.service_id === "string" && /^[a-f0-9-]{36}$/i.test(row.origin.service_id) ? { vpcServiceId: row.origin.service_id } : {}),
            ...(typeof row.origin?.database === "string" && /^[a-zA-Z0-9_]{1,63}$/.test(row.origin.database) ? { database: row.origin.database } : {}),
            ...(typeof row.origin?.user === "string" && /^sah_cf_prod_[a-f0-9]{12}$/.test(row.origin.user) ? { databaseUser: row.origin.user } : {}),
            ...(row.origin?.scheme === "postgres" ? { scheme: "postgres" as const } : {}),
            ...(row.caching?.disabled === true ? { cachingDisabled: true as const } : {}),
            ...(typeof row.origin_connection_limit === "number" ? { connectionLimit: row.origin_connection_limit } : {}),
            environment: /(?:^|-)production(?:-|$)/i.test(row.name) ? "production" as const : /(?:^|-)staging(?:-|$)/i.test(row.name) ? "staging" as const : "other" as const }]
        : []),
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
        routeId: matchingRoutes.length === 1 && typeof matchingRoutes[0].id === "string" ? matchingRoutes[0].id : null,
        script: matchingRoutes.length === 1 && typeof matchingRoutes[0].script === "string" ? matchingRoutes[0].script : null,
        zoneId: zoneId ?? null,
        conflicting: matchingRoutes.length > 1 || (matchingRoutes.length === 1 && matchingRoutes[0].script !== target.targetId) },
      worker: { activeDeploymentId: activeDeploymentIsUnambiguous && typeof first?.id === "string" ? first.id : null,
        deploymentInventoryComplete: deployments.complete && Array.isArray(deploymentRows) && activeDeploymentIsUnambiguous, deploymentCount: records.length,
        activeVersionCount: active.length, versions: versionDetails, readbackReason: workerDeploymentReadbackReason },
    };
  });
  if (fetched.status !== "CONFIGURED" || !fetched.value) {
    return { status: fetched.status === "NOT_CONFIGURED" ? "CREDENTIAL_NOT_CONFIGURED" as const : "CREDENTIAL_UNAVAILABLE" as const,
      checkedAt: new Date().toISOString() };
  }
  return fetched.value;
}
