import { AsyncLocalStorage } from "node:async_hooks";
import { httpApplicationWorkerMetadata } from "./cloudflareHttpApplicationBindings";
import { createHash } from "node:crypto";
import { validateCloudflareOriginVersionBindings, cloudflareWorkflowVersionBindings, assertCloudflareWorkflowVersionBindings, type CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import { assertNativeWorkerBindings, nativeWorkerBindings, type CloudflareNativeBindingDescriptor } from "./cloudflareNativeBindingDescriptor";
import { cloudflareStagingAssetContentType } from "./cloudflareStagingAssetMetadata";
import type {
  CloudflareStagingApi,
  CloudflareStagingArtifact,
  CloudflareStagingTarget,
} from "./cloudflareStagingDeploymentExecutor";

const API_ROOT = "https://api.cloudflare.com/client/v4";
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
) => Promise<CloudflareStagingBundle | null>;

type Envelope<T> = { success?: boolean; result?: T; errors?: Array<{ code?: number }> };
type Deployment = {
  id?: string;
  versions?: Array<{ version_id?: string; percentage?: number }>;
  annotations?: Record<string, string>;
};
type Version = {
  id?: string;
  metadata?: { main_module?: string };
  annotations?: Record<string, string>;
  resources?: { bindings?: unknown; script_runtime?: { containers?: unknown } };
};

export class CloudflareStagingTransportError extends Error {
  readonly class = "permanent" as const;
  readonly diagnosticCode: string;
  constructor(diagnosticCode: string, readonly status?: number, readonly apiCode?: number) {
    super(diagnosticCode);
    this.name = "CloudflareStagingTransportError";
    this.diagnosticCode = diagnosticCode;
  }
}

