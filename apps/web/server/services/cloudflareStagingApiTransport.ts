import { AsyncLocalStorage } from "node:async_hooks";
import { httpApplicationWorkerMetadata } from "./cloudflareHttpApplicationBindings";
import { assertHttpApplicationVersionMetadata } from "./cloudflareHttpApplicationProvision";
import { createHash } from "node:crypto";
import { validateCloudflareOriginVersionBindings, cloudflareWorkflowVersionBindings, assertCloudflareWorkflowVersionBindings, type CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import { assertNativeWorkerBindings, nativeWorkerBindings, type CloudflareNativeBindingDescriptor } from "./cloudflareNativeBindingDescriptor";
import { CLOUDFLARE_PRODUCTION_QUEUE_NAME } from "./cloudflareProductionQueueProvision";
import { cloudflareStagingAssetContentType } from "./cloudflareStagingAssetMetadata";
import type {
  CloudflareStagingApi,
  CloudflareStagingArtifact,
  CloudflareStagingTarget,
} from "./cloudflareStagingDeploymentExecutor";

const API_ROOT = "https://api.cloudflare.com/client/v4";

/** Production Queue is provisioned by its own canonical job. Bind the exact
 * immutable queue name when preparing a Production version; never infer or
 * reuse the Staging queue descriptor. */
function productionQueueBinding(target: CloudflareStagingTarget) {
  return target.environment === "production"
    ? [{ name: "JOB_QUEUE", type: "queue", queue_name: CLOUDFLARE_PRODUCTION_QUEUE_NAME }]
    : [];
}

function assertProductionQueueBinding(actual: unknown, target: CloudflareStagingTarget) {
  if (target.environment !== "production") return;
  const expected = productionQueueBinding(target)[0]!;
  if (!Array.isArray(actual) || actual.filter((binding: any) => binding?.type === "queue").length !== 1 ||
      actual.filter((binding: any) => binding?.name === expected.name).length !== 1 ||
      !actual.some((binding: any) => binding?.name === expected.name && binding?.type === expected.type && binding?.queue_name === expected.queue_name)) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_PRODUCTION_QUEUE_BINDING_MISMATCH");
  }
}

function assertProductionWorkerBindings(actual: unknown, target: CloudflareStagingTarget) {
  assertProductionQueueBinding(actual, target);
  if (target.environment !== "production") return;
  const bindings = Array.isArray(actual) ? actual : [];
  if (bindings.filter((binding: any) => binding?.name === "CF_VERSION_METADATA" && binding?.type === "version_metadata").length !== 1) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_PRODUCTION_VERSION_METADATA_BINDING_MISMATCH");
  }
}
const TARGET_ID = "smartspec-cloudflare-staging";
const SOURCE_SHA = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_WORKERS_DEV_HOST = /^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i;

export type CloudflareStagingBundle = Readonly<{
  sourceSha: string;
  buildDigest: string;
  mainModule: string;
  compatibilityDate: string;
  moduleFiles: Readonly<Record<string, Readonly<{ contentType: string; bytes: Uint8Array }>>>;
  assets: Readonly<Record<string, Readonly<{ contentType: string; bytes: Uint8Array }>>>;
}>;

export type CloudflareStagingBundleResolver = (
  artifactRef: string,
  expectedSourceSha?: string,
) => Promise<CloudflareStagingBundle | null>;

type CloudflareStagingFailureClass = "permanent" | "retryable";

type Envelope<T> = { success?: boolean; result?: T; errors?: Array<{ code?: number }> };
type Deployment = {
  id?: string;
  versions?: Array<{ version_id?: string; percentage?: number }>;
  annotations?: Record<string, string>;
};
type VerifiedDeployment = Deployment & {
  id: string;
  versions: Array<{ version_id: string; percentage?: number }>;
};
type Version = {
  id?: string;
  metadata?: { main_module?: string };
  annotations?: Record<string, string>;
  resources?: { bindings?: unknown; script_runtime?: { containers?: unknown } };
};

export class CloudflareStagingTransportError extends Error {
  readonly class: CloudflareStagingFailureClass;
  readonly diagnosticCode: string;
  constructor(
    diagnosticCode: string,
    readonly status?: number,
    readonly apiCode?: number,
    failureClass: CloudflareStagingFailureClass = "permanent",
  ) {
    super(diagnosticCode);
    this.name = "CloudflareStagingTransportError";
    this.diagnosticCode = diagnosticCode;
    this.class = failureClass;
  }
}

function isRetryableCloudflareStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableFetchFailure(error: unknown) {
  return error instanceof TypeError ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
}

function assertTarget(target: CloudflareStagingTarget) {
  if (target.targetId !== TARGET_ID || target.workerRef !== TARGET_ID || target.environment !== "staging") {
    throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_TARGET_DENIED");
  }
  if (!/^[a-f0-9]{32}$/i.test(target.accountRef)) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ACCOUNT_REF_INVALID");
  }
}

function assertVersionTarget(target: CloudflareStagingTarget) {
  const expected = target.environment === "production" ? "smartspec-cloudflare-runtime" : TARGET_ID;
  if ((target.environment !== "staging" && target.environment !== "production") ||
      target.targetId !== expected || target.workerRef !== expected) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_TARGET_DENIED");
  }
  if (!/^[a-f0-9]{32}$/i.test(target.accountRef)) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ACCOUNT_REF_INVALID");
  }
}

function assertSafeApiUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.origin !== "https://api.cloudflare.com" || !parsed.pathname.startsWith("/client/v4/") ||
      parsed.username || parsed.password || parsed.hash) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_API_URL_DENIED");
  }
}

