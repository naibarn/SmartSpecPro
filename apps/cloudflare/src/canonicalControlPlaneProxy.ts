import type {
  CanonicalClaim,
  CanonicalControlPlaneJob,
  CanonicalControlPlaneRepository,
  CanonicalJobEnvelope,
  CanonicalJobResult,
  CanonicalWorkerExecution,
  CloudflareEnvironment,
} from "./contracts";
import { parseCloudflarePublicOrigins } from "../../../packages/shared/src/cloudflareOrigin";
import { proxyAuthToOrigin } from "./authOriginProxy";

const PUBLIC_APPLICATION_HOSTS = new Set(["smartaihub.app", "smartspec.pro"]);

function resolvePrivatePlatformOrigin(env: CloudflareEnvironment): { origin: URL; publicOrigin?: string } {
  const configuredOrigin = env.PLATFORM_EDGE_ORIGIN?.trim();
  const expectedHost = env.PLATFORM_EDGE_PRIVATE_HOST?.trim().toLowerCase();
  if (!configuredOrigin || !expectedHost) throw new Error("CLOUDFLARE_CONTROL_PLANE_NOT_CONFIGURED");
  let origin: URL;
  try { origin = new URL(configuredOrigin); }
  catch { throw new Error("CLOUDFLARE_CONTROL_PLANE_NOT_CONFIGURED"); }
  const hostname = origin.hostname.toLowerCase().replace(/\.$/, "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
      origin.host.toLowerCase() !== expectedHost || PUBLIC_APPLICATION_HOSTS.has(hostname)) {
    throw new Error("CLOUDFLARE_CONTROL_PLANE_ORIGIN_INVALID");
  }
  // A product subdomain is private only through the exact already-qualified
  // Access/app-attested ingress pair. Never relax the public-host exclusion
  // just because PLATFORM_EDGE_PRIVATE_HOST repeats a caller's hostname.
  const paired = [origin.origin, origin.href].includes(env.AUTH_ORIGIN?.trim() ?? "") &&
    env.AUTH_ORIGIN_PRIVATE_HOST?.trim().toLowerCase() === expectedHost;
  if (paired) {
    const publicOrigins = parseCloudflarePublicOrigins(env.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS);
    if (!env.AUTH_ORIGIN_TOKEN?.trim() || !env.AUTH_ORIGIN_ACCESS_CLIENT_ID?.trim() ||
        !env.AUTH_ORIGIN_ACCESS_CLIENT_SECRET?.trim() || publicOrigins?.length !== 1 ||
        publicOrigins[0] === origin.origin) throw new Error("CLOUDFLARE_CONTROL_PLANE_NOT_CONFIGURED");
    return { origin, publicOrigin: publicOrigins[0] };
  }
  if (hostname.endsWith(".smartaihub.app") || hostname.endsWith(".smartspec.pro")) {
    throw new Error("CLOUDFLARE_CONTROL_PLANE_ORIGIN_INVALID");
  }
  return { origin };
}

async function callPlatform<T>(
  env: CloudflareEnvironment,
  action: "context" | "claim" | "execute" | "complete" | "fail",
  body: Record<string, unknown>,
): Promise<T> {
  assertCanonicalControlPlaneConfiguration(env);
  const token = env.CLOUDFLARE_CONTROL_PLANE_TOKEN!.trim();
  const { origin, publicOrigin } = resolvePrivatePlatformOrigin(env);
  const bodyJson = JSON.stringify(body);
  if (new TextEncoder().encode(bodyJson).byteLength > 32 * 1024) throw new Error("CLOUDFLARE_CONTROL_PLANE_REQUEST_TOO_LARGE");
  let response: Response;
  try {
    const init: RequestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json", "cache-control": "no-store", "x-cloudflare-control-plane-token": token,
        // Bind the server-generated service POST to the same attested public
        // origin, preserving the platform's existing edge CSRF checks.
        ...(publicOrigin ? { origin: publicOrigin } : {}),
      },
      body: bodyJson,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    };
    const path = `/api/internal/cloudflare-job-control/${action}`;
    response = publicOrigin
      ? await proxyAuthToOrigin(new Request(new URL(path, publicOrigin), init), env, fetch, 10_000)
      : await fetch(new URL(path, origin), init);
  } catch {
    throw new Error("CLOUDFLARE_CONTROL_PLANE_UNAVAILABLE");
  }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 408 || response.status === 409 || response.status === 425 ||
      response.status === 429 || response.status >= 500
      ? "CLOUDFLARE_CONTROL_PLANE_UNAVAILABLE"
      : `CLOUDFLARE_CONTROL_PLANE_REJECTED_${response.status}`;
    throw new Error(code);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 512 * 1024) throw new Error("CLOUDFLARE_CONTROL_PLANE_RESPONSE_TOO_LARGE");
  let bytes: ArrayBuffer;
  try { bytes = await response.arrayBuffer(); }
  catch { throw new Error("CLOUDFLARE_CONTROL_PLANE_RESPONSE_INVALID"); }
  if (bytes.byteLength > 512 * 1024) throw new Error("CLOUDFLARE_CONTROL_PLANE_RESPONSE_TOO_LARGE");
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch { throw new Error("CLOUDFLARE_CONTROL_PLANE_RESPONSE_INVALID"); }
}

