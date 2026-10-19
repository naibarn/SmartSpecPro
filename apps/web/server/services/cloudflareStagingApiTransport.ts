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
  metadata?: { main_module?: string; annotations?: Record<string, string> };
};

export class CloudflareStagingTransportError extends Error {
  readonly class = "permanent" as const;
  readonly diagnosticCode: string;
  constructor(diagnosticCode: string) {
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

  async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
    assertSafeApiUrl(url);
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new CloudflareStagingTransportError(`CLOUDFLARE_HTTP_${response.status}`);
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

  async function uploadVersion(token: string, target: CloudflareStagingTarget, bundle: CloudflareStagingBundle, artifact: CloudflareStagingArtifact) {
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
        "workers/commit_sha": artifact.sourceSha,
        "workers/message": `SmartAIHub staging ${artifact.sourceSha} ${artifact.buildDigest}`,
      },
    };
    const form = new FormData();
    form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
    for (const [name, file] of Object.entries(bundle.moduleFiles)) {
      form.set(name, new Blob([file.bytes], { type: file.contentType }), name);
    }
    const result = await api<{ id?: string }>(token,
      `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions`, {
        method: "POST",
        body: form,
      });
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
    const annotations = version.metadata?.annotations;
    if (version.id !== primary.version_id || annotations?.["workers/commit_sha"]?.toLowerCase() !== sourceSha.toLowerCase() ||
        annotations?.["workers/message"] !== `SmartAIHub staging ${sourceSha} ${buildDigest}`) {
      throw new CloudflareStagingTransportError("CLOUDFLARE_DEPLOYMENT_ARTIFACT_RECEIPT_MISMATCH");
    }
    return { versionId: primary.version_id, deployment };
  }

  return {
    deploy: async ({ token, target, artifact, idempotencyKey }) => {
      assertTarget(target);
      if (!/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_IDEMPOTENCY_INVALID");
      const bundle = await loadVerifiedBundle(artifact);
      const prior = await findDeploymentByIdempotencyKey(token, target, idempotencyKey);
      if (prior?.id) {
        const deployment = await getDeployment(token, target, prior.id);
        if (deployment.versions.length !== 1 || deployment.versions[0]?.percentage !== 100 || !deployment.versions[0]?.version_id) {
          throw new CloudflareStagingTransportError("CLOUDFLARE_IDEMPOTENT_DEPLOYMENT_SCOPE_MISMATCH");
        }
        const priorVersion = await api<Version>(token,
          `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(deployment.versions[0].version_id)}`);
        if (priorVersion.metadata?.annotations?.["workers/commit_sha"]?.toLowerCase() !== artifact.sourceSha.toLowerCase() ||
            priorVersion.metadata?.annotations?.["workers/message"] !== `SmartAIHub staging ${artifact.sourceSha} ${artifact.buildDigest}`) {
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
    },
    verifyRuntime: async ({ token, target, deploymentId, url, sourceSha, buildDigest }) => {
      assertTarget(target);
      const baseUrl = new URL(safeWorkersDevUrl(target.workerRef, await getWorkersDevSubdomain(token, target)));
      if (new URL(url).origin !== baseUrl.origin) throw new CloudflareStagingTransportError("CLOUDFLARE_STAGING_URL_DENIED");
      await verifyVersion(token, target, deploymentId, sourceSha, buildDigest);
      const response = await fetchImpl(new URL("/healthz", baseUrl), { redirect: "manual" });
      return {
        reachable: response.status >= 200 && response.status < 400,
        deploymentId,
        sourceSha,
        buildDigest,
      };
    },
    rollback: async ({ token, target, deploymentId, idempotencyKey }) => {
      assertTarget(target);
      const previous = await getDeployment(token, target, deploymentId);
      const version = previous.versions[0];
      if (previous.versions.length !== 1 || version?.percentage !== 100 || !version.version_id) {
        throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_VERSION_MISSING");
      }
      const versionDetails = await api<Version>(token,
        `${API_ROOT}/accounts/${encodeURIComponent(target.accountRef)}/workers/scripts/${encodeURIComponent(target.workerRef)}/versions/${encodeURIComponent(version.version_id)}`);
      const annotations = versionDetails.metadata?.annotations;
      const message = annotations?.["workers/message"] ?? "";
      const match = /^SmartAIHub staging ([a-f0-9]{40}) ([a-f0-9]{64})$/i.exec(message);
      if (versionDetails.id !== version.version_id || !match) throw new CloudflareStagingTransportError("CLOUDFLARE_ROLLBACK_ARTIFACT_UNVERIFIED");
      const rolledBackDeploymentId = await createDeployment(token, target, [{ version_id: version.version_id, percentage: 100 }], idempotencyKey);
      const subdomain = await getWorkersDevSubdomain(token, target);
      return {
        deploymentId: rolledBackDeploymentId,
        url: safeWorkersDevUrl(target.workerRef, subdomain),
        sourceSha: match[1]!,
        buildDigest: match[2]!,
      };
    },
  };
}