function safeWorkersDevUrl(workerRef: string, subdomain: string) {
  const host = `${workerRef}.${subdomain}.workers.dev`.toLowerCase();
  if (!SAFE_WORKERS_DEV_HOST.test(host)) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_SUBDOMAIN_INVALID");
  }
  return `https://${host}`;
}

function canonicalBundleDigest(bundle: CloudflareStagingBundle): string {
  const entries: Array<[string, Uint8Array]> = [];
  for (const [name, file] of Object.entries(bundle.moduleFiles)) entries.push([`modules/${name}`, file.bytes]);
  for (const [name, file] of Object.entries(bundle.assets)) entries.push([`public/${name}`, file.bytes]);
  entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const manifest = entries.map(([name, bytes]) => {
    const digest = createHash("sha256").update(bytes).digest("hex");
    return `${name}\0${digest}\0${bytes.byteLength}`;
  }).join("\n");
  return createHash("sha256").update(manifest).digest("hex");
}

function safeAssetPath(value: string) {
  return value.length > 0 && value.length <= 512 && !value.startsWith("/") &&
    !value.includes("\\") && value.split("/").every(part => part && part !== "." && part !== "..");
}

function cloudflareAssetHash(bytes: Uint8Array, contentType: string) {
  // Cloudflare caches asset metadata by hash. Include MIME type so a repaired
  // upload cannot reuse an older object with application/octet-stream metadata.
  return createHash("md5").update("smartaihub-http-metadata-v1\0").update(contentType).update("\0").update(bytes).digest("hex");
}

function base64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

// Worker modules use a different MIME contract from browser assets. In
// particular, Wrangler's generated README must be a text module, not Markdown.
function moduleContentType(name: string, supplied: string): string {
  if (/\.m?js$/i.test(name)) return "application/javascript+module";
  if (/\.(?:md|txt)$/i.test(name)) return "text/plain";
  if (/\.map$/i.test(name)) return "application/source-map";
  const allowed = new Set([
    "application/javascript+module", "text/javascript+module", "application/javascript", "text/javascript",
    "text/x-python", "text/x-python-requirement", "application/wasm", "text/plain",
    "application/octet-stream", "application/source-map",
  ]);
  if (!allowed.has(supplied)) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_MODULE_CONTENT_TYPE_INVALID");
  return supplied;
}