/** Configuration validation only; it does not claim live origin health. */
export function assertCanonicalControlPlaneConfiguration(env: CloudflareEnvironment): void {
  const token = env.CLOUDFLARE_CONTROL_PLANE_TOKEN?.trim();
  if (!token) throw new Error("CLOUDFLARE_CONTROL_PLANE_NOT_CONFIGURED");
  if ([env.PLATFORM_EDGE_TOKEN, env.AUTH_ORIGIN_TOKEN, env.AUTH_ORIGIN_ACCESS_CLIENT_SECRET, env.CLOUDFLARE_RUNTIME_TOKEN]
      .some(secret => secret?.trim() === token)) throw new Error("CLOUDFLARE_CONTROL_PLANE_CREDENTIAL_REUSED");
  resolvePrivatePlatformOrigin(env);
}

type ContextResponse = { job: CanonicalControlPlaneJob | null; disposition?: "ack" };
type ClaimResponse = { state: "claimed" | "terminal" | "retry" | "quarantine"; claim?: CanonicalClaim };
type SettlementResponse = { state: "completed" | "duplicate" | "retry" | "quarantine" };

/** A deliberately narrow hybrid execution port; domain writes stay with the
 * existing tenant-scoped Node executor while Cloudflare owns orchestration. */
export const executeCanonicalPlatformJob: CanonicalWorkerExecution = async ({ env, job, envelope, claim }) => {
  if (env.CLOUDFLARE_JOB_TRANSPORT === "workflows" && (!env.CLOUDFLARE_WORKFLOW_TENANT_ID || env.CLOUDFLARE_WORKFLOW_TENANT_ID !== job.tenantId)) {
    throw new Error("CLOUDFLARE_JOB_TENANT_NOT_ADMITTED");
  }
  if (job.jobType !== "emergency.report.intake" || job.contractVersion !== "feature-186-v1" || job.executionClass !== "short") {
    throw new Error("CLOUDFLARE_JOB_EXECUTION_NOT_ADMITTED");
  }
  const response = await callPlatform<{ result?: unknown }>(env, "execute", {
    jobId: job.jobId, envelope, claim: { ...claim, jobId: job.jobId },
  });
  const result = response.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("CLOUDFLARE_JOB_RESULT_INVALID");
  const value = result as Record<string, unknown>;
  if (Object.keys(value).some(key => key !== "resultRef" && key !== "output") ||
      (value.resultRef !== undefined && (typeof value.resultRef !== "string" || value.resultRef.length > 2000)) ||
      (value.output !== undefined && (!value.output || typeof value.output !== "object" || Array.isArray(value.output))) ||
      new TextEncoder().encode(JSON.stringify(value)).byteLength > 24 * 1024) throw new Error("CLOUDFLARE_JOB_RESULT_INVALID");
  return value as CanonicalJobResult;
};

/**
 * Cloudflare Queue execution uses the platform's canonical job service for
 * dispatch validation, lease fencing and settlement. The separately admitted
 * hybrid executor retains domain writes on Node; this proxy owns no job tables.
 */
export function createCanonicalControlPlaneProxyRepository(env: CloudflareEnvironment): CanonicalControlPlaneRepository {
  return {
    async loadJob({ jobId }, envelope) {
      // The canonical platform verifies the persisted dispatch identity before
      // exposing job input to the Cloudflare executor.
      const response = await callPlatform<ContextResponse>(env, "context", { jobId, envelope });
      if (response.disposition === "ack") return {
        jobId, tenantId: "", contractVersion: envelope.contract_version,
        businessAttempt: envelope.business_attempt, status: "cancelled", operatorReviewRequired: false,
        jobType: "superseded_dispatch", executionClass: "short", input: {},
      };
      return response.job;
    },
    async recordDispatch({ jobId, businessAttempt, dispatchId, dedupeKey }) {
      // Kept as a no-op here because dispatch recording is a persisted write
      // already performed by Feature 186 on publication. Claim validates these
      // same identifiers and marks the exact dispatch consumed atomically.
      void jobId; void businessAttempt; void dispatchId; void dedupeKey;
      return "recorded";
    },
    async claim({ job, envelope }) {
      const response = await callPlatform<ClaimResponse>(env, "claim", { jobId: job.jobId, envelope });
      if (response.state === "claimed" && response.claim) return response.claim;
      if (response.state === "terminal") return "already_terminal";
      if (response.state === "quarantine") return "quarantine";
      return "retry";
    },
    async complete({ job, envelope, claim, result }) {
      const response = await callPlatform<SettlementResponse>(env, "complete", {
        jobId: job.jobId, envelope, claim: { ...claim, jobId: job.jobId }, result,
      });
      return response.state;
    },
    async retry({ job, envelope, claim, reason }) {
      const response = await callPlatform<SettlementResponse>(env, "fail", {
        jobId: job.jobId, envelope, claim: { ...claim, jobId: job.jobId }, reason,
      });
      return response.state === "quarantine" ? "quarantined" : "retry";
    },
  };
}
