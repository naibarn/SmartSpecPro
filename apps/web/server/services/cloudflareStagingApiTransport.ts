import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
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

function cloudflareAssetHash(bytes: Uint8Array) {
  return createHash("md5").update(bytes).digest("hex");
}

function contentTypeForAsset(name: string, contentType: string) {
  if (/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:;[\w=.+-]+)*$/.test(contentType)) return contentType;
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "html") return "text/html; charset=utf-8";
  if (extension === "css") return "text/css; charset=utf-8";
  if (extension === "js" || extension === "mjs") return "application/javascript";
  if (extension === "json") return "application/json";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function base64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

export function createCloudflareStagingApiTransport(input: {
  resolveBundle: CloudflareStagingBundleResolver;
  fetchImpl?: typeof fetch;
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
      const hash = cloudflareAssetHash(file.bytes);
      manifest[`/${name}`] = { hash, size: file.bytes.byteLength };
      assetsByHash.set(hash, { name, bytes: file.bytes, contentType: contentTypeForAsset(name, file.contentType) });
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
    for (const name of Object.keys(bundle.moduleFiles)) {
      if (!safeAssetPath(name)) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_MODULE_INVALID");
    }
    return bundle;
  }

  async function uploadVersion(token: string, target: CloudflareStagingTarget, bundle: CloudflareStagingBundle, artifact: CloudflareStagingArtifact, bootstrapKey?: string) {
    const completionJwt = await uploadAssets(token, target, bundle);
    const metadata = {
      main_module: bundle.mainModule,
      compatibility_date: bundle.compatibilityDate,
      bindings: [
        { name: "ASSETS", type: "assets" },
        { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "disabled" },
        { name: "CLOUDFLARE_ENVIRONMENT", type: "plain_text", text: "staging" },
      ],
      assets: completionJwt ? {
        jwt: completionJwt,
        config: {
          not_found_handling: "single-page-application",
          run_worker_first: [
            "/api", "/api/*", "/v1", "/v1/*", "/trpc", "/trpc/*", "/auth", "/auth/*",
            "/oauth", "/oauth/*", "/uploads", "/uploads/*", "/internal", "/internal/*",
            "/.well-known/*", "/healthz", "/readyz", "/metrics", "/socket.io*", "/ws*",
          ],
        },
      } : undefined,
      annotations: {
        ...(bootstrapKey ? { "workers/tag": bootstrapTag(bootstrapKey) } : {}),
        "workers/message": `SmartAIHub staging ${artifact.sourceSha} ${artifact.buildDigest}`,
      },
    };
    const form = new FormData();
    form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
    for (const [name, file] of Object.entries(bundle.moduleFiles)) {
      form.set(name, new Blob([file.bytes], { type: /\.m?js$/i.test(name) ? "application/javascript+module" : file.contentType }), name);
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

  async function verifyVersion(token: string, target: CloudflareStagingTarget, deploymentId: string, sourceSha: string, buildDigest: string) {
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
        annotations?.["workers/message"] !== `SmartAIHub staging ${sourceSha} ${buildDigest}`) {
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
    deploy: async ({ token, target, artifact, idempotencyKey, bootstrap, assertMutationAuthorized }) => mutationAuthority.run(assertMutationAuthorized ?? (async () => {}), async () => {
      assertTarget(target);
      if (!/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_IDEMPOTENCY_INVALID");
      const bundle = await loadVerifiedBundle(artifact);
      if (bootstrap) return bootstrapDeployment(token, target, artifact, bundle, idempotencyKey);
      const prior = await findDeploymentByIdempotencyKey(token, target, idempotencyKey);
      if (prior?.id) {
        const deployment = await getDeployment(token, target, prior.id);
        if (deployment.versions.length !== 1 || deployment.versions[0]?.percentage !== 100 || !deployment.versions[0]?.version_id) {
          throw new CloudflareStagingTransportError("CLOUDFLARE_IDEMPOTENT_DEPLOYMENT_SCOPE_MISMATCH");
        }
        const priorVersion = await api<Version>(token,
          `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(deployment.versions[0].version_id)}`);
        if (priorVersion.annotations?.["workers/message"] !== `SmartAIHub staging ${artifact.sourceSha} ${artifact.buildDigest}`) {
          throw new CloudflareStagingTransportError("CLOUDFLARE_IDEMPOTENT_DEPLOYMENT_ARTIFACT_MISMATCH");
        }
        const subdomain = await getWorkersDevSubdomain(token, target);
        return { deploymentId: prior.id, url: safeWorkersDevUrl(target.workerRef, subdomain), sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest };
      }
      const versionId = await uploadVersion(token, target, bundle, artifact);
      const deploymentId = await createDeployment(token, target, [{ version_id: versionId, percentage: 100 }], idempotencyKey);
      const subdomain = await getWorkersDevSubdomain(token, target);
      return {
        deploymentId,
        url: safeWorkersDevUrl(target.workerRef, subdomain),
        sourceSha: artifact.sourceSha,
        buildDigest: artifact.buildDigest,
      };
    }),
    verifyRuntime: async ({ token, target, deploymentId, url, sourceSha, buildDigest }) => {
      assertTarget(target);
      const baseUrl = new URL(safeWorkersDevUrl(target.workerRef, await getWorkersDevSubdomain(token, target)));
      if (new URL(url).origin !== baseUrl.origin) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_URL_DENIED");
      await verifyVersion(token, target, deploymentId, sourceSha, buildDigest);
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
      return {
        reachable: healthy,
        deploymentId,
        sourceSha,
        buildDigest,
      };
    },
    rollback: async ({ token, target, deploymentId, idempotencyKey, sourceSha, buildDigest, assertMutationAuthorized }) => mutationAuthority.run(assertMutationAuthorized ?? (async () => {}), async () => {
      assertTarget(target);
      const previous = await getDeployment(token, target, deploymentId);
      const version = previous.versions[0];
      if (previous.versions.length !== 1 || version?.percentage !== 100 || !version.version_id) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_VERSION_MISSING");
      }
      const versionDetails = await api<Version>(token,
        `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(version.version_id)}`);
      const annotations = versionDetails.annotations;
      const message = annotations?.["workers/message"] ?? "";
      const match = /^SmartAIHub staging ([a-f0-9]{40}) ([a-f0-9]{64})$/i.exec(message);
      if (versionDetails.id !== version.version_id || !match) throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_ARTIFACT_UNVERIFIED");
      if ((sourceSha !== undefined && match[1] !== sourceSha) || (buildDigest !== undefined && match[2] !== buildDigest)) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_ARTIFACT_MISMATCH");
      }
      const rolledBackDeploymentId = await createDeployment(token, target, [{ version_id: version.version_id, percentage: 100 }], idempotencyKey);
      const subdomain = await getWorkersDevSubdomain(token, target);
      return {
        deploymentId: rolledBackDeploymentId,
        url: safeWorkersDevUrl(target.workerRef, subdomain),
        sourceSha: match[1]!,
        buildDigest: match[2]!,
      };
    }),
  };
}
