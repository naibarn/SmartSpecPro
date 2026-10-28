import {
  assertProductionRouteMatchesGrant,
  buildProductionCanaryWeights,
  buildProductionPromotionWeights,
  type CloudflareProductionBaseline,
  type CloudflareProductionRouteState,
  type CloudflareProductionVersion,
} from "./cloudflareProductionCanary";
import type { CloudflareProductionDeploymentGrant, CloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const VERSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

type Deployment = {
  id?: string;
  created_on?: string;
  versions?: Array<{ version_id?: string; percentage?: number }>;
  annotations?: Record<string, string>;
};
type Version = { id?: string; annotations?: Record<string, string>; resources?: { bindings?: unknown } };
type Envelope<T> = { success?: boolean; result?: T; errors?: Array<{ code?: number }> };

export class CloudflareProductionCanaryTransportError extends Error {
  constructor(readonly diagnosticCode: string, readonly status?: number) {
    super(diagnosticCode);
    this.name = "CloudflareProductionCanaryTransportError";
  }
}

function expectedMessage(version: Pick<CloudflareProductionVersion, "sourceSha" | "buildDigest" | "configurationDigest">) {
  return `SmartAIHub production ${version.sourceSha} ${version.buildDigest} origin ${version.configurationDigest}`;
}

function normalizeRoute(value: unknown, zoneId: string): CloudflareProductionRouteState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_RESPONSE_INVALID");
  }
  const route = value as { id?: unknown; pattern?: unknown; script?: unknown };
  if (typeof route.id !== "string" || typeof route.pattern !== "string" ||
      (route.script !== undefined && route.script !== null && typeof route.script !== "string")) {
    throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_RESPONSE_INVALID");
  }
  return { zoneId, routeId: route.id, pattern: route.pattern, script: route.script == null ? null : route.script };
}