export function createCloudflareStagingApiTransport(input: {
  resolveBundle: CloudflareStagingBundleResolver;
  fetchImpl?: typeof fetch;
  verifyNativeResources?: (descriptor: CloudflareNativeBindingDescriptor, target: CloudflareStagingTarget) => Promise<void>;
  prepareHttpApplications?: (origin: CloudflareOriginVersionBindings, target: CloudflareStagingTarget, assertAuthorized: () => Promise<void>) => Promise<void>;
  ensureHttpApplications?: (origin: CloudflareOriginVersionBindings, target: CloudflareStagingTarget, version: Version,
    operationKey: string, assertAuthorized: () => Promise<void>) => Promise<unknown>;
}): CloudflareStagingApi & Readonly<{
  prepareVersion: (input: {
    token: string;
    target: CloudflareStagingTarget;
    artifact: CloudflareStagingArtifact;
    originConfiguration: CloudflareOriginVersionBindings;
    assertMutationAuthorized: () => Promise<void>;
  }) => Promise<{ versionId: string; sourceSha: string; buildDigest: string; configurationDigest: string; trafficShifted: false }>;
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const mutationAuthority = new AsyncLocalStorage<() => Promise<void>>();

  async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
    assertSafeApiUrl(url);
    if (init.method && init.method !== "GET" && init.method !== "HEAD") await mutationAuthority.getStore()?.();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      if (isRetryableFetchFailure(error)) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_API_TRANSPORT_UNAVAILABLE", undefined, undefined, "retryable");
      }
      throw error;
    }
    if (!response.ok) {
      let code: number | undefined;
      try { const body = await response.json() as Envelope<unknown>; code = body.errors?.[0]?.code; } catch { /* Retain bounded HTTP diagnostic. */ }
      throw new CloudflareStagingTransportError(
        `CLOUDFLARE_HTTP_${response.status}${Number.isSafeInteger(code) ? `_API_${code}` : ""}`,
        response.status,
        code,
        isRetryableCloudflareStatus(response.status) ? "retryable" : "permanent",
      );
    }
    let envelope: Envelope<T>;
    try { envelope = await response.json() as Envelope<T>; }
    catch (error) {
      if (isRetryableFetchFailure(error)) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_API_RESPONSE_UNAVAILABLE", undefined, undefined, "retryable");
      }
      throw new CloudflareStagingTransportError("CLOUDFLARE_RESPONSE_INVALID");
    }
    if (envelope.success === false || !envelope.result) {
      const code = envelope.errors?.[0]?.code;
      throw new CloudflareStagingTransportError(Number.isSafeInteger(code)
        ? `CLOUDFLARE_API_ERROR_${code}`
        : "CLOUDFLARE_API_ERROR");
    }
    return envelope.result;
  }

  async function getWorkersDevSubdomain(token: string, target: CloudflareStagingTarget) {
    const result = await api<{ subdomain?: string }>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/subdomain`);
    if (!result.subdomain || !/^[a-z0-9-]{1,63}$/i.test(result.subdomain)) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_SUBDOMAIN_UNAVAILABLE");
    }
    return result.subdomain;
  }

  async function uploadAssets(token: string, target: CloudflareStagingTarget, bundle: CloudflareStagingBundle) {
    const manifest: Record<string, { hash: string; size: number }> = {};
    const assetsByHash = new Map<string, { name: string; bytes: Uint8Array; contentType: string }>();
    for (const [name, file] of Object.entries(bundle.assets)) {
      if (!safeAssetPath(name) || file.bytes.byteLength > 25 * 1024 * 1024) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ASSET_INVALID");
      }
      if (["_headers", "_redirects", ".assetsignore"].includes(name)) continue;
      const contentType = cloudflareStagingAssetContentType(name, file.contentType);
      const hash = cloudflareAssetHash(file.bytes, contentType);
      manifest[`/${name}`] = { hash, size: file.bytes.byteLength };
      assetsByHash.set(hash, { name, bytes: file.bytes, contentType });
    }
    if (Object.keys(manifest).length === 0) return undefined;

    const session = await api<{ buckets?: string[][]; jwt?: string }>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/assets-upload-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest }),
      });
    if (!session.jwt || !Array.isArray(session.buckets)) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_ASSET_SESSION_INVALID");
    }
    if (session.buckets.length === 0) return session.jwt;

    let completionJwt: string | undefined;
    for (const bucket of session.buckets) {
      const payload: Record<string, { base64: string; contentType: string }> = {};
      for (const hash of bucket) {
        const asset = assetsByHash.get(hash);
        if (!asset) throw new CloudflareStagingTransportError("CLOUDFLARE_ASSET_BUCKET_INVALID");
        payload[hash] = { base64: base64(asset.bytes), contentType: asset.contentType };
      }
      const form = new FormData();
      for (const [hash, file] of Object.entries(payload)) {
        form.set(hash, new Blob([file.base64], { type: file.contentType }), hash);
      }
      const result = await api<{ jwt?: string }>(session.jwt,
        `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/assets/upload?base64=true`, {
          method: "POST",
          body: form,
        });
      completionJwt = result.jwt ?? completionJwt;
    }
    if (!completionJwt) throw new CloudflareStagingTransportError("CLOUDFLARE_ASSET_COMPLETION_MISSING");
    return completionJwt;
  }

  async function loadVerifiedBundle(artifact: CloudflareStagingArtifact) {
    if (!SOURCE_SHA.test(artifact.sourceSha) || !SHA256.test(artifact.buildDigest) || artifact.immutable !== true) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ARTIFACT_INVALID");
    }
    const bundle = await input.resolveBundle(artifact.artifactRef, artifact.sourceSha);
    if (!bundle || bundle.sourceSha.toLowerCase() !== artifact.sourceSha.toLowerCase() ||
        bundle.buildDigest.toLowerCase() !== artifact.buildDigest.toLowerCase() ||
        canonicalBundleDigest(bundle) !== artifact.buildDigest.toLowerCase() ||
        !Object.hasOwn(bundle.moduleFiles, bundle.mainModule) ||
        Object.keys(bundle.assets).length === 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(bundle.compatibilityDate)) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ARTIFACT_MISMATCH");
    }
    for (const [name, file] of Object.entries(bundle.moduleFiles)) {
      if (!safeAssetPath(name)) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_MODULE_INVALID");
      moduleContentType(name, file.contentType);
    }
    return bundle;
  }

  function versionMessage(sourceSha: string, buildDigest: string, configurationDigest?: string, environment: "staging" | "production" = "staging") {
    if (configurationDigest !== undefined && !SHA256.test(configurationDigest)) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ORIGIN_DIGEST_INVALID");
    }
    return `SmartAIHub ${environment} ${sourceSha} ${buildDigest}${configurationDigest ? ` origin ${configurationDigest}` : ""}`;
  }

  async function uploadVersion(token: string, target: CloudflareStagingTarget, bundle: CloudflareStagingBundle, artifact: CloudflareStagingArtifact,
    bootstrapKey?: string, origin?: CloudflareOriginVersionBindings, workerDeployment = false) {
    const completionJwt = await uploadAssets(token, target, bundle);
    const http = origin?.descriptor.applicationHttp ? httpApplicationWorkerMetadata(origin.descriptor.applicationHttp, origin.descriptor, origin.descriptor.applicationHttpPhase === "namespace-only") : undefined;
    const metadata = {
      main_module: bundle.mainModule,
      compatibility_date: bundle.compatibilityDate,
      compatibility_flags: ["nodejs_compat"],
      // Container cold starts are performed inside the still-open Worker
      // request. Workers Paid defaults CPU to 30s, which can terminate the
      // readiness bridge before the separately bounded container deadline.
      ...(http && !origin?.descriptor.applicationHttpPhase ? { limits: { cpu_ms: 300_000 } } : {}),
      ...(http ? { exports: http.exports, containers: http.containers } : {}),
      ...(origin?.descriptor.applicationHttp?.startupDiagnostics === "container-logs" && !origin.descriptor.applicationHttpPhase ? {
        observability: { enabled: true, head_sampling_rate: 1, logs: { enabled: true, invocation_logs: false, head_sampling_rate: 1 } },
      } : {}),
      bindings: [
        { name: "ASSETS", type: "assets" },
        { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: workerDeployment ? "disabled" : (origin?.descriptor.workflowExecution || origin?.descriptor.retentionSchedule) ? "enabled" : "disabled" },
        { name: "CLOUDFLARE_ENVIRONMENT", type: "plain_text", text: target.environment },
        ...(!origin?.descriptor.workflowExecution && !origin?.descriptor.retentionSchedule
          ? [{ name: "CLOUDFLARE_JOB_TRANSPORT", type: "plain_text", text: "queues" }]
          : []),
        ...(origin?.descriptor.nativeResources ? nativeWorkerBindings(origin.descriptor.nativeResources) : []),
        ...(workerDeployment ? productionQueueBinding(target) : !origin?.descriptor.ingressMode ? productionQueueBinding(target) : []),
        ...(workerDeployment && target.environment === "production" ? [{ name: "CF_VERSION_METADATA", type: "version_metadata" }] : []),
        ...(workerDeployment && target.environment === "production" && origin?.descriptor.workflowExecution && origin.descriptor.jobTransport === "queues"
          ? [{ name: "CLOUDFLARE_QUEUE_ACCEPTANCE_MODE", type: "plain_text", text: "m3-synthetic-v1" }]
          : []),
        ...(http && !origin?.descriptor.applicationHttpPhase ? http.bindings : []),
        ...(origin ? cloudflareWorkflowVersionBindings(origin) : []),
        ...(origin ? [
          { name: "AUTH_ORIGIN", type: "plain_text", text: origin.descriptor.origin },
          { name: "AUTH_ORIGIN_PRIVATE_HOST", type: "plain_text", text: new URL(origin.descriptor.origin).host },
          { name: "AUTH_ORIGIN_TOKEN", type: "secret_text", text: origin.secrets.token },
          { name: "AUTH_ORIGIN_ACCESS_CLIENT_ID", type: "secret_text", text: origin.secrets.clientId },
          { name: "AUTH_ORIGIN_ACCESS_CLIENT_SECRET", type: "secret_text", text: origin.secrets.secret },
        ] : []),
      ],
      assets: completionJwt ? {
        jwt: completionJwt,
        config: {
          ...(bundle.assets["_headers"] ? { _headers: new TextDecoder().decode(bundle.assets["_headers"].bytes) } : {}),
          ...(bundle.assets["_redirects"] ? { _redirects: new TextDecoder().decode(bundle.assets["_redirects"].bytes) } : {}),
          not_found_handling: "single-page-application",
          run_worker_first: origin?.descriptor.ingressMode ? true : [
            "/api", "/api/*", "/v1", "/v1/*", "/trpc", "/trpc/*", "/auth", "/auth/*",
            "/oauth", "/oauth/*", "/uploads", "/uploads/*", "/internal", "/internal/*",
            "/.well-known/*", "/healthz", "/readyz", "/metrics", "/socket.io*", "/ws*", "/widget/v1/ws",
            "/_ops/application-canary/*",
          ],
        },
      } : undefined,
      annotations: {
        ...(bootstrapKey ? { "workers/tag": bootstrapTag(bootstrapKey) } : {}),
        "workers/message": versionMessage(artifact.sourceSha, artifact.buildDigest, origin?.configurationDigest, target.environment as "staging" | "production"),
      },
    };
    const form = new FormData();
    form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
    for (const [name, file] of Object.entries(bundle.moduleFiles)) {
      const bytes = new ArrayBuffer(file.bytes.byteLength);
      new Uint8Array(bytes).set(file.bytes);
      form.set(name, new Blob([bytes], { type: moduleContentType(name, file.contentType) }), name);
    }
    const result = await api<{ id?: string }>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}${bootstrapKey ? "" : "/versions"}`, {
        method: bootstrapKey ? "PUT" : "POST",
        body: form,
      });
    // Initial PUT activates the first version; its actual deployment is read back below.
    if (bootstrapKey) return "";
    if (!result.id || !VERSION_ID.test(result.id)) throw new CloudflareStagingTransportError("CLOUDFLARE_VERSION_RECEIPT_INVALID");
    return result.id;
  }

  async function getDeployment(token: string, target: CloudflareStagingTarget, deploymentId: string): Promise<VerifiedDeployment> {
    if (!VERSION_ID.test(deploymentId)) throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ID_INVALID");
    const result = await api<Deployment>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments/${encodeURIComponent(deploymentId)}`);
    if (result.id !== deploymentId || !Array.isArray(result.versions) || result.versions.length === 0 ||
        result.versions.some(version => !version.version_id || !VERSION_ID.test(version.version_id))) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_RECEIPT_INVALID");
    }
    return result as VerifiedDeployment;
  }

  async function createDeployment(token: string, target: CloudflareStagingTarget, versions: Array<{ version_id: string; percentage: number }>, idempotencyKey: string) {
    const result = await api<Deployment>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: "percentage",
          versions,
          annotations: { "workers/message": `SmartAIHub staging idempotency ${idempotencyKey}` },
        }),
      });
    if (!result.id || !VERSION_ID.test(result.id)) throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_RECEIPT_INVALID");
    return result.id;
  }

  async function findDeploymentByIdempotencyKey(token: string, target: CloudflareStagingTarget, idempotencyKey: string) {
    const result = await api<{ deployments?: Deployment[] }>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments`);
    const expected = `SmartAIHub staging idempotency ${idempotencyKey}`;
    return (result.deployments ?? []).find(deployment => deployment.annotations?.["workers/message"] === expected &&
      typeof deployment.id === "string" && VERSION_ID.test(deployment.id)) ?? null;
  }

  async function verifyVersion(token: string, target: CloudflareStagingTarget, deploymentId: string, sourceSha: string, buildDigest: string, configurationDigest?: string) {
    const deployment = await getDeployment(token, target, deploymentId);
    const primary = deployment.versions[0];
    if (deployment.versions.length !== 1 || primary?.percentage !== 100) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_TRAFFIC_SCOPE_INVALID");
    }
    if (!primary?.version_id) throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_VERSION_MISSING");
    const version = await api<Version>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(primary.version_id)}`);
    const annotations = version.annotations;
    if (version.id !== primary.version_id ||
        annotations?.["workers/message"] !== versionMessage(sourceSha, buildDigest, configurationDigest, target.environment as "staging" | "production")) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ARTIFACT_RECEIPT_MISMATCH");
    }
    return { versionId: primary.version_id, deployment };
  }

  async function readUploadedVersion(token: string, target: CloudflareStagingTarget, versionId: string) {
    const url = `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(versionId)}`;
    const retryDelaysMs = [200, 400, 800, 1_600, 3_200];
    for (let attempt = 0; ; attempt++) {
      try {
        return await api<Version>(token, url);
      } catch (error) {
        // Cloudflare can accept a version upload before its version-read endpoint
        // has propagated it. Retry only that immutable, read-only receipt lookup.
        if (!(error instanceof CloudflareStagingTransportError) || error.status !== 404 || error.apiCode !== 100146 || attempt >= retryDelaysMs.length) {
          throw error;
        }
        await mutationAuthority.getStore()?.();
        await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt]!));
      }
    }
  }

  function bootstrapTag(key: string) {
    return createHash("sha256").update(`smartaihub-staging:${key}`).digest("hex").slice(0, 32);
  }

  async function bootstrapDeployment(token: string, target: CloudflareStagingTarget, artifact: CloudflareStagingArtifact, bundle: CloudflareStagingBundle, key: string, origin?: CloudflareOriginVersionBindings) {
    const scriptUrl = `${API_ROOT}/accounts/${target.accountRef}/workers/scripts/${target.workerRef}`;
    async function currentOwnedDeployment(allowAbsent: boolean): Promise<Deployment | null> {
      let listing: { deployments?: Deployment[] };
      try { listing = await api(token, `${scriptUrl}/deployments`); }
      catch (error) {
        if (allowAbsent && error instanceof CloudflareStagingTransportError && error.status === 404 && error.apiCode === 10007) return null;
        throw error;
      }
      if (allowAbsent && Array.isArray(listing.deployments) && listing.deployments.length === 0) {
        const versions = await api<{ items?: Version[] }>(token, `${scriptUrl}/versions`);
        const workers = await api<Array<{ id?: string }>>(token, `${API_ROOT}/accounts/${target.accountRef}/workers/scripts`);
        if (Array.isArray(versions.items) && versions.items.length === 0 && Array.isArray(workers) && !workers.some(worker => worker.id === target.workerRef)) {
          try { await api(token, `${scriptUrl}/settings`); }
          catch (error) {
            // A failed compilation/asset session leaves a no-content draft:
            // no versions, no settings, no live Worker in account inventory.
            if (error instanceof CloudflareStagingTransportError && error.status === 404 && error.apiCode === 10222) return null;
            throw error;
          }
        }
      }
      const current = listing.deployments?.[0];
      if (!current?.id || current.versions?.length !== 1 || current.versions[0]?.percentage !== 100 || !current.versions[0]?.version_id) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_BOOTSTRAP_EXISTING_WORKER_DENIED");
      }
      const version = await api<Version>(token, `${scriptUrl}/versions/${encodeURIComponent(current.versions[0].version_id)}`);
      if (version.annotations?.["workers/tag"] !== bootstrapTag(key)) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_BOOTSTRAP_EXISTING_WORKER_DENIED");
      }
      await verifyVersion(token, target, current.id, artifact.sourceSha, artifact.buildDigest, origin?.configurationDigest);
      return current;
    }
    let current = await currentOwnedDeployment(true);
    let subdomain: string;
    try { subdomain = await getWorkersDevSubdomain(token, target); }
    catch (error) {
      if (!(error instanceof CloudflareStagingTransportError) || error.status !== 404 || error.apiCode !== 10007) throw error;
      const workers = await api<Array<{ id?: string }>>(token, `${API_ROOT}/accounts/${target.accountRef}/workers/scripts`);
      // Registration is safe only when every existing Worker explicitly has both
      // workers.dev and preview exposure disabled. Never edit those Workers.
      if (!Array.isArray(workers) || workers.length > 100) throw new CloudflareStagingTransportError("CLOUDFLARE_BOOTSTRAP_ACCOUNT_SUBDOMAIN_SCOPE_DENIED");
      for (const worker of workers) {
        if (!worker.id || !/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(worker.id)) throw new CloudflareStagingTransportError("CLOUDFLARE_BOOTSTRAP_ACCOUNT_SUBDOMAIN_SCOPE_DENIED");
        const exposure = await api<{ enabled?: boolean; previews_enabled?: boolean }>(token,
          `${API_ROOT}/accounts/${target.accountRef}/workers/scripts/${encodeURIComponent(worker.id)}/subdomain`);
        if (exposure.enabled !== false || exposure.previews_enabled !== false) throw new CloudflareStagingTransportError("CLOUDFLARE_BOOTSTRAP_ACCOUNT_SUBDOMAIN_SCOPE_DENIED");
      }
      const created = await api<{ subdomain?: string }>(token, `${API_ROOT}/accounts/${target.accountRef}/workers/subdomain`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: `smartaihub-${target.accountRef.slice(0, 8)}` }),
      });
      if (created.subdomain !== `smartaihub-${target.accountRef.slice(0, 8)}`) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_SUBDOMAIN_INVALID");
      subdomain = created.subdomain;
    }
    if (origin && !origin.descriptor.allowedPublicOrigins.includes(safeWorkersDevUrl(target.workerRef, subdomain))) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_PUBLIC_ORIGIN_DENIED");
    }
    if (!current) {
      // Recheck immediately before creation; a discovered foreign Worker is never overwritten.
      if (await currentOwnedDeployment(true)) throw new CloudflareStagingTransportError("CLOUDFLARE_BOOTSTRAP_CONCURRENT_CREATION");
      await uploadVersion(token, target, bundle, artifact, key, origin);
      current = await currentOwnedDeployment(false);
    }
    if (!current?.id) throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_RECEIPT_INVALID");
    await api(token, `${scriptUrl}/subdomain`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
    });
    return { deploymentId: current.id, url: safeWorkersDevUrl(target.workerRef, subdomain), sourceSha: artifact.sourceSha,
      buildDigest: artifact.buildDigest, ...(origin ? { configurationDigest: origin.configurationDigest } : {}) };
  }

  return {
    /** Upload a production candidate version without creating a deployment or shifting traffic. */
    prepareVersion: async ({ token, target, artifact, originConfiguration, assertMutationAuthorized, purpose }: {
      token: string; target: CloudflareStagingTarget; artifact: CloudflareStagingArtifact;
      originConfiguration: CloudflareOriginVersionBindings;
      purpose?: "worker-deployment";
      assertMutationAuthorized: () => Promise<void>;
    }) => {
      assertVersionTarget(target);
      if (target.environment !== "production" || !originConfiguration || !target.runtimePolicy ||
          originConfiguration.configurationRef !== target.runtimePolicy) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_PRODUCTION_ORIGIN_GRANT_REQUIRED");
      }
      const origin = validateCloudflareOriginVersionBindings(originConfiguration, target);
      return mutationAuthority.run(async () => {
        validateCloudflareOriginVersionBindings(origin, target);
        await assertMutationAuthorized();
      }, async () => {
        const bundle = await loadVerifiedBundle(artifact);
        if (origin.descriptor.applicationHttp && !origin.descriptor.applicationHttpPhase) {
          if (!input.prepareHttpApplications || !input.ensureHttpApplications)
            throw new CloudflareStagingTransportError("CLOUDFLARE_HTTP_APPLICATION_PROVISIONER_REQUIRED");
          await input.prepareHttpApplications(origin, target, assertMutationAuthorized);
        }
        await assertMutationAuthorized();
        const workerDeployment = purpose === "worker-deployment";
        const versionId = await uploadVersion(token, target, bundle, artifact, undefined, origin, workerDeployment);
        const uploaded = await readUploadedVersion(token, target, versionId);
        if (uploaded.id !== versionId || uploaded.annotations?.["workers/message"] !==
            versionMessage(artifact.sourceSha, artifact.buildDigest, origin.configurationDigest, "production")) {
          throw new CloudflareStagingTransportError("CLOUDFLARE_PRODUCTION_VERSION_RECEIPT_MISMATCH");
        }
        if (workerDeployment) assertProductionWorkerBindings(uploaded.resources?.bindings, target);
        if (origin.descriptor.applicationHttp && !origin.descriptor.applicationHttpPhase) {
          if (!input.ensureHttpApplications) throw new CloudflareStagingTransportError("CLOUDFLARE_HTTP_APPLICATION_PROVISIONER_REQUIRED");
          assertHttpApplicationVersionMetadata(origin.descriptor.applicationHttp, origin.descriptor, uploaded);
          await input.ensureHttpApplications(origin, target, uploaded,
            createHash("sha256").update(`${origin.configurationRef}|production-canary|${versionId}`).digest("hex"), assertMutationAuthorized);
        }
        return { versionId, sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest,
          configurationDigest: origin.configurationDigest, trafficShifted: false as const };
      });
    },
    deploy: async ({ token, target, artifact, idempotencyKey, bootstrap, originConfiguration, assertMutationAuthorized }) => {
      assertTarget(target);
      if (!/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_IDEMPOTENCY_INVALID");
      if (Boolean(target.runtimePolicy) !== Boolean(originConfiguration) ||
          (originConfiguration && !assertMutationAuthorized)) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ORIGIN_GRANT_REQUIRED");
      }
      const origin = originConfiguration ? validateCloudflareOriginVersionBindings(originConfiguration, target) : undefined;
      if (origin?.descriptor.nativeResources && !input.verifyNativeResources)
        throw new CloudflareStagingTransportError("CLOUDFLARE_NATIVE_PROVIDER_VERIFIER_REQUIRED");
      if (origin?.descriptor.applicationHttp && (!input.prepareHttpApplications || !input.ensureHttpApplications))
        throw new CloudflareStagingTransportError("CLOUDFLARE_HTTP_APPLICATION_PROVISIONER_REQUIRED");
      const assertHttpAuthorized = async () => {
        if (origin) validateCloudflareOriginVersionBindings(origin, target);
        await assertMutationAuthorized?.();
      };
      return mutationAuthority.run(async () => {
        // Revalidate expiry and exact target binding after long artifact reads,
        // then ask the executor to recheck grant/config/lease revocation.
        if (origin) validateCloudflareOriginVersionBindings(origin, target);
        await assertMutationAuthorized?.();
      }, async () => {
        const bundle = await loadVerifiedBundle(artifact);
        if (origin?.descriptor.nativeResources) {
          await assertMutationAuthorized?.();
          await input.verifyNativeResources!(origin.descriptor.nativeResources, target);
        }
        if (origin && !bootstrap) {
          const publicUrl = safeWorkersDevUrl(target.workerRef, await getWorkersDevSubdomain(token, target));
          if (!origin.descriptor.allowedPublicOrigins.includes(publicUrl)) {
            throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_PUBLIC_ORIGIN_DENIED");
          }
        }
        if (bootstrap) return bootstrapDeployment(token, target, artifact, bundle, idempotencyKey, origin);
        const prior = await findDeploymentByIdempotencyKey(token, target, idempotencyKey);
        if (prior?.id) {
          const deployment = await getDeployment(token, target, prior.id);
          if (deployment.versions.length !== 1 || deployment.versions[0]?.percentage !== 100 || !deployment.versions[0]?.version_id) {
            throw new CloudflareStagingTransportError("CLOUDFLARE_IDEMPOTENT_DEPLOYMENT_SCOPE_MISMATCH");
          }
          const priorVersion = await api<Version>(token,
            `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(deployment.versions[0].version_id)}`);
          if (priorVersion.id !== deployment.versions[0].version_id ||
              priorVersion.annotations?.["workers/message"] !== versionMessage(artifact.sourceSha, artifact.buildDigest, origin?.configurationDigest)) {
            throw new CloudflareStagingTransportError("CLOUDFLARE_IDEMPOTENT_DEPLOYMENT_ARTIFACT_MISMATCH");
          }
          if (origin?.descriptor.nativeResources) assertNativeWorkerBindings(priorVersion.resources?.bindings, origin.descriptor.nativeResources,
            Boolean(origin.descriptor.workflowExecution), origin.descriptor.jobTransport ?? "workflows");
          assertProductionQueueBinding(priorVersion.resources?.bindings, target);
          if (origin) assertCloudflareWorkflowVersionBindings(priorVersion.resources?.bindings, origin);
          if (origin?.descriptor.applicationHttpPhase) assertHttpApplicationVersionMetadata(origin.descriptor.applicationHttp!, origin.descriptor, priorVersion, true);
          if (origin?.descriptor.applicationHttp && !origin.descriptor.applicationHttpPhase) await input.ensureHttpApplications!(origin, target, priorVersion, idempotencyKey, assertHttpAuthorized);
          const subdomain = await getWorkersDevSubdomain(token, target);
          return { deploymentId: prior.id, url: safeWorkersDevUrl(target.workerRef, subdomain), sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest, ...(origin ? { configurationDigest: origin.configurationDigest } : {}) };
        }
        if (origin?.descriptor.applicationHttp) await input.prepareHttpApplications!(origin, target, assertHttpAuthorized);
        const versionId = await uploadVersion(token, target, bundle, artifact, undefined, origin);
        if (origin?.descriptor.nativeResources || origin?.descriptor.applicationHttp || target.environment === "production") {
          const uploaded = await readUploadedVersion(token, target, versionId);
          if (uploaded.id !== versionId || uploaded.annotations?.["workers/message"] !== versionMessage(artifact.sourceSha, artifact.buildDigest, origin?.configurationDigest))
            throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ARTIFACT_RECEIPT_MISMATCH");
          if (origin?.descriptor.nativeResources) assertNativeWorkerBindings(uploaded.resources?.bindings, origin.descriptor.nativeResources,
            Boolean(origin.descriptor.workflowExecution), origin.descriptor.jobTransport ?? "workflows");
          assertProductionQueueBinding(uploaded.resources?.bindings, target);
          if (origin) assertCloudflareWorkflowVersionBindings(uploaded.resources?.bindings, origin);
          if (origin?.descriptor.applicationHttpPhase) assertHttpApplicationVersionMetadata(origin.descriptor.applicationHttp!, origin.descriptor, uploaded, true);
          await assertMutationAuthorized?.();
          if (origin?.descriptor.nativeResources) await input.verifyNativeResources!(origin.descriptor.nativeResources, target);
          if (origin?.descriptor.applicationHttp && !origin.descriptor.applicationHttpPhase) await input.ensureHttpApplications!(origin, target, uploaded, idempotencyKey, assertHttpAuthorized);
        }
        const deploymentId = await createDeployment(token, target, [{ version_id: versionId, percentage: 100 }], idempotencyKey);
        const subdomain = await getWorkersDevSubdomain(token, target);
        return {
          deploymentId,
          url: safeWorkersDevUrl(target.workerRef, subdomain),
          sourceSha: artifact.sourceSha,
          buildDigest: artifact.buildDigest,
          ...(origin ? { configurationDigest: origin.configurationDigest } : {}),
        };
      });
    },
    verifyRuntime: async ({ token, target, deploymentId, url, sourceSha, buildDigest, configurationDigest }) => {
      assertTarget(target);
      const baseUrl = new URL(safeWorkersDevUrl(target.workerRef, await getWorkersDevSubdomain(token, target)));
      if (new URL(url).origin !== baseUrl.origin) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_URL_DENIED");
      await verifyVersion(token, target, deploymentId, sourceSha, buildDigest, configurationDigest);
      const active = await api<{ deployments?: Deployment[] }>(token,
        `${API_ROOT}/accounts/${target.accountRef}/workers/scripts/${target.workerRef}/deployments`);
      if (active.deployments?.[0]?.id !== deploymentId) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ACTIVE_DEPLOYMENT_MISMATCH");
      }
      let healthy = false;
      let verificationFailure: "health" | "spa" | "origin-auth" | undefined;
      let healthStatus: number | undefined;
      // A newly enabled workers.dev endpoint can take a few seconds to propagate.
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const response = await fetchImpl(new URL("/healthz", baseUrl), { redirect: "manual", signal: AbortSignal.timeout(5000) });
          healthStatus = response.status;
          if (response.status === 200 && response.headers.get("content-type")?.includes("application/json")) {
            const health = await response.json() as { ok?: unknown; service?: unknown };
            healthy = health.ok === true && health.service === "smartspec-cloudflare-runtime";
          }
          if (healthy || (response.status !== 404 && response.status !== 503)) break;
        } catch { /* Bounded retry for initial endpoint propagation. */ }
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000));
      }
      let spaReady = false;
      if (healthy) {
        // Cloudflare can report a newly-created Worker healthy before its
        // uploaded static assets are available at the workers.dev edge. Retry
        // only transient transport/propagation failures; malformed HTML and
        // incorrect MIME types remain immediate acceptance failures.
        for (let attempt = 0; attempt < 4; attempt++) {
          let retryable = false;
          try {
            const page = await fetchImpl(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(10000) });
            if (page.status === 404 || page.status >= 500) retryable = true;
            if (page.status === 200 && page.headers.get("content-type")?.startsWith("text/html")) {
              const html = await page.text();
              const script = /<script[^>]+src=["'](\/assets\/[^"']+\.js)["']/i.exec(html)?.[1];
              if (html.includes('id="root"') && script && !script.includes("..") && !script.includes("\\")) {
                const javascript = await fetchImpl(new URL(script, baseUrl), { redirect: "manual", signal: AbortSignal.timeout(10000) });
                spaReady = javascript.status === 200 && /(?:javascript|ecmascript)/i.test(javascript.headers.get("content-type") ?? "");
                retryable = javascript.status === 404 || javascript.status >= 500;
                await javascript.body?.cancel();
              }
            }
          } catch { retryable = true; }
          if (spaReady || !retryable || attempt === 3) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        const after = await api<{ deployments?: Deployment[] }>(token,
          `${API_ROOT}/accounts/${target.accountRef}/workers/scripts/${target.workerRef}/deployments`);
        if (after.deployments?.[0]?.id !== deploymentId) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ACTIVE_DEPLOYMENT_MISMATCH");
      }
      let originReady = configurationDigest === undefined;
      if (healthy && spaReady && configurationDigest !== undefined) {
        try {
          // Exercise the real Linux auth authority, not the Worker's native
          // health endpoint or an HTML Access login page. No user credentials.
          const response = await fetchImpl(new URL("/trpc/auth.me", baseUrl), {
            redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000),
          });
          if (response.status === 200 && response.headers.get("content-type")?.includes("application/json")) {
            const body = await response.json() as { result?: { data?: { json?: unknown } }; error?: unknown };
            originReady = body?.error === undefined && body?.result?.data?.json === null;
          } else await response.body?.cancel();
        } catch { /* Origin failures remain a failed verification, never asset-only success. */ }
        const after = await api<{ deployments?: Deployment[] }>(token,
          `${API_ROOT}/accounts/${target.accountRef}/workers/scripts/${target.workerRef}/deployments`);
        if (after.deployments?.[0]?.id !== deploymentId) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ACTIVE_DEPLOYMENT_MISMATCH");
      }
      if (!healthy) verificationFailure = "health";
      else if (!spaReady) verificationFailure = "spa";
      else if (!originReady) verificationFailure = "origin-auth";
      return {
        reachable: healthy && spaReady && originReady,
        ...(verificationFailure ? { verificationFailure } : {}),
        ...(healthStatus !== undefined ? { healthStatus } : {}),
        deploymentId,
        sourceSha,
        buildDigest,
        ...(configurationDigest ? { configurationDigest } : {}),
      };
    },
    rollback: async ({ token, target, deploymentId, idempotencyKey, sourceSha, buildDigest, configurationDigest, assertMutationAuthorized }) => mutationAuthority.run(assertMutationAuthorized ?? (async () => {}), async () => {
      assertTarget(target);
      if (!/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey) || (configurationDigest !== undefined && !assertMutationAuthorized)) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ORIGIN_GRANT_REQUIRED");
      }
      if (configurationDigest !== undefined) versionMessage(sourceSha ?? "", buildDigest ?? "", configurationDigest);
      const previous = await getDeployment(token, target, deploymentId);
      const version = previous.versions[0];
      if (previous.versions.length !== 1 || version?.percentage !== 100 || !version.version_id) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_VERSION_MISSING");
      }
      const versionDetails = await api<Version>(token,
        `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(version.version_id)}`);
      const annotations = versionDetails.annotations;
      const message = annotations?.["workers/message"] ?? "";
      const match = /^SmartAIHub staging ([a-f0-9]{40}) ([a-f0-9]{64})(?: origin ([a-f0-9]{64}))?$/i.exec(message);
      if (versionDetails.id !== version.version_id || !match) throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_ARTIFACT_UNVERIFIED");
      if (match[3] !== configurationDigest) throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_ORIGIN_MISMATCH");
      if ((sourceSha !== undefined && match[1] !== sourceSha) || (buildDigest !== undefined && match[2] !== buildDigest)) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_ARTIFACT_MISMATCH");
      }
      let rolledBackDeploymentId: string;
      const prior = (target.runtimePolicy || configurationDigest !== undefined)
        ? await findDeploymentByIdempotencyKey(token, target, idempotencyKey) : null;
      if (prior?.id) {
        const checked = await verifyVersion(token, target, prior.id, match[1]!, match[2]!, configurationDigest);
        if (checked.versionId !== version.version_id) throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_IDEMPOTENCY_MISMATCH");
        rolledBackDeploymentId = prior.id;
      } else {
        rolledBackDeploymentId = await createDeployment(token, target, [{ version_id: version.version_id, percentage: 100 }], idempotencyKey);
      }
      const subdomain = await getWorkersDevSubdomain(token, target);
      return {
        deploymentId: rolledBackDeploymentId,
        url: safeWorkersDevUrl(target.workerRef, subdomain),
        sourceSha: match[1]!,
        buildDigest: match[2]!,
        ...(configurationDigest ? { configurationDigest } : {}),
      };
    }),
  };
}
