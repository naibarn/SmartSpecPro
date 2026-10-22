const WORKER_NAME = "smartspec-cloudflare-staging";
const REQUIRED_BINDINGS = [
  "HYPERDRIVE",
  "JOB_QUEUE",
  "JOB_WORKFLOW",
  "JOB_CONTAINERS",
  "WORKER_APP",
  "MEDIA_BUCKET",
  "VECTOR_INDEX",
] as const;

export type CloudflareStagingRuntimeReadiness = {
  status: "READY" | "ACTIVATION_DISABLED" | "NOT_READY" | "NOT_DEPLOYED" | "UNAVAILABLE";
  checkedAt: string;
  activation?: string;
  transport?: string;
  missing: string[];
  jobHandlerConfigured?: boolean;
  controlPlaneConfigured?: boolean;
  httpStatus?: number;
  deploymentId?: string;
  reason?: string;
};

function validStagingWorkerUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const prefix = `${WORKER_NAME}.`;
    const suffix = url.hostname.slice(prefix.length);
    if (
      url.protocol !== "https:" ||
      !url.hostname.startsWith(prefix) ||
      !/^[a-z0-9-]+\.workers\.dev$/.test(suffix) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

/** Read-only probe of the exact staging Worker's public readiness endpoint. */
export async function probeCloudflareStagingRuntimeReadiness(input: {
  url?: string;
  deploymentId?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<CloudflareStagingRuntimeReadiness> {
  const checkedAt = (input.now?.() ?? new Date()).toISOString();
  if (!input.url || !input.deploymentId) {
    return {
      status: "NOT_DEPLOYED",
      checkedAt,
      missing: [],
      reason: "STAGING_DEPLOYMENT_NOT_FOUND",
    };
  }
  const baseUrl = validStagingWorkerUrl(input.url);
  if (!baseUrl) {
    return {
      status: "UNAVAILABLE",
      checkedAt,
      missing: [],
      reason: "STAGING_WORKER_URL_INVALID",
    };
  }
  try {
    const response = await (input.fetchImpl ?? fetch)(
      new URL("/readyz", baseUrl),
      {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(7_000),
      }
    );
    if (!response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      return {
        status: "UNAVAILABLE",
        checkedAt,
        missing: [],
        httpStatus: response.status,
        deploymentId: input.deploymentId,
        reason: "STAGING_READINESS_RESPONSE_INVALID",
      };
    }
    const body = (await response.json()) as {
      ok?: unknown;
      readiness?: Record<string, unknown>;
    };
    const rawMissing = Array.isArray(body.readiness?.selectedMissing)
      ? body.readiness.selectedMissing
      : Array.isArray(body.readiness?.missing)
        ? body.readiness.missing
        : [];
    const missing = [
      ...new Set(
        rawMissing.filter(
          (value): value is string =>
            typeof value === "string" &&
            (REQUIRED_BINDINGS as readonly string[]).includes(value)
        )
      ),
    ];
    const ready =
      response.status === 200 &&
      body.ok === true &&
      body.readiness?.ready === true;
    const activation =
      typeof body.readiness?.activation === "string"
        ? body.readiness.activation
        : "unknown";
    const activationDisabled = !ready && activation === "disabled";
    return {
      // Staging deployments intentionally ship inactive until a separately
      // authorized activation. Keep that state distinct from failed probes or
      // enabled runtimes with missing required bindings; it is still not READY.
      status: ready ? "READY" : activationDisabled ? "ACTIVATION_DISABLED" : "NOT_READY",
      checkedAt,
      activation,
      transport:
        typeof body.readiness?.transport === "string"
          ? body.readiness.transport
          : "unknown",
      missing,
      jobHandlerConfigured:
        typeof body.readiness?.jobHandlerConfigured === "boolean"
          ? body.readiness.jobHandlerConfigured
          : undefined,
      controlPlaneConfigured:
        typeof body.readiness?.controlPlaneConfigured === "boolean"
          ? body.readiness.controlPlaneConfigured
          : undefined,
      httpStatus: response.status,
      deploymentId: input.deploymentId,
      ...(!ready ? { reason: activationDisabled ? "CLOUDFLARE_WORKER_ACTIVATION_DISABLED" : "CLOUDFLARE_WORKER_RUNTIME_NOT_READY" } : {}),
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      checkedAt,
      missing: [],
      deploymentId: input.deploymentId,
      reason: "STAGING_READINESS_PROBE_UNAVAILABLE",
    };
  }
}