function assertTarget(target: CloudflareStagingTarget) {
  if (target.targetId !== TARGET_ID || target.workerRef !== TARGET_ID || target.environment !== "staging") {
    throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_TARGET_DENIED");
  }
  if (!/^[a-f0-9]{32}$/i.test(target.accountRef)) {
    throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ACCOUNT_REF_INVALID");
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
}): CloudflareStagingApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  const mutationAuthority = new AsyncLocalStorage<() => Promise<void>>();

  async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
    assertSafeApiUrl(url);
    if (init.method && init.method !== "GET" && init.method !== "HEAD") await mutationAuthority.getStore()?.();
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      let code: number | undefined;
      try { const body = await response.json() as Envelope<unknown>; code = body.errors?.[0]?.code; } catch { /* Retain bounded HTTP diagnostic. */ }
      throw new CloudflareStagingTransportError(`CLOUDFLARE_HTTP_${response.status}${Number.isSafeInteger(code) ? `_API_${code}` : ""}`, response.status, code);
    }
    let envelope: Envelope<T>;
    try { envelope = await response.json() as Envelope<T>; }
    catch { throw new CloudflareStagingTransportError("CLOUDFLARE_RESPONSE_INVALID"); }
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
    const bundle = await input.resolveBundle(artifact.artifactRef);
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

  function versionMessage(sourceSha: string, buildDigest: string, configurationDigest?: string) {
    if (configurationDigest !== undefined && !SHA256.test(configurationDigest)) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_ORIGIN_DIGEST_INVALID");
    }
    return `SmartAIHub staging ${sourceSha} ${buildDigest}${configurationDigest ? ` origin ${configurationDigest}` : ""}`;
  }

  async function uploadVersion(token: string, target: CloudflareStagingTarget, bundle: CloudflareStagingBundle, artifact: CloudflareStagingArtifact, bootstrapKey?: string, origin?: CloudflareOriginVersionBindings) {
    const completionJwt = await uploadAssets(token, target, bundle);
    const http = origin?.descriptor.applicationHttp ? httpApplicationWorkerMetadata(origin.descriptor.applicationHttp, origin.descriptor) : undefined;
    const metadata = {
      main_module: bundle.mainModule,
      compatibility_date: bundle.compatibilityDate,
      compatibility_flags: ["nodejs_compat"],
      ...(http ? { exports: http.exports, containers: http.containers } : {}),
      bindings: [
        { name: "ASSETS", type: "assets" },
        { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: (origin?.descriptor.workflowExecution || origin?.descriptor.retentionSchedule) ? "enabled" : "disabled" },
        { name: "CLOUDFLARE_ENVIRONMENT", type: "plain_text", text: "staging" },
        ...(origin?.descriptor.nativeResources ? nativeWorkerBindings(origin.descriptor.nativeResources) : []),
        ...(http ? http.bindings : []),
        ...(origin ? cloudflareWorkflowVersionBindings(origin) : []),
        ...(origin ? [
          { name: "AUTH_ORIGIN", type: "plain_text", text: origin.descriptor.origin },
          { name: "AUTH_ORIGIN_PRIVATE_HOST", type: "plain_text", text: new URL(origin.descriptor.origin).host },
          { name: "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS", type: "plain_text", text: JSON.stringify(origin.descriptor.allowedPublicOrigins) },
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
          run_worker_first: [
            "/api", "/api/*", "/v1", "/v1/*", "/trpc", "/trpc/*", "/auth", "/auth/*",
            "/oauth", "/oauth/*", "/uploads", "/uploads/*", "/internal", "/internal/*",
            "/.well-known/*", "/healthz", "/readyz", "/metrics", "/socket.io*", "/ws*", "/widget/v1/ws",
            "/_ops/application-canary/*",
          ],
        },
      } : undefined,
      annotations: {
        ...(bootstrapKey ? { "workers/tag": bootstrapTag(bootstrapKey) } : {}),
        "workers/message": versionMessage(artifact.sourceSha, artifact.buildDigest, origin?.configurationDigest),
      },
    };
    const form = new FormData();
    form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
    for (const [name, file] of Object.entries(bundle.moduleFiles)) {
      form.set(name, new Blob([file.bytes], { type: moduleContentType(name, file.contentType) }), name);
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

  async function getDeployment(token: string, target: CloudflareStagingTarget, deploymentId: string) {
    if (!VERSION_ID.test(deploymentId)) throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ID_INVALID");
    const result = await api<Deployment>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/deployments/${encodeURIComponent(deploymentId)}`);
    if (result.id !== deploymentId || !Array.isArray(result.versions) || result.versions.length === 0 ||
        result.versions.some(version => !version.version_id || !VERSION_ID.test(version.version_id))) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_RECEIPT_INVALID");
    }
    return result;
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
        annotations?.["workers/message"] !== versionMessage(sourceSha, buildDigest, configurationDigest)) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ARTIFACT_RECEIPT_MISMATCH");
    }
    return { versionId: primary.version_id, deployment };
  }

  function bootstrapTag(key: string) {
    return createHash("sha256").update(`smartaihub-staging:${key}`).digest("hex").slice(0, 32);
  }

  async function bootstrapDeployment(token: string, target: CloudflareStagingTarget, artifact: CloudflareStagingArtifact, bundle: CloudflareStagingBundle, key: string) {
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
      await verifyVersion(token, target, current.id, artifact.sourceSha, artifact.buildDigest);
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
    if (!current) {
      // Recheck immediately before creation; a discovered foreign Worker is never overwritten.
      if (await currentOwnedDeployment(true)) throw new CloudflareStagingTransportError("CLOUDFLARE_BOOTSTRAP_CONCURRENT_CREATION");
      await uploadVersion(token, target, bundle, artifact, key);
      current = await currentOwnedDeployment(false);
    }
    if (!current?.id) throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_RECEIPT_INVALID");
    await api(token, `${scriptUrl}/subdomain`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
    });
    return { deploymentId: current.id, url: safeWorkersDevUrl(target.workerRef, subdomain), sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest };
  }

  return {
    deploy: async ({ token, target, artifact, idempotencyKey, bootstrap, originConfiguration, assertMutationAuthorized }) => {
      assertTarget(target);
      if (!/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_IDEMPOTENCY_INVALID");
      if (Boolean(target.runtimePolicy) !== Boolean(originConfiguration) ||
          (originConfiguration && (!assertMutationAuthorized || bootstrap))) {
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
        if (origin) {
          const publicUrl = safeWorkersDevUrl(target.workerRef, await getWorkersDevSubdomain(token, target));
          if (!origin.descriptor.allowedPublicOrigins.includes(publicUrl)) {
            throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_PUBLIC_ORIGIN_DENIED");
          }
        }
        if (bootstrap) return bootstrapDeployment(token, target, artifact, bundle, idempotencyKey);
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
          if (origin?.descriptor.nativeResources) assertNativeWorkerBindings(priorVersion.resources?.bindings, origin.descriptor.nativeResources, Boolean(origin.descriptor.workflowExecution));
          if (origin) assertCloudflareWorkflowVersionBindings(priorVersion.resources?.bindings, origin);
          if (origin?.descriptor.applicationHttp) await input.ensureHttpApplications!(origin, target, priorVersion, idempotencyKey, assertHttpAuthorized);
          const subdomain = await getWorkersDevSubdomain(token, target);
          return { deploymentId: prior.id, url: safeWorkersDevUrl(target.workerRef, subdomain), sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest, ...(origin ? { configurationDigest: origin.configurationDigest } : {}) };
        }
        if (origin?.descriptor.applicationHttp) await input.prepareHttpApplications!(origin, target, assertHttpAuthorized);
        const versionId = await uploadVersion(token, target, bundle, artifact, undefined, origin);
        if (origin?.descriptor.nativeResources || origin?.descriptor.applicationHttp) {
          const uploaded = await api<Version>(token, `${API_ROOT}/accounts/${target.accountRef}/workers/scripts/${target.workerRef}/versions/${versionId}`);
          if (uploaded.id !== versionId || uploaded.annotations?.["workers/message"] !== versionMessage(artifact.sourceSha, artifact.buildDigest, origin.configurationDigest))
            throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ARTIFACT_RECEIPT_MISMATCH");
          if (origin.descriptor.nativeResources) assertNativeWorkerBindings(uploaded.resources?.bindings, origin.descriptor.nativeResources, Boolean(origin.descriptor.workflowExecution));
          assertCloudflareWorkflowVersionBindings(uploaded.resources?.bindings, origin);
          await assertMutationAuthorized?.();
          if (origin.descriptor.nativeResources) await input.verifyNativeResources!(origin.descriptor.nativeResources, target);
          if (origin.descriptor.applicationHttp) await input.ensureHttpApplications!(origin, target, uploaded, idempotencyKey, assertHttpAuthorized);
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
      // A newly enabled workers.dev endpoint can take a few seconds to propagate.
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const response = await fetchImpl(new URL("/healthz", baseUrl), { redirect: "manual", signal: AbortSignal.timeout(5000) });
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
        try {
          const page = await fetchImpl(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(10000) });
          if (page.status === 200 && page.headers.get("content-type")?.startsWith("text/html")) {
            const html = await page.text();
            const script = /<script[^>]+src=["'](\/assets\/[^"']+\.js)["']/i.exec(html)?.[1];
            if (html.includes('id="root"') && script && !script.includes("..") && !script.includes("\\")) {
              const javascript = await fetchImpl(new URL(script, baseUrl), { redirect: "manual", signal: AbortSignal.timeout(10000) });
              spaReady = javascript.status === 200 && /(?:javascript|ecmascript)/i.test(javascript.headers.get("content-type") ?? "");
              await javascript.body?.cancel();
            }
          }
        } catch { /* An inaccessible or download-only SPA is not accepted. */ }
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
      return {
        reachable: healthy && spaReady && originReady,
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