export function createCloudflareProductionCanaryTransport(input: {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());

  async function api<T>(token: string, path: string, method: "GET" | "POST", body?: unknown,
    assertMutationAuthorized?: () => Promise<void>): Promise<T> {
    const url = new URL(`${API_ROOT}${path}`);
    if (url.origin !== new URL(API_ROOT).origin || !url.pathname.startsWith("/client/v4/") || url.username || url.password || url.hash) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_API_URL_DENIED");
    }
    if (method !== "GET") {
      if (!assertMutationAuthorized) throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_GRANT_REQUIRED");
      await assertMutationAuthorized();
    }
    const response = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new CloudflareProductionCanaryTransportError(`CLOUDFLARE_PRODUCTION_HTTP_${response.status}`, response.status);
    let envelope: Envelope<T>;
    try { envelope = await response.json() as Envelope<T>; }
    catch { throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_RESPONSE_INVALID"); }
    if (envelope.success !== true || envelope.result === undefined) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_API_ERROR");
    }
    return envelope.result;
  }

  async function exactRoute(token: string, grant: CloudflareProductionDeploymentGrant) {
    const routes = await api<Array<unknown>>(token,
      `/zones/${encodeURIComponent(grant.zoneId)}/workers/routes`, "GET");
    const matches = routes.map(route => normalizeRoute(route, grant.zoneId))
      .filter(route => route.pattern === grant.routePattern);
    if (matches.length > 1) throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_NOT_EXACT");
    const current = matches[0] ?? { zoneId: grant.zoneId, routeId: null, pattern: grant.routePattern, script: null };
    try {
      return assertProductionRouteMatchesGrant({ expectedZoneId: grant.zoneId,
        expectedScript: grant.targetId, expectedRouteId: grant.expectedRouteId,
        expectedRouteScript: grant.expectedRouteScript, current });
    } catch {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_STATE_MISMATCH");
    }
  }

  async function attachInitialProductionRoute(token: string, grant: CloudflareProductionDeploymentGrant,
    assertMutationAuthorized: () => Promise<void>) {
    // A first route starts serving the already-active, digest-verified 100% baseline.
    // The same exact, stage-specific production grant also authorizes the following
    // 1% version deployment; no broader hostname or route is ever created here.
    const created = await api<{ id?: unknown; pattern?: unknown; script?: unknown }>(token,
      `/zones/${encodeURIComponent(grant.zoneId)}/workers/routes`, "POST",
      { pattern: grant.routePattern, script: grant.targetId }, assertMutationAuthorized);
    const route = normalizeRoute(created, grant.zoneId);
    if (typeof created.id !== "string" || route.pattern !== grant.routePattern || route.script !== grant.targetId) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_CREATE_RECEIPT_INVALID");
    }
    const persisted = await exactRoute(token, { ...grant, expectedRouteId: route.routeId, expectedRouteScript: grant.targetId });
    if (persisted.routeId !== route.routeId || persisted.script !== grant.targetId) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_CREATE_READBACK_MISMATCH");
    }
  }

  function versionPath(target: CloudflareProductionDeploymentTarget, versionId: string) {
    if (!VERSION_ID.test(versionId)) throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_VERSION_ID_INVALID");
    return `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(versionId)}`;
  }

  async function checkedDeployment(token: string, target: CloudflareProductionDeploymentTarget, deploymentId: string) {
    if (!VERSION_ID.test(deploymentId)) throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_DEPLOYMENT_ID_INVALID");
    const deployment = await api<Deployment>(token,
      `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments/${encodeURIComponent(deploymentId)}`, "GET");
    if (deployment.id !== deploymentId || !Array.isArray(deployment.versions) ||
        deployment.versions.some(item => !item.version_id || !VERSION_ID.test(item.version_id) || typeof item.percentage !== "number")) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_DEPLOYMENT_RESPONSE_INVALID");
    }
    return deployment;
  }

  async function checkedVersion(token: string, target: CloudflareProductionDeploymentTarget,
    version: CloudflareProductionVersion, requireQueueBindings = true) {
    const details = await api<Version>(token, versionPath(target, version.versionId), "GET");
    if (details.id !== version.versionId || details.annotations?.["workers/message"] !== expectedMessage(version)) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_VERSION_DIGEST_MISMATCH");
    }
    const bindings = Array.isArray(details.resources?.bindings) ? details.resources.bindings as Array<Record<string, unknown>> : [];
    if (requireQueueBindings && (bindings.filter(binding => binding.name === "JOB_QUEUE" && binding.type === "queue" &&
      binding.queue_name === "smartspec-canonical-job-queue-production").length !== 1 ||
        bindings.filter(binding => binding.name === "CF_VERSION_METADATA" && binding.type === "version_metadata").length !== 1)) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_VERSION_REQUIRED_BINDINGS_MISMATCH");
    }
  }

  async function verifyProductionQueueConsumer(token: string, target: CloudflareProductionDeploymentTarget) {
    const queues = await api<Array<{ queue_id?: unknown; queue_name?: unknown }>>(token,
      `/accounts/${encodeURIComponent(target.accountRef)}/queues?per_page=100`, "GET");
    const matches = queues.filter(queue => queue.queue_name === "smartspec-canonical-job-queue-production");
    const queue = matches[0];
    if (matches.length !== 1) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_QUEUE_INVENTORY_MISMATCH");
    }
    if (typeof queue?.queue_id !== "string" || !/^[a-f0-9]{32}$/i.test(queue.queue_id)) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_QUEUE_ID_INVALID");
    }
    const consumers = await api<Array<{ consumer_id?: unknown; queue_name?: unknown; script_name?: unknown;
      dead_letter_queue?: unknown; type?: unknown }>>(token,
      `/accounts/${encodeURIComponent(target.accountRef)}/queues/${encodeURIComponent(queue.queue_id)}/consumers`, "GET");
    const consumer = consumers[0];
    if (consumers.length !== 1 || typeof consumer?.consumer_id !== "string" || !/^[a-f0-9]{32}$/i.test(consumer.consumer_id) ||
        consumer.queue_name !== queue.queue_name || consumer.type !== "worker") {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_QUEUE_CONSUMER_MISMATCH");
    }
    if (consumer.script_name !== target.workerRef) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_QUEUE_CONSUMER_WORKER_MISMATCH");
    }
    if (typeof consumer.dead_letter_queue !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(consumer.dead_letter_queue)) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_QUEUE_DLQ_MISSING_OR_INVALID");
    }
    return { queueId: queue.queue_id, consumerId: consumer.consumer_id, queueName: consumer.queue_name,
      scriptName: consumer.script_name, deadLetterQueueName: consumer.dead_letter_queue };
  }

  async function activeDeployments(token: string, target: CloudflareProductionDeploymentTarget) {
    const result = await api<{ deployments?: Deployment[] }>(token,
      `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments?page=1&per_page=100`, "GET");
    if (!Array.isArray(result.deployments)) throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_DEPLOYMENTS_RESPONSE_INVALID");
    // Cloudflare documents the first list item as the deployment actively serving traffic.
    // Historical records may span many pages; they are not needed for the exact active baseline.
    const active = result.deployments[0];
    if (!active || !VERSION_ID.test(active.id ?? "") || !Number.isFinite(Date.parse(active.created_on ?? ""))) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ACTIVE_DEPLOYMENT_IDENTITY_UNVERIFIED");
    }
    return [active];
  }

  async function createDeployment(token: string, target: CloudflareProductionDeploymentTarget,
    versions: Array<{ version_id: string; percentage: number }>, annotation: string,
    assertMutationAuthorized: () => Promise<void>) {
    const deployment = await api<Deployment>(token,
      `/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments`, "POST",
      { strategy: "percentage", versions, annotations: { "workers/message": annotation } }, assertMutationAuthorized);
    if (!deployment.id || !VERSION_ID.test(deployment.id)) throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_DEPLOYMENT_RECEIPT_INVALID");
    const persisted = await checkedDeployment(token, target, deployment.id);
    const actual = persisted.versions!.map(({ version_id, percentage }) => ({ version_id: version_id!, percentage: percentage! })).sort((a, b) => a.version_id.localeCompare(b.version_id));
    const expected = versions.map(({ version_id, percentage }) => ({ version_id, percentage })).sort((a, b) => a.version_id.localeCompare(b.version_id));
    if (JSON.stringify(actual) !== JSON.stringify(expected) || persisted.annotations?.["workers/message"] !== annotation) {
      throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_DEPLOYMENT_TRAFFIC_SCOPE_INVALID");
    }
    return { deploymentId: deployment.id, versions: actual };
  }

  return {
    /** Start only a 1% canary after the approved, exact route and 100% baseline are observed. */
    async canary(input: {
      token: string; target: CloudflareProductionDeploymentTarget; grant: CloudflareProductionDeploymentGrant;
      candidate: CloudflareProductionVersion; assertMutationAuthorized: () => Promise<void>;
    }) {
      const { token, target, grant, candidate } = input;
      if (grant.rolloutStage !== "canary" || target.targetId !== grant.targetId || target.workerRef !== grant.targetId ||
          target.environment !== "production" || target.accountRef !== grant.accountRef || grant.candidateVersionId !== null) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_GRANT_TARGET_DENIED");
      }
      const route = await exactRoute(token, grant);
      const current = await activeDeployments(token, target);
      const active = current[0];
      if (!active?.id || active.id !== grant.rollbackDeploymentId || active.versions?.length !== 1 ||
          active.versions[0]?.percentage !== 100 || !active.versions[0]?.version_id) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_BASELINE_NOT_ACTIVE");
      }
      const baseline: CloudflareProductionBaseline = { versionId: active.versions[0].version_id,
        sourceSha: grant.rollbackSourceSha, buildDigest: grant.rollbackBuildDigest,
        configurationDigest: grant.rollbackConfigurationDigest, deploymentId: grant.rollbackDeploymentId };
      // The accepted M2 rollback version predates Queue and version-metadata
      // bindings. Only the newly uploaded candidate must contain them.
      await checkedVersion(token, target, baseline, false);
      await checkedVersion(token, target, candidate);
      const queueConsumer = await verifyProductionQueueConsumer(token, target);
      if (!route.routeId) {
        if (grant.expectedRouteId !== null || grant.expectedRouteScript !== null) {
          throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_STATE_MISMATCH");
        }
        await attachInitialProductionRoute(token, grant, input.assertMutationAuthorized);
      } else if (route.script !== grant.targetId) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROUTE_NOT_ATTACHED");
      }
      const weights = buildProductionCanaryWeights({ baseline, expectedBaseline: {
        sourceSha: grant.rollbackSourceSha, buildDigest: grant.rollbackBuildDigest,
        configurationDigest: grant.rollbackConfigurationDigest }, candidate, expectedCandidate: {
        sourceSha: grant.sourceSha, buildDigest: grant.buildDigest, configurationDigest: grant.configurationDigest } });
      return { ...await createDeployment(token, target, [...weights], `SmartAIHub production canary grant ${grant.grantRef}`,
        input.assertMutationAuthorized), queueConsumer };
    },

    /** Promotion is a new grant/job and requires the exact current canary to have been observed. */
    async promote(input: {
      token: string; target: CloudflareProductionDeploymentTarget; grant: CloudflareProductionDeploymentGrant;
      candidate: CloudflareProductionVersion; canaryDeploymentId: string;
      assertMutationAuthorized: () => Promise<void>;
    }) {
      const { token, target, grant, candidate } = input;
      if (grant.rolloutStage !== "promote" || target.targetId !== grant.targetId || target.workerRef !== grant.targetId ||
          target.environment !== "production" || target.accountRef !== grant.accountRef ||
          input.canaryDeploymentId !== grant.canaryDeploymentId || !grant.canaryGrantRef ||
          grant.candidateVersionId !== candidate.versionId) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_GRANT_TARGET_DENIED");
      }
      await exactRoute(token, grant);
      const current = await activeDeployments(token, target);
      const active = current[0];
      if (!active?.id || active.id !== input.canaryDeploymentId ||
          active.annotations?.["workers/message"] !== `SmartAIHub production canary grant ${grant.canaryGrantRef}`) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_CANARY_NOT_ACTIVE");
      }
      const deployment = await checkedDeployment(token, target, input.canaryDeploymentId);
      const canaryVersion = deployment.versions?.find(version => version.version_id === candidate.versionId && version.percentage === 1);
      const baselineDeployment = await checkedDeployment(token, target, grant.rollbackDeploymentId);
      const baselineVersion = baselineDeployment.versions?.[0];
      const baselineCanaryVersion = deployment.versions?.find(version => version.version_id === baselineVersion?.version_id && version.percentage === 99);
      if (!canaryVersion || deployment.versions?.length !== 2 || !baselineVersion?.version_id ||
          baselineDeployment.versions?.length !== 1 || baselineVersion.percentage !== 100 || !baselineCanaryVersion ||
          !grant.canaryVerifiedAt) throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_CANARY_SCOPE_INVALID");
      await checkedVersion(token, target, { versionId: baselineVersion.version_id, sourceSha: grant.rollbackSourceSha,
        buildDigest: grant.rollbackBuildDigest, configurationDigest: grant.rollbackConfigurationDigest }, false);
      const evidence = { deploymentId: input.canaryDeploymentId, candidateVersionId: candidate.versionId,
        candidatePercent: 1, verifiedAt: grant.canaryVerifiedAt };
      const weights = buildProductionPromotionWeights({ candidate, canaryEvidence: evidence, now: now() });
      await checkedVersion(token, target, candidate);
      return createDeployment(token, target, [...weights], `SmartAIHub production promote grant ${grant.grantRef}`,
        input.assertMutationAuthorized);
    },

    /** Restore only the exact grant-bound known-good production baseline. */
    async rollback(input: {
      token: string; target: CloudflareProductionDeploymentTarget; grant: CloudflareProductionDeploymentGrant;
      assertMutationAuthorized: () => Promise<void>;
    }) {
      const { token, target, grant } = input;
      if (grant.rolloutStage !== "rollback" || grant.actions[0] !== "rollback" ||
          target.targetId !== grant.targetId || target.workerRef !== grant.targetId ||
          target.environment !== "production" || target.accountRef !== grant.accountRef || grant.candidateVersionId !== null) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_GRANT_TARGET_DENIED");
      }
      await exactRoute(token, grant);
      const current = await activeDeployments(token, target);
      if (!current[0]?.id || current[0].id === grant.rollbackDeploymentId) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROLLBACK_NOT_REQUIRED_OR_UNKNOWN");
      }
      const rollback = await checkedDeployment(token, target, grant.rollbackDeploymentId);
      const baselineVersion = rollback.versions?.[0];
      if (rollback.versions?.length !== 1 || baselineVersion?.percentage !== 100 || !baselineVersion.version_id) {
        throw new CloudflareProductionCanaryTransportError("CLOUDFLARE_PRODUCTION_ROLLBACK_BASELINE_INVALID");
      }
      const baseline: CloudflareProductionVersion = { versionId: baselineVersion.version_id,
        sourceSha: grant.rollbackSourceSha, buildDigest: grant.rollbackBuildDigest,
        configurationDigest: grant.rollbackConfigurationDigest };
      await checkedVersion(token, target, baseline, false);
      return createDeployment(token, target, [{ version_id: baseline.versionId, percentage: 100 }],
        `SmartAIHub production rollback grant ${grant.grantRef}`, input.assertMutationAuthorized);
    },
  };
}
