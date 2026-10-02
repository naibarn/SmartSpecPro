import type {
  CanonicalClaim,
  CanonicalControlPlaneJob,
  CanonicalControlPlaneRepository,
  CanonicalJobEnvelope,
  CloudflareEnvironment,
} from "./contracts";

const PUBLIC_APPLICATION_HOSTS = new Set(["smartaihub.app", "smartspec.pro"]);

function resolvePrivatePlatformOrigin(env: CloudflareEnvironment): URL {
  const configuredOrigin = env.PLATFORM_EDGE_ORIGIN?.trim();
  const expectedHost = env.PLATFORM_EDGE_PRIVATE_HOST?.trim().toLowerCase();
  if (!configuredOrigin || !expectedHost) throw new Error("CLOUDFLARE_CONTROL_PLANE_NOT_CONFIGURED");
  let origin: URL;
  try { origin = new URL(configuredOrigin); }
  catch { throw new Error("CLOUDFLARE_CONTROL_PLANE_NOT_CONFIGURED"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
      origin.hostname.toLowerCase() !== expectedHost || PUBLIC_APPLICATION_HOSTS.has(expectedHost) ||
      expectedHost.endsWith(".smartaihub.app") || expectedHost.endsWith(".smartspec.pro")) {
    throw new Error("CLOUDFLARE_CONTROL_PLANE_ORIGIN_INVALID");
  }
  return origin;
}

async function callPlatform<T>(
  env: CloudflareEnvironment,
  action: "context" | "claim" | "complete" | "fail",
  body: Record<string, unknown>,
): Promise<T> {
  const token = env.CLOUDFLARE_CONTROL_PLANE_TOKEN?.trim();
  if (!token) throw new Error("CLOUDFLARE_CONTROL_PLANE_NOT_CONFIGURED");
  const origin = resolvePrivatePlatformOrigin(env);
  const bodyJson = JSON.stringify(body);
  if (new TextEncoder().encode(bodyJson).byteLength > 32 * 1024) throw new Error("CLOUDFLARE_CONTROL_PLANE_REQUEST_TOO_LARGE");
  let response: Response;
  try {
    response = await fetch(new URL(`/api/internal/cloudflare-job-control/${action}`, origin), {
      method: "POST",
      headers: { "content-type": "application/json", "cache-control": "no-store", "x-cloudflare-control-plane-token": token },
      body: bodyJson,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
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

type ContextResponse = { job: CanonicalControlPlaneJob | null; disposition?: "ack" };
type ClaimResponse = { state: "claimed" | "terminal" | "retry" | "quarantine"; claim?: CanonicalClaim };
type SettlementResponse = { state: "completed" | "duplicate" | "retry" | "quarantine" };

/**
 * Cloudflare Queue execution uses the platform's canonical job service for
 * dispatch validation, lease fencing and settlement. Business execution
 * stays in the Cloudflare Worker; this proxy never reads or mutates job tables.
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
    async complete({ job, envelope, claim }) {
      const response = await callPlatform<SettlementResponse>(env, "complete", {
        jobId: job.jobId, envelope, claim: { ...claim, jobId: job.jobId },
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
